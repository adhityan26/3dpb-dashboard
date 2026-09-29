// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const MOCK_PROJECTS = [
  {
    id: 'wp1', customer: 'Budi', product: 'Green Lantern Ring 2026 3D Print', variant: 'US 9', notes: '',
    status: 'Open', platform: 'Shopee', sourceOrderNo: 'SN1', orderNoLegacy: null,
    dueDate: new Date().toISOString(), discordThreadUrl: 'https://discord.com/x',
    appliedTags: ['Cincin'], shipping: 'Anteraja', checklist: [],
  },
  {
    id: 'wp2', customer: 'Ani', product: 'Topeng Dr Doom', variant: 'Merah', notes: '',
    status: 'Open', platform: 'Shopee', sourceOrderNo: 'SN2', orderNoLegacy: null,
    dueDate: new Date().toISOString(), discordThreadUrl: null,
    appliedTags: [], shipping: 'JNE', checklist: [],
  },
  {
    id: 'wp3', customer: 'Cici', product: 'Green Lantern Ring 2026 3D Print', variant: null, notes: '',
    status: 'Done', platform: 'Shopee', sourceOrderNo: 'SN3', orderNoLegacy: null,
    dueDate: new Date().toISOString(), discordThreadUrl: null,
    appliedTags: ['Cincin'], shipping: 'Anteraja', checklist: [],
  },
]

vi.mock('@/lib/hooks/use-working-projects', () => ({
  useWorkingProjects: () => ({ data: MOCK_PROJECTS, isLoading: false }),
  useGLRingProductIds: () => ({ data: [], isLoading: false }),
  useCategoryProductIds: () => ({ data: [], isLoading: false }),
  useFastCouriers: () => ({ data: ['anteraja'], isLoading: false }),
  useShippingTableGroups: () => ({ data: undefined, isLoading: false }),
}))

import { WorkingProjectShippingScheduleTab } from '../WorkingProjectShippingScheduleTab'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('WorkingProjectShippingScheduleTab', () => {
  it('renders one pivot table per cincin product and one per other category, hiding Done by default', () => {
    render(<WorkingProjectShippingScheduleTab />)
    expect(screen.getByText('GL Ring 2026')).toBeInTheDocument()
    expect(screen.getAllByText('Topeng').length).toBeGreaterThan(0)
  })

  it('shows a due-date column with today\'s data given the default date range', () => {
    render(<WorkingProjectShippingScheduleTab />)
    // The default range includes today, so at least one row from wp1 should be counted (Total column shows 1).
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('the category pill total reflects visible (non-Done) rows only', () => {
    render(<WorkingProjectShippingScheduleTab />)
    const cincinPill = screen.getByRole('button', { name: 'Filter kategori Cincin' })
    expect(cincinPill).toHaveTextContent('1') // wp1 only, wp3 is Done and hidden by default
  })

  it('clicking a category pill filters the table list', () => {
    render(<WorkingProjectShippingScheduleTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Filter kategori Topeng' }))
    expect(screen.queryByText('GL Ring 2026')).not.toBeInTheDocument()
    expect(screen.getAllByText('Topeng').length).toBeGreaterThan(0)
  })

  it('toggling "pisahkan kurir" splits each date column into cepat/reguler sub-headers', () => {
    render(<WorkingProjectShippingScheduleTab />)
    expect(screen.queryByText('🚀')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/Pisahkan kurir/))
    expect(screen.getAllByText('🚀').length).toBeGreaterThan(0)
  })

  it('shows an empty state when the date range excludes every row', () => {
    render(<WorkingProjectShippingScheduleTab />)
    fireEvent.change(screen.getByLabelText('Dari tanggal'), { target: { value: '2020-01-01' } })
    fireEvent.change(screen.getByLabelText('Sampai tanggal'), { target: { value: '2020-01-02' } })
    expect(screen.getByText(/Tidak ada order yang cocok/)).toBeInTheDocument()
  })
})
