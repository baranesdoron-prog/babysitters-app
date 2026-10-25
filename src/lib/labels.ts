import type { RateType, ShiftStatus } from './types'

export const shiftStatusLabels: Record<ShiftStatus, string> = {
  draft: 'טיוטה',
  requested: 'נשלחה בקשה',
  confirmed: 'מאושרת',
  done: 'הושלמה',
  cancelled: 'בוטלה',
}

export const rateTypeLabels: Record<RateType, string> = {
  hourly: 'לשעה',
  per_shift: 'למשמרת',
}

export function formatRate(type: RateType, amount: number | null) {
  if (amount == null) return '—'
  return `₪${amount} ${rateTypeLabels[type]}`
}
