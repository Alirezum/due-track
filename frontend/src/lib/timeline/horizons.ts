import type { TimelineEntry } from '@/api/types'

export type TimeHorizon = '24h' | '7d' | '30d' | '90d' | '1y' | 'all'

export const HORIZONS: ReadonlyArray<{ value: TimeHorizon; label: string }> = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
  { value: 'all', label: 'All' },
]

export const DEFAULT_HORIZON: TimeHorizon = '30d'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const FIXED_SPANS: Partial<Record<TimeHorizon, number>> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '90d': 90 * DAY_MS,
  '1y': 365 * DAY_MS,
}

export type RevealedEdges = {
  left: number | null
  right: number | null
}

export type TimelineWindow = {
  startMs: number
  endMs: number
  durationMs: number
  horizon: TimeHorizon
  revealedEdges: RevealedEdges
}

export type WindowEntry = Pick<TimelineEntry, 'item'>

export type ResolveWindowOptions = {
  horizon: TimeHorizon
  nowMs: number
  entries: WindowEntry[]
  selectedId?: number | null
  revealedEdges?: RevealedEdges
  includeOverdue?: boolean
}

export function resetReveals(): RevealedEdges {
  return { left: null, right: null }
}

function dueTimes(entries: WindowEntry[]): Array<{ id: number; dueMs: number }> {
  return entries
    .map((entry) => ({ id: entry.item.id, dueMs: Date.parse(entry.item.due_at_utc) }))
    .filter((entry) => Number.isFinite(entry.dueMs))
}

function baseWindow(
  horizon: TimeHorizon,
  nowMs: number,
  dues: Array<{ id: number; dueMs: number }>,
  includeOverdue: boolean,
): { startMs: number; endMs: number } {
  const fixedSpan = FIXED_SPANS[horizon]
  if (fixedSpan !== undefined) {
    return includeOverdue
      ? { startMs: nowMs - fixedSpan, endMs: nowMs + fixedSpan }
      : { startMs: nowMs, endMs: nowMs + fixedSpan }
  }

  const overdue = dues.filter((entry) => entry.dueMs < nowMs)
  const future = dues.filter((entry) => entry.dueMs > nowMs)

  if (horizon === 'all') {
    const startMs =
      includeOverdue && overdue.length
        ? Math.min(...overdue.map((entry) => entry.dueMs))
        : nowMs
    const endMs = future.length
      ? Math.max(...future.map((entry) => entry.dueMs))
      : nowMs
    return { startMs, endMs }
  }

  // 30d default: every overdue deadline plus the next 30 days. When the
  // forward range holds no deadline, extend to the nearest upcoming one.
  let startMs = nowMs
  if (includeOverdue) {
    startMs = overdue.length
      ? Math.min(nowMs - 30 * DAY_MS, ...overdue.map((entry) => entry.dueMs))
      : nowMs - 30 * DAY_MS
  }
  const inside = future.filter((entry) => entry.dueMs <= nowMs + 30 * DAY_MS)
  const endMs =
    inside.length > 0
      ? nowMs + 30 * DAY_MS
      : future.length > 0
        ? Math.min(...future.map((entry) => entry.dueMs))
        : nowMs + 30 * DAY_MS

  return { startMs, endMs }
}

export function resolveTimelineWindow({
  horizon,
  nowMs,
  entries,
  selectedId = null,
  revealedEdges = resetReveals(),
  includeOverdue = true,
}: ResolveWindowOptions): TimelineWindow {
  const dues = dueTimes(entries)
  let { startMs, endMs } = baseWindow(horizon, nowMs, dues, includeOverdue)

  if (revealedEdges.left !== null) {
    startMs = Math.min(startMs, revealedEdges.left)
  }
  if (revealedEdges.right !== null) {
    endMs = Math.max(endMs, revealedEdges.right)
  }

  if (selectedId !== null) {
    const selected = dues.find((entry) => entry.id === selectedId)
    if (selected) {
      if (selected.dueMs < startMs) {
        startMs = selected.dueMs
      }
      if (selected.dueMs > endMs) {
        endMs = selected.dueMs
      }
    }
  }

  if (!(endMs > startMs)) {
    startMs = nowMs
    endMs = nowMs + 1
  }

  return {
    startMs,
    endMs,
    durationMs: endMs - startMs,
    horizon,
    revealedEdges,
  }
}

export function revealEdge(
  window: TimelineWindow,
  edge: 'left' | 'right',
  boundaryMs: number,
): TimelineWindow {
  const startMs = edge === 'left' ? Math.min(window.startMs, boundaryMs) : window.startMs
  const endMs = edge === 'right' ? Math.max(window.endMs, boundaryMs) : window.endMs
  const revealedEdges: RevealedEdges = {
    left:
      edge === 'left'
        ? Math.min(window.revealedEdges.left ?? boundaryMs, boundaryMs)
        : window.revealedEdges.left,
    right:
      edge === 'right'
        ? Math.max(window.revealedEdges.right ?? boundaryMs, boundaryMs)
        : window.revealedEdges.right,
  }

  return {
    ...window,
    startMs,
    endMs,
    durationMs: endMs - startMs,
    revealedEdges,
  }
}
