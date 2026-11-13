import { Link, useLocation } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

import { Avatar } from '@/components/Avatar'
import { CallButton, Empty, ErrorText, Fab, Loading, PageHeader, Pill } from '@/components/bits'
import { APP_USER_COLUMNS } from '@/hooks/useAppUser'
import { useLoad } from '@/hooks/useLoad'
import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/lib/types'
import { displayName } from '@/lib/people'

export function Parents({ myId }: { myId: string }) {
  const created = (useLocation().state as { created?: string } | null)?.created
  const { data: rows, error } = useLoad(async () => {
    const res = await supabase.from('app_users').select(APP_USER_COLUMNS).eq('role', 'parent').order('first_name')
    if (res.error) throw new Error('לא הצלחנו לטעון את ההורים.')
    return res.data as AppUser[]
  }, [])

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="הורים" />
      {created && (
        <p className="bg-success-soft text-success-foreground rounded-lg p-3 text-[15px]" role="status">
          נוסף! שם המשתמש: <span dir="ltr" className="font-semibold">{created}</span>. מסרו את הסיסמה הראשונית.
        </p>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Empty>עוד אין הורים.</Empty>}
      {rows?.map((p) => {
        const name = displayName(p)
        return (
          <section key={p.id} className="bg-card flex items-center gap-3 rounded-xl p-4">
            <Avatar name={name} path={p.photo_path} size={48} tone="babysitter-alt" />
            <Link to={p.id === myId ? '/profile' : `/parents/${p.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-1">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[17px] font-bold">{name}</span>
                {(p.id === myId || p.must_change_password) && (
                  <span className="flex gap-2 py-0.5">
                    {p.id === myId && <Pill className="bg-primary-soft text-primary-strong">אני</Pill>}
                    {p.must_change_password && <Pill className="bg-pending-soft text-pending-foreground">עוד לא בחר/ה סיסמה</Pill>}
                  </span>
                )}
                {p.workplace && <span className="text-muted-foreground truncate text-sm">{p.workplace}</span>}
                {p.phone && <span className="text-muted-foreground text-sm" dir="ltr">{p.phone}</span>}
              </span>
              <ChevronLeft className="text-subtle-foreground ms-auto size-5 shrink-0" aria-hidden="true" />
            </Link>
            {p.phone && p.id !== myId && <CallButton name={name} phone={p.phone} />}
          </section>
        )
      })}
      <Fab to="/parents/new" label="הוספת הורה" />
    </div>
  )
}
