import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: { config: { findUnique: vi.fn(), upsert: vi.fn() } },
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { prisma } from "@/lib/db"
import { shopeeRequestPost } from "@/lib/shopee/client"

const mockPrisma = prisma as any

describe("shopeeRequestPost", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SHOPEE_PARTNER_ID = "12345"
    process.env.SHOPEE_PARTNER_KEY = "test-partner-key"
    mockPrisma.config.findUnique.mockImplementation(
      ({ where }: { where: { key: string } }) => {
        if (where.key === "shopee_shop_id") return Promise.resolve({ value: "999" })
        if (where.key === "shopee_access_token")
          return Promise.resolve({ value: "access-token" })
        if (where.key === "shopee_refresh_token")
          return Promise.resolve({ value: "refresh-token" })
        return Promise.resolve(null)
      },
    )
  })

  it("sends a POST with a JSON body to the signed URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { ok: true } }),
    })

    await shopeeRequestPost("/api/v2/logistics/ship_order", { order_sn: "S1" }, { pickup: { address_id: 1 } })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [urlArg, initArg] = mockFetch.mock.calls[0]
    expect(String(urlArg)).toContain("/api/v2/logistics/ship_order")
    expect(String(urlArg)).toContain("order_sn=S1")
    expect(initArg.method).toBe("POST")
    expect(JSON.parse(initArg.body)).toEqual({ pickup: { address_id: 1 } })
    expect(initArg.headers["Content-Type"]).toBe("application/json")
  })

  it("throws when Shopee returns an error field", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: "error_param", message: "invalid order_sn" }),
    })

    await expect(
      shopeeRequestPost("/api/v2/logistics/ship_order", { order_sn: "BAD" }, {}),
    ).rejects.toThrow(/invalid order_sn/)
  })
})
