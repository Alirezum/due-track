import { X } from 'lucide-react'
import type { TimelineEntry } from '@/api/types'
import { TimelineDetail } from '@/components/timeline/TimelineDetail'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

export type TimelineDetailShellProps = {
  entry: TimelineEntry
  currencyCode: string
  timezone: string
  liveNowMs: number
  onClose: () => void
  onComplete: (entry: TimelineEntry) => void
  onEdit: (entry: TimelineEntry) => void
  onDelete: (entry: TimelineEntry) => void
}

export function TimelineDetailShell({
  entry,
  currencyCode,
  timezone,
  liveNowMs,
  onClose,
  onComplete,
  onEdit,
  onDelete,
}: TimelineDetailShellProps) {
  const isWide = useMediaQuery('(min-width: 1024px)')
  const isRail = useMediaQuery('(min-width: 1280px)')

  const detail = (
    <TimelineDetail
      entry={entry}
      currencyCode={currencyCode}
      timezone={timezone}
      liveNowMs={liveNowMs}
      onComplete={onComplete}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  )

  if (!isWide) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) {
            onClose()
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Deadline details</DialogTitle>
            <DialogDescription className="sr-only">
              Full details and actions for the selected deadline.
            </DialogDescription>
          </DialogHeader>
          {detail}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <aside
      aria-label={`Deadline details: ${entry.item.title}`}
      className={cn(
        'border-t border-border pt-5',
        isRail &&
          'sticky top-[5.5rem] max-h-[calc(100vh-7rem)] overflow-y-auto border-t-0 border-l border-border pt-0 pl-6',
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-sans text-[0.625rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Selected
        </span>
        <Button type="button" variant="ghost" size="icon" aria-label="Close details" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>
      {detail}
    </aside>
  )
}
