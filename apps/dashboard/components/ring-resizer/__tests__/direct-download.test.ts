import { describe, it, expect, afterEach, vi } from "vitest"
import { safeDirectUrl } from "../direct-download"

function setProtocol(protocol: string) {
  vi.stubGlobal("window", { location: { protocol } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("safeDirectUrl", () => {
  it("drops http MinIO links on an https page (mixed content)", () => {
    setProtocol("https:")
    expect(safeDirectUrl("http://192.168.88.18:9000/x.zip")).toBeNull()
  })
  it("keeps https MinIO links on an https page", () => {
    setProtocol("https:")
    expect(safeDirectUrl("https://s3.example.com/x.zip")).toBe("https://s3.example.com/x.zip")
  })
  it("keeps http links on an http page", () => {
    setProtocol("http:")
    expect(safeDirectUrl("http://192.168.88.18:9000/x.zip")).toBe("http://192.168.88.18:9000/x.zip")
  })
  it("null in → null out", () => {
    expect(safeDirectUrl(null)).toBeNull()
  })
})
