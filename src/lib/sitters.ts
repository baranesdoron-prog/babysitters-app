import { supabase } from './supabase'
import type { Babysitter, MySitter, SitterTerms } from './types'

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
