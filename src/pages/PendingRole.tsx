import { useEffect, useState, type FormEvent } from 'react'

import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type PairStatus = 'awaiting_partner' | 'awaiting_admin' | 'approved' | 'declined'

export function PendingRole({
  email,
  metadata,
}: {
  email: string | null
  metadata: Record<string, unknown>
}) {
  const [requesterName, setRequesterName] = useState(String(metadata.full_name ?? ''))
  const [partnerName, setPartnerName] = useState(String(metadata.parent_partner_name ?? ''))
  const [partnerEmail, setPartnerEmail] = useState(String(metadata.parent_partner_email ?? ''))
  const [pairStatus, setPairStatus] = useState<PairStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function submitPair() {
    setBusy(true)
    setError(null)
    const { data, error: requestError } = await supabase.rpc('submit_parent_pair_request', {
      p_requester_name: requesterName.trim(),
      p_partner_name: partnerName.trim(),
      p_partner_email: partnerEmail.trim().toLowerCase(),
    })
    setBusy(false)
    if (requestError || !data) {
      setError('לא הצלחנו לשמור את בקשת הזוג. בדקו את הפרטים ונסו שוב.')
      return
    }
    setPairStatus((data as { status: PairStatus }).status)
    setSubmitted(true)
  }

  useEffect(() => {
    if (
      metadata.requested_role === 'parent' &&
      typeof metadata.parent_partner_name === 'string' &&
      typeof metadata.parent_partner_email === 'string' &&
      typeof metadata.full_name === 'string'
    ) {
      void submitPair()
    }
    // Submit once from the verified magic-link session metadata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    await submitPair()
  }

  const statusCopy: Record<PairStatus, string> = {
    awaiting_partner: `נשלח קישור ל-${partnerEmail}. הבקשה תעבור לאישור אחרי שההורה השני ייכנס וישלח בקשה תואמת.`,
    awaiting_admin: 'שני ההורים נכנסו ושלחו בקשות תואמות. בקשת הזוג ממתינה לאישור מנהל.',
    approved: 'הבקשה אושרה. צאו והיכנסו מחדש כדי לפתוח את החשבון.',
    declined: 'בקשת הזוג לא אושרה. פנו למנהל המערכת כדי לברר מה חסר.',
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-semibold">נרשמתם בהצלחה</p>
      {submitted && pairStatus ? (
        <div className="bg-pending-soft text-pending-foreground w-full max-w-md rounded-xl p-4 text-start" role="status">
          <p className="font-semibold">סטטוס בקשת ההורים</p>
          <p className="mt-1 text-sm">{statusCopy[pairStatus]}</p>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground">החשבון {email} עדיין לא משויך. השלימו את פרטי שני ההורים.</p>
          <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-3 text-start">
            <div className="flex flex-col gap-2">
              <Label htmlFor="requesterName">השם שלך</Label>
              <Input id="requesterName" required value={requesterName} onChange={(event) => setRequesterName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="partnerName">שם ההורה השני</Label>
              <Input id="partnerName" required value={partnerName} onChange={(event) => setPartnerName(event.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="partnerEmail">אימייל ההורה השני</Label>
              <Input id="partnerEmail" type="email" dir="ltr" required value={partnerEmail} onChange={(event) => setPartnerEmail(event.target.value)} />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? 'שומרים…' : 'שליחת בקשת זוג'}</Button>
          </form>
        </>
      )}
      <Button variant="outline" onClick={() => supabase.auth.signOut()}>
        יציאה
      </Button>
    </div>
  )
}