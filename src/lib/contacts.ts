// Bring a person's details in from the phone's contacts.
// Android Chrome has the Contact Picker API (navigator.contacts.select).
// iPhone Safari has nothing like it, so there the person shares the contact as
// a vCard (.vcf) file and picks that file; both end up as an ImportedContact.

export interface ImportedContact {
  name: string | null
  phone: string | null
  notes: string | null
  photo: Blob | null
}

type PickerProperty = 'name' | 'tel' | 'email' | 'address' | 'icon'
interface ContactsManager {
  getProperties(): Promise<PickerProperty[]>
  select(properties: PickerProperty[], options?: { multiple?: boolean }): Promise<
    { name?: string[]; tel?: string[]; icon?: Blob[] }[]
  >
}

function contactsManager(): ContactsManager | null {
  const nav = navigator as Navigator & { contacts?: ContactsManager }
  return nav.contacts && 'select' in nav.contacts ? nav.contacts : null
}

/** True where the browser can open the phone's own contact list (Android Chrome). */
export function canPickContacts() {
  return contactsManager() !== null
}

/** "+972 52-123 4567" / "052-1234567" → "052-1234567"; anything else is kept, trimmed. */
export function normalizePhone(raw: string) {
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+972')) digits = '0' + digits.slice(4)
  else if (digits.startsWith('972') && digits.length === 12) digits = '0' + digits.slice(3)
  if (/^05\d{8}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  if (/^0\d{8,9}$/.test(digits)) return digits
  return raw.trim()
}

/** Prefer an Israeli mobile number (05x) when the contact has several. */
function pickPhone(numbers: string[]) {
  const cleaned = numbers.map(normalizePhone).filter(Boolean)
  return cleaned.find((n) => n.startsWith('05')) ?? cleaned[0] ?? null
}

/** Opens the phone's contact list; null when the person closes it without choosing. */
export async function pickContact(): Promise<ImportedContact | null> {
  const manager = contactsManager()
  if (!manager) return null
  const supported = await manager.getProperties().catch(() => [] as PickerProperty[])
  const wanted: PickerProperty[] = ['name', 'tel']
  if (supported.includes('icon')) wanted.push('icon')
  const [contact] = await manager.select(wanted, { multiple: false })
  if (!contact) return null
  return {
    name: contact.name?.find((n) => n.trim())?.trim() ?? null,
    phone: pickPhone(contact.tel ?? []),
    notes: null,
    photo: contact.icon?.[0] ?? null,
  }
}

function unescapeValue(value: string) {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim()
}

function base64ToBlob(base64: string, type: string) {
  const bytes = Uint8Array.from(atob(base64.replace(/\s/g, '')), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type })
}

/** The first contact in a vCard (.vcf) file — versions 2.1, 3.0 and 4.0. */
export function parseVCard(text: string): ImportedContact | null {
  const card = /BEGIN:VCARD([\s\S]*?)END:VCARD/i.exec(text)?.[1]
  if (!card) return null
  // Unfold continuation lines (they start with a space or a tab).
  const lines = card.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n').filter(Boolean)

  let fullName: string | null = null
  let structuredName: string | null = null
  const phones: { value: string; mobile: boolean }[] = []
  let notes: string | null = null
  let photo: Blob | null = null

  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const head = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const [rawKey, ...params] = head.split(';')
    const key = rawKey.replace(/^item\d+\./i, '').toUpperCase()
    const paramText = params.join(';').toUpperCase()

    if (key === 'FN' && value.trim()) fullName = unescapeValue(value)
    else if (key === 'N' && value.trim()) {
      const [last = '', first = ''] = value.split(';').map(unescapeValue)
      structuredName = [first, last].filter(Boolean).join(' ') || null
    } else if (key === 'TEL' && value.trim()) {
      phones.push({ value: value.replace(/^tel:/i, ''), mobile: /CELL|MOBILE|IPHONE/.test(paramText) })
    } else if (key === 'NOTE' && value.trim()) notes = unescapeValue(value)
    else if (key === 'PHOTO' && value.trim()) {
      const dataUri = /^data:(image\/[\w+.-]+);base64,(.*)$/i.exec(value.trim())
      if (dataUri) photo = base64ToBlob(dataUri[2], dataUri[1])
      else if (/ENCODING=(B|BASE64)|^B$|BASE64/.test(paramText) || /^[A-Za-z0-9+/=\s]+$/.test(value)) {
        const type = /PNG/.test(paramText) ? 'image/png' : 'image/jpeg'
        photo = base64ToBlob(value, type)
      }
    }
  }

  const mobile = phones.filter((p) => p.mobile).map((p) => p.value)
  return {
    name: fullName ?? structuredName,
    phone: pickPhone([...mobile, ...phones.map((p) => p.value)]),
    notes,
    photo,
  }
}
