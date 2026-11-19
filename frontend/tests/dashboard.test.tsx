import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DueItem, ItemListResponse } from '@/api/types'
import App from '@/App'
import { ThemeProvider } from '@/components/ThemeProvider'
import { categoryBadgeTone } from '@/lib/categories'
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

const OVERDUE = makeItem({
  id: 1,
  title: 'Tax return',
  category: 'Bills',
  priority: 'critical',
  notes: 'Upload the receipts',
  due_local_date: '2026-11-01',
  due_at_utc: '2026-11-02T04:59:59.999999Z',
  is_date_only: true,
  due_local_time: null,
})

const TODAY = makeItem({
  id: 2,
  title: 'Call the plumber',
  due_at_utc: '2026-11-05T17:00:00Z',
  due_local_time: '12:00',
})

const RENT = makeItem({
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
})

const ALL_ITEMS: ItemListResponse = {
  buckets: { overdue: [OVERDUE], due_today: [TODAY], upcoming: [RENT], later: [] },
  summary: { overdue_count: 1, due_today_count: 1, upcoming_total_cents: 120000 },
  currency_code: 'USD',
  timezone: 'America/New_York',
}

const UPCOMING_ITEMS: ItemListResponse = {
  ...ALL_ITEMS,
  buckets: { ...ALL_ITEMS.buckets, overdue: [] },
}

const EMPTY: ItemListResponse = {
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

function itemsFor(
  url: string,
  all: ItemListResponse = ALL_ITEMS,
  upcoming: ItemListResponse = UPCOMING_ITEMS,
): Response {
  return jsonResponse(url.includes('scope=upcoming') ? upcoming : all)
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

function renderApp(initialEntries: string[] = ['/']) {
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

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>

function mockFetch(handler?: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString()
    return handler ? handler(url, init) : itemsFor(url)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function summaryValue(name: string): string | null {
  const summary = screen.getByRole('region', { name: 'Dashboard summary' })
  return summary.querySelector(`[data-summary="${name}"] strong`)?.textContent ?? null
}

function listRequests(fetchMock: ReturnType<typeof mockFetch>): string[] {
  return fetchMock.mock.calls
    .map(([input]) => (typeof input === 'string' ? input : String(input)))
    .filter((url) => url.startsWith('/api/items') && !url.match(/\/api\/items\/\d/))
}

beforeEach(() => {
  mockFetch()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('DashboardPage', () => {
  it('defaults to upcoming scope and keeps money out of the summary', async () => {
    const fetchMock = mockFetch()
    renderDashboard()

    expect(await screen.findByText('Call the plumber')).toBeInTheDocument()
    expect(screen.getByText('Rent')).toBeInTheDocument()
    expect(screen.queryByText('Tax return')).not.toBeInTheDocument()
    expect(screen.queryByText('Upcoming total')).not.toBeInTheDocument()
    expect(screen.getByText(/Overdue deadlines are summarized/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Upcoming deadlines' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Overdue' })).not.toBeInTheDocument()

    expect(summaryValue('Next 7 days')).toBe('1')
    expect(summaryValue('Due today')).toBe('1')
    expect(summaryValue('Overdue')).toBe('1')

    const upcomingCalls = listRequests(fetchMock).filter((url) => url.includes('scope=upcoming'))
    expect(upcomingCalls.length).toBeGreaterThan(0)
  })

  it('keeps amounts and currency out of the summary and deadline cards', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch((url) => {
      if (url.includes('category=Bills')) {
        const filteredAll: ItemListResponse = {
          ...ALL_ITEMS,
          buckets: { overdue: [OVERDUE], due_today: [], upcoming: [RENT], later: [] },
        }
        const filteredUpcoming: ItemListResponse = {
          ...UPCOMING_ITEMS,
          buckets: { overdue: [], due_today: [], upcoming: [RENT], later: [] },
        }
        return itemsFor(url, filteredAll, filteredUpcoming)
      }
      return itemsFor(url)
    })
    renderDashboard()

    expect(await screen.findByText('Call the plumber')).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Dashboard summary' })
    expect(summary).not.toHaveTextContent('$')
    expect(summary).not.toHaveTextContent('USD')
    expect(screen.queryByText('$1,200.00')).not.toBeInTheDocument()
    expect(screen.queryByText('Upcoming total')).not.toBeInTheDocument()

    expect(summaryValue('Next 7 days')).toBe(String(UPCOMING_ITEMS.buckets.upcoming.length))
    expect(summaryValue('Next 7 days')).toBe('1')
    expect(summaryValue('Due today')).toBe('1')
    expect(summaryValue('Overdue')).toBe('1')

    const cards = screen.getAllByRole('article').map((card) => card.getAttribute('aria-label'))
    expect(cards).toEqual(['Call the plumber', 'Rent'])

    await user.type(screen.getByLabelText('Category'), 'Bills')
    await waitFor(() =>
      expect(listRequests(fetchMock).some((url) => url.includes('category=Bills'))).toBe(true),
    )
    expect(await screen.findByText('Rent')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText('Call the plumber')).not.toBeInTheDocument(),
    )
  })

  it('keeps edit, complete, and delete working for revealed overdue deadlines', async () => {
    const user = userEvent.setup()
    const overdueOne = makeItem({
      id: 21,
      title: 'Overdue one',
      amount_cents: 120000,
      due_at_utc: '2026-11-04T14:00:00Z',
      due_local_date: '2026-11-04',
      is_date_only: true,
      due_local_time: null,
    })
    const overdueTwo = makeItem({
      id: 22,
      title: 'Overdue two',
      due_at_utc: '2026-11-04T15:00:00Z',
      due_local_date: '2026-11-04',
      is_date_only: true,
      due_local_time: null,
    })
    const overdueThree = makeItem({
      id: 23,
      title: 'Overdue three',
      due_at_utc: '2026-11-04T16:00:00Z',
      due_local_date: '2026-11-04',
      is_date_only: true,
      due_local_time: null,
    })
    const upcomingItem = makeItem({
      id: 24,
      title: 'Upcoming item',
      due_at_utc: '2026-11-08T14:00:00Z',
      due_local_date: '2026-11-08',
      is_date_only: true,
      due_local_time: null,
    })
    let overdue = [overdueOne, overdueTwo, overdueThree]
    let upcoming = [upcomingItem]

    function listBody(scope: 'all' | 'upcoming'): ItemListResponse {
      return {
        buckets: {
          overdue: scope === 'all' ? overdue : [],
          due_today: [],
          upcoming,
          later: [],
        },
        summary: {
          overdue_count: overdue.length,
          due_today_count: 0,
          upcoming_total_cents: 0,
        },
        currency_code: 'USD',
        timezone: 'America/New_York',
      }
    }

    const fetchMock = mockFetch((url, init) => {
      const method = init.method ?? 'GET'
      if (url === '/api/items/21' && method === 'PATCH') {
        const payload = JSON.parse(String(init.body)) as { amount_cents: number }
        expect(payload.amount_cents).toBe(120000)
        const moved = makeItem({
          ...overdueOne,
          due_at_utc: '2026-12-01T14:00:00Z',
          due_local_date: '2026-12-01',
        })
        overdue = overdue.filter((item) => item.id !== 21)
        upcoming = [...upcoming, moved]
        return jsonResponse(moved)
      }
      if (url === '/api/items/22/complete' && method === 'POST') {
        overdue = overdue.filter((item) => item.id !== 22)
        return jsonResponse({ log: { id: 99 }, item: null })
      }
      if (url === '/api/items/23' && method === 'DELETE') {
        overdue = overdue.filter((item) => item.id !== 23)
        return new Response(null, { status: 204 })
      }
      if (url.startsWith('/api/items')) {
        return jsonResponse(listBody(url.includes('scope=upcoming') ? 'upcoming' : 'all'))
      }
      return jsonResponse({ detail: 'not found' }, 404)
    })
    renderDashboard()
    await screen.findByText('Upcoming item')

    await user.click(screen.getByRole('button', { name: 'Show 3 overdue deadlines' }))
    expect(await screen.findByText('Overdue one')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Overdue one' }))
    const editDialog = await screen.findByRole('dialog', { name: 'Edit deadline' })
    expect(within(editDialog).getByLabelText('Amount')).toHaveValue('1200.00')
    await user.clear(within(editDialog).getByLabelText('Date'))
    await user.type(within(editDialog).getByLabelText('Date'), '2026-12-01')
    await user.click(within(editDialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/21',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
    const upcomingRegion = await screen.findByRole('region', { name: 'Upcoming' })
    expect(within(upcomingRegion).getByRole('article', { name: 'Overdue one' })).toBeInTheDocument()
    const overdueRegion = screen
      .getByRole('heading', { name: 'Overdue' })
      .closest('section') as HTMLElement
    expect(
      within(overdueRegion).queryByRole('article', { name: 'Overdue one' }),
    ).not.toBeInTheDocument()
    expect(summaryValue('Overdue')).toBe('2')

    await user.click(screen.getByRole('button', { name: 'Complete Overdue two' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/22/complete',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(await screen.findByText('Completed Overdue two.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Overdue two' })).not.toBeInTheDocument(),
    )
    expect(summaryValue('Overdue')).toBe('1')

    await user.click(screen.getByRole('button', { name: 'Delete Overdue three' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete deadline?' })
    await user.click(within(confirm).getByRole('button', { name: 'Delete deadline' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/23',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    expect(await screen.findByText('Deleted Overdue three.')).toBeInTheDocument()
    expect(summaryValue('Overdue')).toBe('0')
    expect(screen.getAllByText('Nothing overdue').length).toBeGreaterThan(0)
  })

  it('records a revealed overdue completion in History, restores it with undo, and resets the reveal on navigation', async () => {
    const user = userEvent.setup()
    const overdue = makeItem({
      id: 31,
      title: 'Tax return',
      amount_cents: 120000,
      due_at_utc: '2026-11-01T14:00:00Z',
      due_local_date: '2026-11-01',
      is_date_only: true,
      due_local_time: null,
    })
    const upcoming = makeItem({
      id: 32,
      title: 'Call the plumber',
      due_at_utc: '2026-11-08T14:00:00Z',
      due_local_date: '2026-11-08',
      is_date_only: true,
      due_local_time: null,
    })
    const historyEntry = {
      id: 77,
      item_id: overdue.id,
      scheduled_due_at_utc: overdue.due_at_utc,
      completed_at_utc: '2026-11-05T12:00:00Z',
      previous_state: overdue,
      spawned_next_occurrence: false,
      next_due_at_utc: null,
      can_undo: true,
    }
    let completed = false
    let undone = false

    mockFetch((url, init) => {
      const method = init.method ?? 'GET'
      if (url === '/api/items/31/complete' && method === 'POST') {
        completed = true
        return jsonResponse({ log: historyEntry, item: null })
      }
      if (url === '/api/history/77/undo' && method === 'POST') {
        undone = true
        completed = false
        return jsonResponse({
          restored_item: overdue,
          preserved_touched_occurrence: false,
          warning: null,
        })
      }
      if (url.startsWith('/api/history')) {
        const visible = completed && !undone
        return jsonResponse({ entries: visible ? [historyEntry] : [], total: visible ? 1 : 0 })
      }
      if (url.startsWith('/api/items')) {
        const activeOverdue = completed && !undone ? [] : [overdue]
        return jsonResponse({
          buckets: {
            overdue: url.includes('scope=upcoming') ? [] : activeOverdue,
            due_today: [],
            upcoming: [upcoming],
            later: [],
          },
          summary: {
            overdue_count: activeOverdue.length,
            due_today_count: 0,
            upcoming_total_cents: 0,
          },
          currency_code: 'USD',
          timezone: 'America/New_York',
        } satisfies ItemListResponse)
      }
      return jsonResponse({ detail: 'not found' }, 404)
    })
    renderApp()
    await screen.findByText('Call the plumber')
    await user.click(screen.getByRole('button', { name: 'Show 1 overdue deadline' }))
    expect(await screen.findByText('Tax return')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'History' }))
    expect(await screen.findByText('No completions yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Deadlines' }))
    await screen.findByText('Call the plumber')
    expect(screen.queryByText('Tax return')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show 1 overdue deadline' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show 1 overdue deadline' }))
    await user.click(await screen.findByRole('button', { name: 'Complete Tax return' }))
    await waitFor(() => expect(screen.queryByText('Tax return')).not.toBeInTheDocument())
    expect(screen.getAllByText('Nothing overdue').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('link', { name: 'History' }))
    const list = await screen.findByRole('list', { name: 'Completion history' })
    expect(within(list).getByRole('heading', { name: 'Tax return' })).toBeInTheDocument()
    await user.click(
      within(list).getByRole('button', { name: 'Undo completion of Tax return' }),
    )

    expect(await screen.findByText('No completions yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Deadlines' }))
    await screen.findByText('Call the plumber')
    expect(screen.getByRole('button', { name: 'Show 1 overdue deadline' })).toBeInTheDocument()
    expect(screen.queryByText('Tax return')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show 1 overdue deadline' }))
    expect(await screen.findByText('Tax return')).toBeInTheDocument()
  })

  it('operates the overdue indicator from the keyboard and announces state changes', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await screen.findByText('Call the plumber')

    const show = screen.getByRole('button', { name: 'Show 1 overdue deadline' })
    show.focus()
    expect(show).toHaveFocus()
    await user.keyboard('{Enter}')

    const card = await screen.findByRole('article', { name: 'Tax return' })
    await waitFor(() => expect(card).toHaveFocus())
    expect(screen.getByRole('region', { name: 'Deadlines including overdue' })).toBeInTheDocument()
    expect(screen.getByText('Showing 1 overdue deadline.')).toBeInTheDocument()

    const hide = screen.getByRole('button', { name: 'Hide 1 overdue deadline' })
    hide.focus()
    await user.keyboard(' ')
    await waitFor(() => expect(hide).toHaveFocus())
    expect(screen.getByRole('region', { name: 'Upcoming deadlines' })).toBeInTheDocument()
    expect(screen.getByText('Hiding overdue deadlines. Showing upcoming only.')).toBeInTheDocument()
  })

  it('reveals and hides overdue deadlines with a focus handoff', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await screen.findByText('Call the plumber')
    const show = screen.getByRole('button', { name: 'Show 1 overdue deadline' })
    expect(show).toHaveAttribute('aria-expanded', 'false')

    await user.click(show)

    expect(await screen.findByText('Tax return')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Overdue' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Deadlines including overdue' })).toBeInTheDocument()
    const hide = screen.getByRole('button', { name: 'Hide 1 overdue deadline' })
    expect(hide).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/A local ledger of what is overdue/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('article', { name: 'Tax return' })).toHaveFocus())

    await user.click(hide)

    await waitFor(() => expect(screen.queryByText('Tax return')).not.toBeInTheDocument())
    expect(screen.getByRole('region', { name: 'Upcoming deadlines' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show 1 overdue deadline' })).toHaveFocus()
  })

  it('shows the all-overdue state and reveals the overdue bucket', async () => {
    const user = userEvent.setup()
    const overdueOnly: ItemListResponse = {
      ...EMPTY,
      buckets: { ...EMPTY.buckets, overdue: [OVERDUE] },
      summary: { ...EMPTY.summary, overdue_count: 1 },
    }
    mockFetch((url) => itemsFor(url, overdueOnly, { ...overdueOnly, buckets: { ...overdueOnly.buckets, overdue: [] } }))
    renderDashboard()

    expect(await screen.findByText('Nothing is upcoming.')).toBeInTheDocument()
    expect(screen.getByText('1 deadline is overdue.')).toBeInTheDocument()
    const upcomingRegion = screen.getByRole('region', { name: 'Upcoming deadlines' })
    expect(within(upcomingRegion).getByRole('button', { name: 'New deadline' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show 1 overdue deadline' }))

    expect(await screen.findByText('Tax return')).toBeInTheDocument()
    expect(screen.getByText('Nothing is upcoming. 1 deadline is overdue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide 1 overdue deadline' })).toBeInTheDocument()
  })

  it('offers show-overdue and clear-filters when only overdue matches the filters', async () => {
    const user = userEvent.setup()
    const filteredOverdue = { ...ALL_ITEMS, buckets: { ...ALL_ITEMS.buckets, due_today: [], upcoming: [], later: [] } }
    const filteredUpcoming = { ...EMPTY, summary: { ...EMPTY.summary, overdue_count: 1 } }
    mockFetch((url) => {
      if (url.includes('category=Bills')) {
        return jsonResponse(url.includes('scope=upcoming') ? filteredUpcoming : filteredOverdue)
      }
      return itemsFor(url)
    })
    renderDashboard()
    await screen.findByText('Call the plumber')

    await user.type(screen.getByLabelText('Category'), 'Bills')

    expect(await screen.findByText('No upcoming deadlines match these filters.')).toBeInTheDocument()
    expect(screen.getByText('1 overdue deadline matches.')).toBeInTheDocument()
    const upcomingRegion = screen.getByRole('region', { name: 'Upcoming deadlines' })
    expect(within(upcomingRegion).getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show 1 overdue deadline' }))
    expect(await screen.findByText('Tax return')).toBeInTheDocument()
  })

  it('shows the empty-ledger state when nothing is stored', async () => {
    mockFetch(() => itemsFor('/api/items', EMPTY, EMPTY))
    renderDashboard()

    expect(await screen.findByText('Nothing on the ledger yet.')).toBeInTheDocument()
    expect(screen.getByText(/Add your first deadline/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show .* overdue/ })).not.toBeInTheDocument()
  })

  it('keeps overdue-only categories in the category source', async () => {
    const healthOverdue = makeItem({
      id: 8,
      title: 'Health check',
      category: 'Health',
      due_at_utc: '2026-11-02T04:59:59.999999Z',
      due_local_date: '2026-11-01',
      is_date_only: true,
      due_local_time: null,
    })
    const all = {
      ...ALL_ITEMS,
      buckets: { ...ALL_ITEMS.buckets, overdue: [OVERDUE, healthOverdue] },
      summary: { ...ALL_ITEMS.summary, overdue_count: 2 },
    }
    mockFetch((url) => itemsFor(url, all, UPCOMING_ITEMS))
    const { container } = renderDashboard()
    await screen.findByText('Call the plumber')

    const listId = screen.getByLabelText('Category').getAttribute('list')
    const options = Array.from(container.querySelectorAll(`#${listId} option`)).map((option) =>
      option.getAttribute('value'),
    )
    expect(options).toEqual(['Bills', 'Health'])
  })

  it('shows a hidden-overdue notice after creating an overdue deadline', async () => {
    const user = userEvent.setup()
    const created = makeItem({
      id: 9,
      title: 'Renew passport',
      due_at_utc: '2026-10-01T14:00:00Z',
      due_local_date: '2026-10-01',
    })
    let posted = false
    mockFetch((url, init) => {
      if (url === '/api/items' && init.method === 'POST') {
        posted = true
        return jsonResponse(created, 201)
      }
      if (posted) {
        const all = {
          ...ALL_ITEMS,
          buckets: { ...ALL_ITEMS.buckets, overdue: [...ALL_ITEMS.buckets.overdue, created] },
          summary: { ...ALL_ITEMS.summary, overdue_count: 2 },
        }
        return itemsFor(url, all, { ...UPCOMING_ITEMS, summary: { ...UPCOMING_ITEMS.summary, overdue_count: 2 } })
      }
      return itemsFor(url)
    })
    renderDashboard()
    await screen.findByText('Call the plumber')
    await user.click(screen.getByRole('button', { name: 'New deadline' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Title'), 'Renew passport')
    await user.clear(within(dialog).getByLabelText('Date'))
    await user.type(within(dialog).getByLabelText('Date'), '2026-10-01')
    await user.click(within(dialog).getByRole('button', { name: 'Create deadline' }))

    expect(
      await screen.findByText(/Saved “Renew passport”. It is overdue, so it is hidden by the upcoming focus./),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show 2 overdue deadlines' })).toBeInTheDocument()
  })

  it('shows a hidden-overdue notice after editing an upcoming deadline into the past', async () => {
    const user = userEvent.setup()
    const overdueRent = makeItem({
      ...RENT,
      due_at_utc: '2026-10-01T14:00:00Z',
      due_local_date: '2026-10-01',
    })
    let patched = false
    mockFetch((url, init) => {
      if (url === '/api/items/3' && init.method === 'PATCH') {
        patched = true
        return jsonResponse(overdueRent)
      }
      if (patched) {
        const all = {
          ...ALL_ITEMS,
          buckets: {
            overdue: [...ALL_ITEMS.buckets.overdue, overdueRent],
            due_today: ALL_ITEMS.buckets.due_today,
            upcoming: [],
            later: [],
          },
          summary: { ...ALL_ITEMS.summary, overdue_count: 2 },
        }
        return itemsFor(url, all, {
          ...EMPTY,
          summary: { ...EMPTY.summary, overdue_count: 2 },
        })
      }
      return itemsFor(url)
    })
    renderDashboard()
    await screen.findByText('Rent')

    await user.click(screen.getByRole('button', { name: 'Edit Rent' }))
    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Date'))
    await user.type(within(dialog).getByLabelText('Date'), '2026-10-01')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText(/Saved “Rent”. It is overdue, so it is hidden by the upcoming focus./),
    ).toBeInTheDocument()
  })

  it('creates an item from the form and posts the contract payload', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/items' && init.method === 'POST') {
        return jsonResponse(makeItem({ id: 9, title: 'New deadline' }), 201)
      }
      return itemsFor(url)
    })
    renderDashboard()

    await screen.findByText('Call the plumber')
    await user.click(screen.getByRole('button', { name: 'New deadline' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Title'), 'Renew passport')
    await user.clear(within(dialog).getByLabelText('Date'))
    await user.type(within(dialog).getByLabelText('Date'), '2026-12-01')
    await user.click(within(dialog).getByRole('button', { name: 'Create deadline' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"title":"Renew passport"'),
        }),
      )
    })
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(postCall).toBeDefined()
    const payload = JSON.parse(String(postCall?.[1]?.body))
    expect(payload.due).toEqual({ kind: 'date', date: '2026-12-01' })
    expect(payload.priority).toBe('medium')
    expect(payload.recurrence_freq).toBe('none')
  })

  it('edits an item through the same form and patches the item', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/items/3' && init.method === 'PATCH') {
        return jsonResponse(makeItem({ ...RENT, title: 'Rent paid' }))
      }
      return itemsFor(url)
    })
    renderDashboard()

    await screen.findByText('Rent')
    await user.click(screen.getByRole('button', { name: 'Edit Rent' }))

    const dialog = await screen.findByRole('dialog')
    const title = within(dialog).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Rent paid')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/3',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"title":"Rent paid"'),
        }),
      )
    })
  })

  it('requires confirmation before deleting an item', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/items/3' && init.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return itemsFor(url)
    })
    renderDashboard()

    await screen.findByText('Rent')
    await user.click(screen.getByRole('button', { name: 'Delete Rent' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete deadline?')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/items/3',
      expect.objectContaining({ method: 'DELETE' }),
    )

    await user.click(within(dialog).getByRole('button', { name: 'Delete deadline' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/3',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('uses a deterministic, normalized category badge tone', async () => {
    expect(categoryBadgeTone(' Bills ')).toBe(categoryBadgeTone('bills'))
    expect(categoryBadgeTone('Bills')).toBeGreaterThanOrEqual(0)
    expect(categoryBadgeTone('Bills')).toBeLessThan(8)
    expect(categoryBadgeTone(null)).toBeNull()
    expect(categoryBadgeTone('   ')).toBeNull()

    renderDashboard()

    const badges = await screen.findAllByText('Bills')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveAttribute('data-category-tone', '3')
  })

  it('renders notes as plain text with preserved whitespace', async () => {
    const malicious = '<script>window.__dueTrackPwned = true</script>\nSecond line'
    const notesItem = makeItem({ ...RENT, notes: malicious })
    mockFetch((url) =>
      itemsFor(url, { ...ALL_ITEMS, buckets: { ...ALL_ITEMS.buckets, upcoming: [notesItem] } }, {
        ...UPCOMING_ITEMS,
        buckets: { ...UPCOMING_ITEMS.buckets, upcoming: [notesItem] },
      }),
    )
    renderDashboard()

    const notes = await screen.findByText(/<script>window\.__dueTrackPwned = true<\/script>/)
    expect(notes).toHaveClass('whitespace-pre-wrap')
    expect((window as unknown as { __dueTrackPwned?: boolean }).__dueTrackPwned).toBeUndefined()
  })

  it('refetches every 55 seconds and on window focus', async () => {
    vi.useFakeTimers()
    const fetchMock = mockFetch()
    renderDashboard()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('Call the plumber')).toBeInTheDocument()

    const upcomingCalls = () =>
      listRequests(fetchMock).filter((url) => url.includes('scope=upcoming')).length
    const beforeInterval = upcomingCalls()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55_000)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(upcomingCalls()).toBeGreaterThan(beforeInterval)

    const beforeFocus = upcomingCalls()
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(upcomingCalls()).toBeGreaterThan(beforeFocus)
  })

  it('removes a deadline that crosses now and increments the overdue count within 60 seconds', async () => {
    vi.useFakeTimers()
    const crossing = makeItem({
      id: 12,
      title: 'Crossing deadline',
      due_at_utc: '2026-11-05T12:00:30Z',
      due_local_time: '07:00',
    })
    let crossed = false
    mockFetch((url) => {
      if (!url.includes('scope=upcoming')) {
        return itemsFor(url)
      }
      return crossed
        ? jsonResponse({ ...EMPTY, summary: { ...EMPTY.summary, overdue_count: 1 } })
        : jsonResponse({
            ...EMPTY,
            buckets: { ...EMPTY.buckets, upcoming: [crossing] },
            summary: { ...EMPTY.summary, due_today_count: 0 },
          })
    })
    renderDashboard()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('Crossing deadline')).toBeInTheDocument()
    expect(summaryValue('Overdue')).toBe('0')

    crossed = true
    await act(async () => {
      await vi.advanceTimersByTimeAsync(55_000)
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(screen.queryByText('Crossing deadline')).not.toBeInTheDocument()
    expect(summaryValue('Overdue')).toBe('1')
  })

  it('shows the no-data error state', async () => {
    mockFetch(() => jsonResponse({ detail: 'offline' }, 500))
    renderDashboard()

    expect(await screen.findByText('The dashboard could not be read.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('keeps stale cards and shows a retry strip when a refetch fails', async () => {
    let fail = false
    mockFetch((url) => (fail ? jsonResponse({ detail: 'offline' }, 500) : itemsFor(url)))
    renderDashboard()
    await screen.findByText('Call the plumber')

    fail = true
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The dashboard could not be updated.')
    expect(screen.getByText('Call the plumber')).toBeInTheDocument()

    fail = false
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('performs no writes when revealing or hiding overdue deadlines', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    renderDashboard()
    await screen.findByText('Call the plumber')

    await user.click(screen.getByRole('button', { name: 'Show 1 overdue deadline' }))
    await screen.findByText('Tax return')
    await user.click(screen.getByRole('button', { name: 'Hide 1 overdue deadline' }))
    await waitFor(() => expect(screen.queryByText('Tax return')).not.toBeInTheDocument())

    const writes = fetchMock.mock.calls.filter(([, init]) => {
      const method = init?.method ?? 'GET'
      return method !== 'GET' && method !== 'HEAD'
    })
    expect(writes).toHaveLength(0)
  })
})
