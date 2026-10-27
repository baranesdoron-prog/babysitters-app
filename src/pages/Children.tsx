import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

import { Avatar } from '@/components/Avatar'
import { Empty, ErrorText, Fab, Loading, PageHeader, Tag } from '@/components/bits'
import { useLoad } from '@/hooks/useLoad'
import { frameworkLabels } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { Child } from '@/lib/types'
import { ageOf, trimTime } from '@/lib/utils'

export function Children() {
  const { data: rows, error } = useLoad(async () => {
    const res = await supabase.from('children').select('*').order('birth_date')
    if (res.error) throw new Error('לא הצלחנו לטעון את הבנות.')
    return res.data as Child[]
  }, [])

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="הבנות" />
      {error && <ErrorText>{error}</ErrorText>}
      {!rows && !error && <Loading />}
      {rows?.length === 0 && <Empty>עוד לא הוספתם את הבנות.</Empty>}
      {rows?.map((c) => {
        const age = ageOf(c.birth_date)
        return (
          <Link key={c.id} to={`/children/${c.id}`} className="bg-card flex flex-col gap-3 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <Avatar name={c.name} path={c.photo_path} size={48} tone="child" />
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold">{c.name}</p>
                <p className="text-muted-foreground text-sm">
                  {[age != null && `בת ${age}`, c.framework_type && `${frameworkLabels[c.framework_type]}${c.framework_name ? ` ${c.framework_name}` : ''}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <ChevronLeft className="text-subtle-foreground size-5 shrink-0" aria-hidden="true" />
            </div>
            <div className="flex flex-wrap gap-2">
              {c.bedtime && <Tag>הולכת לישון ב-{trimTime(c.bedtime)}</Tag>}
              {c.needs_child_seat && <Tag missing>צריכה כיסא בטיחות</Tag>}
              {c.allergies && <Tag missing>אלרגיה: {c.allergies}</Tag>}
            </div>
          </Link>
        )
      })}
      <Fab to="/children/new" label="להוסיף ילדה" />
    </div>
  )
}
