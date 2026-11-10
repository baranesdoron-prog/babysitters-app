import { useState } from 'react'
import { Trash2 } from 'lucide-react'

import { Segmented } from '@/components/Segmented'
import { ErrorText, Field, Loading, PageHeader, Pill, PrimaryButton, Section } from '@/components/bits'
import { Input, Select } from '@/components/ui/input'
import { useLoad } from '@/hooks/useLoad'
import { weekdayLong } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { Availability } from '@/lib/types'
import { formatDayHeader, todayKey, trimTime } from '@/lib/utils'

type Mode = 'weekly' | 'date'

export function MyAvailability({ babysitterId }: { babysitterId: string }) {
  const [mode, setMode] = useState<Mode>('weekly')
  const [weekday, setWeekday] = useState('0')
  const [onDate, setOnDate] = useState(todayKey())
  const [dateKind, setDateKind] = useState<'available_on' | 'unavailable_on'>('unavailable_on')
  const [start, setStart] = useState('15:00')
  const [end, setEnd] = useState('22:00')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, error, reload } = useLoad(async () => {
    const res = await supabase
      .from('availability')
      .select('*')
      .eq('babysitter_id', babysitterId)
      .order('weekday')
      .order('on_date')
      .order('start_time')
    if (res.error) throw new Error('לא הצלחנו לטעון את הזמינות שלך.')
    return res.data as Availability[]
  }, [babysitterId])

  async function add() {
    setBusy(true)
    setActionError(null)
    const row = {
      babysitter_id: babysitterId,
      kind: mode === 'weekly' ? 'weekly' : dateKind,
      weekday: mode === 'weekly' ? Number(weekday) : null,
      on_date: mode === 'weekly' ? null : onDate,
      start_time: start,
      end_time: end,
    }
    const { error: insertError } = await supabase.from('availability').insert(row)
    setBusy(false)
    if (insertError) setActionError('לא הצלחנו לשמור. נסי שוב.')
    reload()
  }

  async function remove(row: Availability) {
    setActionError(null)
    const { error: deleteError } = await supabase.from('availability').delete().eq('id', row.id)
    if (deleteError) setActionError('לא הצלחנו למחוק. נסי שוב.')
    reload()
  }

  if (error) return <ErrorText>{error}</ErrorText>
  if (!data) return <Loading />

  const weekly = data.filter((r) => r.kind === 'weekly')
  const today = todayKey()
  const dated = data.filter((r) => r.kind !== 'weekly' && (r.on_date ?? '') >= today)
  const range = (r: Availability) => (
    <span dir="ltr">{trimTime(r.start_time)}–{trimTime(r.end_time)}</span>
  )

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="הזמינות שלי" />
      <p className="text-muted-foreground text-[15px]">ההורים ישלחו לך בקשות רק בשעות שסימנת כאן.</p>

      <Section title="כל שבוע">
        {weekly.length === 0 && <p className="text-muted-foreground text-sm">עוד לא סימנת שעות קבועות.</p>}
        <ul className="flex flex-col">
          {weekly.map((r) => (
            <li key={r.id} className="border-muted flex min-h-12 items-center gap-2 border-b last:border-b-0">
              <span className="w-16 shrink-0 text-[15px] font-semibold">{weekdayLong[r.weekday!]}</span>
              <span className="flex-1 text-[15px]">{range(r)}</span>
              <button type="button" aria-label={`מחיקת יום ${weekdayLong[r.weekday!]}`} onClick={() => remove(r)} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
                <Trash2 className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="תאריכים מיוחדים">
        {dated.length === 0 && <p className="text-muted-foreground text-sm">אין שינויים בתאריכים הקרובים.</p>}
        <ul className="flex flex-col">
          {dated.map((r) => (
            <li key={r.id} className="border-muted flex min-h-12 items-center gap-2 border-b py-1 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{formatDayHeader(r.on_date!)}</p>
                <p className="text-muted-foreground text-sm">{range(r)}</p>
              </div>
              {r.kind === 'available_on' ? (
                <Pill className="bg-success-soft text-success-foreground">פנויה</Pill>
              ) : (
                <Pill className="bg-muted text-muted-foreground">לא פנויה</Pill>
              )}
              <button type="button" aria-label={`מחיקת ${formatDayHeader(r.on_date!)}`} onClick={() => remove(r)} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
                <Trash2 className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="להוסיף">
        <Segmented
          label="סוג"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'weekly', label: 'כל שבוע' },
            { value: 'date', label: 'תאריך מסוים' },
          ]}
        />
        {mode === 'weekly' ? (
          <Field label="יום" htmlFor="weekday">
            <Select id="weekday" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
              {weekdayLong.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="תאריך" htmlFor="onDate">
              <Input id="onDate" type="date" min={today} value={onDate} onChange={(e) => setOnDate(e.target.value)} />
            </Field>
            <Segmented
              label="פנויה או לא"
              value={dateKind}
              onChange={setDateKind}
              options={[
                { value: 'unavailable_on', label: 'לא פנויה' },
                { value: 'available_on', label: 'פנויה' },
              ]}
            />
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="משעה" htmlFor="from">
            <Input id="from" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="עד שעה" htmlFor="to">
            <Input id="to" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {end <= start && <p className="text-muted-foreground text-sm">עד למחרת בבוקר.</p>}
        {actionError && <ErrorText>{actionError}</ErrorText>}
        <PrimaryButton type="button" disabled={busy} onClick={add}>{busy ? 'שומרים…' : 'הוספה'}</PrimaryButton>
      </Section>
    </div>
  )
}
