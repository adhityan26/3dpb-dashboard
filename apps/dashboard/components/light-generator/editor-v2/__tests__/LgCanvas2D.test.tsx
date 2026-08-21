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

  it("renders the interactive overlay (image/casing/lamp objects) whenever onConfigChange is provided — no mode toggle", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        loading={false}
        config={{ floor_half_size: 600, outer_radius: 100, mask_padding_pct: 10, auto_fit_mask: false }}
        onConfigChange={() => {}}
      />,
    )
    expect(html).toContain('data-testid="lg-canvas-overlay"')
    expect(html).toContain('data-testid="lg-image-handle"')
    expect(html).toContain('data-testid="lg-casing-handle"')
    expect(html).toContain('data-testid="lg-lamp-handle"')
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
    expect(html).not.toContain('data-testid="lg-image-handle"')
    expect(html).not.toContain('data-testid="lg-casing-handle"')
  })

  it('shows the "Auto" chip when auto_fit_mask is true', () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        loading={false}
        config={{ auto_fit_mask: true }}
        onConfigChange={() => {}}
      />,
    )
    expect(html).toContain("Auto")
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

  it("renders the original image src instead of pngUrl when originalImageUrl is provided", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        originalImageUrl="/api/light-generator/orders/abc/silhouette"
        loading={false}
        config={{}}
        onConfigChange={() => {}}
      />,
    )
    expect(html).toContain('src="/api/light-generator/orders/abc/silhouette"')
    expect(html).not.toContain('src="/preview.png"')
  })

  it("applies the CSS filter built from config when originalImageUrl is used", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        originalImageUrl="/silhouette.png"
        loading={false}
        config={{ img_brightness: 20, img_contrast: 0, img_saturation: 100 }}
        onConfigChange={() => {}}
      />,
    )
    expect(html).toContain("brightness(1.2)")
  })

  it("does not apply a CSS filter when using pngUrl (no originalImageUrl)", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        loading={false}
        config={{ img_brightness: 20 }}
        onConfigChange={() => {}}
      />,
    )
    expect(html).not.toContain("filter:brightness")
    expect(html).not.toContain("filter: brightness")
  })

  it("renders the custom flooring image at the casing when flooring_shape is custom and flooringImageUrl is provided", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        loading={false}
        config={{ flooring_shape: "custom" }}
        flooringImageUrl="/api/light-generator/orders/abc/additional"
        onConfigChange={() => {}}
      />,
    )
    expect(html).toContain('href="/api/light-generator/orders/abc/additional"')
  })

  it("renders the zoom toolbar (in/out/fit/reset) in interactive mode", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D
        pngUrl="/preview.png"
        loading={false}
        config={{ floor_half_size: 600, outer_radius: 100 }}
        onConfigChange={() => {}}
      />,
    )
    expect(html).toContain('data-testid="lg-canvas-toolbar"')
    expect(html).toContain('aria-label="Zoom in"')
    expect(html).toContain('aria-label="Zoom out"')
    expect(html).toContain('aria-label="Fit view"')
    expect(html).toContain('aria-label="Reset view"')
  })

  it("omits the zoom toolbar in read-only mode", () => {
    const html = renderToStaticMarkup(
      <LgCanvas2D pngUrl="/preview.png" loading={false} config={{}} onConfigChange={() => {}} readOnly />,
    )
    expect(html).not.toContain('data-testid="lg-canvas-toolbar"')
  })
})
