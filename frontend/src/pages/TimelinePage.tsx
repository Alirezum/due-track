import { useCallback, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { ApiError } from '@/api/client'
import type { DueItem, ItemCreate, ItemUpdate, TimelineEntry } from '@/api/types'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FilterBar } from '@/components/FilterBar'
import { ItemForm } from '@/components/ItemForm'
import { ShortcutHelp } from '@/components/ShortcutHelp'
import { TimelineCanvas } from '@/components/timeline/TimelineCanvas'
import { TimelineLegend } from '@/components/timeline/TimelineLegend'
import { TimelineToolbar } from '@/components/timeline/TimelineToolbar'
import {
  TimelineEmpty,
  TimelineError,
  TimelineNoResults,
  TimelineNote,
  TimelineSkeleton,
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
import { useShortcuts } from '@/hooks/useShortcuts'
import { useTimeline } from '@/hooks/useTimeline'
import { useCreateItem, useDeleteItem, useUpdateItem } from '@/hooks/useItems'
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
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_FILTERS)
  const [horizon, setHorizon] = useState<TimeHorizon>(DEFAULT_HORIZON)
  const [revealedEdges, setRevealedEdges] = useState(resetReveals)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [highlightedId] = useState<number | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DueItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<DueItem | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const markerRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  const timeline = useTimeline(filters)
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const completeItem = useCompleteItem()

  const data = timeline.data
  const entries = useMemo(() => data?.entries ?? [], [data])
  const liveNowMs = timeline.liveNowMs || timeline.referenceTimeMs
  const viewWindow = useMemo(
    () =>
      resolveTimelineWindow({
        horizon,
        nowMs: liveNowMs,
        entries,
        selectedId,
        revealedEdges,
      }),
    [entries, horizon, liveNowMs, revealedEdges, selectedId],
  )

  const overdueEntries = entries.filter((entry) => entry.urgency === 'overdue')
  const futureEntries = entries.filter((entry) => entry.urgency !== 'overdue')
  const nextEntry = futureEntries[0] ?? null
  const filtersActive = hasActiveFilters(filters)
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          entries
            .map((entry) => entry.item.category?.trim())
            .filter((category): category is string => Boolean(category)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [entries],
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
    setFilters(EMPTY_FILTERS)
    setRevealedEdges(resetReveals())
  }

  function selectEntry(entry: TimelineEntry) {
    setSelectedId(entry.item.id)
  }

  const registerMarkerRef = useCallback((id: number, node: HTMLButtonElement | null) => {
    if (node) {
      markerRefs.current.set(id, node)
    } else {
      markerRefs.current.delete(id)
    }
  }, [])

  function focusEntry(id: number) {
    markerRefs.current.get(id)?.focus()
  }

  function moveSelection(direction: -1 | 1) {
    if (entries.length === 0) {
      return
    }
    const currentIndex = selectedId === null ? -1 : entries.findIndex((item) => item.item.id === selectedId)
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : entries.length - 1
        : Math.min(Math.max(currentIndex + direction, 0), entries.length - 1)
    const next = entries[nextIndex]
    setSelectedId(next.item.id)
    focusEntry(next.item.id)
  }

  function selectBoundary(index: 0 | -1) {
    if (entries.length === 0) {
      return
    }
    const next = entries.at(index)
    if (!next) {
      return
    }
    setSelectedId(next.item.id)
    focusEntry(next.item.id)
  }

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

  function activeEntry(): TimelineEntry | null {
    return entries.find((entry) => entry.item.id === selectedId) ?? entries[0] ?? null
  }

  function openCreate() {
    setFormError(null)
    setCreateOpen(true)
  }

  function openEdit(item: DueItem) {
    setFormError(null)
    setEditingItem(item)
  }

  async function handleCreate(payload: ItemCreate | ItemUpdate) {
    setFormError(null)
    try {
      const created = await createItem.mutateAsync(payload as ItemCreate)
      setCreateOpen(false)
      setSelectedId(created.id)
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
      await updateItem.mutateAsync({ id: editingItem.id, ...(payload as ItemUpdate) })
      setSelectedId(editingItem.id)
      setEditingItem(null)
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  async function handleComplete(item: DueItem) {
    setPageError(null)
    try {
      await completeItem.mutateAsync(item.id)
      setSelectedId(null)
    } catch (error) {
      setPageError(describeError(error))
    }
  }

  async function handleDelete() {
    if (!deletingItem) {
      return
    }
    setPageError(null)
    try {
      await deleteItem.mutateAsync(deletingItem.id)
      setSelectedId((current) => (current === deletingItem.id ? null : current))
      setDeletingItem(null)
    } catch (error) {
      setPageError(describeError(error))
    }
  }

  const overlayOpen = createOpen || editingItem !== null || deletingItem !== null || helpOpen

  useShortcuts(
    {
      onNew: openCreate,
      onFocusSearch: () => document.getElementById('filter-search')?.focus(),
      onFirstItem: () => selectBoundary(0),
      onLastItem: () => selectBoundary(-1),
      onNextItem: () => moveSelection(1),
      onPreviousItem: () => moveSelection(-1),
      onOpenItem: () => {
        const active = activeEntry()
        if (active) {
          setSelectedId(active.item.id)
        }
      },
      onCompleteItem: () => {
        const active = activeEntry()
        if (active) {
          void handleComplete(active.item)
        }
      },
      onEditItem: () => {
        const active = activeEntry()
        if (active) {
          openEdit(active.item)
        }
      },
      onDeleteItem: () => {
        const active = activeEntry()
        if (active) {
          setDeletingItem(active.item)
        }
      },
      onShowHelp: () => setHelpOpen(true),
      onEscape: () => {
        setHelpOpen(false)
        setCreateOpen(false)
        setEditingItem(null)
        setDeletingItem(null)
      },
    },
    { enabled: !overlayOpen },
  )

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

  return (
    <div data-timeline className="grid gap-8">
      <TimelineHeader onCreate={openCreate} />

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

        <span className="grid gap-1">
          <span className="font-sans text-[0.6875rem] leading-none font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Overdue
          </span>
          <span className="font-display text-xl font-semibold tabular-nums">
            {overdueEntries.length}
          </span>
        </span>

        <span className="grid gap-1">
          <span className="font-sans text-[0.6875rem] leading-none font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Active
          </span>
          <span className="font-display text-xl font-semibold tabular-nums">{entries.length}</span>
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

      <p className="sr-only" role="status" aria-live="polite">
        {selectedId
          ? `Selected ${entries.find((entry) => entry.item.id === selectedId)?.item.title ?? 'deadline'}`
          : ''}
      </p>

      {entries.length === 0 ? (
        filtersActive ? (
          <TimelineNoResults hasFilters onClearFilters={clearFilters} />
        ) : (
          <TimelineEmpty onCreate={openCreate} />
        )
      ) : (
        <>
          <TimelineCanvas
            entries={entries}
            window={viewWindow}
            referenceTimeMs={timeline.referenceTimeMs}
            liveNowMs={liveNowMs}
            timezone={timezone}
            selectedId={selectedId}
            highlightedId={highlightedId}
            onSelect={selectEntry}
            onRevealEdge={handleRevealEdge}
            clustering
            registerMarkerRef={registerMarkerRef}
          />
          <TimelineLegend />

          {overdueEntries.length === entries.length ? (
            <TimelineNote>
              All {entries.length} active {entries.length === 1 ? 'deadline is' : 'deadlines are'}{' '}
              overdue.
            </TimelineNote>
          ) : null}

          {overdueEntries.length === 0 && nextEntry ? (
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
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button type="button" size="lg" onClick={openCreate} className="w-fit">
          <Plus aria-hidden="true" />
          New deadline
        </Button>
        <span className="text-xs text-muted-foreground">
          {horizon === 'all' ? 'All time in view' : `Showing the ${horizon} horizon around now`}
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

function TimelineHeader({ onCreate }: { onCreate: () => void }) {
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
          Every active deadline against one honest now: what has passed, what is close, and what is
          still ahead.
        </p>
      </div>
      <Button type="button" size="lg" onClick={onCreate} className="w-fit">
        <Plus aria-hidden="true" />
        New deadline
      </Button>
    </header>
  )
}
