import { useState } from 'react'
import { Star } from 'lucide-react'

import { ErrorText, SecondaryButton } from '@/components/bits'
import { Textarea } from '@/components/ui/input'
import { rateShift, type RatingSummary } from '@/lib/ratings'
import { cn } from '@/lib/utils'

/** "★ 4.6 (12)" — nothing when there are no ratings yet. */
export function RatingBadge({ summary, className }: { summary: RatingSummary | undefined; className?: string }) {
  if (!summary || summary.count === 0) return null
  return (
    <span
      className={cn('text-primary-strong inline-flex items-center gap-0.5 text-[13px] font-semibold', className)}
      aria-label={`דירוג ${summary.average} מתוך 5, ${summary.count} דירוגים`}
    >
      <Star className="size-3.5 fill-current" aria-hidden="true" />
      {summary.average.toFixed(1)}
      <span className="text-muted-foreground font-normal">({summary.count})</span>
    </span>
  )
}

/** Five stars, read-only. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('text-primary inline-flex', className)} aria-label={`${value} כוכבים מתוך 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('size-4', n <= value ? 'fill-current' : 'text-input')} aria-hidden="true" />
      ))}
    </span>
  )
}

/** Pick 1–5 stars (44px targets). */
export function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} כוכבים`}
          onClick={() => onChange(n)}
          className="text-primary flex size-11 items-center justify-center rounded-lg"
        >
          <Star className={cn('size-7', n <= value ? 'fill-current' : 'text-input')} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

/** Rate one shift: stars + optional comment, saved through rate_shift(). */
export function RateShift({ shiftId, initial, commentHint, onSaved }: {
  shiftId: string
  initial?: { stars: number; comment: string | null } | null
  commentHint: string
  onSaved: () => void
}) {
  const [stars, setStars] = useState(initial?.stars ?? 0)
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setErr(null)
    const error = await rateShift(shiftId, stars, comment)
    setBusy(false)
    if (error) setErr('לא הצלחנו לשמור את הדירוג. נסו שוב.')
    else onSaved()
  }

  return (
    <div className="flex flex-col gap-2">
      <StarPicker value={stars} onChange={setStars} label="דירוג" />
      <Textarea aria-label="מילה על המשמרת (לא חובה)" placeholder={commentHint} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} className="min-h-16" />
      {err && <ErrorText>{err}</ErrorText>}
      <SecondaryButton type="button" className="h-12 text-[15px]" disabled={busy || stars === 0} onClick={save}>
        {busy ? 'שומרים…' : initial ? 'עדכון הדירוג' : 'שמירת הדירוג'}
      </SecondaryButton>
    </div>
  )
}
