import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: { config: { findUnique: vi.fn(), upsert: vi.fn() } },
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

import { prisma } from "@/lib/db"
import { shopeeRequestPost, shopeeDownloadDocument } from "@/lib/shopee/client"

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

describe("shopeeDownloadDocument", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns the raw response body bytes on success", async () => {
    const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // "%PDF"
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === "content-type" ? "application/pdf" : null) },
      arrayBuffer: async () => fakePdfBytes.buffer,
    })

    const result = await shopeeDownloadDocument(
      "/api/v2/logistics/download_shipping_document",
      {},
      { order_list: [{ order_sn: "S1" }] },
    )

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.equals(Buffer.from(fakePdfBytes))).toBe(true)
  })

  it("throws when Shopee returns a JSON error instead of a PDF", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
      json: async () => ({ error: "error_param", message: "document not ready" }),
    })

    await expect(
      shopeeDownloadDocument("/api/v2/logistics/download_shipping_document", {}, { order_list: [{ order_sn: "S1" }] }),
    ).rejects.toThrow(/document not ready/)
  })
})
