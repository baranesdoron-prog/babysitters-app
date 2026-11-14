import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Avatar } from '@/components/Avatar'
import { Empty, ErrorText, Loading, PageHeader, SecondaryButton, Tag } from '@/components/bits'
import { useLoad } from '@/hooks/useLoad'
import { fetchMySitters } from '@/lib/sitters'
import { supabase } from '@/lib/supabase'
import type { Babysitter } from '@/lib/types'

// Babysitters other families shared, that aren't in my list yet. RLS shows
// them only while my family shares one of its own (give to get).
export function SharedBabysitters() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const { data, error } = useLoad(async () => {
    const [mine, shared] = await Promise.all([
      fetchMySitters(),
      supabase.from('babysitters').select('*').eq('shared', true).order('full_name'),
    ])
    if (shared.error) throw new Error('לא הצלחנו לטעון את המאגר המשותף.')
    const inMyList = new Set(mine.map((b) => b.id))
    const iShare = mine.some((b) => b.owned && b.shared)
    return { iShare, sitters: (shared.data as Babysitter[]).filter((b) => !inMyList.has(b.id)) }
  }, [])

  async function add(b: Babysitter) {
    setBusy(b.id)
    setErr(null)
    const { error: insertError } = await supabase.from('family_babysitters').insert({ babysitter_id: b.id })
    setBusy(null)
    if (insertError) {
      setErr('לא הצלחנו להוסיף אותה. נסו שוב.')
      return
    }
    // Straight to her card, to set my family's rates.
    navigate(`/babysitters/${b.id}`)
  }

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="המאגר המשותף" back="/babysitters" />
      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error && <Loading />}
      {data && !data.iShare && (
        <Empty>כדי לראות את המאגר, שתפו לפחות בייביסיטר אחת משלכם.</Empty>
      )}
      {data?.iShare && data.sitters.length === 0 && <Empty>אין כרגע בייביסיטריות חדשות במאגר.</Empty>}
      {err && <ErrorText>{err}</ErrorText>}
      {data?.iShare && data.sitters.map((b) => (
        <section key={b.id} className="bg-card flex flex-col gap-3 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Avatar name={b.full_name} path={b.photo_path} size={48} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[17px] font-bold">{b.full_name}</p>
              {b.phone && <p className="text-muted-foreground text-sm"><span dir="ltr">{b.phone}</span></p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {b.night_ok ? <Tag>עושה לילות</Tag> : <Tag missing>לא עושה לילות</Tag>}
            {b.helps_homework && <Tag>עוזרת בשיעורים</Tag>}
            {b.can_pickup && <Tag>יכולה לאסוף</Tag>}
            {b.can_pickup && (b.has_child_seat ? <Tag>כיסא בטיחות</Tag> : <Tag missing>אין כיסא בטיחות</Tag>)}
          </div>
          <SecondaryButton type="button" className="h-12 text-[15px]" disabled={busy === b.id} onClick={() => add(b)}>
            {busy === b.id ? 'מוסיפים…' : 'הוספה לרשימה שלנו'}
          </SecondaryButton>
        </section>
      ))}
    </div>
  )
}
