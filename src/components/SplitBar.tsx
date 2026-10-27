import { Moon, Sun } from 'lucide-react'

import { formatHours } from '@/lib/utils'

/** Amber (day) / indigo (night) bar, labelled so color isn't the only cue. */
export function SplitBar({ dayHours, nightHours }: { dayHours: number; nightHours: number }) {
  const total = dayHours + nightHours || 1
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-2 overflow-hidden rounded-full" aria-hidden="true">
        {dayHours > 0 && <span className="bg-day" style={{ width: `${(dayHours / total) * 100}%` }} />}
        {nightHours > 0 && <span className="bg-night" style={{ width: `${(nightHours / total) * 100}%` }} />}
      </div>
      <div className="flex gap-3 text-xs">
        {dayHours > 0 && (
          <span className="text-day-foreground flex items-center gap-1">
            <Sun className="size-3.5" aria-hidden="true" /> יום {formatHours(dayHours)}
          </span>
        )}
        {nightHours > 0 && (
          <span className="text-night-foreground flex items-center gap-1">
            <Moon className="size-3.5" aria-hidden="true" /> לילה {formatHours(nightHours)}
          </span>
        )}
      </div>
    </div>
  )
}
