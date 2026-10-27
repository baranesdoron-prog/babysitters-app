import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'

import { usePhotoUrl } from '@/lib/photos'
import { cn } from '@/lib/utils'

export type AvatarTone = 'babysitter' | 'babysitter-alt' | 'child'

const toneClasses: Record<AvatarTone, string> = {
  babysitter: 'bg-primary-soft text-primary-strong',
  'babysitter-alt': 'bg-night-soft text-night-foreground',
  child: 'bg-day-soft text-day-foreground',
}

const sizeClasses = {
  40: 'size-10 text-base',
  48: 'size-12 text-lg',
  80: 'size-20 text-3xl',
  112: 'size-28 text-5xl',
} as const

/** Round photo; falls back to the first letter on a tinted circle. */
export function Avatar({
  name,
  path,
  size = 40,
  tone = 'babysitter',
  className,
}: {
  name: string
  path: string | null | undefined
  size?: keyof typeof sizeClasses
  tone?: AvatarTone
  className?: string
}) {
  const url = usePhotoUrl(path)
  return (
    <span
      className={cn(
        'font-display relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold',
        sizeClasses[size],
        toneClasses[tone],
        className,
      )}
      aria-hidden={url ? undefined : true}
    >
      {url ? <img src={url} alt={name} className="size-full object-cover" /> : name.trim().charAt(0)}
    </span>
  )
}

/** The 80px form avatar with a camera button to add or replace the photo. */
export function AvatarPicker({
  name,
  path,
  tone,
  onPick,
}: {
  name: string
  path: string | null | undefined
  tone?: AvatarTone
  onPick: (file: File) => Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Same path after a replace: remount the avatar so it fetches a fresh signed URL.
  const [version, setVersion] = useState(0)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <Avatar key={version} name={name || '?'} path={path} size={80} tone={tone} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={path ? 'החלפת תמונה' : 'הוספת תמונה'}
          className="bg-primary text-primary-foreground border-card absolute -end-1 -bottom-1 flex size-9 items-center justify-center rounded-full border-2 disabled:opacity-50"
        >
          <Camera className="size-4" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setBusy(true)
            setError(null)
            try {
              await onPick(file)
              setVersion((v) => v + 1)
            } catch {
              setError('לא הצלחנו להעלות את התמונה.')
            }
            setBusy(false)
          }}
        />
      </div>
      {busy && <p className="text-muted-foreground text-sm">מעלים…</p>}
      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
    </div>
  )
}
