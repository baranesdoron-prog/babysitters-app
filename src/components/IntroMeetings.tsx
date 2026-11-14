import { useState } from 'react'
import { CalendarCheck, CheckCircle2, X } from 'lucide-react'

import { BottomSheet } from '@/components/BottomSheet'
import { WhatsAppButton } from '@/components/WhatsAppButton'
import { introText, type FamilyForIntro } from '@/lib/whatsapp'
import { DateInput } from '@/components/DateInput'
import { ErrorText, Field, Loading, PrimaryButton, SecondaryButton, Section, TextButton } from '@/components/bits'
import { Input } from '@/components/ui/input'
import { useLoad } from '@/hooks/useLoad'
import { supabase } from '@/lib/supabase'
import type { IntroMeeting } from '@/lib/types'
import { formatDayHeader, formatShortDate, formatTime, localParts, todayKey, zonedToIso } from '@/lib/utils'

/**
 * Introduction meetings with a babysitter my family didn't add itself. She
 * can't be booked until a meeting has taken place and we confirm "we met"
 * (confirm_met_babysitter(); the database enforces both).
 */
export function IntroMeetings({ babysitterId, name, phone, addedBy, metAt, contact, onConfirmed }: {
  babysitterId: string
  name: string
  /** Her phone, for the WhatsApp introduction message. */
  phone: string | null
  /** The parent who added her to the app ("קיבלתי את המספר שלך מ…"). */
  addedBy: string | null
  metAt: string | null
  /** Who she'll meet — prefilled from my profile. */
  contact: { name: string; phone: string | null }
  onConfirmed: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(todayKey())
  const [time, setTime] = useState('18:00')
  const [place, setPlace] = useState('')
  const [contactName, setContactName] = useState(contact.name)
  const [contactPhone, setContactPhone] = useState(contact.phone ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const { data, error, reload } = useLoad(async () => {
    const [res, kids, parents] = await Promise.all([
      supabase.from('intro_meetings').select('*').eq('babysitter_id', babysitterId).order('start_at'),
      // Our family, for the introduction message.
      supabase.from('children').select('name, birth_date, gender').order('birth_date'),
      supabase.from('app_users').select('first_name, full_name').eq('role', 'parent').order('created_at'),
    ])
    if (res.error) throw new Error('לא הצלחנו לטעון את הפגישות.')
    const myFirst = contact.name.split(' ')[0]
    const parentNames = ((parents.data ?? []) as { first_name: string | null; full_name: string | null }[])
      .map((p) => (p.first_name || p.full_name || '').split(' ')[0])
      .filter(Boolean)
      .sort((a, b) => Number(b === myFirst) - Number(a === myFirst))
    return {
      meetings: res.data as IntroMeeting[],
      family: { parents: parentNames, kids: (kids.data ?? []) as FamilyForIntro['kids'] },
    }
  }, [babysitterId])
  const meetings = data?.meetings

  if (metAt) {
    return (
      <Section title="פגישת היכרות">
        <p className="text-success-foreground flex items-center gap-2 text-[15px]">
          <CheckCircle2 className="size-5" aria-hidden="true" />
          נפגשתם ב-{formatShortDate(localParts(metAt).date)}. אפשר לקבוע איתה משמרות.
        </p>
      </Section>
    )
  }

  const now = Date.now()
  const live = meetings?.filter((m) => !m.cancelled) ?? []
  const happened = live.some((m) => new Date(m.start_at).getTime() <= now)

  async function add() {
    setBusy(true)
    setErr(null)
    const { error: insertError } = await supabase.from('intro_meetings').insert({
      babysitter_id: babysitterId,
      start_at: zonedToIso(date, time),
      place: place.trim() || null,
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
    })
    setBusy(false)
    if (insertError) {
      setErr('לא הצלחנו לקבוע את הפגישה. נסו שוב.')
      return
    }
    setAdding(false)
    setPlace('')
    reload()
  }

  async function cancel(m: IntroMeeting) {
    const { error: updateError } = await supabase.from('intro_meetings').update({ cancelled: true }).eq('id', m.id)
    if (updateError) setErr('לא הצלחנו לבטל. נסו שוב.')
    reload()
  }

  async function confirm() {
    setBusy(true)
    setErr(null)
    const { error: rpcError } = await supabase.rpc('confirm_met_babysitter', { p_babysitter: babysitterId })
    setBusy(false)
    setConfirming(false)
    if (rpcError) {
      setErr('אפשר לאשר רק אחרי שפגישה כבר התקיימה.')
      return
    }
    onConfirmed()
  }

  return (
    <Section title="פגישת היכרות" action={<CalendarCheck className="text-muted-foreground size-5" aria-hidden="true" />}>
      <p className="bg-pending-soft text-pending-foreground rounded-lg p-3 text-[15px]">
        לפני שקובעים איתה משמרות, נפגשים איתה פעם אחת או יותר. אחרי שהפגישה התקיימה, מאשרים כאן שנפגשתם.
      </p>
      {data && (
        <WhatsAppButton phone={phone} text={introText(name, contact.name, addedBy, data.family)} label="הודעת היכרות בוואטסאפ" />
      )}
      {error && <ErrorText>{error}</ErrorText>}
      {!meetings && !error && <Loading />}
      {live.length > 0 && (
        <ul className="flex flex-col">
          {live.map((m) => {
            const past = new Date(m.start_at).getTime() <= now
            return (
              <li key={m.id} className="border-muted flex min-h-12 items-center gap-2 border-b py-2 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">
                    {formatDayHeader(localParts(m.start_at).date)} · {formatTime(m.start_at)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {[m.place, past ? 'התקיימה' : 'מתוכננת'].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {!past && (
                  <button type="button" aria-label="ביטול הפגישה" onClick={() => cancel(m)} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
                    <X className="size-5" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="תאריך" htmlFor="meetDate">
              <DateInput id="meetDate" value={date} onChange={setDate} />
            </Field>
            <Field label="שעה" htmlFor="meetTime">
              <Input id="meetTime" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label="איפה" htmlFor="meetPlace">
            <Input id="meetPlace" placeholder="למשל: אצלנו בבית" value={place} onChange={(e) => setPlace(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="היא תפגוש את" htmlFor="meetContact">
              <Input id="meetContact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="טלפון" htmlFor="meetPhone">
              <Input id="meetPhone" type="tel" dir="ltr" inputMode="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </Field>
          </div>
          <p className="text-muted-foreground text-sm">{name} תראה את הפגישה באפליקציה שלה, עם הפרטים האלה.</p>
          <SecondaryButton type="button" className="h-12 text-[15px]" disabled={busy || !date || !time} onClick={add}>
            {busy ? 'קובעים…' : 'קביעת הפגישה'}
          </SecondaryButton>
        </div>
      ) : (
        <TextButton onClick={() => setAdding(true)}>{live.length ? '+ עוד פגישה' : '+ קביעת פגישת היכרות'}</TextButton>
      )}

      {err && <ErrorText>{err}</ErrorText>}
      <SecondaryButton type="button" disabled={!happened || busy} onClick={() => setConfirming(true)}>
        <CheckCircle2 className="size-5" aria-hidden="true" /> נפגשנו, אפשר לקבוע איתה משמרות
      </SecondaryButton>
      {!happened && <p className="text-muted-foreground -mt-1 text-center text-sm">אפשר לאשר אחרי שפגישה התקיימה.</p>}

      <BottomSheet open={confirming} title={`נפגשתם עם ${name}?`} onClose={() => setConfirming(false)}>
        <p className="text-muted-foreground text-[15px]">אחרי האישור היא תופיע כשקובעים משמרת, ואפשר יהיה לשלוח לה בקשות.</p>
        <PrimaryButton type="button" disabled={busy} onClick={confirm}>כן, נפגשנו</PrimaryButton>
        <SecondaryButton type="button" onClick={() => setConfirming(false)}>עוד לא</SecondaryButton>
      </BottomSheet>
    </Section>
  )
}
