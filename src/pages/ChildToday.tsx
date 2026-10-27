import { Avatar } from '@/components/Avatar'
import { CallButton, ErrorText, Loading } from '@/components/bits'
import { useLoad } from '@/hooks/useLoad'
import { supabase } from '@/lib/supabase'
import type { ChildUpcomingShift } from '@/lib/types'
import { formatDayHeader, formatTime, localParts, todayKey, trimTime } from '@/lib/utils'

function whenText(s: ChildUpcomingShift) {
  const date = localParts(s.start_at).date
  const today = todayKey()
  if (date === today) return 'היום'
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10)
  if (date === tomorrow) return 'מחר'
  return formatDayHeader(date)
}

// The child's only screen: who is with her, when, and who picks her up.
export function ChildToday() {
  const { data, error } = useLoad(async () => {
    const res = await supabase.rpc('child_upcoming_shifts')
    if (res.error) throw new Error('לא הצלחנו לבדוק מי מגיעה. נסי שוב עוד מעט.')
    return res.data as ChildUpcomingShift[]
  }, [])

  if (error) return <ErrorText>{error}</ErrorText>
  if (!data) return <Loading />

  const [next, ...later] = data
  if (!next) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <h1 className="font-display text-[26px] font-semibold">מי איתי היום</h1>
        <p className="text-[19px]">השבוע אין בייביסיטר. אמא ואבא איתך!</p>
      </div>
    )
  }

  const now = Date.now()
  const here = new Date(next.start_at).getTime() <= now
  const first = next.babysitter_name.split(' ')[0]

  return (
    <div className="flex flex-col gap-3.5">
      <h1 className="font-display text-[26px] font-semibold">מי איתי {whenText(next)}</h1>

      <section className="bg-card flex flex-col items-center gap-3 rounded-xl p-6 text-center">
        <Avatar name={next.babysitter_name} path={next.babysitter_photo} size={112} />
        <p className="font-display text-[28px] font-semibold">{next.babysitter_name}</p>
        {next.pickup_by === 'babysitter' ? (
          <p className="text-[20px]">
            {first} אוספת אותך
            {next.pickup_time && <> ב-<span className="font-semibold">{trimTime(next.pickup_time)}</span></>}
            {next.pickup_location && <> מ{next.pickup_location}</>}
          </p>
        ) : (
          <p className="text-[20px]">
            {here ? `${first} איתך עכשיו` : <>{first} מגיעה ב-<span className="font-semibold">{formatTime(next.start_at)}</span></>}
          </p>
        )}
        <p className="text-muted-foreground text-[17px]">
          עד <span className="font-semibold">{formatTime(next.end_at)}</span>
        </p>
        {next.babysitter_phone && (
          <a
            href={`tel:${next.babysitter_phone}`}
            className="bg-primary text-primary-foreground flex h-14 w-full items-center justify-center rounded-lg text-[19px] font-semibold"
          >
            להתקשר ל{first}
          </a>
        )}
      </section>

      {later.length > 0 && (
        <section className="bg-card flex flex-col rounded-xl p-4">
          <h2 className="pb-2 text-[19px] font-bold">בהמשך השבוע</h2>
          {later.map((s) => (
            <div key={s.shift_id} className="border-muted flex min-h-16 items-center gap-3 border-b py-2 last:border-b-0">
              <Avatar name={s.babysitter_name} path={s.babysitter_photo} size={48} />
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold">{s.babysitter_name}</p>
                <p className="text-muted-foreground text-[15px]">
                  {whenText(s)} · <span dir="ltr">{formatTime(s.start_at)}–{formatTime(s.end_at)}</span>
                </p>
              </div>
              {s.babysitter_phone && <CallButton name={s.babysitter_name} phone={s.babysitter_phone} />}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
