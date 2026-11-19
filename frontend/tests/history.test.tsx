import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CompletionLog,
  DueItem,
  HistoryResponse,
  ItemListResponse,
  UndoResponse,
} from '@/api/types'
import { HistoryPage } from '@/pages/HistoryPage'

function makeItem(overrides: Partial<DueItem> & Pick<DueItem, 'id' | 'title'>): DueItem {
  return {
    notes: '',
    due_at_utc: '2026-11-07T04:59:59.999999Z',
    is_date_only: true,
    due_local_date: '2026-11-06',
    due_local_time: null,
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

const RENT_SNAPSHOT = makeItem({
  id: 3,
  title: 'Rent',
  notes: 'Apartment 4B',
  due_at_utc: '2026-11-01T04:59:59.999999Z',
  due_local_date: '2026-11-01',
  category: 'Bills',
  priority: 'high',
  amount_cents: 120000,
  recurrence_freq: 'monthly',
  recurrence_anchor_day: 1,
  is_recurring: true,
})

const PASSPORT_SNAPSHOT = makeItem({
  id: 4,
  title: 'Renew passport',
  due_at_utc: '2026-11-10T14:30:00Z',
  is_date_only: false,
  due_local_date: '2026-11-10',
  due_local_time: '09:30',
  category: 'Personal',
  priority: 'critical',
})

const LATEST_LOG: CompletionLog = {
  id: 2,
  item_id: 3,
  scheduled_due_at_utc: '2026-11-01T04:59:59.999999Z',
  completed_at_utc: '2026-11-05T13:00:00Z',
  previous_state: RENT_SNAPSHOT,
  spawned_next_occurrence: true,
  next_due_at_utc: '2026-12-01T04:59:59.999999Z',
  can_undo: true,
}

const OLDER_LOG: CompletionLog = {
  id: 1,
  item_id: 4,
  scheduled_due_at_utc: '2026-11-10T14:30:00Z',
  completed_at_utc: '2026-11-04T12:00:00Z',
  previous_state: PASSPORT_SNAPSHOT,
  spawned_next_occurrence: false,
  next_due_at_utc: null,
  can_undo: false,
}

const HISTORY: HistoryResponse = { entries: [LATEST_LOG, OLDER_LOG], total: 2 }
const EMPTY_HISTORY: HistoryResponse = { entries: [], total: 0 }

const ITEM_LIST: ItemListResponse = {
  buckets: { overdue: [], due_today: [], upcoming: [], later: [] },
  summary: { overdue_count: 0, due_today_count: 0, upcoming_total_cents: 0 },
  currency_code: 'USD',
  timezone: 'America/New_York',
}

function isItemList(url: string, method: string): boolean {
  return method === 'GET' && /^\/api\/items(?:\?|$)/.test(url)
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

function isHistoryList(url: string, method: string): boolean {
  return method === 'GET' && /^\/api\/history(?:\?|$)/.test(url)
}

function historyListCalls(fetchMock: ReturnType<typeof mockFetch>): string[] {
  return fetchMock.mock.calls
    .map(([input, init]) => ({
      url: typeof input === 'string' ? input : String(input),
      method: init?.method ?? 'GET',
    }))
    .filter(({ url, method }) => isHistoryList(url, method))
    .map(({ url }) => url)
}

function renderHistory() {
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

  return render(<HistoryPage />, { wrapper: Wrapper })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('history', () => {
  it('renders completions newest first with their self-contained snapshots', async () => {
    mockFetch((url, init) => {
      const method = init.method ?? 'GET'
      if (isItemList(url, method)) {
        return jsonResponse(ITEM_LIST)
      }
      expect(isHistoryList(url, method)).toBe(true)
      return jsonResponse(HISTORY)
    })
    renderHistory()

    const list = await screen.findByRole('list', { name: 'Completion history' })
    const entries = within(list).getAllByRole('listitem')
    expect(entries).toHaveLength(2)

    expect(within(entries[0]).getByRole('heading', { name: 'Rent' })).toBeInTheDocument()
    expect(within(entries[1]).getByRole('heading', { name: 'Renew passport' })).toBeInTheDocument()

    expect(within(entries[0]).getByText('Bills')).toBeInTheDocument()
    expect(within(entries[0]).getByText('Apartment 4B')).toBeInTheDocument()
    expect(within(entries[0]).getByText('$1,200.00')).toBeInTheDocument()
    expect(within(entries[0]).getByText(/Nov 1, 2026/)).toBeInTheDocument()
    expect(within(entries[0]).getByText(/Nov 5, 2026/)).toBeInTheDocument()
    expect(within(entries[0]).getByText(/monthly/i)).toBeInTheDocument()

    expect(within(entries[1]).getByText('Personal')).toBeInTheDocument()
    expect(within(entries[1]).getByText(/Nov 10, 2026/)).toBeInTheDocument()
    expect(within(entries[1]).getByText(/Nov 4, 2026/)).toBeInTheDocument()
  })

  it('offers undo only for the latest completion of a live item', async () => {
    mockFetch(() => jsonResponse(HISTORY))
    renderHistory()

    expect(
      await screen.findByRole('button', { name: 'Undo completion of Rent' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Undo completion of Renew passport' }),
    ).not.toBeInTheDocument()
  })

  it('undoes a touched completion and announces the preserved occurrence', async () => {
    const user = userEvent.setup()
    let undone = false
    const undoResponse: UndoResponse = {
      restored_item: makeItem({ id: 9, title: 'Rent' }),
      preserved_touched_occurrence: true,
      warning:
        'Your edited occurrence was preserved, so the previous completion was restored as a new item.',
    }
    const fetchMock = mockFetch((url, init) => {
      const method = init.method ?? 'GET'
      if (url === '/api/history/2/undo' && method === 'POST') {
        undone = true
        return jsonResponse(undoResponse)
      }
      if (isHistoryList(url, method)) {
        return jsonResponse(undone ? EMPTY_HISTORY : HISTORY)
      }
      if (isItemList(url, method)) {
        return jsonResponse(ITEM_LIST)
      }
      throw new Error(`Unexpected request: ${method} ${url}`)
    })
    renderHistory()

    await user.click(await screen.findByRole('button', { name: 'Undo completion of Rent' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/edited occurrence was preserved/i)
    expect(await screen.findByText('No completions yet.')).toBeInTheDocument()
    await waitFor(() => {
      expect(historyListCalls(fetchMock).length).toBeGreaterThanOrEqual(2)
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/history/2/undo', expect.objectContaining({ method: 'POST' }))
  })

  it('undoes an untouched completion without a preservation warning', async () => {
    const user = userEvent.setup()
    let undone = false
    const undoResponse: UndoResponse = {
      restored_item: makeItem({ id: 3, title: 'Rent' }),
      preserved_touched_occurrence: false,
      warning: null,
    }
    mockFetch((url, init) => {
      const method = init.method ?? 'GET'
      if (url === '/api/history/2/undo' && method === 'POST') {
        undone = true
        return jsonResponse(undoResponse)
      }
      return jsonResponse(undone ? EMPTY_HISTORY : HISTORY)
    })
    renderHistory()

    await user.click(await screen.findByRole('button', { name: 'Undo completion of Rent' }))

    expect(await screen.findByText('No completions yet.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('deletes a history entry only after confirmation', async () => {
    const user = userEvent.setup()
    let deleted = false
    const fetchMock = mockFetch((url, init) => {
      const method = init.method ?? 'GET'
      if (url === '/api/history/2' && method === 'DELETE') {
        deleted = true
        return new Response(null, { status: 204 })
      }
      return jsonResponse(deleted ? EMPTY_HISTORY : HISTORY)
    })
    renderHistory()

    await user.click(
      await screen.findByRole('button', { name: 'Delete history entry for Rent' }),
    )

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete history entry?')).toBeInTheDocument()
    expect(within(dialog).getByText(/Rent/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/history/2',
      expect.objectContaining({ method: 'DELETE' }),
    )

    await user.click(screen.getByRole('button', { name: 'Delete history entry for Rent' }))
    const confirmDialog = await screen.findByRole('alertdialog')
    await user.click(within(confirmDialog).getByRole('button', { name: 'Delete entry' }))

    expect(await screen.findByText('No completions yet.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/history/2',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('shows an empty state when nothing has been completed', async () => {
    mockFetch(() => jsonResponse(EMPTY_HISTORY))
    renderHistory()

    expect(await screen.findByText('No completions yet.')).toBeInTheDocument()
    expect(screen.getByText(/Completed obligations will appear here/i)).toBeInTheDocument()
  })
})
