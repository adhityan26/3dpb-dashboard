// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/hooks/use-working-projects', () => ({
  useWorkingProjects: () => ({
    data: [
      {
        id: 'wp1', customer: 'Budi', contact: '0812', product: 'Cincin', variant: 'Emas',
        platform: 'Shopee', sourceOrderNo: 'SN1', orderNoLegacy: null, dueDate: '2026-09-20',
        status: 'Open', payment: 'Marketplace', invoiceAmount: 150000,
        checklist: [{ id: 1, text: 'a', done: true, deleted: false }],
        discordThreadId: 't1',
        discordThreadUrl: 'https://discord.com/channels/123/t1',
      },
      {
        id: 'wp2', customer: 'Ani', contact: null, product: 'Topeng', variant: null,
        platform: null, sourceOrderNo: null, orderNoLegacy: 'manual-1', dueDate: null,
        status: 'Open', payment: 'Manual', invoiceAmount: 0,
        checklist: [],
        discordThreadId: null,
        discordThreadUrl: null,
      },
    ],
    isLoading: false,
  }),
  useUpdateWorkingProject: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}))
import { WorkingProjectOrdersTab } from '../WorkingProjectOrdersTab'

describe('WorkingProjectOrdersTab', () => {
  it('renders exactly the legacy column set in order', () => {
    render(<WorkingProjectOrdersTab />)
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual([
      'Customer/Contact', 'Produk', 'Variant', 'Platform', 'No. Order',
      'Due Date', 'Status', 'Payment', 'Nominal', 'Checklist', 'Discord', 'Aksi',
    ])
  })
  it('prefers sourceOrderNo over orderNoLegacy for the No. Order column', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getByText('SN1')).toBeInTheDocument()
  })
  it('shows checklist progress as done/total', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getByText('1/1')).toBeInTheDocument()
  })
  it('links to the real discordThreadUrl, not a reconstructed @me link', () => {
    render(<WorkingProjectOrdersTab />)
    const link = screen.getByText('Buka').closest('a')
    expect(link).toHaveAttribute('href', 'https://discord.com/channels/123/t1')
  })
})

describe('WorkingProjectOrdersTab actions', () => {
  it('shows an edit action on every row', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getAllByRole('button', { name: /edit|ubah/i }).length).toBe(2)
  })

  it('shows Lihat Data Marketplace only for rows with a sourceOrderNo', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getAllByText(/lihat data marketplace/i).length).toBe(1)
  })
})
