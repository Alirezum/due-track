import type { TimelineEntry } from '@/api/types'
import type { TimelineWindow, TimeHorizon } from '@/lib/timeline/horizons'

export const MARKER_WIDTH_PX = 140
export const MARKER_GAP_PX = 8

export type TickUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

export type TickInterval = {
  unit: TickUnit
  amount: number
  approxMs: number
}

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

const TICK_LADDER: readonly TickInterval[] = [
  { unit: 'minute', amount: 15, approxMs: 15 * MINUTE_MS },
  { unit: 'minute', amount: 30, approxMs: 30 * MINUTE_MS },
  { unit: 'hour', amount: 1, approxMs: HOUR_MS },
  { unit: 'hour', amount: 3, approxMs: 3 * HOUR_MS },
  { unit: 'hour', amount: 6, approxMs: 6 * HOUR_MS },
  { unit: 'hour', amount: 12, approxMs: 12 * HOUR_MS },
  { unit: 'day', amount: 1, approxMs: DAY_MS },
  { unit: 'day', amount: 3, approxMs: 3 * DAY_MS },
  { unit: 'week', amount: 1, approxMs: WEEK_MS },
  { unit: 'week', amount: 2, approxMs: 2 * WEEK_MS },
  { unit: 'month', amount: 1, approxMs: MONTH_MS },
  { unit: 'month', amount: 3, approxMs: 3 * MONTH_MS },
  { unit: 'month', amount: 6, approxMs: 6 * MONTH_MS },
  { unit: 'year', amount: 1, approxMs: YEAR_MS },
  { unit: 'year', amount: 2, approxMs: 2 * YEAR_MS },
  { unit: 'year', amount: 5, approxMs: 5 * YEAR_MS },
  { unit: 'year', amount: 10, approxMs: 10 * YEAR_MS },
  { unit: 'year', amount: 25, approxMs: 25 * YEAR_MS },
  { unit: 'year', amount: 50, approxMs: 50 * YEAR_MS },
]

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0
  }
  return Math.min(1, Math.max(0, ratio))
}

export function positionFor(dueMs: number, startMs: number, endMs: number): number {
  if (!(endMs > startMs) || !Number.isFinite(dueMs)) {
    return 0
  }
  return clampRatio((dueMs - startMs) / (endMs - startMs))
}

export function chooseTickInterval(
  startMs: number,
  endMs: number,
  width: number,
  _horizon: TimeHorizon,
): TickInterval {
  const duration = Math.max(1, endMs - startMs)
  const target = Math.min(8, Math.max(3, Math.floor(width / 120)))
  let best = TICK_LADDER[TICK_LADDER.length - 1]

  for (const candidate of TICK_LADDER) {
    const count = Math.ceil(duration / candidate.approxMs)
    if (count <= 8 && count >= 3) {
      best = candidate
      if (count <= target) {
        break
      }
    }
  }

  return best
}

function partNumber(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  return Number(parts.find((part) => part.type === type)?.value ?? 0)
}

function localPartsAt(ms: number, timezone: string): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
}

function zoneOffsetAt(ms: number, timezone: string): number {
  const parts = localPartsAt(ms, timezone)
  const asUtc = Date.UTC(
    partNumber(parts, 'year'),
    partNumber(parts, 'month') - 1,
    partNumber(parts, 'day'),
    partNumber(parts, 'hour'),
    partNumber(parts, 'minute'),
    partNumber(parts, 'second'),
  )
  return asUtc - Math.floor(ms / 1000) * 1000
}

function localDateToUtcMs(
  year: number,
  month: number,
  day: number,
  timezone: string,
): number {
  const guess = Date.UTC(year, month - 1, day)
  let offset = zoneOffsetAt(guess, timezone)
  let result = guess - offset
  const refined = zoneOffsetAt(result, timezone)
  if (refined !== offset) {
    offset = refined
    result = guess - offset
  }
  return result
}

function localMidnightMs(ms: number, timezone: string): number {
  const parts = localPartsAt(ms, timezone)
  return localDateToUtcMs(
    partNumber(parts, 'year'),
    partNumber(parts, 'month'),
    partNumber(parts, 'day'),
    timezone,
  )
}

function localDateParts(ms: number, timezone: string): { year: number; month: number } {
  const parts = localPartsAt(ms, timezone)
  return { year: partNumber(parts, 'year'), month: partNumber(parts, 'month') }
}

function addMonthsLocal(
  year: number,
  month: number,
  months: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + months
  return { year: Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 }
}

export function buildTicks(
  startMs: number,
  endMs: number,
  interval: TickInterval,
  timezone: string,
): number[] {
  if (!(endMs > startMs)) {
    return []
  }

  const ticks: number[] = []
  const guard = 512

  if (interval.unit === 'minute' || interval.unit === 'hour') {
    const offset = zoneOffsetAt(startMs, timezone)
    const localStart = startMs + offset
    const step = interval.approxMs
    let tick = Math.ceil(localStart / step) * step - offset
    while (tick <= endMs && ticks.length < guard) {
      if (tick >= startMs) {
        ticks.push(tick)
      }
      tick += step
    }
    return ticks
  }

  if (interval.unit === 'day' || interval.unit === 'week') {
    const stepDays = interval.unit === 'week' ? interval.amount * 7 : interval.amount
    let tick = localMidnightMs(startMs, timezone)
    while (tick < startMs) {
      const parts = localPartsAt(tick + DAY_MS, timezone)
      tick = localDateToUtcMs(
        partNumber(parts, 'year'),
        partNumber(parts, 'month'),
        partNumber(parts, 'day'),
        timezone,
      )
    }
    while (tick <= endMs && ticks.length < guard) {
      ticks.push(tick)
      const parts = localPartsAt(tick + stepDays * DAY_MS, timezone)
      tick = localDateToUtcMs(
        partNumber(parts, 'year'),
        partNumber(parts, 'month'),
        partNumber(parts, 'day'),
        timezone,
      )
    }
    return ticks
  }

  const stepMonths = interval.unit === 'year' ? interval.amount * 12 : interval.amount
  let { year, month } = localDateParts(startMs, timezone)
  let tick = localDateToUtcMs(year, month, 1, timezone)
  while (tick < startMs) {
    const advanced = addMonthsLocal(year, month, 1)
    year = advanced.year
    month = advanced.month
    tick = localDateToUtcMs(year, month, 1, timezone)
  }
  while (tick <= endMs && ticks.length < guard) {
    ticks.push(tick)
    const advanced = addMonthsLocal(year, month, stepMonths)
    year = advanced.year
    month = advanced.month
    tick = localDateToUtcMs(year, month, 1, timezone)
  }
  return ticks
}

export type MarkerAnchor = {
  entry: TimelineEntry
  dueMs: number
  x: number
}

export type SingleMarkerGroup = {
  kind: 'marker'
  key: string
  x: number
  dueMs: number
  entries: [TimelineEntry]
}

export type ClusterMarkerGroup = {
  kind: 'cluster'
  key: string
  x: number
  dueMs: number
  entries: TimelineEntry[]
}

export type MarkerGroup = SingleMarkerGroup | ClusterMarkerGroup

export function clusterMarkers(
  entries: TimelineEntry[],
  width: number,
  window: Pick<TimelineWindow, 'startMs' | 'endMs'>,
  markerWidth = MARKER_WIDTH_PX,
): MarkerGroup[] {
  const anchors: MarkerAnchor[] = entries
    .map((entry) => {
      const dueMs = Date.parse(entry.item.due_at_utc)
      return {
        entry,
        dueMs,
        x: positionFor(dueMs, window.startMs, window.endMs) * width,
      }
    })
    .filter((anchor) => Number.isFinite(anchor.dueMs))
    .sort((left, right) => left.dueMs - right.dueMs || left.entry.item.id - right.entry.item.id)

  const threshold = markerWidth + MARKER_GAP_PX
  const groups: MarkerGroup[] = []

  let current: {
    entries: TimelineEntry[]
    firstX: number
    lastX: number
    sumX: number
    dueMs: number
    key: string
  } | null = null

  function flush() {
    if (!current) {
      return
    }
    const items = current.entries
    groups.push({
      kind: items.length === 1 ? 'marker' : 'cluster',
      key: current.key,
      x: items.length === 1 ? current.firstX : current.sumX / items.length,
      dueMs: current.dueMs,
      entries: items as [TimelineEntry] | TimelineEntry[],
    } as MarkerGroup)
    current = null
  }

  for (const anchor of anchors) {
    if (current && Math.abs(anchor.x - current.lastX) < threshold) {
      current.entries.push(anchor.entry)
      current.sumX += anchor.x
      current.lastX = anchor.x
      current.key = `cluster-${current.entries[0].item.id}-${current.entries.length}`
    } else {
      flush()
      current = {
        entries: [anchor.entry],
        firstX: anchor.x,
        lastX: anchor.x,
        sumX: anchor.x,
        dueMs: anchor.dueMs,
        key: `marker-${anchor.entry.item.id}`,
      }
    }
  }
  flush()

  return groups
}

export type EdgeSummary = {
  edge: 'left' | 'right'
  count: number
  boundary: number
}

export function summarizeEdges(
  entries: TimelineEntry[],
  window: Pick<TimelineWindow, 'startMs' | 'endMs'>,
): { left: EdgeSummary | null; right: EdgeSummary | null } {
  const leftDues: number[] = []
  const rightDues: number[] = []

  for (const entry of entries) {
    const dueMs = Date.parse(entry.item.due_at_utc)
    if (!Number.isFinite(dueMs)) {
      continue
    }
    if (dueMs < window.startMs) {
      leftDues.push(dueMs)
    } else if (dueMs > window.endMs) {
      rightDues.push(dueMs)
    }
  }

  return {
    left:
      leftDues.length > 0
        ? { edge: 'left', count: leftDues.length, boundary: Math.min(...leftDues) }
        : null,
    right:
      rightDues.length > 0
        ? { edge: 'right', count: rightDues.length, boundary: Math.max(...rightDues) }
        : null,
  }
}
