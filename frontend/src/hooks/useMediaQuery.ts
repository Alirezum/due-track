import { useEffect, useState } from 'react'

function readMatch(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(query).matches
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMatch(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQuery = window.matchMedia(query)
    const update = () => setMatches(mediaQuery.matches)
    update()
    mediaQuery.addEventListener?.('change', update)
    mediaQuery.addListener?.(update)

    return () => {
      mediaQuery.removeEventListener?.('change', update)
      mediaQuery.removeListener?.(update)
    }
  }, [query])

  return matches
}
