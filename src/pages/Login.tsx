import { useState, type FormEvent } from 'react'
import { Fingerprint, HeartHandshake } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Passwordless sign-in: a magic link by email, for parents and babysitters alike.
export function Login() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [requestParent, setRequestParent] = useState(false)
  const [partnerName, setPartnerName] = useState('')
  const [partnerEmail, setPartnerEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const emailRedirectTo = window.location.origin
    const { error: loginError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        ...(requestParent && {
          data: {
            full_name: fullName.trim(),
            requested_role: 'parent',
            parent_partner_name: partnerName.trim(),
            parent_partner_email: partnerEmail.trim().toLowerCase(),
          },
        }),
      },
    })
    if (loginError) {
      setBusy(false)
      setError('לא הצלחנו לשלוח קישור. נסו שוב.')
      return
    }

    if (requestParent) {
      const { error: inviteError } = await supabase.auth.signInWithOtp({
        email: partnerEmail.trim().toLowerCase(),
        options: {
          emailRedirectTo,
          data: {
            full_name: partnerName.trim(),
            requested_role: 'parent',
            parent_partner_name: fullName.trim(),
            parent_partner_email: email.trim().toLowerCase(),
          },
        },
      })
      if (inviteError) {
        setBusy(false)
        setError('קישור הכניסה נשלח אלייך, אבל לא הצלחנו לשלוח הזמנה להורה השני. אפשר לשלוח אותה שוב בהמשך.')
        setSent(true)
        return
      }
    }

    setBusy(false)
    setSent(true)
  }

  async function onPasskeySignIn() {
    setPasskeyBusy(true)
    setError(null)
    try {
      const { error: passkeyError } = await supabase.auth.signInWithPasskey()
      if (passkeyError) setError('לא הצלחנו להתחבר עם מפתח הגישה. אפשר לנסות שוב או להשתמש בקישור באימייל.')
    } catch {
      setError('הכניסה עם מפתח גישה לא זמינה במכשיר או בדפדפן הזה. אפשר להיכנס עם קישור באימייל.')
    } finally {
      setPasskeyBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <HeartHandshake aria-hidden="true" className="size-8" strokeWidth={1.8} />
          </div>
          <p className="text-primary-strong text-sm font-semibold">משפחה אחת, בראש שקט</p>
          <h1 className="font-display mt-1 text-[26px] font-semibold">הבייביסיטריות שלנו</h1>
          <p className="text-muted-foreground mt-2 max-w-xs text-[15px]">
            כל מה שצריך כדי לתאם את העזרה בבית, במקום אחד.
          </p>
        </div>
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-[17px]">כניסה לחשבון</CardTitle>
          </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col gap-3 text-[15px]">
              <p>שלחנו קישור ל-{email}. פתחו אותו כדי להמשיך.</p>
              {error && <p className="text-warning-foreground" role="alert">{error}</p>}
              {requestParent && !error && (
                <p className="text-muted-foreground">
                  שלחנו גם הזמנה ל-{partnerEmail}. אחרי ששניכם תיכנסו, הבקשה תמתין לאישור מנהל.
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              {requestParent && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fullName">השם שלך</Label>
                  <Input
                    id="fullName"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">אימייל</Label>
                <Input
                  id="email"
                  type="email"
                  dir="ltr"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <label className="border-input flex min-h-11 items-start gap-3 rounded-lg border p-3">
                <input
                  type="checkbox"
                  className="accent-primary mt-1 size-4 shrink-0"
                  checked={requestParent}
                  onChange={(e) => setRequestParent(e.target.checked)}
                />
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">אני הורה</span>
                  <span className="text-muted-foreground text-sm">
                    נשלח קישור גם להורה השני. הגישה תיפתח אחרי ששניכם תירשמו ואישור מנהל.
                  </span>
                </span>
              </label>
              {requestParent && (
                <div className="border-border flex flex-col gap-3 border-s-2 ps-3">
                  <p className="text-sm font-semibold">פרטי ההורה השני</p>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="partnerName">שם</Label>
                    <Input
                      id="partnerName"
                      required
                      autoComplete="name"
                      value={partnerName}
                      onChange={(e) => setPartnerName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="partnerEmail">אימייל להזמנה</Label>
                    <Input
                      id="partnerEmail"
                      type="email"
                      dir="ltr"
                      required
                      autoComplete="email"
                      value={partnerEmail}
                      onChange={(e) => setPartnerEmail(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? 'שולחים…' : requestParent ? 'שלחו קישורים לשנינו' : 'שלחו לי קישור כניסה'}
              </Button>
              {!requestParent && (
                <Button type="button" variant="outline" disabled={passkeyBusy} onClick={() => void onPasskeySignIn()}>
                  <Fingerprint className="size-5" />
                  {passkeyBusy ? 'בודקים…' : 'כניסה עם מפתח גישה'}
                </Button>
              )}
            </form>
          )}
        </CardContent>
        </Card>
      </div>
    </div>
  )
}
