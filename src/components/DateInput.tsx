import { useEffect, useState } from 'react'

import { Input } from '@/components/ui/input'

/** "2018-03-01" → "01/03/2018" */
function toDisplay(iso: string) {
  const [y, m, d] = iso.split('-')
  return iso ? `${d}/${m}/${y}` : ''
}

/** "01/03/2018" → "2018-03-01", or null unless it is a real calendar date. */
function toIso(text: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!match) return null
  const [, d, m, y] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (date.getUTCDate() !== Number(d) || date.getUTCMonth() !== Number(m) - 1) return null
  return `${y}-${m}-${d}`
}

/** Digits → "dd/mm/yyyy", adding the slashes as she types. */
function mask(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/')
}

/**
 * A typed date field shown as dd/mm/yyyy. The phone's own date picker shows
 * its locale's hint (e.g. "dd/מ״מ/YYYY") and can't be changed, so this one is
 * a text field. Takes and returns "YYYY-MM-DD" ('' when empty or incomplete).
 */
export function DateInput({ id, value, onChange }: {
  id?: string
  value: string
  onChange: (iso: string) => void
}) {
  const [text, setText] = useState(toDisplay(value))

  // Follow outside changes (e.g. the saved value loading in).
  useEffect(() => {
    if (value !== (toIso(text) ?? '')) setText(toDisplay(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const invalid = text.length === 10 && toIso(text) === null

  return (
    <>
      <Input
        id={id}
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        maxLength={10}
        aria-invalid={invalid || undefined}
        className="text-end"
        value={text}
        onChange={(e) => {
          const next = mask(e.target.value)
          setText(next)
          onChange(toIso(next) ?? '')
        }}
      />
      {invalid && <p className="text-destructive text-sm" role="alert">התאריך לא תקין.</p>}
    </>
  )
}
