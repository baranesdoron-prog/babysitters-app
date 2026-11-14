import { Navigate, Route, Routes } from 'react-router-dom'

import { useAppUser } from '@/hooks/useAppUser'
import { AppShell } from '@/components/AppShell'
import { Login } from '@/pages/Login'
import { PendingRole } from '@/pages/PendingRole'
import { Babysitters } from '@/pages/Babysitters'
import { BabysitterForm } from '@/pages/BabysitterForm'
import { SharedBabysitters } from '@/pages/SharedBabysitters'
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
import { ForcePasswordChange } from '@/pages/ForcePasswordChange'
import { Parents } from '@/pages/Parents'
import { ParentForm } from '@/pages/ParentForm'
import { Profile } from '@/pages/Profile'
import { AdminFamilies, AdminNewFamily, AdminNewParent } from '@/pages/AdminFamilies'

export function App() {
  const state = useAppUser()

  if (state.status === 'loading') {
    return <div className="text-muted-foreground flex min-h-svh items-center justify-center">טוען…</div>
  }
  if (state.status === 'signed-out') return <Login />

  const role = state.user?.role ?? null
  if (!role) {
    return <PendingRole />
  }
  const user = state.user!

  // Signed in with a password someone else chose: pick their own first.
  if (user.must_change_password) {
    return <ForcePasswordChange name={user.first_name ?? user.full_name} onDone={state.reload} />
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
    const babysitterId = user.babysitter_id!
    return (
      <Routes>
        <Route element={<AppShell role="babysitter" />}>
          <Route path="/my-shifts" element={<MyShifts babysitterId={babysitterId} />} />
          <Route path="/my-availability" element={<MyAvailability babysitterId={babysitterId} />} />
          <Route path="/profile" element={<Profile user={user} onChange={state.reload} />} />
          <Route path="*" element={<Navigate to="/my-shifts" replace />} />
        </Route>
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell role="parent" isAdmin={user.is_admin} />}>
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/shifts/new" element={<ShiftForm />} />
        <Route path="/shifts/:id" element={<ShiftDetail />} />
        <Route path="/babysitters" element={<Babysitters />} />
        <Route path="/babysitters/shared" element={<SharedBabysitters />} />
        <Route path="/babysitters/:id" element={<BabysitterForm myFamilyId={user.family_id} />} />
        <Route path="/parents" element={<Parents myId={user.id} isAdmin={user.is_admin} />} />
        <Route path="/parents/:id" element={<ParentForm myId={user.id} />} />
        <Route path="/children" element={<Children />} />
        <Route path="/children/:id" element={<ChildForm />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile user={user} onChange={state.reload} />} />
        {user.is_admin && (
          <>
            <Route path="/admin" element={<AdminFamilies />} />
            <Route path="/admin/families/new" element={<AdminNewFamily />} />
            <Route path="/admin/families/:familyId/parents/new" element={<AdminNewParent />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/calendar" replace />} />
      </Route>
    </Routes>
  )
}
