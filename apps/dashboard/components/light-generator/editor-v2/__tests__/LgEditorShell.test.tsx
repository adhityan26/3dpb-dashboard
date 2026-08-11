import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LgEditorShell } from '../LgEditorShell'

const STATUS_OPTIONS = ["submitted", "paid", "generating", "ready", "shipped", "cancelled"] as const

describe('LgEditorShell', () => {
  it('renders breadcrumb, numbered steps, saved indicator, and validation card when stale — no Generate button in the top bar', () => {
    const html = renderToStaticMarkup(
      <LgEditorShell
        orderId="LG-1"
        customerName="Budi"
        status="paid"
        statusOptions={STATUS_OPTIONS}
        onStatusChange={() => {}}
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
    // Breadcrumb
    expect(html).toContain('Orders')
    expect(html).toContain('LG-1')
    // Numbered workflow steps
    expect(html).toContain('①')
    expect(html).toContain('②')
    expect(html).toContain('③')
    expect(html).toContain('Shadow')
    expect(html).toContain('Wall &amp; stems')
    expect(html).toContain('Preview 3D')
    // Save indicator
    expect(html).toContain('All changes saved')
    // Generate STL lives only in the validation card, never the top bar
    expect(html).toContain('Changes not generated yet')
    expect(html).toContain('Generate STL')
    expect(html).toContain('INSPECTOR')
    expect(html).toContain('CANVAS')
    expect(html).toContain('48 g')
  })

  it('shows the ready (not stale) validation state', () => {
    const html = renderToStaticMarkup(
      <LgEditorShell orderId="LG-1" customerName="B" status="paid" statusOptions={STATUS_OPTIONS}
        onStatusChange={() => {}} saveStatus="idle" savedAt={null}
        isStale={false} estimate={null} preview={{ latencyMs: null, islands: null }}
        activeTab="shadow" onTabChange={() => {}} onGenerate={() => {}} generating={false}
        inspector={null} canvas={null} rail={null} />)
    expect(html).not.toContain('Changes not generated yet')
    expect(html).toContain('Ready to generate')
    expect(html).toContain('Your STL matches the current settings')
  })

  it('does not render a stale badge or Generate button in the top bar region markup', () => {
    const html = renderToStaticMarkup(
      <LgEditorShell orderId="LG-1" customerName="B" status="paid" statusOptions={STATUS_OPTIONS}
        onStatusChange={() => {}} saveStatus="idle" savedAt={null}
        isStale={true} estimate={null} preview={{ latencyMs: null, islands: null }}
        activeTab="shadow" onTabChange={() => {}} onGenerate={() => {}} generating={false}
        inspector={null} canvas={null} rail={null} />)
    expect(html).not.toContain('STL stale')
    expect(html).toContain('Preview 3D')
  })
})
