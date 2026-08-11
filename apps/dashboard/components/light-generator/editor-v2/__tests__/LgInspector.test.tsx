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
})
