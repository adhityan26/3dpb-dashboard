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

describe('LgConfigEditor raw JSON editor', () => {
  it('renders the Edit raw JSON toggle', () => {
    const html = render({})
    expect(html).toContain('Edit raw JSON')
  })
})

describe('LgConfigEditor custom flooring shape', () => {
  // Note: Radix Select's option labels and current-value text are not present
  // in renderToStaticMarkup output (SelectContent is portal-based and
  // SelectValue resolves at runtime), so shape-selection coverage below goes
  // through the config-driven side effects (hint text, upload control)
  // instead of asserting on SHAPE_OPTIONS label text directly.

  it('non-custom shape: hides the flooring image upload control', () => {
    const html = render({ flooring_shape: 'circle' })
    expect(html).not.toContain('Hitam = footprint casing')
  })

  it('custom shape: shows the upload control and hint, hides ratio inputs', () => {
    const html = render({ flooring_shape: 'custom' })
    expect(html).toContain('Hitam = footprint casing')
    expect(html).toContain('Order customer dengan floor insert image sudah otomatis terisi')
    expect(html).not.toContain('W ratio')
    expect(html).not.toContain('H ratio')
  })

  it('custom shape without hasFlooringImage: shows the missing-image hint', () => {
    const html = render({ flooring_shape: 'custom' })
    expect(html).toContain('Belum ada gambar flooring untuk order ini')
    expect(html).not.toContain('gambar flooring tersedia')
  })

  it('custom shape with hasFlooringImage: shows the available checkmark', () => {
    const html = renderToStaticMarkup(
      <LgConfigEditor
        orderId="test"
        customerConfig={{ flooring_shape: 'custom' }}
        operatorConfig={null}
        hasFlooringImage
      />
    )
    expect(html).toContain('✓ gambar flooring tersedia')
  })
})

describe('LgConfigEditor auto-fit mask', () => {
  it('renders the auto-fit silhouette toggle', () => {
    const html = render({})
    expect(html).toContain('Auto-fit silhouette')
  })
})

describe('LgConfigEditor manual mask padding', () => {
  it('renders the mask padding field', () => {
    const html = render({})
    expect(html).toContain('Mask padding')
  })
})
