// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/hooks/use-working-projects', () => ({
  useWorkingProjects: () => ({
    data: [
      { id: 'wp1', customer: 'Budi', product: 'Cincin A, Cincin B', notes: 'size US 8 | catatan', status: 'Open', forumChannelId: 'FORUM_CINCIN_ID', appliedTags: [], checklist: [] },
      { id: 'wp2', customer: 'Ani', product: 'Cincin C', notes: 'size US 6', status: 'Canceled', forumChannelId: 'FORUM_CINCIN_ID', appliedTags: [], checklist: [] },
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
  it('shows the parsed US size and scale percentage', () => {
    render(<WorkingProjectGLRingTab />)
    expect(screen.getAllByText(/US 8/).length).toBeGreaterThan(0)
  })
})
