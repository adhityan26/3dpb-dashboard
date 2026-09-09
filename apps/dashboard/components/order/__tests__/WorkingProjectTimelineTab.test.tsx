// @vitest-environment jsdom
import { vi } from 'vitest'

vi.mock('@/lib/hooks/use-working-projects', () => ({
  useWorkingProjects: () => ({
    data: [
      { id: 'wp1', title: 'Budi - Cincin', dueDate: '2026-09-20', status: 'Open' },
      { id: 'wp2', title: 'Ani - Topeng', dueDate: null, dueDateRaw: 'akhir bulan', status: 'Proses' },
    ],
    isLoading: false,
  }),
}))

import { render, screen } from '@testing-library/react'
import { WorkingProjectTimelineTab } from '../WorkingProjectTimelineTab'

describe('WorkingProjectTimelineTab', () => {
  it('groups entries with no parsed due date under Tanpa Tanggal', () => {
    render(<WorkingProjectTimelineTab />)
    expect(screen.getByText('Tanpa Tanggal')).toBeInTheDocument()
    expect(screen.getByText('Ani - Topeng')).toBeInTheDocument()
  })
  it('shows dated entries under their due date', () => {
    render(<WorkingProjectTimelineTab />)
    expect(screen.getByText('Budi - Cincin')).toBeInTheDocument()
  })
})
