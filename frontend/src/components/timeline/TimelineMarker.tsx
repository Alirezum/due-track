import type { CSSProperties } from 'react'
import type { TimelineEntry } from '@/api/types'
import { formatCountdown } from '@/lib/timeline/countdown'
import { formatTimelineDue } from '@/lib/timeline/format'
import { entryAriaLabel } from '@/lib/timeline/labels'
import {
  PRIORITY_LABEL,
  PRIORITY_SHORT_LABEL,
  URGENCY_CHIP_CLASS,
  URGENCY_SHORT_LABEL,
  markerSide,
} from '@/lib/timeline/status'
import { cn } from '@/lib/utils'

type TimelineMarkerProps = {
  entry: TimelineEntry
  liveNowMs: number
  timezone: string
  selected?: boolean
  highlighted?: boolean
  orientation?: 'horizontal' | 'vertical'
  xPercent?: number
  onSelect?: (entry: TimelineEntry) => void
  buttonRef?: (node: HTMLButtonElement | null) => void
}

const NOTCHED_TAG_STYLE: CSSProperties = {
  clipPath: 'polygon(0 0, 100% 0, 100% 62%, 50% 100%, 0 62%)',
}

function nodeClasses(entry: TimelineEntry): string {
  if (entry.item.is_date_only) {
    return 'h-2.5 w-2.5 rounded-[1px] border-2 bg-timeline-paper'
  }

  switch (entry.urgency) {
    case 'overdue':
      return 'h-3 w-2.5 bg-timeline-overdue'
    case 'due_now':
      return 'h-2.5 w-2.5 rotate-45 bg-timeline-now'
    case 'within_24h':
      return 'h-2.5 w-2.5 rounded-full bg-timeline-imminent'
    case 'within_7d':
      return 'h-2.5 w-2.5 rounded-full border-2 bg-timeline-paper'
    case 'later':
      return 'h-0.5 w-3 bg-timeline-later'
  }
}

function nodeTone(entry: TimelineEntry): string {
  if (entry.item.is_date_only) {
    return entry.urgency === 'overdue'
      ? 'border-timeline-overdue'
      : entry.urgency === 'due_now'
        ? 'border-timeline-now'
        : 'border-timeline-later'
  }

  switch (entry.urgency) {
    case 'within_7d':
      return 'border-timeline-soon'
    default:
      return ''
  }
}

export function TimelineMarker({
  entry,
  liveNowMs,
  timezone,
  selected = false,
  highlighted = false,
  orientation = 'horizontal',
  xPercent = 50,
  onSelect,
  buttonRef,
}: TimelineMarkerProps) {
  const dueMs = Date.parse(entry.item.due_at_utc)
  const remaining = Number.isFinite(dueMs) ? Math.floor((dueMs - liveNowMs) / 1000) : 0
  const countdown = formatCountdown(remaining, entry.urgency)
  const dueLabel = formatTimelineDue(
    entry.item.due_at_utc,
    timezone,
    entry.item.is_date_only,
  )
  const side = markerSide(entry.urgency)
  const alignment =
    xPercent < 15
      ? 'left-0'
      : xPercent > 85
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2'

  const card = (
    <span
      className={cn(
        'absolute z-10 grid w-[9.25rem] gap-1 rounded-[4px] border bg-card px-2.5 py-2 text-left transition-[border-color,transform]',
        side === 'above' ? 'bottom-6' : 'top-6',
        alignment,
        selected
          ? 'border-timeline-soon ring-2 ring-ring ring-offset-2 ring-offset-timeline-paper'
          : 'border-border hover:border-timeline-rule',
        highlighted && 'timeline-highlight border-timeline-highlight ring-2 ring-timeline-highlight',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-sans text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase tabular-nums">
          {dueLabel}
        </span>
        <span
          className={cn(
            'inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] px-1 font-sans text-[0.625rem] leading-none font-bold',
            URGENCY_CHIP_CLASS[entry.urgency],
          )}
        >
          {PRIORITY_SHORT_LABEL[entry.item.priority]}
        </span>
      </span>
      <span className="line-clamp-2 font-sans text-[0.8125rem] leading-[1.35] font-medium [overflow-wrap:anywhere]">
        {entry.item.title}
      </span>
      <span
        className={cn(
          'font-sans text-[0.9375rem] leading-tight font-semibold tabular-nums',
          entry.urgency === 'overdue' && 'text-timeline-overdue',
          entry.urgency === 'due_now' && 'text-timeline-now',
          entry.urgency === 'within_24h' && 'text-timeline-imminent',
          entry.urgency === 'within_7d' && 'text-timeline-soon',
          entry.urgency === 'later' && 'text-timeline-later',
        )}
      >
        {countdown}
      </span>
    </span>
  )

  const node = (
    <span
      aria-hidden="true"
      data-node-shape={entry.item.is_date_only ? 'square' : entry.urgency}
      style={entry.urgency === 'overdue' ? NOTCHED_TAG_STYLE : undefined}
      className={cn('relative z-20 block shrink-0', nodeClasses(entry), nodeTone(entry))}
    />
  )

  if (orientation === 'vertical') {
    return (
      <li className="relative pl-7 [content-visibility:auto]">
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0 bottom-0 left-[0.3125rem] w-px',
            entry.urgency === 'overdue' ? 'bg-timeline-overdue/35' : 'bg-timeline-rule/30',
          )}
        />
        <button
          ref={buttonRef}
          type="button"
          onClick={() => onSelect?.(entry)}
          aria-current={selected ? 'true' : undefined}
          aria-label={entryAriaLabel(entry, liveNowMs, timezone)}
          data-timeline-marker=""
          data-entry-id={entry.item.id}
          className={cn(
            'group relative -ml-7 grid w-full grid-cols-[0.625rem_minmax(0,1fr)] items-start gap-3 rounded-[4px] py-2 pr-2 pl-0 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          )}
        >
          <span className="flex h-6 items-center justify-center">{node}</span>
          <span
            className={cn(
              'grid gap-1 rounded-[4px] border-l-2 bg-card px-3 py-2 transition-colors',
              entry.urgency === 'overdue'
                ? 'border-l-timeline-overdue'
                : entry.urgency === 'due_now'
                  ? 'border-l-timeline-now'
                  : entry.urgency === 'within_24h'
                    ? 'border-l-timeline-imminent'
                    : entry.urgency === 'within_7d'
                      ? 'border-l-timeline-soon'
                      : 'border-l-timeline-later',
              selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
              highlighted && 'timeline-highlight ring-2 ring-timeline-highlight',
            )}
          >
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-sans text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase tabular-nums">
                {dueLabel}
              </span>
              <span className="font-sans text-[0.625rem] font-semibold text-muted-foreground">
                {PRIORITY_LABEL[entry.item.priority]} · {URGENCY_SHORT_LABEL[entry.urgency]}
              </span>
            </span>
            <span className="line-clamp-2 font-sans text-sm leading-snug font-medium [overflow-wrap:anywhere]">
              {entry.item.title}
            </span>
            <span
              className={cn(
                'font-sans text-sm font-semibold tabular-nums',
                entry.urgency === 'overdue' && 'text-timeline-overdue',
                entry.urgency === 'due_now' && 'text-timeline-now',
                entry.urgency === 'within_24h' && 'text-timeline-imminent',
                entry.urgency === 'within_7d' && 'text-timeline-soon',
                entry.urgency === 'later' && 'text-timeline-later',
              )}
            >
              {countdown}
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <li className="absolute inset-y-0" style={{ left: `${xPercent}%` }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onSelect?.(entry)}
        aria-current={selected ? 'true' : undefined}
        aria-label={entryAriaLabel(entry, liveNowMs, timezone)}
        className="group absolute top-1/2 left-0 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-side={side}
        data-urgency={entry.urgency}
        data-date-only={entry.item.is_date_only ? 'true' : undefined}
        data-timeline-marker=""
        data-entry-id={entry.item.id}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-1/2 w-px -translate-x-1/2 bg-timeline-rule',
            side === 'above' ? 'bottom-1/2 h-6' : 'top-1/2 h-6',
          )}
        />
        {node}
        {card}
      </button>
    </li>
  )
}
