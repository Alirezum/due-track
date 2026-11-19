import { describe, expect, it } from 'vitest'
import { formatCountdown, formatDuration } from '@/lib/timeline/countdown'

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

describe('formatDuration', () => {
  it.each([
    [365 * DAY, '1y'],
    [30 * DAY, '1mo'],
    [7 * DAY, '1w'],
    [60, '1m'],
    [59, '<1m'],
    [0, '<1m'],
    [YEAR + 30 * DAY + 3 * DAY, '1y 1mo'],
    [30 * DAY + 7 * DAY + 2 * DAY, '1mo 1w'],
    [7 * DAY + 2 * DAY + 4 * HOUR, '1w 2d'],
    [2 * DAY + 4 * HOUR + 30, '2d 4h'],
    [3 * HOUR + 20 * MINUTE, '3h 20m'],
    [HOUR + 30 * MINUTE, '1h 30m'],
    [2 * MINUTE, '2m'],
    [YEAR + 2 * HOUR, '1y 2h'],
  ])('formats %d seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })

  it('uses the same stable abbreviations for singular and plural values', () => {
    expect(formatDuration(DAY)).toBe('1d')
    expect(formatDuration(2 * DAY)).toBe('2d')
    expect(formatDuration(WEEK)).toBe('1w')
    expect(formatDuration(2 * WEEK)).toBe('2w')
    expect(formatDuration(MONTH)).toBe('1mo')
    expect(formatDuration(2 * MONTH)).toBe('2mo')
    expect(formatDuration(YEAR)).toBe('1y')
    expect(formatDuration(2 * YEAR)).toBe('2y')
  })

  it('floors fractional and negative inputs without overstating time', () => {
    expect(formatDuration(59.9)).toBe('<1m')
    expect(formatDuration(90.9)).toBe('1m')
    expect(formatDuration(-90.9)).toBe('1m')
    expect(formatDuration(2 * DAY + 4 * HOUR - 0.1)).toBe('2d 3h')
  })
})

describe('formatCountdown', () => {
  it('uses the server urgency for the status word', () => {
    expect(formatCountdown(-(2 * DAY + 4 * HOUR), 'overdue')).toBe('Overdue · 2d 4h')
    expect(formatCountdown(0, 'due_now')).toBe('Due now')
    expect(formatCountdown(3 * HOUR + 20 * MINUTE, 'within_24h')).toBe('in 3h 20m')
    expect(formatCountdown(2 * DAY + 4 * HOUR, 'within_7d')).toBe('in 2d 4h')
    expect(formatCountdown(20 * DAY, 'later')).toBe('in 2w 6d')
  })

  it('never re-derives overdue from negative seconds', () => {
    expect(formatCountdown(-30, 'later')).toBe('in <1m')
    expect(formatCountdown(30, 'overdue')).toBe('Overdue · <1m')
  })

  it('shows under one minute in both directions', () => {
    expect(formatCountdown(59, 'within_24h')).toBe('in <1m')
    expect(formatCountdown(-59, 'overdue')).toBe('Overdue · <1m')
  })
})
