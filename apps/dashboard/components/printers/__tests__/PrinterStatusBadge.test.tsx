import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PrinterStatusBadge } from '../PrinterStatusBadge'

describe('PrinterStatusBadge', () => {
  it('state null -> tampilkan "Offline", warna dim', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state={null} />)
    expect(html).toContain('Offline')
    expect(html).toContain('rgb(156,154,152)')
  })

  it('RUNNING -> hijau', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state="running" />)
    expect(html).toContain('#00ff88')
  })

  it('ERROR -> merah', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state="error" />)
    expect(html).toContain('#ff0000')
  })

  it('FINISH -> biru rgb(0,160,255)', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state="finish" />)
    expect(html).toContain('rgb(0,160,255)')
  })

  it('PAUSE -> kuning', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state="pause" />)
    expect(html).toContain('#ffaa00')
  })

  it('state tak dikenal -> dim (default)', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state="unknown_state" />)
    expect(html).toContain('rgb(156,154,152)')
  })
})
