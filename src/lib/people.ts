import type { AppUser } from './types'

/** A parent's name: first + last, or the older single full_name. */
export function displayName(u: Pick<AppUser, 'first_name' | 'last_name' | 'full_name'>) {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.full_name || 'הורה'
}

export type ParentDetails = { first_name: string; last_name: string; workplace: string; phone: string }

/** The app_users columns for a parent's details form. */
export function detailsRow(d: ParentDetails) {
  const first = d.first_name.trim()
  const last = d.last_name.trim()
  return {
    first_name: first,
    last_name: last,
    full_name: `${first} ${last}`.trim(),
    workplace: d.workplace.trim() || null,
    phone: d.phone.trim() || null,
  }
}
