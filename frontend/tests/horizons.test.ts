import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HORIZON,
  HORIZONS,
  resetReveals,
  resolveTimelineWindow,
  revealEdge,
  type TimelineWindow,
} from '@/lib/timeline/horizons'
import { makeTimelineEntry } from './timelineFixtures'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function entriesAt(offsets: number[]) {
  return offsets.map((offset, index) =>
    makeTimelineEntry({
      id: index + 1,
      title: `Entry ${index + 1}`,
      dueAtUtc: new Date(NOW + offset).toISOString(),
    }),
  )
}

function resolve(
  horizon: Parameters<typeof resolveTimelineWindow>[0]['horizon'],
  offsets: number[],
  extra: Partial<Parameters<typeof resolveTimelineWindow>[0]> = {},
) {
  return resolveTimelineWindow({
    horizon,
    nowMs: NOW,
    entries: entriesAt(offsets),
    ...extra,
  })
}

describe('resolveTimelineWindow', () => {
  it('uses symmetric spans for fixed horizons', () => {
    expect(resolve('24h', [])).toMatchObject({ startMs: NOW - DAY, endMs: NOW + DAY })
    expect(resolve('7d', [])).toMatchObject({ startMs: NOW - 7 * DAY, endMs: NOW + 7 * DAY })
    expect(resolve('90d', [])).toMatchObject({ startMs: NOW - 90 * DAY, endMs: NOW + 90 * DAY })
    expect(resolve('1y', [])).toMatchObject({ startMs: NOW - 365 * DAY, endMs: NOW + 365 * DAY })
  })

  it('defaults to 30d and covers every overdue deadline', () => {
    expect(DEFAULT_HORIZON).toBe('30d')
    const window = resolve('30d', [-60 * DAY, 10 * DAY])
    expect(window.startMs).toBe(NOW - 60 * DAY)
    expect(window.endMs).toBe(NOW + 30 * DAY)
  })

  it('extends the forward edge to the nearest future deadline when 30d is empty', () => {
    const window = resolve('30d', [-DAY, 60 * DAY])
    expect(window.startMs).toBe(NOW - 30 * DAY)
    expect(window.endMs).toBe(NOW + 60 * DAY)
  })

  it('spans the earliest overdue through the latest deadline for all time', () => {
    const window = resolve('all', [-90 * DAY, 400 * DAY])
    expect(window.startMs).toBe(NOW - 90 * DAY)
    expect(window.endMs).toBe(NOW + 400 * DAY)
  })

  it('keeps now inside every window with a positive duration', () => {
    for (const horizon of HORIZONS.map((option) => option.value)) {
      for (const offsets of [[], [0], [-100 * DAY], [100 * DAY], [-5 * DAY, 5 * DAY]]) {
        const window = resolve(horizon, offsets)
        expect(window.durationMs).toBeGreaterThan(0)
        expect(window.startMs).toBeLessThanOrEqual(NOW)
        expect(window.endMs).toBeGreaterThanOrEqual(NOW)
      }
    }
  })

  it('uses a one-millisecond window for an empty all-time span', () => {
    const window = resolve('all', [], {})
    expect(window.startMs).toBe(NOW)
    expect(window.endMs).toBe(NOW + 1)
  })

  it('includes a selected entry outside the horizon by extending the nearest edge', () => {
    const selected = makeTimelineEntry({
      id: 99,
      title: 'Selected',
      dueAtUtc: new Date(NOW + 10 * DAY).toISOString(),
    })
    const window = resolveTimelineWindow({
      horizon: '24h',
      nowMs: NOW,
      entries: [selected],
      selectedId: 99,
    })
    expect(window.startMs).toBe(NOW - DAY)
    expect(window.endMs).toBe(NOW + 10 * DAY)
  })
})

describe('edge reveals', () => {
  it('extends monotonically and never shrinks the window', () => {
    const initial = resolve('24h', [])
    const right = revealEdge(initial, 'right', NOW + 3 * DAY)
    expect(right.endMs).toBe(NOW + 3 * DAY)

    const smaller = revealEdge(right, 'right', NOW + DAY)
    expect(smaller.endMs).toBe(NOW + 3 * DAY)

    const left = revealEdge(smaller, 'left', NOW - 5 * DAY)
    expect(left.startMs).toBe(NOW - 5 * DAY)

    const smallerLeft = revealEdge(left, 'left', NOW - DAY)
    expect(smallerLeft.startMs).toBe(NOW - 5 * DAY)
  })

  it('restores the horizon window when reveals are reset', () => {
    const base = resolve('24h', [])
    const revealed = revealEdge(base, 'right', NOW + 30 * DAY)
    const reset = resolveTimelineWindow({
      horizon: '24h',
      nowMs: NOW,
      entries: [],
      revealedEdges: resetReveals(),
    })

    expect(revealed.endMs).toBeGreaterThan(base.endMs)
    expect(reset.startMs).toBe(base.startMs)
    expect(reset.endMs).toBe(base.endMs)
  })

  it('applies persisted reveals when resolving a fresh window', () => {
    const revealed = revealEdge(resolve('24h', []), 'left', NOW - 10 * DAY)
    const resolved = resolveTimelineWindow({
      horizon: '24h',
      nowMs: NOW,
      entries: [],
      revealedEdges: revealed.revealedEdges,
    })

    expect(resolved.startMs).toBe(NOW - 10 * DAY)
  })
})

// Keep the imported type exercised without relying on structural inference.
const example: TimelineWindow | null = null
void example
