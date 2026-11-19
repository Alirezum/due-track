import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompleteResponse, DueItem, ItemListResponse } from '@/api/types'
import { DashboardPage } from '@/pages/DashboardPage'

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

const RENT = makeItem({
  id: 3,
  title: 'Rent',
  recurrence_freq: 'monthly',
  recurrence_anchor_day: 6,
  is_recurring: true,
  priority: 'high',
})

const ONE_TIME = makeItem({ id: 4, title: 'Renew passport' })

function makeList(items: DueItem[]): ItemListResponse {
  return {
    buckets: {
      overdue: items.filter((item) => item.id === 1),
      due_today: items.filter((item) => item.id === 2),
      upcoming: items.filter((item) => item.id === 3),
      later: items.filter((item) => item.id === 4),
    },
    summary: {
      overdue_count: items.filter((item) => item.id === 1).length,
      due_today_count: items.filter((item) => item.id === 2).length,
      upcoming_total_cents: 0,
    },
    currency_code: 'USD',
    timezone: 'America/New_York',
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function makeCompletion(item: DueItem, next: DueItem | null): CompleteResponse {
  return {
    log: {
      id: 10,
      item_id: item.id,
      scheduled_due_at_utc: item.due_at_utc,
      completed_at_utc: '2026-11-05T12:00:00Z',
      previous_state: item,
      spawned_next_occurrence: next !== null,
      next_due_at_utc: next?.due_at_utc ?? null,
      can_undo: true,
    },
    item: next,
  }
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

function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString()
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('completion', () => {
  it('completes a recurring item, shows a pending state, and refreshes the next due date', async () => {
    const user = userEvent.setup()
    const advanced = makeItem({
      ...RENT,
      due_local_date: '2027-01-06',
      due_at_utc: '2027-01-07T04:59:59.999999Z',
    })
    let resolveCompletion: (response: Response) => void = () => undefined
    const pendingCompletion = new Promise<Response>((resolve) => {
      resolveCompletion = resolve
    })
    let listCalls = 0
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/items/3/complete') {
        expect(init.method).toBe('POST')
        return pendingCompletion
      }
      listCalls += 1
      return jsonResponse(makeList(listCalls === 1 ? [RENT] : [advanced]))
    })
    renderDashboard()

    expect(await screen.findByText('Rent')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Complete Rent' }))

    const pendingButton = await screen.findByRole('button', { name: 'Completing…' })
    expect(pendingButton).toBeDisabled()

    resolveCompletion(jsonResponse(makeCompletion(RENT, advanced)))

    expect(await screen.findByText('Jan 6, 2027')).toBeInTheDocument()
    await waitFor(() => {
      expect(listCalls).toBeGreaterThanOrEqual(2)
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/items/3/complete', expect.anything())
  })

  it('removes a completed one-time item from the dashboard', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch((url) => {
      if (url === '/api/items/4/complete') {
        return jsonResponse(makeCompletion(ONE_TIME, null))
      }
      return jsonResponse(makeList(fetchMock.mock.calls.length > 1 ? [] : [ONE_TIME]))
    })
    renderDashboard()

    expect(await screen.findByText('Renew passport')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Complete Renew passport' }))

    await waitFor(() => {
      expect(screen.queryByText('Renew passport')).not.toBeInTheDocument()
    })
    expect(await screen.findByText('Nothing on the ledger yet.')).toBeInTheDocument()
  })
})
