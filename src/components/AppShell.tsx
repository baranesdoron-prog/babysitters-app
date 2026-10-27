import { NavLink, Outlet } from 'react-router-dom'
import { CalendarDays, Users, Baby, Wallet, ClipboardList, Clock, LogOut, ShieldCheck, type LucideIcon } from 'lucide-react'

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
  const navItems = isAdmin && role === 'parent'
    ? [...NAV[role], { label: 'בקשות הורים', icon: ShieldCheck, to: '/admin-pairs' }]
    : NAV[role]

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col">
      <header className="bg-card flex items-center justify-between border-b px-4 py-2">
        <p className="font-semibold">הבייביסיטריות שלנו</p>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="text-muted-foreground flex min-h-11 items-center gap-1 text-sm"
        >
          <LogOut className="size-4" aria-hidden="true" />
          יציאה
        </button>
      </header>

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
                'flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 px-2 py-1 text-xs',
                isActive ? 'text-primary font-semibold' : 'text-muted-foreground font-medium',
              )
            }
          >
            <item.icon className="size-[22px]" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      )}
    </div>
  )
}
