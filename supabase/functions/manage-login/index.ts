// Creates or updates the username + password login of a babysitter or one of
// the girls. Only a parent may call it. Logins have no real email: the
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

  let body: { kind?: string; id?: string; username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  const target = body.kind === 'child' || body.kind === 'babysitter' ? TARGETS[body.kind] : null
  const username = body.username?.trim().toLowerCase()
  const { id, password } = body
  if (!target || !id || !password || password.length < 6 || (username && !USERNAME_RE.test(username))) {
    return jsonResponse({ error: 'Missing or invalid fields' }, 400)
  }

  const { data: row } = await adminClient.from(target.table).select(`id, ${target.nameColumn}`).eq('id', id).single()
  if (!row) return jsonResponse({ error: 'Not found' }, 404)
  const fullName = (row as Record<string, string>)[target.nameColumn]

  const { data: existing } = await adminClient
    .from('app_users')
    .select('id')
    .eq(target.linkColumn, id)
    .maybeSingle()

  // Already has a login (username/password, or an older email one): set the
  // new password, and the username if one was given.
  if (existing) {
    const { error: updateError } = await adminClient.auth.admin.updateUserById(existing.id, {
      password,
      ...(username && { email: `${username}@${LOGIN_DOMAIN}`, email_confirm: true }),
    })
    if (updateError) return jsonResponse({ error: updateError.message, code: updateError.code }, updateError.status ?? 400)
    if (username) {
      await adminClient.from('app_users').update({ email: `${username}@${LOGIN_DOMAIN}` }).eq('id', existing.id)
    }
    return jsonResponse({ userId: existing.id, username }, 200)
  }

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

  // The signup trigger already made the app_users row; give it the role and link.
  const { error: linkError } = await adminClient
    .from('app_users')
    .update({ role: body.kind, [target.linkColumn]: id })
    .eq('id', created.user.id)
  if (linkError) {
    await adminClient.auth.admin.deleteUser(created.user.id)
    return jsonResponse({ error: linkError.message }, 500)
  }

  return jsonResponse({ userId: created.user.id, username }, 200)
})
