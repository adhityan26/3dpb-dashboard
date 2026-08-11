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

  it("renders the interactive overlay (rings/handles) whenever onConfigChange is provided — no mode toggle", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        loading={false}
        config={{ floor_half_size: 600, mask_padding_pct: 10, auto_fit_mask: false }}
        onConfigChange={() => {}}
      />,
    )
    expect(html).toContain('data-testid="lg-canvas-overlay"')
    expect(html).toContain('data-testid="lg-floor-handle"')
    expect(html).toContain('data-testid="lg-padding-handle"')
    expect(html).not.toContain(">Edit<")
  })

  it("readOnly suppresses the overlay even when onConfigChange is provided — used by the Shadow preview card", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        loading={false}
        config={{ floor_half_size: 600, mask_padding_pct: 10, auto_fit_mask: false }}
        onConfigChange={() => {}}
        readOnly
      />,
    )
    expect(html).not.toContain('data-testid="lg-canvas-overlay"')
    expect(html).not.toContain('data-testid="lg-floor-handle"')
    expect(html).not.toContain('data-testid="lg-padding-handle"')
  })

  it('shows the "Auto" chip and ghosts the padding ring when auto_fit_mask is true', () => {
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

  it("shows a retry affordance instead of the idle text when error is true and pngUrl is still null", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D pngUrl={null} loading={false} error onRetry={() => {}} />,
    )
    expect(html).not.toContain("Belum ada preview")
    expect(html).toContain("Coba lagi")
  })

  it("omits the retry button when no onRetry handler is passed, even on error", () => {
    const html = renderToStaticMarkup(<LgCanvas2D pngUrl={null} loading={false} error />)
    expect(html).not.toContain("Coba lagi")
  })

  it("dims the backdrop image when dimBackdrop is set", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D pngUrl="/preview.png" loading={false} dimBackdrop />,
    )
    expect(html).toContain("opacity-80")
  })
})
