import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'

import { AvatarPicker } from '@/components/Avatar'
import { Segmented } from '@/components/Segmented'
import { CheckRow, ErrorText, Field, Loading, PageHeader, PrimaryButton, Section } from '@/components/bits'
import { Input, Textarea } from '@/components/ui/input'
import { useLoad } from '@/hooks/useLoad'
import { uploadPhoto } from '@/lib/photos'
import { supabase } from '@/lib/supabase'
import type { Babysitter, RateType } from '@/lib/types'

type Draft = Omit<Babysitter, 'id' | 'day_rate' | 'night_rate'> & { day_rate: string; night_rate: string }

const EMPTY: Draft = {
  full_name: '',
  phone: '',
  photo_path: null,
  active: true,
  night_ok: false,
  helps_homework: false,
  can_pickup: false,
  has_child_seat: false,
  day_rate_type: 'hourly',
  day_rate: '',
  night_rate_type: 'hourly',
  night_rate: '',
  notes: '',
}

const rateOptions: { value: RateType; label: string }[] = [
  { value: 'hourly', label: 'לשעה' },
  { value: 'per_shift', label: 'למשמרת' },
]

export function BabysitterForm() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const { data: existing, error } = useLoad(async () => {
    if (isNew) return null
    const res = await supabase.from('babysitters').select('*').eq('id', id!).single()
    if (res.error) throw new Error('לא מצאנו את הבייביסיטר.')
    return res.data as Babysitter
  }, [id])

  useEffect(() => {
    if (existing) {
      setDraft({
        ...existing,
        phone: existing.phone ?? '',
        notes: existing.notes ?? '',
        day_rate: existing.day_rate?.toString() ?? '',
        night_rate: existing.night_rate?.toString() ?? '',
      })
    }
  }, [existing])

  if (error) return <ErrorText>{error}</ErrorText>
  if (!draft) return <Loading />

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setSaveError(null)
    const row = {
      full_name: draft!.full_name.trim(),
      phone: draft!.phone?.trim() || null,
      active: draft!.active,
      night_ok: draft!.night_ok,
      helps_homework: draft!.helps_homework,
      can_pickup: draft!.can_pickup,
      has_child_seat: draft!.can_pickup && draft!.has_child_seat,
      day_rate_type: draft!.day_rate_type,
      day_rate: draft!.day_rate === '' ? null : Number(draft!.day_rate),
      night_rate_type: draft!.night_rate_type,
      night_rate: draft!.night_rate === '' ? null : Number(draft!.night_rate),
      notes: draft!.notes?.trim() || null,
    }
    const res = isNew
      ? await supabase.from('babysitters').insert(row).select('id').single()
      : await supabase.from('babysitters').update(row).eq('id', id!).select('id').single()
    setBusy(false)
    if (res.error) {
      setSaveError('לא הצלחנו לשמור. נסו שוב.')
      return
    }
    navigate(isNew ? `/babysitters/${res.data.id}` : '/babysitters', { replace: isNew })
  }

  async function onPhoto(file: File) {
    const path = await uploadPhoto('babysitters', id!, file)
    const { error: updateError } = await supabase.from('babysitters').update({ photo_path: path }).eq('id', id!)
    if (updateError) throw updateError
    setDraft((d) => (d ? { ...d, photo_path: path } : d))
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <PageHeader title={isNew ? 'בייביסיטר חדשה' : draft.full_name || 'בייביסיטר'} back="/babysitters" />

      <Section>
        {isNew ? (
          <p className="text-muted-foreground text-sm">אחרי השמירה אפשר להוסיף תמונה.</p>
        ) : (
          <AvatarPicker name={draft.full_name} path={draft.photo_path} onPick={onPhoto} />
        )}
        <Field label="שם" htmlFor="name">
          <Input id="name" required value={draft.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </Field>
        <Field label="טלפון" htmlFor="phone">
          <Input id="phone" type="tel" dir="ltr" inputMode="tel" value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
      </Section>

      <Section title="תעריף יום" className="border-day border-t-4">
        <Segmented label="תעריף יום" value={draft.day_rate_type} onChange={(v) => set('day_rate_type', v)} options={rateOptions} />
        <Field label={draft.day_rate_type === 'hourly' ? 'סכום לשעה (₪)' : 'סכום למשמרת (₪)'} htmlFor="dayRate">
          <div className="text-day-foreground flex items-center gap-2">
            <Sun className="size-5 shrink-0" aria-hidden="true" />
            <Input id="dayRate" type="number" inputMode="decimal" min={0} step="any" dir="ltr" value={draft.day_rate} onChange={(e) => set('day_rate', e.target.value)} />
          </div>
        </Field>
      </Section>

      <Section title="לילה" className="border-night border-t-4">
        <CheckRow checked={draft.night_ok} onChange={(v) => set('night_ok', v)} label="עושה משמרות לילה" />
        {draft.night_ok && (
          <>
            <Segmented label="תעריף לילה" value={draft.night_rate_type} onChange={(v) => set('night_rate_type', v)} options={rateOptions} />
            <Field label={draft.night_rate_type === 'hourly' ? 'סכום לשעה (₪)' : 'סכום למשמרת (₪)'} htmlFor="nightRate">
              <div className="text-night-foreground flex items-center gap-2">
                <Moon className="size-5 shrink-0" aria-hidden="true" />
                <Input id="nightRate" type="number" inputMode="decimal" min={0} step="any" dir="ltr" value={draft.night_rate} onChange={(e) => set('night_rate', e.target.value)} />
              </div>
            </Field>
          </>
        )}
      </Section>

      <Section title="מה היא עושה">
        <div className="flex flex-col">
          <CheckRow checked={draft.helps_homework} onChange={(v) => set('helps_homework', v)} label="עוזרת בשיעורים" hint="בלי תשלום נוסף" />
          <CheckRow checked={draft.can_pickup} onChange={(v) => set('can_pickup', v)} label="יכולה לאסוף מהגן / מבית הספר" />
          {draft.can_pickup && (
            <CheckRow checked={draft.has_child_seat} onChange={(v) => set('has_child_seat', v)} label="יש לה כיסא בטיחות לקטנה" />
          )}
          <CheckRow checked={draft.active} onChange={(v) => set('active', v)} label="פעילה" hint="רק פעילות מופיעות כשקובעים משמרת" />
        </div>
      </Section>

      <Section title="הערות">
        <Textarea aria-label="הערות" value={draft.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </Section>

      {saveError && <ErrorText>{saveError}</ErrorText>}
      <PrimaryButton type="submit" disabled={busy}>{busy ? 'שומרים…' : 'שמירה'}</PrimaryButton>
    </form>
  )
}
