// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/hooks/use-working-projects', () => ({
  useWorkingProjects: () => ({
    data: [{
      id: 'wp1', customer: 'Budi', contact: '0812', product: 'Cincin', variant: 'Emas',
      platform: 'Shopee', sourceOrderNo: 'SN1', orderNoLegacy: null, dueDate: '2026-09-20',
      status: 'Open', payment: 'Marketplace', invoiceAmount: 150000,
      checklist: [{ id: 1, text: 'a', done: true, deleted: false }],
      discordThreadId: 't1',
    }],
    isLoading: false,
  }),
}))
import { WorkingProjectOrdersTab } from '../WorkingProjectOrdersTab'

describe('WorkingProjectOrdersTab', () => {
  it('renders exactly the legacy column set in order', () => {
    render(<WorkingProjectOrdersTab />)
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual([
      'Customer/Contact', 'Produk', 'Variant', 'Platform', 'No. Order',
      'Due Date', 'Status', 'Payment', 'Nominal', 'Checklist', 'Discord',
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
})
