import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Moon, Sun, Trash2 } from 'lucide-react'

import { Avatar } from '@/components/Avatar'
import { Segmented } from '@/components/Segmented'
import {
  CheckRow,
  Empty,
  ErrorText,
  Field,
  Loading,
  PageHeader,
  PrimaryButton,
  Section,
  TextButton,
  WarningBox,
} from '@/components/bits'
import { Input, Select, Textarea } from '@/components/ui/input'
import { fetchSettings } from '@/hooks/useSettings'
import { useLoad } from '@/hooks/useLoad'
import { isAvailable } from '@/lib/availability'
import { isOvernight, splitShift } from '@/lib/billing'
import { CAR_SEAT_ITEM, formatRate, itemKindLabels } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { Availability, Babysitter, Child, ItemKind, ItemTemplate, PickupBy } from '@/lib/types'
import { addDays, cn, formatDayHeader, formatHours, todayKey, zonedToIso } from '@/lib/utils'

type DraftItem = { kind: ItemKind; description: string; child_id: string | null }

export function ShiftForm() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [date, setDate] = useState(params.get('date') ?? todayKey())
  const [startTime, setStartTime] = useState('16:00')
  const [endTime, setEndTime] = useState('20:00')
  const [merged, setMerged] = useState(false)
  const [pickupBy, setPickupBy] = useState<PickupBy>('parent')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [order, setOrder] = useState<string[] | null>(null) // candidate ids in request order
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data, error } = useLoad(async () => {
    const [settings, sitters, avail, children, templates] = await Promise.all([
      fetchSettings(),
      supabase.from('babysitters').select('*').eq('active', true).order('full_name'),
      supabase.from('availability').select('*'),
      supabase.from('children').select('*').order('birth_date', { ascending: false }),
      supabase.from('item_templates').select('*').eq('auto_on', 'night'),
    ])
    if (sitters.error || avail.error || children.error || templates.error) {
      throw new Error('לא הצלחנו לטעון את הנתונים למשמרת.')
    }
    return {
      settings,
      sitters: sitters.data as Babysitter[],
      availability: avail.data as Availability[],
      children: children.data as Child[],
      templates: templates.data as ItemTemplate[],
    }
  }, [])

  // An end at or before the start means the shift runs past midnight.
  const endDate = endTime <= startTime ? addDays(date, 1) : date
  const startAt = zonedToIso(date, startTime)
  const endAt = zonedToIso(endDate, endTime)
  const split = data ? splitShift(startAt, endAt, data.settings.night_start) : { dayHours: 0, nightHours: 0 }
  const hasNight = split.nightHours > 0
  const overnight = isOvernight(startAt, endAt, split)

  const candidates = useMemo(() => {
    if (!data) return []
    return data.sitters.filter(
      (b) =>
        (!hasNight || b.night_ok) &&
        isAvailable(data.availability.filter((a) => a.babysitter_id === b.id), startAt, endAt),
    )
  }, [data, hasNight, startAt, endAt])

  // Default order: everyone available, alphabetically. The parent reorders / removes.
  const chosen = (order ?? candidates.map((c) => c.id)).filter((id) => candidates.some((c) => c.id === id))
  const notChosen = candidates.filter((c) => !chosen.includes(c.id))
  const sitterById = new Map(data?.sitters.map((b) => [b.id, b]))

  const seatChild = data?.children.find((c) => c.needs_child_seat)
  const noSeat = pickupBy === 'babysitter' && seatChild
    ? chosen.map((id) => sitterById.get(id)!).filter((b) => !b.has_child_seat)
    : []
  const noPickup = pickupBy === 'babysitter'
    ? chosen.map((id) => sitterById.get(id)!).filter((b) => !b.can_pickup)
    : []

  function move(id: string, dir: -1 | 1) {
    const list = [...chosen]
    const i = list.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    setOrder(list)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!data) return
    setBusy(true)
    setSaveError(null)

    const now = new Date()
    const wait = data.settings.default_wait_minutes
    const { data: shift, error: shiftError } = await supabase
      .from('shifts')
      .insert({
        start_at: startAt,
        end_at: endAt,
        merged: hasNight && split.dayHours > 0 ? merged : false,
        pickup_by: pickupBy,
        notes: notes.trim() || null,
        status: chosen.length > 0 ? 'requested' : 'draft',
      })
      .select('id')
      .single()
    if (shiftError || !shift) {
      setBusy(false)
      setSaveError('לא הצלחנו לשמור את המשמרת. נסו שוב.')
      return
    }

    // Requests go out one at a time: the first is sent now, the rest wait in line.
    const requests = chosen.map((babysitter_id, i) => ({
      shift_id: shift.id,
      babysitter_id,
      position: i + 1,
      status: i === 0 ? 'sent' : 'queued',
      sent_at: i === 0 ? now.toISOString() : null,
      deadline_at: i === 0 ? new Date(now.getTime() + wait * 60000).toISOString() : null,
    }))

    // Overnight: the morning tasks come along automatically.
    const allItems: DraftItem[] = [
      ...items.filter((i) => i.description.trim()),
      ...(overnight
        ? data.templates.map((t) => ({ kind: t.kind, description: t.description, child_id: t.child_id }))
        : []),
    ]

    const [reqRes, itemRes] = await Promise.all([
      requests.length ? supabase.from('shift_requests').insert(requests) : Promise.resolve({ error: null }),
      allItems.length
        ? supabase.from('shift_items').insert(allItems.map((i) => ({ ...i, description: i.description.trim(), shift_id: shift.id })))
        : Promise.resolve({ error: null }),
    ])
    setBusy(false)
    navigate(`/shifts/${shift.id}`, {
      replace: true,
      state: reqRes.error || itemRes.error ? { warning: 'המשמרת נשמרה, אבל חלק מהפרטים לא. בדקו אותם כאן.' } : null,
    })
  }

  if (error) return <ErrorText>{error}</ErrorText>
  if (!data) return <Loading />

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <PageHeader title="משמרת חדשה" back="/calendar" />

      <Section title="מתי">
        <Field label="תאריך" htmlFor="date">
          <Input id="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="משעה" htmlFor="start">
            <Input id="start" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="עד שעה" htmlFor="end">
            <Input id="end" type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        {endDate !== date && (
          <p className="text-muted-foreground text-sm">מסתיימת למחרת, {formatDayHeader(endDate)}.</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-day-soft text-day-foreground border-day flex flex-col gap-0.5 rounded-lg border-t-4 p-3">
            <span className="flex items-center gap-1 text-sm font-semibold"><Sun className="size-4" aria-hidden="true" /> יום</span>
            <span className="font-display text-xl font-semibold">{formatHours(split.dayHours)}</span>
          </div>
          <div className="bg-night-soft text-night-foreground border-night flex flex-col gap-0.5 rounded-lg border-t-4 p-3">
            <span className="flex items-center gap-1 text-sm font-semibold"><Moon className="size-4" aria-hidden="true" /> לילה</span>
            <span className="font-display text-xl font-semibold">{formatHours(split.nightHours)}</span>
          </div>
        </div>
        {hasNight && split.dayHours > 0 && (
          <CheckRow
            checked={merged}
            onChange={setMerged}
            label="לאחד למשמרת אחת"
            hint="בלי פיצול לחלק יום וחלק לילה בתשלום"
          />
        )}
        {overnight && data.templates.length > 0 && (
          <p className="text-muted-foreground text-sm">
            משמרת לילה: נוסיף לבד את משימות הבוקר ({data.templates.map((t) => t.description).join(', ')}).
          </p>
        )}
      </Section>

      <Section title="מי אוספת מהגן">
        <Segmented
          label="מי אוספת"
          value={pickupBy}
          onChange={setPickupBy}
          options={[
            { value: 'parent', label: 'הורה' },
            { value: 'babysitter', label: 'בייביסיטר' },
          ]}
        />
        {pickupBy === 'babysitter' && (
          <p className="text-muted-foreground text-sm">הבייביסיטר לא מסיעה לחוגים.</p>
        )}
        {noSeat.length > 0 && seatChild && (
          <WarningBox>
            ל{noSeat.map((b) => b.full_name).join(' ול')} אין כיסא בטיחות. אם היא תאשר, נוסיף למשמרת "{CAR_SEAT_ITEM}".
          </WarningBox>
        )}
        {noPickup.length > 0 && (
          <WarningBox>
            {noPickup.map((b) => b.full_name).join(', ')} לא מסומנת כמי שיכולה לאסוף.
          </WarningBox>
        )}
      </Section>

      <Section title="למי לשלוח, לפי הסדר">
        <p className="text-muted-foreground text-sm">
          רק מי שפנויה בשעות האלה{hasNight ? ' ועושה לילות' : ''}. שולחים לאחת בכל פעם; אם היא לא עונה תוך{' '}
          {data.settings.default_wait_minutes} דקות, אפשר לעבור לבאה.
        </p>
        {candidates.length === 0 && <Empty>אף אחת לא סימנה שהיא פנויה בשעות האלה.</Empty>}
        <ol className="flex flex-col">
          {chosen.map((id, i) => {
            const b = sitterById.get(id)!
            return (
              <li key={id} className="border-muted flex min-h-14 items-center gap-2 border-b py-2 last:border-b-0">
                <span className="font-display text-primary w-5 text-center text-lg font-semibold">{i + 1}</span>
                <Avatar name={b.full_name} path={b.photo_path} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{b.full_name}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {formatRate(b.day_rate_type, b.day_rate)}
                    {hasNight && ` · לילה ${formatRate(b.night_rate_type, b.night_rate)}`}
                  </p>
                </div>
                <button type="button" aria-label={`להקדים את ${b.full_name}`} disabled={i === 0} onClick={() => move(id, -1)} className="flex size-11 items-center justify-center rounded-lg disabled:opacity-30">
                  <ArrowUp className="size-5" />
                </button>
                <button type="button" aria-label={`לאחר את ${b.full_name}`} disabled={i === chosen.length - 1} onClick={() => move(id, 1)} className="flex size-11 items-center justify-center rounded-lg disabled:opacity-30">
                  <ArrowDown className="size-5" />
                </button>
                <button type="button" aria-label={`להוריד את ${b.full_name} מהרשימה`} onClick={() => setOrder(chosen.filter((x) => x !== id))} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
                  <Trash2 className="size-5" />
                </button>
              </li>
            )
          })}
        </ol>
        {notChosen.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {notChosen.map((b) => (
              <TextButton key={b.id} onClick={() => setOrder([...chosen, b.id])}>
                + {b.full_name}
              </TextButton>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="מה להכין / להשאיר"
        action={<TextButton onClick={() => setItems([...items, { kind: 'prepare', description: '', child_id: null }])}>+ פריט</TextButton>}
      >
        {items.length === 0 && <p className="text-muted-foreground text-sm">אפשר להוסיף גם אחר כך.</p>}
        {items.map((item, i) => (
          <div key={i} className="border-muted flex flex-col gap-2 border-b pb-3 last:border-b-0">
            <div className="flex gap-2">
              <Select
                aria-label="סוג"
                value={item.kind}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, kind: e.target.value as ItemKind } : x)))}
                className="w-32 shrink-0"
              >
                {Object.entries(itemKindLabels).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </Select>
              <Select
                aria-label="למי"
                value={item.child_id ?? ''}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, child_id: e.target.value || null } : x)))}
              >
                <option value="">לשתיהן</option>
                {data.children.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <button type="button" aria-label="מחיקת פריט" onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-lg">
                <Trash2 className="size-5" />
              </button>
            </div>
            <Input
              aria-label="מה"
              placeholder="למשל: ארוחת ערב במקרר"
              value={item.description}
              onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
            />
          </div>
        ))}
      </Section>

      <Section title="הערות">
        <Textarea aria-label="הערות" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="משהו שחשוב לדעת" />
      </Section>

      {saveError && <ErrorText>{saveError}</ErrorText>}
      <PrimaryButton type="submit" disabled={busy || endAt <= startAt}>
        {busy ? 'שומרים…' : chosen.length > 0 ? `לשלוח בקשה ל${sitterById.get(chosen[0])!.full_name}` : 'לשמור בלי לשלוח'}
      </PrimaryButton>
      <p className={cn('text-muted-foreground -mt-2 text-center text-sm', chosen.length < 2 && 'hidden')}>
        אם היא לא יכולה, נעבור ל{sitterById.get(chosen[1] ?? '')?.full_name}.
      </p>
    </form>
  )
}
