import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type TimelineEdgeSummaryProps = {
  edge: 'left' | 'right'
  count: number
  onReveal: () => void
  orientation?: 'horizontal' | 'vertical'
}

export function TimelineEdgeSummary({
  edge,
  count,
  onReveal,
  orientation = 'horizontal',
}: TimelineEdgeSummaryProps) {
  const direction = edge === 'left' ? 'earlier' : 'later'
  const label = `Show ${count} ${direction} ${count === 1 ? 'deadline' : 'deadlines'}`

  return (
    <button
      type="button"
      onClick={onReveal}
      aria-label={label}
      className={cn(
        'group flex items-center gap-1 rounded-[2px] border border-dashed border-timeline-edge bg-timeline-paper/95 font-sans font-semibold text-timeline-tick outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
        orientation === 'horizontal'
          ? 'absolute top-1/2 z-30 -translate-y-1/2 px-2 py-1 text-[0.6875rem]'
          : 'w-full justify-center px-3 py-2 text-xs',
        orientation === 'horizontal' && (edge === 'left' ? 'left-0' : 'right-0'),
      )}
    >
      {edge === 'left' ? <ChevronLeft aria-hidden="true" className="size-3" /> : null}
      <span>
        {count} {direction}
      </span>
      {edge === 'right' ? <ChevronRight aria-hidden="true" className="size-3" /> : null}
    </button>
  )
}
