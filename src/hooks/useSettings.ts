import { supabase } from '@/lib/supabase'
import type { Settings } from '@/lib/types'

export const DEFAULT_SETTINGS: Settings = {
  night_start: '20:00:00',
  default_wait_minutes: 120,
  default_reminder_minutes: 15,
}

export async function fetchSettings(): Promise<Settings> {
  const res = await supabase
    .from('settings')
    .select('night_start, default_wait_minutes, default_reminder_minutes')
    .maybeSingle()
  if (res.error) throw new Error('לא הצלחנו לטעון את ההגדרות.')
  return (res.data as Settings | null) ?? DEFAULT_SETTINGS
}
