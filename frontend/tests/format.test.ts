import { describe, expect, it } from 'vitest'
import { formatAmount, formatDue, formatLocalDate, formatLocalDateTime } from '@/lib/format'

describe('formatLocalDate', () => {
  it('formats a local calendar date without shifting it', () => {
    expect(formatLocalDate('2026-11-05', 'en-US')).toBe('Nov 5, 2026')
  })
})

describe('formatLocalDateTime', () => {
  it('formats the API local wall time without applying a browser timezone', () => {
    expect(formatLocalDateTime('2026-11-05', '09:30', 'en-US')).toMatch(/^Nov 5, 2026, 9:30\sAM$/)
  })
})

describe('formatDue', () => {
  it('omits the time for date-only items', () => {
    expect(
      formatDue(
        {
          due_local_date: '2026-11-05',
          due_local_time: null,
          is_date_only: true,
        },
        'en-US',
      ),
    ).toBe('Nov 5, 2026')
  })

  it('includes the time for timed items', () => {
    expect(
      formatDue(
        {
          due_local_date: '2026-11-05',
          due_local_time: '09:30',
          is_date_only: false,
        },
        'en-US',
      ),
    ).toMatch(/^Nov 5, 2026, 9:30\sAM$/)
  })
})

describe('formatAmount', () => {
  it('formats integer cents as currency', () => {
    expect(formatAmount(120000, 'USD', 'en-US')).toBe('$1,200.00')
  })

  it('keeps a zero amount visible', () => {
    expect(formatAmount(0, 'USD', 'en-US')).toBe('$0.00')
  })

  it('returns null when no amount exists', () => {
    expect(formatAmount(null, 'USD', 'en-US')).toBeNull()
  })
})
