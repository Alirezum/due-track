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

function markerTitles(): string[] {
  return within(chronologicalList())
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label')?.split(',')[0] ?? '')
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.useRealTimers()
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
    renderTimeline(response)

    expect(await screen.findByRole('heading', { name: 'Time, laid bare.' })).toBeInTheDocument()

    const list = await screen.findByRole('list', { name: 'Deadlines in chronological order' })
    expect(markerTitles()).toEqual(response.entries.map((entry) => entry.item.title))

    for (const entry of response.entries) {
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

    const buttons = within(list).getAllByRole('button')
    const overdueCount = response.entries.filter((entry) => entry.urgency === 'overdue').length
    for (const button of buttons.slice(0, overdueCount)) {
      expect(button.getAttribute('aria-label')).toMatch(/Overdue/)
    }
    for (const button of buttons.slice(overdueCount)) {
      expect(button.getAttribute('aria-label')).not.toMatch(/Overdue/)
    }

    const dividerIndex = Array.from(list.querySelectorAll('li')).indexOf(nowDivider)
    expect(dividerIndex).toBe(overdueCount)
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
