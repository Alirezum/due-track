import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DueItem, ItemListResponse } from '@/api/types'
import { DashboardPage } from '@/pages/DashboardPage'

function makeItem(overrides: Partial<DueItem> & Pick<DueItem, 'id' | 'title'>): DueItem {
  return {
    notes: '',
    due_at_utc: '2026-11-05T14:00:00Z',
    is_date_only: false,
    due_local_date: '2026-11-05',
    due_local_time: '09:00',
    category: null,
    priority: 'medium',
    amount_cents: null,
    recurrence_freq: 'none',
    recurrence_interval: 1,
    recurrence_anchor_mode: 'schedule',
    recurrence_anchor_day: null,
    recurrence_end_date: null,
    recurrence_remaining_count: null,
    status: 'active',
    is_recurring: false,
    created_at_utc: '2026-11-01T12:00:00Z',
    updated_at_utc: '2026-11-01T12:00:00Z',
    ...overrides,
  }
}

const ITEMS: ItemListResponse = {
  buckets: {
    overdue: [
      makeItem({
        id: 1,
        title: 'Tax return',
        category: 'Bills',
        priority: 'critical',
        notes: 'Upload the receipts',
        due_local_date: '2026-11-01',
        due_at_utc: '2026-11-02T04:59:59.999999Z',
        is_date_only: true,
        due_local_time: null,
      }),
    ],
    due_today: [
      makeItem({
        id: 2,
        title: 'Call the plumber',
        due_at_utc: '2026-11-05T17:00:00Z',
        due_local_time: '12:00',
      }),
    ],
    upcoming: [
      makeItem({
        id: 3,
        title: 'Rent',
        category: 'Bills',
        amount_cents: 120000,
        recurrence_freq: 'monthly',
        recurrence_interval: 1,
        recurrence_anchor_day: 5,
        is_recurring: true,
        due_local_date: '2026-11-06',
        due_at_utc: '2026-11-07T04:59:59.999999Z',
        is_date_only: true,
        due_local_time: null,
        priority: 'high',
      }),
    ],
    later: [],
  },
  summary: {
    overdue_count: 1,
    due_today_count: 1,
    upcoming_total_cents: 120000,
  },
  currency_code: 'USD',
  timezone: 'America/New_York',
}

const BILLS_ONLY: ItemListResponse = {
  buckets: {
    overdue: [],
    due_today: [],
    upcoming: [makeItem({ id: 3, title: 'Rent', category: 'Bills', amount_cents: 5000 })],
    later: [],
  },
  summary: {
    overdue_count: 0,
    due_today_count: 0,
    upcoming_total_cents: 5000,
  },
  currency_code: 'USD',
  timezone: 'America/New_York',
}

const NO_MATCHES: ItemListResponse = {
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

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  return render(<DashboardPage />, { wrapper: Wrapper })
}

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function mockFetch(handler: (url: string) => Response = () => jsonResponse(ITEMS)): FetchMock {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    return handler(url)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock as unknown as FetchMock
}

function itemRequests(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls
    .map(([input]) => (typeof input === 'string' ? input : String(input)))
    .filter((url) => url.startsWith('/api/items'))
}

function lastQuery(fetchMock: FetchMock): URLSearchParams | null {
  const urls = itemRequests(fetchMock)
  const last = urls[urls.length - 1]
  if (!last?.includes('?')) {
    return null
  }
  return new URLSearchParams(last.slice(last.indexOf('?') + 1))
}

function findQuery(
  fetchMock: FetchMock,
  predicate: (params: URLSearchParams) => boolean,
): URLSearchParams | undefined {
  const candidates = itemRequests(fetchMock)
    .filter((url) => url.includes('?'))
    .map((url) => new URLSearchParams(url.slice(url.indexOf('?') + 1)))
  return candidates.find(predicate)
}

beforeEach(() => {
  mockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Dashboard filters', () => {
  it('renders every filter control and offers known categories', async () => {
    const { container } = renderDashboard()
    await screen.findByText('Tax return')

    expect(screen.getByLabelText('Category')).toBeInTheDocument()
    expect(screen.getByLabelText('Priority')).toBeInTheDocument()
    expect(screen.getByLabelText('Repeats')).toBeInTheDocument()
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()

    const categoryInput = screen.getByLabelText('Category')
    const listId = categoryInput.getAttribute('list')
    expect(listId).toBeTruthy()
    const options = Array.from(
      container.querySelectorAll(`#${listId} option`),
    ).map((option) => option.getAttribute('value'))
    expect(options).toEqual(['Bills'])
  })

  it('sends the selected category in the request', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    renderDashboard()
    await screen.findByText('Tax return')

    await user.type(screen.getByLabelText('Category'), 'Bills')

    await waitFor(() => {
      expect(findQuery(fetchMock, (params) => params.get('category') === 'Bills')).toBeDefined()
    })
  })

  it('sends the selected priority in the request', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    renderDashboard()
    await screen.findByText('Tax return')

    await user.selectOptions(screen.getByLabelText('Priority'), 'high')

    await waitFor(() => {
      expect(lastQuery(fetchMock)?.get('priority')).toBe('high')
    })
  })

  it('sends the selected recurrence type in the request', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    renderDashboard()
    await screen.findByText('Tax return')

    await user.selectOptions(screen.getByLabelText('Repeats'), 'true')

    await waitFor(() => {
      expect(lastQuery(fetchMock)?.get('recurring')).toBe('true')
    })
  })

  it('debounces live search and sends the trimmed term', async () => {
    const fetchMock = mockFetch()
    renderDashboard()
    await screen.findByText('Tax return')

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '  rent  ' } })

    expect(findQuery(fetchMock, (params) => params.get('q') !== null)).toBeUndefined()

    await waitFor(
      () => {
        expect(findQuery(fetchMock, (params) => params.get('q') === 'rent')).toBeDefined()
      },
      { timeout: 2000 },
    )
  })

  it('combines every active filter into one AND query', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    renderDashboard()
    await screen.findByText('Tax return')

    await user.type(screen.getByLabelText('Category'), 'Bills')
    await user.selectOptions(screen.getByLabelText('Priority'), 'high')
    await user.selectOptions(screen.getByLabelText('Repeats'), 'true')
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'rent' } })

    await waitFor(
      () => {
        expect(
          findQuery(
            fetchMock,
            (params) =>
              params.get('category') === 'Bills' &&
              params.get('priority') === 'high' &&
              params.get('recurring') === 'true' &&
              params.get('q') === 'rent',
          ),
        ).toBeDefined()
      },
      { timeout: 2000 },
    )
  })

  it('clears every filter and returns to the unfiltered request', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    renderDashboard()
    await screen.findByText('Tax return')

    await user.selectOptions(screen.getByLabelText('Priority'), 'high')
    await waitFor(() => {
      expect(lastQuery(fetchMock)?.get('priority')).toBe('high')
    })

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    await waitFor(() => {
      expect(itemRequests(fetchMock).at(-1)).toBe('/api/items')
    })
    expect(screen.getByLabelText('Category')).toHaveValue('')
    expect(screen.getByLabelText('Priority')).toHaveValue('')
    expect(screen.getByLabelText('Repeats')).toHaveValue('all')
    expect(screen.getByLabelText('Search')).toHaveValue('')
  })

  it('shows the filtered summary instead of the full-set summary', async () => {
    const user = userEvent.setup()
    mockFetch((url) => (url.includes('category=Bills') ? jsonResponse(BILLS_ONLY) : jsonResponse(ITEMS)))
    renderDashboard()
    const summary = await screen.findByRole('region', { name: 'Dashboard summary' })
    await waitFor(() => expect(within(summary).getByText('$1,200.00')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Category'), 'Bills')

    await waitFor(() => expect(within(summary).getByText('$50.00')).toBeInTheDocument())
  })

  it('shows a no-results message when filters match nothing', async () => {
    mockFetch((url) => (url.includes('?') ? jsonResponse(NO_MATCHES) : jsonResponse(ITEMS)))
    renderDashboard()
    await screen.findByText('Tax return')

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzz' } })

    expect(await screen.findByText('No deadlines match these filters.')).toBeInTheDocument()
    expect(screen.queryByText('Tax return')).not.toBeInTheDocument()
  })
})
