import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Lg3DViewerShell } from "../Lg3DViewer"

// r3f's Canvas needs WebGL/a real browser and the repo's vitest environment
// is 'node' (not jsdom, see LgConfigEditor.test.tsx's same pattern), so these
// tests render the SSR-safe shell to a static HTML string and assert on
// substrings — the same split canvas-math.ts's tests use for pure logic vs.
// DOM-dependent rendering.
describe("Lg3DViewerShell", () => {
  it("shows the empty-state placeholder when there is no STL", () => {
    const html = renderToStaticMarkup(<Lg3DViewerShell hasStl={false}>{null}</Lg3DViewerShell>)
    expect(html).toContain("Belum ada STL")
  })

  it("hides the empty-state placeholder once an STL is present", () => {
    const html = renderToStaticMarkup(<Lg3DViewerShell hasStl>{null}</Lg3DViewerShell>)
    expect(html).not.toContain("Belum ada STL")
  })

  it("shows a stale badge when stale is true", () => {
    const html = renderToStaticMarkup(
      <Lg3DViewerShell hasStl stale>
        {null}
      </Lg3DViewerShell>,
    )
    expect(html).toContain("STL stale")
  })

  it("omits the stale badge by default", () => {
    const html = renderToStaticMarkup(<Lg3DViewerShell hasStl>{null}</Lg3DViewerShell>)
    expect(html).not.toContain("STL stale")
  })

  it("shows the interaction hint overlay", () => {
    const html = renderToStaticMarkup(<Lg3DViewerShell hasStl>{null}</Lg3DViewerShell>)
    expect(html).toContain("Left-drag: rotate")
  })

  it("renders a fullscreen toggle button", () => {
    const html = renderToStaticMarkup(<Lg3DViewerShell hasStl>{null}</Lg3DViewerShell>)
    expect(html).toContain("Fullscreen")
  })

  it("renders children (the Canvas slot)", () => {
    const html = renderToStaticMarkup(
      <Lg3DViewerShell hasStl>
        <div data-testid="canvas-slot" />
      </Lg3DViewerShell>,
    )
    expect(html).toContain("canvas-slot")
  })
})
