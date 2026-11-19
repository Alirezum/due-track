import type { Urgency } from '@/api/types'

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

const UNITS: Array<{ seconds: number; label: string }> = [
  { seconds: YEAR, label: 'y' },
  { seconds: MONTH, label: 'mo' },
  { seconds: WEEK, label: 'w' },
  { seconds: DAY, label: 'd' },
  { seconds: HOUR, label: 'h' },
  { seconds: MINUTE, label: 'm' },
]

export function formatDuration(seconds: number): string {
  let remaining = Math.floor(Math.abs(seconds))
  if (remaining < MINUTE) {
    return '<1m'
  }

  const parts: string[] = []
  for (const unit of UNITS) {
    const value = Math.floor(remaining / unit.seconds)
    if (value > 0) {
      parts.push(`${value}${unit.label}`)
      remaining -= value * unit.seconds
      if (parts.length === 2) {
        break
      }
    }
  }

  return parts.join(' ')
}

export function formatCountdown(secondsUntilDue: number, urgency: Urgency): string {
  if (urgency === 'due_now') {
    return 'Due now'
  }
  if (urgency === 'overdue') {
    return `Overdue · ${formatDuration(secondsUntilDue)}`
  }
  return `in ${formatDuration(secondsUntilDue)}`
}
