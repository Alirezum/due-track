import { Fragment, useMemo } from 'react'
import type { TimelineEntry } from '@/api/types'
import { TimelineAxis } from '@/components/timeline/TimelineAxis'
import { TimelineCluster } from '@/components/timeline/TimelineCluster'
import { TimelineEdgeSummary } from '@/components/timeline/TimelineEdgeSummary'
import { TimelineMarker } from '@/components/timeline/TimelineMarker'
import { useElementWidth } from '@/hooks/useElementWidth'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  clusterMarkers,
  positionFor,
  summarizeEdges,
  type EdgeSummary,
} from '@/lib/timeline/geometry'
import { formatTimelineDayHeader } from '@/lib/timeline/format'
import type { TimelineWindow } from '@/lib/timeline/horizons'

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

function dayKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
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

  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const dueMs = Date.parse(entry.item.due_at_utc)
        return dueMs >= window.startMs && dueMs <= window.endMs
      }),
    [entries, window.endMs, window.startMs],
  )

  const groups = useMemo(
    () => clusterMarkers(visibleEntries, measuredWidth, window),
    [measuredWidth, visibleEntries, window],
  )
  const edges = useMemo(() => summarizeEdges(entries, window), [entries, window])
  const rovingId =
    visibleEntries.find((entry) => entry.item.id === selectedId)?.item.id ??
    visibleEntries[0]?.item.id ??
    null

  if (!isWide) {
    const overdue = visibleEntries.filter((entry) => entry.urgency === 'overdue')
    const rest = visibleEntries.filter((entry) => entry.urgency !== 'overdue')

    function renderRows(list: TimelineEntry[]) {
      const rows = list.map((entry) => ({
        entry,
        key: dayKey(entry.item.due_at_utc, timezone),
      }))

      return rows.map(({ entry, key }, index) => {
        const showHeader = key !== (rows[index - 1]?.key ?? '')
        return (
          <Fragment key={entry.item.id}>
            {showHeader ? (
              <li
                className="sticky top-0 z-10 -mx-3 mt-2 bg-timeline-paper/95 px-3 py-1.5 backdrop-blur-[2px] first:mt-0 sm:-mx-5 sm:px-5"
                aria-hidden="true"
              >
                <span className="font-sans text-[0.625rem] font-semibold tracking-[0.12em] text-timeline-tick uppercase">
                  {formatTimelineDayHeader(entry.item.due_at_utc, timezone)}
                </span>
              </li>
            ) : null}
            <TimelineMarker
              entry={entry}
              liveNowMs={liveNowMs}
              timezone={timezone}
              selected={selectedId === entry.item.id}
              highlighted={highlightedId === entry.item.id}
              orientation="vertical"
              onSelect={onSelect}
              tabIndex={entry.item.id === rovingId ? 0 : -1}
              buttonRef={(node) => registerMarkerRef?.(entry.item.id, node)}
            />
          </Fragment>
        )
      })
    }

    return (
      <div data-timeline className="grid gap-0">
        <div
          className="relative overflow-hidden rounded-[2px] border border-border bg-timeline-paper px-3 py-4 sm:px-5"
          style={GRID_STYLE}
        >
          <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-timeline-grid pb-2">
            <span className="font-sans text-[0.6875rem] font-semibold tracking-[0.12em] text-timeline-tick uppercase">
              Chronological ledger
            </span>
            <span className="font-sans text-[0.625rem] text-muted-foreground tabular-nums">
              {visibleEntries.length} in view
            </span>
          </div>

          {visibleEntries.length === 0 && !edges.left && !edges.right ? null : (
            <ol aria-label="Deadlines in chronological order" className="grid gap-1">
              {edges.left && onRevealEdge ? (
                <li className="py-1">
                  <TimelineEdgeSummary
                    edge="left"
                    count={edges.left.count}
                    orientation="vertical"
                    onReveal={() => onRevealEdge(edges.left as EdgeSummary)}
                  />
                </li>
              ) : null}

              {renderRows(overdue)}

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

              {renderRows(rest)}

              {edges.right && onRevealEdge ? (
                <li className="py-1">
                  <TimelineEdgeSummary
                    edge="right"
                    count={edges.right.count}
                    orientation="vertical"
                    onReveal={() => onRevealEdge(edges.right as EdgeSummary)}
                  />
                </li>
              ) : null}
            </ol>
          )}
        </div>
      </div>
    )
  }

  return (
    <div data-timeline className="relative">
      <div
        ref={ref}
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
              ? groups.map((group, groupIndex) =>
                  group.kind === 'cluster' ? (
                    <TimelineCluster
                      key={group.key}
                      entries={group.entries}
                      xPercent={(group.x / measuredWidth) * 100}
                      liveNowMs={liveNowMs}
                      timezone={timezone}
                      selectedId={selectedId}
                      highlightedId={highlightedId}
                      onSelect={onSelect}
                      registerMarkerRef={registerMarkerRef}
                      tabIndex={selectedId === null && groupIndex === 0 ? 0 : -1}
                    />
                  ) : (
                    <TimelineMarker
                      key={group.key}
                      entry={group.entries[0]}
                      liveNowMs={liveNowMs}
                      timezone={timezone}
                      xPercent={(group.x / measuredWidth) * 100}
                      selected={selectedId === group.entries[0].item.id}
                      highlighted={highlightedId === group.entries[0].item.id}
                      onSelect={onSelect}
                      tabIndex={group.entries[0].item.id === rovingId ? 0 : -1}
                      buttonRef={(node) => registerMarkerRef?.(group.entries[0].item.id, node)}
                    />
                  ),
                )
              : visibleEntries.map((entry) => (
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
                    tabIndex={entry.item.id === rovingId ? 0 : -1}
                    buttonRef={(node) => registerMarkerRef?.(entry.item.id, node)}
                  />
                ))}
          </ol>

          {edges.left && onRevealEdge ? (
            <TimelineEdgeSummary
              edge="left"
              count={edges.left.count}
              onReveal={() => onRevealEdge(edges.left as EdgeSummary)}
            />
          ) : null}

          {edges.right && onRevealEdge ? (
            <TimelineEdgeSummary
              edge="right"
              count={edges.right.count}
              onReveal={() => onRevealEdge(edges.right as EdgeSummary)}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
