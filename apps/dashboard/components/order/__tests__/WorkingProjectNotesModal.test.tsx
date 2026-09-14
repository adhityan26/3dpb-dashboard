// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const project = {
  id: 'wp1', customer: 'Budi', contact: null, product: 'Cincin', variant: null,
  platform: 'Shopee', sourceOrderNo: 'SN1', orderNoLegacy: null, dueDate: null,
  status: 'Open', payment: 'Marketplace', invoiceAmount: 0,
  notes: 'Catatan lama',
  appliedTags: ['Cincin'],
  mentions: ['111'],
  checklist: [
    { id: 1, text: 'Print Frame', done: true, deleted: false },
    { id: 2, text: 'Print Stone', done: false, deleted: false },
  ],
  discordThreadId: 't1',
  discordThreadUrl: null,
}

const updateMutate = vi.fn()
const checklistMutate = vi.fn()

vi.mock('@/lib/hooks/use-working-projects', () => ({
  useUpdateWorkingProject: () => ({ mutate: updateMutate, isPending: false }),
  useChecklistOp: () => ({ mutate: checklistMutate, isPending: false }),
}))

import { WorkingProjectNotesModal } from '../WorkingProjectNotesModal'

beforeEach(() => {
  updateMutate.mockReset()
  checklistMutate.mockReset()
})

describe('WorkingProjectNotesModal', () => {
  it('renders nothing when project is null', () => {
    const { container } = render(<WorkingProjectNotesModal project={null} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('pre-fills notes, tags and PIC from the project', () => {
    render(<WorkingProjectNotesModal project={project as any} onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('Catatan lama')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Cincin')).toBeInTheDocument()
    expect(screen.getByDisplayValue('111')).toBeInTheDocument()
  })

  it('saves notes via useUpdateWorkingProject with a direct notes patch (not append)', () => {
    render(<WorkingProjectNotesModal project={project as any} onClose={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('Catatan lama'), { target: { value: 'Catatan baru' } })
    fireEvent.click(screen.getByRole('button', { name: /simpan notes/i }))
    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'wp1', patch: { notes: 'Catatan baru' } },
      expect.anything(),
    )
  })

  it('saves tags as a parsed array split on commas', () => {
    render(<WorkingProjectNotesModal project={project as any} onClose={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('Cincin'), { target: { value: 'Cincin, Urgent' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^simpan$/i })[0])
    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'wp1', patch: { appliedTags: ['Cincin', 'Urgent'] } },
      expect.anything(),
    )
  })

  it('saves PIC as a parsed array split on commas', () => {
    render(<WorkingProjectNotesModal project={project as any} onClose={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('111'), { target: { value: '111, 222' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^simpan$/i })[1])
    expect(updateMutate).toHaveBeenCalledWith(
      { id: 'wp1', patch: { mentions: ['111', '222'] } },
      expect.anything(),
    )
  })

  it('toggles a checklist item via useChecklistOp', () => {
    render(<WorkingProjectNotesModal project={project as any} onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Print Stone'))
    expect(checklistMutate).toHaveBeenCalledWith(
      { id: 'wp1', op: { type: 'check', id: 2, by: 'dashboard' } },
      expect.anything(),
    )
  })

  it('adds a new checklist item', () => {
    render(<WorkingProjectNotesModal project={project as any} onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/tambah item checklist/i), { target: { value: 'Packing' } })
    fireEvent.click(screen.getByRole('button', { name: /^tambah$/i }))
    expect(checklistMutate).toHaveBeenCalledWith(
      { id: 'wp1', op: { type: 'add', text: 'Packing', addedBy: 'dashboard' } },
      expect.anything(),
    )
  })

  it('removes a checklist item', () => {
    render(<WorkingProjectNotesModal project={project as any} onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Hapus Print Frame'))
    expect(checklistMutate).toHaveBeenCalledWith(
      { id: 'wp1', op: { type: 'remove', id: 1, by: 'dashboard' } },
      expect.anything(),
    )
  })

  it('reorders checklist items via drag and drop', () => {
    render(<WorkingProjectNotesModal project={project as any} onClose={vi.fn()} />)
    const rows = screen.getByLabelText('Print Frame').closest('div')!.parentElement!.parentElement!
    const items = rows.querySelectorAll('[draggable="true"]')
    fireEvent.dragStart(items[1])
    fireEvent.dragOver(items[0])
    fireEvent.drop(items[0])
    expect(checklistMutate).toHaveBeenCalledWith(
      { id: 'wp1', op: { type: 'reorder', orderedIds: [2, 1] } },
      expect.anything(),
    )
  })

  it('shows a placeholder when there is no checklist yet', () => {
    render(<WorkingProjectNotesModal project={{ ...project, checklist: [] } as any} onClose={vi.fn()} />)
    expect(screen.getByText(/belum ada checklist item/i)).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<WorkingProjectNotesModal project={project as any} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Tutup'))
    expect(onClose).toHaveBeenCalled()
  })
})
