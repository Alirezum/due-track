import { Button } from '@/components/ui/button'
import type { TimelineEntry } from '@/api/types'
import { formatAmount, formatLocalDate } from '@/lib/format'
import { recurrenceAnchorSummary, recurrenceSummary } from '@/lib/recurrence'
import { formatCountdown } from '@/lib/timeline/countdown'
import { formatTimelineDueExact } from '@/lib/timeline/format'
import { entryAriaLabel } from '@/lib/timeline/labels'
import {
  PRIORITY_LABEL,
  URGENCY_CHIP_CLASS,
  URGENCY_LABEL,
} from '@/lib/timeline/status'
import { cn } from '@/lib/utils'

export type TimelineDetailProps = {
  entry: TimelineEntry
  currencyCode: string
  timezone: string
  liveNowMs: number
  onComplete: (entry: TimelineEntry) => void
  onEdit: (entry: TimelineEntry) => void
  onDelete: (entry: TimelineEntry) => void
}

export function TimelineDetail({
  entry,
  currencyCode,
  timezone,
  liveNowMs,
  onComplete,
  onEdit,
  onDelete,
}: TimelineDetailProps) {
  const { item } = entry
  const dueMs = Date.parse(item.due_at_utc)
  const remaining = Number.isFinite(dueMs) ? Math.floor((dueMs - liveNowMs) / 1000) : 0
  const countdown = formatCountdown(remaining, entry.urgency)
  const amount = formatAmount(item.amount_cents, currencyCode)
  const recurrence = recurrenceSummary(item)
  const anchor = recurrenceAnchorSummary(item)

  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <span className="font-sans text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Deadline
        </span>
        <h2 className="font-display text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.025em] [overflow-wrap:anywhere]">
          {item.title}
        </h2>
        <p
          className="font-sans text-sm text-muted-foreground tabular-nums"
          aria-label={entryAriaLabel(entry, liveNowMs, timezone)}
        >
          {formatTimelineDueExact(item.due_at_utc, timezone, item.is_date_only)}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex items-center rounded-[3px] px-2 py-1 font-sans text-[0.6875rem] font-semibold',
            URGENCY_CHIP_CLASS[entry.urgency],
          )}
        >
          {URGENCY_LABEL[entry.urgency]}
        </span>
        <span className="inline-flex items-center rounded-[3px] border border-border px-2 py-1 font-sans text-[0.6875rem] font-semibold text-muted-foreground">
          {PRIORITY_LABEL[item.priority]} priority
        </span>
        {item.category ? (
          <span className="inline-flex items-center rounded-[3px] border border-border px-2 py-1 font-sans text-[0.6875rem] font-semibold text-muted-foreground">
            {item.category}
          </span>
        ) : null}
      </div>

      <p className="font-display text-2xl font-semibold tabular-nums">{countdown}</p>

      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-border pt-4 font-sans text-sm">
        <dt className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Due
        </dt>
        <dd className="tabular-nums [overflow-wrap:anywhere]">
          {formatTimelineDueExact(item.due_at_utc, timezone, item.is_date_only)}
        </dd>

        <dt className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Status
        </dt>
        <dd>
          {URGENCY_LABEL[entry.urgency]} · {countdown}
        </dd>

        <dt className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Priority
        </dt>
        <dd>{PRIORITY_LABEL[item.priority]}</dd>

        <dt className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Category
        </dt>
        <dd className="[overflow-wrap:anywhere]">{item.category ?? 'None'}</dd>

        <dt className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Amount
        </dt>
        <dd className="tabular-nums">{amount ?? '—'}</dd>

        <dt className="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Repeats
        </dt>
        <dd className="grid gap-1">
          <span>{recurrence ?? 'Does not repeat'}</span>
          {anchor ? <span className="text-muted-foreground">{anchor}</span> : null}
          {item.recurrence_end_date ? (
            <span className="text-muted-foreground">
              Ends {formatLocalDate(item.recurrence_end_date)}
            </span>
          ) : null}
          {item.recurrence_remaining_count !== null && item.recurrence_freq !== 'none' ? (
            <span className="text-muted-foreground">
              {item.recurrence_remaining_count}{' '}
              {item.recurrence_remaining_count === 1 ? 'occurrence remains' : 'occurrences remain'}
            </span>
          ) : null}
        </dd>
      </dl>

      <section aria-label="Notes" className="grid gap-2 border-t border-border pt-4">
        <h3 className="font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Notes
        </h3>
        <p className="font-sans text-sm leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]">
          {item.notes.trim() ? item.notes : 'No notes.'}
        </p>
      </section>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          type="button"
          size="sm"
          onClick={() => onComplete(entry)}
          aria-label={`Complete ${item.title}`}
        >
          Complete
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onEdit(entry)}
          aria-label={`Edit ${item.title}`}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => onDelete(entry)}
          aria-label={`Delete ${item.title}`}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}
