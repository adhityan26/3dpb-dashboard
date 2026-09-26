import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ModelManager } from "../ModelManager"

const models = [
  {
    id: "m1", name: "Green Lantern 2026", baseBoreMm: 23.871,
    parts: [
      { id: "p1", name: "band", sizeBytes: 83_000_000, triCount: 1_740_432, boreMm: 23.871, rotXDeg: 0, rotYDeg: 0, rotZDeg: 0, anchors: [{ id: "a1", posX: 0, posY: 0, posZ: 0, normX: 0, normY: 0, normZ: 1, upX: 0, upY: 1, upZ: 0, textHeightMm: 3, depthMm: 0.5 }] },
      { id: "p2", name: "frame", sizeBytes: 21_000_000, triCount: 439_804, boreMm: null, rotXDeg: 90, rotYDeg: 0, rotZDeg: 0, anchors: [] },
    ],
  },
]

describe("ModelManager", () => {
  it("lists models with part rows and anchor counts", () => {
    const html = renderToStaticMarkup(
      <ModelManager models={models} loading={false} onChanged={async () => {}} />,
    )
    expect(html).toContain("Green Lantern 2026")
    expect(html).toContain("band")
    expect(html).toContain("frame")
    expect(html).toContain("1 anchor")   // p1
    expect(html).toContain("0 anchor")   // p2 — belum di-setup, harus kelihatan
    expect(html).toContain("23.87")
  })

  it("keeps the empty state", () => {
    const html = renderToStaticMarkup(<ModelManager models={[]} loading={false} onChanged={async () => {}} />)
    expect(html).toContain("Belum ada model")
  })
})
