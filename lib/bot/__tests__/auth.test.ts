import { describe, it, expect, afterEach } from "vitest"
import { requireBotToken } from "@/lib/bot/auth"

function reqWith(auth: string | null) {
  return { headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? auth : null) } }
}

const ORIGINAL = process.env.BOT_API_TOKEN
afterEach(() => { process.env.BOT_API_TOKEN = ORIGINAL })

describe("requireBotToken", () => {
  it("returns true for a matching bearer token", () => {
    process.env.BOT_API_TOKEN = "secret123"
    expect(requireBotToken(reqWith("Bearer secret123"))).toBe(true)
  })
  it("returns false for a wrong token", () => {
    process.env.BOT_API_TOKEN = "secret123"
    expect(requireBotToken(reqWith("Bearer nope"))).toBe(false)
  })
  it("returns false when the header is missing", () => {
    process.env.BOT_API_TOKEN = "secret123"
    expect(requireBotToken(reqWith(null))).toBe(false)
  })
  it("returns false when the header is malformed (no Bearer prefix)", () => {
    process.env.BOT_API_TOKEN = "secret123"
    expect(requireBotToken(reqWith("secret123"))).toBe(false)
  })
  it("returns false when BOT_API_TOKEN is unset", () => {
    delete process.env.BOT_API_TOKEN
    expect(requireBotToken(reqWith("Bearer anything"))).toBe(false)
  })
})
