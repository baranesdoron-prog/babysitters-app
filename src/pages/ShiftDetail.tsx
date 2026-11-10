import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { MessageSquare, Trash2 } from 'lucide-react'

import { Avatar } from '@/components/Avatar'
import { BottomSheet } from '@/components/BottomSheet'
import { SplitBar } from '@/components/SplitBar'
import {
  CallButton,
  ErrorText,
  Field,
  Loading,
  PageHeader,
  Pill,
  PrimaryButton,
  SecondaryButton,
  Section,
  TextButton,
  WarningBox,
} from '@/components/bits'
import { Input, Select } from '@/components/ui/input'
import { fetchSettings } from '@/hooks/useSettings'
import { useLoad } from '@/hooks/useLoad'
import { computeAmount, splitShift } from '@/lib/billing'
import {
  CAR_SEAT_ITEM,
  itemKindLabels,
  pickupLabels,
  requestStatusLabels,
  shiftStatusLabels,
  shiftStatusTone,
} from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { Babysitter, Child, ItemKind, Shift, ShiftItem, ShiftRequest } from '@/lib/types'
import { cn, formatDayHeader, formatMoney, formatTime, localParts } from '@/lib/utils'

type Request = ShiftRequest & { babysitter: Babysitter }

export function ShiftDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const warning = (location.state as { warning?: string } | null)?.warning
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [newItem, setNewItem] = useState<{ kind: ItemKind; description: string; child_id: string }>({
    kind: 'prepare',
    description: '',
    child_id: '',
  })
  const [override, setOverride] = useState<string | null>(null)
  const [addSitter, setAddSitter] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data, error, reload } = useLoad(async () => {
    const [settings, shift, requests, items, children, sitters] = await Promise.all([
      fetchSettings(),
      supabase.from('shifts').select('*').eq('id', id!).single(),
      supabase.from('shift_requests').select('*, babysitter:babysitters(*)').eq('shift_id', id!).order('position'),
      supabase.from('shift_items').select('*').eq('shift_id', id!).order('kind'),
      supabase.from('children').select('*'),
      supabase.from('babysitters').select('*').eq('active', true).order('full_name'),
    ])
    if (shift.error) throw new Error('לא מצאנו את המשמרת.')
    if (requests.error || items.error || children.error || sitters.error) {
      throw new Error('לא הצלחנו לטעון את פרטי המשמרת.')
    }
    return {
      settings,
      shift: shift.data as Shift,
      requests: requests.data as unknown as Request[],
      items: items.data as ShiftItem[],
      children: children.data as Child[],
      sitters: sitters.data as Babysitter[],
    }
  }, [id])

  async function run(action: () => PromiseLike<{ error: unknown }>[] | PromiseLike<{ error: unknown }>, message: string) {
    setBusy(true)
    setActionError(null)
    const result = action()
    const results = await Promise.all(Array.isArray(result) ? result : [result])
    setBusy(false)
    if (results.some((r) => r.error)) setActionError(message)
    reload()
  }

  if (error) return <ErrorText>{error}</ErrorText>
  if (!data) return <Loading />

  const { shift, requests, items, children, settings, sitters } = data
  const split = splitShift(shift.start_at, shift.end_at, settings.night_start)
  const sitter = sitters.find((b) => b.id === shift.babysitter_id) ??
    requests.find((r) => r.babysitter_id === shift.babysitter_id)?.babysitter ?? null
  const current = requests.find((r) => r.status === 'sent')
  const next = requests.find((r) => r.status === 'queued')
  const waitMs = (shift.wait_minutes ?? settings.default_wait_minutes) * 60000
  const reminderMs = (shift.reminder_minutes ?? settings.default_reminder_minutes) * 60000
  const reminderDue = current?.deadline_at && Date.now() >= new Date(current.deadline_at).getTime() - reminderMs
  const computed = sitter ? computeAmount(sitter, split, shift.merged) : null
  const isOpen = shift.status === 'draft' || shift.status === 'requested'
  const ended = new Date(shift.end_at).getTime() < Date.now()
  const startDate = localParts(shift.start_at).date
  const seatChild = children.find((c) => c.needs_child_seat)
  const childName = (cid: string | null) => children.find((c) => c.id === cid)?.name

  function sendTo(requestId: string) {
    const now = new Date()
    return supabase
      .from('shift_requests')
      .update({ status: 'sent', sent_at: now.toISOString(), deadline_at: new Date(now.getTime() + waitMs).toISOString() })
      .eq('id', requestId)
  }

  const remindAgain = () => run(() => sendTo(current!.id), 'לא הצלחנו לעדכן. נסו שוב.')

  const moveToNext = () =>
    run(async () => {
      const skip = await supabase.from('shift_requests').update({ status: 'skipped' }).eq('id', current!.id)
      if (skip.error || !next) return skip
      return sendTo(next.id)
    }, 'לא הצלחנו לעבור לבאה. נסו שוב.')

  const addRequest = () =>
    run(async () => {
      const position = Math.max(0, ...requests.map((r) => r.position)) + 1
      const now = new Date()
      const ins = await supabase.from('shift_requests').insert({
        shift_id: shift.id,
        babysitter_id: addSitter,
        position,
        status: current ? 'queued' : 'sent',
        sent_at: current ? null : now.toISOString(),
        deadline_at: current ? null : new Date(now.getTime() + waitMs).toISOString(),
      })
      if (ins.error) return ins
      setAddSitter('')
      return shift.status === 'draft'
        ? supabase.from('shifts').update({ status: 'requested' }).eq('id', shift.id)
        : ins
    }, 'לא הצלחנו להוסיף אותה. נסו שוב.')

  const cancelShift = () =>
    run(() => [
      supabase.from('shifts').update({ status: 'cancelled' }).eq('id', shift.id),
      supabase.from('shift_requests').update({ status: 'skipped' }).eq('shift_id', shift.id).in('status', ['sent', 'queued']),
    ], 'לא הצלחנו לבטל. נסו שוב.')

  const markDone = () =>
    run(() => supabase.from('shifts').update({ status: 'done', computed_amount: computed }).eq('id', shift.id), 'לא הצלחנו לעדכן. נסו שוב.')

  const saveAmount = () =>
    run(() => {
      setOverride(null)
      const actual = override?.trim() ? Number(override) : null
      return supabase.from('shifts').update({ computed_amount: computed, actual_amount: actual }).eq('id', shift.id)
    }, 'לא הצלחנו לשמור את הסכום.')

  const toggleItem = (item: ShiftItem) =>
    run(() => supabase.from('shift_items').update({ done: !item.done }).eq('id', item.id), 'לא הצלחנו לעדכן את הפריט.')

  const deleteItem = (item: ShiftItem) =>
    run(() => supabase.from('shift_items').delete().eq('id', item.id), 'לא הצלחנו למחוק את הפריט.')

  const addItem = () =>
    run(() => {
      const row = { shift_id: shift.id, kind: newItem.kind, description: newItem.description.trim(), child_id: newItem.child_id || null }
      setNewItem({ ...newItem, description: '' })
      return supabase.from('shift_items').insert(row)
    }, 'לא הצלחנו להוסיף את הפריט.')

  const askedIds = new Set(requests.map((r) => r.babysitter_id))
  const smsBody = encodeURIComponent(
    `היי, יש לנו בקשה למשמרת ב${formatDayHeader(startDate)}, ${formatTime(shift.start_at)}–${formatTime(shift.end_at)}. אפשר לענות באפליקציה.`,
  )

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="משמרת" back={`/calendar?date=${startDate}`} />
      {warning && <WarningBox>{warning}</WarningBox>}

      <Section>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[17px] font-bold">{formatDayHeader(startDate)}</p>
            <p className="text-muted-foreground text-[15px]">
              <span dir="ltr">{formatTime(shift.start_at)}–{formatTime(shift.end_at)}</span>
              {' · '}איסוף: {pickupLabels[shift.pickup_by]}
            </p>
          </div>
          <Pill className={shiftStatusTone[shift.status]}>{shiftStatusLabels[shift.status]}</Pill>
        </div>
        <SplitBar dayHours={split.dayHours} nightHours={split.nightHours} />
        {shift.merged && <p className="text-muted-foreground text-sm">מאוחדת למשמרת אחת בתשלום.</p>}
        {shift.notes && <p className="text-[15px]">{shift.notes}</p>}
      </Section>

      {sitter && shift.status !== 'cancelled' && (
        <Section className="border-primary-soft border">
          <div className="flex items-center gap-3">
            <Avatar name={sitter.full_name} path={sitter.photo_path} size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold">{sitter.full_name}</p>
              <p className="text-muted-foreground text-sm">אישרה את המשמרת</p>
            </div>
            {sitter.phone && <CallButton name={sitter.full_name} phone={sitter.phone} />}
          </div>
          {shift.pickup_by === 'babysitter' && !sitter.has_child_seat && seatChild && (
            <WarningBox>ל{sitter.full_name} אין כיסא בטיחות, אז הוספנו למשמרת "{CAR_SEAT_ITEM}".</WarningBox>
          )}
        </Section>
      )}

      {isOpen && (
        <Section title="בקשות">
          {current && reminderDue && (
            <div className="bg-pending-soft text-pending-foreground flex flex-col gap-3 rounded-lg p-3">
              <p className="text-[15px] font-semibold">
                {current.babysitter.full_name} עוד לא ענתה
                {current.deadline_at && ` (הזמן נגמר ב-${formatTime(current.deadline_at)})`}. מה עושים?
              </p>
              <div className="flex flex-col gap-2">
                <SecondaryButton type="button" disabled={busy} onClick={remindAgain}>להזכיר לה שוב</SecondaryButton>
                {next && (
                  <SecondaryButton type="button" disabled={busy} onClick={moveToNext}>
                    לעבור ל{next.babysitter.full_name}
                  </SecondaryButton>
                )}
              </div>
            </div>
          )}
          <ol className="flex flex-col">
            {requests.map((r) => (
              <li key={r.id} className="border-muted flex min-h-12 items-center gap-2 border-b py-2 last:border-b-0">
                <span className="font-display text-muted-foreground w-5 text-center font-semibold">{r.position}</span>
                <Avatar name={r.babysitter.full_name} path={r.babysitter.photo_path} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{r.babysitter.full_name}</p>
                  {r.status === 'sent' && r.deadline_at && (
                    <p className="text-muted-foreground text-sm">מחכים עד {formatTime(r.deadline_at)}</p>
                  )}
                </div>
                <Pill
                  className={cn(
                    r.status === 'sent' && 'bg-pending-soft text-pending-foreground',
                    r.status === 'accepted' && 'bg-success-soft text-success-foreground',
                    (r.status === 'queued' || r.status === 'declined' || r.status === 'skipped') && 'bg-muted text-muted-foreground',
                  )}
                >
                  {requestStatusLabels[r.status]}
                </Pill>
                {r.status === 'sent' && r.babysitter.phone && (
                  <a
                    href={`sms:${r.babysitter.phone}?&body=${smsBody}`}
                    aria-label={`לשלוח הודעה ל${r.babysitter.full_name}`}
                    className="bg-primary-soft text-primary-strong flex size-11 items-center justify-center rounded-lg"
                  >
                    <MessageSquare className="size-5" />
                  </a>
                )}
              </li>
            ))}
          </ol>
          {current && !reminderDue && next && (
            <TextButton disabled={busy} onClick={moveToNext}>לעבור עכשיו ל{next.babysitter.full_name}</TextButton>
          )}
          {!current && !next && requests.length > 0 && (
            <p className="text-[15px]">אף אחת מהרשימה לא אישרה. אפשר לשלוח לעוד מישהי:</p>
          )}
          <div className="flex gap-2">
            <Select aria-label="להוסיף בייביסיטר" value={addSitter} onChange={(e) => setAddSitter(e.target.value)}>
              <option value="">להוסיף לתור…</option>
              {sitters.filter((b) => !askedIds.has(b.id)).map((b) => (
                <option key={b.id} value={b.id}>{b.full_name}</option>
              ))}
            </Select>
            <SecondaryButton type="button" className="h-12 w-auto shrink-0 px-4 text-[15px]" disabled={!addSitter || busy} onClick={addRequest}>
              הוספה
            </SecondaryButton>
          </div>
        </Section>
      )}

      <Section title="מה להכין / להשאיר">
        {items.length === 0 && <p className="text-muted-foreground text-sm">אין פריטים.</p>}
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id} className="border-muted flex min-h-12 items-center gap-3 border-b last:border-b-0">
              <label className="flex flex-1 items-center gap-3 py-2">
                <input type="checkbox" className="accent-primary size-5 shrink-0" checked={item.done} disabled={busy} onChange={() => toggleItem(item)} />
                <span className={cn('text-[15px]', item.done && 'text-muted-foreground line-through')}>
                  {item.description}
                  <span className="text-muted-foreground text-sm">
                    {' · '}{itemKindLabels[item.kind]}{childName(item.child_id) && ` · ${childName(item.child_id)}`}
                  </span>
                </span>
              </label>
              <button type="button" aria-label={`מחיקת ${item.description}`} onClick={() => deleteItem(item)} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
                <Trash2 className="size-5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Select aria-label="סוג" value={newItem.kind} onChange={(e) => setNewItem({ ...newItem, kind: e.target.value as ItemKind })} className="w-32 shrink-0">
              {Object.entries(itemKindLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </Select>
            <Select aria-label="למי" value={newItem.child_id} onChange={(e) => setNewItem({ ...newItem, child_id: e.target.value })}>
              <option value="">לשתיהן</option>
              {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <Input aria-label="פריט חדש" placeholder="פריט חדש" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
            <TextButton className="shrink-0 px-2" disabled={!newItem.description.trim() || busy} onClick={addItem}>+ פריט</TextButton>
          </div>
        </div>
      </Section>

      {sitter && shift.status !== 'cancelled' && (
        <Section title="תשלום">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground text-[15px]">לפי התעריף שלה</span>
            <span className="font-display text-xl font-semibold">{formatMoney(computed)}</span>
          </div>
          {shift.payment_id ? (
            <Pill className="bg-success-soft text-success-foreground self-start">שולם</Pill>
          ) : (
            <>
              <Field label="סכום אחר (לא חובה)" htmlFor="actual">
                <div className="flex gap-2">
                  <Input
                    id="actual"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    dir="ltr"
                    placeholder={shift.actual_amount != null ? String(shift.actual_amount) : '—'}
                    value={override ?? (shift.actual_amount != null ? String(shift.actual_amount) : '')}
                    onChange={(e) => setOverride(e.target.value)}
                  />
                  <SecondaryButton type="button" className="h-12 w-auto shrink-0 px-4 text-[15px]" disabled={busy || override === null} onClick={saveAmount}>
                    שמירה
                  </SecondaryButton>
                </div>
              </Field>
              <p className="text-muted-foreground text-sm">עזרה בשיעורים לא משולמת בנפרד.</p>
            </>
          )}
        </Section>
      )}

      {actionError && <ErrorText>{actionError}</ErrorText>}

      {shift.status === 'confirmed' && ended && (
        <PrimaryButton type="button" disabled={busy} onClick={markDone}>לסמן שהמשמרת הסתיימה</PrimaryButton>
      )}
      {shift.status !== 'cancelled' && shift.status !== 'done' && !shift.payment_id && (
        <TextButton className="text-destructive self-center" disabled={busy} onClick={() => setConfirmCancel(true)}>
          ביטול המשמרת
        </TextButton>
      )}

      <BottomSheet open={confirmCancel} title="לבטל את המשמרת?" onClose={() => setConfirmCancel(false)}>
        <p className="text-muted-foreground text-[15px]">
          {sitter ? `כדאי גם להודיע ל${sitter.full_name}.` : 'בקשות שעוד לא נענו ייסגרו.'}
        </p>
        <PrimaryButton
          type="button"
          className="bg-destructive"
          disabled={busy}
          onClick={async () => {
            await cancelShift()
            navigate(`/calendar?date=${startDate}`)
          }}
        >
          כן, לבטל
        </PrimaryButton>
        <SecondaryButton type="button" onClick={() => setConfirmCancel(false)}>לא, להשאיר</SecondaryButton>
      </BottomSheet>
    </div>
  )
}
