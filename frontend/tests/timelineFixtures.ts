import type {
  DueItem,
  Priority,
  RecurrenceFrequency,
  TimelineEntry,
  TimelineResponse,
  Urgency,
} from '@/api/types'

export const FIXED_REFERENCE = '2026-11-05T12:00:00Z'
export const FIXED_REFERENCE_MS = Date.parse(FIXED_REFERENCE)
export const TIMELINE_TIMEZONE = 'America/New_York'
export const TIMELINE_CURRENCY = 'USD'

type TimelineEntryOptions = {
  id: number
  title: string
  dueAtUtc: string
  urgency?: Urgency
  secondsUntilDue?: number
  notes?: string
  category?: string | null
  priority?: Priority
  amountCents?: number | null
  recurrenceFreq?: RecurrenceFrequency
  recurrenceInterval?: number
  recurrenceAnchorMode?: DueItem['recurrence_anchor_mode']
  recurrenceAnchorDay?: number | null
  recurrenceEndDate?: string | null
  recurrenceRemainingCount?: number | null
  isDateOnly?: boolean
  dueLocalDate?: string
  dueLocalTime?: string | null
}

export function makeTimelineEntry(options: TimelineEntryOptions): TimelineEntry {
  const {
    id,
    title,
    dueAtUtc,
    urgency = 'later',
    secondsUntilDue = Math.floor((Date.parse(dueAtUtc) - FIXED_REFERENCE_MS) / 1000),
    notes = '',
    category = null,
    priority = 'medium',
    amountCents = null,
    recurrenceFreq = 'none',
    recurrenceInterval = 1,
    recurrenceAnchorMode = 'schedule',
    recurrenceAnchorDay = null,
    recurrenceEndDate = null,
    recurrenceRemainingCount = null,
    isDateOnly = false,
    dueLocalDate = dueAtUtc.slice(0, 10),
    dueLocalTime = isDateOnly ? null : '09:00',
  } = options

  return {
    item: {
      id,
      title,
      notes,
      due_at_utc: dueAtUtc,
      is_date_only: isDateOnly,
      due_local_date: dueLocalDate,
      due_local_time: dueLocalTime,
      category,
      priority,
      amount_cents: amountCents,
      recurrence_freq: recurrenceFreq,
      recurrence_interval: recurrenceInterval,
      recurrence_anchor_mode: recurrenceAnchorMode,
      recurrence_anchor_day: recurrenceAnchorDay,
      recurrence_end_date: recurrenceEndDate,
      recurrence_remaining_count: recurrenceRemainingCount,
      status: 'active',
      is_recurring: recurrenceFreq !== 'none',
      created_at_utc: '2026-10-01T12:00:00Z',
      updated_at_utc: '2026-10-01T12:00:00Z',
    },
    urgency,
    seconds_until_due: secondsUntilDue,
  }
}

export function makeTimelineResponse(
  entries: TimelineEntry[],
  overrides: Partial<TimelineResponse> = {},
): TimelineResponse {
  return {
    reference_time_utc: FIXED_REFERENCE,
    timezone: TIMELINE_TIMEZONE,
    currency_code: TIMELINE_CURRENCY,
    overdue_count: entries.filter((entry) => entry.urgency === 'overdue').length,
    entries,
    ...overrides,
  }
}

function urgencyFor(dueAtUtc: string): Urgency {
  const seconds = (Date.parse(dueAtUtc) - FIXED_REFERENCE_MS) / 1000
  if (seconds < 0) return 'overdue'
  if (seconds === 0) return 'due_now'
  if (seconds <= 86_400) return 'within_24h'
  if (seconds <= 604_800) return 'within_7d'
  return 'later'
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

function iso(offsetMs: number): string {
  return new Date(FIXED_REFERENCE_MS + offsetMs).toISOString()
}

export function makeDenseTimeline(): TimelineResponse {
  const entries: TimelineEntry[] = [
    makeTimelineEntry({
      id: 1,
      title: 'Overdue electricity',
      dueAtUtc: iso(-3 * DAY),
      urgency: 'overdue',
      category: 'Bills',
      priority: 'high',
      amountCents: 12000,
      recurrenceFreq: 'monthly',
      recurrenceInterval: 1,
      recurrenceAnchorDay: 2,
    }),
    makeTimelineEntry({
      id: 2,
      title: 'Overdue dentist',
      dueAtUtc: iso(-26 * HOUR),
      urgency: 'overdue',
      category: 'Health',
      priority: 'critical',
    }),
    makeTimelineEntry({
      id: 3,
      title: 'Due exactly now',
      dueAtUtc: FIXED_REFERENCE,
      urgency: 'due_now',
      category: 'Inbox',
      priority: 'medium',
    }),
    makeTimelineEntry({
      id: 4,
      title: 'Call the plumber',
      dueAtUtc: iso(HOUR),
      urgency: 'within_24h',
      category: 'Home',
      priority: 'high',
    }),
    makeTimelineEntry({
      id: 5,
      title: 'Submit expense report',
      dueAtUtc: iso(6 * HOUR),
      urgency: 'within_24h',
      category: 'Work',
      priority: 'medium',
    }),
    makeTimelineEntry({
      id: 6,
      title: 'Date-only passport renewal',
      dueAtUtc: '2026-11-07T04:59:59.999999Z',
      urgency: 'within_7d',
      category: 'Travel',
      priority: 'low',
      isDateOnly: true,
      dueLocalDate: '2026-11-06',
    }),
    makeTimelineEntry({
      id: 7,
      title: 'Team retro',
      dueAtUtc: iso(2 * DAY),
      urgency: 'within_7d',
      category: 'Work',
      priority: 'medium',
      recurrenceFreq: 'weekly',
      recurrenceInterval: 1,
    }),
    makeTimelineEntry({
      id: 8,
      title: 'Refill prescription',
      dueAtUtc: iso(5 * DAY),
      urgency: 'within_7d',
      category: 'Health',
      priority: 'high',
    }),
    makeTimelineEntry({
      id: 9,
      title: 'Quarterly tax estimate',
      dueAtUtc: iso(20 * DAY),
      urgency: 'later',
      category: 'Bills',
      priority: 'critical',
      amountCents: 85000,
    }),
    makeTimelineEntry({
      id: 10,
      title:
        'A very long deadline title that should wrap and clamp gracefully without ever clipping the essential countdown',
      dueAtUtc: iso(45 * DAY),
      urgency: 'later',
      category: 'Personal',
      priority: 'low',
      notes: 'A long note that belongs in the detail view.',
    }),
  ]

  for (let index = 0; index < 20; index += 1) {
    entries.push(
      makeTimelineEntry({
        id: 100 + index,
        title: `Cluster deadline ${String(index + 1).padStart(2, '0')}`,
        dueAtUtc: iso(3 * DAY),
        urgency: 'within_7d',
        category: 'Cluster',
        priority: 'medium',
      }),
    )
  }

  entries.sort(
    (left, right) =>
      Date.parse(left.item.due_at_utc) - Date.parse(right.item.due_at_utc) ||
      left.item.id - right.item.id,
  )
  return makeTimelineResponse(entries)
}

export function makeThousandEntryTimeline(): TimelineResponse {
  const entries = Array.from({ length: 1000 }, (_, index) =>
    makeTimelineEntry({
      id: index + 1,
      title: `Benchmark item ${String(index + 1).padStart(4, '0')}`,
      dueAtUtc: new Date(FIXED_REFERENCE_MS + (index + 1) * HOUR).toISOString(),
      urgency: urgencyFor(new Date(FIXED_REFERENCE_MS + (index + 1) * HOUR).toISOString()),
      category: 'Benchmark',
      priority: 'medium',
    }),
  )
  return makeTimelineResponse(entries)
}
