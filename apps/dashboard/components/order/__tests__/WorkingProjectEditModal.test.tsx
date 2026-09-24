// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { WorkingProjectEditModal } from '../WorkingProjectEditModal'
import type { WorkingProject } from '@/lib/hooks/use-working-projects'

const project: WorkingProject = {
  id: 'wp1',
  discordThreadId: 't1',
  discordThreadUrl: 'https://discord.com/channels/123/t1',
  forumChannelId: null,
  source: 'shopee',
  sourceOrderNo: 'SN1',
  orderNoLegacy: null,
  customer: 'Budi',
  contact: '0812',
  platform: 'Shopee',
  product: 'Cincin',
  variant: 'Emas',
  status: 'Open',
  payment: 'Marketplace',
  dueDate: null,
  dueDateRaw: '2026-09-20',
  invoiceAmount: 150000,
  checklist: [],
}

describe('WorkingProjectEditModal', () => {
  it('returns null when no project is given', () => {
    const { container } = render(
      <WorkingProjectEditModal project={null} onClose={vi.fn()} onSave={vi.fn()} isPending={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('prefills fields from the given project', () => {
    render(<WorkingProjectEditModal project={project} onClose={vi.fn()} onSave={vi.fn()} isPending={false} />)
    expect(screen.getByDisplayValue('Budi')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Cincin')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Emas')).toBeInTheDocument()
  })

  it('calls onSave with the edited patch', () => {
    const onSave = vi.fn()
    render(<WorkingProjectEditModal project={project} onClose={vi.fn()} onSave={onSave} isPending={false} />)
    fireEvent.change(screen.getByDisplayValue('Budi'), { target: { value: 'Budi Santoso' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wp1', patch: expect.objectContaining({ customer: 'Budi Santoso' }) }),
    )
  })

  it('does not include dueDateRaw in the patch when only an unrelated field changes and the due date was parsed (not raw)', () => {
    const onSave = vi.fn()
    const parsedDueDateProject: WorkingProject = {
      ...project,
      dueDate: '2026-09-20T00:00:00.000Z',
      dueDateRaw: null,
    }
    render(<WorkingProjectEditModal project={parsedDueDateProject} onClose={vi.fn()} onSave={onSave} isPending={false} />)
    fireEvent.change(screen.getByDisplayValue('Budi'), { target: { value: 'Budi Santoso' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wp1', patch: { customer: 'Budi Santoso' } }),
    )
    const patch = onSave.mock.calls[0][0].patch
    expect(patch).not.toHaveProperty('dueDateRaw')
  })

  it('prefills the Order Date field from project.orderDate', () => {
    render(
      <WorkingProjectEditModal
        project={{ ...project, orderDate: '2026-09-01T00:00:00.000Z' }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        isPending={false}
      />,
    )
    expect(screen.getByDisplayValue('2026-09-01')).toBeInTheDocument()
  })

  it('includes orderDateRaw in the patch when the Order Date field changes', () => {
    const onSave = vi.fn()
    render(
      <WorkingProjectEditModal
        project={{ ...project, orderDate: '2026-09-01T00:00:00.000Z' }}
        onClose={vi.fn()}
        onSave={onSave}
        isPending={false}
      />,
    )
    fireEvent.change(screen.getByDisplayValue('2026-09-01'), { target: { value: '2026-09-05' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wp1', patch: { orderDateRaw: '2026-09-05' } }),
    )
  })

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn()
    render(<WorkingProjectEditModal project={project} onClose={onClose} onSave={vi.fn()} isPending={false} />)
    fireEvent.click(screen.getByRole('button', { name: /batal/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('disables save while pending', () => {
    render(<WorkingProjectEditModal project={project} onClose={vi.fn()} onSave={vi.fn()} isPending={true} />)
    expect(screen.getByRole('button', { name: /menyimpan/i })).toBeDisabled()
  })

  it('shows a visible error message when a save attempt failed', () => {
    render(
      <WorkingProjectEditModal
        project={project}
        onClose={vi.fn()}
        onSave={vi.fn()}
        isPending={false}
        error="Gagal menyimpan: HTTP 500"
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Gagal menyimpan: HTTP 500')
  })

  it('renders no error message when there is none', () => {
    render(<WorkingProjectEditModal project={project} onClose={vi.fn()} onSave={vi.fn()} isPending={false} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('has a Status select prefilled and includes only status in the patch when changed', () => {
    const onSave = vi.fn()
    render(<WorkingProjectEditModal project={project} onClose={vi.fn()} onSave={onSave} isPending={false} />)
    const select = screen.getByLabelText('Status') as HTMLSelectElement
    expect(select.value).toBe('Open')
    fireEvent.change(select, { target: { value: 'Done' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan/i }))
    expect(onSave).toHaveBeenCalledWith({ id: 'wp1', patch: { status: 'Done' } })
  })
})
