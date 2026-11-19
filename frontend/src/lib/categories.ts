import type { ItemListResponse } from '@/api/types'

const CATEGORY_TONE_CLASSES = [
  'border-teal-700/25 bg-teal-700/10 text-teal-900 dark:border-teal-300/30 dark:bg-teal-300/10 dark:text-teal-100',
  'border-amber-700/25 bg-amber-600/10 text-amber-900 dark:border-amber-300/30 dark:bg-amber-300/10 dark:text-amber-100',
  'border-indigo-700/25 bg-indigo-600/10 text-indigo-900 dark:border-indigo-300/30 dark:bg-indigo-300/10 dark:text-indigo-100',
  'border-rose-700/25 bg-rose-600/10 text-rose-900 dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-rose-100',
  'border-lime-700/25 bg-lime-600/10 text-lime-900 dark:border-lime-300/30 dark:bg-lime-300/10 dark:text-lime-100',
  'border-cyan-700/25 bg-cyan-600/10 text-cyan-900 dark:border-cyan-300/30 dark:bg-cyan-300/10 dark:text-cyan-100',
  'border-purple-700/25 bg-purple-600/10 text-purple-900 dark:border-purple-300/30 dark:bg-purple-300/10 dark:text-purple-100',
  'border-orange-700/25 bg-orange-600/10 text-orange-900 dark:border-orange-300/30 dark:bg-orange-300/10 dark:text-orange-100',
] as const

export const CATEGORY_TONE_COUNT = CATEGORY_TONE_CLASSES.length

export function normalizeCategoryLabel(label: string | null | undefined): string | null {
  const trimmed = label?.trim().toLowerCase() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

export function categoryBadgeTone(label: string | null | undefined): number | null {
  const normalized = normalizeCategoryLabel(label)
  if (normalized === null) {
    return null
  }

  let hash = 2166136261
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }

  return ((hash >>> 8) % CATEGORY_TONE_COUNT) as number
}

export function categoryBadgeClass(label: string | null | undefined): string | null {
  const tone = categoryBadgeTone(label)
  return tone === null ? null : CATEGORY_TONE_CLASSES[tone]
}

export function categoriesFromItemList(data: ItemListResponse | undefined): string[] {
  if (!data) {
    return []
  }
  const categories = new Set<string>()
  for (const items of Object.values(data.buckets)) {
    for (const item of items) {
      if (item.category) {
        categories.add(item.category)
      }
    }
  }
  return [...categories].sort((left, right) => left.localeCompare(right))
}
