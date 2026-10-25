import { useState, type FormEvent } from 'react'

import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Passwordless sign-in: a magic link by email, for parents and babysitters alike.
export function Login() {
  const [email, setEmail] = useState('')
  const [requestParent, setRequestParent] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        ...(requestParent && { data: { requested_role: 'parent' } }),
      },
    })
    setBusy(false)
    if (error) setError('לא הצלחנו לשלוח קישור. נסו שוב.')
    else setSent(true)
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">הבייביסיטריות שלנו</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p>
              שלחנו {requestParent ? 'קישור להרשמה כהורה' : 'קישור כניסה'} ל-{email}. פתחו אותו מהטלפון הזה.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
                    בקשת ההורה תמתין לאישור לפני קבלת גישה.
                  </span>
                </span>
              </label>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? 'שולח…' : 'שלחו לי קישור כניסה'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
