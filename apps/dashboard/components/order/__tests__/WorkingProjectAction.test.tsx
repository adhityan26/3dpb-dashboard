// @vitest-environment jsdom
import { vi } from 'vitest'

const projects = [
  { id: 'wp1', sourceOrderNo: 'SN-OK', orderNoLegacy: null, discordThreadUrl: 'https://discord/t1', status: 'Open', customer: 'Budi' },
  { id: 'wp2', sourceOrderNo: 'SN-ERR', orderNoLegacy: null, discordThreadUrl: null, syncState: 'error', syncError: 'boom', status: 'Open', customer: 'Ani' },
  { id: 'wp3', sourceOrderNo: null, orderNoLegacy: 'LEGACY-1', discordThreadUrl: 'https://discord/t3', status: 'Proses', customer: 'Cici' },
]
vi.mock('@/lib/hooks/use-working-projects', () => ({
  WORKING_PROJECTS_KEY: ['working-projects'],
  useWorkingProjects: () => ({ data: projects, isLoading: false }),
}))

import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorkingProjectAction } from '../WorkingProjectAction'

function renderFor(orderNo: string) {
  const build = () => ({ source: 'shopee' as const, sourceOrderNo: orderNo, forumChannelId: 'x', customer: 'c', product: 'p' })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WorkingProjectAction orderNo={orderNo} buildInput={build} />
    </QueryClientProvider>,
  )
}

describe('WorkingProjectAction', () => {
  it('links to the Discord thread instead of offering create when a WP exists', () => {
    renderFor('SN-OK')
    expect(screen.getByRole('link', { name: /Lihat WP/ })).toHaveAttribute('href', 'https://discord/t1')
    expect(screen.queryByText(/Buat Working Project/)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('matches a WP by its legacy order number too', () => {
    renderFor('LEGACY-1')
    expect(screen.getByRole('link', { name: /Lihat WP/ })).toHaveAttribute('href', 'https://discord/t3')
  })

  it('offers a retry when the WP exists but its thread failed', () => {
    renderFor('SN-ERR')
    expect(screen.getByRole('button', { name: /coba ulang/ })).toBeInTheDocument()
    expect(screen.queryByText(/Buat Working Project/)).not.toBeInTheDocument()
  })

  it('shows the forum picker with readable labels and the create button when no WP exists', () => {
    renderFor('SN-NEW')
    expect(screen.getByText(/Buat Working Project/)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Topeng' })).toBeInTheDocument()
  })
})
