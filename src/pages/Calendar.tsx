import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Settings as SettingsIcon } from 'lucide-react'

import { Avatar } from '@/components/Avatar'
import { Segmented } from '@/components/Segmented'
import { SplitBar } from '@/components/SplitBar'
import { ErrorText, Fab, Loading, PageHeader, Pill } from '@/components/bits'
import { fetchSettings } from '@/hooks/useSettings'
import { useLoad } from '@/hooks/useLoad'
import { splitShift } from '@/lib/billing'
import { shiftStatusLabels, shiftStatusTone, weekdayShort } from '@/lib/labels'
import { supabase } from '@/lib/supabase'
import type { Shift } from '@/lib/types'
import {
  addDays,
  cn,
  formatDayHeader,
  formatMonth,
  formatShortDate,
  formatTime,
  localParts,
  todayKey,
  weekdayOf,
  zonedToIso,
} from '@/lib/utils'

type CalendarShift = Shift & {
  babysitter: { full_name: string; photo_path: string | null } | null
  requests: { status: string; babysitter: { full_name: string } | null }[]
}

type View = 'week' | 'month'

function weekStart(date: string) {
  return addDays(date, -weekdayOf(date))
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`
}

function rangeFor(view: View, anchor: string): [string, string] {
  if (view === 'week') {
    const s = weekStart(anchor)
    return [s, addDays(s, 7)]
  }
  // Whole weeks around the month, so the grid has no gaps.
  const first = monthStart(anchor)
  const s = weekStart(first)
  const [y, m] = first.split('-').map(Number)
  const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
  const e = addDays(weekStart(addDays(nextMonth, -1)), 7)
  return [s, e]
}

export function Calendar() {
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'month' ? 'month' : 'week'
  const anchor = params.get('date') ?? todayKey()
  const [selected, setSelected] = useState<string>(anchor)
  const [from, to] = rangeFor(view, anchor)

  const { data, error } = useLoad(async () => {
    const [settings, shifts] = await Promise.all([
      fetchSettings(),
      supabase
        .from('shifts')
        .select(
          '*, babysitter:babysitters(full_name, photo_path), requests:shift_requests(status, babysitter:babysitters(full_name))',
        )
        .neq('status', 'cancelled')
        .gte('end_at', zonedToIso(from, '00:00'))
        .lt('start_at', zonedToIso(to, '00:00'))
        .order('start_at'),
    ])
    if (shifts.error) throw new Error('לא הצלחנו לטעון את היומן.')
    return { settings, shifts: shifts.data as unknown as CalendarShift[] }
  }, [from, to])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarShift[]>()
    for (const s of data?.shifts ?? []) {
      const d = localParts(s.start_at).date
      map.set(d, [...(map.get(d) ?? []), s])
    }
    return map
  }, [data])

  function go(next: { view?: View; date?: string }) {
    const p = new URLSearchParams(params)
    if (next.view) p.set('view', next.view)
    if (next.date) p.set('date', next.date)
    setParams(p, { replace: true })
  }

  function step(dir: 1 | -1) {
    if (view === 'week') {
      go({ date: addDays(weekStart(anchor), 7 * dir) })
    } else {
      const [y, m] = anchor.split('-').map(Number)
      go({ date: new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10) })
    }
  }

  const days = Array.from({ length: (Date.parse(to) - Date.parse(from)) / 86400000 }, (_, i) => addDays(from, i))
  const today = todayKey()
  const title = view === 'week'
    ? `${formatShortDate(from)}–${formatShortDate(addDays(to, -1))}`
    : formatMonth(anchor)

  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader
        title="יומן"
        action={
          <Link to="/settings" aria-label="הגדרות" className="text-muted-foreground flex size-11 items-center justify-center rounded-lg">
            <SettingsIcon className="size-5" />
          </Link>
        }
      />

      <Segmented
        label="תצוגה"
        value={view}
        onChange={(v) => go({ view: v })}
        options={[
          { value: 'week', label: 'שבוע' },
          { value: 'month', label: 'חודש' },
        ]}
      />

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} aria-label="הקודם" className="flex size-11 items-center justify-center rounded-lg">
          <ChevronRight className="size-5" />
        </button>
        <div className="flex flex-col items-center">
          <p className="font-display text-[17px] font-semibold" dir={view === 'week' ? 'ltr' : undefined}>{title}</p>
          {!days.includes(today) && (
            <button type="button" onClick={() => { go({ date: today }); setSelected(today) }} className="text-primary text-sm font-semibold">
              חזרה להיום
            </button>
          )}
        </div>
        <button type="button" onClick={() => step(1)} aria-label="הבא" className="flex size-11 items-center justify-center rounded-lg">
          <ChevronLeft className="size-5" />
        </button>
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {!data && !error && <Loading />}

      {data && view === 'week' && (
        <div className="flex flex-col gap-3">
          {days.map((d) => (
            <DayBlock key={d} date={d} today={today} shifts={byDay.get(d) ?? []} nightStart={data.settings.night_start} />
          ))}
        </div>
      )}

      {data && view === 'month' && (
        <>
          <MonthGrid
            days={days}
            month={anchor.slice(0, 7)}
            today={today}
            selected={selected}
            onSelect={setSelected}
            byDay={byDay}
            nightStart={data.settings.night_start}
          />
          <DayBlock date={selected} today={today} shifts={byDay.get(selected) ?? []} nightStart={data.settings.night_start} />
        </>
      )}

      <Fab to={`/shifts/new?date=${view === 'month' ? selected : today >= from && today < to ? today : from}`} label="משמרת חדשה" />
    </div>
  )
}

function DayBlock({ date, today, shifts, nightStart }: {
  date: string
  today: string
  shifts: CalendarShift[]
  nightStart: string
}) {
  const [, , d] = date.split('-')
  return (
    <section className="bg-card flex gap-3 rounded-xl p-4" aria-label={formatDayHeader(date)}>
      <div className={cn('flex w-11 shrink-0 flex-col items-center', date === today && 'text-primary')}>
        <span className="text-sm font-semibold">{weekdayShort[weekdayOf(date)]}</span>
        <span className="font-display text-[26px] leading-tight font-semibold">{Number(d)}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {shifts.length === 0 ? (
          <Link to={`/shifts/new?date=${date}`} className="text-subtle-foreground flex min-h-12 items-center text-[15px]">
            אין משמרות · <span className="text-primary ms-1 font-semibold">+ הוספה</span>
          </Link>
        ) : (
          shifts.map((s) => <ShiftRow key={s.id} shift={s} nightStart={nightStart} />)
        )}
      </div>
    </section>
  )
}

function ShiftRow({ shift, nightStart }: { shift: CalendarShift; nightStart: string }) {
  const split = splitShift(shift.start_at, shift.end_at, nightStart)
  const asking = shift.requests.find((r) => r.status === 'sent')?.babysitter?.full_name
  const name = shift.babysitter?.full_name ?? (asking ? `שואלים את ${asking}` : 'עוד לא נבחרה')
  return (
    <Link
      to={`/shifts/${shift.id}`}
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        shift.status === 'requested' && 'border-day border-dashed',
        shift.status === 'confirmed' && 'border-primary-soft bg-primary-soft/40',
        shift.status !== 'requested' && shift.status !== 'confirmed' && 'border-border',
      )}
    >
      <div className="flex items-center gap-2">
        {shift.babysitter && <Avatar name={shift.babysitter.full_name} path={shift.babysitter.photo_path} size={40} />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{name}</p>
          <p className="text-muted-foreground text-sm">
            <span dir="ltr">{formatTime(shift.start_at)}–{formatTime(shift.end_at)}</span>
          </p>
        </div>
        <Pill className={shiftStatusTone[shift.status]}>{shiftStatusLabels[shift.status]}</Pill>
      </div>
      <SplitBar dayHours={split.dayHours} nightHours={split.nightHours} />
    </Link>
  )
}

function MonthGrid({ days, month, today, selected, onSelect, byDay, nightStart }: {
  days: string[]
  month: string
  today: string
  selected: string
  onSelect: (d: string) => void
  byDay: Map<string, CalendarShift[]>
  nightStart: string
}) {
  return (
    <section className="bg-card rounded-xl p-3">
      <div className="text-muted-foreground grid grid-cols-7 pb-1 text-center text-xs font-semibold">
        {weekdayShort.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const shifts = byDay.get(d) ?? []
          const split = shifts.reduce(
            (acc, s) => {
              const p = splitShift(s.start_at, s.end_at, nightStart)
              return { day: acc.day + p.dayHours, night: acc.night + p.nightHours }
            },
            { day: 0, night: 0 },
          )
          const total = split.day + split.night
          return (
            <button
              key={d}
              type="button"
              onClick={() => onSelect(d)}
              aria-pressed={selected === d}
              aria-label={`${formatDayHeader(d)}${shifts.length ? `, ${shifts.length} משמרות` : ''}`}
              className={cn(
                'flex min-h-12 flex-col items-center gap-1 rounded-lg py-1',
                d.slice(0, 7) !== month && 'text-subtle-foreground',
                selected === d && 'bg-primary text-primary-foreground',
              )}
            >
              <span className={cn('font-display text-[15px] font-semibold', d === today && selected !== d && 'text-primary')}>
                {Number(d.slice(8))}
              </span>
              {total > 0 && (
                <span className="flex h-1.5 w-7 overflow-hidden rounded-full" aria-hidden="true">
                  {split.day > 0 && <span className="bg-day" style={{ width: `${(split.day / total) * 100}%` }} />}
                  {split.night > 0 && <span className="bg-night" style={{ width: `${(split.night / total) * 100}%` }} />}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
