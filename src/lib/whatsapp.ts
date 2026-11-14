import { normalizePhone } from './contacts'
import { ageLabel } from './labels'
import type { Gender } from './types'
import { ageOf, formatDayHeader, formatTime, localParts } from './utils'

/** "052-1234567" → "972521234567" (wa.me wants the country code, no +, no leading 0). */
export function waNumber(phone: string | null | undefined) {
  if (!phone) return null
  const digits = normalizePhone(phone).replace(/\D/g, '')
  if (!/^0\d{8,9}$/.test(digits)) return null
  return `972${digits.slice(1)}`
}

/** A wa.me link that opens a chat with her, the message ready to send; null without a usable number. */
export function waLink(phone: string | null | undefined, text: string) {
  const number = waNumber(phone)
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null
}

const firstName = (name: string) => name.trim().split(/\s+/)[0]

type ShiftForMessage = { start_at: string; end_at: string; pickup_by: 'parent' | 'babysitter'; notes: string | null }

function when(s: ShiftForMessage) {
  // Words, not "16:00–20:00": in a Hebrew message the dash range shows reversed.
  return `${formatDayHeader(localParts(s.start_at).date)}, מ-${formatTime(s.start_at)} עד ${formatTime(s.end_at)}`
}

/** Reminder for a confirmed shift. */
export function shiftReminderText(sitterName: string, s: ShiftForMessage, from: string) {
  return [
    `היי ${firstName(sitterName)}, תזכורת למשמרת אצלנו:`,
    when(s),
    s.pickup_by === 'babysitter' ? 'את אוספת מהגן — הפרטים באפליקציה.' : 'אנחנו אוספים מהגן.',
    s.notes ? `הערה: ${s.notes}` : null,
    `תודה! ${firstName(from)}`,
  ].filter(Boolean).join('\n')
}

/** A request waiting for her answer. */
export function shiftRequestText(sitterName: string, s: ShiftForMessage, from: string, appUrl: string) {
  return [
    `היי ${firstName(sitterName)}, יש לנו בקשה למשמרת:`,
    when(s),
    `אפשר לאשר או לסרב באפליקציה: ${appUrl}`,
    `תודה! ${firstName(from)}`,
  ].join('\n')
}

/** "א", "א וב", "א, ב וג" */
function joinHebrew(items: string[]) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`
}

export type FamilyForIntro = {
  /** Parents' first names (me first). */
  parents: string[]
  kids: { name: string; birth_date: string | null; gender: Gender | null }[]
}

/** "אנחנו יוסי ולירון, והבנות שלנו: נועה (בת 6) ותמר (בת 3)." */
export function familyLine({ parents, kids }: FamilyForIntro) {
  const who = parents.length > 1 ? `אנחנו ${joinHebrew(parents)}` : null
  const kidList = joinHebrew(kids.map((k) => {
    const age = ageOf(k.birth_date)
    return age == null ? k.name : `${k.name} (${ageLabel(k.gender, age)})`
  }))
  const kidsWord = kids.every((k) => k.gender === 'girl') ? 'הבנות שלנו'
    : kids.every((k) => k.gender === 'boy') ? 'הבנים שלנו'
    : 'הילדים שלנו'
  if (!kids.length) return who ? `${who}.` : null
  return who ? `${who}, ו${kidsWord}: ${kidList}.` : `${kidsWord}: ${kidList}.`
}

/** First message to a babysitter from another family: who we are, and that we'd like to meet. */
export function introText(sitterName: string, me: string, addedBy: string | null, family: FamilyForIntro) {
  return [
    `היי ${firstName(sitterName)}, אני ${me}.`,
    addedBy
      ? `קיבלתי את המספר שלך מ${addedBy}, ואני פונה בנוגע לבייביסיטינג.`
      : 'אני פונה בנוגע לבייביסיטינג.',
    familyLine(family),
    'נשמח מאוד להכיר ולראות אם זה יכול להתאים לכולנו. מתי נוח לך להיפגש?',
  ].filter(Boolean).join('\n')
}
