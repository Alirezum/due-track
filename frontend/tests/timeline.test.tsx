import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

function renderApp(initialEntries: string[] = ['/timeline']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <App />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  )
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

async function revealOverdue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Show \d+ overdue deadline/ }))
  await screen.findByRole('button', { name: /Hide \d+ overdue deadline/ })
  await screen.findByRole('button', { name: /Overdue electricity/ })
}

function scopedTimelineHandler(all: TimelineResponse) {
  const upcoming = makeTimelineResponse(
    all.entries.filter((entry) => entry.urgency !== 'overdue'),
    { overdue_count: all.overdue_count },
  )
  return (url: string) => {
    if (!url.startsWith('/api/timeline')) {
      return jsonResponse(EMPTY_ITEMS)
    }
    return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
  }
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
    const user = userEvent.setup()
    const response = makeDenseTimeline()
    const visible = response.entries.filter(
      (entry) => Date.parse(entry.item.due_at_utc) <= FIXED_REFERENCE_MS + 30 * 24 * 3_600_000,
    )
    renderTimeline(makeTimelineResponse(visible))

    expect(await screen.findByRole('heading', { name: 'Time, laid bare.' })).toBeInTheDocument()
    await revealOverdue(user)

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
    const user = userEvent.setup()
    const response = makeDenseTimeline()
    renderTimeline(response)
    await revealOverdue(user)

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
    const user = userEvent.setup()
    const entries = makeDenseTimeline().entries.filter((entry) => entry.urgency === 'overdue')
    renderTimeline(makeTimelineResponse(entries))
    await revealOverdue(user)

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

describe('TimelinePage upcoming focus', () => {
  it('defaults to upcoming scope and hides overdue markers while reporting the server count', async () => {
    const all = makeDenseTimeline()
    const upcoming = makeTimelineResponse(
      all.entries.filter((entry) => entry.urgency !== 'overdue'),
      { overdue_count: all.overdue_count },
    )
    const { fetchMock } = renderTimeline((url) => {
      if (!url.startsWith('/api/timeline')) {
        return jsonResponse(EMPTY_ITEMS)
      }
      return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
    })

    await screen.findByRole('list', { name: 'Deadlines in chronological order' })
    const timelineRequests = fetchMock.mock.calls
      .map(([input]) => String(input))
      .filter((url) => url.startsWith('/api/timeline'))
    expect(timelineRequests).toContain('/api/timeline?scope=upcoming')
    expect(timelineRequests.every((url) => url.includes('scope=upcoming'))).toBe(true)

    expect(screen.queryByRole('button', { name: /Overdue electricity/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Overdue dentist/ })).not.toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Timeline summary' })
    expect(within(summary).getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show 2 overdue deadlines' })).toBeInTheDocument()
    expect(screen.getByText(/Overdue deadlines are summarized/)).toBeInTheDocument()
  })

  it('reveals and hides overdue deadlines with focus and equivalent region labels', async () => {
    mockWideViewport()
    const user = userEvent.setup()
    const overdue = makeTimelineEntry({
      id: 300,
      title: 'Overdue electricity',
      dueAtUtc: new Date(FIXED_REFERENCE_MS - 10 * 24 * 60 * 60_000).toISOString(),
      urgency: 'overdue',
    })
    const upcomingEntry = makeTimelineEntry({
      id: 301,
      title: 'Future task',
      dueAtUtc: new Date(FIXED_REFERENCE_MS + 10 * 24 * 60 * 60_000).toISOString(),
      urgency: 'later',
    })
    const all = makeTimelineResponse([overdue, upcomingEntry])
    const upcoming = makeTimelineResponse([upcomingEntry], { overdue_count: 1 })
    const { fetchMock } = renderTimeline((url) => {
      if (!url.startsWith('/api/timeline')) {
        return jsonResponse(EMPTY_ITEMS)
      }
      return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
    })

    await screen.findByTestId('timeline-now')
    expect(screen.getByRole('region', { name: 'Upcoming deadlines' })).toBeInTheDocument()
    expect(screen.queryByText('Overdue hangs below')).not.toBeInTheDocument()
    expect(screen.getByTestId('timeline-now')).toHaveStyle({ left: '2%' })
    expect(
      screen.queryByRole('button', { name: /earlier deadlines/ }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show 1 overdue deadline' }))
    await waitFor(() =>
      expect(
        fetchMock.mock.calls
          .map(([input]) => String(input))
          .filter((url) => url.startsWith('/api/timeline')),
      ).toContain('/api/timeline'),
    )
    const first = await screen.findByRole('button', { name: /Overdue electricity/ })
    await waitFor(() => expect(first).toHaveFocus())
    expect(
      screen.getByRole('region', { name: 'Deadlines including overdue' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Overdue hangs below')).toBeInTheDocument()
    expect(screen.getByText(/what has passed/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide 1 overdue deadline' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Overdue electricity/ }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('region', { name: 'Upcoming deadlines' })).toBeInTheDocument()
    expect(screen.queryByText('Overdue hangs below')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show 1 overdue deadline' })).toHaveFocus()
    expect(screen.getByText('Showing the next 30d from now')).toBeInTheDocument()
  })

  it('keeps overdue-only categories selectable from the all-scope source', async () => {
    const user = userEvent.setup()
    const overdueOnly = makeTimelineEntry({
      id: 500,
      title: 'Subscription renewal',
      dueAtUtc: new Date(FIXED_REFERENCE_MS - 60 * 60_000).toISOString(),
      urgency: 'overdue',
      category: 'Subscriptions',
    })
    const all = makeTimelineResponse([overdueOnly])
    const upcoming = makeTimelineResponse([], { overdue_count: 1 })
    const items: ItemListResponse = {
      buckets: { overdue: [overdueOnly.item], due_today: [], upcoming: [], later: [] },
      summary: { overdue_count: 1, due_today_count: 0, upcoming_total_cents: 0 },
      currency_code: 'USD',
      timezone: 'America/New_York',
    }
    renderTimeline((url) => {
      if (url.startsWith('/api/timeline')) {
        return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
      }
      if (url.startsWith('/api/items')) {
        return jsonResponse(items)
      }
      return jsonResponse({ detail: 'not found' }, 404)
    })

    expect(await screen.findByText('Nothing is upcoming.')).toBeInTheDocument()
    expect(
      document.querySelector('datalist#filter-category-options option[value="Subscriptions"]'),
    ).not.toBeNull()

    await user.type(screen.getByLabelText('Category'), 'Subscriptions')
    expect(
      await screen.findByText('No upcoming deadlines match these filters.'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 overdue deadline matches.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show overdue' }))
    expect(
      await screen.findByRole('button', { name: /Subscription renewal/ }),
    ).toBeInTheDocument()
  })

  it('shows the all-overdue and filtered no-results states', async () => {
    const user = userEvent.setup()
    const overdueEntries = makeDenseTimeline().entries.filter(
      (entry) => entry.urgency === 'overdue',
    )
    const all = makeTimelineResponse(overdueEntries)
    const upcoming = makeTimelineResponse([], { overdue_count: 2 })
    renderTimeline((url) => {
      if (!url.startsWith('/api/timeline')) {
        return jsonResponse(EMPTY_ITEMS)
      }
      return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
    })

    expect(await screen.findByText('Nothing is upcoming.')).toBeInTheDocument()
    expect(screen.getByText('2 deadlines are overdue.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show overdue' }))
    expect(
      await screen.findByText('All 2 active deadlines are overdue.'),
    ).toBeInTheDocument()
  })

  it('shows the filtered no-results state when nothing matches at all', async () => {
    const user = userEvent.setup()
    renderTimeline(scopedTimelineHandler(makeTimelineResponse([])))

    expect(await screen.findByText('Nothing on the ledger yet.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Category'), 'Missing category')
    expect(
      await screen.findByText('No deadlines match these filters.'),
    ).toBeInTheDocument()
    const filteredRegion = screen.getByRole('region', { name: 'Filtered timeline' })
    expect(
      within(filteredRegion).getByRole('button', { name: 'Clear filters' }),
    ).toBeInTheDocument()
  })

  it('shows an overdue-hidden notice after creating an overdue deadline', async () => {
    const user = userEvent.setup()
    const created = makeTimelineEntry({
      id: 600,
      title: 'Overdue created',
      dueAtUtc: new Date(FIXED_REFERENCE_MS - 60 * 60_000).toISOString(),
      urgency: 'overdue',
    })
    let createdOnServer = false
    const { fetchMock } = renderTimeline((url, init) => {
      if (url === '/api/items' && init.method === 'POST') {
        createdOnServer = true
        return jsonResponse(created.item, 201)
      }
      if (url.startsWith('/api/timeline')) {
        const all = createdOnServer
          ? makeTimelineResponse([created])
          : makeTimelineResponse([])
        const upcoming = makeTimelineResponse([], {
          overdue_count: createdOnServer ? 1 : 0,
        })
        return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
      }
      return jsonResponse(EMPTY_ITEMS)
    })

    await screen.findByText('Nothing on the ledger yet.')
    await user.click(screen.getAllByRole('button', { name: 'New deadline' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'New deadline' })
    await user.type(within(dialog).getByLabelText('Title'), 'Overdue created')
    await user.click(within(dialog).getByRole('button', { name: 'Create deadline' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const notice = await screen.findByTestId('overdue-hidden-notice')
    expect(
      within(notice).getByText(
        'Saved “Overdue created”. It is overdue, so it is hidden by the upcoming focus.',
      ),
    ).toBeInTheDocument()

    await user.click(within(notice).getByRole('button', { name: 'Show overdue' }))
    const marker = await screen.findByRole('button', { name: /Overdue created/ })
    await waitFor(() => expect(marker).toHaveFocus())
    expect(marker).toHaveAttribute('aria-current', 'true')
    expect(marker).toHaveAttribute('data-highlighted', 'true')
  })

  it('moves selection to the nearest upcoming deadline when one crosses now', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const crossing = makeTimelineEntry({
      id: 700,
      title: 'Crossing soon',
      dueAtUtc: new Date(FIXED_REFERENCE_MS + 30_000).toISOString(),
      urgency: 'within_24h',
      secondsUntilDue: 30,
    })
    const remaining = makeTimelineEntry({
      id: 701,
      title: 'Still ahead',
      dueAtUtc: new Date(FIXED_REFERENCE_MS + 2 * 60 * 60_000).toISOString(),
      urgency: 'within_24h',
    })
    let crossed = false
    renderTimeline((url) => {
      if (!url.startsWith('/api/timeline')) {
        return jsonResponse(EMPTY_ITEMS)
      }
      return jsonResponse(
        makeTimelineResponse(crossed ? [remaining] : [crossing, remaining], {
          overdue_count: crossed ? 1 : 0,
        }),
      )
    })

    const marker = await screen.findByRole('button', { name: /Crossing soon/ })
    fireEvent.click(marker)
    expect(
      await screen.findByRole('dialog', { name: 'Deadline details' }),
    ).toBeInTheDocument()

    crossed = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000)
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(
      screen.queryByRole('button', { name: /Crossing soon/ }),
    ).not.toBeInTheDocument()
    const next = screen.getByRole('button', { name: /Still ahead/ })
    expect(next).toHaveAttribute('aria-current', 'true')
    expect(
      screen.queryByRole('dialog', { name: 'Deadline details' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Selected Still ahead.')).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Timeline summary' })
    expect(within(summary).getByText('1')).toBeInTheDocument()
  })

  it('keeps the stale timeline and offers a retry strip when a refresh fails', async () => {
    const all = makeDenseTimeline()
    const upcoming = makeTimelineResponse(
      all.entries.filter((entry) => entry.urgency !== 'overdue'),
      { overdue_count: all.overdue_count },
    )
    let fail = false
    renderTimeline((url) => {
      if (!url.startsWith('/api/timeline')) {
        return jsonResponse(EMPTY_ITEMS)
      }
      if (fail) {
        return jsonResponse({ detail: 'The ledger is unavailable.' }, 503)
      }
      return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
    })

    await screen.findByRole('list', { name: 'Deadlines in chronological order' })
    fail = true
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(await screen.findByText(/could not be refreshed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Deadlines in chronological order' }),
    ).toBeInTheDocument()
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
  if (!url.startsWith('/api/timeline')) {
    return jsonResponse(EMPTY_ITEMS)
  }
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
    await revealOverdue(user)

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
    await revealOverdue(user)

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
    await revealOverdue(user)

    const marker = await screen.findByRole('button', { name: /Overdue electricity/ })
    await user.click(marker)
    expect(marker).toHaveAttribute('aria-current', 'true')
    await user.keyboard('{Escape}')

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

  it('lets Enter activate horizon and cluster controls without opening details', async () => {
    mockWideViewport()
    const user = userEvent.setup()
    renderTimeline(makeDenseTimeline())

    await screen.findByTestId('timeline-now')

    const horizon = screen.getByRole('button', { name: '7d' })
    horizon.focus()
    await user.keyboard('{Enter}')
    expect(horizon).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.queryByRole('complementary', { name: /Deadline details/ }),
    ).not.toBeInTheDocument()

    const clusters = await screen.findAllByRole('button', { name: /deadlines here/ })
    const cluster = clusters[0]
    if (!cluster) {
      throw new Error('expected a timeline cluster')
    }
    cluster.focus()
    await user.keyboard('{Enter}')
    expect(cluster).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.queryByRole('complementary', { name: /Deadline details/ }),
    ).not.toBeInTheDocument()
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

function entryAt(
  id: number,
  title: string,
  offsetMs: number,
  overrides: Partial<Parameters<typeof makeTimelineEntry>[0]> = {},
) {
  return makeTimelineEntry({
    id,
    title,
    dueAtUtc: new Date(FIXED_REFERENCE_MS + offsetMs).toISOString(),
    urgency: offsetMs < 0 ? 'overdue' : offsetMs < 3_600_000 ? 'within_24h' : 'within_7d',
    ...overrides,
  })
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

describe('TimelinePage US3 details, actions, and keyboard', () => {
  it('opens the detail dialog with the full deadline record', async () => {
    const user = userEvent.setup()
    const entry = entryAt(60, 'Rent payment', 2 * DAY, {
      category: 'Bills',
      priority: 'high',
      amountCents: 120_000,
      recurrenceFreq: 'monthly',
      recurrenceInterval: 1,
      recurrenceAnchorMode: 'fixed_day_of_month',
      recurrenceAnchorDay: 2,
      recurrenceEndDate: '2027-11-05',
      recurrenceRemainingCount: 5,
      notes: 'Pay by transfer before the office closes.',
    })
    renderTimeline(makeTimelineResponse([entry]))

    const marker = await screen.findByRole('button', { name: /Rent payment/ })
    expect(marker).not.toHaveTextContent('$')
    expect(marker).not.toHaveTextContent('USD')
    await user.click(marker)
    const dialog = await screen.findByRole('dialog', { name: 'Deadline details' })

    expect(within(dialog).getByText('Rent payment')).toBeInTheDocument()
    expect(within(dialog).queryByText(/\$1,200\.00/)).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Amount')).not.toBeInTheDocument()
    expect(within(dialog).queryByText(/USD/)).not.toBeInTheDocument()
    expect(within(dialog).getByText('Repeats monthly')).toBeInTheDocument()
    expect(within(dialog).getByText(/Day 2 of the month/)).toBeInTheDocument()
    expect(within(dialog).getByText(/5 occurrences remain/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Ends Nov 5, 2027/)).toBeInTheDocument()
    expect(
      within(dialog).getByText('Pay by transfer before the office closes.'),
    ).toBeInTheDocument()
    expect(within(dialog).getAllByText(/November 7/).length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText(/in 2d/).length).toBeGreaterThan(0)
    expect(
      within(dialog).getByRole('button', { name: 'Complete Rent payment' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Edit Rent payment' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: 'Delete Rent payment' }),
    ).toBeInTheDocument()
  })

  it('edits in place and keeps the entry selected', async () => {
    const user = userEvent.setup()
    const original = entryAt(61, 'Original title', 2 * HOUR, { category: 'Home' })
    const revised = {
      ...original,
      item: { ...original.item, title: 'Revised title' },
    }
    let revisedOnServer = false

    const { fetchMock } = renderTimeline((url, init) => {
      if (url === '/api/items/61' && init.method === 'PATCH') {
        revisedOnServer = true
        return jsonResponse(revised.item)
      }
      if (url.startsWith('/api/timeline')) {
        return jsonResponse(makeTimelineResponse([revisedOnServer ? revised : original]))
      }
      return jsonResponse(EMPTY_ITEMS)
    })

    await user.click(await screen.findByRole('button', { name: /Original title/ }))
    const detail = await screen.findByRole('dialog', { name: 'Deadline details' })
    await user.click(within(detail).getByRole('button', { name: 'Edit Original title' }))

    const editDialog = await screen.findByRole('dialog', { name: 'Edit deadline' })
    const title = within(editDialog).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Revised title')
    await user.click(within(editDialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/61',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    await waitFor(() =>
      expect(
        document.querySelector('[data-timeline-marker][data-entry-id="61"]'),
      ).not.toBeNull(),
    )
    const marker = document.querySelector<HTMLElement>(
      '[data-timeline-marker][data-entry-id="61"]',
    )
    expect(marker).toHaveAttribute('aria-current', 'true')
    expect(marker).toHaveTextContent('Revised title')
  })

  it('completes an entry, closes details, and focuses the next deadline', async () => {
    const user = userEvent.setup()
    const first = entryAt(70, 'Alpha task', HOUR)
    const second = entryAt(71, 'Beta task', 2 * HOUR)
    const third = entryAt(72, 'Gamma task', 3 * HOUR)
    let completed = false

    const { fetchMock } = renderTimeline((url, init) => {
      if (url === '/api/items/70/complete' && init.method === 'POST') {
        completed = true
        return jsonResponse({ log: { id: 1 }, item: null })
      }
      if (url.startsWith('/api/timeline')) {
        return jsonResponse(
          makeTimelineResponse(completed ? [second, third] : [first, second, third]),
        )
      }
      return jsonResponse(EMPTY_ITEMS)
    })

    await user.click(await screen.findByRole('button', { name: /Alpha task/ }))
    const detail = await screen.findByRole('dialog', { name: 'Deadline details' })
    await user.click(within(detail).getByRole('button', { name: 'Complete Alpha task' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/70/complete',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(await screen.findByText('Completed Alpha task.')).toBeInTheDocument()
    const beta = await screen.findByRole('button', { name: /Beta task/ })
    await waitFor(() => expect(beta).toHaveFocus())
    expect(beta).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByRole('dialog', { name: 'Deadline details' })).not.toBeInTheDocument()
  })

  it('confirms deletion, allows cancel, and focuses the nearest remaining deadline', async () => {
    const user = userEvent.setup()
    const first = entryAt(80, 'Alpha delete', HOUR)
    const second = entryAt(81, 'Beta delete', 2 * HOUR)
    const third = entryAt(82, 'Gamma delete', 3 * HOUR)
    let deleted = false

    const { fetchMock } = renderTimeline((url, init) => {
      if (url === '/api/items/81' && init.method === 'DELETE') {
        deleted = true
        return new Response(null, { status: 204 })
      }
      if (url.startsWith('/api/timeline')) {
        return jsonResponse(
          makeTimelineResponse(deleted ? [first, third] : [first, second, third]),
        )
      }
      return jsonResponse(EMPTY_ITEMS)
    })

    await waitFor(() =>
      expect(
        document.querySelector('[data-timeline-marker][data-entry-id="81"]'),
      ).not.toBeNull(),
    )
    await user.click(
      document.querySelector<HTMLElement>('[data-timeline-marker][data-entry-id="81"]')!,
    )
    const detail = await screen.findByRole('dialog', { name: 'Deadline details' })
    await user.click(within(detail).getByRole('button', { name: 'Delete Beta delete' }))

    const confirm = await screen.findByRole('alertdialog', { name: 'Delete deadline?' })
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/items/81',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(
      within(detail).getByRole('button', { name: 'Delete Beta delete' }),
    ).toBeInTheDocument()

    await user.click(within(detail).getByRole('button', { name: 'Delete Beta delete' }))
    const confirmAgain = await screen.findByRole('alertdialog', {
      name: 'Delete deadline?',
    })
    await user.click(within(confirmAgain).getByRole('button', { name: 'Delete deadline' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/81',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    expect(await screen.findByText('Deleted Beta delete.')).toBeInTheDocument()
    const gamma = await screen.findByRole('button', { name: /Gamma delete/ })
    await waitFor(() => expect(gamma).toHaveFocus())
    expect(gamma).toHaveAttribute('aria-current', 'true')
  })

  it('selects and highlights a created deadline that matches the filters', async () => {
    const user = userEvent.setup()
    const created = entryAt(90, 'New ledger item', 3 * HOUR)
    let createdOnServer = false
    const { fetchMock } = renderTimeline((url, init) => {
      if (url === '/api/items' && init.method === 'POST') {
        createdOnServer = true
        return jsonResponse(created.item, 201)
      }
      if (url.startsWith('/api/timeline')) {
        return jsonResponse(makeTimelineResponse(createdOnServer ? [created] : []))
      }
      return jsonResponse(EMPTY_ITEMS)
    })

    const empty = await screen.findByRole('region', { name: 'Empty timeline' })
    await user.click(within(empty).getByRole('button', { name: 'New deadline' }))
    const dialog = await screen.findByRole('dialog', { name: 'New deadline' })
    await user.type(within(dialog).getByLabelText('Title'), 'New ledger item')
    await user.click(within(dialog).getByRole('button', { name: 'Create deadline' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const marker = await screen.findByRole('button', { name: /New ledger item/ })
    expect(marker).toHaveAttribute('aria-current', 'true')
    expect(marker).toHaveAttribute('data-highlighted', 'true')
    expect(
      await screen.findByText('Added New ledger item. Highlighted on the timeline.'),
    ).toBeInTheDocument()
  })

  it('keeps a filter-excluded created deadline in a persistent notice with Clear filters', async () => {
    const user = userEvent.setup()
    const bills = entryAt(91, 'Existing bill', 2 * HOUR, { category: 'Bills' })
    const created = entryAt(92, 'New home task', 3 * HOUR, { category: 'Home' })
    let createdOnServer = false

    renderTimeline((url, init) => {
      if (url === '/api/items' && init.method === 'POST') {
        createdOnServer = true
        return jsonResponse(created.item, 201)
      }
      if (url.startsWith('/api/timeline')) {
        const parsed = new URL(url, 'http://localhost')
        const onlyBills = parsed.searchParams.get('category') === 'Bills'
        return jsonResponse(
          makeTimelineResponse(
            createdOnServer && !onlyBills ? [bills, created] : [bills],
          ),
        )
      }
      return jsonResponse(EMPTY_ITEMS)
    })

    await screen.findByRole('list', { name: 'Deadlines in chronological order' })
    const category = await screen.findByLabelText('Category')
    await user.type(category, 'Bills')
    await screen.findByRole('button', { name: /Existing bill/ })

    await user.click(screen.getAllByRole('button', { name: 'New deadline' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'New deadline' })
    await user.type(within(dialog).getByLabelText('Title'), 'New home task')
    await user.click(within(dialog).getByRole('button', { name: 'Create deadline' }))

    const notice = await screen.findByTestId('filter-exclusion-notice')
    expect(
      within(notice).getByText('Saved “New home task”, but the current filters hide it.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /New home task/ })).not.toBeInTheDocument()

    await user.click(within(notice).getByRole('button', { name: 'Clear filters' }))
    const marker = await screen.findByRole('button', { name: /New home task/ })
    expect(marker).toHaveAttribute('aria-current', 'true')
    expect(marker).toHaveAttribute('data-highlighted', 'true')
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('filter-exclusion-notice')).not.toBeInTheDocument()
  })

  it('keeps selection, focus, and horizon stable across 100 consecutive actions', async () => {
    const user = userEvent.setup()
    const entries = [
      entryAt(110, 'Stability alpha', HOUR),
      entryAt(111, 'Stability beta', 2 * HOUR),
      entryAt(112, 'Stability gamma', 3 * HOUR),
      entryAt(113, 'Stability delta', 4 * HOUR),
      entryAt(114, 'Stability epsilon', 5 * HOUR),
    ]
    renderTimeline(makeTimelineResponse(entries))

    await screen.findByRole('list', { name: 'Deadlines in chronological order' })

    for (let index = 0; index < 100; index += 1) {
      await user.keyboard(index < 50 ? 'j' : 'k')
      const selected = document.querySelectorAll('[aria-current="true"]')
      expect(selected).toHaveLength(1)
      expect(selected[0]).toHaveAttribute('data-timeline-marker')
      await waitFor(() => expect(selected[0]).toHaveFocus())
    }

    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('timeline-now-divider')).toBeInTheDocument()
  })

  it('supports J, K, Home, End, Enter, Esc, E, Delete, and C from the keyboard', async () => {
    const user = userEvent.setup()
    const first = entryAt(100, 'Keyboard alpha', HOUR)
    const second = entryAt(101, 'Keyboard beta', 2 * HOUR)
    const third = entryAt(102, 'Keyboard gamma', 3 * HOUR)
    let completed = false

    renderTimeline((url, init) => {
      if (url === '/api/items/100/complete' && init.method === 'POST') {
        completed = true
        return jsonResponse({ log: { id: 1 }, item: null })
      }
      if (url.startsWith('/api/timeline')) {
        return jsonResponse(
          makeTimelineResponse(completed ? [second, third] : [first, second, third]),
        )
      }
      return jsonResponse(EMPTY_ITEMS)
    })

    await screen.findByRole('list', { name: 'Deadlines in chronological order' })

    const marker = (name: RegExp) => screen.getByRole('button', { name })
    const current = () =>
      screen
        .getAllByRole('button')
        .find((button) => button.getAttribute('aria-current') === 'true')

    await user.keyboard('j')
    expect(marker(/Keyboard alpha/)).toHaveAttribute('aria-current', 'true')
    await user.keyboard('j')
    expect(marker(/Keyboard beta/)).toHaveAttribute('aria-current', 'true')
    await user.keyboard('k')
    expect(marker(/Keyboard alpha/)).toHaveAttribute('aria-current', 'true')
    await user.keyboard('{End}')
    expect(marker(/Keyboard gamma/)).toHaveAttribute('aria-current', 'true')
    await user.keyboard('{Home}')
    expect(marker(/Keyboard alpha/)).toHaveAttribute('aria-current', 'true')
    expect(current()).toBe(marker(/Keyboard alpha/))

    await user.keyboard('{Enter}')
    expect(
      await screen.findByRole('dialog', { name: 'Deadline details' }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Deadline details' }),
      ).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(marker(/Keyboard alpha/)).toHaveFocus())

    await user.keyboard('e')
    expect(await screen.findByRole('dialog', { name: 'Edit deadline' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit deadline' })).not.toBeInTheDocument(),
    )

    await user.keyboard('{Delete}')
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete deadline?' })
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }))

    await user.keyboard('c')
    const beta = await screen.findByRole('button', { name: /Keyboard beta/ })
    await waitFor(() => expect(beta).toHaveFocus())
    expect(beta).toHaveAttribute('aria-current', 'true')
  })

  it('moves a revealed overdue deadline into the upcoming view after editing it forward', async () => {
    const user = userEvent.setup()
    const overdue = entryAt(200, 'Overdue edit', -2 * DAY, { amountCents: 120_000 })
    const future = entryAt(201, 'Future keep', 2 * DAY)
    const revised = entryAt(200, 'Overdue edit', 3 * DAY, { amountCents: 120_000 })
    let moved = false

    const { fetchMock } = renderTimeline((url, init) => {
      if (url === '/api/items/200' && init.method === 'PATCH') {
        moved = true
        return jsonResponse(revised.item)
      }
      if (url.startsWith('/api/timeline')) {
        const all = makeTimelineResponse(moved ? [future, revised] : [overdue, future])
        const upcoming = makeTimelineResponse(moved ? [future, revised] : [future], {
          overdue_count: moved ? 0 : 1,
        })
        return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
      }
      return jsonResponse(EMPTY_ITEMS)
    })

    await screen.findByTestId('timeline-now-divider')
    await user.click(screen.getByRole('button', { name: 'Show 1 overdue deadline' }))
    await user.click(await screen.findByRole('button', { name: /Overdue edit/ }))
    const detail = await screen.findByRole('dialog', { name: 'Deadline details' })
    await user.click(within(detail).getByRole('button', { name: 'Edit Overdue edit' }))

    const edit = await screen.findByRole('dialog', { name: 'Edit deadline' })
    expect(within(edit).getByLabelText('Amount')).toHaveValue('1200.00')
    await user.clear(within(edit).getByLabelText('Date'))
    await user.type(within(edit).getByLabelText('Date'), revised.item.due_local_date)
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/200',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    const stillOpen = await screen.findByRole('dialog', { name: 'Deadline details' })
    expect(within(stillOpen).getByText('Overdue edit')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(
      await within(chronologicalList()).findByRole('button', { name: /Overdue edit/ }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Nothing overdue').length).toBeGreaterThan(0)
  })

  it('completes and deletes revealed overdue deadlines with updated counts', async () => {
    const user = userEvent.setup()
    const completeMe = entryAt(210, 'Overdue complete', -3 * HOUR)
    const deleteMe = entryAt(211, 'Overdue delete', -2 * HOUR)
    const future = entryAt(212, 'Future keep', 2 * HOUR)
    let completed = false
    let deleted = false

    const { fetchMock } = renderTimeline((url, init) => {
      if (url === '/api/items/210/complete' && init.method === 'POST') {
        completed = true
        return jsonResponse({ log: { id: 1 }, item: null })
      }
      if (url === '/api/items/211' && init.method === 'DELETE') {
        deleted = true
        return new Response(null, { status: 204 })
      }
      if (url.startsWith('/api/timeline')) {
        const overdue = [completeMe, deleteMe].filter(
          (entry) => !(completed && entry.item.id === 210) && !(deleted && entry.item.id === 211),
        )
        const all = makeTimelineResponse([...overdue, future])
        const upcoming = makeTimelineResponse([future], { overdue_count: overdue.length })
        return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
      }
      return jsonResponse(EMPTY_ITEMS)
    })

    await screen.findByTestId('timeline-now-divider')
    await user.click(screen.getByRole('button', { name: 'Show 2 overdue deadlines' }))

    await user.click(await screen.findByRole('button', { name: /Overdue complete/ }))
    let detail = await screen.findByRole('dialog', { name: 'Deadline details' })
    await user.click(within(detail).getByRole('button', { name: 'Complete Overdue complete' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/210/complete',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(await screen.findByText('Completed Overdue complete.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Overdue complete/ })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Hide 1 overdue deadline' })).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: /Overdue delete/ }))
    detail = await screen.findByRole('dialog', { name: 'Deadline details' })
    await user.click(within(detail).getByRole('button', { name: 'Delete Overdue delete' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete deadline?' })
    await user.click(within(confirm).getByRole('button', { name: 'Delete deadline' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/211',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    expect(await screen.findByText('Deleted Overdue delete.')).toBeInTheDocument()
    expect(screen.getAllByText('Nothing overdue').length).toBeGreaterThan(0)
  })

  it('records a revealed overdue completion in History and resets the reveal on navigation', async () => {
    const user = userEvent.setup()
    const overdue = entryAt(220, 'Overdue history', -2 * HOUR)
    const future = entryAt(221, 'Future history', 2 * HOUR)
    const historyEntry = {
      id: 88,
      item_id: overdue.item.id,
      scheduled_due_at_utc: overdue.item.due_at_utc,
      completed_at_utc: '2026-11-05T12:00:00Z',
      previous_state: overdue.item,
      spawned_next_occurrence: false,
      next_due_at_utc: null,
      can_undo: true,
    }
    let completed = false

    mockFetch((url, init) => {
      if (url === '/api/items/220/complete' && init.method === 'POST') {
        completed = true
        return jsonResponse({ log: historyEntry, item: null })
      }
      if (url.startsWith('/api/history')) {
        return jsonResponse({
          entries: completed ? [historyEntry] : [],
          total: completed ? 1 : 0,
        })
      }
      if (url.startsWith('/api/timeline')) {
        const all = makeTimelineResponse(completed ? [future] : [overdue, future], {
          overdue_count: completed ? 0 : 1,
        })
        const upcoming = makeTimelineResponse([future], {
          overdue_count: completed ? 0 : 1,
        })
        return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
      }
      if (url.startsWith('/api/items')) {
        return jsonResponse(EMPTY_ITEMS)
      }
      return jsonResponse({ detail: 'not found' }, 404)
    })

    renderApp(['/timeline'])
    await screen.findByTestId('timeline-now-divider')
    await user.click(screen.getByRole('button', { name: 'Show 1 overdue deadline' }))
    await user.click(await screen.findByRole('button', { name: /Overdue history/ }))
    const detail = await screen.findByRole('dialog', { name: 'Deadline details' })
    await user.click(within(detail).getByRole('button', { name: 'Complete Overdue history' }))
    expect(await screen.findByText('Completed Overdue history.')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'History' }))
    const list = await screen.findByRole('list', { name: 'Completion history' })
    expect(within(list).getByRole('heading', { name: 'Overdue history' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Timeline' }))
    await screen.findByTestId('timeline-now-divider')
    expect(
      screen.queryByRole('button', { name: /Overdue history/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Nothing overdue')).toBeInTheDocument()
  })

  it('operates the overdue indicator from the keyboard and announces state changes', async () => {
    const user = userEvent.setup()
    renderTimeline(scopedTimelineHandler(makeDenseTimeline()))
    await screen.findByTestId('timeline-now-divider')

    const show = screen.getByRole('button', { name: 'Show 2 overdue deadlines' })
    show.focus()
    expect(show).toHaveFocus()
    await user.keyboard('{Enter}')

    const marker = await screen.findByRole('button', { name: /Overdue electricity/ })
    await waitFor(() => expect(marker).toHaveFocus())
    expect(screen.getByRole('region', { name: 'Deadlines including overdue' })).toBeInTheDocument()
    expect(screen.getByText('Showing 2 overdue deadlines.')).toBeInTheDocument()

    const hide = screen.getByRole('button', { name: 'Hide 2 overdue deadlines' })
    hide.focus()
    await user.keyboard(' ')
    await waitFor(() => expect(hide).toHaveFocus())
    expect(screen.getByRole('region', { name: 'Upcoming deadlines' })).toBeInTheDocument()
    expect(screen.getByText('Hiding overdue deadlines. Showing upcoming only.')).toBeInTheDocument()
  })

  it('performs no writes when revealing or hiding overdue deadlines', async () => {
    const user = userEvent.setup()
    const { fetchMock } = renderTimeline(scopedTimelineHandler(makeDenseTimeline()))
    await screen.findByTestId('timeline-now-divider')

    await user.click(screen.getByRole('button', { name: 'Show 2 overdue deadlines' }))
    await screen.findByRole('button', { name: 'Hide 2 overdue deadlines' })
    await user.click(screen.getByRole('button', { name: 'Hide 2 overdue deadlines' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Overdue electricity/ }),
      ).not.toBeInTheDocument(),
    )

    const writes = fetchMock.mock.calls.filter(([, init]) => {
      const method = init?.method ?? 'GET'
      return method !== 'GET' && method !== 'HEAD'
    })
    expect(writes).toHaveLength(0)
  })
})
