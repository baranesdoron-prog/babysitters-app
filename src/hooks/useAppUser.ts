import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/lib/types'

export const APP_USER_COLUMNS =
  'id, email, full_name, role, is_admin, babysitter_id, child_id, photo_path, first_name, last_name, workplace, phone, must_change_password'

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session; user: AppUser | null }

export function useAppUser(): State & { reload: () => void } {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [user, setUser] = useState<AppUser | null | undefined>(undefined)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('app_users')
      .select(APP_USER_COLUMNS)
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setUser((data as AppUser | null) ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [userId, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  if (session === undefined) return { status: 'loading', reload }
  if (session === null) return { status: 'signed-out', reload }
  if (user === undefined) return { status: 'loading', reload }
  return { status: 'signed-in', session, user, reload }
}
