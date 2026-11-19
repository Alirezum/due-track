import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DueItem,
  ItemListResponse,
  TimelineEntry,
  TimelineResponse,
  Urgency,
} from '@/api/types'
import { DashboardPage } from '@/pages/DashboardPage'
import { TimelinePage } from '@/pages/TimelinePage'

const REFERENCE = '2026-11-05T12:00:00Z'
const REFERENCE_MS = Date.parse(REFERENCE)
const TIMEZONE = 'America/New_York'
const CURRENCY = 'USD'
const TOTAL = 1_000
// The dashboard renders every upcoming card, so keep that default set small enough for
// jsdom while still exercising a 1,000-record ledger with a large overdue population.
const OVERDUE = 900
const HOUR_MS = 3_600_000

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function dueAt(offsetHours: number): string {
  return new Date(REFERENCE_MS + offsetHours * HOUR_MS).toISOString()
}

function makeItem(index: number, offsetHours: number): DueItem {
  const overdue = offsetHours < 0
  const iso = dueAt(offsetHours)
  return {
    id: index + 1,
    title: overdue
      ? `Overdue deadline ${String(index + 1).padStart(4, '0')}`
      : `Upcoming deadline ${String(index + 1 - OVERDUE).padStart(4, '0')}`,
    notes: '',
    due_at_utc: iso,
    is_date_only: false,
    due_local_date: iso.slice(0, 10),
    due_local_time: '07:00',
    category: 'Benchmark',
    priority: 'medium',
    amount_cents: index,
    recurrence_freq: 'none',
    recurrence_interval: 1,
    recurrence_anchor_mode: 'schedule',
    recurrence_anchor_day: null,
    recurrence_end_date: null,
    recurrence_remaining_count: null,
    status: 'active',
    is_recurring: false,
    created_at_utc: REFERENCE,
    updated_at_utc: REFERENCE,
  }
}

function urgencyFor(offsetHours: number): Urgency {
  if (offsetHours < 0) return 'overdue'
  if (offsetHours === 0) return 'due_now'
  if (offsetHours <= 24) return 'within_24h'
  if (offsetHours <= 24 * 7) return 'within_7d'
  return 'later'
}

const ITEMS = Array.from({ length: TOTAL }, (_, index) =>
  makeItem(index, index < OVERDUE ? -(index + 1) : index + 1 - OVERDUE),
)
const OVERDUE_ITEMS = ITEMS.slice(0, OVERDUE)
const FUTURE_ITEMS = ITEMS.slice(OVERDUE)
const UPCOMING_ITEMS = FUTURE_ITEMS.filter((item) => {
  const hours = (Date.parse(item.due_at_utc) - REFERENCE_MS) / HOUR_MS
  return hours <= 24 * 7
})
const LATER_ITEMS = FUTURE_ITEMS.filter((item) => {
  const hours = (Date.parse(item.due_at_utc) - REFERENCE_MS) / HOUR_MS
  return hours > 24 * 7
})

const SUMMARY = {
  overdue_count: OVERDUE,
  due_today_count: 0,
  upcoming_total_cents: 0,
}

function itemList(overdue: DueItem[]): ItemListResponse {
  return {
    buckets: {
      overdue,
      due_today: [],
      upcoming: UPCOMING_ITEMS,
      later: LATER_ITEMS,
    },
    summary: SUMMARY,
    currency_code: CURRENCY,
    timezone: TIMEZONE,
  }
}

const ALL_ITEMS = itemList(OVERDUE_ITEMS)
const UPCOMING_ONLY_ITEMS = itemList([])

const ENTRIES: TimelineEntry[] = ITEMS.map((item) => {
  const offsetHours = (Date.parse(item.due_at_utc) - REFERENCE_MS) / HOUR_MS
  return {
    item,
    urgency: urgencyFor(offsetHours),
    seconds_until_due: Math.round(offsetHours * 3_600),
  }
})
const FUTURE_ENTRIES = ENTRIES.filter((entry) => entry.urgency !== 'overdue')
function timeline(entries: TimelineEntry[], overdueCount: number): TimelineResponse {
  return {
    reference_time_utc: REFERENCE,
    timezone: TIMEZONE,
    currency_code: CURRENCY,
    overdue_count: overdueCount,
    entries,
  }
}

const ALL_TIMELINE = timeline(ENTRIES, OVERDUE)
const UPCOMING_TIMELINE = timeline(FUTURE_ENTRIES, OVERDUE)

function mockApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('/api/items')) {
      return jsonResponse(url.includes('scope=upcoming') ? UPCOMING_ONLY_ITEMS : ALL_ITEMS)
    }
    if (url.startsWith('/api/timeline')) {
      return jsonResponse(url.includes('scope=upcoming') ? UPCOMING_TIMELINE : ALL_TIMELINE)
    }
    return jsonResponse({ detail: 'not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function renderDashboard() {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  return render(<DashboardPage />, { wrapper: Wrapper })
}

function renderTimeline() {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={['/timeline']}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  return render(<TimelinePage />, { wrapper: Wrapper })
}

function mockWideViewport(width = 1280) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: query.includes('min-width: 1024px'),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    ),
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height: 480,
    top: 0,
    left: 0,
    right: width,
    bottom: 480,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('upcoming-focus performance', () => {
  it('renders 1,000 dashboard deadlines within the default-view budget', async () => {
    mockApi()

    const renderStarted = performance.now()
    renderDashboard()
    await screen.findByText('Upcoming deadline 0001')
    await screen.findByRole('button', { name: `Show ${OVERDUE} overdue deadlines` })
    const renderElapsed = performance.now() - renderStarted
    expect(renderElapsed).toBeLessThan(2_000)
  })

  it('renders 1,000 timeline deadlines and settles reveal/hide within budget', async () => {
    const user = userEvent.setup()
    mockWideViewport()
    mockApi()

    const renderStarted = performance.now()
    renderTimeline()
    await screen.findByTestId('timeline-now')
    await screen.findByRole('button', { name: `Show ${OVERDUE} overdue deadlines` })
    const renderElapsed = performance.now() - renderStarted
    expect(renderElapsed).toBeLessThan(2_000)

    const revealStarted = performance.now()
    await user.click(screen.getByRole('button', { name: `Show ${OVERDUE} overdue deadlines` }))
    await screen.findByRole('region', { name: 'Deadlines including overdue' })
    await screen.findByRole('button', { name: `Hide ${OVERDUE} overdue deadlines` })
    expect(performance.now() - revealStarted).toBeLessThan(1_000)

    const hideStarted = performance.now()
    await user.click(screen.getByRole('button', { name: `Hide ${OVERDUE} overdue deadlines` }))
    await screen.findByRole('region', { name: 'Upcoming deadlines' })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Overdue deadline/ })).not.toBeInTheDocument(),
    )
    expect(performance.now() - hideStarted).toBeLessThan(1_000)
  })
})
