import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { LgWallCanvas } from "../LgWallCanvas"

describe("LgWallCanvas", () => {
  it("renders the empty state when no preview yet, without crashing on SSR", () => {
    const html = renderToStaticMarkup(
      <LgWallCanvas pngUrl={null} loading={false} config={{}} onConfigChange={() => {}} />,
    )
    expect(html).toContain("Belum ada preview")
  })

  it("renders the img when pngUrl is set", () => {
    const html = renderToStaticMarkup(
      <LgWallCanvas pngUrl="/wall.png" loading={false} config={{}} onConfigChange={() => {}} />,
    )
    expect(html).toContain("wall.png")
    expect(html).toContain('alt="Wall unwrap preview"')
  })

  it("shows a retry affordance instead of the idle text when error is true and pngUrl is null", () => {
    const html = renderToStaticMarkup(
      <LgWallCanvas pngUrl={null} loading={false} config={{}} onConfigChange={() => {}} error onRetry={() => {}} />,
    )
    expect(html).not.toContain("Belum ada preview")
    expect(html).toContain("Coba lagi")
  })

  it("shows the updating badge while loading", () => {
    const html = renderToStaticMarkup(
      <LgWallCanvas pngUrl="/wall.png" loading={true} config={{}} onConfigChange={() => {}} />,
    )
    expect(html).toContain("updating")
  })

  it("shows the stem count chip", () => {
    const html = renderToStaticMarkup(
      <LgWallCanvas
        pngUrl="/wall.png"
        loading={false}
        config={{ user_stems: [{ id: "a", theta_deg: 1, z_mm: 2 }, { id: "b", theta_deg: 3, z_mm: 4 }] }}
        onConfigChange={() => {}}
      />,
    )
    expect(html).toContain("2 stems")
  })

  it("shows 0 stems and disables the anchor button when config has no stems/islands", () => {
    const html = renderToStaticMarkup(
      <LgWallCanvas pngUrl="/wall.png" loading={false} config={{}} onConfigChange={() => {}} />,
    )
    expect(html).toContain("0 stems")
    const btnMatch = html.match(/<button[^>]*>Anchor all islands<\/button>/)
    expect(btnMatch?.[0]).toContain("disabled")
  })

  it("enables the anchor button when islands are present", () => {
    const html = renderToStaticMarkup(
      <LgWallCanvas
        pngUrl="/wall.png"
        loading={false}
        config={{}}
        onConfigChange={() => {}}
        islands={[{ theta_deg: 10, z_mm: 20 }]}
      />,
    )
    const btnMatch = html.match(/<button[^>]*>Anchor all islands<\/button>/)
    expect(btnMatch).not.toBeNull()
    expect(btnMatch?.[0]).not.toMatch(/\sdisabled(="")?[\s>]/)
  })

  it("shows the interaction hint text", () => {
    const html = renderToStaticMarkup(
      <LgWallCanvas pngUrl="/wall.png" loading={false} config={{}} onConfigChange={() => {}} />,
    )
    expect(html).toContain("Klik untuk pasang stem")
  })
})
