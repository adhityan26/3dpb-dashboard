import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

vi.mock("@/lib/hooks/use-ring-models", () => ({
  useRingModels: () => ({ models: [], loading: false, error: null, refresh: async () => {} }),
}))

import { RingResizerTab } from "../RingResizerTab"

describe("RingResizerTab", () => {
  it("renders both sub-tab labels", () => {
    const html = renderToStaticMarkup(<RingResizerTab />)
    expect(html).toContain("Setup Model")
    expect(html).toContain("Produksi")
  })

  it("shows empty state when no models exist", () => {
    const html = renderToStaticMarkup(<RingResizerTab />)
    expect(html).toContain("Belum ada model")
  })
})
