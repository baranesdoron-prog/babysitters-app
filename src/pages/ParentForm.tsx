import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'

import { ErrorText, Field, Loading, PageHeader, PrimaryButton, SecondaryButton, Section } from '@/components/bits'
import { Input } from '@/components/ui/input'
import { APP_USER_COLUMNS } from '@/hooks/useAppUser'
import { useLoad } from '@/hooks/useLoad'
import { MIN_PASSWORD_LENGTH, normalizeUsername, USERNAME_RE, usernameOf } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/lib/types'
import { detailsRow, displayName, type ParentDetails } from '@/lib/people'

type Details = ParentDetails
const EMPTY: Details = { first_name: '', last_name: '', workplace: '', phone: '' }

/** A Hebrew message for a manage-login failure (it answers with { code }). */
async function functionError(error: unknown) {
  if (!(error instanceof FunctionsHttpError)) return 'לא הצלחנו לשמור. נסו שוב.'
  const body = await error.context.json().catch(() => null) as { code?: string } | null
  if (body?.code === 'family_full') return 'במשפחה כבר יש שני הורים. אי אפשר להוסיף הורה נוסף.'
  if (error.context.status === 422 || body?.code === 'email_exists') return 'שם המשתמש הזה כבר תפוס. נסו שם אחר.'
  return 'לא הצלחנו לשמור. נסו שוב.'
}

/** The name / workplace / phone fields, shared by "add a parent" and "my profile". */
export function ParentDetailsFields({ value, onChange }: { value: Details; onChange: (v: Details) => void }) {
  const set = (key: keyof Details) => (e: ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value })
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="שם פרטי" htmlFor="firstName">
          <Input id="firstName" required autoComplete="given-name" value={value.first_name} onChange={set('first_name')} />
        </Field>
        <Field label="שם משפחה" htmlFor="lastName">
          <Input id="lastName" required autoComplete="family-name" value={value.last_name} onChange={set('last_name')} />
        </Field>
      </div>
      <Field label="מקום עבודה" htmlFor="workplace">
        <Input id="workplace" autoComplete="organization" value={value.workplace} onChange={set('workplace')} />
      </Field>
      <Field label="טלפון נייד" htmlFor="phone">
        <Input id="phone" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" value={value.phone} onChange={set('phone')} />
      </Field>
    </>
  )
}

export function ParentForm({ myId }: { myId: string }) {
  const { id } = useParams<{ id: string }>()
  if (!id || id === 'new') return <NewParentForm title="הוספת הורה" back="/parents" doneTo="/parents" />
  if (id === myId) return <Navigate to="/profile" replace />
  return <EditParent id={id} />
}

/**
 * Add a parent: details, username and an initial password they'll replace at
 * first sign-in. A parent adds to their own family; the admin passes
 * `familyId` (an existing family) or `newFamily` (asks for its name and
 * creates it with this parent as its first).
 */
export function NewParentForm({ title, back, doneTo, familyId, newFamily = false }: {
  title: string
  back: string
  doneTo: string
  familyId?: string
  newFamily?: boolean
}) {
  const navigate = useNavigate()
  const [familyName, setFamilyName] = useState('')
  const [details, setDetails] = useState<Details>(EMPTY)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const name = normalizeUsername(username)
  const valid = details.first_name.trim() && details.last_name.trim() && USERNAME_RE.test(name)
    && password.length >= MIN_PASSWORD_LENGTH && (!newFamily || familyName.trim())

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const { first_name, last_name, workplace, phone } = detailsRow(details)
    const { error: fnError } = await supabase.functions.invoke('manage-login', {
      body: {
        kind: 'parent',
        username: name,
        password,
        parent: { first_name, last_name, workplace, phone },
        ...(familyId && { family_id: familyId }),
        ...(newFamily && { new_family_name: familyName.trim() }),
      },
    })
    setBusy(false)
    if (fnError) {
      setErr(await functionError(fnError))
      return
    }
    navigate(doneTo, { replace: true, state: { created: name } })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <PageHeader title={title} back={back} />
      {newFamily && (
        <Section title="המשפחה">
          <Field label="שם המשפחה" htmlFor="familyName" hint="למשל: משפחת לוי">
            <Input id="familyName" required value={familyName} onChange={(e) => setFamilyName(e.target.value)} />
          </Field>
        </Section>
      )}
      <Section title={newFamily ? 'ההורה הראשון' : 'פרטים'}>
        <ParentDetailsFields value={details} onChange={setDetails} />
      </Section>
      <Section title="כניסה לאפליקציה">
        <Field label="שם משתמש" htmlFor="username" hint="אותיות באנגלית קטנות, מספרים, נקודה או מקף. לפחות 3.">
          <Input id="username" dir="ltr" required autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="סיסמה ראשונית" htmlFor="password" hint={`לפחות ${MIN_PASSWORD_LENGTH} תווים. בכניסה הראשונה יתבקשו לבחור סיסמה משלהם.`}>
          <Input id="password" dir="ltr" type="text" required autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {newFamily && (
          <p className="text-muted-foreground text-sm">אחרי שייכנס, ההורה הזה יוכל להוסיף את ההורה השני במסך "הורים", בלי אישור.</p>
        )}
      </Section>
      {err && <ErrorText>{err}</ErrorText>}
      <PrimaryButton type="submit" disabled={!valid || busy}>
        {busy ? 'שומרים…' : newFamily ? 'יצירת משפחה והזמנת ההורה' : 'הוספת הורה'}
      </PrimaryButton>
    </form>
  )
}

/** Another parent of the family: their details, or a new temporary password. */
function EditParent({ id }: { id: string }) {
  const [details, setDetails] = useState<Details | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const { data: parent, error, reload } = useLoad(async () => {
    const res = await supabase.from('app_users').select(APP_USER_COLUMNS).eq('id', id).eq('role', 'parent').single()
    if (res.error) throw new Error('לא מצאנו את ההורה.')
    return res.data as AppUser
  }, [id])

  useEffect(() => {
    if (!parent) return
    setDetails({
      first_name: parent.first_name ?? parent.full_name ?? '',
      last_name: parent.last_name ?? '',
      workplace: parent.workplace ?? '',
      phone: parent.phone ?? '',
    })
    setUsername(usernameOf(parent.email) ?? '')
  }, [parent])

  if (error) return <ErrorText>{error}</ErrorText>
  if (!details || !parent) return <Loading />

  const name = normalizeUsername(username)
  const passwordOk = password.length >= MIN_PASSWORD_LENGTH

  async function onSaveDetails(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setNotice(null)
    const { error: saveError } = await supabase.from('app_users').update(detailsRow(details!)).eq('id', id)
    setBusy(false)
    if (saveError) setErr('לא הצלחנו לשמור. נסו שוב.')
    else setNotice('הפרטים נשמרו.')
    reload()
  }

  async function onResetPassword() {
    setBusy(true)
    setErr(null)
    setNotice(null)
    const { error: fnError } = await supabase.functions.invoke('manage-login', {
      body: { kind: 'parent', id, password, username: name && name !== usernameOf(parent?.email) ? name : undefined },
    })
    setBusy(false)
    if (fnError) {
      setErr(await functionError(fnError))
      return
    }
    setPassword('')
    setNotice(`נשמר. בכניסה הבאה ${displayName(parent!)} יתבקש/תתבקש לבחור סיסמה חדשה.`)
    reload()
  }

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title={displayName(parent)} back="/parents" />
      <form onSubmit={onSaveDetails} className="flex flex-col gap-3.5">
        <Section title="פרטים">
          <ParentDetailsFields value={details} onChange={setDetails} />
          <SecondaryButton type="submit" disabled={busy || !details.first_name.trim() || !details.last_name.trim()}>
            שמירת הפרטים
          </SecondaryButton>
        </Section>
      </form>
      <Section title="סיסמה זמנית חדשה">
        <p className="text-muted-foreground text-sm">שכחו את הסיסמה? תנו להם סיסמה זמנית. בכניסה הבאה יתבקשו לבחור סיסמה משלהם.</p>
        <Field label="שם משתמש" htmlFor="username">
          <Input id="username" dir="ltr" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="סיסמה זמנית" htmlFor="password" hint={`לפחות ${MIN_PASSWORD_LENGTH} תווים`}>
          <Input id="password" dir="ltr" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <SecondaryButton type="button" disabled={busy || !passwordOk || (!!name && !USERNAME_RE.test(name))} onClick={onResetPassword}>
          לשמור סיסמה זמנית
        </SecondaryButton>
      </Section>
      {err && <ErrorText>{err}</ErrorText>}
      {notice && <p className="text-success-foreground text-[15px]" role="status">{notice}</p>}
    </div>
  )
}
