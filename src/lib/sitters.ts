import { supabase } from './supabase'
import type { Babysitter, MySitter, SitterTerms } from './types'

/** Can my family put her on a shift? Its own babysitters, or ones it has met. */
export function canBook(sitter: Pick<MySitter, 'owned' | 'met_at'>) {
  return sitter.owned || sitter.met_at !== null
}

/**
 * My family's babysitters: each one's shared profile with my family's own
 * terms (rates, notes, active). RLS returns only my family's terms rows.
 */
export async function fetchMySitters({ activeOnly = false } = {}): Promise<MySitter[]> {
  let query = supabase.from('family_babysitters').select('*, babysitter:babysitters(*)')
  if (activeOnly) query = query.eq('active', true)
  const res = await query
  if (res.error) throw new Error('לא הצלחנו לטעון את הבייביסיטריות.')
  return (res.data as (SitterTerms & { babysitter: Babysitter | null })[])
    .filter((row) => row.babysitter)
    .map(({ babysitter, family_id, babysitter_id: _id, ...terms }) => ({
      ...babysitter!,
      ...terms,
      owned: babysitter!.family_id === family_id,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.full_name.localeCompare(b.full_name, 'he'))
}

/** Her age this year from her year of birth ("בת 19"), or null. */
export function sitterAgeLabel(birthYear: number | null | undefined) {
  if (!birthYear) return null
  return `בת ${new Date().getFullYear() - birthYear}`
}

/** A year of birth that gives an age of 14–80 this year. */
export function isValidBirthYear(text: string) {
  if (!/^\d{4}$/.test(text)) return false
  const age = new Date().getFullYear() - Number(text)
  return age >= 14 && age <= 80
}
