import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/client", () => ({ shopeeRequest: vi.fn() }))

import { getTrackingNumber } from "@/lib/shopee/tracking"
import { shopeeRequest } from "@/lib/shopee/client"

const mockRequest = shopeeRequest as any

describe("getTrackingNumber", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("calls the tracking-number endpoint with the order sn", async () => {
    mockRequest.mockResolvedValue({ response: { tracking_number: "SPXTRK123" } })
    await getTrackingNumber("S1")
    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v2/logistics/get_tracking_number",
      { order_sn: "S1" },
    )
  })

  it("returns the tracking number when present", async () => {
    mockRequest.mockResolvedValue({ response: { tracking_number: "SPXTRK123" } })
    const result = await getTrackingNumber("S1")
    expect(result).toBe("SPXTRK123")
  })

  it("returns null when tracking number is empty or absent", async () => {
    mockRequest.mockResolvedValue({ response: { tracking_number: "" } })
    expect(await getTrackingNumber("S1")).toBeNull()
    mockRequest.mockResolvedValue({ response: {} })
    expect(await getTrackingNumber("S2")).toBeNull()
  })

  it("returns null instead of throwing when the API errors (order not yet shipped)", async () => {
    mockRequest.mockRejectedValue(new Error("no logistics info yet"))
    expect(await getTrackingNumber("S1")).toBeNull()
  })
})
