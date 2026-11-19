import { describe, expect, it } from 'vitest'
import { makeDenseTimeline, makeThousandEntryTimeline } from './timelineFixtures'
import {
  chooseTickInterval,
  clampRatio,
  clusterMarkers,
  positionFor,
  summarizeEdges,
  buildTicks,
} from '@/lib/timeline/geometry'
import {
  HORIZONS,
  resolveTimelineWindow,
  type TimeHorizon,
} from '@/lib/timeline/horizons'
import { TIMELINE_TIMEZONE } from './timelineFixtures'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const DAY = 24 * 3_600_000

function windowFor(horizon: TimeHorizon) {
  return resolveTimelineWindow({
    horizon,
    nowMs: NOW,
    entries: makeDenseTimeline().entries,
  })
}

describe('positionFor', () => {
  it('returns a clamped ratio for a due instant inside the window', () => {
    expect(positionFor(50, 0, 100)).toBe(0.5)
    expect(positionFor(0, 0, 100)).toBe(0)
    expect(positionFor(100, 0, 100)).toBe(1)
    expect(positionFor(-50, 0, 100)).toBe(0)
    expect(positionFor(150, 0, 100)).toBe(1)
  })

  it('handles degenerate and non-finite input', () => {
    expect(clampRatio(Number.NaN)).toBe(0)
    expect(clampRatio(2)).toBe(1)
    expect(positionFor(10, 100, 100)).toBe(0)
    expect(positionFor(Number.NaN, 0, 100)).toBe(0)
  })
})

describe('chooseTickInterval and buildTicks', () => {
  it.each(HORIZONS.map((horizon) => horizon.value))(
    'produces 3–8 labels across widths for %s',
    (horizon) => {
      const window = windowFor(horizon)
      for (const width of [320, 768, 1440]) {
        const interval = chooseTickInterval(window.startMs, window.endMs, width, horizon)
        const ticks = buildTicks(window.startMs, window.endMs, interval, TIMELINE_TIMEZONE)
        expect(ticks.length).toBeGreaterThanOrEqual(3)
        expect(ticks.length).toBeLessThanOrEqual(8)
        for (const tick of ticks) {
          expect(tick).toBeGreaterThanOrEqual(window.startMs)
          expect(tick).toBeLessThanOrEqual(window.endMs)
        }
      }
    },
  )

  it('uses finer units for wider 24-hour views', () => {
    const window = windowFor('24h')
    const narrow = chooseTickInterval(window.startMs, window.endMs, 320, '24h')
    const wide = chooseTickInterval(window.startMs, window.endMs, 1440, '24h')
    expect(narrow.unit).toBe('hour')
    expect(wide.unit).toBe('hour')
    expect(wide.approxMs).toBeLessThanOrEqual(narrow.approxMs)
  })
})

describe('clusterMarkers', () => {
  const window = { startMs: NOW, endMs: NOW + 1_000_000 }

  it('groups 20 same-instant entries into one cluster and preserves order', () => {
    const entries = makeDenseTimeline().entries.filter(
      (entry) => entry.item.id >= 100 && entry.item.id < 120,
    )
    const groups = clusterMarkers(entries, 1200, window)
    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('cluster')
    expect(groups[0].entries.map((entry) => entry.item.id)).toEqual(
      entries.map((entry) => entry.item.id),
    )
  })

  it('uses marker width plus eight pixels as the cluster threshold', () => {
    const close = makeDenseTimeline().entries.slice(0, 2).map((entry, index) => ({
      ...entry,
      item: { ...entry.item, id: index + 1 },
    }))
    close[0].item.due_at_utc = new Date(NOW).toISOString()
    close[1].item.due_at_utc = new Date(NOW + 100).toISOString()

    const thresholdWindow = { startMs: NOW, endMs: NOW + 1000 }
    expect(clusterMarkers(close, 1000, thresholdWindow).length).toBe(1)
    expect(clusterMarkers([close[0]], 1000, thresholdWindow)[0].kind).toBe('marker')

    close[1].item.due_at_utc = new Date(NOW + 200).toISOString()
    expect(clusterMarkers(close, 1000, thresholdWindow).length).toBe(2)
    expect(
      clusterMarkers(close, 1000, thresholdWindow).every((group) => group.kind === 'marker'),
    ).toBe(true)
  })

  it('completes 1,000-item geometry without pathological behaviour', () => {
    const entries = makeThousandEntryTimeline().entries
    const allTime = resolveTimelineWindow({ horizon: 'all', nowMs: NOW, entries })
    const started = performance.now()
    const groups = clusterMarkers(entries, 1200, allTime)
    const elapsed = performance.now() - started

    expect(groups.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(250)
    const dueOrder = groups.flatMap((group) => group.entries.map((entry) => entry.item.id))
    expect(dueOrder).toHaveLength(1000)
  })
})

describe('summarizeEdges', () => {
  it('counts and bounds hidden deadlines on both sides', () => {
    const entries = makeDenseTimeline().entries
    const window = { startMs: NOW - 2 * DAY, endMs: NOW + 2 * DAY }
    const edges = summarizeEdges(entries, window)

    const hiddenLeft = entries.filter(
      (entry) => Date.parse(entry.item.due_at_utc) < window.startMs,
    )
    const hiddenRight = entries.filter(
      (entry) => Date.parse(entry.item.due_at_utc) > window.endMs,
    )

    expect(edges.left?.count).toBe(hiddenLeft.length)
    expect(edges.right?.count).toBe(hiddenRight.length)
    expect(edges.left?.boundary).toBe(
      Math.min(...hiddenLeft.map((entry) => Date.parse(entry.item.due_at_utc))),
    )
    expect(edges.right?.boundary).toBe(
      Math.max(...hiddenRight.map((entry) => Date.parse(entry.item.due_at_utc))),
    )
  })

  it('returns null for edges with no hidden deadlines', () => {
    const entries = makeDenseTimeline().entries
    const start = Math.min(...entries.map((entry) => Date.parse(entry.item.due_at_utc)))
    const end = Math.max(...entries.map((entry) => Date.parse(entry.item.due_at_utc)))
    expect(summarizeEdges(entries, { startMs: start, endMs: end })).toEqual({
      left: null,
      right: null,
    })
  })
})
