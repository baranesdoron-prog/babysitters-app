import { cn } from '@/lib/utils'

/** שבוע/חודש, לשעה/למשמרת, הורה/בייביסיטר. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('bg-muted flex gap-1 rounded-lg p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-10 flex-1 rounded-md px-3 text-[15px] font-semibold transition-colors',
            value === o.value
              ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
              : 'text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
