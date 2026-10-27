import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

import { ErrorText, Field, Loading, PageHeader, PrimaryButton, Section, TextButton } from '@/components/bits'
import { Input, Select } from '@/components/ui/input'
import { fetchSettings } from '@/hooks/useSettings'
import { useLoad } from '@/hooks/useLoad'
import { NIGHT_END } from '@/lib/billing'
import { supabase } from '@/lib/supabase'
import type { Child, ItemTemplate } from '@/lib/types'
import { trimTime } from '@/lib/utils'

export function Settings() {
  const [nightStart, setNightStart] = useState('')
  const [wait, setWait] = useState('')
  const [reminder, setReminder] = useState('')
  const [newTask, setNewTask] = useState('')
  const [newTaskChild, setNewTaskChild] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, error, reload } = useLoad(async () => {
    const [settings, templates, children] = await Promise.all([
      fetchSettings(),
      supabase.from('item_templates').select('*').eq('auto_on', 'night').order('description'),
      supabase.from('children').select('*').order('birth_date'),
    ])
    if (templates.error || children.error) throw new Error('לא הצלחנו לטעון את ההגדרות.')
    return { settings, templates: templates.data as ItemTemplate[], children: children.data as Child[] }
  }, [])

  useEffect(() => {
    if (!data) return
    setNightStart(trimTime(data.settings.night_start))
    setWait(String(data.settings.default_wait_minutes))
    setReminder(String(data.settings.default_reminder_minutes))
  }, [data])

  async function save() {
    setBusy(true)
    setMessage(null)
    setActionError(null)
    const { error: saveError } = await supabase
      .from('settings')
      .update({ night_start: nightStart, default_wait_minutes: Number(wait), default_reminder_minutes: Number(reminder) })
      .eq('id', true)
    setBusy(false)
    if (saveError) setActionError('לא הצלחנו לשמור. נסו שוב.')
    else setMessage('נשמר.')
  }

  async function addTask() {
    setActionError(null)
    const { error: insertError } = await supabase
      .from('item_templates')
      .insert({ kind: 'morning', description: newTask.trim(), auto_on: 'night', child_id: newTaskChild || null })
    if (insertError) setActionError('לא הצלחנו להוסיף את המשימה.')
    else setNewTask('')
    reload()
  }

  async function removeTask(t: ItemTemplate) {
    const { error: deleteError } = await supabase.from('item_templates').delete().eq('id', t.id)
    if (deleteError) setActionError('לא הצלחנו למחוק.')
    reload()
  }

  if (error) return <ErrorText>{error}</ErrorText>
  if (!data) return <Loading />

  const childName = (id: string | null) => data.children.find((c) => c.id === id)?.name

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader title="הגדרות" back="/calendar" />

      <Section title="יום ולילה" className="border-night border-t-4">
        <Field label="הלילה מתחיל ב-" htmlFor="nightStart" hint={`ונגמר ב-${NIGHT_END} בבוקר. משמרת שחוצה את השעה הזו מחושבת כחלק יום וחלק לילה.`}>
          <Input id="nightStart" type="time" value={nightStart} onChange={(e) => setNightStart(e.target.value)} />
        </Field>
      </Section>

      <Section title="בקשות">
        <div className="grid grid-cols-2 gap-3">
          <Field label="זמן המתנה (דק׳)" htmlFor="wait">
            <Input id="wait" type="number" min={5} dir="ltr" value={wait} onChange={(e) => setWait(e.target.value)} />
          </Field>
          <Field label="תזכורת לפני הסוף (דק׳)" htmlFor="reminder">
            <Input id="reminder" type="number" min={0} dir="ltr" value={reminder} onChange={(e) => setReminder(e.target.value)} />
          </Field>
        </div>
      </Section>

      {actionError && <ErrorText>{actionError}</ErrorText>}
      {message && <p className="text-success-foreground text-[15px]" role="status">{message}</p>}
      <PrimaryButton type="button" disabled={busy || !nightStart} onClick={save}>{busy ? 'שומרים…' : 'שמירה'}</PrimaryButton>

      <Section title="משימות בוקר אחרי לילה">
        <p className="text-muted-foreground text-sm">מתווספות לבד לכל משמרת לילה.</p>
        <ul className="flex flex-col">
          {data.templates.map((t) => (
            <li key={t.id} className="border-muted flex min-h-12 items-center gap-2 border-b last:border-b-0">
              <span className="flex-1 text-[15px]">
                {t.description}
                {childName(t.child_id) && <span className="text-muted-foreground text-sm"> · {childName(t.child_id)}</span>}
              </span>
              <button type="button" aria-label={`מחיקת ${t.description}`} onClick={() => removeTask(t)} className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
                <Trash2 className="size-5" />
              </button>
            </li>
          ))}
        </ul>
        <Input aria-label="משימה חדשה" placeholder="למשל: להכין קופסת אוכל" value={newTask} onChange={(e) => setNewTask(e.target.value)} />
        <Select aria-label="למי" value={newTaskChild} onChange={(e) => setNewTaskChild(e.target.value)}>
          <option value="">לשתיהן</option>
          {data.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <TextButton disabled={!newTask.trim()} onClick={addTask}>+ משימה</TextButton>
      </Section>
    </div>
  )
}
