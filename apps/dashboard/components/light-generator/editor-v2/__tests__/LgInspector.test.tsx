import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { LgInspector } from "../LgInspector"

describe("LgInspector", () => {
  it("renders all section titles and the search input", () => {
    const html = renderToStaticMarkup(<LgInspector config={{}} onChange={() => {}} />)
    expect(html).toContain("Size / Geometry")
    expect(html).toContain("cari parameter")
    expect(html).toContain("Raw JSON")
  })
  it("cover top hides pillar section, shows recess", () => {
    const html = renderToStaticMarkup(<LgInspector config={{ cover_type: "top" }} onChange={() => {}} />)
    expect(html).toContain("Recess radius")
    expect(html).not.toContain("Pillar outer radius")
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
    expect(html).toContain("gambar flooring tersedia")
    expect(html).toContain('type="file"')
  })
  it("custom shape without hasFlooringImage shows the missing-image warning, no orderId means no file input", () => {
    const html = renderToStaticMarkup(<LgInspector config={{ flooring_shape: "custom" }} onChange={() => {}} />)
    expect(html).toContain("Belum ada gambar flooring")
    expect(html).not.toContain('type="file"')
  })
  it("renders the Stems section with an empty-state hint when no user_stems", () => {
    const html = renderToStaticMarkup(<LgInspector config={{}} onChange={() => {}} />)
    expect(html).toContain("Stems")
    expect(html).toContain("Belum ada stem manual")
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
})
