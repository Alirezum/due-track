import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompleteResponse, DueItem, ItemListResponse } from '@/api/types'
import { useShortcuts } from '@/hooks/useShortcuts'
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
  title: 'Overdue invoice',
  due_at_utc: '2026-11-01T14:00:00Z',
  due_local_date: '2026-11-01',
  category: 'Bills',
})
const TODAY = makeItem({
  id: 2,
  title: 'Today call',
  due_at_utc: '2026-11-05T17:00:00Z',
  due_local_time: '12:00',
})
const UPCOMING = makeItem({
  id: 3,
  title: 'Upcoming rent',
  due_at_utc: '2026-11-08T14:00:00Z',
  due_local_date: '2026-11-08',
  recurrence_freq: 'monthly',
  is_recurring: true,
})

function makeList(overdue: DueItem[], today: DueItem[], upcoming: DueItem[]): ItemListResponse {
  return {
    buckets: { overdue, due_today: today, upcoming, later: [] },
    summary: {
      overdue_count: overdue.length,
      due_today_count: today.length,
      upcoming_total_cents: 0,
    },
    currency_code: 'USD',
    timezone: 'America/New_York',
  }
}

const ITEMS = makeList([OVERDUE], [TODAY], [UPCOMING])

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

function completion(item: DueItem): CompleteResponse {
  return {
    log: {
      id: 99,
      item_id: item.id,
      scheduled_due_at_utc: item.due_at_utc,
      completed_at_utc: '2026-11-05T12:00:00Z',
      previous_state: item,
      spawned_next_occurrence: false,
      next_due_at_utc: null,
      can_undo: true,
    },
    item: null,
  }
}

function articleFor(title: string): HTMLElement {
  return screen.getByRole('article', { name: title })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('keyboard shortcuts', () => {
  it('opens quick-add with N and focuses the title', async () => {
    const user = userEvent.setup()
    mockFetch(() => jsonResponse(ITEMS))
    renderDashboard()
    await screen.findByText('Overdue invoice')

    await user.keyboard('n')

    expect(await screen.findByRole('dialog', { name: 'New deadline' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveFocus()
  })

  it('focuses the dashboard search with /', async () => {
    const user = userEvent.setup()
    mockFetch(() => jsonResponse(ITEMS))
    renderDashboard()
    await screen.findByText('Overdue invoice')

    await user.keyboard('/')

    expect(screen.getByLabelText('Search')).toHaveFocus()
  })

  it('moves the active item with J/K and exposes a visible active state', async () => {
    const user = userEvent.setup()
    mockFetch(() => jsonResponse(ITEMS))
    renderDashboard()
    await screen.findByText('Overdue invoice')

    await user.keyboard('j')
    await waitFor(() => expect(articleFor('Overdue invoice')).toHaveFocus())
    expect(articleFor('Overdue invoice')).toHaveAttribute('data-active', 'true')
    expect(articleFor('Overdue invoice')).toHaveAttribute('aria-current', 'true')

    await user.keyboard('j')
    await waitFor(() => expect(articleFor('Today call')).toHaveFocus())
    expect(articleFor('Today call')).toHaveAttribute('data-active', 'true')
    expect(articleFor('Overdue invoice')).not.toHaveAttribute('data-active', 'true')

    await user.keyboard('k')
    await waitFor(() => expect(articleFor('Overdue invoice')).toHaveFocus())
    expect(articleFor('Overdue invoice')).toHaveAttribute('data-active', 'true')
  })

  it('opens the active item details with Enter', async () => {
    const user = userEvent.setup()
    mockFetch(() => jsonResponse(ITEMS))
    renderDashboard()
    await screen.findByText('Overdue invoice')

    await user.keyboard('j')
    await waitFor(() => expect(articleFor('Overdue invoice')).toHaveFocus())

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('dialog', { name: 'Edit deadline' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Overdue invoice')
  })

  it('completes the active item with C', async () => {
    const user = userEvent.setup()
    let completed = false
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/items/1/complete' && init.method === 'POST') {
        completed = true
        return jsonResponse(completion(OVERDUE))
      }
      return jsonResponse(completed ? makeList([], [TODAY], [UPCOMING]) : ITEMS)
    })
    renderDashboard()
    await screen.findByText('Overdue invoice')

    await user.keyboard('j')
    await waitFor(() => expect(articleFor('Overdue invoice')).toHaveFocus())

    await user.keyboard('c')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/items/1/complete', expect.anything())
    })
    await waitFor(() => {
      expect(screen.queryByText('Overdue invoice')).not.toBeInTheDocument()
    })
  })

  it('edits the active item with E', async () => {
    const user = userEvent.setup()
    mockFetch(() => jsonResponse(ITEMS))
    renderDashboard()
    await screen.findByText('Overdue invoice')

    await user.keyboard('j')
    await user.keyboard('j')
    await waitFor(() => expect(articleFor('Today call')).toHaveFocus())

    await user.keyboard('e')

    expect(await screen.findByRole('dialog', { name: 'Edit deadline' })).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Today call')
  })

  it('opens delete confirmation for the active item with Delete', async () => {
    const user = userEvent.setup()
    let deleted = false
    const fetchMock = mockFetch((url, init) => {
      if (url === '/api/items/1' && init.method === 'DELETE') {
        deleted = true
        return new Response(null, { status: 204 })
      }
      return jsonResponse(deleted ? makeList([], [TODAY], [UPCOMING]) : ITEMS)
    })
    renderDashboard()
    await screen.findByText('Overdue invoice')

    await user.keyboard('j')
    await waitFor(() => expect(articleFor('Overdue invoice')).toHaveFocus())

    await user.keyboard('{Delete}')

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Delete deadline?')).toBeInTheDocument()
    expect(within(dialog).getByText(/Overdue invoice/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Delete deadline' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/items/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
    await waitFor(() => {
      expect(screen.queryByText('Overdue invoice')).not.toBeInTheDocument()
    })
  })

  it('opens shortcut help with ? and closes overlays with Esc', async () => {
    const user = userEvent.setup()
    mockFetch(() => jsonResponse(ITEMS))
    renderDashboard()
    await screen.findByText('Overdue invoice')

    await user.keyboard('?')

    const help = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })
    for (const label of [
      'Quick add',
      'Focus search',
      'Next deadline',
      'Previous deadline',
      'Open details',
      'Complete deadline',
      'Edit deadline',
      'Delete deadline',
      'Shortcut help',
      'Close overlays',
    ]) {
      expect(within(help).getByText(label)).toBeInTheDocument()
    }

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument()
    })

    await user.keyboard('n')
    expect(await screen.findByRole('dialog', { name: 'New deadline' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'New deadline' })).not.toBeInTheDocument()
    })
  })

  it('does not fire shortcuts while typing in inputs, textareas, or contenteditable elements', async () => {
    const onFire = vi.fn()

    function Harness() {
      useShortcuts({
        onNew: onFire,
        onFocusSearch: onFire,
        onNextItem: onFire,
        onPreviousItem: onFire,
        onOpenItem: onFire,
        onCompleteItem: onFire,
        onEditItem: onFire,
        onDeleteItem: onFire,
        onShowHelp: onFire,
      })

      return (
        <div>
          <input aria-label="Text input" />
          <textarea aria-label="Notes" />
          <div aria-label="Rich text" contentEditable suppressContentEditableWarning />
        </div>
      )
    }

    const user = userEvent.setup()
    render(<Harness />)

    for (const label of ['Text input', 'Notes', 'Rich text']) {
      const target = screen.getByLabelText(label)
      target.focus()
      expect(target).toHaveFocus()

      await user.keyboard('n')
      await user.keyboard('j')
      await user.keyboard('c')
      await user.keyboard('e')
      await user.keyboard('/')
      await user.keyboard('?')
      await user.keyboard('{Delete}')
      await user.keyboard('{Enter}')
    }

    expect(onFire).not.toHaveBeenCalled()
  })
})
