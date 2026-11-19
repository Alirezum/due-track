import { describe, expect, it } from 'vitest'
import {
  formatTimelineDayHeader,
  formatTimelineDue,
  formatTimelineTick,
  formatVisibleSpan,
} from '@/lib/timeline/format'

describe('timeline timezone formatting', () => {
  it('formats timed due moments in the application timezone', () => {
    expect(formatTimelineDue('2026-11-07T14:00:00Z', 'America/New_York', false, 'en-US')).toBe(
      'Nov 7 · 09:00',
    )
  })

  it('formats date-only deadlines without shifting the local day', () => {
    expect(
      formatTimelineDue('2026-11-07T04:59:59.999999Z', 'America/New_York', true, 'en-US'),
    ).toBe('Nov 6 · All day')
  })

  it('formats day headers for the vertical ledger', () => {
    expect(formatTimelineDayHeader('2026-11-06T14:00:00Z', 'America/New_York', 'en-US')).toBe(
      'Friday, November 6',
    )
  })

  it('formats ticks according to the horizon', () => {
    expect(
      formatTimelineTick('2026-11-06T14:00:00Z', 'America/New_York', '24h', 'en-US'),
    ).toBe('09:00')
    expect(
      formatTimelineTick('2026-11-06T14:00:00Z', 'America/New_York', '7d', 'en-US'),
    ).toBe('Nov 6')
    expect(
      formatTimelineTick('2026-11-06T14:00:00Z', 'America/New_York', '30d', 'en-US'),
    ).toBe('Nov 6')
    expect(
      formatTimelineTick('2026-11-06T14:00:00Z', 'America/New_York', '1y', 'en-US'),
    ).toBe('Nov 2026')
    expect(
      formatTimelineTick('2026-11-06T14:00:00Z', 'America/New_York', 'all', 'en-US'),
    ).toBe('Nov 2026')
  })

  it('formats the visible span in the application timezone', () => {
    expect(
      formatVisibleSpan(
        Date.parse('2026-10-06T04:00:00Z'),
        Date.parse('2026-12-05T17:00:00Z'),
        'America/New_York',
        'en-US',
      ),
    ).toBe('Oct 6 – Dec 5, 2026')
  })

  it('keeps both years when a span crosses a year boundary', () => {
    expect(
      formatVisibleSpan(
        Date.parse('2025-12-20T12:00:00Z'),
        Date.parse('2026-01-05T12:00:00Z'),
        'America/New_York',
        'en-US',
      ),
    ).toBe('Dec 20, 2025 – Jan 5, 2026')
  })

  it('handles the daylight-saving spring-forward boundary in New York', () => {
    expect(
      formatTimelineDue('2027-03-14T06:59:00Z', 'America/New_York', false, 'en-US'),
    ).toBe('Mar 14 · 01:59')
    expect(
      formatTimelineDue('2027-03-14T07:00:00Z', 'America/New_York', false, 'en-US'),
    ).toBe('Mar 14 · 03:00')
  })
})
