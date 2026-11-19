import { LocateFixed, RotateCcw } from 'lucide-react'
import { HorizonControl } from '@/components/timeline/HorizonControl'
import { Button } from '@/components/ui/button'
import { formatVisibleSpan } from '@/lib/timeline/format'
import type { TimeHorizon, TimelineWindow } from '@/lib/timeline/horizons'

type TimelineToolbarProps = {
  horizon: TimeHorizon
  onHorizonChange: (horizon: TimeHorizon) => void
  window: TimelineWindow
  timezone: string
  onJumpToNow: () => void
  onResetSpan: () => void
  isFetching: boolean
}

export function TimelineToolbar({
  horizon,
  onHorizonChange,
  window,
  timezone,
  onJumpToNow,
  onResetSpan,
  isFetching,
}: TimelineToolbarProps) {
  const hasManualSpan =
    window.revealedEdges.left !== null || window.revealedEdges.right !== null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <HorizonControl value={horizon} onChange={onHorizonChange} />

      <p className="font-sans text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {formatVisibleSpan(window.startMs, window.endMs, timezone)}
      </p>

      {hasManualSpan ? (
        <Button type="button" variant="outline" size="sm" onClick={onResetSpan}>
          <RotateCcw aria-hidden="true" />
          Reset span
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-3">
        {isFetching ? (
          <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
            Updating…
          </span>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={onJumpToNow}>
          <LocateFixed aria-hidden="true" />
          Jump to now
        </Button>
      </div>
    </div>
  )
}
