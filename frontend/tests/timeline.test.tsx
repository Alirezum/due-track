import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemListResponse, TimelineResponse } from '@/api/types'
import App from '@/App'
import { ThemeProvider } from '@/components/ThemeProvider'
import { TimelinePage } from '@/pages/TimelinePage'
import {
  FIXED_REFERENCE_MS,
  makeDenseTimeline,
  makeThousandEntryTimeline,
  makeTimelineEntry,
  makeTimelineResponse,
} from './timelineFixtures'

const EMPTY_ITEMS: ItemListResponse = {
  buckets: { overdue: [], due_today: [], upcoming: [], later: [] },
  summary: { overdue_count: 0, due_today_count: 0, upcoming_total_cents: 0 },
  currency_code: 'USD',
  timezone: 'America/New_York',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

function mockFetch(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString()
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderTimeline(entry: TimelineResponse | Handler) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const handler: Handler =
    typeof entry === 'function'
      ? entry
      : (url) => {
          if (url.startsWith('/api/timeline')) {
            return jsonResponse(entry)
          }
          return jsonResponse(EMPTY_ITEMS)
        }
  const fetchMock = mockFetch(handler)

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/timeline']}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  return { ...render(<TimelinePage />, { wrapper: Wrapper }), fetchMock, queryClient }
}

function chronologicalList(): HTMLElement {
  return screen.getByRole('list', { name: 'Deadlines in chronological order' })
}

function markerElements(list: HTMLElement): Element[] {
  return Array.from(list.querySelectorAll('[data-timeline-marker]'))
}

function markerTitles(list: HTMLElement): string[] {
  return markerElements(list).map(
    (marker) => marker.getAttribute('aria-label')?.split(',')[0] ?? '',
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TimelinePage US1 baseline', () => {
  it('adds Timeline to navigation without removing Deadlines or History', async () => {
    mockFetch((url) => {
      if (url.startsWith('/api/timeline')) {
        return jsonResponse(makeTimelineResponse([]))
      }
      if (url.startsWith('/api/items')) {
        return jsonResponse(EMPTY_ITEMS)
      }
      return jsonResponse({ detail: 'not found' }, 404)
    })

    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ThemeProvider>
          <MemoryRouter initialEntries={['/']}>
            <App />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    )

    const primary = await screen.findByRole('navigation', { name: 'Primary' })
    expect(within(primary).getByRole('link', { name: 'Deadlines' })).toBeInTheDocument()
    expect(within(primary).getByRole('link', { name: 'Timeline' })).toBeInTheDocument()
    expect(within(primary).getByRole('link', { name: 'History' })).toBeInTheDocument()
  })

  it('renders every entry exactly once in chronological order with due moments and countdowns', async () => {
    const response = makeDenseTimeline()
    const visible = response.entries.filter(
      (entry) => Date.parse(entry.item.due_at_utc) <= FIXED_REFERENCE_MS + 30 * 24 * 3_600_000,
    )
    renderTimeline(makeTimelineResponse(visible))

    expect(await screen.findByRole('heading', { name: 'Time, laid bare.' })).toBeInTheDocument()

    const list = await screen.findByRole('list', { name: 'Deadlines in chronological order' })
    expect(markerTitles(list)).toEqual(visible.map((entry) => entry.item.title))

    for (const entry of visible) {
      expect(within(list).getAllByText(entry.item.title)).toHaveLength(1)
    }

    const firstMarker = within(list).getByRole('button', { name: /Overdue electricity/ })
    expect(within(firstMarker).getByText('Nov 2 · 07:00')).toBeInTheDocument()
    expect(within(firstMarker).getByText('Overdue · 3d')).toBeInTheDocument()

    const dueNowMarker = within(list).getByRole('button', { name: /Due exactly now/ })
    expect(within(dueNowMarker).getByText('Due now')).toBeInTheDocument()

    const dateOnlyMarker = within(list).getByRole('button', {
      name: /Date-only passport renewal/,
    })
    expect(within(dateOnlyMarker).getByText('Nov 6 · All day')).toBeInTheDocument()
    expect(dateOnlyMarker.querySelector('[data-node-shape="square"]')).not.toBeNull()
  })

  it('places overdue entries before the labelled now line and future entries after it', async () => {
    const response = makeDenseTimeline()
    renderTimeline(response)

    const list = await screen.findByRole('list', { name: 'Deadlines in chronological order' })
    const nowDivider = screen.getByTestId('timeline-now-divider')
    expect(nowDivider).toHaveAttribute('aria-label', 'Now')

    const overdueCount = response.entries.filter((entry) => entry.urgency === 'overdue').length
    const ordered = Array.from(
      list.querySelectorAll('[data-timeline-marker], [data-testid="timeline-now-divider"]'),
    )
    const dividerIndex = ordered.indexOf(nowDivider)
    expect(dividerIndex).toBe(overdueCount)

    const markers = markerElements(list)
    for (const marker of markers.slice(0, overdueCount)) {
      expect(marker.getAttribute('aria-label')).toMatch(/Overdue/)
    }
    for (const marker of markers.slice(overdueCount)) {
      expect(marker.getAttribute('aria-label')).not.toMatch(/Overdue/)
    }
  })

  it('keeps the empty state and opens the create form from it', async () => {
    const user = userEvent.setup()
    renderTimeline(makeTimelineResponse([]))

    const empty = await screen.findByRole('region', { name: 'Empty timeline' })
    expect(within(empty).getByText('Nothing on the ledger yet.')).toBeInTheDocument()

    await user.click(within(empty).getByRole('button', { name: 'New deadline' }))
    expect(await screen.findByRole('dialog', { name: 'New deadline' })).toBeInTheDocument()
  })

  it('shows a busy skeleton while the projection loads', async () => {
    renderTimeline(() => new Promise<Response>(() => undefined))

    expect(await screen.findByRole('region', { name: 'Loading timeline' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('shows an alert with retry when the projection fails', async () => {
    renderTimeline(() => jsonResponse({ detail: 'The ledger is unavailable.' }, 503))

    expect(
      await screen.findByRole('heading', { name: 'The timeline could not be read.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('The ledger is unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('summarises an all-overdue timeline', async () => {
    const entries = makeDenseTimeline().entries.filter((entry) => entry.urgency === 'overdue')
    renderTimeline(makeTimelineResponse(entries))

    expect(await screen.findByText('All 2 active deadlines are overdue.')).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Timeline summary' })
    expect(within(summary).getAllByText('2')).toHaveLength(2)
  })

  it('summarises an all-far-future timeline', async () => {
    const entries = makeDenseTimeline().entries.filter(
      (entry) => entry.item.id === 9 || entry.item.id === 10,
    )
    renderTimeline(makeTimelineResponse(entries))

    expect(
      await screen.findByText(/Nothing is overdue\. Next: Quarterly tax estimate/),
    ).toBeInTheDocument()
  })

  it('updates countdowns on the fifteen-second tick', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const entry = makeTimelineEntry({
      id: 50,
      title: 'Tick probe',
      dueAtUtc: new Date(FIXED_REFERENCE_MS + 70_000).toISOString(),
      urgency: 'within_24h',
      secondsUntilDue: 70,
    })
    renderTimeline(makeTimelineResponse([entry]))

    const marker = await screen.findByRole('button', { name: /Tick probe/ })
    expect(within(marker).getByText('in 1m')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(15_000)
    })

    expect(within(marker).getByText('in <1m')).toBeInTheDocument()
  })

  it('refreshes the timeline after a create without a manual reload', async () => {
    const user = userEvent.setup()
    const created = makeTimelineEntry({
      id: 77,
      title: 'Fresh ledger entry',
      dueAtUtc: new Date(FIXED_REFERENCE_MS + 60 * 60_000).toISOString(),
      urgency: 'within_24h',
    })
    let timelineCalls = 0

    const { fetchMock } = renderTimeline((url, init) => {
      if (url.startsWith('/api/timeline')) {
        timelineCalls += 1
        return jsonResponse(
          timelineCalls === 1 ? makeTimelineResponse([]) : makeTimelineResponse([created]),
        )
      }
      if (url === '/api/items' && init.method === 'POST') {
        return jsonResponse(created.item, 201)
      }
      return jsonResponse(EMPTY_ITEMS)
    })

    const empty = await screen.findByRole('region', { name: 'Empty timeline' })
    await user.click(within(empty).getByRole('button', { name: 'New deadline' }))

    const dialog = await screen.findByRole('dialog', { name: 'New deadline' })
    await user.type(within(dialog).getByLabelText('Title'), 'Fresh ledger entry')
    await user.click(within(dialog).getByRole('button', { name: 'Create deadline' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(await within(await screen.findByRole('list', { name: 'Deadlines in chronological order' })).findByText('Fresh ledger entry')).toBeInTheDocument()
    expect(timelineCalls).toBeGreaterThanOrEqual(2)
  })
})

function mockWideViewport(width = 1200) {
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

function filteredTimeline(url: string): Response {
  const parsed = new URL(url, 'http://localhost')
  let entries = makeDenseTimeline().entries
  const category = parsed.searchParams.get('category')
  const priority = parsed.searchParams.get('priority')
  const recurring = parsed.searchParams.get('recurring')
  const q = parsed.searchParams.get('q')?.toLowerCase()

  if (category) {
    entries = entries.filter(
      (entry) => entry.item.category?.toLowerCase() === category.toLowerCase(),
    )
  }
  if (priority) {
    entries = entries.filter((entry) => entry.item.priority === priority)
  }
  if (recurring) {
    const wantsRecurring = recurring === 'true'
    entries = entries.filter((entry) => entry.item.is_recurring === wantsRecurring)
  }
  if (q) {
    entries = entries.filter(
      (entry) =>
        entry.item.title.toLowerCase().includes(q) || entry.item.notes.toLowerCase().includes(q),
    )
  }

  return jsonResponse(makeTimelineResponse(entries))
}

function tickLabels(): string[] {
  return Array.from(document.querySelectorAll('[data-timeline-tick]')).map(
    (tick) => tick.textContent ?? '',
  )
}

describe('TimelinePage US2 horizons, edges, clusters, filters, and width', () => {
  it('offers six horizons, defaults to 30d, and updates axis labels', async () => {
    mockWideViewport()
    const user = userEvent.setup()
    renderTimeline(makeDenseTimeline())

    await screen.findByTestId('timeline-now')
    for (const label of ['24h', '7d', '30d', '90d', '1y', 'All']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true')

    const before = tickLabels()
    expect(before.length).toBeGreaterThanOrEqual(3)
    await user.click(screen.getByRole('button', { name: '7d' }))

    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(tickLabels()).not.toEqual(before))
    expect(screen.getByTestId('timeline-now')).toBeInTheDocument()
  })

  it('reveals hidden deadlines from edge summaries and resets the span', async () => {
    const user = userEvent.setup()
    renderTimeline(makeDenseTimeline())

    await screen.findByTestId('timeline-now-divider')
    await user.click(screen.getByRole('button', { name: '24h' }))

    const leftSummary = await screen.findByRole('button', {
      name: 'Show 2 earlier deadlines',
    })
    expect(
      screen.getByRole('button', { name: /Show \d+ later deadlines/ }),
    ).toBeInTheDocument()

    await user.click(leftSummary)
    expect(
      screen.queryByRole('button', { name: 'Show 2 earlier deadlines' }),
    ).not.toBeInTheDocument()
    expect(await screen.findByText('Overdue electricity')).toBeInTheDocument()
    expect(screen.getByTestId('timeline-now-divider')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reset span' }))
    expect(
      await screen.findByRole('button', { name: 'Show 2 earlier deadlines' }),
    ).toBeInTheDocument()
  })

  it('clusters same-instant deadlines in place and restores focus on Escape', async () => {
    mockWideViewport()
    const user = userEvent.setup()
    const clusterEntries = makeDenseTimeline().entries.filter(
      (entry) => entry.item.id >= 100,
    )
    renderTimeline(makeTimelineResponse(clusterEntries))

    const cluster = await screen.findByRole('button', { name: '20 deadlines here' })
    expect(cluster).toHaveAttribute('aria-expanded', 'false')

    await user.click(cluster)
    expect(cluster).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('group', { name: '20 deadlines at this moment' })
    expect(within(panel).getAllByRole('button')).toHaveLength(20)

    await user.keyboard('{Escape}')
    expect(cluster).toHaveAttribute('aria-expanded', 'false')
    expect(cluster).toHaveFocus()
    expect(
      screen.queryByRole('group', { name: '20 deadlines at this moment' }),
    ).not.toBeInTheDocument()
  })

  it('applies category, priority, recurrence, and search with AND semantics', async () => {
    const user = userEvent.setup()
    renderTimeline(filteredTimeline)

    await screen.findByRole('list', { name: 'Deadlines in chronological order' })
    expect(markerTitles(chronologicalList())).toHaveLength(29)

    await user.type(screen.getByLabelText('Category'), 'Bills')
    await waitFor(
      () => {
        expect(markerTitles(chronologicalList())).toEqual([
          'Overdue electricity',
          'Quarterly tax estimate',
        ])
      },
      { timeout: 3000 },
    )

    await user.selectOptions(screen.getByLabelText('Priority'), 'critical')
    await waitFor(() =>
      expect(markerTitles(chronologicalList())).toEqual(['Quarterly tax estimate']),
    )

    await user.type(screen.getByLabelText('Search'), 'tax')
    await waitFor(
      () => expect(markerTitles(chronologicalList())).toEqual(['Quarterly tax estimate']),
      { timeout: 3000 },
    )

    await user.selectOptions(screen.getByLabelText('Repeats'), 'true')
    expect(
      await screen.findByRole('heading', { name: 'No deadlines match these filters.' }),
    ).toBeInTheDocument()

    const filterRegion = screen.getByRole('region', { name: 'Filter deadlines' })
    await user.click(within(filterRegion).getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(markerTitles(chronologicalList())).toHaveLength(29), {
      timeout: 3000,
    })
  })

  it('preserves the selected deadline when the horizon changes', async () => {
    const user = userEvent.setup()
    renderTimeline(makeDenseTimeline())

    const marker = await screen.findByRole('button', { name: /Overdue electricity/ })
    await user.click(marker)
    expect(marker).toHaveAttribute('aria-current', 'true')

    await user.click(screen.getByRole('button', { name: '7d' }))
    const again = await screen.findByRole('button', { name: /Overdue electricity/ })
    expect(again).toHaveAttribute('aria-current', 'true')
  })

  it('switches between the vertical ledger and the horizontal axis', async () => {
    const first = renderTimeline(makeDenseTimeline())
    expect(await screen.findByText('Chronological ledger')).toBeInTheDocument()
    expect(screen.queryByTestId('timeline-now')).not.toBeInTheDocument()
    first.unmount()

    mockWideViewport()
    renderTimeline(makeDenseTimeline())
    expect(await screen.findByTestId('timeline-now')).toBeInTheDocument()
    expect(screen.queryByText('Chronological ledger')).not.toBeInTheDocument()
  })

  it('renders 1,000 deadlines within budget with a bounded marker count', async () => {
    mockWideViewport(1280)
    const started = performance.now()
    renderTimeline(makeThousandEntryTimeline())

    await screen.findByRole('list', { name: 'Deadlines in chronological order' })
    await screen.findByTestId('timeline-now')
    const elapsed = performance.now() - started

    const rendered = document.querySelectorAll('[data-timeline-marker], [data-timeline-cluster]')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(1000)
    expect(elapsed).toBeLessThan(2000)
  })
})
