import type { QueryClient } from '@tanstack/react-query'

export const itemsQueryKey = ['items'] as const
export const historyQueryKey = ['history'] as const
export const timelineQueryKey = ['timeline'] as const

export function invalidateDeadlineQueries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: itemsQueryKey }),
    queryClient.invalidateQueries({ queryKey: timelineQueryKey }),
  ])
}

export function invalidateHistoryAndDeadlines(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: historyQueryKey }),
    invalidateDeadlineQueries(queryClient),
  ])
}
