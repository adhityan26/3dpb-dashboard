import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/tokopedia/session", () => ({ getRawSession: vi.fn() }))

import { tokopediaRequest } from "@/lib/tokopedia/client"
import { getRawSession } from "@/lib/tokopedia/session"
import { TokopediaError } from "@/lib/tokopedia/types"

const mockSession = getRawSession as any

const SESSION = {
  cookies: { SELLER_TOKEN: "jwt", sessionid: "sid", msToken: "mt" },
  sellerId: "S1", appId: "4068", userAgent: null, updatedAt: "x", tokenExpiry: null,
}

describe("tokopediaRequest", () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it("throws SESSION_MISSING when no session", async () => {
    mockSession.mockResolvedValue(null)
    await expect(tokopediaRequest({})).rejects.toMatchObject({ code: "SESSION_MISSING" })
  })

  it("sends cookies + seller id in the URL and returns data on code 0", async () => {
    mockSession.mockResolvedValue(SESSION)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ code: 0, data: { total_count: 1, main_orders: [] } }),
    } as any)
    const data = await tokopediaRequest({ count: 1 })
    expect(data).toEqual({ total_count: 1, main_orders: [] })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain("oec_seller_id=S1")
    expect(String(url)).toContain("aid=4068")
    expect((init as any).headers.cookie).toContain("SELLER_TOKEN=jwt")
    expect((init as any).headers.cookie).toContain("msToken=mt")
    expect((init as any).method).toBe("POST")
  })

  it("throws SESSION_INVALID on code 10000", async () => {
    mockSession.mockResolvedValue(SESSION)
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ code: 10000, message: "session invalid" }),
    } as any)
    await expect(tokopediaRequest({})).rejects.toMatchObject({ code: "SESSION_INVALID" })
  })

  it("throws UNKNOWN on other non-zero codes", async () => {
    mockSession.mockResolvedValue(SESSION)
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ code: 500, message: "boom" }),
    } as any)
    await expect(tokopediaRequest({})).rejects.toMatchObject({ code: "UNKNOWN" })
  })
})
