import { useEffect, useState } from 'react'
import { Check, LogOut, RefreshCw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'

type Pairing = {
  id: string
  requester_name: string
  requester_email: string
  partner_name: string
  partner_email: string
  status: 'awaiting_partner' | 'awaiting_admin' | 'approved' | 'declined'
  created_at: string
}

const statusLabels: Record<Pairing['status'], string> = {
  awaiting_partner: 'ממתינים להורה השני',
  awaiting_admin: 'ממתינים לאישור מנהל',
  approved: 'אושר',
  declined: 'נדחה',
}

export function AdminPairs() {
  const [pairs, setPairs] = useState<Pairing[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadPairs() {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('parent_pairings')
      .select('id, requester_name, requester_email, partner_name, partner_email, status, created_at')
      .order('created_at', { ascending: false })
    setLoading(false)
    if (queryError) {
      setError('לא הצלחנו לטעון את בקשות הזוג.')
      return
    }
    setPairs((data ?? []) as Pairing[])
  }

  useEffect(() => {
    void loadPairs()
  }, [])

  async function reviewPair(id: string, approve: boolean) {
    setBusyId(id)
    setError(null)
    const { error: reviewError } = await supabase.rpc('review_parent_pairing', {
      p_pairing_id: id,
      p_approve: approve,
    })
    setBusyId(null)
    if (reviewError) {
      setError('לא הצלחנו לעדכן את הבקשה. רעננו ונסו שוב.')
      return
    }
    await loadPairs()
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-muted-foreground text-sm">ניהול מערכת</p>
          <h1 className="font-display text-[26px] font-semibold">בקשות הורים</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="רענון בקשות" title="רענון" onClick={() => void loadPairs()}>
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="יציאה" title="יציאה" onClick={() => void supabase.auth.signOut()}>
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
      {loading ? (
        <p className="text-muted-foreground py-8 text-center">טוענים בקשות…</p>
      ) : pairs.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center">אין בקשות זוג כרגע.</p>
      ) : (
        <section className="flex flex-col gap-3" aria-label="בקשות זוג">
          {pairs.map((pair) => (
            <Card key={pair.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <CardTitle className="text-[17px]">{pair.requester_name} + {pair.partner_name}</CardTitle>
                <span className="bg-pending-soft text-pending-foreground rounded-full px-2.5 py-1 text-xs font-semibold">
                  {statusLabels[pair.status]}
                </span>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">הורה ראשון</p>
                    <p>{pair.requester_name}</p>
                    <p dir="ltr" className="text-start">{pair.requester_email}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">הורה שני</p>
                    <p>{pair.partner_name}</p>
                    <p dir="ltr" className="text-start">{pair.partner_email}</p>
                  </div>
                </div>
                {pair.status === 'awaiting_admin' && (
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <Button disabled={busyId === pair.id} onClick={() => void reviewPair(pair.id, true)}>
                      <Check className="size-4" /> אישור שני ההורים
                    </Button>
                    <Button variant="outline" disabled={busyId === pair.id} onClick={() => void reviewPair(pair.id, false)}>
                      <X className="size-4" /> דחייה
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </main>
  )
}