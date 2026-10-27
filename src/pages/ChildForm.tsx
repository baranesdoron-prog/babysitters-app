import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'

import { AvatarPicker } from '@/components/Avatar'
import { Segmented } from '@/components/Segmented'
import {
  CallButton,
  CheckRow,
  ErrorText,
  Field,
  Loading,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  Section,
  TextButton,
} from '@/components/bits'
import { Input, Select, Textarea } from '@/components/ui/input'
import { useLoad } from '@/hooks/useLoad'
import { contactKindLabels, weekdayLong } from '@/lib/labels'
import { uploadPhoto } from '@/lib/photos'
import { supabase } from '@/lib/supabase'
import type { Activity, Child, Contact, ContactKind, FrameworkType, SchoolSchedule } from '@/lib/types'
import { trimTime } from '@/lib/utils'

type Draft = {
  name: string
  birth_date: string
  allergies: string
  bedtime: string
  framework_type: FrameworkType
  framework_name: string
  needs_child_seat: boolean
  notes: string
  photo_path: string | null
}

const EMPTY: Draft = {
  name: '',
  birth_date: '',
  allergies: '',
  bedtime: '',
  framework_type: 'kindergarten',
  framework_name: '',
  needs_child_seat: false,
  notes: '',
  photo_path: null,
}

export function ChildForm() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data, error, reload } = useLoad(async () => {
    if (isNew) return null
    const [child, schedule, contacts, activities, login] = await Promise.all([
      supabase.from('children').select('*').eq('id', id!).single(),
      supabase.from('school_schedule').select('*').eq('child_id', id!).order('weekday'),
      supabase.from('contacts').select('*').eq('child_id', id!).order('name'),
      supabase.from('activities').select('*').eq('child_id', id!).order('weekday'),
      supabase.from('app_users').select('email').eq('child_id', id!).maybeSingle(),
    ])
    if (child.error) throw new Error('לא מצאנו אותה.')
    if (schedule.error || contacts.error || activities.error) throw new Error('לא הצלחנו לטעון את הפרטים.')
    return {
      child: child.data as Child,
      schedule: schedule.data as SchoolSchedule[],
      contacts: contacts.data as Contact[],
      activities: activities.data as Activity[],
      loginEmail: (login.data?.email as string | undefined) ?? null,
    }
  }, [id])

  useEffect(() => {
    const c = data?.child
    if (!c) return
    setDraft({
      name: c.name,
      birth_date: c.birth_date ?? '',
      allergies: c.allergies ?? '',
      bedtime: trimTime(c.bedtime),
      framework_type: c.framework_type ?? 'kindergarten',
      framework_name: c.framework_name ?? '',
      needs_child_seat: c.needs_child_seat,
      notes: c.notes ?? '',
      photo_path: c.photo_path,
    })
  }, [data?.child])

  if (error) return <ErrorText>{error}</ErrorText>
  if (!draft) return <Loading />

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setSaveError(null)
    const row = {
      name: draft!.name.trim(),
      birth_date: draft!.birth_date || null,
      allergies: draft!.allergies.trim() || null,
      bedtime: draft!.bedtime || null,
      framework_type: draft!.framework_type,
      framework_name: draft!.framework_name.trim() || null,
      needs_child_seat: draft!.needs_child_seat,
      notes: draft!.notes.trim() || null,
    }
    const res = isNew
      ? await supabase.from('children').insert(row).select('id').single()
      : await supabase.from('children').update(row).eq('id', id!).select('id').single()
    setBusy(false)
    if (res.error) {
      setSaveError('לא הצלחנו לשמור. נסו שוב.')
      return
    }
    navigate(isNew ? `/children/${res.data.id}` : '/children', { replace: isNew })
  }

  async function onPhoto(file: File) {
    const path = await uploadPhoto('children', id!, file)
    const { error: updateError } = await supabase.from('children').update({ photo_path: path }).eq('id', id!)
    if (updateError) throw updateError
    setDraft((d) => (d ? { ...d, photo_path: path } : d))
  }

  return (
    <div className="flex flex-col gap-3.5">
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <PageHeader title={isNew ? 'ילדה חדשה' : draft.name || 'ילדה'} back="/children" />

        <Section>
          {isNew ? (
            <p className="text-muted-foreground text-sm">אחרי השמירה אפשר להוסיף תמונה, לוח זמנים ואנשי קשר.</p>
          ) : (
            <AvatarPicker name={draft.name} path={draft.photo_path} tone="child" onPick={onPhoto} />
          )}
          <Field label="שם" htmlFor="name">
            <Input id="name" required value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="תאריך לידה" htmlFor="birth">
              <Input id="birth" type="date" value={draft.birth_date} onChange={(e) => set('birth_date', e.target.value)} />
            </Field>
            <Field label="שעת שינה" htmlFor="bedtime">
              <Input id="bedtime" type="time" value={draft.bedtime} onChange={(e) => set('bedtime', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="מסגרת">
          <Segmented
            label="מסגרת"
            value={draft.framework_type}
            onChange={(v) => set('framework_type', v)}
            options={[
              { value: 'kindergarten', label: 'גן' },
              { value: 'school', label: 'בית ספר' },
            ]}
          />
          <Field label="שם המסגרת" htmlFor="framework">
            <Input id="framework" value={draft.framework_name} onChange={(e) => set('framework_name', e.target.value)} />
          </Field>
          <CheckRow checked={draft.needs_child_seat} onChange={(v) => set('needs_child_seat', v)} label="צריכה כיסא בטיחות באוטו" />
        </Section>

        <Section title="חשוב לדעת">
          <Field label="אלרגיות" htmlFor="allergies">
            <Input id="allergies" value={draft.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="אין" />
          </Field>
          <Field label="הערות" htmlFor="notes">
            <Textarea id="notes" value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </Section>

        {saveError && <ErrorText>{saveError}</ErrorText>}
        <PrimaryButton type="submit" disabled={busy}>{busy ? 'שומרים…' : 'שמירה'}</PrimaryButton>
      </form>

      {data && (
        <>
          <ScheduleSection childId={data.child.id} rows={data.schedule} onChange={reload} />
          <ActivitiesSection childId={data.child.id} rows={data.activities} onChange={reload} />
          <ContactsSection childId={data.child.id} rows={data.contacts} onChange={reload} />
          <LoginSection childId={data.child.id} loginEmail={data.loginEmail} onChange={reload} />
        </>
      )}
    </div>
  )
}

/** When she finishes kindergarten / school each day, and where she is collected. */
function ScheduleSection({ childId, rows, onChange }: { childId: string; rows: SchoolSchedule[]; onChange: () => void }) {
  const [weekday, setWeekday] = useState('0')
  const [endTime, setEndTime] = useState('16:00')
  const [place, setPlace] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    setErr(null)
    const { error } = await supabase
      .from('school_schedule')
      .upsert(
        { child_id: childId, weekday: Number(weekday), end_time: endTime, pickup_location: place.trim() || null },
        { onConflict: 'child_id,weekday' },
      )
    if (error) setErr('לא הצלחנו לשמור את היום.')
    onChange()
  }

  async function remove(row: SchoolSchedule) {
    const { error } = await supabase.from('school_schedule').delete().eq('id', row.id)
    if (error) setErr('לא הצלחנו למחוק.')
    onChange()
  }

  return (
    <Section title="שעות סיום ואיסוף">
      {rows.length === 0 && <p className="text-muted-foreground text-sm">עוד לא הוגדרו ימים.</p>}
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.id} className="border-muted flex min-h-12 items-center gap-2 border-b last:border-b-0">
            <span className="w-16 shrink-0 text-[15px] font-semibold">{weekdayLong[r.weekday]}</span>
            <span className="flex-1 text-[15px]">
              {trimTime(r.end_time)}
              {r.pickup_location && <span className="text-muted-foreground"> · {r.pickup_location}</span>}
            </span>
            <button type="button" aria-label={`מחיקת יום ${weekdayLong[r.weekday]}`} onClick={() => remove(r)} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
              <Trash2 className="size-5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label="יום" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
          {weekdayLong.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </Select>
        <Input aria-label="שעת סיום" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
      </div>
      <Input aria-label="מקום איסוף" placeholder="מקום איסוף" value={place} onChange={(e) => setPlace(e.target.value)} />
      <TextButton onClick={add}>+ הוספה / עדכון יום</TextButton>
      {err && <ErrorText>{err}</ErrorText>}
    </Section>
  )
}

function ActivitiesSection({ childId, rows, onChange }: { childId: string; rows: Activity[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const [weekday, setWeekday] = useState('0')
  const [start, setStart] = useState('17:00')
  const [driver, setDriver] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    setErr(null)
    const { error } = await supabase.from('activities').insert({
      child_id: childId,
      name: name.trim(),
      weekday: Number(weekday),
      start_time: start,
      driver: driver.trim() || null,
    })
    if (error) setErr('לא הצלחנו להוסיף את החוג.')
    else setName('')
    onChange()
  }

  async function remove(row: Activity) {
    const { error } = await supabase.from('activities').delete().eq('id', row.id)
    if (error) setErr('לא הצלחנו למחוק.')
    onChange()
  }

  return (
    <Section title="חוגים">
      <p className="text-muted-foreground text-sm">הבייביסיטר לא מסיעה לחוגים — רשמו מי לוקח.</p>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.id} className="border-muted flex min-h-12 items-center gap-2 border-b last:border-b-0">
            <span className="flex-1 text-[15px]">
              <span className="font-semibold">{r.name}</span> · {weekdayLong[r.weekday]} {trimTime(r.start_time)}
              {r.driver && <span className="text-muted-foreground"> · לוקח/ת: {r.driver}</span>}
            </span>
            <button type="button" aria-label={`מחיקת ${r.name}`} onClick={() => remove(r)} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
              <Trash2 className="size-5" />
            </button>
          </li>
        ))}
      </ul>
      <Input aria-label="שם החוג" placeholder="שם החוג" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label="יום" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
          {weekdayLong.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </Select>
        <Input aria-label="שעה" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <Input aria-label="מי לוקח" placeholder="מי לוקח" value={driver} onChange={(e) => setDriver(e.target.value)} />
      <TextButton onClick={add} disabled={!name.trim()}>+ חוג</TextButton>
      {err && <ErrorText>{err}</ErrorText>}
    </Section>
  )
}

function ContactsSection({ childId, rows, onChange }: { childId: string; rows: Contact[]; onChange: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [kind, setKind] = useState<ContactKind>('friend_parent')
  const [err, setErr] = useState<string | null>(null)

  async function add() {
    setErr(null)
    const { error } = await supabase.from('contacts').insert({ child_id: childId, name: name.trim(), phone: phone.trim(), kind })
    if (error) setErr('לא הצלחנו להוסיף את איש הקשר.')
    else {
      setName('')
      setPhone('')
    }
    onChange()
  }

  async function remove(row: Contact) {
    const { error } = await supabase.from('contacts').delete().eq('id', row.id)
    if (error) setErr('לא הצלחנו למחוק.')
    onChange()
  }

  return (
    <Section title="אנשי קשר">
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.id} className="border-muted flex min-h-12 items-center gap-2 border-b py-1 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{r.name}</p>
              <p className="text-muted-foreground text-sm">{contactKindLabels[r.kind]} · <span dir="ltr">{r.phone}</span></p>
            </div>
            <CallButton name={r.name} phone={r.phone} />
            <button type="button" aria-label={`מחיקת ${r.name}`} onClick={() => remove(r)} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
              <Trash2 className="size-5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Input aria-label="שם" placeholder="שם" value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="טלפון" placeholder="טלפון" type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <Select aria-label="קשר" value={kind} onChange={(e) => setKind(e.target.value as ContactKind)}>
        {Object.entries(contactKindLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </Select>
      <TextButton onClick={add} disabled={!name.trim() || !phone.trim()}>+ איש קשר</TextButton>
      {err && <ErrorText>{err}</ErrorText>}
    </Section>
  )
}

/** A username + password login for her own "who's with me today" screen. */
function LoginSection({ childId, loginEmail, onChange }: { childId: string; loginEmail: string | null; onChange: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (loginEmail) {
    return (
      <Section title="כניסה שלה לאפליקציה">
        <p className="text-[15px]">
          שם משתמש: <span dir="ltr" className="font-semibold">{loginEmail.split('@')[0]}</span>
        </p>
        <p className="text-muted-foreground text-sm">היא נכנסת דרך "כניסת ילדים" ורואה רק מי איתה ומתי.</p>
      </Section>
    )
  }

  async function create() {
    setBusy(true)
    setErr(null)
    const { error } = await supabase.functions.invoke('create-child-login', {
      body: { child_id: childId, username: username.trim().toLowerCase(), password },
    })
    setBusy(false)
    if (error) {
      setErr('לא הצלחנו ליצור כניסה. אולי שם המשתמש תפוס?')
      return
    }
    onChange()
  }

  const valid = /^[a-z0-9._-]{3,30}$/.test(username.trim().toLowerCase()) && password.length >= 6

  return (
    <Section title="כניסה שלה לאפליקציה">
      <p className="text-muted-foreground text-sm">בלי אימייל: שם משתמש באנגלית וסיסמה. היא תראה רק מי איתה ומתי.</p>
      <Field label="שם משתמש" htmlFor="username" hint="אותיות באנגלית ומספרים, לפחות 3">
        <Input id="username" dir="ltr" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <Field label="סיסמה" htmlFor="password" hint="לפחות 6 תווים">
        <Input id="password" dir="ltr" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {err && <ErrorText>{err}</ErrorText>}
      <SecondaryButton type="button" disabled={!valid || busy} onClick={create}>
        {busy ? 'יוצרים…' : 'ליצור כניסה'}
      </SecondaryButton>
    </Section>
  )
}
