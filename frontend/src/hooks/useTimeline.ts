import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '@/api/client'
import type { TimelineResponse } from '@/api/types'
import { EMPTY_FILTERS, filtersToQueryString, type ItemFilters } from '@/lib/filters'
import { timelineQueryKey } from '@/lib/queryKeys'

export const TIMELINE_TICK_MS = 15_000
export const TIMELINE_MAX_REFETCH_MS = 60_000
const REFETCH_EPSILON_MS = 1000

export async function fetchTimeline(
  filters: ItemFilters = EMPTY_FILTERS,
): Promise<TimelineResponse> {
  return apiRequest<TimelineResponse>(`/api/timeline${filtersToQueryString(filters)}`)
}

export type TimelineClockAnchor = {
  serverTimeMs: number
  receivedAtMs: number
}

export function createClockAnchor(
  referenceTimeUtc: string,
  receivedAtMs: number,
): TimelineClockAnchor {
  return {
    serverTimeMs: Date.parse(referenceTimeUtc),
    receivedAtMs,
  }
}

export function clockNow(anchor: TimelineClockAnchor, monotonicNowMs: number): number {
  return anchor.serverTimeMs + (monotonicNowMs - anchor.receivedAtMs)
}

export function computeRefetchInterval(data: TimelineResponse | undefined): number {
  if (!data) {
    return TIMELINE_MAX_REFETCH_MS
  }
  const upcoming = data.entries
    .map((entry) => entry.seconds_until_due)
    .filter((seconds) => seconds > 0)

  if (upcoming.length === 0) {
    return TIMELINE_MAX_REFETCH_MS
  }

  return Math.min(
    TIMELINE_MAX_REFETCH_MS,
    Math.max(REFETCH_EPSILON_MS, Math.min(...upcoming) * 1000 + REFETCH_EPSILON_MS),
  )
}

export function useTimeline(filters: ItemFilters = EMPTY_FILTERS) {
  const query = useQuery({
    queryKey: [...timelineQueryKey, filters],
    queryFn: () => fetchTimeline(filters),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (current) => computeRefetchInterval(current.state.data),
  })

  // Re-anchor on every successful response, including background refetches.
  const anchor = useMemo<TimelineClockAnchor | null>(() => {
    if (!query.data) {
      return null
    }
    return createClockAnchor(query.data.reference_time_utc, query.dataUpdatedAt)
  }, [query.data, query.dataUpdatedAt])

  const [tickedAtMs, setTickedAtMs] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setTickedAtMs(Date.now()), TIMELINE_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const parsedReference = Date.parse(query.data?.reference_time_utc ?? '')
  const referenceTimeMs = anchor?.serverTimeMs ?? (Number.isFinite(parsedReference) ? parsedReference : 0)
  const liveNowMs = anchor
    ? clockNow(anchor, Math.max(tickedAtMs, anchor.receivedAtMs))
    : referenceTimeMs

  return {
    ...query,
    referenceTimeMs,
    liveNowMs,
    anchor,
  }
}

export { timelineQueryKey }
