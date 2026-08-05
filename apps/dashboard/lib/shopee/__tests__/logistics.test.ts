import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/client", () => ({ shopeeRequest: vi.fn(), shopeeRequestPost: vi.fn() }))

import { getShippingParameter } from "@/lib/shopee/logistics"
import { shopeeRequest } from "@/lib/shopee/client"

const mockRequest = shopeeRequest as any

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
