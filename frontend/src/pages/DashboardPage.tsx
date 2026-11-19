import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ApiError } from '@/api/client'
import type { DueItem, ItemCreate, ItemUpdate } from '@/api/types'
import { BucketSection } from '@/components/BucketSection'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ItemForm } from '@/components/ItemForm'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCreateItem, useDeleteItem, useItems, useUpdateItem } from '@/hooks/useItems'
import { formatAmount } from '@/lib/format'

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

export function DashboardPage() {
  const { data, isPending, isError, error, refetch } = useItems()
  const createItem = useCreateItem()
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()

  const [createOpen, setCreateOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<DueItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<DueItem | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

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
      await createItem.mutateAsync(payload as ItemCreate)
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
      await updateItem.mutateAsync({ id: editingItem.id, ...(payload as ItemUpdate) })
      setEditingItem(null)
    } catch (error) {
      setFormError(describeError(error))
    }
  }

  async function handleDelete() {
    if (!deletingItem) {
      return
    }
    setPageError(null)
    try {
      await deleteItem.mutateAsync(deletingItem.id)
      setDeletingItem(null)
    } catch (error) {
      setPageError(describeError(error))
    }
  }

  if (isPending) {
    return (
      <section className="grid gap-4" aria-busy="true">
        <p className="text-sm text-muted-foreground">Loading deadlines…</p>
        <div className="h-24 animate-pulse border-y border-border bg-muted/40" />
      </section>
    )
  }

  if (isError || !data) {
    return (
      <section className="grid max-w-xl gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em]">
          The dashboard did not load.
        </h1>
        <p className="text-muted-foreground">{describeError(error)}</p>
        <Button type="button" className="w-fit" onClick={() => void refetch()}>
          Try again
        </Button>
      </section>
    )
  }

  const { buckets, summary, currency_code: currencyCode } = data
  const upcomingTotal = formatAmount(summary.upcoming_total_cents, currencyCode) ?? '—'

  return (
    <div className="grid gap-10">
      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
            Deadlines, in order.
          </h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            A local ledger of what is overdue, what is due today, and what is coming. Nothing leaves
            this machine.
          </p>
        </div>
        <Button type="button" size="lg" onClick={openCreate} className="w-fit">
          <Plus aria-hidden="true" />
          New deadline
        </Button>
      </header>

      <section
        aria-label="Dashboard summary"
        className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-border py-4"
      >
        <span className="inline-flex items-baseline gap-2">
          <strong className="font-display text-3xl font-semibold tabular-nums">
            {summary.overdue_count}
          </strong>
          <span className="text-sm text-muted-foreground">Overdue</span>
        </span>
        <span className="inline-flex items-baseline gap-2">
          <strong className="font-display text-3xl font-semibold tabular-nums">
            {summary.due_today_count}
          </strong>
          <span className="text-sm text-muted-foreground">Due today</span>
        </span>
        <span className="inline-flex items-baseline gap-2">
          <strong className="font-display text-3xl font-semibold tabular-nums">
            {upcomingTotal}
          </strong>
          <span className="text-sm text-muted-foreground">Upcoming total</span>
        </span>
      </section>

      {pageError ? (
        <p className="border-l-2 border-destructive pl-3 text-sm text-destructive" role="alert">
          {pageError}
        </p>
      ) : null}

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="grid content-start gap-10">
          <BucketSection
            id="overdue"
            title="Overdue"
            tone="overdue"
            items={buckets.overdue}
            emptyLabel="Nothing overdue"
            currencyCode={currencyCode}
            onEdit={openEdit}
            onDelete={setDeletingItem}
          />
          <BucketSection
            id="due-today"
            title="Due today"
            tone="today"
            items={buckets.due_today}
            emptyLabel="Nothing due today"
            currencyCode={currencyCode}
            onEdit={openEdit}
            onDelete={setDeletingItem}
          />
        </div>
        <div className="grid content-start gap-10">
          <BucketSection
            id="upcoming"
            title="Upcoming"
            tone="upcoming"
            items={buckets.upcoming}
            emptyLabel="Nothing in the next seven days"
            currencyCode={currencyCode}
            onEdit={openEdit}
            onDelete={setDeletingItem}
          />
          <BucketSection
            id="later"
            title="Later"
            tone="later"
            items={buckets.later}
            emptyLabel="Nothing later"
            currencyCode={currencyCode}
            onEdit={openEdit}
            onDelete={setDeletingItem}
          />
        </div>
      </div>

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
    </div>
  )
}
