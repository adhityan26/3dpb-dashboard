import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ProductionPanel } from "../ProductionPanel"

const models = [
  {
    id: "m1", name: "Green Lantern 2026", baseBoreMm: 23.871,
    parts: [
      { id: "p1", name: "band", sizeBytes: 1, triCount: 1, anchors: [{ id: "a1", posX: 0, posY: 0, posZ: 0, normX: 0, normY: 0, normZ: 1, upX: 0, upY: 1, upZ: 0, textHeightMm: 3, depthMm: 0.5 }] },
    ],
  },
]

describe("ProductionPanel", () => {
  it("renders size modes, clearance toggle, and live scale summary for default US 8", () => {
    const html = renderToStaticMarkup(<ProductionPanel models={models} loading={false} />)
    expect(html).toContain("US Size")
    expect(html).toContain("Diameter")
    expect(html).toContain("Keliling")
    expect(html).toContain("kelonggaran")
    // default US 8 + 0.3 clearance on 23.871 bore → 77.13%
    expect(html).toContain("77.13")
    expect(html).toContain("Green Lantern 2026")
  })

  it("keeps the empty state", () => {
    const html = renderToStaticMarkup(<ProductionPanel models={[]} loading={false} />)
    expect(html).toContain("Belum ada model")
  })
})
