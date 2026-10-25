import { useEffect, useState } from 'react'
import { Phone } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { formatRate } from '@/lib/labels'
import type { Babysitter } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'

export function Babysitters() {
  const [rows, setRows] = useState<Babysitter[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('babysitters')
      .select('*')
      .order('active', { ascending: false })
      .order('full_name')
      .then(({ data, error }) => {
        if (error) setError('לא הצלחנו לטעון את הרשימה.')
        else setRows(data as Babysitter[])
      })
  }, [])

  if (error) return <p className="text-destructive">{error}</p>
  if (!rows) return <p className="text-muted-foreground">טוען…</p>

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">בייביסיטריות</h1>
      {rows.length === 0 && <p className="text-muted-foreground">עוד אין בייביסיטריות במאגר.</p>}
      {rows.map((b) => (
        <Card key={b.id} className={b.active ? '' : 'opacity-60'}>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{b.full_name}</p>
              {b.phone && (
                <a href={`tel:${b.phone}`} className="text-primary flex items-center gap-1 text-sm" dir="ltr">
                  <Phone className="size-4" />
                  {b.phone}
                </a>
              )}
            </div>
            <p className="text-sm">
              יום: {formatRate(b.day_rate_type, b.day_rate)} · לילה:{' '}
              {b.night_ok ? formatRate(b.night_rate_type, b.night_rate) : 'לא עושה לילות'}
            </p>
            <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
              {b.helps_homework && <span>עוזרת בשיעורים</span>}
              {b.can_pickup && <span>יכולה לאסוף</span>}
              {b.can_pickup && <span>{b.has_child_seat ? 'יש כיסא בטיחות' : 'אין כיסא בטיחות'}</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
