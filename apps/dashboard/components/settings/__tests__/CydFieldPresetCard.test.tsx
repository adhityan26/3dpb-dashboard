import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CydFieldPresetCard } from '../CydFieldPresetCard'
import type { CydFieldPresetData } from '@/lib/cyd-layout/field-preset-service'

function renderWithPresets(presets: CydFieldPresetData[] | undefined) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (presets !== undefined) {
    qc.setQueryData(['cyd-field-presets'], presets)
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <CydFieldPresetCard />
    </QueryClientProvider>
  )
}

describe('CydFieldPresetCard', () => {
  it('render daftar preset dari query cache', () => {
    const html = renderWithPresets([
      { id: '1', name: 'Ringkas', fields: [['name']] } as CydFieldPresetData,
    ])
    expect(html).toContain('Ringkas')
  })

  it('render pesan kosong saat belum ada preset', () => {
    const html = renderWithPresets([])
    expect(html).toContain('Belum ada preset.')
  })

  it('render indikator loading saat data belum ada di cache', () => {
    const html = renderWithPresets(undefined)
    expect(html).toContain('Memuat')
  })

  it('render form builder dengan tombol simpan preset', () => {
    const html = renderWithPresets([])
    expect(html).toContain('Simpan preset')
    expect(html).toContain('Nama preset')
  })
})
