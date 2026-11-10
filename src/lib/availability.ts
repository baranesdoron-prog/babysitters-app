import type { Availability } from './types'
import { addDays, localParts, weekdayOf, zonedToIso } from './utils'

function window(date: string, start: string, end: string): [number, number] {
  const s = new Date(zonedToIso(date, start.slice(0, 5))).getTime()
  // An end at or before the start runs past midnight (e.g. 20:00–08:00).
  const endDate = end.slice(0, 5) <= start.slice(0, 5) ? addDays(date, 1) : date
  return [s, new Date(zonedToIso(endDate, end.slice(0, 5))).getTime()]
}

/**
 * Is a babysitter free for the whole shift?
 * A date-specific "available" or a weekly slot must cover it, and no
 * "unavailable" exception on the shift's dates may overlap it.
 */
export function isAvailable(rows: Availability[], startIso: string, endIso: string) {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const date = localParts(startIso).date
  const endDate = localParts(endIso).date

  const blocked = rows.some((r) => {
    if (r.kind !== 'unavailable_on' || !r.on_date) return false
    if (r.on_date < addDays(date, -1) || r.on_date > endDate) return false
    const [s, e] = window(r.on_date, r.start_time, r.end_time)
    return s < end && e > start
  })
  if (blocked) return false

  return rows.some((r) => {
    const covers = (d: string) => {
      const [s, e] = window(d, r.start_time, r.end_time)
      return s <= start && e >= end
    }
    if (r.kind === 'available_on') return r.on_date === date && covers(date)
    if (r.kind === 'weekly') return r.weekday === weekdayOf(date) && covers(date)
    return false
  })
}
