import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LgEditorShell } from '../LgEditorShell'

describe('LgEditorShell', () => {
  it('renders top bar, tabs, status strip, and stale badge when stale', () => {
    const html = renderToStaticMarkup(
      <LgEditorShell
        orderId="LG-1"
        customerName="Budi"
        status="paid"
        saveStatus="saved"
        savedAt={null}
        isStale={true}
        estimate={{ weight: "48 g", height: "40 mm" }}
        preview={{ latencyMs: 1200, islands: { hasFloating: false } }}
        activeTab="shadow"
        onTabChange={() => {}}
        onGenerate={() => {}}
        generating={false}
        inspector={<div>INSPECTOR</div>}
        canvas={<div>CANVAS</div>}
        rail={<div>RAIL</div>}
      />)
    expect(html).toContain('LG-1')
    expect(html).toContain('Shadow')
    expect(html).toContain('Wall')
    expect(html).toContain('3D')
    expect(html).toContain('STL stale')
    expect(html).toContain('INSPECTOR')
    expect(html).toContain('CANVAS')
    expect(html).toContain('48 g')
  })
  it('no stale badge when not stale', () => {
    const html = renderToStaticMarkup(
      <LgEditorShell orderId="LG-1" customerName="B" status="paid" saveStatus="idle" savedAt={null}
        isStale={false} estimate={null} preview={{ latencyMs: null, islands: null }}
        activeTab="shadow" onTabChange={() => {}} onGenerate={() => {}} generating={false}
        inspector={null} canvas={null} rail={null} />)
    expect(html).not.toContain('STL stale')
  })
})
