import { MessageCircle } from 'lucide-react'

import { waLink } from '@/lib/whatsapp'
import { cn } from '@/lib/utils'

/**
 * Opens WhatsApp (wa.me) with a ready message to her. Icon-only (44×44, like
 * the call button) or with a label. Nothing when her number can't be used.
 */
export function WhatsAppButton({ phone, text, label, ariaLabel, className }: {
  phone: string | null | undefined
  text: string
  /** Shown text; without it, a 44×44 icon button. */
  label?: string
  /** Spoken name for the icon-only button ("וואטסאפ ל…"). */
  ariaLabel?: string
  className?: string
}) {
  const href = waLink(phone, text)
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label ? undefined : ariaLabel ?? 'הודעה בוואטסאפ'}
      className={cn(
        'bg-primary-soft text-primary-strong flex shrink-0 items-center justify-center gap-2 rounded-lg',
        label ? 'h-12 px-4 text-[15px] font-semibold' : 'size-11',
        className,
      )}
    >
      <MessageCircle className="size-5" aria-hidden="true" />
      {label}
    </a>
  )
}
