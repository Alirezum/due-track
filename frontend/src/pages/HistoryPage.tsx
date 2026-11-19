import { useState } from 'react'
import { CalendarDays, Repeat2, RotateCcw, Trash2 } from 'lucide-react'
import { ApiError } from '@/api/client'
import type { CompletionLog, DueItem, RecurrenceFrequency } from '@/api/types'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDeleteHistoryEntry, useHistory, useUndoCompletion } from '@/hooks/useHistory'
import { useItems } from '@/hooks/useItems'
import { categoryBadgeClass, categoryBadgeTone } from '@/lib/categories'
import { formatAmount, formatDue } from '@/lib/format'
import { cn } from '@/lib/utils'

const COMPLETED_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
}

const PRIORITY_ACCENT: Record<DueItem['priority'], string> = {
  critical: 'border-l-rose-600 dark:border-l-rose-400',
  high: 'border-l-amber-500 dark:border-l-amber-400',
  medium: 'border-l-teal-600 dark:border-teal-400',
  low: 'border-l-slate-400 dark:border-slate-500',
}

const PRIORITY_LABEL: Record<DueItem['priority'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const FREQUENCY_LABEL: Partial<Record<RecurrenceFrequency, string>> = {
  daily: 'Repeats daily',
  weekly: 'Repeats weekly',
  monthly: 'Repeats monthly',
  yearly: 'Repeats yearly',
}

const CUSTOM_FREQUENCY: Partial<Record<RecurrenceFrequency, [string, string]>> = {
  custom_days: ['day', 'days'],
  custom_weeks: ['week', 'weeks'],
  custom_months: ['month', 'months'],
  custom_years: ['year', 'years'],
}

function formatCompletedAt(value: string): string {
  return new Intl.DateTimeFormat(undefined, COMPLETED_OPTIONS).format(new Date(value))
}

function recurrenceSummary(item: DueItem): string | null {
  if (item.recurrence_freq === 'none') {
    return null
  }

  const custom = CUSTOM_FREQUENCY[item.recurrence_freq]
  if (custom) {
    const [singular, plural] = custom
    return item.recurrence_interval === 1
      ? `Repeats every ${singular}`
      : `Repeats every ${item.recurrence_interval} ${plural}`
  }

  return FREQUENCY_LABEL[item.recurrence_freq] ?? 'Repeats'
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.detail === 'string' && error.detail.trim()) {
      return error.detail
    }
  }
  return 'The change could not be saved. Check that the local server is running and try again.'
}

type HistoryEntryProps = {
  entry: CompletionLog
  currencyCode: string
  isUndoing: boolean
  onUndo: (entry: CompletionLog) => void
  onDelete: (entry: CompletionLog) => void
}

function HistoryEntry({
  entry,
  currencyCode,
  isUndoing,
  onUndo,
  onDelete,
}: HistoryEntryProps) {
  const item = entry.previous_state
  const amount = formatAmount(item.amount_cents, currencyCode)
  const categoryClass = categoryBadgeClass(item.category)
  const categoryTone = categoryBadgeTone(item.category)
  const recurrence = recurrenceSummary(item)

  return (
    <article className="grid gap-4 py-6 sm:grid-cols-[10.5rem_minmax(0,1fr)] sm:gap-8">
      <div className="sm:pt-0.5">
        <p className="text-[0.7rem] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Completed
        </p>
        <time
          dateTime={entry.completed_at_utc}
          className="mt-1 block font-display text-base font-semibold tabular-nums"
        >
          {formatCompletedAt(entry.completed_at_utc)}
        </time>
      </div>

      <div
        className={cn(
          'grid gap-3 border border-l-2 border-border/75 bg-card p-4',
          PRIORITY_ACCENT[item.priority],
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <h2 className="min-w-0 font-display text-xl font-semibold tracking-[-0.02em] break-words">
            {item.title}
          </h2>
          <span className="text-xs font-medium text-muted-foreground">
            {PRIORITY_LABEL[item.priority]}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          {item.category && categoryClass && categoryTone !== null ? (
            <Badge
              variant="outline"
              className={cn('rounded-sm font-medium', categoryClass)}
              data-category-tone={categoryTone}
            >
              {item.category}
            </Badge>
          ) : null}
          {amount ? (
            <span className="font-medium text-foreground tabular-nums">{amount}</span>
          ) : null}
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            Was due {formatDue(item)}
          </span>
          {recurrence ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Repeat2 className="size-3.5 shrink-0" aria-hidden="true" />
              {recurrence}
            </span>
          ) : null}
        </div>

        {item.notes ? (
          <p className="max-w-prose text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
            {item.notes}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-1">
          {entry.can_undo ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onUndo(entry)}
              disabled={isUndoing}
              aria-label={`Undo completion of ${item.title}`}
            >
              <RotateCcw aria-hidden="true" />
              {isUndoing ? 'Undoing…' : 'Undo'}
            </Button>
          ) : (
            <span className="py-1 text-xs text-muted-foreground">
              A newer completion exists for this item.
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onDelete(entry)}
            aria-label={`Delete history entry for ${item.title}`}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </div>
      </div>
    </article>
  )
}

export function HistoryPage() {
  const { data, isPending, isError, error, refetch } = useHistory()
  const { data: itemsData } = useItems()
  const undoCompletion = useUndoCompletion()
  const deleteEntry = useDeleteHistoryEntry()
  const currencyCode = itemsData?.currency_code ?? 'USD'

  const [deletingEntry, setDeletingEntry] = useState<CompletionLog | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function handleUndo(entry: CompletionLog) {
    setActionError(null)
    undoCompletion.mutate(entry.id, {
      onError: (mutationError) => setActionError(describeError(mutationError)),
    })
  }

  function handleDeleteConfirm() {
    if (!deletingEntry) {
      return
    }
    setActionError(null)
    deleteEntry.mutate(deletingEntry.id, {
      onSuccess: () => setDeletingEntry(null),
      onError: (mutationError) => setActionError(describeError(mutationError)),
    })
  }

  const warning = undoCompletion.data?.warning ?? null
  const total = data?.total ?? 0

  return (
    <section className="grid gap-8">
      <header className="grid gap-4 border-b border-border pb-7 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p className="text-[0.7rem] font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Audit trail
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
            Completion history
          </h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            Every completed obligation, newest first. Undo the latest completion of an item, or
            remove a record without touching active deadlines.
          </p>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          {total === 1 ? '1 completion' : `${total} completions`}
        </p>
      </header>

      {warning ? (
        <p
          role="alert"
          className="border-l-2 border-amber-500 bg-amber-500/10 py-2 pl-3 text-sm text-foreground"
        >
          {warning}
        </p>
      ) : null}

      {actionError ? (
        <p role="alert" className="border-l-2 border-destructive pl-3 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}

      {isPending ? (
        <p role="status" className="py-12 text-center text-sm text-muted-foreground">
          Loading completion history…
        </p>
      ) : isError ? (
        <div className="border-y border-dashed border-border py-12 text-center">
          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">
            History could not be loaded.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{describeError(error)}</p>
          <Button type="button" variant="secondary" className="mt-5" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : data && data.entries.length > 0 ? (
        <ol aria-label="Completion history" className="border-t border-border">
          {data.entries.map((entry) => (
            <li key={entry.id} className="border-b border-border/80">
              <HistoryEntry
                entry={entry}
                currencyCode={currencyCode}
                isUndoing={
                  undoCompletion.isPending && undoCompletion.variables === entry.id
                }
                onUndo={handleUndo}
                onDelete={setDeletingEntry}
              />
            </li>
          ))}
        </ol>
      ) : (
        <section
          aria-label="Empty completion history"
          className="border-y border-dashed border-border py-14 text-center"
        >
          <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">
            No completions yet.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Completed obligations will appear here, newest first.
          </p>
        </section>
      )}

      <ConfirmDialog
        open={deletingEntry !== null}
        title="Delete history entry?"
        description={
          deletingEntry ? (
            <>
              Remove the completion record for{' '}
              <strong className="font-medium text-foreground">
                {deletingEntry.previous_state.title}
              </strong>
              ? Active deadlines are not affected.
            </>
          ) : null
        }
        confirmLabel="Delete entry"
        destructive
        isPending={deleteEntry.isPending}
        onConfirm={handleDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingEntry(null)
          }
        }}
      />
    </section>
  )
}
