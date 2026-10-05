// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
  // Real production shape: bulk-created from Shopee/Tokopedia with the size
  // captured into `variant` but notes left empty — parseSize must fall back
  // to the variant field, not just notes.
  {
    id: 'wp3', customer: 'Cici', product: 'Green Lantern Ring 2026 3D Print', variant: 'US 10.5', notes: '',
    status: 'Open', platform: 'Shopee', sourceOrderNo: 'SN3', orderNoLegacy: null,
    dueDate: null, orderDate: null, discordThreadUrl: null,
    appliedTags: ['Cincin'],
    checklist: [],
  },
  // variant field with just the bare number, no "US"/"size" token.
  {
    id: 'wp4', customer: 'Dedi', product: 'Green Lantern Ring 2026 3D Print', variant: '11', notes: '',
    status: 'Open', platform: 'Shopee', sourceOrderNo: 'SN4', orderNoLegacy: null,
    dueDate: null, orderDate: null, discordThreadUrl: null,
    appliedTags: ['Cincin'],
    checklist: [],
  },
  // Customer changed the size via chat: marketplace variant says US 5, the
  // admin's note says US 9 — notes must win, with the discrepancy flagged.
  {
    id: 'wp5', customer: 'Eko', product: 'Green Lantern Ring 2026 3D Print', variant: 'US 5', notes: 'ganti ukuran US 9 ya',
    status: 'Open', platform: 'Shopee', sourceOrderNo: 'SN5', orderNoLegacy: null,
    dueDate: null, orderDate: null, discordThreadUrl: null,
    appliedTags: ['Cincin'],
    checklist: [],
  },
  // Single-item order (single=true -> checklist labels are the plain step
  // names, e.g. "Print Frame", not "<variant> — Print Frame") — used to
  // exercise the per-part checklist summary with an unambiguous match.
  {
    id: 'wp6', customer: 'Fani', product: 'Green Lantern Ring 2026 3D Print', variant: 'US 7', notes: '',
    status: 'Open', platform: 'Shopee', sourceOrderNo: 'SN6', orderNoLegacy: null,
    dueDate: '2026-09-20', orderDate: null, discordThreadUrl: null,
    appliedTags: ['Cincin'],
    checklist: [{ id: 1, text: 'Print Frame', done: true, deleted: false }],
  },
  // No size anywhere (variant empty, notes empty) — exercises the "Tanpa Ukuran" filter.
  {
    id: 'wp7', customer: 'Gani', product: 'Green Lantern Ring 2026 3D Print', variant: null, notes: '',
    status: 'Open', platform: 'Shopee', sourceOrderNo: 'SN7', orderNoLegacy: null,
    dueDate: null, orderDate: null, discordThreadUrl: null,
    appliedTags: ['Cincin'],
    checklist: [],
  },
]


const invoiceMocks = vi.hoisted(() => ({ createAsync: vi.fn() }))
vi.mock('@/lib/hooks/use-invoice', () => ({
  useInvoiceList: () => ({ data: [{ id: 'q1', nomor: 'INV-1', buyerNama: 'Budi', status: 'SENT' }] }),
  useCreateInvoice: () => ({ mutateAsync: invoiceMocks.createAsync, isPending: false }),
}))

vi.mock('@/lib/hooks/use-working-projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/hooks/use-working-projects')>()
  return {
    ...actual,
    useWorkingProjects: () => ({ data: MOCK_PROJECTS, isLoading: false }),
    useGLRingProductIds: () => ({ data: [], isLoading: false }),
    // Real "Green Lantern 2026" model baseBoreMm from production, so scale%
    // assertions below match the real Ring Resizer formula's output.
    useGLRingBaseBoreMm: () => ({ data: 23.871, isLoading: false }),
  }
})
import { WorkingProjectGLRingTab, glRingRowsToExportRows } from '../WorkingProjectGLRingTab'
import { computeScale } from '@/lib/ring-resizer/sizing'

function renderWithClient(client = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...render(<WorkingProjectGLRingTab />, { wrapper }) }
}

// The "Progress per Produk & Ukuran" breakdown table repeats the same
// product/size text as the main data table, so plain screen.getByText
// queries for those become ambiguous — scope to the main table (always
// the last <table> on the page; the breakdown table renders above it).
function mainTable() {
  const tables = screen.getAllByRole('table')
  return within(tables[tables.length - 1])
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('WorkingProjectGLRingTab', () => {
  it('renders one row per ring variant, splitting comma-joined product names', () => {
    renderWithClient()
    expect(mainTable().getByText('Cincin A')).toBeInTheDocument()
    expect(mainTable().getByText('Cincin B')).toBeInTheDocument()
  })
  it('hides Canceled projects by default via the status filter', () => {
    renderWithClient()
    expect(mainTable().queryByText('Cincin C')).not.toBeInTheDocument()
  })

  it('falls back to the variant field for size when notes is empty (single-variant row)', () => {
    renderWithClient()
    expect(mainTable().getByText(/US 10\.5/)).toBeInTheDocument()
  })

  it('reads a bare-number variant field ("11", no US/size token) as the size', () => {
    renderWithClient()
    expect(mainTable().getByText(/US 11\b/)).toBeInTheDocument()
  })

  it('computes Scale % via the real Ring Resizer formula, not a fabricated lookup table', () => {
    // wp3 = US 10.5 with the mocked baseBoreMm (23.871mm, the real
    // "Green Lantern 2026" model figure) and the tab's fixed 0.3mm
    // clearance — this used to come from a hardcoded +3%-per-size table
    // that was simply wrong (e.g. claimed US 9 = 100%, real figure is 81%).
    const expectedPct = Math.round(
      computeScale({ mode: 'us', value: 10.5, clearanceMm: 0.3, baseBoreMm: 23.871 }).scaleCeil * 100,
    )
    renderWithClient()
    expect(screen.getByText(`${expectedPct}%`)).toBeInTheDocument()
  })

  it('shows a Canceled row once its status is re-checked in the status filter', () => {
    renderWithClient()
    fireEvent.click(screen.getByRole('button', { name: /status: 4 dipilih/i }))
    fireEvent.click(screen.getByLabelText('Canceled'))
    expect(mainTable().getByText('Cincin C')).toBeInTheDocument()
  })

  it('sorts Ukuran numerically, not as a string (found: "11" sorted before "7")', () => {
    renderWithClient()
    const sizeOrder = () => mainTable().getAllByText(/^US \d/).map(el => el.textContent?.match(/^US [\d.]+/)?.[0])
    fireEvent.click(mainTable().getByRole('columnheader', { name: /Ukuran/ }))
    expect(sizeOrder()).toEqual(['US 6', 'US 7', 'US 8', 'US 9', 'US 10.5', 'US 11'])
  })

  it('lists the Ukuran filter options in numeric order, with a "Tanpa Ukuran" choice up front', () => {
    renderWithClient()
    const select = screen.getByLabelText('Ukuran') as HTMLSelectElement
    const labels = Array.from(select.options).map(o => o.textContent)
    expect(labels.slice(0, 2)).toEqual(['Semua Ukuran', 'Tanpa Ukuran'])
    const sizes = labels.slice(2).map(Number)
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b)) // not the string order where "10" < "6"
    expect(labels).toContain('10.5')
  })

  it('"Tanpa Ukuran" keeps only rows without a resolvable size', () => {
    renderWithClient()
    expect(mainTable().getByText('SN3')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Ukuran'), { target: { value: '__tanpa-ukuran__' } })
    expect(mainTable().getByText('SN7')).toBeInTheDocument() // the row with no size
    expect(mainTable().queryByText('SN3')).not.toBeInTheDocument() // US 10.5 row is filtered out
  })

  it('cycles a header click asc -> desc -> unsorted', () => {
    renderWithClient()
    const sizeTexts = () => mainTable().getAllByText(/^US \d/).map(el => el.textContent)
    const header = mainTable().getByRole('columnheader', { name: /Ukuran/ })
    fireEvent.click(header) // asc
    expect(header.textContent).toContain('▲')
    expect(sizeTexts()[0]).toBe('US 6')
    fireEvent.click(header) // desc
    expect(header.textContent).toContain('▼')
    expect(sizeTexts()[0]).toBe('US 11')
    fireEvent.click(header) // removed
    expect(header.textContent).toContain('↕')
  })

  it('filters rows to the Due Date range', () => {
    renderWithClient()
    fireEvent.change(screen.getByLabelText('Due Date dari'), { target: { value: '2026-09-21' } })
    expect(mainTable().queryByText('Cincin A')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Due Date dari'), { target: { value: '2026-09-20' } })
    expect(mainTable().getByText('Cincin A')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Due Date sampai'), { target: { value: '2026-09-19' } })
    expect(mainTable().queryByText('Cincin A')).not.toBeInTheDocument()
  })

  it('the per-produk-dan-ukuran breakdown is collapsed by default and opens on click', () => {
    renderWithClient()
    expect(screen.getAllByRole('table')).toHaveLength(1) // just the main table
    fireEvent.click(screen.getByRole('button', { name: /Progress per Produk & Ukuran/ }))
    expect(screen.getAllByRole('table')).toHaveLength(2)
  })

  it('shows a per-produk-dan-ukuran checklist progress breakdown, grouped using the same tables as Jadwal Kirim', () => {
    renderWithClient()
    // Isolate wp6 (single-item order, "Print Frame" checklist item done).
    fireEvent.change(screen.getByPlaceholderText(/cari/i), { target: { value: 'SN6' } })
    fireEvent.click(screen.getByRole('button', { name: /Progress per Produk & Ukuran/ }))
    const breakdownTable = within(screen.getAllByRole('table')[0])
    // wp6's product "Green Lantern Ring 2026 3D Print" matches the default
    // "GL Ring 2026" group (keyword "gl"/"green lantern") — same grouping
    // Jadwal Kirim uses, not a raw per-product-name bucket.
    expect(breakdownTable.getByText('GL Ring 2026')).toBeInTheDocument()
    const row = within(breakdownTable.getByText('US 7').closest('tr') as HTMLElement)
    const cells = row.getAllByRole('cell')
    expect(cells[2].textContent).toBe('1/1✓ Pas') // Print Frame, done == total
    expect(cells[3].textContent).toBe('0/1-1') // Print Stone, still short by 1
    // Total column (now first) flags cetak/cat as a whole, not just Print Frame
    expect(cells[0].textContent).toContain('🖨️ Belum') // Print Stone/Ring not done yet
    expect(cells[0].textContent).toContain('🎨 Belum') // no Cat step done at all
  })
})

describe('WorkingProjectGLRingTab full parity', () => {
  it('parses per-variant size from the matching notes segment, not the same size for every row', () => {
    renderWithClient()
    expect(mainTable().getByText(/US 8/)).toBeInTheDocument()
    expect(mainTable().getByText(/US 6/)).toBeInTheDocument()
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

describe('WorkingProjectGLRingTab size precedence', () => {
  it('uses the size from notes over the variant field and flags the difference', () => {
    renderWithClient()
    const row = within(screen.getByText('SN5').closest('tr') as HTMLElement)
    expect(row.getByText(/^US 9/)).toBeInTheDocument()
    expect(row.getByLabelText('Berbeda dari variant: US 5')).toBeInTheDocument()
  })
  it('shows no marker when notes and variant agree or only one is present', () => {
    renderWithClient()
    const row = within(screen.getByText('SN3').closest('tr') as HTMLElement)
    expect(row.queryByLabelText(/Berbeda dari variant/)).not.toBeInTheDocument()
  })
})

describe('WorkingProjectGLRingTab inline editing', () => {
  // Default sort puts rows without a due date first, so target wp1 by order no.
  const wp1Row = () => within(screen.getAllByText('SN1')[0].closest('tr') as HTMLElement)

  it('changing a row status PATCHes /api/working-projects/:id with only status', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as unknown as typeof fetch
    renderWithClient()
    fireEvent.change(wp1Row().getByLabelText('Status'), { target: { value: 'Siap Kirim' } })
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/working-projects/wp1',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'Siap Kirim' }) }),
      )
    })
  })

  it('inline due date sends dueDateRaw as an ISO date', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as unknown as typeof fetch
    renderWithClient()
    fireEvent.click(wp1Row().getByLabelText('Ganti due date'))
    const input = screen.getByLabelText('due date')
    fireEvent.change(input, { target: { value: '2026-10-01' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/working-projects/wp1',
        expect.objectContaining({ body: JSON.stringify({ dueDateRaw: '2026-10-01' }) }),
      )
    })
  })

  it('the Edit button opens the existing edit popup for that order', () => {
    renderWithClient()
    fireEvent.click(screen.getAllByRole('button', { name: /^Edit SN1/ })[0])
    expect(screen.getByText('Edit Order')).toBeInTheDocument()
  })
})

describe('glRingRowsToExportRows', () => {
  it('shapes a ring row into a flat export row with a checklist column per step', () => {
    const row = {
      wpId: 'wp1', key: 'Cincin A', entry: 'Cincin A', customer: 'Budi', platform: 'Shopee', orderNo: 'SN1',
      dueDate: '2026-09-20T00:00:00.000Z', orderDate: '2026-09-01T00:00:00.000Z', status: 'Open',
      usSize: '9', variantUsSize: '5', scalePct: 90, discordThreadUrl: 'https://discord.com/x',
      checklistLabels: ['Print Frame', 'Print Stone', 'Print Ring', 'Cat Frame', 'Cat Stone', 'Cat Ring', 'Assembly'],
      checklistDone: {
        'Print Frame': true, 'Print Stone': false, 'Print Ring': false,
        'Cat Frame': false, 'Cat Stone': false, 'Cat Ring': false, 'Assembly': false,
      },
    }
    const exported = glRingRowsToExportRows([row as any])[0]
    expect(exported).toMatchObject({
      'No Order': 'SN1', Customer: 'Budi', Variant: 'Cincin A', Ukuran: 'US 9', 'Ukuran Variant (beda)': 'US 5',
      Scale: '90%', 'Print Frame': '✅', 'Print Stone': '', Progress: '1/7', Status: 'Open', Discord: 'https://discord.com/x',
    })
  })

  it('leaves size/scale/discrepancy columns blank when absent', () => {
    const row = {
      wpId: 'wp2', key: 'Cincin B', entry: 'Cincin B', customer: 'Ani', platform: null, orderNo: 'SN2',
      dueDate: null, orderDate: null, status: 'Canceled', usSize: null, variantUsSize: null, scalePct: null,
      discordThreadUrl: null, checklistLabels: [], checklistDone: {} as any,
    }
    const exported = glRingRowsToExportRows([row as any])[0]
    expect(exported).toMatchObject({ 'Due Date': '', 'Order Date': '', Ukuran: '', 'Ukuran Variant (beda)': '', Scale: '', Discord: '' })
  })
})
