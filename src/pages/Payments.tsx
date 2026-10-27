import { useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, Smartphone } from 'lucide-react'

import { Avatar } from '@/components/Avatar'
import { BottomSheet } from '@/components/BottomSheet'
import {
  Empty,
  ErrorText,
  Field,
  Loading,
  PageHeader,
  Pill,
  PrimaryButton,
  SecondaryButton,
  Section,
  TextButton,
} from '@/components/bits'
import { Input } from '@/components/ui/input'
import { fetchSettings } from '@/hooks/useSettings'
import { useLoad } from '@/hooks/useLoad'
import { computeAmount, shiftAmount, splitShift } from '@/lib/billing'
import { paymentMethodLabels } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { Babysitter, Payment, PaymentMethod, Shift } from '@/lib/types'
import { formatDayHeader, formatMoney, formatShortDate, formatTime, localParts } from '@/lib/utils'

// No API or redirect back exists for personal Bit / PayBox payments: we copy
// the details, open the app, and ask when the parent comes back.
// Verify these links open the apps on a real phone before shipping.
const PAY_APP_URL: Record<'bit' | 'paybox', string> = {
  bit: 'https://www.bitpay.co.il/app/',
  paybox: 'https://payboxapp.page.link/app',
}

type UnpaidShift = Shift & { babysitter: Babysitter }
type PaymentRow = Payment & { babysitter: { full_name: string } | null }

type Stage =
  | { kind: 'closed' }
  | { kind: 'choose'; sitterId: string }
  | { kind: 'confirm'; sitterId: string; method: PaymentMethod; other: boolean }

export function Payments() {
  const [stage, setStage] = useState<Stage>({ kind: 'closed' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [otherAmount, setOtherAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  // Set only when the parent left for Bit / PayBox from this flow.
  const leftFor = useRef<{ sitterId: string; method: 'bit' | 'paybox' } | null>(null)

  const { data, error, reload } = useLoad(async () => {
    const [settings, unpaid, payments] = await Promise.all([
      fetchSettings(),
      supabase
        .from('shifts')
        .select('*, babysitter:babysitters(*)')
        .in('status', ['confirmed', 'done'])
        .is('payment_id', null)
        .not('babysitter_id', 'is', null)
        .lt('end_at', new Date().toISOString())
        .order('start_at'),
      supabase
        .from('payments')
        .select('*, babysitter:babysitters(full_name)')
        .order('paid_at', { ascending: false })
        .limit(20),
    ])
    if (unpaid.error || payments.error) throw new Error('לא הצלחנו לטעון את התשלומים.')
    // Shifts without a stored amount get one from the babysitter's rates.
    const shifts = (unpaid.data as unknown as UnpaidShift[]).map((s) => ({
      ...s,
      computed_amount: s.computed_amount ?? computeAmount(s.babysitter, splitShift(s.start_at, s.end_at, settings.night_start), s.merged),
    }))
    return { shifts, payments: payments.data as unknown as PaymentRow[] }
  }, [])

  const bySitter = useMemo(() => {
    const map = new Map<string, UnpaidShift[]>()
    for (const s of data?.shifts ?? []) map.set(s.babysitter_id!, [...(map.get(s.babysitter_id!) ?? []), s])
    return map
  }, [data])

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible' || !leftFor.current) return
      const { sitterId, method } = leftFor.current
      leftFor.current = null
      setStage({ kind: 'confirm', sitterId, method, other: false })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  function openFor(sitterId: string) {
    // Always offer all her unpaid shifts together, ticked by default.
    setSelected(new Set((bySitter.get(sitterId) ?? []).map((s) => s.id)))
    setOtherAmount('')
    setActionError(null)
    setStage({ kind: 'choose', sitterId })
  }

  const sitterShifts = stage.kind === 'closed' ? [] : bySitter.get(stage.sitterId) ?? []
  const sitter = sitterShifts[0]?.babysitter
  const chosen = sitterShifts.filter((s) => selected.has(s.id))
  const total = chosen.reduce((sum, s) => sum + shiftAmount(s), 0)

  async function payWithApp(method: 'bit' | 'paybox') {
    if (!sitter) return
    try {
      await navigator.clipboard.writeText(`${sitter.phone ?? ''}\n${total}`)
      setNotice(`הטלפון של ${sitter.full_name} והסכום ${formatMoney(total)} הועתקו.`)
    } catch {
      setNotice(`לא הצלחנו להעתיק. הטלפון: ${sitter.phone ?? '—'}, הסכום: ${formatMoney(total)}.`)
    }
    leftFor.current = { sitterId: sitter.id, method }
    // A new tab keeps this page (and the ref above) alive while the app is open.
    window.open(PAY_APP_URL[method], '_blank', 'noopener')
  }

  async function record(method: PaymentMethod, amount: number | null) {
    setBusy(true)
    setActionError(null)
    const ids = chosen.map((s) => s.id)
    // Store the amounts the payment is based on, then record it atomically.
    const fill = await Promise.all(
      chosen.map((s) => supabase.from('shifts').update({ computed_amount: s.computed_amount }).eq('id', s.id)),
    )
    const { error: payError } = fill.some((r) => r.error)
      ? { error: true }
      : await supabase.rpc('record_payment', { p_shift_ids: ids, p_method: method, p_amount: amount })
    if (!payError) await supabase.from('shifts').update({ status: 'done' }).in('id', ids)
    setBusy(false)
    if (payError) {
      setActionError('לא הצלחנו לסמן ששולם. נסו שוב.')
      return
    }
    setNotice(`סימנו ששילמתם ל${sitter?.full_name} ${formatMoney(amount ?? total)}.`)
    setStage({ kind: 'closed' })
    reload()
  }

  if (error) return <ErrorText>{error}</ErrorText>
  if (!data) return <Loading />

  const grandTotal = data.shifts.reduce((sum, s) => sum + shiftAmount(s), 0)

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="תשלומים" />
      {notice && (
        <p className="bg-success-soft text-success-foreground rounded-lg p-3 text-[15px]" role="status">{notice}</p>
      )}

      <Section title="לתשלום" action={grandTotal > 0 && <span className="font-display text-xl font-semibold">{formatMoney(grandTotal)}</span>}>
        {bySitter.size === 0 && <Empty>הכול שולם. אין חובות פתוחים.</Empty>}
        {[...bySitter.entries()].map(([sitterId, shifts]) => {
          const b = shifts[0].babysitter
          const sum = shifts.reduce((acc, s) => acc + shiftAmount(s), 0)
          return (
            <div key={sitterId} className="border-muted flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-center gap-3">
                <Avatar name={b.full_name} path={b.photo_path} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{b.full_name}</p>
                  <p className="text-muted-foreground text-sm">
                    {shifts.length === 1 ? 'משמרת אחת' : `${shifts.length} משמרות`} ·{' '}
                    {shifts.map((s) => formatShortDate(localParts(s.start_at).date)).join(', ')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-display text-[17px] font-semibold">{formatMoney(sum)}</span>
                  <Pill className="bg-pending-soft text-pending-foreground">לתשלום</Pill>
                </div>
              </div>
              <SecondaryButton type="button" className="h-12 text-[15px]" onClick={() => openFor(sitterId)}>
                לשלם ל{b.full_name}
              </SecondaryButton>
            </div>
          )
        })}
      </Section>

      <Section title="שולם לאחרונה">
        {data.payments.length === 0 && <p className="text-muted-foreground text-sm">עוד לא נרשמו תשלומים.</p>}
        <ul className="flex flex-col">
          {data.payments.map((p) => (
            <li key={p.id} className="border-muted flex min-h-12 items-center gap-2 border-b py-1 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{p.babysitter?.full_name}</p>
                <p className="text-muted-foreground text-sm">
                  {formatShortDate(localParts(p.paid_at).date)} · {paymentMethodLabels[p.method]}
                </p>
              </div>
              <span className="text-[15px] font-semibold">{formatMoney(p.amount)}</span>
              <Pill className="bg-success-soft text-success-foreground">שולם</Pill>
            </li>
          ))}
        </ul>
      </Section>

      <BottomSheet
        open={stage.kind === 'choose' && !!sitter}
        title={`לשלם ל${sitter?.full_name ?? ''}?`}
        onClose={() => setStage({ kind: 'closed' })}
      >
        <ul className="flex flex-col">
          {sitterShifts.map((s) => (
            <li key={s.id}>
              <label className="border-muted flex min-h-12 items-center gap-3 border-b py-2">
                <input
                  type="checkbox"
                  className="accent-primary size-5 shrink-0"
                  checked={selected.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(s.id)
                    else next.delete(s.id)
                    setSelected(next)
                  }}
                />
                <span className="flex-1 text-[15px]">
                  {formatDayHeader(localParts(s.start_at).date)}
                  <span className="text-muted-foreground text-sm"> · <span dir="ltr">{formatTime(s.start_at)}–{formatTime(s.end_at)}</span></span>
                </span>
                <span className="text-[15px] font-semibold">{formatMoney(shiftAmount(s))}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold">סה״כ</span>
          <span className="font-display text-2xl font-semibold">{formatMoney(total)}</span>
        </div>
        {actionError && <ErrorText>{actionError}</ErrorText>}
        <div className="grid grid-cols-2 gap-2">
          <PrimaryButton type="button" disabled={!chosen.length || busy} onClick={() => payWithApp('bit')}>
            <Smartphone className="size-5" /> ביט
          </PrimaryButton>
          <SecondaryButton type="button" disabled={!chosen.length || busy} onClick={() => payWithApp('paybox')}>
            <Smartphone className="size-5" /> פייבוקס
          </SecondaryButton>
        </div>
        <SecondaryButton type="button" disabled={!chosen.length || busy} onClick={() => record('cash', null)}>
          <Banknote className="size-5" /> שילמתי במזומן
        </SecondaryButton>
        <TextButton className="self-center" disabled={!chosen.length || busy} onClick={() => record('transfer', null)}>
          שילמתי בהעברה בנקאית
        </TextButton>
      </BottomSheet>

      <BottomSheet
        open={stage.kind === 'confirm' && !!sitter}
        title={`שילמתם ל${sitter?.full_name ?? ''} ${formatMoney(total)}?`}
        onClose={() => setStage({ kind: 'closed' })}
      >
        {stage.kind === 'confirm' && (
          <>
            <p className="text-muted-foreground text-[15px]">דרך {paymentMethodLabels[stage.method]}. הסימון ידני — רק אתם יודעים אם זה עבר.</p>
            {actionError && <ErrorText>{actionError}</ErrorText>}
            {stage.other ? (
              <>
                <Field label="כמה שילמתם (₪)" htmlFor="otherAmount">
                  <Input id="otherAmount" type="number" inputMode="decimal" min={0} step="any" dir="ltr" value={otherAmount} onChange={(e) => setOtherAmount(e.target.value)} />
                </Field>
                <PrimaryButton type="button" disabled={busy || otherAmount === ''} onClick={() => record(stage.method, Number(otherAmount))}>
                  לסמן ששולם
                </PrimaryButton>
              </>
            ) : (
              <>
                <PrimaryButton type="button" disabled={busy} onClick={() => record(stage.method, null)}>כן, לסמן ששולם</PrimaryButton>
                <SecondaryButton type="button" disabled={busy} onClick={() => setStage({ ...stage, other: true })}>שילמתי סכום אחר</SecondaryButton>
              </>
            )}
            <TextButton className="self-center" onClick={() => setStage({ kind: 'closed' })}>עוד לא</TextButton>
          </>
        )}
      </BottomSheet>
    </div>
  )
}
