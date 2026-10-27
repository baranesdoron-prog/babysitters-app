import { Navigate, Route, Routes } from 'react-router-dom'

import { useAppUser } from '@/hooks/useAppUser'
import { AppShell } from '@/components/AppShell'
import { Login } from '@/pages/Login'
import { PendingRole } from '@/pages/PendingRole'
import { Babysitters } from '@/pages/Babysitters'
import { BabysitterForm } from '@/pages/BabysitterForm'
import { Calendar } from '@/pages/Calendar'
import { ShiftForm } from '@/pages/ShiftForm'
import { ShiftDetail } from '@/pages/ShiftDetail'
import { Children } from '@/pages/Children'
import { ChildForm } from '@/pages/ChildForm'
import { Payments } from '@/pages/Payments'
import { Settings } from '@/pages/Settings'
import { MyShifts } from '@/pages/MyShifts'
import { MyAvailability } from '@/pages/MyAvailability'
import { ChildToday } from '@/pages/ChildToday'
import { AdminPairs } from '@/pages/AdminPairs'

export function App() {
  const state = useAppUser()

  if (state.status === 'loading') {
    return <div className="text-muted-foreground flex min-h-svh items-center justify-center">טוען…</div>
  }
  if (state.status === 'signed-out') return <Login />

  const role = state.user?.role ?? null
  if (!role) {
    return (
      <PendingRole
        email={state.session.user.email ?? null}
        metadata={state.session.user.user_metadata}
      />
    )
  }

  if (role === 'child') {
    return (
      <Routes>
        <Route element={<AppShell role="child" />}>
          <Route path="/today" element={<ChildToday />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    )
  }

  if (role === 'babysitter') {
    const babysitterId = state.user!.babysitter_id!
    return (
      <Routes>
        <Route element={<AppShell role="babysitter" />}>
          <Route path="/my-shifts" element={<MyShifts babysitterId={babysitterId} />} />
          <Route path="/my-availability" element={<MyAvailability babysitterId={babysitterId} />} />
          <Route path="*" element={<Navigate to="/my-shifts" replace />} />
        </Route>
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell role="parent" isAdmin={state.user?.is_admin ?? false} />}>
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/shifts/new" element={<ShiftForm />} />
        <Route path="/shifts/:id" element={<ShiftDetail />} />
        <Route path="/babysitters" element={<Babysitters />} />
        <Route path="/babysitters/:id" element={<BabysitterForm />} />
        <Route path="/children" element={<Children />} />
        <Route path="/children/:id" element={<ChildForm />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/settings" element={<Settings />} />
        {state.user?.is_admin && <Route path="/admin-pairs" element={<AdminPairs />} />}
        <Route path="*" element={<Navigate to="/calendar" replace />} />
      </Route>
    </Routes>
  )
}
