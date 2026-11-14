import { useEffect, useState, type FormEvent } from 'react'

import { AvatarPicker } from '@/components/Avatar'
import { PasswordForm } from '@/components/PasswordForm'
import { ErrorText, Field, Loading, PageHeader, SecondaryButton, Section } from '@/components/bits'
import { Input } from '@/components/ui/input'
import { useLoad } from '@/hooks/useLoad'
import { usernameOf } from '@/lib/auth'
import { uploadPhoto } from '@/lib/photos'
import { supabase } from '@/lib/supabase'
import type { AppUser, Babysitter } from '@/lib/types'
import { detailsRow } from '@/lib/people'
import { ParentDetailsFields } from './ParentForm'
import { RatingBadge, Stars } from '@/components/Rating'
import { fetchBabysitterRatings, fetchFamilyRatings, type ShiftRating } from '@/lib/ratings'
import { formatShortDate, localParts } from '@/lib/utils'

// "הפרופיל שלי": your own details and password. Parents edit their app_users
// row directly; a babysitter goes through update_my_babysitter_profile().
export function Profile({ user, onChange }: { user: AppUser; onChange: () => void }) {
  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="הפרופיל שלי" />
      {user.role === 'babysitter' ? <BabysitterDetails user={user} /> : <ParentDetails user={user} onChange={onChange} />}
      <Section title="שם משתמש">
        <p className="text-[15px] font-semibold"><span dir="ltr">{usernameOf(user.email) ?? user.email}</span></p>
        <p className="text-muted-foreground text-sm">
          {user.role === 'babysitter' ? 'רוצה לשנות? בקשי מההורים.' : 'אפשר לשנות דרך הורה אחר, במסך "הורים".'}
        </p>
      </Section>
      <RatingsReceived user={user} />
      <PasswordSection />
    </div>
  )
}

function ParentDetails({ user, onChange }: { user: AppUser; onChange: () => void }) {
  const [details, setDetails] = useState({
    first_name: user.first_name ?? user.full_name ?? '',
    last_name: user.last_name ?? '',
    workplace: user.workplace ?? '',
    phone: user.phone ?? '',
  })
  const [photo, setPhoto] = useState(user.photo_path)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setSaved(false)
    const { error } = await supabase.from('app_users').update(detailsRow(details)).eq('id', user.id)
    setBusy(false)
    if (error) setErr('לא הצלחנו לשמור. נסו שוב.')
    else {
      setSaved(true)
      onChange()
    }
  }

  async function onPhoto(file: File) {
    const path = await uploadPhoto('parents', user.id, file)
    const { error } = await supabase.from('app_users').update({ photo_path: path }).eq('id', user.id)
    if (error) throw error
    setPhoto(path)
  }

  const name = `${details.first_name} ${details.last_name}`.trim()
  return (
    <form onSubmit={onSubmit}>
      <Section title="הפרטים שלי">
        <AvatarPicker name={name} path={photo} tone="babysitter-alt" onPick={onPhoto} />
        <ParentDetailsFields value={details} onChange={(d) => { setDetails(d); setSaved(false) }} />
        {err && <ErrorText>{err}</ErrorText>}
        {saved && <p className="text-success-foreground text-[15px]" role="status">נשמר.</p>}
        <SecondaryButton type="submit" disabled={busy || !details.first_name.trim() || !details.last_name.trim()}>
          {busy ? 'שומרים…' : 'שמירת הפרטים'}
        </SecondaryButton>
      </Section>
    </form>
  )
}

function BabysitterDetails({ user }: { user: AppUser }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const { data: me, error } = useLoad(async () => {
    const res = await supabase.from('babysitters').select('*').eq('id', user.babysitter_id!).single()
    if (res.error) throw new Error('לא הצלחנו לטעון את הפרטים שלך.')
    return res.data as Babysitter
  }, [user.babysitter_id])

  useEffect(() => {
    if (!me) return
    setFullName(me.full_name)
    setPhone(me.phone ?? '')
    setPhoto(me.photo_path)
  }, [me])

  if (error) return <ErrorText>{error}</ErrorText>
  if (!me) return <Loading />

  async function save(photoPath: string | null = null) {
    const { error: rpcError } = await supabase.rpc('update_my_babysitter_profile', {
      p_full_name: fullName,
      p_phone: phone,
      p_photo_path: photoPath,
    })
    return rpcError
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setSaved(false)
    const rpcError = await save()
    setBusy(false)
    if (rpcError) setErr('לא הצלחנו לשמור. נסי שוב.')
    else setSaved(true)
  }

  async function onPhoto(file: File) {
    const path = await uploadPhoto('babysitters', me!.id, file)
    const rpcError = await save(path)
    if (rpcError) throw rpcError
    setPhoto(path)
  }

  return (
    <form onSubmit={onSubmit}>
      <Section title="הפרטים שלי">
        <AvatarPicker name={fullName} path={photo} onPick={onPhoto} />
        <Field label="שם" htmlFor="fullName">
          <Input id="fullName" required autoComplete="name" value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false) }} />
        </Field>
        <Field label="טלפון נייד" htmlFor="phone">
          <Input id="phone" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setSaved(false) }} />
        </Field>
        {err && <ErrorText>{err}</ErrorText>}
        {saved && <p className="text-success-foreground text-[15px]" role="status">נשמר.</p>}
        <SecondaryButton type="submit" disabled={busy || !fullName.trim()}>{busy ? 'שומרים…' : 'שמירת הפרטים'}</SecondaryButton>
      </Section>
    </form>
  )
}

function PasswordSection() {
  const [done, setDone] = useState(false)
  return (
    <Section title="שינוי סיסמה">
      {done && <p className="text-success-foreground text-[15px]" role="status">הסיסמה שונתה.</p>}
      <PasswordForm submitLabel="לשנות סיסמה" onDone={() => setDone(true)} />
    </Section>
  )
}

/**
 * Ratings I received: for a parent, what babysitters said about the family;
 * for a babysitter, what families said about her. RLS shows only these.
 */
function RatingsReceived({ user }: { user: AppUser }) {
  const isSitter = user.role === 'babysitter'
  const { data, error } = useLoad(async () => {
    const [rows, summary] = await Promise.all([
      supabase
        .from('shift_ratings')
        .select('*, babysitter:babysitters(full_name)')
        .eq('rater', isSitter ? 'family' : 'babysitter')
        .order('created_at', { ascending: false })
        .limit(30),
      isSitter
        ? fetchBabysitterRatings([user.babysitter_id!]).then((m) => m.get(user.babysitter_id!))
        : fetchFamilyRatings([user.family_id!]).then((m) => m.get(user.family_id!)),
    ])
    if (rows.error) throw new Error('לא הצלחנו לטעון את הדירוגים.')
    return { rows: rows.data as (ShiftRating & { babysitter: { full_name: string } | null })[], summary }
  }, [user.id])

  return (
    <Section title={isSitter ? 'הדירוגים שלי' : 'איך הבייביסיטריות דירגו אותנו'} action={<RatingBadge summary={data?.summary} />}>
      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error && <Loading />}
      {data?.rows.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {isSitter ? 'עוד אין דירוגים. משפחות מדרגות אחרי שמשמרת מסתיימת.' : 'עוד אין דירוגים. בייביסיטריות מדרגות אחרי שמשמרת מסתיימת.'}
        </p>
      )}
      <ul className="flex flex-col">
        {data?.rows.map((r) => (
          <li key={r.id} className="border-muted flex flex-col gap-1 border-b py-2 last:border-b-0">
            <div className="flex items-center gap-2">
              <Stars value={r.stars} />
              <span className="text-muted-foreground text-sm">
                {formatShortDate(localParts(r.created_at).date)}
                {!isSitter && r.babysitter && ` · ${r.babysitter.full_name}`}
              </span>
            </div>
            {r.comment && <p className="text-[15px]">{r.comment}</p>}
          </li>
        ))}
      </ul>
    </Section>
  )
}
