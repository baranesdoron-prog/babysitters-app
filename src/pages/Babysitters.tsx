import { Link } from 'react-router-dom'
import { ChevronLeft, Moon, Share2, Sun } from 'lucide-react'

import { Avatar } from '@/components/Avatar'
import { CallButton, Empty, ErrorText, Fab, Loading, PageHeader, Pill, Tag } from '@/components/bits'
import { useLoad } from '@/hooks/useLoad'
import { formatRate } from '@/lib/labels'
import { fetchMySitters } from '@/lib/sitters'
import type { MySitter } from '@/lib/types'
import { cn } from '@/lib/utils'

export function Babysitters() {
  const { data: rows, error } = useLoad(() => fetchMySitters(), [])

  // Give to get: the shared list opens once my family shares one of its own.
  const iShare = rows?.some((b) => b.owned && b.shared) ?? false

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="בייביסיטריות" />
      {error && <ErrorText>{error}</ErrorText>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Empty>עוד אין בייביסיטריות. הוסיפו את הראשונה עם הכפתור למטה.</Empty>}
      {rows?.map((b, i) => (
        <section key={b.id} className={cn('bg-card flex flex-col gap-3 rounded-xl p-4', !b.active && 'opacity-60')}>
          <div className="flex items-center gap-3">
            <Avatar name={b.full_name} path={b.photo_path} size={48} tone={i % 2 ? 'babysitter-alt' : 'babysitter'} />
            <Link to={`/babysitters/${b.id}`} className="flex min-h-11 min-w-0 flex-1 items-center gap-1">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[17px] font-bold">{b.full_name}</span>
                {b.phone && <span className="text-muted-foreground text-sm" dir="ltr">{b.phone}</span>}
                {!b.active && <span className="text-muted-foreground text-sm">לא פעילה</span>}
              </span>
              <ChevronLeft className="text-subtle-foreground ms-auto size-5 shrink-0" aria-hidden="true" />
            </Link>
            {b.phone && <CallButton name={b.full_name} phone={b.phone} />}
          </div>
          <RateBlocks sitter={b} />
          <div className="flex flex-wrap gap-2">
            {!b.owned && <Pill className="bg-night-soft text-night-foreground">מהמאגר המשותף</Pill>}
            {b.owned && b.shared && <Pill className="bg-primary-soft text-primary-strong">משותפת</Pill>}
            {b.helps_homework && <Tag>עוזרת בשיעורים</Tag>}
            {b.can_pickup && <Tag>יכולה לאסוף</Tag>}
            {b.can_pickup && (b.has_child_seat ? <Tag>כיסא בטיחות</Tag> : <Tag missing>אין כיסא בטיחות</Tag>)}
          </div>
        </section>
      ))}
      {rows && (
        <section className="bg-card flex flex-col gap-3 rounded-xl p-4">
          <h2 className="flex items-center gap-2 text-[17px] font-bold">
            <Share2 className="text-muted-foreground size-5" aria-hidden="true" /> המאגר המשותף
          </h2>
          {iShare ? (
            <>
              <p className="text-muted-foreground text-sm">בייביסיטריות שמשפחות אחרות שיתפו. מוסיפים לרשימה שלכם וקובעים תעריפים משלכם.</p>
              <Link
                to="/babysitters/shared"
                className="border-input bg-card flex h-[52px] items-center justify-center rounded-lg border text-[17px] font-semibold"
              >
                + מהמאגר המשותף
              </Link>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              כדי לראות בייביסיטריות של משפחות אחרות, שתפו לפחות אחת משלכם: בכרטיס שלה ← "לשתף עם משפחות אחרות".
            </p>
          )}
        </section>
      )}
      <Fab to="/babysitters/new" label="בייביסיטר חדשה" />
    </div>
  )
}

export function RateBlocks({ sitter }: { sitter: MySitter }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-day-soft text-day-foreground flex flex-col gap-0.5 rounded-lg p-3">
        <span className="flex items-center gap-1 text-sm font-semibold"><Sun className="size-4" aria-hidden="true" /> יום</span>
        <span className="text-[15px] font-semibold">{formatRate(sitter.day_rate_type, sitter.day_rate)}</span>
      </div>
      <div className="bg-night-soft text-night-foreground flex flex-col gap-0.5 rounded-lg p-3">
        <span className="flex items-center gap-1 text-sm font-semibold"><Moon className="size-4" aria-hidden="true" /> לילה</span>
        <span className="text-[15px] font-semibold">
          {sitter.night_ok ? formatRate(sitter.night_rate_type, sitter.night_rate) : 'לא עושה לילות'}
        </span>
      </div>
    </div>
  )
}
