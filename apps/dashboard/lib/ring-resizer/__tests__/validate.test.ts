import { describe, it, expect } from "vitest"
import { parseProcessRequest, parseAnchorsBody } from "../validate"

describe("parseProcessRequest", () => {
  const good = { modelId: "abc", mode: "us", value: 8, clearanceMm: 0.3, text: "US 8" }

  it("accepts a valid request", () => {
    const r = parseProcessRequest(good)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.req.mode).toBe("us")
  })

  it.each([
    [{ ...good, mode: "banana" }],
    [{ ...good, value: -1 }],
    [{ ...good, text: "x".repeat(25) }],       // > 24 chars
    [{ ...good, text: "héllo" }],              // non-ASCII rejected
    [{ ...good, modelId: "" }],
    ["not an object"],
  ])("rejects %j", (body) => {
    expect(parseProcessRequest(body).ok).toBe(false)
  })
})

describe("parseAnchorsBody", () => {
  it("accepts a valid anchor list", () => {
    const r = parseAnchorsBody({
      anchors: [{ pos: [1, 2, 3], normal: [0, 0, 1], up: [0, 1, 0], textHeightMm: 3, depthMm: 0.5 }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.anchors).toHaveLength(1)
  })

  it("rejects malformed anchors", () => {
    expect(parseAnchorsBody({ anchors: [{ pos: [1, 2] }] }).ok).toBe(false)
    expect(parseAnchorsBody({}).ok).toBe(false)
  })
})
