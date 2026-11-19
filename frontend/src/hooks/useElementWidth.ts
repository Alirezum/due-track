import { useCallback, useRef, useState } from 'react'

export type ElementWidth<T extends HTMLElement> = {
  ref: (node: T | null) => void
  width: number
}

export function useElementWidth<T extends HTMLElement>(): ElementWidth<T> {
  const [width, setWidth] = useState(0)
  const cleanupRef = useRef<() => void>(() => undefined)

  const ref = useCallback((node: T | null) => {
    cleanupRef.current()
    cleanupRef.current = () => undefined

    if (!node) {
      return
    }

    const measure = () => {
      setWidth(Math.round(node.getBoundingClientRect().width))
    }

    measure()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(node)
      cleanupRef.current = () => observer.disconnect()
      return
    }

    window.addEventListener('resize', measure)
    cleanupRef.current = () => window.removeEventListener('resize', measure)
  }, [])

  return { ref, width }
}
