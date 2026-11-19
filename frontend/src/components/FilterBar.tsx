import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { Priority } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  type ItemFilters,
  type RecurrenceFilter,
} from '@/lib/filters'

const SEARCH_DEBOUNCE_MS = 300

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]

const RECURRENCE_OPTIONS: Array<{ value: RecurrenceFilter; label: string }> = [
  { value: 'all', label: 'Any' },
  { value: 'true', label: 'Recurring' },
  { value: 'false', label: 'One-time' },
]

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

export type FilterBarProps = {
  filters: ItemFilters
  categories: string[]
  onChange: Dispatch<SetStateAction<ItemFilters>>
}

export function FilterBar({ filters, categories, onChange }: FilterBarProps) {
  const [search, setSearch] = useState(filters.q)
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)

  useEffect(() => {
    onChange((current) =>
      current.q === debouncedSearch ? current : { ...current, q: debouncedSearch },
    )
  }, [debouncedSearch, onChange])

  function clearAll() {
    setSearch('')
    onChange(EMPTY_FILTERS)
  }

  return (
    <section aria-label="Filter deadlines">
      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-[11rem_9rem_9rem_minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="filter-category" className="text-xs text-muted-foreground">
            Category
          </Label>
          <Input
            id="filter-category"
            list="filter-category-options"
            value={filters.category}
            onChange={(event) =>
              onChange((current) => ({ ...current, category: event.target.value }))
            }
            placeholder="Any label"
            maxLength={50}
            autoComplete="off"
          />
          <datalist id="filter-category-options">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="filter-priority" className="text-xs text-muted-foreground">
            Priority
          </Label>
          <select
            id="filter-priority"
            className={SELECT_CLASS}
            value={filters.priority}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                priority: event.target.value as ItemFilters['priority'],
              }))
            }
          >
            <option value="">Any</option>
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="filter-recurring" className="text-xs text-muted-foreground">
            Repeats
          </Label>
          <select
            id="filter-recurring"
            className={SELECT_CLASS}
            value={filters.recurring}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                recurring: event.target.value as RecurrenceFilter,
              }))
            }
          >
            {RECURRENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="filter-search" className="text-xs text-muted-foreground">
            Search
          </Label>
          <Input
            id="filter-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title or notes"
            maxLength={200}
            autoComplete="off"
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start text-muted-foreground"
          onClick={clearAll}
          disabled={!hasActiveFilters(filters) && !search.trim()}
        >
          Clear filters
        </Button>
      </div>
    </section>
  )
}
