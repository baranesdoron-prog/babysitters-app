import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'

import { Avatar } from '@/components/Avatar'
import { SplitBar } from '@/components/SplitBar'
import {
  CallButton,
  Empty,
  ErrorText,
  Loading,
  PageHeader,
  Pill,
  PrimaryButton,
  SecondaryButton,
  Section,
  WarningBox,
} from '@/components/bits'
import { fetchSettings } from '@/hooks/useSettings'
import { useLoad } from '@/hooks/useLoad'
import { computeAmount, shiftAmount, splitShift } from '@/lib/billing'
import { CAR_SEAT_ITEM, contactKindLabels, itemKindLabels } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { Babysitter, Child, Contact, SchoolSchedule, Settings, Shift, ShiftItem, ShiftRequest } from '@/lib/types'
import { cn, formatDayHeader, formatHours, formatMoney, formatTime, localParts, trimTime } from '@/lib/utils'

type OpenRequest = ShiftRequest & { shift: Shift }

export function MyShifts({ babysitterId }: { babysitterId: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, error, reload } = useLoad(async () => {
    const since = new Date(Date.now() - 45 * 86400000).toISOString()
    const [settings, me, requests, shifts] = await Promise.all([
      fetchSettings(),
      supabase.from('babysitters').select('*').eq('id', babysitterId).single(),
      supabase.from('shift_requests').select('*, shift:shifts(*)').eq('babysitter_id', babysitterId).eq('status', 'sent'),
      supabase
        .from('shifts')
        .select('*')
        .eq('babysitter_id', babysitterId)
        .in('status', ['confirmed', 'done'])
        .gte('end_at', since)
        .order('start_at'),
    ])
    if (me.error || requests.error || shifts.error) throw new Error('לא הצלחנו לטעון את המשמרות שלך.')
    const myShifts = shifts.data as Shift[]
    const ids = myShifts.map((s) => s.id)
    // The girls' details are readable only around a confirmed shift (RLS); otherwise these come back empty.
    const [items, children, contacts, schedule] = await Promise.all([
      ids.length ? supabase.from('shift_items').select('*').in('shift_id', ids) : Promise.resolve({ data: [], error: null }),
      supabase.from('children').select('*').order('birth_date'),
      supabase.from('contacts').select('*').order('name'),
      supabase.from('school_schedule').select('*'),
    ])
    return {
      settings,
      me: me.data as Babysitter,
      requests: (requests.data as unknown as OpenRequest[]).filter((r) => r.shift),
      shifts: myShifts,
      items: (items.data ?? []) as ShiftItem[],
      children: (children.data ?? []) as Child[],
      contacts: (contacts.data ?? []) as Contact[],
      schedule: (schedule.data ?? []) as SchoolSchedule[],
    }
  }, [babysitterId])

  async function respond(requestId: string, accept: boolean) {
    setBusy(requestId)
    setActionError(null)
    const { error: rpcError } = await supabase.rpc('respond_to_request', { p_request: requestId, p_accept: accept })
    setBusy(null)
    if (rpcError) setActionError('לא הצלחנו לשלוח את התשובה. אולי הבקשה כבר נסגרה.')
    reload()
  }

  async function toggleItem(item: ShiftItem) {
    setBusy(item.id)
    setActionError(null)
    const { error: rpcError } = await supabase.rpc('set_item_done', { p_item: item.id, p_done: !item.done })
    setBusy(null)
    if (rpcError) setActionError('לא הצלחנו לעדכן את הפריט.')
    reload()
  }

  if (error) return <ErrorText>{error}</ErrorText>
  if (!data) return <Loading />

  const now = Date.now()
  const upcoming = data.shifts.filter((s) => new Date(s.end_at).getTime() >= now && s.status === 'confirmed')
  const past = data.shifts.filter((s) => !upcoming.includes(s)).reverse()

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="המשמרות שלי" />
      {actionError && <ErrorText>{actionError}</ErrorText>}

      {data.requests.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[17px] font-bold">בקשות חדשות</h2>
          {data.requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              me={data.me}
              settings={data.settings}
              busy={busy === r.id}
              onAnswer={(accept) => respond(r.id, accept)}
            />
          ))}
        </div>
      )}

      <h2 className="text-[17px] font-bold">המשמרות הבאות</h2>
      {upcoming.length === 0 && <Empty>אין משמרות קרובות.</Empty>}
      {upcoming.map((s) => (
        <ShiftCard
          key={s.id}
          shift={s}
          settings={data.settings}
          items={data.items.filter((i) => i.shift_id === s.id)}
          kids={data.children}
          contacts={data.contacts}
          schedule={data.schedule}
          busyItem={busy}
          onToggle={toggleItem}
        />
      ))}

      {past.length > 0 && (
        <Section title="משמרות קודמות">
          <ul className="flex flex-col">
            {past.map((s) => (
              <li key={s.id} className="border-muted flex min-h-12 items-center gap-2 border-b py-1 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{formatDayHeader(localParts(s.start_at).date)}</p>
                  <p className="text-muted-foreground text-sm"><span dir="ltr">{formatTime(s.start_at)}–{formatTime(s.end_at)}</span></p>
                </div>
                <span className="text-[15px] font-semibold">
                  {formatMoney(s.actual_amount ?? s.computed_amount ?? computeAmount(data.me, splitShift(s.start_at, s.end_at, data.settings.night_start), s.merged))}
                </span>
                {s.payment_id ? (
                  <Pill className="bg-success-soft text-success-foreground">שולם</Pill>
                ) : (
                  <Pill className="bg-pending-soft text-pending-foreground">לתשלום</Pill>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function RequestCard({ request, me, settings, busy, onAnswer }: {
  request: OpenRequest
  me: Babysitter
  settings: Settings
  busy: boolean
  onAnswer: (accept: boolean) => void
}) {
  const s = request.shift
  const split = splitShift(s.start_at, s.end_at, settings.night_start)
  const estimate = shiftAmount({ actual_amount: s.actual_amount, computed_amount: computeAmount(me, split, s.merged) })
  return (
    <section className="bg-card border-day flex flex-col gap-3 rounded-xl border-2 border-dashed p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[17px] font-bold">{formatDayHeader(localParts(s.start_at).date)}</p>
          <p className="text-muted-foreground text-[15px]"><span dir="ltr">{formatTime(s.start_at)}–{formatTime(s.end_at)}</span></p>
        </div>
        <Pill className="bg-pending-soft text-pending-foreground">ממתינה לתשובה</Pill>
      </div>
      <SplitBar dayHours={split.dayHours} nightHours={split.nightHours} />
      <p className="text-[15px]">
        {s.pickup_by === 'babysitter' ? 'כולל איסוף מהגן' : 'ההורים אוספים'} · בערך {formatMoney(estimate)}
      </p>
      {s.notes && <p className="text-muted-foreground text-[15px]">{s.notes}</p>}
      {request.deadline_at && (
        <p className="text-muted-foreground text-sm">נשמח לתשובה עד {formatTime(request.deadline_at)}.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <PrimaryButton type="button" disabled={busy} onClick={() => onAnswer(true)}>אני יכולה</PrimaryButton>
        <SecondaryButton type="button" disabled={busy} onClick={() => onAnswer(false)}>לא הפעם</SecondaryButton>
      </div>
    </section>
  )
}

function ShiftCard({ shift, settings, items, kids, contacts, schedule, busyItem, onToggle }: {
  shift: Shift
  settings: Settings
  items: ShiftItem[]
  kids: Child[]
  contacts: Contact[]
  schedule: SchoolSchedule[]
  busyItem: string | null
  onToggle: (item: ShiftItem) => void
}) {
  const split = splitShift(shift.start_at, shift.end_at, settings.night_start)
  const night = split.nightHours > split.dayHours
  const { date, weekday } = localParts(shift.start_at)
  const childName = (id: string | null) => kids.find((c) => c.id === id)?.name
  const seatItem = items.find((i) => i.kind === 'leave' && i.description === CAR_SEAT_ITEM)

  return (
    <section className="bg-card flex flex-col overflow-hidden rounded-xl">
      <header
        className={cn(
          'flex items-center gap-2 px-4 py-3',
          night ? 'bg-night-deep text-white' : 'bg-day-soft text-day-foreground',
        )}
      >
        {night ? <Moon className="size-5" aria-hidden="true" /> : <Sun className="size-5" aria-hidden="true" />}
        <div className="flex-1">
          <p className="text-[17px] font-bold">{formatDayHeader(date)}</p>
          <p className="text-[15px]">
            <span dir="ltr">{formatTime(shift.start_at)}–{formatTime(shift.end_at)}</span>
            {' · '}{night ? 'משמרת לילה' : 'משמרת יום'}
          </p>
        </div>
        <Pill className="bg-success-soft text-success-foreground">מאושרת</Pill>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <p className="text-muted-foreground text-sm">
          {split.dayHours > 0 && `יום ${formatHours(split.dayHours)}`}
          {split.dayHours > 0 && split.nightHours > 0 && ' · '}
          {split.nightHours > 0 && `לילה ${formatHours(split.nightHours)}`}
        </p>

        {shift.pickup_by === 'babysitter' && (
          <div className="flex flex-col gap-1">
            <p className="text-[15px] font-semibold">את אוספת</p>
            {kids.map((c) => {
              const row = schedule.find((r) => r.child_id === c.id && r.weekday === weekday)
              return row ? (
                <p key={c.id} className="text-[15px]">
                  {c.name}: {trimTime(row.end_time)}{row.pickup_location && `, ${row.pickup_location}`}
                </p>
              ) : null
            })}
            <p className="text-muted-foreground text-sm">בלי הסעות לחוגים.</p>
            {seatItem && <WarningBox>אין לך כיסא בטיחות, אז ההורים ישאירו לך כיסא לאוטו.</WarningBox>}
          </div>
        )}

        {shift.notes && <p className="text-[15px]">{shift.notes}</p>}

        {items.length > 0 && (
          <div className="flex flex-col">
            <p className="text-[15px] font-semibold">מה לעשות</p>
            {items.map((item) => (
              <label key={item.id} className="border-muted flex min-h-12 items-center gap-3 border-b py-2 last:border-b-0">
                <input
                  type="checkbox"
                  className="accent-primary size-5 shrink-0"
                  checked={item.done}
                  disabled={busyItem === item.id}
                  onChange={() => onToggle(item)}
                />
                <span className={cn('text-[15px]', item.done && 'text-muted-foreground line-through')}>
                  {item.description}
                  <span className="text-muted-foreground text-sm">
                    {' · '}{itemKindLabels[item.kind]}{childName(item.child_id) && ` · ${childName(item.child_id)}`}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {kids.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] font-semibold">הבנות</p>
            {kids.map((c) => (
              <div key={c.id} className="flex items-start gap-3">
                <Avatar name={c.name} path={c.photo_path} size={40} tone="child" />
                <div className="text-[15px]">
                  <p className="font-semibold">{c.name}</p>
                  {c.bedtime && <p className="text-muted-foreground text-sm">הולכת לישון ב-{trimTime(c.bedtime)}</p>}
                  {c.allergies && <p className="text-warning-foreground text-sm">אלרגיה: {c.allergies}</p>}
                  {c.notes && <p className="text-muted-foreground text-sm">{c.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {contacts.length > 0 && (
          <div className="flex flex-col">
            <p className="text-[15px] font-semibold">אנשי קשר</p>
            {contacts.map((c) => (
              <div key={c.id} className="border-muted flex min-h-12 items-center gap-2 border-b py-1 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">{c.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {contactKindLabels[c.kind]}{childName(c.child_id) && ` · ${childName(c.child_id)}`}
                  </p>
                </div>
                <CallButton name={c.name} phone={c.phone} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
