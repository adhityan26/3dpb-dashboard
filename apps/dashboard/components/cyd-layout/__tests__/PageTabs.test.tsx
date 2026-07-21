// components/cyd-layout/__tests__/PageTabs.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageTabs } from '../PageTabs'
import type { LayoutPageOut } from '@/lib/cyd-layout/types'

function page(id: string): LayoutPageOut {
  return { id, grid: { cols: 1, rows: 1 }, fields: [['name']], durationSec: 0, cells: [] }
}

describe('PageTabs', () => {
  it('render satu tab per halaman', () => {
    const html = renderToStaticMarkup(
      <PageTabs pages={[page('rack'), page('detail-1')]} activeIndex={0} onSelect={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} onReorder={vi.fn()} />
    )
    expect(html).toContain('rack')
    expect(html).toContain('detail-1')
  })

  it('render tombol tambah halaman', () => {
    const html = renderToStaticMarkup(
      <PageTabs pages={[page('rack')]} activeIndex={0} onSelect={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} onReorder={vi.fn()} />
    )
    expect(html).toContain('+ Halaman')
  })
})
