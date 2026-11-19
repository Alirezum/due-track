import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import type { DueItem, ItemCreate, ItemListResponse, ItemUpdate } from '@/api/types'
import { BucketSection } from '@/components/BucketSection'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { FilterBar } from '@/components/FilterBar'
import { ItemForm } from '@/components/ItemForm'
import { OverdueIndicator } from '@/components/OverdueIndicator'
import { ShortcutHelp } from '@/components/ShortcutHelp'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCompleteItem } from '@/hooks/useCompleteItem'
import {
  fetchItems,
  itemsQueryKey,
  useCreateItem,
  useDeleteItem,
  useItems,
  useUpdateItem,
} from '@/hooks/useItems'
import { useShortcuts } from '@/hooks/useShortcuts'
import { categoriesFromItemList } from '@/lib/categories'
import { EMPTY_FILTERS, hasActiveFilters, type ItemFilters } from '@/lib/filters'

const REFETCH_INTERVAL_MS = 55_000
const OVERDUE_LABEL_ID = 'dashboard-overdue-label'
const OVERDUE_REGION_ID = 'dashboard-overdue-region'

type HiddenItemNotice = {
  item: DueItem
  reason: 'overdue' | 'filtered'
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.detail === 'string' && error.detail.trim()) {
      return error.detail
    }
    if (Array.isArray(error.detail)) {
      return 'Check the highlighted fields and try again.'
    }
  }
  return 'The change could not be saved. Check that the local server is running and try again.'
}

function allBucketItems(data: ItemListResponse): DueItem[] {
  return [
    ...data.buckets.overdue,
    ...data.buckets.due_today,
    ...data.buckets.upcoming,
    ...data.buckets.later,
  ]
}

function findItem(data: ItemListResponse | undefined, id: number): DueItem | null {
  if (!data) {
    return null
  }
  return allBucketItems(data).find((item) => item.id === id) ?? null
}

function isOverdueIn(data: ItemListResponse, id: number): boolean {
  return data.buckets.overdue.some((item) => item.id === id)
}

function pluralDeadlines(count: number): string {
  return count === 1 ? '1 deadline is overdue.' : `${count} deadlines are overdue.`
}

function pluralOverdue(count: number): string {
  return count === 1 ? '1 overdue deadline matches.' : `${count} overdue deadlines match.`
}

export function DashboardPage() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_FILTERS)
  const [showOverdue, setShowOverdue] = useState(false)
  const { data, isPending, isFetching, isPlaceholderData, isError, error, refetch } = useItems(
    filters,
    showOverdue ? 'all' : 'upcoming',
    { refetchInterval: REFETCH_INTERVAL_MS, refetchOnWindowFocus: true },
  )
  const categorySource = useItems()
  const categories = useMemo(() => categoriesFromItemList(categorySource.data), [categorySource.data])
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const completeItem = useCompleteItem()

  const [createOpen, setCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DueItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<DueItem | null>(null)
  const [completingItemId, setCompletingItemId] = useState<number | null>(null)
  const [activeItemId, setActiveItemId] = useState<number | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [hiddenItem, setHiddenItem] = useState<HiddenItemNotice | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [pendingRevealFocus, setPendingRevealFocus] = useState(false)
  const [pendingHideFocus, setPendingHideFocus] = useState(false)

  const visibleOverdue = useMemo(
    () => (showOverdue && data ? data.buckets.overdue : []),
    [data, showOverdue],
  )
  const flatItems = useMemo(
    () =>
      data
        ? [
            ...visibleOverdue,
            ...data.buckets.due_today,
            ...data.buckets.upcoming,
            ...data.buckets.later,
          ]
        : [],
    [data, visibleOverdue],
  )
  const activeItem = useMemo(
    () => flatItems.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, flatItems],
  )
  const visibleUpcomingCount =
    (data?.buckets.due_today.length ?? 0) +
    (data?.buckets.upcoming.length ?? 0) +
    (data?.buckets.later.length ?? 0)
  const overdueCount = data?.summary.overdue_count ?? 0
  const filtersActive = hasActiveFilters(filters)
  const trulyEmpty =
    data !== undefined &&
    !filtersActive &&
    visibleUpcomingCount === 0 &&
    overdueCount === 0

  useEffect(() => {
    if (activeItemId === null) {
      return
    }
    const node = document.querySelector<HTMLElement>(`[data-item-id="${activeItemId}"]`)
    node?.focus()
  }, [activeItemId])

  useEffect(() => {
    if (activeItemId === null || flatItems.some((item) => item.id === activeItemId)) {
      return
    }
    const next = flatItems[0]?.id ?? null
    setActiveItemId(next)
    setAnnouncement(next === null ? 'No upcoming deadlines remain.' : 'Selected the next deadline.')
  }, [activeItemId, flatItems])

  useEffect(() => {
    if (!pendingRevealFocus || !showOverdue || isPlaceholderData) {
      return
    }
    const first = visibleOverdue[0]
    if (first) {
      setActiveItemId(first.id)
      document.querySelector<HTMLElement>(`[data-item-id="${first.id}"]`)?.focus()
      setAnnouncement(
        `Showing ${overdueCount} overdue ${overdueCount === 1 ? 'deadline' : 'deadlines'}.`,
      )
    } else {
      document.getElementById(OVERDUE_REGION_ID)?.focus()
      setAnnouncement(
        `Showing ${overdueCount} overdue ${overdueCount === 1 ? 'deadline' : 'deadlines'}.`,
      )
    }
    setPendingRevealFocus(false)
  }, [isPlaceholderData, overdueCount, pendingRevealFocus, showOverdue, visibleOverdue])

  useEffect(() => {
    if (!pendingHideFocus || showOverdue) {
      return
    }
    document
      .querySelector<HTMLElement>(`[aria-controls="${OVERDUE_REGION_ID}"]`)
      ?.focus()
    setPendingHideFocus(false)
  }, [pendingHideFocus, showOverdue])

  function openCreate() {
    setFormError(null)
    setCreateOpen(true)
  }

  function openEdit(item: DueItem) {
    setFormError(null)
    setEditingItem(item)
  }

  function revealOverdue() {
    setHiddenItem(null)
    setPendingRevealFocus(true)
    setShowOverdue(true)
  }

  function hideOverdue() {
    setHiddenItem(null)
    setActiveItemId(null)
    setPendingHideFocus(true)
    setShowOverdue(false)
    setAnnouncement('Hiding overdue deadlines. Showing upcoming only.')
  }

  async function noticeForSavedItem(saved: DueItem): Promise<HiddenItemNotice | null> {
    if (showOverdue) {
      return null
    }

    const allScoped = await queryClient.fetchQuery({
      queryKey: [...itemsQueryKey, filters, 'all'],
      queryFn: () => fetchItems(filters, 'all'),
    })
    if (findItem(allScoped, saved.id)) {
      return isOverdueIn(allScoped, saved.id) ? { item: saved, reason: 'overdue' } : null
    }

    const unfiltered: ItemListResponse =
      categorySource.data ??
      (await queryClient.fetchQuery<ItemListResponse>({
        queryKey: [...itemsQueryKey, EMPTY_FILTERS, 'all'],
        queryFn: () => fetchItems(EMPTY_FILTERS, 'all'),
      }))
    if (!findItem(unfiltered, saved.id)) {
      return null
    }
    if (isOverdueIn(unfiltered, saved.id)) {
      return { item: saved, reason: 'overdue' }
    }
    return hasActiveFilters(filters) ? { item: saved, reason: 'filtered' } : null
  }

  async function handleCreate(payload: ItemCreate | ItemUpdate) {
    setFormError(null)
    try {
      const saved = await createItem.mutateAsync(payload as ItemCreate)
      setHiddenItem(await noticeForSavedItem(saved))
      setCreateOpen(false)
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
      const saved = await updateItem.mutateAsync({ id: editingItem.id, ...(payload as ItemUpdate) })
      setHiddenItem(await noticeForSavedItem(saved))
      setEditingItem(null)
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  async function handleComplete(item: DueItem) {
    setPageError(null)
    setCompletingItemId(item.id)
    try {
      await completeItem.mutateAsync(item.id)
      setAnnouncement(`Completed ${item.title}.`)
    } catch (error) {
      setPageError(describeError(error))
    } finally {
      setCompletingItemId(null)
    }
  }

  async function handleDelete() {
    if (!deletingItem) {
      return
    }
    setPageError(null)
    try {
      await deleteItem.mutateAsync(deletingItem.id)
      setAnnouncement(`Deleted ${deletingItem.title}.`)
      setDeletingItem(null)
    } catch (error) {
      setPageError(describeError(error))
    }
  }

  function moveActiveItem(direction: -1 | 1) {
    if (flatItems.length === 0) {
      return
    }
    setActiveItemId((current) => {
      const index = current === null ? -1 : flatItems.findIndex((item) => item.id === current)
      if (index === -1) {
        return direction === 1 ? flatItems[0].id : flatItems[flatItems.length - 1].id
      }
      const nextIndex = Math.min(Math.max(index + direction, 0), flatItems.length - 1)
      return flatItems[nextIndex].id
    })
  }

  const overlayOpen = createOpen || editingItem !== null || deletingItem !== null || helpOpen

  useShortcuts(
    {
      onNew: openCreate,
      onFocusSearch: () => document.getElementById('filter-search')?.focus(),
      onNextItem: () => moveActiveItem(1),
      onPreviousItem: () => moveActiveItem(-1),
      onOpenItem: () => {
        if (activeItem) {
          openEdit(activeItem)
        }
      },
      onCompleteItem: () => {
        if (activeItem) {
          void handleComplete(activeItem)
        }
      },
      onEditItem: () => {
        if (activeItem) {
          openEdit(activeItem)
        }
      },
      onDeleteItem: () => {
        if (activeItem) {
          setDeletingItem(activeItem)
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

  if (isPending && !data) {
    return (
      <section className="grid gap-4" aria-busy="true">
        <p className="text-sm text-muted-foreground">Loading deadlines…</p>
        <div className="h-24 animate-pulse border-y border-border bg-muted/40" />
      </section>
    )
  }

  if (!data) {
    return (
      <section className="grid max-w-xl gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em]">
          The dashboard could not be read.
        </h1>
        <p className="text-muted-foreground">{describeError(error)}</p>
        <Button type="button" className="w-fit" onClick={() => void refetch()}>
          Try again
        </Button>
      </section>
    )
  }

  const { buckets, summary } = data
  const overdueButton = (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={revealOverdue}
      className="w-fit"
    >
      Show overdue
    </Button>
  )

  if (trulyEmpty) {
    return (
      <div className="grid gap-10">
        <DashboardHeader onCreate={openCreate} />
        <section
          aria-label="Empty ledger"
          className="border-y border-dashed border-border py-16 text-center"
        >
          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">
            Nothing on the ledger yet.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Add your first deadline and it will appear here when it is upcoming.
          </p>
          <Button type="button" className="mt-5" onClick={openCreate}>
            <Plus aria-hidden="true" />
            New deadline
          </Button>
        </section>
      </div>
    )
  }

  const noUpcoming = visibleUpcomingCount === 0
  const onlyOverdueHidden = noUpcoming && overdueCount > 0 && !showOverdue
  const noResults = filtersActive && noUpcoming && overdueCount === 0
  const listLabel = showOverdue ? 'Deadlines including overdue' : 'Upcoming deadlines'

  return (
    <div className="grid gap-10">
      <DashboardHeader onCreate={openCreate} showOverdue={showOverdue} />

      <section
        aria-label="Dashboard summary"
        className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-border py-4"
      >
        <SummaryCell value={buckets.upcoming.length} label="Next 7 days" />
        <SummaryCell value={summary.due_today_count} label="Due today" />
        <SummaryCell value={summary.overdue_count} label="Overdue" />
        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {isFetching ? 'Updating…' : ''}
        </span>
      </section>

      <FilterBar filters={filters} categories={categories} onChange={setFilters} />

      {isError ? (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-3 border-l-2 border-destructive pl-3 text-sm text-destructive"
        >
          The dashboard could not be updated. {describeError(error)}
          <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </p>
      ) : null}

      {pageError ? (
        <p className="border-l-2 border-destructive pl-3 text-sm text-destructive" role="alert">
          {pageError}
        </p>
      ) : null}

      {hiddenItem ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 border-l-2 border-timeline-overdue bg-timeline-overdue-soft/40 py-2 pl-3 text-sm"
        >
          <span>
            Saved “{hiddenItem.item.title}”.{' '}
            {hiddenItem.reason === 'overdue'
              ? 'It is overdue, so it is hidden by the upcoming focus.'
              : 'It is hidden by the current filters.'}
          </span>
          {hiddenItem.reason === 'overdue' ? (
            <Button type="button" variant="ghost" size="sm" onClick={revealOverdue}>
              Show overdue
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters(EMPTY_FILTERS)
                setHiddenItem(null)
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <p className="sr-only" aria-live="polite">
        {activeItem ? `Active deadline: ${activeItem.title}` : ''}
      </p>

      {noResults ? (
        <section
          aria-label="Filtered results"
          className="border-y border-dashed border-border py-12 text-center"
        >
          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">
            No deadlines match these filters.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Clear filters to see the full ledger.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-5"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Clear filters
          </Button>
        </section>
      ) : onlyOverdueHidden ? (
        <div className="grid gap-8">
          <OverdueIndicator
            id={OVERDUE_LABEL_ID}
            count={overdueCount}
            expanded={false}
            controls={OVERDUE_REGION_ID}
            onToggle={revealOverdue}
          />
          <section
            aria-label="Upcoming deadlines"
            className="border-y border-dashed border-border py-12 text-center"
          >
            <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">
              {filtersActive ? 'No upcoming deadlines match these filters.' : 'Nothing is upcoming.'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {filtersActive ? pluralOverdue(overdueCount) : pluralDeadlines(overdueCount)}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={openCreate}>
                <Plus aria-hidden="true" />
                New deadline
              </Button>
              {filtersActive ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  Clear filters
                </Button>
              ) : null}
              {overdueButton}
            </div>
          </section>
        </div>
      ) : (
        <section
          aria-label={listLabel}
          aria-busy={isFetching}
          className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
        >
          <div className="grid content-start gap-10">
            <OverdueIndicator
              id={OVERDUE_LABEL_ID}
              count={overdueCount}
              expanded={showOverdue}
              controls={OVERDUE_REGION_ID}
              onToggle={showOverdue ? hideOverdue : revealOverdue}
            />
            {showOverdue ? (
              <div id={OVERDUE_REGION_ID} tabIndex={-1} className="outline-none">
                <BucketSection
                  id="overdue"
                  title="Overdue"
                  tone="overdue"
                  items={visibleOverdue}
                  emptyLabel="Nothing overdue"
                  onEdit={openEdit}
                  onDelete={setDeletingItem}
                  onComplete={(item) => void handleComplete(item)}
                  completingItemId={completingItemId}
                  activeItemId={activeItemId}
                />
              </div>
            ) : null}
            <BucketSection
              id="due-today"
              title="Due today"
              tone="today"
              items={buckets.due_today}
              emptyLabel="Nothing due today"
              onEdit={openEdit}
              onDelete={setDeletingItem}
              onComplete={(item) => void handleComplete(item)}
              completingItemId={completingItemId}
              activeItemId={activeItemId}
            />
            {showOverdue && noUpcoming && overdueCount > 0 ? (
              <p className="border-l border-dashed border-border pl-3 text-sm text-muted-foreground">
                Nothing is upcoming. {pluralDeadlines(overdueCount)}
              </p>
            ) : null}
          </div>
          <div className="grid content-start gap-10">
            <BucketSection
              id="upcoming"
              title="Upcoming"
              tone="upcoming"
              items={buckets.upcoming}
              emptyLabel="Nothing in the next seven days"
              onEdit={openEdit}
              onDelete={setDeletingItem}
              onComplete={(item) => void handleComplete(item)}
              completingItemId={completingItemId}
              activeItemId={activeItemId}
            />
            <BucketSection
              id="later"
              title="Later"
              tone="later"
              items={buckets.later}
              emptyLabel="Nothing later"
              onEdit={openEdit}
              onDelete={setDeletingItem}
              onComplete={(item) => void handleComplete(item)}
              completingItemId={completingItemId}
              activeItemId={activeItemId}
            />
          </div>
        </section>
      )}

      {createOpen ? (
        <Dialog open onOpenChange={setCreateOpen}>
          <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>New deadline</DialogTitle>
              <DialogDescription>
                Add one obligation. Use a date for all-day deadlines, or a date and time for a
                specific moment.
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
            ? `“${deletingItem.title}” will leave the dashboard. Completion history is kept.`
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

function SummaryCell({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-2" data-summary={label}>
      <strong className="font-display text-2xl font-semibold tabular-nums">{value}</strong>
      <span className="font-sans text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </span>
    </span>
  )
}

function DashboardHeader({
  onCreate,
  showOverdue = false,
}: {
  onCreate: () => void
  showOverdue?: boolean
}) {
  return (
    <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="max-w-2xl">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
          Deadlines, in order.
        </h1>
        <p className="mt-3 max-w-prose text-muted-foreground">
          {showOverdue
            ? 'A local ledger of what is overdue, what is due today, and what is coming. Nothing leaves this machine.'
            : 'A local ledger of what is due today and what is coming. Overdue deadlines are summarized in the ledger tab; nothing leaves this machine.'}
        </p>
      </div>
      <Button type="button" size="lg" onClick={onCreate} className="w-fit">
        <Plus aria-hidden="true" />
        New deadline
      </Button>
    </header>
  )
}
