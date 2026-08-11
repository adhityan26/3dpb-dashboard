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
})
