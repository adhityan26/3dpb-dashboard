import { describe, it, expect, afterEach } from "vitest"
import { requireApiV1Token } from "../auth"

function reqWith(auth: string | null) {
  return { headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? auth : null) } }
}

const ORIGINAL = process.env.API_V1_TOKEN
afterEach(() => { process.env.API_V1_TOKEN = ORIGINAL })

describe("requireApiV1Token", () => {
  it("returns true for a matching bearer token", () => {
    process.env.API_V1_TOKEN = "secret123"
    expect(requireApiV1Token(reqWith("Bearer secret123"))).toBe(true)
  })
  it("returns false for a wrong token", () => {
    process.env.API_V1_TOKEN = "secret123"
    expect(requireApiV1Token(reqWith("Bearer nope"))).toBe(false)
  })
  it("returns false when the header is missing", () => {
    process.env.API_V1_TOKEN = "secret123"
    expect(requireApiV1Token(reqWith(null))).toBe(false)
  })
  it("returns false when the header is malformed (no Bearer prefix)", () => {
    process.env.API_V1_TOKEN = "secret123"
    expect(requireApiV1Token(reqWith("secret123"))).toBe(false)
  })
  it("returns false when API_V1_TOKEN is unset", () => {
    delete process.env.API_V1_TOKEN
    expect(requireApiV1Token(reqWith("Bearer anything"))).toBe(false)
  })
})
