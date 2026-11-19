import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/api/client'
import type { CompleteResponse } from '@/api/types'
import { invalidateHistoryAndDeadlines } from '@/lib/queryKeys'

export async function completeItem(id: number): Promise<CompleteResponse> {
  return apiRequest<CompleteResponse>(`/api/items/${id}/complete`, { method: 'POST' })
}

export function useCompleteItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: completeItem,
    onSuccess: async () => {
      await invalidateHistoryAndDeadlines(queryClient)
    },
  })
}
