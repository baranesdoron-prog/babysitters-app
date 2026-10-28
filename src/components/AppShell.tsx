import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { CalendarDays, Users, Baby, Wallet, ClipboardList, Clock, Fingerprint, LogOut, ShieldCheck, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/lib/types'
import { cn } from '@/lib/utils'

const NAV: Record<AppRole, { label: string; icon: LucideIcon; to: string }[]> = {
  parent: [
    { label: 'יומן', icon: CalendarDays, to: '/calendar' },
    { label: 'בייביסיטריות', icon: Users, to: '/babysitters' },
    { label: 'הבנות', icon: Baby, to: '/children' },
    { label: 'תשלומים', icon: Wallet, to: '/payments' },
  ],
  babysitter: [
    { label: 'המשמרות שלי', icon: ClipboardList, to: '/my-shifts' },
    { label: 'הזמינות שלי', icon: Clock, to: '/my-availability' },
  ],
  child: [],
}

export function AppShell({ role, isAdmin = false }: { role: AppRole; isAdmin?: boolean }) {
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyNotice, setPasskeyNotice] = useState<string | null>(null)
  const navItems = isAdmin && role === 'parent'
    ? [...NAV[role], { label: 'בקשות הורים', icon: ShieldCheck, to: '/admin-pairs' }]
    : NAV[role]

  async function registerPasskey() {
    setPasskeyBusy(true)
    setPasskeyNotice(null)
    try {
      const { error } = await supabase.auth.registerPasskey()
      setPasskeyNotice(error ? 'לא הצלחנו להפעיל את מפתח הגישה. נסו שוב במכשיר עם נעילת מסך.' : 'מפתח הגישה נוסף למכשיר.')
    } catch {
      setPasskeyNotice('מפתח הגישה לא זמין בדפדפן הזה. אפשר להמשיך להיכנס עם קישור באימייל.')
    } finally {
      setPasskeyBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <p className="font-semibold">הבייביסיטריות שלנו</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="הפעלת כניסה עם זיהוי ביומטרי"
            title="הפעלת מפתח גישה במכשיר"
            disabled={passkeyBusy}
            onClick={() => void registerPasskey()}
          >
            <Fingerprint className="size-5" />
          </Button>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="text-muted-foreground flex min-h-11 items-center gap-1 px-2 text-sm"
          >
            <LogOut className="size-4" />
            יציאה
          </button>
        </div>
      </header>

      {passkeyNotice && (
        <p className="bg-primary-soft text-primary-strong mx-4 mt-3 rounded-lg p-3 text-sm" role="status">
          {passkeyNotice}
        </p>
      )}

      <main className="flex-1 p-4 pb-24">
        <Outlet />
      </main>

      {navItems.length > 0 && (
      <nav
        className="bg-card fixed inset-x-0 bottom-0 z-10 flex items-center justify-around border-t py-2"
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 0px))' }}
      >
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-2 py-1 text-xs font-medium',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <item.icon className="size-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      )}
    </div>
  )
}
