import { normalizePhone } from './contacts'
import { formatDayHeader, formatTime, localParts } from './utils'

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

/** First message to a babysitter from the shared list. */
export function introText(sitterName: string, me: string, addedBy: string | null) {
  return [
    `היי ${firstName(sitterName)}, אני ${me}.`,
    addedBy ? `קיבלתי את המספר שלך מ${addedBy}.` : null,
    'נשמח להכיר ולקבוע פגישת היכרות. מתי נוח לך?',
  ].filter(Boolean).join('\n')
}
