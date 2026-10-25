import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/lib/types'

type State =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session; user: AppUser | null }

export function useAppUser(): State {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [user, setUser] = useState<AppUser | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    supabase
      .from('app_users')
      .select('id, email, full_name, role, babysitter_id, child_id, photo_path')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setUser((data as AppUser | null) ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  if (session === undefined) return { status: 'loading' }
  if (session === null) return { status: 'signed-out' }
  if (user === undefined) return { status: 'loading' }
  return { status: 'signed-in', session, user }
}
