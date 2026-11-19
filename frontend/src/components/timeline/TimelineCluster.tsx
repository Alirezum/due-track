import { useId, useRef, useState } from 'react'
import type { TimelineEntry } from '@/api/types'
import { URGENCY_LABEL } from '@/lib/timeline/status'
import { formatCountdown } from '@/lib/timeline/countdown'
import { formatTimelineDue } from '@/lib/timeline/format'
import { entryAriaLabel } from '@/lib/timeline/labels'
import { cn } from '@/lib/utils'

type TimelineClusterProps = {
  entries: TimelineEntry[]
  xPercent: number
  liveNowMs: number
  timezone: string
  selectedId?: number | null
  highlightedId?: number | null
  onSelect?: (entry: TimelineEntry) => void
  registerMarkerRef?: (id: number, node: HTMLButtonElement | null) => void
}

export function TimelineCluster({
  entries,
  xPercent,
  liveNowMs,
  timezone,
  selectedId = null,
  highlightedId = null,
  onSelect,
  registerMarkerRef,
}: TimelineClusterProps) {
  const panelId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [dismissedFor, setDismissedFor] = useState<number | null>(null)
  const selectedInsideId =
    entries.find((entry) => entry.item.id === selectedId)?.item.id ?? null
  const selectedInside = selectedInsideId !== null
  const isSuppressed = selectedInsideId !== null && dismissedFor === selectedInsideId

  const isOpen = !isSuppressed && (open || selectedInside)
  const alignment =
    xPercent < 22 ? 'left-0' : xPercent > 78 ? 'right-0' : 'left-1/2 -translate-x-1/2'

  function collapse() {
    setOpen(false)
    setDismissedFor(selectedInsideId)
    buttonRef.current?.focus()
  }

  return (
    <li className="absolute inset-y-0" style={{ left: `${xPercent}%` }}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={`${entries.length} deadlines here`}
        data-timeline-cluster=""
        onClick={() => {
          if (isOpen) {
            collapse()
          } else {
            setDismissedFor(null)
            setOpen(true)
          }
        }}
        onKeyDown={(event) => {
          if (isOpen && event.key === 'Escape') {
            event.stopPropagation()
            collapse()
          }
        }}
        className="group absolute top-1/2 left-0 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className="relative flex h-14 w-16 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-x-1 top-2 bottom-1 rounded-[6px] border border-timeline-cluster/30 bg-timeline-paper"
          />
          <span
            aria-hidden="true"
            className="absolute inset-x-2 top-1 bottom-2 rounded-[6px] border border-timeline-cluster/45 bg-timeline-paper"
          />
          <span className="relative grid h-10 min-w-12 place-items-center rounded-[6px] border border-timeline-cluster bg-timeline-cluster px-2 font-display text-xl font-semibold text-timeline-cluster-foreground tabular-nums transition-transform group-hover:-translate-y-0.5">
            {entries.length}
          </span>
        </span>
        <span className="mt-1 max-w-24 text-center font-sans text-[0.625rem] leading-tight font-semibold text-timeline-tick">
          deadlines here
        </span>
      </button>

      {isOpen ? (
        <div
          id={panelId}
          role="group"
          aria-label={`${entries.length} deadlines at this moment`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              collapse()
            }
          }}
          className={cn(
            'absolute bottom-[calc(50%+2.75rem)] z-40 w-[min(20rem,calc(100vw-3rem))] rounded-[4px] border border-border bg-card shadow-md',
            alignment,
          )}
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2">
            <span className="font-sans text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Same moment
            </span>
            <span className="font-display text-sm font-semibold tabular-nums">
              {entries.length}
            </span>
          </div>
          <ul className="max-h-[22rem] overflow-y-auto p-1">
            {entries.map((entry) => {
              const remaining = Math.floor(
                (Date.parse(entry.item.due_at_utc) - liveNowMs) / 1000,
              )
              return (
                <li key={entry.item.id}>
                  <button
                    ref={(node) => registerMarkerRef?.(entry.item.id, node)}
                    type="button"
                    onClick={() => onSelect?.(entry)}
                    aria-current={selectedId === entry.item.id ? 'true' : undefined}
                    aria-label={entryAriaLabel(entry, liveNowMs, timezone)}
                    className={cn(
                      'grid w-full gap-0.5 rounded-[3px] px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      selectedId === entry.item.id && 'bg-muted ring-1 ring-ring',
                      highlightedId === entry.item.id &&
                        'ring-2 ring-timeline-highlight ring-offset-1',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-sans text-[0.625rem] font-semibold text-muted-foreground tabular-nums uppercase">
                        {formatTimelineDue(
                          entry.item.due_at_utc,
                          timezone,
                          entry.item.is_date_only,
                        )}
                      </span>
                      <span className="shrink-0 font-sans text-[0.625rem] font-medium text-muted-foreground">
                        {URGENCY_LABEL[entry.urgency]}
                      </span>
                    </span>
                    <span className="line-clamp-1 font-sans text-xs font-medium [overflow-wrap:anywhere]">
                      {entry.item.title}
                    </span>
                    <span className="font-sans text-xs font-semibold tabular-nums">
                      {formatCountdown(remaining, entry.urgency)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </li>
  )
}
