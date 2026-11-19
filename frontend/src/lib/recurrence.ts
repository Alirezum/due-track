import type { DueItem, RecurrenceFrequency } from '@/api/types'

const FREQUENCY_LABEL: Partial<Record<RecurrenceFrequency, string>> = {
  daily: 'Repeats daily',
  weekly: 'Repeats weekly',
  monthly: 'Repeats monthly',
  yearly: 'Repeats yearly',
}

const CUSTOM_FREQUENCY: Partial<Record<RecurrenceFrequency, [string, string]>> = {
  custom_days: ['day', 'days'],
  custom_weeks: ['week', 'weeks'],
  custom_months: ['month', 'months'],
  custom_years: ['year', 'years'],
}

export function recurrenceSummary(item: DueItem): string | null {
  if (item.recurrence_freq === 'none') {
    return null
  }

  const custom = CUSTOM_FREQUENCY[item.recurrence_freq]
  if (custom) {
    const [singular, plural] = custom
    return item.recurrence_interval === 1
      ? `Repeats every ${singular}`
      : `Repeats every ${item.recurrence_interval} ${plural}`
  }

  return FREQUENCY_LABEL[item.recurrence_freq] ?? 'Repeats'
}

export function recurrenceAnchorSummary(item: DueItem): string | null {
  if (item.recurrence_freq === 'none') {
    return null
  }
  if (item.recurrence_anchor_day !== null) {
    return `Day ${item.recurrence_anchor_day} of the month`
  }
  return item.recurrence_anchor_mode === 'completion'
    ? 'Counts from completion'
    : 'Scheduled from the due date'
}
