import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/api/client'
import type { DueItem, ItemCreate, ItemListResponse, ItemScope, ItemUpdate } from '@/api/types'
import { EMPTY_FILTERS, filtersToQueryString, type ItemFilters } from '@/lib/filters'
import { invalidateDeadlineQueries, itemsQueryKey } from '@/lib/queryKeys'

export { itemsQueryKey }

const JSON_HEADERS = { 'content-type': 'application/json' }

export type ItemsQueryOptions = {
  refetchInterval?: number | false
  refetchOnWindowFocus?: boolean
}

export async function fetchItems(
  filters: ItemFilters = EMPTY_FILTERS,
  scope: ItemScope = 'all',
): Promise<ItemListResponse> {
  const scopeParam = scope === 'upcoming' ? scope : undefined
  return apiRequest<ItemListResponse>(
    `/api/items${filtersToQueryString(filters, scopeParam)}`,
  )
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

export function useItems(
  filters: ItemFilters = EMPTY_FILTERS,
  scope: ItemScope = 'all',
  options: ItemsQueryOptions = {},
) {
  return useQuery({
    queryKey: [...itemsQueryKey, filters, scope],
    queryFn: () => fetchItems(filters, scope),
    placeholderData: keepPreviousData,
    ...options,
  })
}

export function useCreateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createItem,
    onSuccess: async () => {
      await invalidateDeadlineQueries(queryClient)
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & ItemUpdate) => updateItem(id, payload),
    onSuccess: async () => {
      await invalidateDeadlineQueries(queryClient)
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteItem,
    onSuccess: async () => {
      await invalidateDeadlineQueries(queryClient)
    },
  })
}
