import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/api/client'
import type { DueItem, ItemCreate, ItemListResponse, ItemUpdate } from '@/api/types'

export const itemsQueryKey = ['items'] as const

const JSON_HEADERS = { 'content-type': 'application/json' }

export async function fetchItems(): Promise<ItemListResponse> {
  return apiRequest<ItemListResponse>('/api/items')
}

export async function createItem(payload: ItemCreate): Promise<DueItem> {
  return apiRequest<DueItem>('/api/items', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
}

export async function updateItem(id: number, payload: ItemUpdate): Promise<DueItem> {
  return apiRequest<DueItem>(`/api/items/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
}

export async function deleteItem(id: number): Promise<void> {
  return apiRequest<void>(`/api/items/${id}`, { method: 'DELETE' })
}

export function useItems() {
  return useQuery({
    queryKey: itemsQueryKey,
    queryFn: fetchItems,
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: itemsQueryKey })
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & ItemUpdate) => updateItem(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: itemsQueryKey })
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: itemsQueryKey })
    },
  })
}
