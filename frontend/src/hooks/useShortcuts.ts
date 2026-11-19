import { useEffect, useRef } from 'react'
import { isNativeActivationTarget, isTypingTarget } from '@/lib/shortcuts'

export type ShortcutHandlers = {
  onNew?: () => void
  onFocusSearch?: () => void
  onFirstItem?: () => void
  onLastItem?: () => void
  onNextItem?: () => void
  onPreviousItem?: () => void
  onOpenItem?: () => void
  onCompleteItem?: () => void
  onEditItem?: () => void
  onDeleteItem?: () => void
  onShowHelp?: () => void
  onEscape?: () => void
}

const KEY_HANDLERS: Record<string, keyof ShortcutHandlers> = {
  n: 'onNew',
  '/': 'onFocusSearch',
  Home: 'onFirstItem',
  End: 'onLastItem',
  j: 'onNextItem',
  k: 'onPreviousItem',
  Enter: 'onOpenItem',
  c: 'onCompleteItem',
  e: 'onEditItem',
  Delete: 'onDeleteItem',
  '?': 'onShowHelp',
}

export type ShortcutOptions = {
  enabled?: boolean
}

export function useShortcuts(handlers: ShortcutHandlers, { enabled = true }: ShortcutOptions = {}) {
  const handlersRef = useRef(handlers)
  const enabledRef = useRef(enabled)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key === 'Escape') {
        handlersRef.current.onEscape?.()
        return
      }

      if (!enabledRef.current || isTypingTarget(event.target)) {
        return
      }

      if (event.key === 'Enter' && isNativeActivationTarget(event.target)) {
        return
      }

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const handlerName = KEY_HANDLERS[key]
      if (!handlerName) {
        return
      }

      const handler = handlersRef.current[handlerName]
      if (!handler) {
        return
      }

      event.preventDefault()
      handler()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
