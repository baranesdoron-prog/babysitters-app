import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Moon, Share2, Sun } from 'lucide-react'

import { Avatar, AvatarPicker } from '@/components/Avatar'
import { BottomSheet } from '@/components/BottomSheet'
import { ContactImport } from '@/components/ContactImport'
import { LoginSection } from '@/components/LoginSection'
import { Segmented } from '@/components/Segmented'
import { CheckRow, ErrorText, Field, Loading, PageHeader, PrimaryButton, SecondaryButton, Section, Tag, TextButton } from '@/components/bits'
import { Input, Textarea } from '@/components/ui/input'
import { useLoad } from '@/hooks/useLoad'
import { uploadPhoto } from '@/lib/photos'
import { supabase } from '@/lib/supabase'
import type { ImportedContact } from '@/lib/contacts'
import type { Babysitter, RateType, SitterTerms } from '@/lib/types'

/** Her shared profile — edited only by the family that added her (and by her). */
type Profile = Pick<Babysitter, 'full_name' | 'night_ok' | 'helps_homework' | 'can_pickup' | 'has_child_seat' | 'shared' | 'photo_path'> & {
  phone: string
}
/** My family's own terms with her — private to my family. */
type Terms = Pick<SitterTerms, 'day_rate_type' | 'night_rate_type' | 'active'> & { day_rate: string; night_rate: string; notes: string }

const EMPTY_PROFILE: Profile = {
  full_name: '',
  phone: '',
  photo_path: null,
  night_ok: false,
  helps_homework: false,
  can_pickup: false,
  has_child_seat: false,
  shared: false,
}
const EMPTY_TERMS: Terms = { day_rate_type: 'hourly', day_rate: '', night_rate_type: 'hourly', night_rate: '', notes: '', active: true }

const rateOptions: { value: RateType; label: string }[] = [
  { value: 'hourly', label: 'לשעה' },
  { value: 'per_shift', label: 'למשמרת' },
]

export function BabysitterForm({ myFamilyId }: { myFamilyId: string | null }) {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(isNew ? EMPTY_PROFILE : null)
  const [terms, setTerms] = useState<Terms>(EMPTY_TERMS)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  // A photo imported from a contact before the babysitter exists: uploaded right after saving.
  const [pendingPhoto, setPendingPhoto] = useState<Blob | null>(null)
  const pendingPhotoUrl = useMemo(() => (pendingPhoto ? URL.createObjectURL(pendingPhoto) : null), [pendingPhoto])
  useEffect(() => () => { if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl) }, [pendingPhotoUrl])

  // Her login (if any) is loaded separately, so saving the form doesn't reset it.
  const { data: login, reload: reloadLogin } = useLoad(async () => {
    if (isNew) return null
    const res = await supabase.from('app_users').select('email').eq('babysitter_id', id!).maybeSingle()
    return { email: (res.data?.email as string | undefined) ?? null }
  }, [id])

  const { data: existing, error } = useLoad(async () => {
    if (isNew) return null
    const [sitter, myTerms] = await Promise.all([
      supabase.from('babysitters').select('*').eq('id', id!).single(),
      supabase.from('family_babysitters').select('*').eq('babysitter_id', id!).maybeSingle(),
    ])
    if (sitter.error) throw new Error('לא מצאנו את הבייביסיטר.')
    const b = sitter.data as Babysitter
    const t = myTerms.data as SitterTerms | null
    if (b.family_id !== myFamilyId && !t) throw new Error('הבייביסיטר הזאת לא ברשימה שלכם.')
    return { sitter: b, terms: t }
  }, [id, myFamilyId])

  useEffect(() => {
    if (!existing) return
    const { sitter: b, terms: t } = existing
    setProfile({
      full_name: b.full_name,
      phone: b.phone ?? '',
      photo_path: b.photo_path,
      night_ok: b.night_ok,
      helps_homework: b.helps_homework,
      can_pickup: b.can_pickup,
      has_child_seat: b.has_child_seat,
      shared: b.shared,
    })
    if (t) {
      setTerms({
        day_rate_type: t.day_rate_type,
        day_rate: t.day_rate?.toString() ?? '',
        night_rate_type: t.night_rate_type,
        night_rate: t.night_rate?.toString() ?? '',
        notes: t.notes ?? '',
        active: t.active,
      })
    }
  }, [existing])

  if (error) return <ErrorText>{error}</ErrorText>
  if (!profile) return <Loading />

  // Did my family add her? Then my family edits her profile; otherwise only my own terms.
  const owned = isNew || existing?.sitter.family_id === myFamilyId
  const setP = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile({ ...profile, [key]: value })
  const setT = <K extends keyof Terms>(key: K, value: Terms[K]) => setTerms({ ...terms, [key]: value })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setSaveError(null)
    let sitterId = id!
    if (owned) {
      const row = {
        full_name: profile!.full_name.trim(),
        phone: profile!.phone.trim() || null,
        night_ok: profile!.night_ok,
        helps_homework: profile!.helps_homework,
        can_pickup: profile!.can_pickup,
        has_child_seat: profile!.can_pickup && profile!.has_child_seat,
        shared: profile!.shared,
      }
      const res = isNew
        ? await supabase.from('babysitters').insert(row).select('id').single()
        : await supabase.from('babysitters').update(row).eq('id', id!).select('id').single()
      if (res.error) {
        setBusy(false)
        setSaveError('לא הצלחנו לשמור. נסו שוב.')
        return
      }
      sitterId = res.data.id
    }
    const { error: termsError } = await supabase.from('family_babysitters').upsert(
      {
        babysitter_id: sitterId,
        day_rate_type: terms.day_rate_type,
        day_rate: terms.day_rate === '' ? null : Number(terms.day_rate),
        night_rate_type: terms.night_rate_type,
        night_rate: terms.night_rate === '' ? null : Number(terms.night_rate),
        notes: terms.notes.trim() || null,
        active: terms.active,
      },
      { onConflict: 'family_id,babysitter_id' },
    )
    if (termsError) {
      setBusy(false)
      setSaveError('הפרטים נשמרו, אבל התעריפים לא. נסו שוב.')
      if (isNew) navigate(`/babysitters/${sitterId}`, { replace: true })
      return
    }
    if (isNew && pendingPhoto) {
      // The babysitter is saved either way; a failed photo can be added again on her card.
      try {
        const path = await uploadPhoto('babysitters', sitterId, new File([pendingPhoto], 'contact.jpg', { type: pendingPhoto.type }))
        await supabase.from('babysitters').update({ photo_path: path }).eq('id', sitterId)
      } catch { /* shown as no photo; she can add one from her card */ }
    }
    setBusy(false)
    navigate(isNew ? `/babysitters/${sitterId}` : '/babysitters', { replace: isNew })
  }

  async function onPhoto(file: File) {
    const path = await uploadPhoto('babysitters', id!, file)
    const { error: updateError } = await supabase.from('babysitters').update({ photo_path: path }).eq('id', id!)
    if (updateError) throw updateError
    setProfile((p) => (p ? { ...p, photo_path: path } : p))
  }

  // Copy what the contact has; keep notes already written rather than overwrite them.
  async function onImport(contact: ImportedContact) {
    setProfile((p) => p && { ...p, full_name: contact.name ?? p.full_name, phone: contact.phone ?? p.phone })
    setTerms((t) => ({ ...t, notes: t.notes.trim() ? t.notes : contact.notes ?? t.notes }))
    if (!contact.photo) return
    if (isNew) setPendingPhoto(contact.photo)
    else await onPhoto(new File([contact.photo], 'contact.jpg', { type: contact.photo.type })).catch(() => undefined)
  }

  async function removeFromMyList() {
    setBusy(true)
    const { error: deleteError } = await supabase.from('family_babysitters').delete().eq('babysitter_id', id!)
    setBusy(false)
    if (deleteError) {
      setConfirmRemove(false)
      setSaveError('לא הצלחנו להסיר. נסו שוב.')
      return
    }
    navigate('/babysitters', { replace: true })
  }

  return (
    <div className="flex flex-col gap-3.5">
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <PageHeader title={isNew ? 'בייביסיטר חדשה' : profile.full_name || 'בייביסיטר'} back="/babysitters" />
      {owned && <ContactImport onImport={(c) => void onImport(c)} />}

      {owned ? (
        <Section>
          {isNew && pendingPhotoUrl ? (
            <div className="flex flex-col items-center gap-2">
              <img src={pendingPhotoUrl} alt="התמונה מאיש הקשר" className="size-20 rounded-full object-cover" />
              <p className="text-muted-foreground text-sm">התמונה מאיש הקשר תישמר יחד איתה.</p>
            </div>
          ) : isNew ? (
            <p className="text-muted-foreground text-sm">אחרי השמירה אפשר להוסיף תמונה.</p>
          ) : (
            <AvatarPicker name={profile.full_name} path={profile.photo_path} onPick={onPhoto} />
          )}
          <Field label="שם" htmlFor="name">
            <Input id="name" required value={profile.full_name} onChange={(e) => setP('full_name', e.target.value)} />
          </Field>
          <Field label="טלפון" htmlFor="phone">
            <Input id="phone" type="tel" dir="ltr" inputMode="tel" value={profile.phone} onChange={(e) => setP('phone', e.target.value)} />
          </Field>
        </Section>
      ) : (
        <Section>
          <div className="flex items-center gap-3">
            <Avatar name={profile.full_name} path={profile.photo_path} size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold">{profile.full_name}</p>
              {profile.phone && <p className="text-muted-foreground text-sm"><span dir="ltr">{profile.phone}</span></p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.night_ok && <Tag>עושה לילות</Tag>}
            {profile.helps_homework && <Tag>עוזרת בשיעורים</Tag>}
            {profile.can_pickup && <Tag>יכולה לאסוף</Tag>}
            {profile.can_pickup && (profile.has_child_seat ? <Tag>כיסא בטיחות</Tag> : <Tag missing>אין כיסא בטיחות</Tag>)}
          </div>
          <p className="text-muted-foreground text-sm">
            מהמאגר המשותף. את הפרטים שלה מעדכנת המשפחה שהוסיפה אותה, או היא עצמה. התעריפים וההערות כאן הם שלכם בלבד.
          </p>
        </Section>
      )}

      <Section title="תעריף יום" className="border-day border-t-4">
        <Segmented label="תעריף יום" value={terms.day_rate_type} onChange={(v) => setT('day_rate_type', v)} options={rateOptions} />
        <Field label={terms.day_rate_type === 'hourly' ? 'סכום לשעה (₪)' : 'סכום למשמרת (₪)'} htmlFor="dayRate">
          <div className="text-day-foreground flex items-center gap-2">
            <Sun className="size-5 shrink-0" aria-hidden="true" />
            <Input id="dayRate" type="number" inputMode="decimal" min={0} step="any" dir="ltr" value={terms.day_rate} onChange={(e) => setT('day_rate', e.target.value)} />
          </div>
        </Field>
      </Section>

      <Section title="לילה" className="border-night border-t-4">
        {owned && <CheckRow checked={profile.night_ok} onChange={(v) => setP('night_ok', v)} label="עושה משמרות לילה" />}
        {profile.night_ok ? (
          <>
            <Segmented label="תעריף לילה" value={terms.night_rate_type} onChange={(v) => setT('night_rate_type', v)} options={rateOptions} />
            <Field label={terms.night_rate_type === 'hourly' ? 'סכום לשעה (₪)' : 'סכום למשמרת (₪)'} htmlFor="nightRate">
              <div className="text-night-foreground flex items-center gap-2">
                <Moon className="size-5 shrink-0" aria-hidden="true" />
                <Input id="nightRate" type="number" inputMode="decimal" min={0} step="any" dir="ltr" value={terms.night_rate} onChange={(e) => setT('night_rate', e.target.value)} />
              </div>
            </Field>
          </>
        ) : (
          !owned && <p className="text-muted-foreground text-sm">לא עושה לילות.</p>
        )}
      </Section>

      <Section title={owned ? 'מה היא עושה' : 'אצלנו'}>
        <div className="flex flex-col">
          {owned && (
            <>
              <CheckRow checked={profile.helps_homework} onChange={(v) => setP('helps_homework', v)} label="עוזרת בשיעורים" hint="בלי תשלום נוסף" />
              <CheckRow checked={profile.can_pickup} onChange={(v) => setP('can_pickup', v)} label="יכולה לאסוף מהגן / מבית הספר" />
              {profile.can_pickup && (
                <CheckRow checked={profile.has_child_seat} onChange={(v) => setP('has_child_seat', v)} label="יש לה כיסא בטיחות לקטנה" />
              )}
            </>
          )}
          <CheckRow checked={terms.active} onChange={(v) => setT('active', v)} label="פעילה" hint="רק פעילות מופיעות כשקובעים משמרת" />
        </div>
      </Section>

      {owned && (
        <Section title="שיתוף" action={<Share2 className="text-muted-foreground size-5" aria-hidden="true" />}>
          <CheckRow
            checked={profile.shared}
            onChange={(v) => setP('shared', v)}
            label="לשתף עם משפחות אחרות"
            hint="משפחות שמשתפות גם הן יוכלו להוסיף אותה לרשימה שלהן, עם תעריפים משלהן. התעריפים וההערות שלכם נשארים פרטיים. כשתשתפו אותה, תוכלו לראות את הבייביסיטריות שמשפחות אחרות שיתפו."
          />
        </Section>
      )}

      <Section title="הערות">
        <Textarea aria-label="הערות" value={terms.notes} onChange={(e) => setT('notes', e.target.value)} placeholder={owned ? undefined : 'רק המשפחה שלכם רואה'} />
      </Section>

      {saveError && <ErrorText>{saveError}</ErrorText>}
      <PrimaryButton type="submit" disabled={busy}>{busy ? 'שומרים…' : 'שמירה'}</PrimaryButton>
    </form>
      {owned && !isNew && login && (
        <LoginSection kind="babysitter" id={id!} loginEmail={login.email} onChange={reloadLogin} />
      )}
      {!owned && (
        <TextButton className="text-destructive self-center" onClick={() => setConfirmRemove(true)}>
          הסרה מהרשימה שלנו
        </TextButton>
      )}
      <BottomSheet open={confirmRemove} title={`להסיר את ${profile.full_name} מהרשימה שלכם?`} onClose={() => setConfirmRemove(false)}>
        <p className="text-muted-foreground text-[15px]">משמרות שכבר נקבעו איתה נשארות. אפשר להוסיף אותה שוב מהמאגר המשותף.</p>
        <PrimaryButton type="button" className="bg-destructive" disabled={busy} onClick={removeFromMyList}>כן, להסיר</PrimaryButton>
        <SecondaryButton type="button" onClick={() => setConfirmRemove(false)}>לא, להשאיר</SecondaryButton>
      </BottomSheet>
    </div>
  )
}
