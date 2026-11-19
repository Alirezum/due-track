import type { TimelineEntry } from '@/api/types'
import { formatCountdown } from '@/lib/timeline/countdown'
import { formatTimelineDue } from '@/lib/timeline/format'
import { PRIORITY_LABEL } from '@/lib/timeline/status'

export function entryAriaLabel(
  entry: TimelineEntry,
  liveNowMs: number,
  timezone: string,
): string {
  const dueMs = Date.parse(entry.item.due_at_utc)
  const remaining = Number.isFinite(dueMs) ? Math.floor((dueMs - liveNowMs) / 1000) : 0
  const countdown = formatCountdown(remaining, entry.urgency)
  const due = formatTimelineDue(entry.item.due_at_utc, timezone, entry.item.is_date_only)
  const category = entry.item.category ? `, ${entry.item.category}` : ''
  return `${entry.item.title}, ${PRIORITY_LABEL[entry.item.priority]} priority, due ${due}, ${countdown}${category}`
}
