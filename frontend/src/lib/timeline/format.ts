import type { TimeHorizon } from '@/lib/timeline/horizons'

type PartType = Intl.DateTimeFormatPartTypes

function formatParts(
  date: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
  locale = 'en-US',
): Map<PartType, string> {
  const parts = new Intl.DateTimeFormat(locale, { ...options, timeZone }).formatToParts(date)
  return new Map(parts.map((part) => [part.type, part.value]))
}

function formatTime(date: Date, timeZone: string, locale?: string): string {
  const parts = formatParts(
    date,
    timeZone,
    { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
    locale,
  )
  return `${parts.get('hour')}:${parts.get('minute')}`
}

function formatMonthDay(date: Date, timeZone: string, locale?: string): string {
  const parts = formatParts(date, timeZone, { month: 'short', day: 'numeric' }, locale)
  return `${parts.get('month')} ${parts.get('day')}`
}

export function formatTimelineDue(
  iso: string,
  timezone: string,
  isDateOnly: boolean,
  locale?: string,
): string {
  const date = new Date(iso)
  const day = formatMonthDay(date, timezone, locale)
  return isDateOnly ? `${day} · All day` : `${day} · ${formatTime(date, timezone, locale)}`
}

export function formatTimelineDayHeader(iso: string, timezone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(new Date(iso))
}

export function formatTimelineTick(
  iso: string,
  timezone: string,
  horizon: TimeHorizon,
  locale?: string,
): string {
  const date = new Date(iso)
  if (horizon === '24h') {
    return formatTime(date, timezone, locale)
  }
  if (horizon === '1y' || horizon === 'all') {
    const parts = formatParts(date, timezone, { month: 'short', year: 'numeric' }, locale)
    return `${parts.get('month')} ${parts.get('year')}`
  }
  return formatMonthDay(date, timezone, locale)
}

export function formatVisibleSpan(
  startMs: number,
  endMs: number,
  timezone: string,
  locale?: string,
): string {
  const start = new Date(startMs)
  const end = new Date(endMs)
  const startYear = formatParts(start, timezone, { year: 'numeric' }, locale).get('year')
  const endYear = formatParts(end, timezone, { year: 'numeric' }, locale).get('year')
  const startDay = formatMonthDay(start, timezone, locale)
  const endDay = formatMonthDay(end, timezone, locale)

  if (startYear === endYear) {
    return `${startDay} – ${endDay}, ${endYear}`
  }
  return `${startDay}, ${startYear} – ${endDay}, ${endYear}`
}
