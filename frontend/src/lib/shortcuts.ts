export type ShortcutId =
  | 'new'
  | 'search'
  | 'next'
  | 'previous'
  | 'open'
  | 'complete'
  | 'edit'
  | 'delete'
  | 'help'
  | 'escape'

export type ShortcutDefinition = {
  id: ShortcutId
  keys: readonly string[]
  hint: string
  label: string
  description: string
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: 'new',
    keys: ['n'],
    hint: 'N',
    label: 'Quick add',
    description: 'Open a new deadline with the title field focused.',
  },
  {
    id: 'search',
    keys: ['/'],
    hint: '/',
    label: 'Focus search',
    description: 'Jump to the dashboard search field.',
  },
  {
    id: 'next',
    keys: ['j'],
    hint: 'J',
    label: 'Next deadline',
    description: 'Move the active highlight to the next visible deadline.',
  },
  {
    id: 'previous',
    keys: ['k'],
    hint: 'K',
    label: 'Previous deadline',
    description: 'Move the active highlight to the previous visible deadline.',
  },
  {
    id: 'open',
    keys: ['Enter'],
    hint: 'Enter',
    label: 'Open details',
    description: 'Open the active deadline to inspect and edit it.',
  },
  {
    id: 'complete',
    keys: ['c'],
    hint: 'C',
    label: 'Complete deadline',
    description: 'Complete the active deadline without leaving the keyboard.',
  },
  {
    id: 'edit',
    keys: ['e'],
    hint: 'E',
    label: 'Edit deadline',
    description: 'Edit the active deadline.',
  },
  {
    id: 'delete',
    keys: ['Delete'],
    hint: 'Delete',
    label: 'Delete deadline',
    description: 'Ask to delete the active deadline.',
  },
  {
    id: 'help',
    keys: ['?'],
    hint: '?',
    label: 'Shortcut help',
    description: 'Show this keyboard shortcut panel.',
  },
  {
    id: 'escape',
    keys: ['Esc'],
    hint: 'Esc',
    label: 'Close overlays',
    description: 'Close the open dialog, confirmation, or help panel.',
  },
]

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }

  const editable = target.closest('[contenteditable]')
  if (editable instanceof HTMLElement) {
    const value = editable.getAttribute('contenteditable')?.toLowerCase()
    if (value !== 'false') {
      return true
    }
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/**
 * Enter has a native activation behavior on these controls. The global
 * shortcut must let that behavior run instead of cancelling it, otherwise
 * pressing Enter on a toolbar, edge, cluster, or marker button would open the
 * active deadline instead of activating the focused control.
 */
export function isNativeActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest(
      'button, a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"]',
    ),
  )
}
