import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DueItem, ItemListResponse } from '@/api/types'
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

function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response> = () =>
    jsonResponse(ITEMS),
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString()
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  mockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DashboardPage', () => {
  it('renders the four buckets, summary values, and item details', async () => {
    renderDashboard()

    expect(await screen.findByText('Tax return')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Overdue' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Due today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Later' })).toBeInTheDocument()

    const summary = screen.getByRole('region', { name: 'Dashboard summary' })
    expect(within(summary).getByText('Overdue')).toBeInTheDocument()
    expect(within(summary).getByText('Due today')).toBeInTheDocument()
    expect(within(summary).getByText('$1,200.00')).toBeInTheDocument()

    expect(screen.getByText('Call the plumber')).toBeInTheDocument()
    expect(screen.getByText('Rent')).toBeInTheDocument()
    expect(screen.getByText('Nothing later')).toBeInTheDocument()
    expect(screen.getByText('Nov 1, 2026')).toBeInTheDocument()
    expect(screen.getByText('Repeats monthly')).toBeInTheDocument()
    expect(screen.getAllByText('Bills')).toHaveLength(2)
  })

  it('creates an item from the form and posts the contract payload', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/items' && init.method === 'POST') {
        return jsonResponse(makeItem({ id: 9, title: 'New deadline' }), 201)
      }
      return jsonResponse(ITEMS)
    })
    renderDashboard()

    await screen.findByText('Tax return')
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
      if (url === '/api/items/1' && init.method === 'PATCH') {
        return jsonResponse(makeItem({ id: 1, title: 'Tax return filed' }))
      }
      return jsonResponse(ITEMS)
    })
    renderDashboard()

    await screen.findByText('Tax return')
    await user.click(screen.getByRole('button', { name: 'Edit Tax return' }))

    const dialog = await screen.findByRole('dialog')
    const title = within(dialog).getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Tax return filed')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"title":"Tax return filed"'),
        }),
      )
    })
  })

  it('requires confirmation before deleting an item', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/items/1' && init.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return jsonResponse(ITEMS)
    })
    renderDashboard()

    await screen.findByText('Tax return')
    await user.click(screen.getByRole('button', { name: 'Delete Tax return' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete deadline?')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/items/1',
      expect.objectContaining({ method: 'DELETE' }),
    )

    await user.click(within(dialog).getByRole('button', { name: 'Delete deadline' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/1',
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
    expect(badges[0]).toHaveAttribute('data-category-tone', '3')
    expect(badges[1]).toHaveAttribute('data-category-tone', '3')
  })

  it('renders notes as plain text with preserved whitespace', async () => {
    const malicious = '<script>window.__dueTrackPwned = true</script>\nSecond line'
    mockFetch(() =>
      jsonResponse({
        ...ITEMS,
        buckets: {
          ...ITEMS.buckets,
          overdue: [makeItem({ id: 1, title: 'Tax return', notes: malicious })],
        },
      }),
    )
    renderDashboard()

    const notes = await screen.findByText(/<script>window\.__dueTrackPwned = true<\/script>/)
    expect(notes).toHaveClass('whitespace-pre-wrap')
    expect((window as unknown as { __dueTrackPwned?: boolean }).__dueTrackPwned).toBeUndefined()
  })
})
