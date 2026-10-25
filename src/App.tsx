import { Navigate, Route, Routes } from 'react-router-dom'

import { useAppUser } from '@/hooks/useAppUser'
import { AppShell } from '@/components/AppShell'
import { Login } from '@/pages/Login'
import { PendingRole } from '@/pages/PendingRole'
import { Babysitters } from '@/pages/Babysitters'
import { Placeholder } from '@/pages/Placeholder'

export function App() {
  const state = useAppUser()

  if (state.status === 'loading') {
    return <div className="text-muted-foreground flex min-h-svh items-center justify-center">טוען…</div>
  }
  if (state.status === 'signed-out') return <Login />

  const role = state.user?.role ?? null
  if (!role) return <PendingRole email={state.session.user.email ?? null} />

  if (role === 'child') {
    return (
      <Routes>
        <Route element={<AppShell role="child" />}>
          <Route path="/today" element={<Placeholder title="מי איתי היום" />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    )
  }

  if (role === 'babysitter') {
    return (
      <Routes>
        <Route element={<AppShell role="babysitter" />}>
          <Route path="/my-shifts" element={<Placeholder title="המשמרות שלי" />} />
          <Route path="/my-availability" element={<Placeholder title="הזמינות שלי" />} />
          <Route path="*" element={<Navigate to="/my-shifts" replace />} />
        </Route>
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell role="parent" />}>
        <Route path="/calendar" element={<Placeholder title="יומן" />} />
        <Route path="/babysitters" element={<Babysitters />} />
        <Route path="/children" element={<Placeholder title="הבנות" />} />
        <Route path="/payments" element={<Placeholder title="תשלומים" />} />
        <Route path="*" element={<Navigate to="/calendar" replace />} />
      </Route>
    </Routes>
  )
}
