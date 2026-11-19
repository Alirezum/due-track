import { CalendarDays, Pencil, Repeat2, Trash2 } from 'lucide-react'
import type { DueItem, RecurrenceFrequency } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { categoryBadgeClass, categoryBadgeTone } from '@/lib/categories'
import { formatAmount, formatDue, formatLocalDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const PRIORITY_BORDER: Record<DueItem['priority'], string> = {
  critical: 'border-l-rose-600 dark:border-l-rose-400',
  high: 'border-l-amber-500 dark:border-l-amber-400',
  medium: 'border-l-teal-600 dark:border-l-teal-400',
  low: 'border-l-slate-400 dark:border-l-slate-500',
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

export type ItemCardProps = {
  item: DueItem
  currencyCode: string
  onEdit: (item: DueItem) => void
  onDelete: (item: DueItem) => void
  onComplete?: (item: DueItem) => void
  isCompleting?: boolean
}

export function ItemCard({
  item,
  currencyCode,
  onEdit,
  onDelete,
  onComplete,
  isCompleting = false,
}: ItemCardProps) {
  const amount = formatAmount(item.amount_cents, currencyCode)
  const categoryClass = categoryBadgeClass(item.category)
  const tone = categoryBadgeTone(item.category)
  const recurrence = recurrenceSummary(item)

  return (
    <article
      aria-label={item.title}
      className={cn(
        'grid gap-3 border border-l-2 border-border/75 bg-card p-4 transition-colors',
        'hover:border-border hover:bg-accent/35 focus-within:border-ring/60',
        PRIORITY_BORDER[item.priority],
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base leading-snug font-semibold tracking-[-0.01em] break-words">
            {item.title}
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{formatDue(item)}</span>
          </p>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {PRIORITY_LABEL[item.priority]}
        </span>
      </div>

      {item.category || amount || recurrence ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {item.category && categoryClass && tone !== null ? (
            <Badge
              variant="outline"
              className={cn('rounded-sm font-medium', categoryClass)}
              data-category-tone={tone}
            >
              {item.category}
            </Badge>
          ) : null}
          {amount ? (
            <span className="font-medium tabular-nums text-foreground">{amount}</span>
          ) : null}
          {recurrence ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Repeat2 className="size-3.5" aria-hidden="true" />
              {recurrence}
            </span>
          ) : null}
          {item.recurrence_remaining_count !== null && item.recurrence_freq !== 'none' ? (
            <span className="text-muted-foreground">
              {item.recurrence_remaining_count === 1
                ? 'Last occurrence'
                : `${item.recurrence_remaining_count} occurrences remain`}
            </span>
          ) : null}
          {item.recurrence_end_date ? (
            <span className="text-muted-foreground">
              Ends {formatLocalDate(item.recurrence_end_date)}
            </span>
          ) : null}
        </div>
      ) : null}

      {item.notes ? (
        <p className="max-w-prose text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
          {item.notes}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        {onComplete ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onComplete(item)}
            disabled={isCompleting}
            aria-label={isCompleting ? 'Completing…' : `Complete ${item.title}`}
          >
            {isCompleting ? 'Completing…' : 'Complete'}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onEdit(item)}
          aria-label={`Edit ${item.title}`}
        >
          <Pencil aria-hidden="true" />
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onDelete(item)}
          aria-label={`Delete ${item.title}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      </div>
    </article>
  )
}
