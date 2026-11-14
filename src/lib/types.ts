export type AppRole = 'parent' | 'babysitter' | 'child'

export interface AppUser {
  id: string
  email: string | null
  full_name: string | null
  role: AppRole | null
  is_admin: boolean
  babysitter_id: string | null
  child_id: string | null
  photo_path: string | null
  family_id: string | null
  first_name: string | null
  last_name: string | null
  workplace: string | null
  phone: string | null
  /** Set when someone else chose the password; cleared by password_changed(). */
  must_change_password: boolean
}

export interface Family {
  id: string
  name: string
  created_at: string
}

export type RateType = 'hourly' | 'per_shift'

/** A babysitter's shared profile. Edited by the family that added her (family_id) and by her. */
export interface Babysitter {
  id: string
  family_id: string
  full_name: string
  phone: string | null
  photo_path: string | null
  night_ok: boolean
  helps_homework: boolean
  can_pickup: boolean
  has_child_seat: boolean
  /** Offered to other families that share too. */
  shared: boolean
}

/** One family's own terms with a babysitter (family_babysitters). Private to that family. */
export interface SitterTerms {
  family_id: string
  babysitter_id: string
  day_rate_type: RateType
  day_rate: number | null
  night_rate_type: RateType
  night_rate: number | null
  notes: string | null
  active: boolean
}

/** A babysitter in my family's list: her profile plus my family's terms. */
export type MySitter = Babysitter & Omit<SitterTerms, 'family_id' | 'babysitter_id'> & {
  /** My family added her (and so edits her profile). */
  owned: boolean
}

export interface Settings {
  night_start: string // 'HH:MM:SS'
  default_wait_minutes: number
  default_reminder_minutes: number
}

export type AvailabilityKind = 'weekly' | 'available_on' | 'unavailable_on'

export interface Availability {
  id: string
  babysitter_id: string
  kind: AvailabilityKind
  weekday: number | null // 0 = Sunday
  on_date: string | null // 'YYYY-MM-DD'
  start_time: string
  end_time: string
}

export type FrameworkType = 'kindergarten' | 'school'
export type Gender = 'boy' | 'girl'

export interface Child {
  id: string
  family_id: string
  name: string
  birth_date: string | null
  allergies: string | null
  bedtime: string | null
  framework_type: FrameworkType | null
  gender: Gender | null
  framework_name: string | null
  needs_child_seat: boolean
  notes: string | null
  photo_path: string | null
}

export type ContactKind = 'friend' | 'friend_parent' | 'emergency' | 'activity' | 'other'

export interface Contact {
  id: string
  family_id: string
  child_id: string | null
  name: string
  phone: string
  kind: ContactKind
  notes: string | null
}

export interface SchoolSchedule {
  id: string
  family_id: string
  child_id: string
  weekday: number
  end_time: string
  pickup_location: string | null
}

export interface Activity {
  id: string
  child_id: string
  name: string
  weekday: number
  start_time: string
  end_time: string | null
  location: string | null
  driver: string | null
}

export type ShiftStatus = 'draft' | 'requested' | 'confirmed' | 'done' | 'cancelled'
export type PickupBy = 'parent' | 'babysitter'

export interface Shift {
  id: string
  family_id: string
  start_at: string
  end_at: string
  babysitter_id: string | null
  status: ShiftStatus
  merged: boolean
  pickup_by: PickupBy
  wait_minutes: number | null
  reminder_minutes: number | null
  notes: string | null
  computed_amount: number | null
  actual_amount: number | null
  payment_id: string | null
}

export type RequestStatus = 'queued' | 'sent' | 'accepted' | 'declined' | 'skipped'

export interface ShiftRequest {
  id: string
  shift_id: string
  babysitter_id: string
  position: number
  status: RequestStatus
  sent_at: string | null
  deadline_at: string | null
  responded_at: string | null
}

export type ItemKind = 'prepare' | 'leave' | 'homework' | 'morning' | 'other'

export interface ShiftItem {
  id: string
  shift_id: string
  kind: ItemKind
  description: string
  child_id: string | null
  done: boolean
}

export interface ItemTemplate {
  id: string
  kind: ItemKind
  description: string
  auto_on: 'night' | null
  child_id: string | null
}

export type PaymentMethod = 'bit' | 'paybox' | 'cash' | 'transfer' | 'other'

export interface Payment {
  id: string
  babysitter_id: string
  amount: number
  method: PaymentMethod
  paid_at: string
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
  pickup_by: PickupBy
  pickup_location: string | null
  pickup_time: string | null
}
