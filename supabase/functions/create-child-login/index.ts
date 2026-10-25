// Creates a login for one of the girls. Only a parent may call it.
// Children don't need an email: they sign in with a username + password,
// stored as <username>@kids.babysitters.invalid (never mailed to).
// Same pattern as barburg's admin-create-user.
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

export const CHILD_EMAIL_DOMAIN = 'kids.babysitters.invalid'
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/

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
  if (caller?.role !== 'parent') return jsonResponse({ error: 'Only parents can create child logins' }, 403)

  let body: { child_id?: string; username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }

  const username = body.username?.trim().toLowerCase()
  const { child_id, password } = body
  if (!child_id || !username || !USERNAME_RE.test(username) || !password || password.length < 6) {
    return jsonResponse({ error: 'Missing or invalid fields' }, 400)
  }

  const { data: child } = await adminClient.from('children').select('id, name').eq('id', child_id).single()
  if (!child) return jsonResponse({ error: 'Child not found' }, 404)

  const { data: existing } = await adminClient.from('app_users').select('id').eq('child_id', child_id).maybeSingle()
  if (existing) return jsonResponse({ error: 'This child already has a login' }, 409)

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: `${username}@${CHILD_EMAIL_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { full_name: child.name },
  })
  if (createError || !created?.user) {
    return jsonResponse({ error: createError?.message ?? 'Failed to create login' }, 400)
  }

  // The signup trigger already made the app_users row; give it the child role.
  const { error: updateError } = await adminClient
    .from('app_users')
    .update({ role: 'child', child_id })
    .eq('id', created.user.id)
  if (updateError) {
    await adminClient.auth.admin.deleteUser(created.user.id)
    return jsonResponse({ error: updateError.message }, 500)
  }

  return jsonResponse({ userId: created.user.id, username }, 200)
})
