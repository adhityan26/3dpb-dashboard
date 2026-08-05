import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/shopee/logistics", () => ({ getShippingParameter: vi.fn() }))

import { GET } from "../route"
import { auth } from "@/lib/auth"
import { getShippingParameter } from "@/lib/shopee/logistics"

const mockAuth = auth as any
const mockGetShippingParameter = getShippingParameter as any

function makeRequest(orderSn?: string) {
  const url = orderSn
    ? `http://localhost/api/shopee/logistics/parameter?orderSn=${orderSn}`
    : "http://localhost/api/shopee/logistics/parameter"
  return new Request(url) as any
}

describe("GET /api/shopee/logistics/parameter", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(makeRequest("S1"))
    expect(res.status).toBe(401)
  })

  it("returns 400 when orderSn is missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
  })

  it("returns the shipping parameter for the given order", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGetShippingParameter.mockResolvedValue({
      pickup: null,
      dropoff: { branchList: [{ branchId: 1, address: "Cabang A" }, { branchId: 2, address: "Cabang B" }] },
    })

    const res = await GET(makeRequest("S1"))

    expect(mockGetShippingParameter).toHaveBeenCalledWith("S1")
    const json = await res.json()
    expect(json).toEqual({
      pickup: null,
      dropoff: { branchList: [{ branchId: 1, address: "Cabang A" }, { branchId: 2, address: "Cabang B" }] },
    })
  })

  it("returns a 502 with a clear message when the upstream call fails", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGetShippingParameter.mockRejectedValue(new Error("Shopee timeout"))

    const res = await GET(makeRequest("S1"))

    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toMatch(/shopee timeout/i)
  })
})
