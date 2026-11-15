import { normalizePhone } from './contacts'
import { ageLabel } from './labels'
import type { Gender } from './types'
import { addDays, ageOf, formatDayHeader, formatTime, localParts, todayKey } from './utils'

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

/** "א", "א וב", "א, ב וג" */
function joinHebrew(items: string[]) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`
}

type Kid = { name: string; gender: Gender | null }

/** "מיכל ותמר" / "הבנות" — names for up to three kids, otherwise the group word. */
function kidsName(kids: Kid[]) {
  if (kids.length === 0) return null
  if (kids.length <= 3) return joinHebrew(kids.map((k) => k.name))
  return kids.every((k) => k.gender === 'girl') ? 'הבנות' : kids.every((k) => k.gender === 'boy') ? 'הבנים' : 'הילדים'
}

/** "מחכה" for one kid, "מחכות" when they're all girls, otherwise "מחכים". */
function waitVerb(kids: Kid[]) {
  if (kids.length === 1) return 'מחכה'
  return kids.every((k) => k.gender === 'girl') ? 'מחכות' : 'מחכים'
}

/** "היום, מ-20:00 עד 00:00" / "מחר, יום ב׳, 16 בנובמבר, מ-…" / "ביום ב׳, 16 בנובמבר, מ-…" */
function whenFromToday(s: ShiftForMessage) {
  const date = localParts(s.start_at).date
  const hours = `מ-${formatTime(s.start_at)} עד ${formatTime(s.end_at)}`
  if (date === todayKey()) return `היום, ${hours}`
  if (date === addDays(todayKey(), 1)) return `מחר, ${when(s)}`
  return `ב${when(s)}`
}

/** Reminder for a confirmed shift — warm, like a message from a parent. */
export function shiftReminderText(sitterName: string, s: ShiftForMessage, from: string, kids: Kid[] = []) {
  const names = kidsName(kids)
  return [
    `היי ${firstName(sitterName)}, מה שלומך?`,
    `זוכרת שאת מגיעה אלינו ${whenFromToday(s)}?`,
    // Only when she picks up: if we do, it's not her concern.
    s.pickup_by === 'babysitter'
      ? `את אוספת${names ? ` את ${names}` : ''} מהגן, וכל הפרטים נמצאים באפליקציה.`
      : null,
    s.notes ? `עוד משהו קטן: ${s.notes}` : null,
    names ? `${names} כבר ${waitVerb(kids)} לך!` : null,
    `תודה רבה, ${firstName(from)}`,
  ].filter(Boolean).join('\n')
}

/** A request waiting for her answer — asking, not announcing. */
export function shiftRequestText(sitterName: string, s: ShiftForMessage, from: string, appUrl: string) {
  return [
    `היי ${firstName(sitterName)}, מה שלומך?`,
    `רצינו לשאול אם את פנויה לבוא אלינו ב${when(s)}.`,
    `נשמח מאוד אם תוכלי! אפשר לאשר, או לכתוב שלא מתאים, באפליקציה: ${appUrl}`,
    `תודה, ${firstName(from)}`,
  ].join('\n')
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
