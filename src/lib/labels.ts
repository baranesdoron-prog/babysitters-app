import type {
  ContactKind,
  FrameworkType,
  Gender,
  ItemKind,
  PaymentMethod,
  PickupBy,
  RateType,
  RequestStatus,
  ShiftStatus,
} from './types'
import { formatMoney } from './utils'

export const shiftStatusLabels: Record<ShiftStatus, string> = {
  draft: 'טיוטה',
  requested: 'ממתינה לתשובה',
  confirmed: 'מאושרת',
  done: 'הושלמה',
  cancelled: 'בוטלה',
}

/** Status pill colors — always paired with the label above. */
export const shiftStatusTone: Record<ShiftStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  requested: 'bg-pending-soft text-pending-foreground',
  confirmed: 'bg-success-soft text-success-foreground',
  done: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
}

export const requestStatusLabels: Record<RequestStatus, string> = {
  queued: 'בתור',
  sent: 'ממתינה לתשובה',
  accepted: 'אישרה',
  declined: 'לא יכולה',
  skipped: 'דילגנו',
}

export const rateTypeLabels: Record<RateType, string> = {
  hourly: 'לשעה',
  per_shift: 'למשמרת',
}

export const pickupLabels: Record<PickupBy, string> = {
  parent: 'הורה',
  babysitter: 'בייביסיטר',
}

export const itemKindLabels: Record<ItemKind, string> = {
  prepare: 'להכין',
  leave: 'להשאיר',
  homework: 'שיעורי בית',
  morning: 'בבוקר',
  other: 'אחר',
}

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  bit: 'ביט',
  paybox: 'פייבוקס',
  cash: 'מזומן',
  transfer: 'העברה בנקאית',
  other: 'אחר',
}

export const frameworkLabels: Record<FrameworkType, string> = {
  kindergarten: 'גן',
  school: 'בית ספר',
}

export const genderLabels: Record<Gender, string> = {
  boy: 'בן',
  girl: 'בת',
}

/** "ילד" / "ילדה", or "ילד/ה" before the gender is set. */
export function childNoun(gender: Gender | null) {
  return gender === 'boy' ? 'ילד' : gender === 'girl' ? 'ילדה' : 'ילד/ה'
}

/** "ילד חדש" / "ילדה חדשה" / "ילד/ה חדש/ה" — the add-a-child title. */
export function newChildTitle(gender: Gender | null) {
  return gender === 'boy' ? 'ילד חדש' : gender === 'girl' ? 'ילדה חדשה' : 'ילד/ה חדש/ה'
}

/** "בן 5" / "בת 5" / "גיל 5". */
export function ageLabel(gender: Gender | null, age: number) {
  return gender ? `${genderLabels[gender]} ${age}` : `גיל ${age}`
}

export const contactKindLabels: Record<ContactKind, string> = {
  friend: 'חברה',
  friend_parent: 'הורה של חברה',
  emergency: 'חירום',
  activity: 'חוג',
  other: 'אחר',
}

/** Auto-added when a babysitter without a child seat picks up (see migration 0006). */
export const CAR_SEAT_ITEM = 'להשאיר כיסא לאוטו'

export const weekdayShort = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
export const weekdayLong = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

export function formatRate(type: RateType, amount: number | null) {
  if (amount == null) return '—'
  return `${formatMoney(amount)} ${rateTypeLabels[type]}`
}
