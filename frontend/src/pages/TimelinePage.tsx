import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { ApiError } from '@/api/client'
import type { DueItem, ItemCreate, ItemUpdate, TimelineEntry } from '@/api/types'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FilterBar } from '@/components/FilterBar'
import { ItemForm } from '@/components/ItemForm'
import { OverdueIndicator } from '@/components/OverdueIndicator'
import { ShortcutHelp } from '@/components/ShortcutHelp'
import { TimelineCanvas } from '@/components/timeline/TimelineCanvas'
import { TimelineDetailShell } from '@/components/timeline/TimelineDetailShell'
import { TimelineLegend } from '@/components/timeline/TimelineLegend'
import { TimelineToolbar } from '@/components/timeline/TimelineToolbar'
import {
  TimelineEmpty,
  TimelineError,
  TimelineNoResults,
  TimelineNote,
  TimelineSkeleton,
  TimelineUpcomingEmpty,
} from '@/components/timeline/TimelineStates'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCompleteItem } from '@/hooks/useCompleteItem'
import { fetchTimeline, timelineQueryKey, useTimeline } from '@/hooks/useTimeline'
import { useTimelineShortcuts } from '@/hooks/useTimelineShortcuts'
import { useCreateItem, useDeleteItem, useItems, useUpdateItem } from '@/hooks/useItems'
import { categoriesFromItemList } from '@/lib/categories'
import { EMPTY_FILTERS, hasActiveFilters, type ItemFilters } from '@/lib/filters'
import { formatCountdown } from '@/lib/timeline/countdown'
import { formatTimelineDue } from '@/lib/timeline/format'
import type { EdgeSummary } from '@/lib/timeline/geometry'
import {
  DEFAULT_HORIZON,
  resetReveals,
  resolveTimelineWindow,
  revealEdge,
  type TimeHorizon,
} from '@/lib/timeline/horizons'

const OVERDUE_LABEL_ID = 'timeline-overdue-label'
const CANVAS_REGION_ID = 'timeline-canvas-region'

type HiddenItemNotice = {
  item: DueItem
  reason: 'overdue' | 'filtered'
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.detail === 'string') {
      return error.detail
    }
    if (Array.isArray(error.detail)) {
      const first = error.detail[0] as { msg?: string } | undefined
      return first?.msg ?? `The server rejected the request (${error.status}).`
    }
  }
  return error instanceof Error ? error.message : 'Something went wrong.'
}

function remainingSeconds(entry: TimelineEntry, liveNowMs: number): number {
  const dueMs = Date.parse(entry.item.due_at_utc)
  return Number.isFinite(dueMs) ? Math.floor((dueMs - liveNowMs) / 1000) : 0
}

export function TimelinePage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_FILTERS)
  const [horizon, setHorizon] = useState<TimeHorizon>(DEFAULT_HORIZON)
  const [showOverdue, setShowOverdue] = useState(false)
  const [revealedEdges, setRevealedEdges] = useState(resetReveals)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [hiddenItem, setHiddenItem] = useState<HiddenItemNotice | null>(null)
  const [pendingRevealFocus, setPendingRevealFocus] = useState(false)
  const [pendingRevealId, setPendingRevealId] = useState<number | null>(null)
  const [pendingHideFocus, setPendingHideFocus] = useState(false)
  const [pendingSelectionId, setPendingSelectionId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DueItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<DueItem | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const markerRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  const focusFrame = useRef<number | null>(null)
  const focusRun = useRef(0)

  const timeline = useTimeline(filters, showOverdue ? 'all' : 'upcoming')
  const categorySource = useItems()
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const completeItem = useCompleteItem()

  const data = timeline.data
  const entries = useMemo(() => data?.entries ?? [], [data])
  const visibleEntries = useMemo(
    () => (showOverdue ? entries : entries.filter((entry) => entry.urgency !== 'overdue')),
    [entries, showOverdue],
  )
  const overdueEntries = useMemo(
    () => visibleEntries.filter((entry) => entry.urgency === 'overdue'),
    [visibleEntries],
  )
  const futureEntries = useMemo(
    () => visibleEntries.filter((entry) => entry.urgency !== 'overdue'),
    [visibleEntries],
  )
  const nextEntry = futureEntries[0] ?? null
  const overdueCount = data?.overdue_count ?? 0
  const visibleUpcomingCount = futureEntries.length
  const activeCount = visibleUpcomingCount + overdueCount
  const liveNowMs = timeline.liveNowMs || timeline.referenceTimeMs
  const viewWindow = useMemo(
    () =>
      resolveTimelineWindow({
        horizon,
        nowMs: liveNowMs,
        entries: visibleEntries,
        selectedId,
        revealedEdges,
        includeOverdue: showOverdue,
      }),
    [horizon, liveNowMs, revealedEdges, selectedId, showOverdue, visibleEntries],
  )

  const selectedEntry = useMemo(
    () => visibleEntries.find((entry) => entry.item.id === selectedId) ?? null,
    [selectedId, visibleEntries],
  )
  const filtersActive = hasActiveFilters(filters)
  const categories = useMemo(
    () => categoriesFromItemList(categorySource.data),
    [categorySource.data],
  )

  const handleFilterChange = useCallback(
    (update: ItemFilters | ((current: ItemFilters) => ItemFilters)) => {
      setFilters(update)
      setRevealedEdges(resetReveals())
    },
    [],
  )

  function changeHorizon(next: TimeHorizon) {
    setHorizon(next)
    setRevealedEdges(resetReveals())
  }

  function clearFilters() {
    const excluded = hiddenItem
    setFilters(EMPTY_FILTERS)
    setRevealedEdges(resetReveals())
    if (excluded) {
      setHiddenItem(null)
      setPendingSelectionId(excluded.item.id)
      setSelectedId(excluded.item.id)
      setHighlightedId(excluded.item.id)
      setDetailOpen(false)
      setAnnouncement(`Filters cleared. ${excluded.item.title} selected.`)
    }
  }

  function revealOverdue(focusId: number | null = null) {
    setHiddenItem(null)
    setPendingRevealId(focusId)
    setPendingRevealFocus(true)
    setShowOverdue(true)
    setRevealedEdges(resetReveals())
    setAnnouncement('Showing overdue deadlines.')
  }

  function hideOverdue() {
    setHiddenItem(null)
    setPendingHideFocus(true)
    setShowOverdue(false)
    setRevealedEdges(resetReveals())
    setAnnouncement('Showing upcoming deadlines only.')
  }

  function selectEntry(entry: TimelineEntry, focus: boolean) {
    setSelectedId(entry.item.id)
    setHighlightedId(null)
    setAnnouncement(`Selected ${entry.item.title}.`)
    if (focus) {
      focusEntryWhenReady(entry.item.id)
    }
  }

  function openEntryDetail(entry: TimelineEntry) {
    setSelectedId(entry.item.id)
    setHighlightedId(null)
    setDetailOpen(true)
    setAnnouncement(`Selected ${entry.item.title}.`)
  }

  function closeDetail() {
    setDetailOpen(false)
    if (selectedId !== null) {
      focusEntryWhenReady(selectedId)
    }
  }

  const registerMarkerRef = useCallback((id: number, node: HTMLButtonElement | null) => {
    if (node) {
      markerRefs.current.set(id, node)
    } else {
      markerRefs.current.delete(id)
    }
  }, [])

  function focusEntryWhenReady(id: number) {
    const run = focusRun.current + 1
    focusRun.current = run
    if (focusFrame.current !== null) {
      cancelAnimationFrame(focusFrame.current)
    }

    const attempt = (remaining: number) => {
      if (focusRun.current !== run) {
        return
      }
      const node = markerRefs.current.get(id)
      if (node) {
        node.focus()
        return
      }
      if (remaining > 0) {
        focusFrame.current = requestAnimationFrame(() => attempt(remaining - 1))
      }
    }

    focusFrame.current = requestAnimationFrame(() => attempt(20))
  }

  useEffect(
    () => () => {
      if (focusFrame.current !== null) {
        cancelAnimationFrame(focusFrame.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!pendingRevealFocus || !showOverdue || timeline.isPlaceholderData) {
      return
    }
    const target =
      (pendingRevealId !== null
        ? visibleEntries.find((entry) => entry.item.id === pendingRevealId)
        : null) ??
      visibleEntries.find((entry) => entry.urgency === 'overdue') ??
      null
    if (target) {
      if (pendingRevealId !== null) {
        setSelectedId(target.item.id)
        setHighlightedId(target.item.id)
        setDetailOpen(false)
      }
      focusEntryWhenReady(target.item.id)
      setAnnouncement(
        pendingRevealId !== null
          ? `Showing overdue deadlines. Selected ${target.item.title}.`
          : 'Showing overdue deadlines.',
      )
    } else {
      document
        .querySelector<HTMLElement>(`[aria-controls="${CANVAS_REGION_ID}"]`)
        ?.focus()
    }
    setPendingRevealFocus(false)
    setPendingRevealId(null)
  }, [pendingRevealFocus, pendingRevealId, showOverdue, timeline.isPlaceholderData, visibleEntries])

  useEffect(() => {
    if (!pendingHideFocus || showOverdue) {
      return
    }
    const stillVisible =
      selectedId !== null && visibleEntries.some((entry) => entry.item.id === selectedId)
    const target =
      (stillVisible
        ? visibleEntries.find((entry) => entry.item.id === selectedId)
        : null) ??
      visibleEntries.find((entry) => entry.urgency !== 'overdue') ??
      null
    if (!stillVisible && selectedId !== null) {
      setSelectedId(target?.item.id ?? null)
      setDetailOpen(false)
    }
    document
      .querySelector<HTMLElement>(`[aria-controls="${CANVAS_REGION_ID}"]`)
      ?.focus()
    setPendingHideFocus(false)
  }, [pendingHideFocus, selectedId, showOverdue, visibleEntries])

  useEffect(() => {
    if (pendingSelectionId === null || timeline.isPlaceholderData || timeline.isFetching) {
      return
    }
    if (visibleEntries.some((entry) => entry.item.id === pendingSelectionId)) {
      setSelectedId(pendingSelectionId)
      setHighlightedId(pendingSelectionId)
      setDetailOpen(false)
      focusEntryWhenReady(pendingSelectionId)
    } else {
      setSelectedId(null)
    }
    setPendingSelectionId(null)
  }, [pendingSelectionId, timeline.isFetching, timeline.isPlaceholderData, visibleEntries])

  useEffect(() => {
    if (selectedId === null || timeline.isPlaceholderData) {
      return
    }
    if (pendingSelectionId !== null) {
      return
    }
    if (visibleEntries.some((entry) => entry.item.id === selectedId)) {
      return
    }
    const nearest =
      visibleEntries.find((entry) => entry.urgency !== 'overdue') ?? visibleEntries[0] ?? null
    setSelectedId(nearest?.item.id ?? null)
    setDetailOpen(false)
    setAnnouncement(
      nearest === null ? 'No upcoming deadlines remain.' : `Selected ${nearest.item.title}.`,
    )
  }, [pendingSelectionId, selectedId, timeline.isPlaceholderData, visibleEntries])

  function handleRevealEdge(summary: EdgeSummary) {
    setRevealedEdges(
      () => revealEdge(viewWindow, summary.edge, summary.boundary).revealedEdges,
    )
  }

  function jumpToNow() {
    const target = document.querySelector(
      '[data-testid="timeline-now"], [data-testid="timeline-now-divider"]',
    )
    if (!target) {
      return
    }
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  }

  function openCreate() {
    setFormError(null)
    setCreateOpen(true)
  }

  function openEdit(item: DueItem) {
    setFormError(null)
    setEditingItem(item)
  }

  async function noticeForSavedItem(saved: DueItem): Promise<HiddenItemNotice | null> {
    const allScoped = await queryClient.fetchQuery({
      queryKey: [...timelineQueryKey, filters, 'all'],
      queryFn: () => fetchTimeline(filters, 'all'),
    })
    const savedEntry = allScoped.entries.find((entry) => entry.item.id === saved.id)
    if (savedEntry) {
      if (savedEntry.urgency === 'overdue' && !showOverdue) {
        return { item: saved, reason: 'overdue' }
      }
      return null
    }
    return hasActiveFilters(filters) ? { item: saved, reason: 'filtered' } : null
  }

  async function handleCreate(payload: ItemCreate | ItemUpdate) {
    setFormError(null)
    try {
      const created = await createItem.mutateAsync(payload as ItemCreate)
      setCreateOpen(false)
      const refreshed = await timeline.refetch()
      const present =
        refreshed.data?.entries.some((entry) => entry.item.id === created.id) ?? false

      if (present) {
        setHiddenItem(null)
        setSelectedId(created.id)
        setHighlightedId(created.id)
        setDetailOpen(false)
        setAnnouncement(`Added ${created.title}. Highlighted on the timeline.`)
        focusEntryWhenReady(created.id)
      } else {
        const notice = await noticeForSavedItem(created)
        setSelectedId(null)
        setDetailOpen(false)
        setHiddenItem(notice)
        setAnnouncement(
          notice?.reason === 'overdue'
            ? `Saved “${created.title}”. It is overdue, so it is hidden by the upcoming focus.`
            : notice?.reason === 'filtered'
              ? `Saved “${created.title}”, but the current filters hide it.`
              : `Saved ${created.title}.`,
        )
      }
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  async function handleUpdate(payload: ItemCreate | ItemUpdate) {
    if (!editingItem) {
      return
    }
    setFormError(null)
    try {
      const updated = await updateItem.mutateAsync({
        id: editingItem.id,
        ...(payload as ItemUpdate),
      })
      setEditingItem(null)
      const refreshed = await timeline.refetch()
      const present =
        refreshed.data?.entries.some((entry) => entry.item.id === updated.id) ?? false

      if (present) {
        setHiddenItem(null)
        setSelectedId(updated.id)
        setHighlightedId(updated.id)
        setAnnouncement(`Updated ${updated.title}. Selection kept.`)
      } else {
        const notice = await noticeForSavedItem(updated)
        setSelectedId(null)
        setDetailOpen(false)
        setHiddenItem(notice)
        setAnnouncement(
          notice?.reason === 'overdue'
            ? `Saved “${updated.title}”. It is overdue, so it is hidden by the upcoming focus.`
            : notice?.reason === 'filtered'
              ? `Saved “${updated.title}”, but the current filters hide it.`
              : `Saved ${updated.title}.`,
        )
      }
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  async function handleComplete(entry: TimelineEntry) {
    const index = visibleEntries.findIndex((item) => item.item.id === entry.item.id)
    const fallbackId =
      index === -1
        ? null
        : (visibleEntries[index + 1]?.item.id ?? visibleEntries[index - 1]?.item.id ?? null)
    setPageError(null)
    try {
      const result = await completeItem.mutateAsync(entry.item.id)
      const refreshed = await timeline.refetch()
      const staysActive =
        refreshed.data?.entries.some((item) => item.item.id === entry.item.id) ?? false

      if (staysActive || result.item?.id === entry.item.id) {
        setSelectedId(entry.item.id)
        setHighlightedId(entry.item.id)
        setAnnouncement(`Completed ${entry.item.title}. Next occurrence highlighted.`)
      } else {
        setSelectedId(fallbackId)
        setDetailOpen(false)
        setAnnouncement(`Completed ${entry.item.title}.`)
        if (fallbackId !== null) {
          focusEntryWhenReady(fallbackId)
        }
      }
    } catch (error) {
      setPageError(describeError(error))
    }
  }

  async function handleDelete() {
    if (!deletingItem) {
      return
    }
    const index = visibleEntries.findIndex((entry) => entry.item.id === deletingItem.id)
    const fallbackId =
      index === -1
        ? null
        : (visibleEntries[index + 1]?.item.id ?? visibleEntries[index - 1]?.item.id ?? null)
    setPageError(null)
    try {
      await deleteItem.mutateAsync(deletingItem.id)
      await timeline.refetch()
      setDeletingItem(null)
      setSelectedId(fallbackId)
      setDetailOpen(false)
      setAnnouncement(`Deleted ${deletingItem.title}.`)
      if (fallbackId !== null) {
        focusEntryWhenReady(fallbackId)
      }
    } catch (error) {
      setPageError(describeError(error))
    }
  }

  const overlayOpen = createOpen || editingItem !== null || deletingItem !== null || helpOpen

  useTimelineShortcuts({
    entries: visibleEntries,
    selectedId,
    enabled: !overlayOpen,
    onSelect: selectEntry,
    onOpenDetail: openEntryDetail,
    onComplete: (entry) => void handleComplete(entry),
    onEdit: (entry) => openEdit(entry.item),
    onDelete: (entry) => setDeletingItem(entry.item),
    onNew: openCreate,
    onFocusSearch: () => document.getElementById('filter-search')?.focus(),
    onShowHelp: () => setHelpOpen(true),
    onEscape: () => {
      setHelpOpen(false)
      setCreateOpen(false)
      setEditingItem(null)
      setDeletingItem(null)
      setDetailOpen(false)
      if (selectedId !== null) {
        focusEntryWhenReady(selectedId)
      }
    },
  })

  if (timeline.isPending && !data) {
    return (
      <div data-timeline className="grid gap-8">
        <TimelineHeader onCreate={openCreate} />
        <TimelineSkeleton />
      </div>
    )
  }

  if (timeline.isError && !data) {
    return (
      <div data-timeline className="grid gap-8">
        <TimelineHeader onCreate={openCreate} />
        <TimelineError message={describeError(timeline.error)} onRetry={() => void timeline.refetch()} />
      </div>
    )
  }

  if (!data) {
    return (
      <div data-timeline className="grid gap-8">
        <TimelineHeader onCreate={openCreate} />
        <TimelineSkeleton />
      </div>
    )
  }

  const timezone = data.timezone
  const nextCountdown = nextEntry
    ? formatCountdown(remainingSeconds(nextEntry, liveNowMs), nextEntry.urgency)
    : null
  const referenceLabel = formatTimelineDue(data.reference_time_utc, timezone, false)
  const noUpcoming = visibleUpcomingCount === 0
  const onlyOverdueHidden = noUpcoming && overdueCount > 0 && !showOverdue
  const noResults = filtersActive && noUpcoming && overdueCount === 0
  const trulyEmpty = !filtersActive && noUpcoming && overdueCount === 0
  const canvasLabel = showOverdue ? 'Deadlines including overdue' : 'Upcoming deadlines'

  return (
    <div data-timeline className="grid gap-8">
      <TimelineHeader onCreate={openCreate} showOverdue={showOverdue} />

      {timeline.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-destructive bg-destructive/5 py-2 pr-3 pl-3 text-sm"
        >
          <span>The timeline could not be refreshed: {describeError(timeline.error)}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void timeline.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      <section
        aria-label="Timeline summary"
        className="flex flex-wrap items-end gap-x-10 gap-y-4 border-y border-border py-4"
      >
        <span className="grid gap-1">
          <span className="font-sans text-[0.6875rem] leading-none font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Next
          </span>
          <span className="font-display text-xl font-semibold tabular-nums">
            {nextEntry && nextCountdown ? (
              <>
                <span className="mr-2 font-sans text-sm font-medium text-muted-foreground">
                  {nextEntry.item.title}
                </span>
                {nextCountdown}
              </>
            ) : (
              <span className="font-sans text-sm font-normal text-muted-foreground">
                Nothing ahead in this view
              </span>
            )}
          </span>
        </span>

        <OverdueIndicator
          id={OVERDUE_LABEL_ID}
          count={overdueCount}
          expanded={showOverdue}
          controls={CANVAS_REGION_ID}
          onToggle={showOverdue ? hideOverdue : () => revealOverdue()}
          variant="summary"
        />

        <span className="grid gap-1">
          <span className="font-sans text-[0.6875rem] leading-none font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Active
          </span>
          <span className="font-display text-xl font-semibold tabular-nums">{activeCount}</span>
        </span>

        <span className="ml-auto grid gap-1 text-right">
          <span className="font-sans text-[0.6875rem] leading-none font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            As of
          </span>
          <span className="font-sans text-sm text-muted-foreground tabular-nums">
            {referenceLabel}
          </span>
        </span>
      </section>

      <TimelineToolbar
        horizon={horizon}
        onHorizonChange={changeHorizon}
        window={viewWindow}
        timezone={timezone}
        onJumpToNow={jumpToNow}
        onResetSpan={() => setRevealedEdges(resetReveals())}
        isFetching={timeline.isFetching && Boolean(data)}
      />

      <FilterBar filters={filters} categories={categories} onChange={handleFilterChange} />

      {pageError ? (
        <p role="alert" className="border-l-2 border-destructive pl-3 text-sm text-destructive">
          {pageError}
        </p>
      ) : null}

      {hiddenItem ? (
        hiddenItem.reason === 'overdue' ? (
          <div
            role="status"
            data-testid="overdue-hidden-notice"
            className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-timeline-overdue bg-timeline-overdue-soft/40 py-2 pr-3 pl-3 text-sm"
          >
            <span>
              Saved “{hiddenItem.item.title}”. It is overdue, so it is hidden by the upcoming focus.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => revealOverdue(hiddenItem.item.id)}
            >
              Show overdue
            </Button>
          </div>
        ) : (
          <div
            role="status"
            data-testid="filter-exclusion-notice"
            className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-timeline-highlight bg-timeline-highlight/10 py-2 pr-3 pl-3 text-sm"
          >
            <span>
              Saved “{hiddenItem.item.title}”, but the current filters hide it.
            </span>
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        )
      ) : null}

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      {trulyEmpty ? (
        <TimelineEmpty onCreate={openCreate} />
      ) : onlyOverdueHidden ? (
        <TimelineUpcomingEmpty
          hasFilters={filtersActive}
          overdueCount={overdueCount}
          onCreate={openCreate}
          onShowOverdue={() => revealOverdue()}
          onClearFilters={clearFilters}
        />
      ) : noResults ? (
        <TimelineNoResults hasFilters onClearFilters={clearFilters} />
      ) : (
        <div
          className={
            selectedEntry && detailOpen
              ? 'grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start'
              : 'grid gap-8'
          }
        >
          <div className="grid min-w-0 gap-8">
            <div
              id={CANVAS_REGION_ID}
              role="region"
              aria-label={canvasLabel}
              tabIndex={-1}
              className="outline-none"
            >
              <TimelineCanvas
                entries={visibleEntries}
                window={viewWindow}
                referenceTimeMs={timeline.referenceTimeMs}
                liveNowMs={liveNowMs}
                timezone={timezone}
                selectedId={selectedId}
                highlightedId={highlightedId}
                onSelect={openEntryDetail}
                onRevealEdge={handleRevealEdge}
                clustering
                registerMarkerRef={registerMarkerRef}
              />
            </div>
            <TimelineLegend showOverdue={showOverdue} />

            {visibleEntries.length > 0 && overdueEntries.length === visibleEntries.length ? (
              <TimelineNote>
                All {visibleEntries.length} active{' '}
                {visibleEntries.length === 1 ? 'deadline is' : 'deadlines are'} overdue.
              </TimelineNote>
            ) : null}

            {overdueCount === 0 && nextEntry ? (
              <TimelineNote>
                Nothing is overdue. Next: {nextEntry.item.title} ·{' '}
                {formatCountdown(remainingSeconds(nextEntry, liveNowMs), nextEntry.urgency)}.
              </TimelineNote>
            ) : null}

            {timeline.isFetching ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Updating…
              </p>
            ) : null}
          </div>

          {selectedEntry && detailOpen ? (
            <TimelineDetailShell
              entry={selectedEntry}
              timezone={timezone}
              liveNowMs={liveNowMs}
              onClose={closeDetail}
              onComplete={(entry) => void handleComplete(entry)}
              onEdit={(entry) => openEdit(entry.item)}
              onDelete={(entry) => setDeletingItem(entry.item)}
            />
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="button" size="lg" onClick={openCreate} className="w-fit">
          <Plus aria-hidden="true" />
          New deadline
        </Button>
        <span className="text-xs text-muted-foreground">
          {horizon === 'all'
            ? 'All time in view'
            : showOverdue
              ? `Showing the ${horizon} horizon around now`
              : `Showing the next ${horizon} from now`}
        </span>
      </div>

      {createOpen ? (
        <Dialog open onOpenChange={setCreateOpen}>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>New deadline</DialogTitle>
              <DialogDescription>
                Add one obligation. Matching filters stay authoritative; anything hidden by them can
                be revealed after saving.
              </DialogDescription>
            </DialogHeader>
            <ItemForm
              item={null}
              submitLabel="Create deadline"
              isSubmitting={createItem.isPending}
              serverError={formError}
              onSubmit={handleCreate}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {editingItem ? (
        <Dialog open onOpenChange={(open) => (open ? null : setEditingItem(null))}>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Edit deadline</DialogTitle>
              <DialogDescription>
                Changes apply to this occurrence. Recurrence changes take effect from the next
                completion.
              </DialogDescription>
            </DialogHeader>
            <ItemForm
              item={editingItem}
              submitLabel="Save changes"
              isSubmitting={updateItem.isPending}
              serverError={formError}
              onSubmit={handleUpdate}
              onCancel={() => setEditingItem(null)}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={deletingItem !== null}
        title="Delete deadline?"
        description={
          deletingItem
            ? `“${deletingItem.title}” will leave the timeline. Completion history is kept.`
            : ''
        }
        confirmLabel="Delete deadline"
        destructive
        isPending={deleteItem.isPending}
        onConfirm={() => void handleDelete()}
        onOpenChange={(open) => (open ? null : setDeletingItem(null))}
      />

      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}

function TimelineHeader({
  onCreate,
  showOverdue = false,
}: {
  onCreate: () => void
  showOverdue?: boolean
}) {
  return (
    <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="max-w-2xl">
        <p className="font-sans text-[0.6875rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          The ledger of time
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
          Time, laid bare.
        </h1>
        <p className="mt-3 max-w-[62ch] text-muted-foreground">
          {showOverdue
            ? 'Every active deadline against one honest now: what has passed, what is close, and what is still ahead.'
            : 'Every upcoming deadline against one honest now: what is close and what is still ahead. Overdue deadlines are summarized in the ledger tab; nothing leaves this machine.'}
        </p>
      </div>
      <Button type="button" size="lg" onClick={onCreate} className="w-fit">
        <Plus aria-hidden="true" />
        New deadline
      </Button>
    </header>
  )
}
