import type { ComponentProps, ReactNode } from 'react'
import { AlertTriangle, ChevronRight, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

/** Page title, with an optional back link (sub-pages). */
export function PageHeader({ title, back, action }: { title: string; back?: string; action?: ReactNode }) {
  return (
    <header className="flex min-h-11 items-center gap-2">
      {back && (
        <Link
          to={back}
          aria-label="חזרה"
          className="text-foreground -ms-2 flex size-11 items-center justify-center rounded-lg"
        >
          <ChevronRight className="size-6" />
        </Link>
      )}
      <h1 className={cn('font-display flex-1 font-semibold', back ? 'text-[22px]' : 'text-[26px]')}>{title}</h1>
      {action}
    </header>
  )
}

export function Section({ title, action, className, children }: {
  title?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('bg-card flex flex-col gap-3 rounded-xl p-4', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h2 className="text-[17px] font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', className)}>
      {children}
    </span>
  )
}

/** Capability tag ("✓ עוזרת בשיעורים"); `missing` renders it as a warning. */
export function Tag({ missing, children }: { missing?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold',
        missing ? 'bg-warning-soft text-warning-foreground' : 'bg-primary-soft text-primary-strong',
      )}
    >
      {!missing && '✓ '}
      {children}
    </span>
  )
}

export function WarningBox({ children }: { children: ReactNode }) {
  return (
    <div className="bg-warning-soft text-warning-foreground flex items-start gap-2 rounded-lg p-3 text-[15px]" role="note">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  )
}

export function CallButton({ name, phone }: { name: string; phone: string }) {
  return (
    <a
      href={`tel:${phone}`}
      aria-label={`להתקשר ל${name}`}
      className="bg-primary-soft text-primary-strong flex size-11 shrink-0 items-center justify-center rounded-lg"
    >
      <Phone className="size-5" />
    </a>
  )
}

export function Loading() {
  return <p className="text-muted-foreground py-8 text-center text-[15px]">טוען…</p>
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="text-destructive text-[15px]" role="alert">
      {children}
    </p>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground py-6 text-center text-[15px]">{children}</p>
}

/** Full-width primary action — one per screen. */
export function PrimaryButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={cn(
        'bg-primary text-primary-foreground flex h-[52px] w-full items-center justify-center gap-2 rounded-lg text-[17px] font-semibold disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function SecondaryButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      className={cn(
        'border-input bg-card text-foreground flex h-[52px] w-full items-center justify-center gap-2 rounded-lg border text-[17px] font-semibold disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export function TextButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn('text-primary flex min-h-11 items-center gap-1 text-[15px] font-semibold disabled:opacity-50', className)}
      {...props}
    />
  )
}

/** Label + control stacked. */
export function Field({ label, htmlFor, hint, children }: {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-muted-foreground text-sm">{hint}</p>}
    </div>
  )
}

/** A checkbox row with a label (and optional explanation). */
export function CheckRow({ checked, onChange, label, hint }: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="border-muted flex min-h-12 items-center gap-3 border-b py-2 last:border-b-0">
      <input
        type="checkbox"
        className="accent-primary size-5 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col">
        <span className="text-[15px]">{label}</span>
        {hint && <span className="text-muted-foreground text-sm">{hint}</span>}
      </span>
    </label>
  )
}

/** A link styled as the floating "+" action. */
export function Fab({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="bg-primary text-primary-foreground fixed bottom-24 end-4 z-10 flex size-14 items-center justify-center rounded-full text-3xl shadow-lg"
    >
      <span aria-hidden="true">+</span>
    </Link>
  )
}
