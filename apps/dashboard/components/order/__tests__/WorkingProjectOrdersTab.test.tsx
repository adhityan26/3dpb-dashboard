// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const projects = [
  {
    id: 'wp1', customer: 'Budi', contact: '0812', product: 'Cincin', variant: 'Emas',
    platform: 'Shopee', sourceOrderNo: 'SN1', orderNoLegacy: null, dueDate: '2026-09-20',
    status: 'Open', payment: 'Marketplace', invoiceAmount: 150000,
    checklist: [{ id: 1, text: 'Print Frame', done: true, deleted: false }],
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
]

const updateMutationState = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  error: null as Error | null,
}))

vi.mock('@/lib/hooks/use-working-projects', () => ({
  useWorkingProjects: () => ({
    data: projects,
    isLoading: false,
  }),
  useUpdateWorkingProject: () => updateMutationState,
  useChecklistOp: () => ({ mutate: vi.fn(), isPending: false }),
}))

const invoiceMocks = vi.hoisted(() => ({ createAsync: vi.fn() }))
vi.mock('@/lib/hooks/use-invoice', () => ({
  useInvoiceList: () => ({ data: [{ id: 'q1', nomor: 'INV-1', buyerNama: 'Budi', status: 'SENT' }] }),
  useCreateInvoice: () => ({ mutateAsync: invoiceMocks.createAsync, isPending: false }),
}))

import { WorkingProjectOrdersTab, ordersToExportRows } from '../WorkingProjectOrdersTab'

beforeEach(() => {
  updateMutationState.mutate.mockReset()
  updateMutationState.mutateAsync.mockReset()
  updateMutationState.mutateAsync.mockResolvedValue({})
  updateMutationState.isPending = false
  updateMutationState.error = null
})

describe('WorkingProjectOrdersTab', () => {
  it('renders exactly the legacy column set in order (sortable columns carry a sort indicator)', () => {
    render(<WorkingProjectOrdersTab />)
    const mainTable = screen.getAllByRole('table')[1] // [0] is the Progress per Produk & Varian breakdown
    const headers = within(mainTable).getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual([
      'Customer/Contact ▲', 'Produk', 'Variant', 'Platform', 'No. Order',
      'Due Date ↕', 'Status ↕', 'Kurir', 'Payment', 'Nominal ↕', 'Checklist', 'Discord', 'Aksi',
    ])
  })
  it('prefers sourceOrderNo over orderNoLegacy for the No. Order column', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getByText('SN1')).toBeInTheDocument()
  })
  it('shows checklist progress as done/total', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getAllByText('1/1').length).toBeGreaterThan(0)
  })
  it('links to the real discordThreadUrl, not a reconstructed @me link', () => {
    render(<WorkingProjectOrdersTab />)
    const link = screen.getByText('Buka').closest('a')
    expect(link).toHaveAttribute('href', 'https://discord.com/channels/123/t1')
  })
})

describe('WorkingProjectOrdersTab filters and pagination', () => {
  it('defaults the status filter to everything except Done and Canceled', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getByRole('button', { name: /status: 4 dipilih/i })).toBeInTheDocument()
  })

  it('hides Done/Canceled rows via the default filter but keeps other statuses', () => {
    projects.push(
      { id: 'wp-done', customer: 'Cici', contact: null, product: 'Vas', variant: null, platform: 'Shopee', sourceOrderNo: 'SN3', orderNoLegacy: null, dueDate: null, status: 'Done', payment: 'Marketplace', invoiceAmount: 0, checklist: [], discordThreadId: null, discordThreadUrl: null } as any,
    )
    try {
      render(<WorkingProjectOrdersTab />)
      expect(screen.queryByText('Cici')).not.toBeInTheDocument()
      expect(screen.getByText(/Budi/)).toBeInTheDocument()
    } finally {
      projects.pop()
    }
  })

  it('filters rows by the search box across customer/product/order no', () => {
    render(<WorkingProjectOrdersTab />)
    fireEvent.change(screen.getByPlaceholderText(/cari customer/i), { target: { value: 'Ani' } })
    expect(screen.getByText('Ani')).toBeInTheDocument()
    expect(screen.queryByText('Budi')).not.toBeInTheDocument()
  })

  it('shows a page-size selector defaulting to 25', () => {
    render(<WorkingProjectOrdersTab />)
    expect((screen.getByRole('option', { name: '25 / halaman' }) as HTMLOptionElement).selected).toBe(true)
  })
})

describe('WorkingProjectOrdersTab actions', () => {
  it('shows an edit action on every row', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getAllByRole('button', { name: /edit|ubah/i }).length).toBe(2)
  })

  it('shows Lihat Data Marketplace only for rows with a sourceOrderNo', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getAllByRole('button', { name: /lihat data marketplace/i }).length).toBe(1)
  })

  it('shows a visible error and keeps the edit modal open when the save mutation fails', async () => {
    updateMutationState.error = new Error('Gagal menyimpan: HTTP 500')
    render(<WorkingProjectOrdersTab />)

    fireEvent.click(screen.getAllByRole('button', { name: /^edit$/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))

    expect(updateMutationState.mutate).toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Gagal menyimpan: HTTP 500')
    })
    // Modal stays open (still shows the Batal/Simpan buttons) rather than unmounting.
    expect(screen.getByRole('button', { name: /batal/i })).toBeInTheDocument()
  })
})

describe('WorkingProjectOrdersTab inline editing', () => {
  // Rows are sorted by customer (Ani first), so target wp1 by its order no.
  const wp1Row = () => within(screen.getByText('SN1').closest('tr') as HTMLElement)

  it('changing the status select PATCHes only status', async () => {
    render(<WorkingProjectOrdersTab />)
    fireEvent.change(wp1Row().getByLabelText('Status'), { target: { value: 'Proses' } })
    await waitFor(() =>
      expect(updateMutationState.mutateAsync).toHaveBeenCalledWith({ id: 'wp1', patch: { status: 'Proses' } }),
    )
  })
  it('click-to-edit customer saves on Enter and only when changed', async () => {
    render(<WorkingProjectOrdersTab />)
    fireEvent.click(wp1Row().getByLabelText('Ganti customer'))
    const input = screen.getByLabelText('customer')
    fireEvent.change(input, { target: { value: 'Budi S' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(updateMutationState.mutateAsync).toHaveBeenCalledWith({ id: 'wp1', patch: { customer: 'Budi S' } }),
    )
  })
  it('Escape cancels and unchanged blur does not save', () => {
    render(<WorkingProjectOrdersTab />)
    fireEvent.click(wp1Row().getByLabelText('Ganti customer'))
    fireEvent.change(screen.getByLabelText('customer'), { target: { value: 'X' } })
    fireEvent.keyDown(screen.getByLabelText('customer'), { key: 'Escape' })
    fireEvent.click(wp1Row().getByLabelText('Ganti produk'))
    fireEvent.blur(screen.getByLabelText('produk'))
    expect(updateMutationState.mutateAsync).not.toHaveBeenCalled()
  })
  it('shows an error banner and reverts when the save fails', async () => {
    updateMutationState.mutateAsync.mockRejectedValue(new Error('invalid_patch_value'))
    render(<WorkingProjectOrdersTab />)
    fireEvent.change(wp1Row().getByLabelText('Status'), { target: { value: 'Done' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal menyimpan status: invalid_patch_value')
    await waitFor(() => expect((wp1Row().getByLabelText('Status') as HTMLSelectElement).value).toBe('Open'))
  })
})

describe('WorkingProjectOrdersTab invoice link', () => {
  const wp1Row = () => within(screen.getByText('SN1').closest('tr') as HTMLElement)
  beforeEach(() => invoiceMocks.createAsync.mockReset())

  it('creates an invoice prefilled from the order and links it via quotationId', async () => {
    invoiceMocks.createAsync.mockResolvedValue({ id: 'q9' })
    render(<WorkingProjectOrdersTab />)
    fireEvent.click(wp1Row().getByRole('button', { name: /^Invoice SN1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Buat Invoice Baru' }))
    await waitFor(() => expect(updateMutationState.mutateAsync).toHaveBeenCalledWith({ id: 'wp1', patch: { quotationId: 'q9' } }))
    expect(invoiceMocks.createAsync).toHaveBeenCalledWith(expect.objectContaining({
      buyerNama: 'Budi',
      items: [expect.objectContaining({ namaProduk: 'Cincin (Emas)', qty: 1, hargaPerUnit: 150000 })],
    }))
  })

  it('links an existing invoice from the dropdown', async () => {
    render(<WorkingProjectOrdersTab />)
    fireEvent.click(wp1Row().getByRole('button', { name: /^Invoice SN1/ }))
    fireEvent.change(screen.getByLabelText('Pilih invoice'), { target: { value: 'q1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tautkan' }))
    await waitFor(() => expect(updateMutationState.mutateAsync).toHaveBeenCalledWith({ id: 'wp1', patch: { quotationId: 'q1' } }))
  })

})

describe('WorkingProjectOrdersTab Due Date filter and checklist summary', () => {
  it('filters rows to the Due Date range', () => {
    render(<WorkingProjectOrdersTab />)
    fireEvent.change(screen.getByLabelText('Due Date dari'), { target: { value: '2026-09-21' } })
    expect(screen.queryByText('SN1')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Due Date dari'), { target: { value: '2026-09-20' } })
    expect(screen.getByText('SN1')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Due Date sampai'), { target: { value: '2026-09-19' } })
    expect(screen.queryByText('SN1')).not.toBeInTheDocument()
  })

  it('shows a per-produk-dan-varian checklist progress breakdown that reflects the current filters', () => {
    render(<WorkingProjectOrdersTab />)
    const breakdownTable = within(screen.getByText('Progress per Produk & Varian').closest('table') as HTMLElement)
    const cincinRow = within(breakdownTable.getByText('Cincin').closest('tr') as HTMLElement)
    const cells = cincinRow.getAllByRole('cell')
    expect(cells[1].textContent).toBe('Emas')
    expect(cells[2].textContent).toBe('1/1') // Print Frame, done via wp1's checklist item
    expect(cells[3].textContent).toBe('0/0') // Print Stone, no matching checklist item
  })
})

describe('ordersToExportRows', () => {
  it('shapes each WP into a flat export row', () => {
    const rows = ordersToExportRows(projects as any)
    expect(rows[0]).toEqual({
      Customer: 'Budi', Kontak: '0812', Produk: 'Cincin', Variant: 'Emas', Platform: 'Shopee',
      'No. Order': 'SN1', 'Due Date': new Date('2026-09-20').toLocaleDateString('id-ID'),
      Status: 'Open', Payment: 'Marketplace', Nominal: 150000, Checklist: '1/1', Discord: 'https://discord.com/channels/123/t1',
    })
    expect(rows[1]).toMatchObject({ Customer: 'Ani', Kontak: '', 'No. Order': 'manual-1', Checklist: '0/0', Discord: '' })
  })
})
