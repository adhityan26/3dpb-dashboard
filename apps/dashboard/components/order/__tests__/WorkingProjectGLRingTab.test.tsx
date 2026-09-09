// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/hooks/use-working-projects', () => ({
  useWorkingProjects: () => ({
    data: [
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
    ],
    isLoading: false,
  }),
}))
import { WorkingProjectGLRingTab } from '../WorkingProjectGLRingTab'

describe('WorkingProjectGLRingTab', () => {
  it('renders one row per ring variant, splitting comma-joined product names', () => {
    render(<WorkingProjectGLRingTab />)
    expect(screen.getByText('Cincin A')).toBeInTheDocument()
    expect(screen.getByText('Cincin B')).toBeInTheDocument()
  })
  it('excludes Canceled projects entirely', () => {
    render(<WorkingProjectGLRingTab />)
    expect(screen.queryByText('Cincin C')).not.toBeInTheDocument()
  })
})

describe('WorkingProjectGLRingTab full parity', () => {
  it('parses per-variant size from the matching notes segment, not the same size for every row', () => {
    render(<WorkingProjectGLRingTab />)
    expect(screen.getByText(/US 8/)).toBeInTheDocument()
    expect(screen.getByText(/US 6/)).toBeInTheDocument()
  })

  it('renders 7 checklist checkboxes per row with canonical labels', () => {
    render(<WorkingProjectGLRingTab />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThanOrEqual(14) // 7 per row x 2 rows
  })

  it('renders real filter controls, not just internal state', () => {
    render(<WorkingProjectGLRingTab />)
    expect(screen.getByPlaceholderText(/cari|search/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/platform/i)).toBeInTheDocument()
  })

  it('shows summary stat pills', () => {
    render(<WorkingProjectGLRingTab />)
    expect(screen.getByText(/aktif|active/i)).toBeInTheDocument()
  })

  it('checking a checklist box calls the web checklist route with setByLabel', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as any
    render(<WorkingProjectGLRingTab />)
    const checkbox = screen.getAllByRole('checkbox')[1] // "A — Print Stone", currently unchecked
    fireEvent.click(checkbox)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/checklist'),
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('setByLabel') })
    )
  })

  it('reverts the optimistic checkbox state when the checklist request resolves ok:false', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }) as any
    render(<WorkingProjectGLRingTab />)
    const checkbox = screen.getAllByRole('checkbox')[1] as HTMLInputElement // "A — Print Stone", currently unchecked
    expect(checkbox.checked).toBe(false)
    fireEvent.click(checkbox)
    await screen.findByRole('alert')
    expect(checkbox.checked).toBe(false)
  })
})
