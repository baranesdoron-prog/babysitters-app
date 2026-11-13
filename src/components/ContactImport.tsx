import { useRef, useState } from 'react'
import { BookUser, FileUp } from 'lucide-react'

import { ErrorText, Section, SecondaryButton } from '@/components/bits'
import { canPickContacts, parseVCard, pickContact, type ImportedContact } from '@/lib/contacts'

/**
 * "ייבוא מאנשי הקשר": fills a form from a phone contact. Android Chrome opens
 * the contact list; elsewhere (iPhone) the person picks a contact card (.vcf)
 * they shared from the Contacts app.
 */
export function ContactImport({ onImport }: { onImport: (contact: ImportedContact) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const picker = canPickContacts()

  function apply(contact: ImportedContact | null) {
    if (!contact) return
    const got = [contact.name && 'שם', contact.phone && 'טלפון', contact.photo && 'תמונה', contact.notes && 'הערות'].filter(Boolean)
    if (got.length === 0) {
      setErr('לא מצאנו פרטים באיש הקשר הזה.')
      return
    }
    onImport(contact)
    setDone(`הועתקו: ${got.join(', ')}. בדקו ושמרו.`)
  }

  async function fromPhone() {
    setErr(null)
    setDone(null)
    try {
      apply(await pickContact())
    } catch {
      setErr('לא הצלחנו לפתוח את אנשי הקשר.')
    }
  }

  async function fromFile(file: File) {
    setErr(null)
    setDone(null)
    const contact = parseVCard(await file.text())
    if (!contact) setErr('הקובץ הזה לא נראה ככרטיס איש קשר (vcf).')
    else apply(contact)
  }

  return (
    <Section title="ייבוא מאנשי הקשר">
      {picker ? (
        <SecondaryButton type="button" onClick={fromPhone}>
          <BookUser className="size-5" aria-hidden="true" /> בחירה מאנשי הקשר
        </SecondaryButton>
      ) : (
        <p className="text-muted-foreground text-sm">
          באייפון: באנשי הקשר פותחים את איש הקשר ← "שיתוף איש קשר" ← "שמירה בקבצים", ואז בוחרים את הקובץ כאן.
        </p>
      )}
      <SecondaryButton type="button" onClick={() => fileRef.current?.click()}>
        <FileUp className="size-5" aria-hidden="true" /> {picker ? 'או מכרטיס איש קשר (vcf)' : 'בחירת כרטיס איש קשר (vcf)'}
      </SecondaryButton>
      <input
        ref={fileRef}
        type="file"
        accept=".vcf,text/vcard,text/x-vcard"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void fromFile(file)
        }}
      />
      {done && <p className="text-success-foreground text-[15px]" role="status">{done}</p>}
      {err && <ErrorText>{err}</ErrorText>}
    </Section>
  )
}
