import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LgConfigEditor } from '../LgConfigEditor'

function render(config: Record<string, unknown>) {
  return renderToStaticMarkup(
    <LgConfigEditor orderId="test" customerConfig={config} operatorConfig={null} />
  )
}

describe('LgConfigEditor cover type', () => {
  it('bottom (default): renders pillar section, hides recess section', () => {
    const html = render({})
    expect(html).toContain('Cover type')
    expect(html).toContain('Pillar outer radius')
    expect(html).toContain('Invert shadow')
    expect(html).not.toContain('Recess radius')
  })

  it('top: renders recess section, hides pillar section', () => {
    const html = render({ cover_type: 'top' })
    expect(html).toContain('Recess radius')
    expect(html).toContain('Recess depth')
    expect(html).not.toContain('Pillar outer radius')
    expect(html).not.toContain('Cable channel radius')
  })
})

describe('LgConfigEditor bottom frame', () => {
  it('off by default: renders the toggle but hides the height control', () => {
    const html = render({})
    expect(html).toContain('Bottom frame')
    expect(html).not.toContain('Bottom frame height')
  })

  it('enabled: renders the height control', () => {
    const html = render({ bottom_frame: true })
    expect(html).toContain('Bottom frame height')
  })
})
