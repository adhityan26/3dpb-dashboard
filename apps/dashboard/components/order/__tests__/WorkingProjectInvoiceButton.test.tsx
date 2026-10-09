// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const createMutateAsync = vi.fn()
const wpMutateAsync = vi.fn()
const orderMutateAsync = vi.fn()
let wpList: any[] = []

vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }))
vi.mock('@/lib/hooks/use-invoice', () => ({
  useInvoiceList: () => ({ data: [{ id: 'q1', nomor: 'INV-1', buyerNama: 'Budi', status: 'DRAFT' }] }),
  useCreateInvoice: () => ({ mutateAsync: createMutateAsync, isPending: false }),
}))
vi.mock('@/lib/hooks/use-working-projects', () => ({
  useUpdateWorkingProject: () => ({ mutateAsync: wpMutateAsync, isPending: false }),
  useUpdateMarketplaceOrder: () => ({ mutateAsync: orderMutateAsync, isPending: false }),
  useWorkingProjects: () => ({ data: wpList }),
}))

import { WorkingProjectInvoiceButton } from '../WorkingProjectInvoiceButton'

const mk = (o: any = {}) => ({
  id: 'wp1', customer: 'Budi', contact: null, source: 'shopee', sourceOrderNo: 'SN1', platform: 'Shopee',
  product: 'GL Ring', variant: '7', dueDate: null, itemPrice: 100, invoiceAmount: 200, status: 'Open',
  quotationId: null, orderId: null, order: null, ...o,
})
const orderOf = (quotationId: string | null) => ({ salePrice: null, feesTotal: null, netIncome: null, incomeStatus: null, incomeSettledAt: null, quotationId })

beforeEach(() => {
  vi.clearAllMocks()
  createMutateAsync.mockResolvedValue({ id: 'new-q' })
  wpMutateAsync.mockResolvedValue({})
  orderMutateAsync.mockResolvedValue({})
  wpList = []
})

describe('WorkingProjectInvoiceButton — manual WP (no order)', () => {
  it('creates an invoice and stores the link on the WP', async () => {
    render(<WorkingProjectInvoiceButton wp={mk({ source: 'manual', sourceOrderNo: null }) as any} />)
    fireEvent.click(screen.getByRole('button', { name: /Invoice/ }))
    fireEvent.click(screen.getByText('Buat Invoice Baru'))
    await waitFor(() => expect(wpMutateAsync).toHaveBeenCalledWith({ id: 'wp1', patch: { quotationId: 'new-q' } }))
    expect(orderMutateAsync).not.toHaveBeenCalled()
  })

  it('unlinks via the WP', async () => {
    render(<WorkingProjectInvoiceButton wp={mk({ quotationId: 'q1' }) as any} />)
    fireEvent.click(screen.getByRole('button', { name: /Invoice/ }))
    fireEvent.click(screen.getByText('Lepas Tautan'))
    await waitFor(() => expect(wpMutateAsync).toHaveBeenCalledWith({ id: 'wp1', patch: { quotationId: null } }))
  })
})

describe('WorkingProjectInvoiceButton — order mode', () => {
  const a = mk({ id: 'wpA', variant: '7', orderId: 'o1', order: orderOf(null) })
  const b = mk({ id: 'wpB', variant: '13', orderId: 'o1', order: orderOf(null) })

  it('builds one invoice for all WPs of the order and stores it on the order', async () => {
    wpList = [a, b, mk({ id: 'other', orderId: 'o2' })]
    render(<WorkingProjectInvoiceButton wp={a as any} />)
    fireEvent.click(screen.getByRole('button', { name: /Invoice/ }))
    expect(screen.getByText(/order SN1 \(2 WP\)/)).toBeTruthy()
    fireEvent.click(screen.getByText('Buat Invoice Baru'))
    await waitFor(() => expect(orderMutateAsync).toHaveBeenCalledWith({ id: 'o1', quotationId: 'new-q' }))
    const input = createMutateAsync.mock.calls[0][0]
    expect(input.items.map((i: any) => i.namaProduk)).toEqual(['GL Ring (7)', 'GL Ring (13)'])
    expect(wpMutateAsync).not.toHaveBeenCalled()
  })

  it('hides the create button when the order already has an invoice', () => {
    const linked = mk({ id: 'wpA', orderId: 'o1', order: orderOf('q1') })
    wpList = [linked]
    render(<WorkingProjectInvoiceButton wp={linked as any} />)
    fireEvent.click(screen.getByRole('button', { name: /Invoice/ }))
    expect(screen.queryByText('Buat Invoice Baru')).toBeNull()
    expect(screen.getByText('Buka Invoice')).toBeTruthy()
  })

  it('unlinks from the order', async () => {
    const linked = mk({ id: 'wpA', orderId: 'o1', order: orderOf('q1') })
    wpList = [linked]
    render(<WorkingProjectInvoiceButton wp={linked as any} />)
    fireEvent.click(screen.getByRole('button', { name: /Invoice/ }))
    fireEvent.click(screen.getByText('Lepas Tautan'))
    await waitFor(() => expect(orderMutateAsync).toHaveBeenCalledWith({ id: 'o1', quotationId: null }))
  })
})
