import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { LgInspector } from "../LgInspector"

describe("LgInspector", () => {
  it("renders the v2 group titles and the search input", () => {
    const html = renderToStaticMarkup(<LgInspector config={{}} onChange={() => {}} />)
    expect(html).toContain("Casing")
    expect(html).toContain("Shadow behavior")
    expect(html).toContain("Dimensions")
    expect(html).toContain("Lighting")
    expect(html).toContain("Advanced")
    expect(html).toContain("search parameter")
    expect(html).toContain("Raw JSON")
  })

  it("renders a unit chip next to a mm-valued param", () => {
    const html = renderToStaticMarkup(<LgInspector config={{}} onChange={() => {}} />)
    expect(html).toContain(">mm<")
  })

  it("shows help text via a native title tooltip instead of an inline paragraph", () => {
    const html = renderToStaticMarkup(<LgInspector config={{}} onChange={() => {}} />)
    expect(html).toContain("title=\"Radius of the casing wall\"")
  })

  it("cover top shows recess params, cover bottom shows pillar params, in the Casing group", () => {
    const top = renderToStaticMarkup(<LgInspector config={{ cover_type: "top" }} onChange={() => {}} />)
    expect(top).toContain("Recess radius")
    expect(top).not.toContain("Pillar outer radius")

    const bottom = renderToStaticMarkup(<LgInspector config={{ cover_type: "bottom" }} onChange={() => {}} />)
    expect(bottom).toContain("Pillar outer radius")
  })

  it("custom shape + hasFlooringImage shows the flooring upload control", () => {
    const html = renderToStaticMarkup(
      <LgInspector
        config={{ flooring_shape: "custom" }}
        onChange={() => {}}
        orderId="LG-1"
        hasFlooringImage={true}
      />,
    )
    expect(html).toContain("flooring image available")
    expect(html).toContain('type="file"')
  })

  it("custom shape without hasFlooringImage shows the missing-image warning, no orderId means no file input", () => {
    const html = renderToStaticMarkup(<LgInspector config={{ flooring_shape: "custom" }} onChange={() => {}} />)
    expect(html).toContain("No flooring image for this order yet")
    expect(html).not.toContain('type="file"')
  })

  it("renders the Stems section with an empty-state hint when no user_stems", () => {
    const html = renderToStaticMarkup(<LgInspector config={{}} onChange={() => {}} />)
    expect(html).toContain("Stems")
    expect(html).toContain("No manual stems yet")
  })

  it("renders a row per user_stems entry with theta/z and a trash button", () => {
    const html = renderToStaticMarkup(
      <LgInspector
        config={{ user_stems: [{ id: "a", theta_deg: 12.5, z_mm: 30 }, { id: "b", theta_deg: 200, z_mm: 10 }] }}
        onChange={() => {}}
      />,
    )
    expect(html).toContain("θ 12.5° · z 30mm")
    expect(html).toContain("θ 200° · z 10mm")
    expect(html).toContain("Hapus stem a")
    expect(html).toContain("Hapus stem b")
  })

  it("with activeStep=shadow, defaults to Casing/Shadow behavior/Dimensions open (Lighting/Advanced closed)", () => {
    const html = renderToStaticMarkup(<LgInspector config={{}} onChange={() => {}} activeStep="shadow" />)
    expect(html).toContain("Invert shadow")
    expect(html).toContain("Outer radius")
    expect(html).not.toContain("Light X")
  })

  it("with activeStep=wall, defaults to Casing/Stems open", () => {
    const html = renderToStaticMarkup(<LgInspector config={{}} onChange={() => {}} activeStep="wall" />)
    expect(html).toContain("No manual stems yet")
    expect(html).not.toContain("Light X")
  })
})
