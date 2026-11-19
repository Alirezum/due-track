import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type OverdueIndicatorProps = {
  id: string
  count: number
  expanded: boolean
  controls: string
  onToggle: () => void
  variant?: 'tab' | 'summary'
}

export function OverdueIndicator({
  id,
  count,
  expanded,
  controls,
  onToggle,
  variant = 'tab',
}: OverdueIndicatorProps) {
  const hasOverdue = count > 0
  const countLabel = `${count} overdue ${count === 1 ? 'deadline' : 'deadlines'}`

  return (
    <section
      aria-labelledby={id}
      className={cn(
        'border-y border-border transition-colors hover:border-timeline-overdue/45',
        variant === 'tab' ? 'py-3' : 'py-2',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-x-4 gap-y-1',
          variant === 'tab' ? 'justify-between' : 'flex-wrap',
        )}
      >
        <div className="flex min-w-0 items-baseline gap-3">
          <span
            id={id}
            className="font-sans text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
          >
            Overdue
          </span>
          <span className="font-display text-2xl font-semibold text-timeline-overdue tabular-nums">
            {count}
          </span>
        </div>

        {hasOverdue ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={controls}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${countLabel}`}
            onClick={onToggle}
            className="min-h-10 gap-1.5 px-2.5 text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            {expanded ? 'Hide overdue' : 'Show overdue'}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'transition-transform duration-200 motion-reduce:transition-none',
                expanded && 'rotate-180',
              )}
            />
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">Nothing overdue</span>
        )}
      </div>
    </section>
  )
}
