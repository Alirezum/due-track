import type { DueItem } from '@/api/types'

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
}

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTIONS,
  hour: 'numeric',
  minute: '2-digit',
}

type DueDisplayFields = Pick<DueItem, 'due_local_date' | 'due_local_time' | 'is_date_only'>

function parseLocalDate(localDate: string): Date {
  return new Date(`${localDate}T00:00:00.000Z`)
}

function parseLocalDateTime(localDate: string, localTime: string): Date {
  return new Date(`${localDate}T${localTime}Z`)
}

export function formatLocalDate(localDate: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, DATE_OPTIONS).format(parseLocalDate(localDate))
}

export function formatLocalDateTime(
  localDate: string,
  localTime: string,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, DATE_TIME_OPTIONS).format(
    parseLocalDateTime(localDate, localTime),
  )
}

export function formatDue(item: DueDisplayFields, locale?: string): string {
  if (item.is_date_only || item.due_local_time === null) {
    return formatLocalDate(item.due_local_date, locale)
  }
  return formatLocalDateTime(item.due_local_date, item.due_local_time, locale)
}

export function formatAmount(
  amountCents: number | null,
  currencyCode: string,
  locale?: string,
): string | null {
  if (amountCents === null) {
    return null
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  }).format(amountCents / 100)
}
