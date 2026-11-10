import { useState, type FormEvent } from 'react'
import { Fingerprint, HeartHandshake } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { loginEmails } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Username + password for everyone (parents, babysitters and the girls).
// Logins are created by a parent; after signing in, the fingerprint button in
// the header saves a passkey so the next sign-in is Face ID / fingerprint.
export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    let failed = true
    for (const email of loginEmails(username)) {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
      if (!loginError) {
        failed = false
        break
      }
    }
    setBusy(false)
    if (failed) setError('שם המשתמש או הסיסמה לא נכונים. נסו שוב.')
  }

  async function onPasskeySignIn() {
    setPasskeyBusy(true)
    setError(null)
    try {
      const { error: passkeyError } = await supabase.auth.signInWithPasskey()
      if (passkeyError) setError('לא הצלחנו להיכנס עם טביעת אצבע. נסו שוב או היכנסו עם שם משתמש וסיסמה.')
    } catch {
      setError('כניסה עם טביעת אצבע לא זמינה במכשיר או בדפדפן הזה. היכנסו עם שם משתמש וסיסמה.')
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
          <CardContent className="flex flex-col gap-4">
            <Button
              type="button"
              variant="outline"
              className="h-[52px] rounded-lg text-[17px] font-semibold"
              disabled={passkeyBusy}
              onClick={() => void onPasskeySignIn()}
            >
              <Fingerprint className="size-5" aria-hidden="true" />
              {passkeyBusy ? 'בודקים…' : 'כניסה עם טביעת אצבע'}
            </Button>
            <p className="text-muted-foreground -mt-2 text-center text-sm">
              עובד אחרי שהפעלתם טביעת אצבע במכשיר הזה (הסמל למעלה, אחרי הכניסה).
            </p>

            <div className="text-muted-foreground flex items-center gap-3 text-sm" aria-hidden="true">
              <span className="bg-border h-px flex-1" />
              או
              <span className="bg-border h-px flex-1" />
            </div>

            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">שם משתמש</Label>
                <Input
                  id="username"
                  dir="ltr"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">סיסמה</Label>
                <Input
                  id="password"
                  type="password"
                  dir="ltr"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
              <Button type="submit" className="h-[52px] rounded-lg text-[17px] font-semibold" disabled={busy}>
                {busy ? 'נכנסים…' : 'כניסה'}
              </Button>
              <p className="text-muted-foreground text-center text-sm">אין לכם שם משתמש? בקשו מההורים.</p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
