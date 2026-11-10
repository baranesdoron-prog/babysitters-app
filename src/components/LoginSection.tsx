import { useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'

import { ErrorText, Field, Section, SecondaryButton } from '@/components/bits'
import { Input } from '@/components/ui/input'
import { MIN_PASSWORD_LENGTH, normalizeUsername, USERNAME_RE, usernameOf } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

/**
 * A babysitter's or a girl's username + password, set by a parent through the
 * manage-login edge function. Shows the current username and lets the parent
 * create the login, or change the username / password.
 */
export function LoginSection({ kind, id, loginEmail, onChange }: {
  kind: 'babysitter' | 'child'
  id: string
  /** app_users.email of the linked login, or null when she has none yet. */
  loginEmail: string | null
  onChange: () => void
}) {
  const current = usernameOf(loginEmail)
  const hasLogin = loginEmail !== null
  const [editing, setEditing] = useState(!hasLogin)
  const [username, setUsername] = useState(current ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const name = normalizeUsername(username)
  // A login still on an email address must get a username now.
  const needsUsername = !hasLogin || current === null
  const valid = (needsUsername ? USERNAME_RE.test(name) : !name || USERNAME_RE.test(name))
    && password.length >= MIN_PASSWORD_LENGTH

  async function save() {
    setBusy(true)
    setErr(null)
    setSaved(null)
    const { error } = await supabase.functions.invoke('manage-login', {
      body: { kind, id, username: name !== current ? name : undefined, password },
    })
    setBusy(false)
    if (error) {
      const status = error instanceof FunctionsHttpError ? error.context.status : null
      setErr(status === 422 || status === 409 ? 'שם המשתמש הזה כבר תפוס. נסו שם אחר.' : 'לא הצלחנו לשמור את הכניסה. נסו שוב.')
      return
    }
    setPassword('')
    setEditing(false)
    setSaved(`נשמר. שם המשתמש: ${name}. מסרו לה את הסיסמה.`)
    onChange()
  }

  const who = kind === 'child' ? 'היא תראה רק מי איתה ומתי.' : 'היא תראה רק את המשמרות שלה.'

  return (
    <Section title="כניסה לאפליקציה">
      {hasLogin && (
        <p className="text-[15px]">
          {current ? (
            <>שם משתמש: <span dir="ltr" className="font-semibold">{current}</span></>
          ) : (
            'נכנסת עד עכשיו עם אימייל. צריך לתת לה שם משתמש וסיסמה.'
          )}
        </p>
      )}
      {saved && <p className="text-success-foreground text-[15px]" role="status">{saved}</p>}

      {editing ? (
        <>
          <p className="text-muted-foreground text-sm">
            {hasLogin ? 'סיסמה חדשה (ואפשר גם שם משתמש חדש).' : `בלי אימייל: שם משתמש באנגלית וסיסמה. ${who}`}
          </p>
          <Field label="שם משתמש" htmlFor={`${kind}-username`} hint="אותיות באנגלית קטנות, מספרים, נקודה או מקף. לפחות 3.">
            <Input id={`${kind}-username`} dir="ltr" autoCapitalize="none" autoCorrect="off" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label={hasLogin ? 'סיסמה חדשה' : 'סיסמה'} htmlFor={`${kind}-password`} hint={`לפחות ${MIN_PASSWORD_LENGTH} תווים`}>
            <Input id={`${kind}-password`} dir="ltr" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {err && <ErrorText>{err}</ErrorText>}
          <SecondaryButton type="button" disabled={!valid || busy} onClick={save}>
            {busy ? 'שומרים…' : hasLogin ? 'לשמור' : 'ליצור כניסה'}
          </SecondaryButton>
        </>
      ) : (
        <SecondaryButton type="button" onClick={() => { setEditing(true); setSaved(null) }}>
          לשנות סיסמה או שם משתמש
        </SecondaryButton>
      )}
    </Section>
  )
}
