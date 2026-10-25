export type AppRole = 'parent' | 'babysitter'

export interface AppUser {
  id: string
  email: string | null
  full_name: string | null
  role: AppRole | null
  babysitter_id: string | null
}

export type RateType = 'hourly' | 'per_shift'

export interface Babysitter {
  id: string
  full_name: string
  phone: string | null
  active: boolean
  night_ok: boolean
  helps_homework: boolean
  can_pickup: boolean
  has_child_seat: boolean
  day_rate_type: RateType
  day_rate: number | null
  night_rate_type: RateType
  night_rate: number | null
  notes: string | null
}

export type ShiftStatus = 'draft' | 'requested' | 'confirmed' | 'done' | 'cancelled'

export interface Shift {
  id: string
  start_at: string
  end_at: string
  babysitter_id: string | null
  status: ShiftStatus
  merged: boolean
  pickup_by: 'parent' | 'babysitter'
  notes: string | null
}
