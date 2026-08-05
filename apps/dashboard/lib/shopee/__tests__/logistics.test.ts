import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/client", () => ({ shopeeRequest: vi.fn(), shopeeRequestPost: vi.fn() }))

import { getShippingParameter, shipOrder } from "@/lib/shopee/logistics"
import { shopeeRequest, shopeeRequestPost } from "@/lib/shopee/client"

const mockRequest = shopeeRequest as any
const mockRequestPost = shopeeRequestPost as any

describe("getShippingParameter", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("maps a pickup response", async () => {
    mockRequest.mockResolvedValue({
      response: {
        pickup: { address_list: [{ address_id: 111, time_slot_list: [{ pickup_time_id: "slot-1" }] }] },
        dropoff: null,
      },
    })
    const result = await getShippingParameter("S1")
    expect(mockRequest).toHaveBeenCalledWith("/api/v2/logistics/get_shipping_parameter", { order_sn: "S1" })
    expect(result).toEqual({
      pickup: { addressId: 111, timeSlotId: "slot-1" },
      dropoff: null,
    })
  })

  it("maps a dropoff-only response (no time slots)", async () => {
    mockRequest.mockResolvedValue({
      response: {
        pickup: null,
        dropoff: { branch_list: [{ branch_id: 42, address: "Jl. Counter No. 1" }] },
      },
    })
    const result = await getShippingParameter("S2")
    expect(result).toEqual({
      pickup: null,
      dropoff: { branchList: [{ branchId: 42, address: "Jl. Counter No. 1" }] },
    })
  })

  it("returns null pickup when no time slot is available", async () => {
    mockRequest.mockResolvedValue({
      response: { pickup: { address_list: [{ address_id: 111, time_slot_list: [] }] }, dropoff: null },
    })
    const result = await getShippingParameter("S3")
    expect(result.pickup).toEqual({ addressId: 111, timeSlotId: null })
  })
})

describe("shipOrder", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("ships a pickup order with the given address/time slot", async () => {
    mockRequestPost.mockResolvedValue({ response: {} })
    const result = await shipOrder("S1", { kind: "pickup", addressId: 111, timeSlotId: "slot-1" })
    expect(mockRequestPost).toHaveBeenCalledWith(
      "/api/v2/logistics/ship_order",
      { order_sn: "S1" },
      { pickup: { address_id: 111, pickup_time_id: "slot-1" } },
    )
    expect(result).toEqual({ success: true })
  })

  it("ships a dropoff order with the given branch", async () => {
    mockRequestPost.mockResolvedValue({ response: {} })
    const result = await shipOrder("S2", { kind: "dropoff", branchId: 42 })
    expect(mockRequestPost).toHaveBeenCalledWith(
      "/api/v2/logistics/ship_order",
      { order_sn: "S2" },
      { dropoff: { branch_id: 42 } },
    )
    expect(result).toEqual({ success: true })
  })

  it("returns success:false with Shopee's message when shipping fails", async () => {
    mockRequestPost.mockRejectedValue(new Error("Shopee API error (error_order): stock changed"))
    const result = await shipOrder("S3", { kind: "pickup", addressId: 1, timeSlotId: "x" })
    expect(result).toEqual({ success: false, error: "Shopee API error (error_order): stock changed" })
  })
})
