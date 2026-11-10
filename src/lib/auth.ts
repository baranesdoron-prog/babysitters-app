// Everyone signs in with a username + password (no email). Supabase Auth still
// needs an email, so a username lives at a made-up address that is never mailed.
export const LOGIN_DOMAIN = 'users.babysitters.invalid'
// Child logins created before usernames were shared by everyone.
const LEGACY_CHILD_DOMAIN = 'kids.babysitters.invalid'

export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/
export const MIN_PASSWORD_LENGTH = 6

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase()
}

/** The addresses to try for what was typed: a full email as is, else the username's. */
export function loginEmails(typed: string) {
  const value = normalizeUsername(typed)
  if (value.includes('@')) return [value]
  return [`${value}@${LOGIN_DOMAIN}`, `${value}@${LEGACY_CHILD_DOMAIN}`]
}

/** The username behind an app_users email, or null when it is a real email address. */
export function usernameOf(email: string | null | undefined) {
  if (!email) return null
  const [name, domain] = email.split('@')
  return domain === LOGIN_DOMAIN || domain === LEGACY_CHILD_DOMAIN ? name : null
}
