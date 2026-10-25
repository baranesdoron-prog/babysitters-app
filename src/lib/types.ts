export type AppRole = 'parent' | 'babysitter' | 'child' | 'admin'

export interface AppUser {
  id: string
  email: string | null
  full_name: string | null
  role: AppRole | null
  babysitter_id: string | null
  child_id: string | null
  photo_path: string | null
}

export type RateType = 'hourly' | 'per_shift'

export interface Babysitter {
  id: string
  full_name: string
  phone: string | null
  photo_path: string | null
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

/** One row of child_upcoming_shifts() — everything a child account may see. */
export interface ChildUpcomingShift {
  shift_id: string
  start_at: string
  end_at: string
  babysitter_id: string
  babysitter_name: string
  babysitter_phone: string | null
  babysitter_photo: string | null
  pickup_by: 'parent' | 'babysitter'
  pickup_location: string | null
  pickup_time: string | null
}
