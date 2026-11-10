import { useEffect, useId, type ReactNode } from 'react'

/** Confirmation sheet: dimmed backdrop, drag handle, title as a question. */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center">
      <button type="button" aria-label="סגירה" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-card relative flex max-h-[90svh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-t-2xl px-4 pt-3 shadow-2xl"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}
      >
        <span className="bg-input mx-auto h-1.5 w-10 rounded-full" aria-hidden="true" />
        <h2 id={titleId} className="text-[17px] font-bold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
