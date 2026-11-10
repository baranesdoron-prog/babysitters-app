import type { Babysitter, RateType } from './types'
import { addDays, localParts, zonedToIso } from './utils'

// Night runs from settings.night_start until this hour the next morning.
export const NIGHT_END = '07:00'

export interface ShiftSplit {
  dayHours: number
  nightHours: number
}

const HOUR = 60 * 60 * 1000

function overlapHours(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart)) / HOUR
}

/** How many hours of a shift fall in the day part and in the night part. */
export function splitShift(startIso: string, endIso: string, nightStart: string): ShiftSplit {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const total = Math.max(0, (end - start) / HOUR)
  if (total === 0) return { dayHours: 0, nightHours: 0 }

  // Night windows that can touch the shift: the one that began the evening
  // before it started, through the one beginning the evening it ends.
  const firstDay = addDays(localParts(startIso).date, -1)
  const lastDay = localParts(endIso).date
  let nightHours = 0
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    const nStart = new Date(zonedToIso(day, nightStart.slice(0, 5))).getTime()
    const nEnd = new Date(zonedToIso(addDays(day, 1), NIGHT_END)).getTime()
    nightHours += overlapHours(start, end, nStart, nEnd)
  }
  return { dayHours: total - nightHours, nightHours }
}

/** Ends on another calendar day and has a night part — gets the morning tasks. */
export function isOvernight(startIso: string, endIso: string, split: ShiftSplit) {
  return split.nightHours > 0 && localParts(startIso).date !== localParts(endIso).date
}

function partAmount(type: RateType, rate: number | null, hours: number) {
  if (hours <= 0 || rate == null) return 0
  return type === 'hourly' ? hours * Number(rate) : Number(rate)
}

/**
 * Day part + night part, each at this babysitter's rate for it.
 * Merged: the whole shift is billed as one, at the night rate if it reaches
 * the night (otherwise the day rate).
 */
export function computeAmount(sitter: Babysitter, split: ShiftSplit, merged: boolean) {
  let amount: number
  if (merged) {
    const total = split.dayHours + split.nightHours
    amount = split.nightHours > 0
      ? partAmount(sitter.night_rate_type, sitter.night_rate, total)
      : partAmount(sitter.day_rate_type, sitter.day_rate, total)
  } else {
    amount = partAmount(sitter.day_rate_type, sitter.day_rate, split.dayHours)
      + partAmount(sitter.night_rate_type, sitter.night_rate, split.nightHours)
  }
  return Math.round(amount) // whole shekels
}

/** What a shift costs: the parent's override if set, else the computed amount. */
export function shiftAmount(shift: { actual_amount: number | null; computed_amount: number | null }) {
  return Number(shift.actual_amount ?? shift.computed_amount ?? 0)
}
