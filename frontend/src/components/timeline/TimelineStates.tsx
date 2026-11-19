import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

type TimelineSkeletonProps = {
  label?: string
}

export function TimelineSkeleton({ label = 'Reading the ledger…' }: TimelineSkeletonProps) {
  return (
    <section
      aria-busy="true"
      aria-label="Loading timeline"
      className="relative overflow-hidden rounded-[2px] border border-border bg-timeline-paper px-4 py-8 sm:px-6"
    >
      <span className="sr-only">{label}</span>
      <div className="timeline-shimmer relative h-[18rem]">
        <div className="absolute inset-x-0 top-1/2 h-px bg-timeline-grid" />
        {[10, 30, 52, 74, 90].map((left) => (
          <div key={left} className="absolute inset-y-0" style={{ left: `${left}%` }}>
            <div className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-timeline-grid" />
            <div className="absolute top-[calc(50%+0.75rem)] h-2 w-10 -translate-x-1/2 rounded-[2px] bg-muted" />
          </div>
        ))}
        {[
          { left: '24%', top: '18%' },
          { left: '46%', top: '12%' },
          { left: '68%', top: '22%' },
          { left: '36%', top: '66%' },
        ].map((position) => (
          <div
            key={position.left}
            className="absolute h-16 w-32 -translate-x-1/2 rounded-[4px] border border-border bg-card/70"
            style={{ left: position.left, top: position.top }}
          />
        ))}
      </div>
    </section>
  )
}

type TimelineEmptyProps = {
  onCreate: () => void
}

export function TimelineEmpty({ onCreate }: TimelineEmptyProps) {
  return (
    <section
      aria-label="Empty timeline"
      className="relative overflow-hidden rounded-[2px] border border-border bg-timeline-paper px-6 py-14 text-center"
    >
      <div aria-hidden="true" className="mx-auto mb-6 w-full max-w-md">
        <div className="flex items-end justify-between border-b border-timeline-rule pb-1">
          {Array.from({ length: 9 }, (_, index) => (
            <span
              key={index}
              className="block w-px bg-timeline-tick"
              style={{ height: index % 4 === 0 ? '0.75rem' : '0.375rem' }}
            />
          ))}
        </div>
      </div>
      <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-balance">
        Nothing on the ledger yet.
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Add your first deadline and it will take its place in time.
      </p>
      <Button type="button" className="mt-5" onClick={onCreate}>
        <Plus aria-hidden="true" />
        New deadline
      </Button>
    </section>
  )
}

type TimelineErrorProps = {
  message: string
  onRetry: () => void
}

export function TimelineError({ message, onRetry }: TimelineErrorProps) {
  return (
    <section
      role="alert"
      className="rounded-[2px] border border-border border-l-2 border-l-destructive bg-timeline-paper px-5 py-8"
    >
      <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">
        The timeline could not be read.
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </section>
  )
}

type TimelineUpcomingEmptyProps = {
  hasFilters: boolean
  overdueCount: number
  onCreate: () => void
  onShowOverdue: () => void
  onClearFilters: () => void
}

export function TimelineUpcomingEmpty({
  hasFilters,
  overdueCount,
  onCreate,
  onShowOverdue,
  onClearFilters,
}: TimelineUpcomingEmptyProps) {
  const overdueLabel =
    overdueCount === 1 ? '1 deadline is overdue.' : `${overdueCount} deadlines are overdue.`
  const matchesLabel =
    overdueCount === 1 ? '1 overdue deadline matches.' : `${overdueCount} overdue deadlines match.`

  return (
    <section
      aria-label="Upcoming deadlines"
      className="rounded-[2px] border border-dashed border-border bg-timeline-paper px-6 py-12 text-center"
    >
      <h2 className="font-display text-2xl font-semibold tracking-[-0.025em] text-balance">
        {hasFilters ? 'No upcoming deadlines match these filters.' : 'Nothing is upcoming.'}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {hasFilters ? matchesLabel : overdueLabel}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={onCreate}>
          <Plus aria-hidden="true" />
          New deadline
        </Button>
        {hasFilters ? (
          <Button type="button" variant="ghost" onClick={onClearFilters}>
            Clear filters
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onShowOverdue}>
          Show overdue
        </Button>
      </div>
    </section>
  )
}

type TimelineNoResultsProps = {
  hasFilters: boolean
  onClearFilters: () => void
}

export function TimelineNoResults({ hasFilters, onClearFilters }: TimelineNoResultsProps) {
  return (
    <section
      aria-label="Filtered timeline"
      className="rounded-[2px] border border-dashed border-border bg-timeline-paper px-6 py-12 text-center"
    >
      <h2 className="font-display text-2xl font-semibold tracking-[-0.025em]">
        {hasFilters ? 'No deadlines match these filters.' : 'No deadlines in this span.'}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasFilters
          ? 'Keep the filters or clear them to return to the full ledger.'
          : 'Widen the horizon to see what lies beyond.'}
      </p>
      {hasFilters ? (
        <Button type="button" variant="outline" className="mt-4" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : null}
    </section>
  )
}

type TimelineNoteProps = {
  children: React.ReactNode
}

export function TimelineNote({ children }: TimelineNoteProps) {
  return (
    <p className="border-l-2 border-timeline-edge pl-3 text-sm text-muted-foreground">{children}</p>
  )
}
