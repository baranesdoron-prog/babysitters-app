import { useState, type FormEvent } from 'react'

import { ErrorText, Field, PrimaryButton, SecondaryButton } from '@/components/bits'
import { Input } from '@/components/ui/input'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

/**
 * Set a new password for the signed-in user, then clear their
 * "must change password" flag. Used on the forced first-login screen and in
 * "הפרופיל שלי".
 */
export function PasswordForm({ primary = false, submitLabel, onDone }: {
  primary?: boolean
  submitLabel: string
  onDone: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const mismatch = confirm.length > 0 && confirm !== password
  const valid = password.length >= MIN_PASSWORD_LENGTH && password === confirm

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setBusy(false)
      setErr(error.code === 'same_password'
        ? 'זו הסיסמה הנוכחית. בחרו סיסמה אחרת.'
        : error.code === 'weak_password'
          ? 'הסיסמה חלשה מדי. נסו סיסמה ארוכה יותר.'
          : 'לא הצלחנו לשמור את הסיסמה. נסו שוב.')
      return
    }
    await supabase.rpc('password_changed')
    setBusy(false)
    setPassword('')
    setConfirm('')
    onDone()
  }

  const Submit = primary ? PrimaryButton : SecondaryButton
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label="סיסמה חדשה" htmlFor="newPassword" hint={`לפחות ${MIN_PASSWORD_LENGTH} תווים`}>
        <Input id="newPassword" type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="שוב, לאימות" htmlFor="confirmPassword">
        <Input id="confirmPassword" type="password" dir="ltr" autoComplete="new-password" aria-invalid={mismatch || undefined} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {mismatch && <p className="text-destructive text-sm">הסיסמאות לא זהות.</p>}
      {err && <ErrorText>{err}</ErrorText>}
      <Submit type="submit" disabled={!valid || busy}>{busy ? 'שומרים…' : submitLabel}</Submit>
    </form>
  )
}
