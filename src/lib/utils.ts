import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// All dates and times are shown in Israel time, whatever the phone's zone is.
export const TIME_ZONE = 'Asia/Jerusalem'

const dateTimeFormatter = new Intl.DateTimeFormat('he-IL', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
})

export function formatDateTime(isoString: string) {
  return dateTimeFormatter.format(new Date(isoString))
}

const dateFormatter = new Intl.DateTimeFormat('he-IL', {
  dateStyle: 'short',
  timeZone: TIME_ZONE,
})

export function formatDate(isoString: string) {
  return dateFormatter.format(new Date(isoString))
}

const timeFormatter = new Intl.DateTimeFormat('he-IL', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: TIME_ZONE,
})

/** 24h "15:30" in Israel time. */
export function formatTime(isoString: string) {
  return timeFormatter.format(new Date(isoString))
}

/** "15:30" from a Postgres time value ("15:30:00"). */
export function trimTime(time: string | null | undefined) {
  return time ? time.slice(0, 5) : ''
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: TIME_ZONE,
})

/** The Israel-time calendar date ("2026-10-27"), clock time ("15:30") and weekday (0 = Sunday) of an instant. */
export function localParts(isoOrDate: string | Date) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(isoOrDate)).map((p) => [p.type, p.value]),
  )
  const date = `${parts.year}-${parts.month}-${parts.day}`
  return { date, time: `${parts.hour}:${parts.minute}`, weekday: weekdayOf(date) }
}

/** Today's date in Israel ("2026-10-27"). */
export function todayKey() {
  return localParts(new Date()).date
}

/** Weekday (0 = Sunday) of a calendar date "YYYY-MM-DD". */
export function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** The instant (ISO, UTC) of an Israel-time date + clock time. Handles DST. */
export function zonedToIso(date: string, time: string) {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const asUtc = Date.UTC(y, mo - 1, d, h, mi)
  // Find Israel's offset at that moment, then correct once more across a DST edge.
  let guess = asUtc
  for (let i = 0; i < 2; i++) {
    const p = localParts(new Date(guess))
    const [py, pmo, pd] = p.date.split('-').map(Number)
    const [ph, pmi] = p.time.split(':').map(Number)
    const shown = Date.UTC(py, pmo - 1, pd, ph, pmi)
    guess += asUtc - shown
  }
  return new Date(guess).toISOString()
}

const dayHeaderFormatter = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** "יום ג׳, 27 באוקטובר" for a calendar date "YYYY-MM-DD". */
export function formatDayHeader(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][weekdayOf(date)]
  return `יום ${weekday}, ${dayHeaderFormatter.format(new Date(Date.UTC(y, m - 1, d)))}`
}

/** "27/10" for a calendar date "YYYY-MM-DD". */
export function formatShortDate(date: string) {
  const [, m, d] = date.split('-').map(Number)
  return `${d}/${m}`
}

const monthFormatter = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** "אוקטובר 2026" for a calendar date "YYYY-MM-DD". */
export function formatMonth(date: string) {
  const [y, m] = date.split('-').map(Number)
  return monthFormatter.format(new Date(Date.UTC(y, m - 1, 1)))
}

/** "₪435", "₪1,250", "₪42.50". */
export function formatMoney(amount: number | null | undefined) {
  if (amount == null) return '—'
  const n = Number(amount)
  const text = n.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `₪${text}`
}

/** "3 ש׳" / "2.5 ש׳" for a number of hours. */
export function formatHours(hours: number) {
  const rounded = Math.round(hours * 4) / 4
  return `${rounded.toLocaleString('en-US', { maximumFractionDigits: 2 })} ש׳`
}

/** Whole years old today, from a birth date "YYYY-MM-DD". */
export function ageOf(birthDate: string | null) {
  if (!birthDate) return null
  const today = todayKey()
  let age = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4))
  if (today.slice(5) < birthDate.slice(5)) age -= 1
  return age
}
