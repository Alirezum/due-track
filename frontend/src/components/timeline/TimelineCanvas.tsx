import { useMemo } from 'react'
import type { TimelineEntry } from '@/api/types'
import { TimelineAxis } from '@/components/timeline/TimelineAxis'
import { TimelineMarker } from '@/components/timeline/TimelineMarker'
import { useElementWidth } from '@/hooks/useElementWidth'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  clusterMarkers,
  positionFor,
  summarizeEdges,
  type EdgeSummary,
} from '@/lib/timeline/geometry'
import type { TimelineWindow } from '@/lib/timeline/horizons'
import { cn } from '@/lib/utils'

export type TimelineCanvasProps = {
  entries: TimelineEntry[]
  window: TimelineWindow
  referenceTimeMs: number
  liveNowMs: number
  timezone: string
  selectedId?: number | null
  highlightedId?: number | null
  onSelect?: (entry: TimelineEntry) => void
  onRevealEdge?: (summary: EdgeSummary) => void
  clustering?: boolean
  registerMarkerRef?: (id: number, node: HTMLButtonElement | null) => void
}

const FALLBACK_WIDTH = 960

const GRID_STYLE = {
  backgroundImage:
    'linear-gradient(to right, var(--timeline-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--timeline-grid) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
}

export function TimelineCanvas({
  entries,
  window,
  referenceTimeMs,
  liveNowMs,
  timezone,
  selectedId = null,
  highlightedId = null,
  onSelect,
  onRevealEdge,
  clustering = false,
  registerMarkerRef,
}: TimelineCanvasProps) {
  const isWide = useMediaQuery('(min-width: 1024px)')
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const measuredWidth = width > 0 ? width : FALLBACK_WIDTH

  const groups = useMemo(
    () => clusterMarkers(entries, measuredWidth, window),
    [entries, measuredWidth, window],
  )
  const edges = useMemo(() => summarizeEdges(entries, window), [entries, window])
  const nowRatio = positionFor(liveNowMs, window.startMs, window.endMs) * 100

  if (!isWide) {
    const overdue = entries.filter((entry) => entry.urgency === 'overdue')
    const rest = entries.filter((entry) => entry.urgency !== 'overdue')

    return (
      <div ref={ref} data-timeline className="grid gap-0">
        <div
          className="relative overflow-hidden rounded-[2px] border border-border bg-timeline-paper px-3 py-4 sm:px-5"
          style={GRID_STYLE}
        >
          <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-timeline-grid pb-2">
            <span className="font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-timeline-tick uppercase">
              Chronological ledger
            </span>
            <span className="font-sans text-[0.625rem] text-muted-foreground tabular-nums">
              {entries.length} active
            </span>
          </div>

          {entries.length === 0 ? null : (
            <ol aria-label="Deadlines in chronological order" className="grid gap-1">
              {overdue.map((entry) => (
                <TimelineMarker
                  key={entry.item.id}
                  entry={entry}
                  liveNowMs={liveNowMs}
                  timezone={timezone}
                  selected={selectedId === entry.item.id}
                  highlighted={highlightedId === entry.item.id}
                  orientation="vertical"
                  onSelect={onSelect}
                  buttonRef={(node) => registerMarkerRef?.(entry.item.id, node)}
                />
              ))}

              <li
                className="relative -mx-3 my-2 flex items-center gap-3 px-3 py-2 sm:-mx-5 sm:px-5"
                data-testid="timeline-now-divider"
                aria-label="Now"
              >
                <span className="font-sans text-[0.6875rem] font-bold tracking-[0.14em] text-timeline-now-foreground uppercase">
                  <span className="rounded-[2px] bg-timeline-now px-2 py-1">NOW</span>
                </span>
                <span className="h-px flex-1 bg-timeline-now/70" />
                <span className="font-sans text-[0.625rem] text-muted-foreground tabular-nums">
                  {new Intl.DateTimeFormat(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: timezone,
                  }).format(new Date(referenceTimeMs))}
                </span>
              </li>

              {rest.map((entry) => (
                <TimelineMarker
                  key={entry.item.id}
                  entry={entry}
                  liveNowMs={liveNowMs}
                  timezone={timezone}
                  selected={selectedId === entry.item.id}
                  highlighted={highlightedId === entry.item.id}
                  orientation="vertical"
                  onSelect={onSelect}
                  buttonRef={(node) => registerMarkerRef?.(entry.item.id, node)}
                />
              ))}
            </ol>
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} data-timeline className="relative">
      <div
        className="relative h-[28rem] overflow-hidden rounded-[2px] border border-border bg-timeline-paper sm:h-[30rem]"
        style={GRID_STYLE}
      >
        <div className="absolute inset-x-6 top-0 bottom-0 sm:inset-x-8">
          <TimelineAxis
            window={window}
            width={measuredWidth}
            timezone={timezone}
            liveNowMs={liveNowMs}
          />

          <ol aria-label="Deadlines in chronological order" className="contents">
            {clustering
              ? groups.map((group) =>
                  group.kind === 'marker' ? (
                    <TimelineMarker
                      key={group.key}
                      entry={group.entries[0]}
                      liveNowMs={liveNowMs}
                      timezone={timezone}
                      xPercent={(group.x / measuredWidth) * 100}
                      selected={selectedId === group.entries[0].item.id}
                      highlighted={highlightedId === group.entries[0].item.id}
                      onSelect={onSelect}
                      buttonRef={(node) => registerMarkerRef?.(group.entries[0].item.id, node)}
                    />
                  ) : null,
                )
              : entries.map((entry) => (
                  <TimelineMarker
                    key={entry.item.id}
                    entry={entry}
                    liveNowMs={liveNowMs}
                    timezone={timezone}
                    xPercent={
                      positionFor(
                        Date.parse(entry.item.due_at_utc),
                        window.startMs,
                        window.endMs,
                      ) * 100
                    }
                    selected={selectedId === entry.item.id}
                    highlighted={highlightedId === entry.item.id}
                    onSelect={onSelect}
                    buttonRef={(node) => registerMarkerRef?.(entry.item.id, node)}
                  />
                ))}
          </ol>

          <span
            aria-hidden="true"
            className={cn(
              'absolute top-1/2 h-px w-px -translate-y-1/2 rounded-full bg-timeline-now',
              nowRatio < 0.01 ? 'opacity-0' : '',
            )}
          />

          {edges.left && onRevealEdge ? (
            <button
              type="button"
              onClick={() => onRevealEdge(edges.left as EdgeSummary)}
              className="absolute top-1/2 left-0 z-30 -translate-y-1/2 rounded-[2px] border border-dashed border-timeline-edge bg-timeline-paper/90 px-2 py-1 font-sans text-[0.6875rem] font-semibold text-timeline-tick outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              ← {edges.left.count} earlier
            </button>
          ) : null}

          {edges.right && onRevealEdge ? (
            <button
              type="button"
              onClick={() => onRevealEdge(edges.right as EdgeSummary)}
              className="absolute top-1/2 right-0 z-30 -translate-y-1/2 rounded-[2px] border border-dashed border-timeline-edge bg-timeline-paper/90 px-2 py-1 font-sans text-[0.6875rem] font-semibold text-timeline-tick outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {edges.right.count} later →
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
