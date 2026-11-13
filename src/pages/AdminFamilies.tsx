import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { KeyRound, Pencil } from 'lucide-react'

import { Empty, ErrorText, Field, Loading, PageHeader, Pill, SecondaryButton, TextButton } from '@/components/bits'
import { Input } from '@/components/ui/input'
import { useLoad } from '@/hooks/useLoad'
import { MIN_PASSWORD_LENGTH, usernameOf } from '@/lib/auth'
import { displayName, MAX_PARENTS } from '@/lib/people'
import { supabase } from '@/lib/supabase'
import type { AppUser, Family } from '@/lib/types'
import { NewParentForm } from './ParentForm'

type ParentRow = Pick<AppUser, 'id' | 'family_id' | 'email' | 'first_name' | 'last_name' | 'full_name' | 'must_change_password'>

// The system admin's page: every family and its parents (never its kids,
// babysitters or shifts — RLS keeps those inside the family). The admin
// creates a family with its first parent; that parent adds the other one
// from "הורים", with no approval.
export function AdminFamilies() {
  const created = (useLocation().state as { created?: string } | null)?.created
  const { data, error, reload } = useLoad(async () => {
    const [families, parents] = await Promise.all([
      supabase.from('families').select('*').order('created_at'),
      supabase.from('app_users').select('id, family_id, email, first_name, last_name, full_name, must_change_password').eq('role', 'parent'),
    ])
    if (families.error || parents.error) throw new Error('לא הצלחנו לטעון את המשפחות.')
    return { families: families.data as Family[], parents: parents.data as ParentRow[] }
  }, [])

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="ניהול משפחות" back="/calendar" />
      {created && (
        <p className="bg-success-soft text-success-foreground rounded-lg p-3 text-[15px]" role="status">
          ההזמנה מוכנה. שם המשתמש: <span dir="ltr" className="font-semibold">{created}</span>. מסרו את הסיסמה הראשונית.
        </p>
      )}
      <Link
        to="/admin/families/new"
        className="bg-primary text-primary-foreground flex h-[52px] items-center justify-center rounded-lg text-[17px] font-semibold"
      >
        + הזמנת משפחה
      </Link>
      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error && <Loading />}
      {data?.families.length === 0 && <Empty>עוד אין משפחות.</Empty>}
      {data?.families.map((f) => (
        <FamilyCard key={f.id} family={f} parents={data.parents.filter((p) => p.family_id === f.id)} onChange={reload} />
      ))}
    </div>
  )
}

function FamilyCard({ family, parents, onChange }: { family: Family; parents: ParentRow[]; onChange: () => void }) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(family.name)
  const [err, setErr] = useState<string | null>(null)

  async function rename() {
    setErr(null)
    const { error } = await supabase.from('families').update({ name: name.trim() }).eq('id', family.id)
    if (error) {
      setErr('לא הצלחנו לשנות את השם.')
      return
    }
    setRenaming(false)
    onChange()
  }

  return (
    <section className="bg-card flex flex-col gap-3 rounded-xl p-4">
      {renaming ? (
        <div className="flex gap-2">
          <Input aria-label="שם המשפחה" value={name} onChange={(e) => setName(e.target.value)} />
          <SecondaryButton type="button" className="h-12 w-auto shrink-0 px-4 text-[15px]" disabled={!name.trim()} onClick={rename}>
            שמירה
          </SecondaryButton>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-bold">{family.name}</h2>
          <button type="button" aria-label={`שינוי השם של ${family.name}`} onClick={() => setRenaming(true)} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
            <Pencil className="size-5" />
          </button>
        </div>
      )}
      {err && <ErrorText>{err}</ErrorText>}
      {parents.length === 0 && <p className="text-muted-foreground text-sm">אין עדיין הורים במשפחה.</p>}
      <ul className="flex flex-col">
        {parents.map((p) => <ParentRowItem key={p.id} parent={p} onChange={onChange} />)}
      </ul>
      {parents.length >= MAX_PARENTS ? (
        <p className="text-muted-foreground text-sm">שני הורים, המשפחה מלאה.</p>
      ) : (
        <Link to={`/admin/families/${family.id}/parents/new`} className="text-primary flex min-h-11 items-center text-[15px] font-semibold">
          + הורה למשפחה
        </Link>
      )}
    </section>
  )
}

/** One parent; the key button opens "give a temporary password" (for a locked-out parent). */
function ParentRowItem({ parent, onChange }: { parent: ParentRow; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.functions.invoke('manage-login', { body: { kind: 'parent', id: parent.id, password } })
    setBusy(false)
    if (error) {
      setMsg('לא הצלחנו לשמור. נסו שוב.')
      return
    }
    setPassword('')
    setOpen(false)
    onChange()
  }

  return (
    <li className="border-muted flex flex-col gap-2 border-b py-2 last:border-b-0">
      <div className="flex min-h-11 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{displayName(parent)}</p>
          <p className="text-muted-foreground text-sm"><span dir="ltr">{usernameOf(parent.email) ?? parent.email}</span></p>
        </div>
        {parent.must_change_password && <Pill className="bg-pending-soft text-pending-foreground">עוד לא בחר/ה סיסמה</Pill>}
        <button type="button" aria-label={`סיסמה זמנית ל${displayName(parent)}`} aria-expanded={open} onClick={() => setOpen(!open)} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
          <KeyRound className="size-5" />
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2">
          <Field label="סיסמה זמנית" htmlFor={`tmp-${parent.id}`} hint="בכניסה הבאה יתבקשו לבחור סיסמה משלהם.">
            <Input id={`tmp-${parent.id}`} dir="ltr" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <TextButton disabled={busy || password.length < MIN_PASSWORD_LENGTH} onClick={save}>לשמור סיסמה זמנית</TextButton>
          {msg && <ErrorText>{msg}</ErrorText>}
        </div>
      )}
    </li>
  )
}

export function AdminNewFamily() {
  return <NewParentForm title="הזמנת משפחה" back="/admin" doneTo="/admin" newFamily />
}

export function AdminNewParent() {
  const { familyId } = useParams<{ familyId: string }>()
  return <NewParentForm title="הורה למשפחה" back="/admin" doneTo="/admin" familyId={familyId} />
}
