import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: { config: { findUnique: vi.fn(), upsert: vi.fn() } } }))

import { prisma } from "@/lib/db"
import { decodeJwtExp, saveSession, getSessionStatus, getRawSession } from "@/lib/tokopedia/session"
import { TokopediaError } from "@/lib/tokopedia/types"

const mock = prisma as any

// A JWT with payload { "exp": 1783248893 } (base64url of the payload segment)
function jwtWithExp(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url")
  return `header.${payload}.sig`
}

function cookieArr(over: Record<string,string> = {}) {
  const base: Record<string,string> = {
    SELLER_TOKEN: jwtWithExp(1783248893),
    oec_seller_id_unified_seller_env: "7496108703209719955",
    app_id_unified_seller_env: "4068",
    sessionid: "abc",
    ...over,
  }
  return Object.entries(base).map(([name, value]) => ({ name, value }))
}

describe("decodeJwtExp", () => {
  it("returns exp seconds from a JWT payload", () => {
    expect(decodeJwtExp(jwtWithExp(1783248893))).toBe(1783248893)
  })
  it("returns null for a malformed token", () => {
    expect(decodeJwtExp("not-a-jwt")).toBeNull()
    expect(decodeJwtExp("a.b")).toBeNull()
  })
})

describe("saveSession", () => {
  beforeEach(() => vi.clearAllMocks())

  it("extracts sellerId/appId/expiry and upserts the config row", async () => {
    mock.config.upsert.mockResolvedValue({})
    const meta = await saveSession(cookieArr())
    expect(meta.sellerId).toBe("7496108703209719955")
    expect(meta.appId).toBe("4068")
    expect(meta.tokenExpiry).toBe(new Date(1783248893 * 1000).toISOString())
    const arg = mock.config.upsert.mock.calls[0][0]
    expect(arg.where.key).toBe("tokopedia.session")
    const stored = JSON.parse(arg.create.value)
    expect(stored.cookies.SELLER_TOKEN).toBeTruthy()
    expect(stored.cookies.sessionid).toBe("abc")
    expect(stored.sellerId).toBe("7496108703209719955")
  })

  it("throws when SELLER_TOKEN is missing", async () => {
    const arr = cookieArr().filter(c => c.name !== "SELLER_TOKEN")
    await expect(saveSession(arr)).rejects.toThrow(TokopediaError)
  })

  it("throws when the seller-id cookie is missing", async () => {
    const arr = cookieArr().filter(c => c.name !== "oec_seller_id_unified_seller_env")
    await expect(saveSession(arr)).rejects.toThrow(TokopediaError)
  })
})

describe("getSessionStatus", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns exists:false when no row", async () => {
    mock.config.findUnique.mockResolvedValue(null)
    expect(await getSessionStatus()).toEqual({ exists: false })
  })

  it("returns metadata and expired:false for a future expiry", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    mock.config.findUnique.mockResolvedValue({ value: JSON.stringify({
      cookies: {}, sellerId: "S1", appId: "4068", userAgent: null,
      updatedAt: "2026-07-06T00:00:00.000Z", tokenExpiry: new Date(future*1000).toISOString(),
    }) })
    const s = await getSessionStatus()
    expect(s.exists).toBe(true)
    expect(s.sellerId).toBe("S1")
    expect(s.expired).toBe(false)
  })

  it("returns expired:true for a past expiry", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600
    mock.config.findUnique.mockResolvedValue({ value: JSON.stringify({
      cookies: {}, sellerId: "S1", appId: "4068", userAgent: null,
      updatedAt: "2026-07-06T00:00:00.000Z", tokenExpiry: new Date(past*1000).toISOString(),
    }) })
    expect((await getSessionStatus()).expired).toBe(true)
  })
})

describe("getRawSession", () => {
  beforeEach(() => vi.clearAllMocks())
  it("returns null when no row", async () => {
    mock.config.findUnique.mockResolvedValue(null)
    expect(await getRawSession()).toBeNull()
  })
  it("parses and returns the stored session", async () => {
    mock.config.findUnique.mockResolvedValue({ value: JSON.stringify({
      cookies: { a: "1" }, sellerId: "S1", appId: "4068", userAgent: "UA",
      updatedAt: "x", tokenExpiry: null,
    }) })
    const s = await getRawSession()
    expect(s?.cookies.a).toBe("1")
    expect(s?.userAgent).toBe("UA")
  })
})
