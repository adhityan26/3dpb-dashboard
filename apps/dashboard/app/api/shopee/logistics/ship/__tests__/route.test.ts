import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/shopee/logistics", () => ({ shipOrder: vi.fn(), getShippingParameter: vi.fn() }))

import { POST } from "../route"
import { auth } from "@/lib/auth"
import { shipOrder, getShippingParameter } from "@/lib/shopee/logistics"

const mockAuth = auth as any
const mockShipOrder = shipOrder as any
const mockGetShippingParameter = getShippingParameter as any

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/shopee/logistics/ship", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any
}

describe("POST /api/shopee/logistics/ship", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ orders: [] }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when orders is empty", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const res = await POST(makeRequest({ orders: [] }))
    expect(res.status).toBe(400)
  })

  it("resolves pickup address/time slot server-side, then ships", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGetShippingParameter.mockResolvedValue({ pickup: { addressId: 111, timeSlotId: "slot-1" }, dropoff: null })
    mockShipOrder.mockResolvedValue({ success: true })

    const res = await POST(makeRequest({ orders: [{ orderSn: "S1", method: { kind: "pickup" } }] }))

    expect(mockGetShippingParameter).toHaveBeenCalledWith("S1")
    expect(mockShipOrder).toHaveBeenCalledWith("S1", { kind: "pickup", addressId: 111, timeSlotId: "slot-1" })
    const json = await res.json()
    expect(json).toEqual({ results: [{ orderSn: "S1", success: true }] })
  })

  it("reports failure without calling shipOrder when no pickup slot is available", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGetShippingParameter.mockResolvedValue({ pickup: null, dropoff: null })

    const res = await POST(makeRequest({ orders: [{ orderSn: "S1", method: { kind: "pickup" } }] }))

    const json = await res.json()
    expect(json).toEqual({ results: [{ orderSn: "S1", success: false, error: "Tidak ada slot pickup tersedia untuk order ini" }] })
    expect(mockShipOrder).not.toHaveBeenCalled()
  })

  it("ships a dropoff order directly (no slot resolution needed) and reports partial failure without aborting the batch", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGetShippingParameter.mockResolvedValue({ pickup: { addressId: 111, timeSlotId: "slot-1" }, dropoff: null })
    mockShipOrder.mockImplementation((orderSn: string) =>
      orderSn === "S2" ? { success: false, error: "stock changed" } : { success: true },
    )

    const res = await POST(
      makeRequest({
        orders: [
          { orderSn: "S1", method: { kind: "pickup" } },
          { orderSn: "S2", method: { kind: "dropoff", branchId: 2 } },
        ],
      }),
    )

    expect(mockShipOrder).toHaveBeenCalledWith("S2", { kind: "dropoff", branchId: 2 })
    const json = await res.json()
    expect(json).toEqual({
      results: [
        { orderSn: "S1", success: true },
        { orderSn: "S2", success: false, error: "stock changed" },
      ],
    })
  })
})
