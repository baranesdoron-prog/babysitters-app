// Creates or updates the username + password login of a babysitter, a child,
// or a parent. A parent manages logins in their own family only; the system
// admin (app_users.is_admin) also creates families with their first parent
// and adds parents to any family. No approval step either way. Logins have no real email: the
// username is stored as <username>@users.babysitters.invalid (never mailed to).
// Replaces create-child-login. Same pattern as barburg's admin-create-user.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const LOGIN_DOMAIN = 'users.babysitters.invalid'
// A family has at most two parents (also enforced by a trigger, migration 0010).
const MAX_PARENTS = 2
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/

const TARGETS = {
  child: { table: 'children', nameColumn: 'name', linkColumn: 'child_id' },
  babysitter: { table: 'babysitters', nameColumn: 'full_name', linkColumn: 'babysitter_id' },
} as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Missing authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Who is calling? (their own token, no elevated privilege yet)
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: callerData, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !callerData?.user) return jsonResponse({ error: 'Invalid session' }, 401)

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // The whole security boundary: only a parent (or the system admin) gets past
  // here, and everything below stays inside the caller's family unless they're the admin.
  const { data: caller } = await adminClient
    .from('app_users')
    .select('role, family_id, is_admin')
    .eq('id', callerData.user.id)
    .single()
  const isAdmin = caller?.is_admin === true
  if (caller?.role !== 'parent' && !isAdmin) return jsonResponse({ error: 'Only parents can manage logins' }, 403)
  const sameFamily = (familyId: string | null) => isAdmin || (!!familyId && familyId === caller?.family_id)

  let body: {
    kind?: string
    id?: string
    username?: string
    password?: string
    parent?: { first_name?: string; last_name?: string; workplace?: string; phone?: string }
    /** Admin only: add the parent to this family. */
    family_id?: string
    /** Admin only: create a new family with this name, and the parent as its first. */
    new_family_name?: string
  }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  const username = body.username?.trim().toLowerCase()
  const { id, password } = body
  if (!password || password.length < 6 || (username && !USERNAME_RE.test(username))) {
    return jsonResponse({ error: 'Missing or invalid fields' }, 400)
  }

  // Set a new password (and username, if given) on an existing login.
  async function updateLogin(userId: string, extra: Record<string, unknown> = {}) {
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password,
      ...(username && { email: `${username}@${LOGIN_DOMAIN}`, email_confirm: true }),
    })
    if (updateError) return jsonResponse({ error: updateError.message, code: updateError.code }, updateError.status ?? 400)
    await adminClient
      .from('app_users')
      .update({ ...(username && { email: `${username}@${LOGIN_DOMAIN}` }), ...extra })
      .eq('id', userId)
    return jsonResponse({ userId, username }, 200)
  }

  // Create a login and give its app_users row (made by the signup trigger) these fields.
  async function createLogin(fullName: string, fields: Record<string, unknown>) {
    if (!username) return jsonResponse({ error: 'Missing or invalid fields' }, 400)
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: `${username}@${LOGIN_DOMAIN}`,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    })
    if (createError || !created?.user) {
      return jsonResponse({ error: createError?.message ?? 'Failed to create login', code: createError?.code }, createError?.status ?? 400)
    }
    const { error: linkError } = await adminClient.from('app_users').update(fields).eq('id', created.user.id)
    if (linkError) {
      await adminClient.auth.admin.deleteUser(created.user.id)
      if (linkError.message.includes('family_full')) return jsonResponse({ error: 'Family already has two parents', code: 'family_full' }, 409)
      return jsonResponse({ error: linkError.message }, 500)
    }
    return jsonResponse({ userId: created.user.id, username }, 200)
  }

  // A parent: `id` is their app_users id (reset), or absent (add a new parent).
  // Either way they must choose their own password at the next sign-in.
  if (body.kind === 'parent') {
    if (id) {
      const { data: target } = await adminClient.from('app_users').select('id, role, family_id').eq('id', id).maybeSingle()
      if (target?.role !== 'parent' || !sameFamily(target.family_id)) return jsonResponse({ error: 'Not found' }, 404)
      return updateLogin(id, { must_change_password: true })
    }
    const first = body.parent?.first_name?.trim()
    const last = body.parent?.last_name?.trim()
    const newFamilyName = body.new_family_name?.trim()
    if (!first || !last) return jsonResponse({ error: 'Missing or invalid fields' }, 400)
    if ((newFamilyName || body.family_id) && !isAdmin) return jsonResponse({ error: 'Only the admin can add other families' }, 403)

    // Which family: a new one (admin), one the admin picked, or the caller's own.
    let familyId = body.family_id ?? caller?.family_id ?? null
    let createdFamily: string | null = null
    if (newFamilyName) {
      const { data: family, error: familyError } = await adminClient
        .from('families')
        .insert({ name: newFamilyName })
        .select('id')
        .single()
      if (familyError || !family) return jsonResponse({ error: familyError?.message ?? 'Failed to create family' }, 400)
      await adminClient.from('settings').insert({ family_id: family.id })
      familyId = createdFamily = family.id
    } else if (familyId) {
      const { data: family } = await adminClient.from('families').select('id').eq('id', familyId).maybeSingle()
      if (!family) return jsonResponse({ error: 'Family not found' }, 404)
    }
    if (!familyId) return jsonResponse({ error: 'No family' }, 400)

    if (!createdFamily) {
      const { count } = await adminClient
        .from('app_users')
        .select('id', { count: 'exact', head: true })
        .eq('family_id', familyId)
        .eq('role', 'parent')
      if ((count ?? 0) >= MAX_PARENTS) {
        return jsonResponse({ error: 'Family already has two parents', code: 'family_full' }, 409)
      }
    }

    const response = await createLogin(`${first} ${last}`, {
      role: 'parent',
      family_id: familyId,
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`,
      workplace: body.parent?.workplace?.trim() || null,
      phone: body.parent?.phone?.trim() || null,
      must_change_password: true,
    })
    // Don't leave an empty family behind if the login couldn't be created.
    if (!response.ok && createdFamily) await adminClient.from('families').delete().eq('id', createdFamily)
    return response
  }

  const target = body.kind === 'child' || body.kind === 'babysitter' ? TARGETS[body.kind] : null
  if (!target || !id) return jsonResponse({ error: 'Missing or invalid fields' }, 400)

  const { data: row } = await adminClient.from(target.table).select(`id, family_id, ${target.nameColumn}`).eq('id', id).single()
  // A babysitter or a child of another family is "not found" for this caller.
  if (!row || !sameFamily((row as { family_id: string }).family_id)) return jsonResponse({ error: 'Not found' }, 404)
  const fullName = (row as Record<string, string>)[target.nameColumn]

  const { data: existing } = await adminClient
    .from('app_users')
    .select('id')
    .eq(target.linkColumn, id)
    .maybeSingle()

  // Already has a login (username/password, or an older email one).
  if (existing) return updateLogin(existing.id)
  return createLogin(fullName, {
    role: body.kind,
    [target.linkColumn]: id,
    family_id: (row as { family_id: string }).family_id,
  })
})
