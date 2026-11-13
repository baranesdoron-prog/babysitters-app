// Creates or updates the username + password login of a babysitter, one of
// the girls, or another parent. Only a parent may call it. Logins have no real email: the
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

  // The whole security boundary: only a parent gets past here.
  const { data: caller } = await adminClient
    .from('app_users')
    .select('role')
    .eq('id', callerData.user.id)
    .single()
  if (caller?.role !== 'parent') return jsonResponse({ error: 'Only parents can manage logins' }, 403)

  let body: {
    kind?: string
    id?: string
    username?: string
    password?: string
    parent?: { first_name?: string; last_name?: string; workplace?: string; phone?: string }
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
      return jsonResponse({ error: linkError.message }, 500)
    }
    return jsonResponse({ userId: created.user.id, username }, 200)
  }

  // Another parent: `id` is their app_users id (reset), or absent (add a new parent).
  // Either way they must choose their own password at the next sign-in.
  if (body.kind === 'parent') {
    if (id) {
      const { data: target } = await adminClient.from('app_users').select('id, role').eq('id', id).maybeSingle()
      if (target?.role !== 'parent') return jsonResponse({ error: 'Not found' }, 404)
      return updateLogin(id, { must_change_password: true })
    }
    const first = body.parent?.first_name?.trim()
    const last = body.parent?.last_name?.trim()
    if (!first || !last) return jsonResponse({ error: 'Missing or invalid fields' }, 400)
    return createLogin(`${first} ${last}`, {
      role: 'parent',
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`,
      workplace: body.parent?.workplace?.trim() || null,
      phone: body.parent?.phone?.trim() || null,
      must_change_password: true,
    })
  }

  const target = body.kind === 'child' || body.kind === 'babysitter' ? TARGETS[body.kind] : null
  if (!target || !id) return jsonResponse({ error: 'Missing or invalid fields' }, 400)

  const { data: row } = await adminClient.from(target.table).select(`id, ${target.nameColumn}`).eq('id', id).single()
  if (!row) return jsonResponse({ error: 'Not found' }, 404)
  const fullName = (row as Record<string, string>)[target.nameColumn]

  const { data: existing } = await adminClient
    .from('app_users')
    .select('id')
    .eq(target.linkColumn, id)
    .maybeSingle()

  // Already has a login (username/password, or an older email one).
  if (existing) return updateLogin(existing.id)
  return createLogin(fullName, { role: body.kind, [target.linkColumn]: id })
})
