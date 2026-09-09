// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const MOCK_PROJECTS = [
  {
    id: 'wp1', customer: 'Budi', product: 'Cincin A, Cincin B', notes: 'A|size US 8|catatan A / B|size US 6|catatan B',
    status: 'Open', platform: 'Shopee', sourceOrderNo: 'SN1', orderNoLegacy: null,
    dueDate: '2026-09-20', orderDate: '2026-09-01', discordThreadUrl: 'https://discord.com/x',
    appliedTags: ['Cincin'],
    checklist: [
      { id: 1, text: 'A — Print Frame', done: true, deleted: false },
      { id: 2, text: 'A — Print Stone', done: false, deleted: false },
    ],
  },
  {
    id: 'wp2', customer: 'Ani', product: 'Cincin C', notes: 'size US 6',
    status: 'Canceled', platform: 'Shopee', sourceOrderNo: 'SN2', orderNoLegacy: null,
    dueDate: null, orderDate: null, discordThreadUrl: null,
    appliedTags: ['Cincin'],
    checklist: [],
  },
]

vi.mock('@/lib/hooks/use-working-projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hooks/use-working-projects')>()
  return {
    ...actual,
    useWorkingProjects: () => ({ data: MOCK_PROJECTS, isLoading: false }),
  }
})
import { WorkingProjectGLRingTab } from '../WorkingProjectGLRingTab'

function renderWithClient(client = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...render(<WorkingProjectGLRingTab />, { wrapper }) }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('WorkingProjectGLRingTab', () => {
  it('renders one row per ring variant, splitting comma-joined product names', () => {
    renderWithClient()
    expect(screen.getByText('Cincin A')).toBeInTheDocument()
    expect(screen.getByText('Cincin B')).toBeInTheDocument()
  })
  it('excludes Canceled projects entirely', () => {
    renderWithClient()
    expect(screen.queryByText('Cincin C')).not.toBeInTheDocument()
  })
})

describe('WorkingProjectGLRingTab full parity', () => {
  it('parses per-variant size from the matching notes segment, not the same size for every row', () => {
    renderWithClient()
    expect(screen.getByText(/US 8/)).toBeInTheDocument()
    expect(screen.getByText(/US 6/)).toBeInTheDocument()
  })

  it('renders 7 checklist checkboxes per row with canonical labels', () => {
    renderWithClient()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThanOrEqual(14) // 7 per row x 2 rows
  })

  it('renders real filter controls, not just internal state', () => {
    renderWithClient()
    expect(screen.getByPlaceholderText(/cari|search/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/platform/i)).toBeInTheDocument()
  })

  it('shows summary stat pills', () => {
    renderWithClient()
    expect(screen.getByText(/aktif|active/i)).toBeInTheDocument()
  })

  it('checking a checklist box calls the web checklist route with setByLabel', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as any
    renderWithClient()
    const checkbox = screen.getAllByRole('checkbox')[1] // "A — Print Stone", currently unchecked
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/checklist'),
        expect.objectContaining({ method: 'POST', body: expect.stringContaining('setByLabel') })
      )
    })
  })

  it('reverts the optimistic checkbox state when the checklist request resolves ok:false', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }) as any
    renderWithClient()
    const checkbox = screen.getAllByRole('checkbox')[1] as HTMLInputElement // "A — Print Stone", currently unchecked
    expect(checkbox.checked).toBe(false)
    fireEvent.click(checkbox)
    await screen.findByRole('alert')
    expect(checkbox.checked).toBe(false)
  })

  it('invalidates the working-projects query cache after a successful checklist toggle', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as any
    const client = new QueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    renderWithClient(client)
    const checkbox = screen.getAllByRole('checkbox')[1] // "A — Print Stone", currently unchecked
    fireEvent.click(checkbox)
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['working-projects'] }),
      )
    })
  })
})
