import type { Priority } from '@/api/types'

export type RecurrenceFilter = 'all' | 'true' | 'false'

export type ItemFilters = {
  category: string
  priority: Priority | ''
  recurring: RecurrenceFilter
  q: string
}

export const EMPTY_FILTERS: ItemFilters = {
  category: '',
  priority: '',
  recurring: 'all',
  q: '',
}

export function hasActiveFilters(filters: ItemFilters): boolean {
  return Boolean(
    filters.category.trim() ||
      filters.priority ||
      filters.recurring !== 'all' ||
      filters.q.trim(),
  )
}

export function filtersToQueryString(filters: ItemFilters): string {
  const params = new URLSearchParams()
  const category = filters.category.trim()
  const search = filters.q.trim()

  if (category) {
    params.set('category', category)
  }
  if (filters.priority) {
    params.set('priority', filters.priority)
  }
  if (filters.recurring !== 'all') {
    params.set('recurring', filters.recurring)
  }
  if (search) {
    params.set('q', search)
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}
