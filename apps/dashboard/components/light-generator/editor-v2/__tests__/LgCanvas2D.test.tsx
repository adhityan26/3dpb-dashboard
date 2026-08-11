import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { LgCanvas2D } from "../LgCanvas2D"

describe("LgCanvas2D", () => {
  it("renders the empty state when no preview yet, without crashing on SSR", () => {
    const html = renderToStaticMarkup(<LgCanvas2D pngUrl={null} loading={false} />)
    expect(html).toContain("Belum ada preview")
  })

  it("renders plain (non-interactive) when onConfigChange is omitted, even with a pngUrl", () => {
    const html = renderToStaticMarkup(<LgCanvas2D pngUrl="/preview.png" loading={false} />)
    expect(html).not.toContain('data-testid="lg-canvas-overlay"')
  })

  it("renders no ring/handle overlay by default (edit mode off) even with config + onConfigChange", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        loading={false}
        config={{ floor_half_size: 600, mask_padding_pct: 10, auto_fit_mask: false }}
        onConfigChange={() => {}}
      />,
    )
    expect(html).not.toContain('data-testid="lg-canvas-overlay"')
    expect(html).not.toContain('data-testid="lg-floor-handle"')
    expect(html).not.toContain('data-testid="lg-padding-handle"')
    expect(html).toContain(">Edit<")
  })

  it("renders the interactive overlay (floor ring handle) when defaultEditMode forces edit mode on", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        loading={false}
        config={{ floor_half_size: 600, mask_padding_pct: 10, auto_fit_mask: false }}
        onConfigChange={() => {}}
        defaultEditMode
      />,
    )
    expect(html).toContain('data-testid="lg-canvas-overlay"')
    expect(html).toContain('data-testid="lg-floor-handle"')
    expect(html).toContain('data-testid="lg-padding-handle"')
  })

  it('shows the "Auto" chip and ghosts the padding ring when auto_fit_mask is true (info chip is independent of edit mode)', () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        loading={false}
        config={{ auto_fit_mask: true }}
        onConfigChange={() => {}}
      />,
    )
    expect(html).toContain("Auto")
    // no padding handles rendered while auto-fit is active
    expect(html).not.toContain('data-testid="lg-padding-handle"')
  })

  it("shows the updating badge while loading", () => {
    const html = renderToStaticMarkup(<LgCanvas2D pngUrl="/preview.png" loading={true} />)
    expect(html).toContain("updating")
  })
})
