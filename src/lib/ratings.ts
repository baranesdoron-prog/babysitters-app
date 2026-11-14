import { supabase } from './supabase'

export interface RatingSummary {
  average: number
  count: number
}

export interface ShiftRating {
  id: string
  shift_id: string
  family_id: string
  babysitter_id: string
  rater: 'family' | 'babysitter'
  stars: number
  comment: string | null
  created_at: string
}

type SummaryRow = { average: number; count: number }

/** Babysitters' averages from families, by babysitter id (only those the caller may see). */
export async function fetchBabysitterRatings(ids: string[]) {
  if (ids.length === 0) return new Map<string, RatingSummary>()
  const { data } = await supabase.rpc('babysitter_ratings', { p_ids: ids })
  return new Map(((data ?? []) as (SummaryRow & { babysitter_id: string })[]).map((r) => [r.babysitter_id, { average: Number(r.average), count: r.count }]))
}

/** Families' averages from babysitters, by family id (only those the caller may see). */
export async function fetchFamilyRatings(ids: string[]) {
  if (ids.length === 0) return new Map<string, RatingSummary>()
  const { data } = await supabase.rpc('family_ratings', { p_ids: ids })
  return new Map(((data ?? []) as (SummaryRow & { family_id: string })[]).map((r) => [r.family_id, { average: Number(r.average), count: r.count }]))
}

/** Rate a shift as whichever side I am (the database decides and checks it has ended). */
export async function rateShift(shiftId: string, stars: number, comment: string) {
  const { error } = await supabase.rpc('rate_shift', { p_shift: shiftId, p_stars: stars, p_comment: comment.trim() || null })
  return error
}
