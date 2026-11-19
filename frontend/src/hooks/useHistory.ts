import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/api/client'
import type { HistoryResponse, UndoResponse } from '@/api/types'
import { itemsQueryKey } from '@/hooks/useItems'

export const historyQueryKey = ['history'] as const

export async function fetchHistory(
  limit = 50,
  offset = 0,
): Promise<HistoryResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })
  return apiRequest<HistoryResponse>(`/api/history?${params.toString()}`)
}

export async function undoCompletion(logId: number): Promise<UndoResponse> {
  return apiRequest<UndoResponse>(`/api/history/${logId}/undo`, { method: 'POST' })
}

export async function deleteHistoryEntry(logId: number): Promise<void> {
  return apiRequest<void>(`/api/history/${logId}`, { method: 'DELETE' })
}

export function useHistory(limit = 50, offset = 0) {
  return useQuery({
    queryKey: [...historyQueryKey, { limit, offset }],
    queryFn: () => fetchHistory(limit, offset),
    placeholderData: keepPreviousData,
  })
}

function useRefreshAfterHistoryChange() {
  const queryClient = useQueryClient()

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: historyQueryKey }),
      queryClient.invalidateQueries({ queryKey: itemsQueryKey }),
    ])
  }
}

export function useUndoCompletion() {
  const refresh = useRefreshAfterHistoryChange()

  return useMutation({
    mutationFn: undoCompletion,
    onSuccess: refresh,
  })
}

export function useDeleteHistoryEntry() {
  const refresh = useRefreshAfterHistoryChange()

  return useMutation({
    mutationFn: deleteHistoryEntry,
    onSuccess: refresh,
  })
}
