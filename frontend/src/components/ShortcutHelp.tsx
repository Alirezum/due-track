import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SHORTCUTS } from '@/lib/shortcuts'

export type ShortcutHelpProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutHelp({ open, onOpenChange }: ShortcutHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            The dashboard is keyboard-first. Shortcuts pause while you type in a field.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.id}
              className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <dt className="text-sm font-medium">{shortcut.label}</dt>
                <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {shortcut.description}
                </dd>
              </div>
              <kbd className="shrink-0 rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs font-medium text-foreground shadow-xs">
                {shortcut.hint}
              </kbd>
            </div>
          ))}
        </dl>

        <p className="text-xs text-muted-foreground">
          Press{' '}
          <kbd className="rounded-sm border border-border bg-muted px-1 py-0.5 font-mono text-[0.7rem]">
            Esc
          </kbd>{' '}
          to close any panel.
        </p>
      </DialogContent>
    </Dialog>
  )
}
