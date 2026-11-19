import type { TimelineEntry } from '@/api/types'
import { useShortcuts } from '@/hooks/useShortcuts'

export type TimelineShortcutHandlers = {
  entries: TimelineEntry[]
  selectedId: number | null
  onSelect: (entry: TimelineEntry, focus: boolean) => void
  onOpenDetail: (entry: TimelineEntry) => void
  onComplete: (entry: TimelineEntry) => void
  onEdit: (entry: TimelineEntry) => void
  onDelete: (entry: TimelineEntry) => void
  onNew: () => void
  onFocusSearch: () => void
  onShowHelp: () => void
  onEscape: () => void
  enabled?: boolean
}

export function useTimelineShortcuts({
  entries,
  selectedId,
  onSelect,
  onOpenDetail,
  onComplete,
  onEdit,
  onDelete,
  onNew,
  onFocusSearch,
  onShowHelp,
  onEscape,
  enabled = true,
}: TimelineShortcutHandlers) {
  const active =
    entries.find((entry) => entry.item.id === selectedId) ?? entries[0] ?? null

  function moveSelection(direction: -1 | 1) {
    if (entries.length === 0) {
      return
    }
    const currentIndex =
      selectedId === null ? -1 : entries.findIndex((entry) => entry.item.id === selectedId)
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : entries.length - 1
        : Math.min(Math.max(currentIndex + direction, 0), entries.length - 1)
    const next = entries[nextIndex]
    if (next) {
      onSelect(next, true)
    }
  }

  function selectBoundary(index: 0 | -1) {
    const next = entries.at(index)
    if (next) {
      onSelect(next, true)
    }
  }

  useShortcuts({
    onNew,
    onFocusSearch,
    onFirstItem: () => selectBoundary(0),
    onLastItem: () => selectBoundary(-1),
    onNextItem: () => moveSelection(1),
    onPreviousItem: () => moveSelection(-1),
    onOpenItem: () => {
      if (active) {
        onOpenDetail(active)
      }
    },
    onCompleteItem: () => {
      if (active) {
        onComplete(active)
      }
    },
    onEditItem: () => {
      if (active) {
        onEdit(active)
      }
    },
    onDeleteItem: () => {
      if (active) {
        onDelete(active)
      }
    },
    onShowHelp,
    onEscape,
  }, { enabled })
}
