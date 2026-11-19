import type { DueItem } from '@/api/types'
import { ItemCard } from '@/components/ItemCard'
import { cn } from '@/lib/utils'

export type BucketSectionProps = {
  id: string
  title: string
  items: DueItem[]
  emptyLabel: string
  tone?: 'overdue' | 'today' | 'upcoming' | 'later'
  onEdit: (item: DueItem) => void
  onDelete: (item: DueItem) => void
  onComplete?: (item: DueItem) => void
  completingItemId?: number | null
  activeItemId?: number | null
}

const TONE_RULE: Record<NonNullable<BucketSectionProps['tone']>, string> = {
  overdue: 'bg-rose-600 dark:bg-rose-400',
  today: 'bg-teal-600 dark:bg-teal-400',
  upcoming: 'bg-amber-500 dark:bg-amber-400',
  later: 'bg-slate-400 dark:bg-slate-500',
}

export function BucketSection({
  id,
  title,
  items,
  emptyLabel,
  tone = 'later',
  onEdit,
  onDelete,
  onComplete,
  completingItemId = null,
  activeItemId = null,
}: BucketSectionProps) {
  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-3">
      <div className="flex items-baseline gap-3">
        <span className={cn('h-4 w-1 shrink-0 translate-y-0.5', TONE_RULE[tone])} aria-hidden="true" />
        <h2
          id={`${id}-heading`}
          className="font-display text-2xl font-semibold tracking-[-0.025em]"
        >
          {title}
        </h2>
        <span className="text-sm tabular-nums text-muted-foreground">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="border-l border-dashed border-border pl-3 text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onEdit={onEdit}
              onDelete={onDelete}
              onComplete={onComplete}
              isCompleting={completingItemId === item.id}
              isActive={activeItemId === item.id}
            />
          ))}
        </div>
      )}
    </section>
  )
}
