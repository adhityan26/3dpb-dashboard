import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/client", () => ({
  shopeeRequest: vi.fn(),
  shopeeRequestPost: vi.fn(),
  shopeeDownloadDocument: vi.fn(),
}))

import {
  getShippingParameter,
  shipOrder,
  createShippingDocument,
  getShippingDocumentResult,
  downloadShippingDocument,
  generateShippingDocument,
} from "@/lib/shopee/logistics"
import { shopeeRequest, shopeeRequestPost, shopeeDownloadDocument } from "@/lib/shopee/client"

const mockRequest = shopeeRequest as any
const mockRequestPost = shopeeRequestPost as any
const mockDownloadDocument = shopeeDownloadDocument as any

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

describe("createShippingDocument", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("kicks off document generation for a batch of orders, with the shared document type", async () => {
    mockRequestPost.mockResolvedValue({ response: {} })
    await createShippingDocument(["S1", "S2"])
    expect(mockRequestPost).toHaveBeenCalledWith(
      "/api/v2/logistics/create_shipping_document",
      {},
      {
        order_list: [
          { order_sn: "S1", shipping_document_type: "THERMAL_AIR_WAYBILL" },
          { order_sn: "S2", shipping_document_type: "THERMAL_AIR_WAYBILL" },
        ],
      },
    )
  })
})

describe("getShippingDocumentResult", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("maps per-order status, sending the shared document type via POST (Shopee 404s this endpoint on GET)", async () => {
    mockRequestPost.mockResolvedValue({
      response: { result_list: [{ order_sn: "S1", status: "READY" }, { order_sn: "S2", status: "PROCESSING" }] },
    })
    const result = await getShippingDocumentResult(["S1", "S2"])
    expect(mockRequestPost).toHaveBeenCalledWith(
      "/api/v2/logistics/get_shipping_document_result",
      {},
      {
        order_list: [
          { order_sn: "S1", shipping_document_type: "THERMAL_AIR_WAYBILL" },
          { order_sn: "S2", shipping_document_type: "THERMAL_AIR_WAYBILL" },
        ],
      },
    )
    expect(result).toEqual([
      { orderSn: "S1", status: "READY" },
      { orderSn: "S2", status: "PROCESSING" },
    ])
  })
})

describe("downloadShippingDocument", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("downloads the combined PDF for a batch of orders", async () => {
    const fakeBuffer = Buffer.from("fake-pdf")
    mockDownloadDocument.mockResolvedValue(fakeBuffer)
    const result = await downloadShippingDocument(["S1", "S2"])
    expect(mockDownloadDocument).toHaveBeenCalledWith(
      "/api/v2/logistics/download_shipping_document",
      {},
      { order_list: [{ order_sn: "S1", shipping_document_type: "THERMAL_AIR_WAYBILL" }, { order_sn: "S2", shipping_document_type: "THERMAL_AIR_WAYBILL" }] },
    )
    expect(result).toBe(fakeBuffer)
  })
})

describe("generateShippingDocument", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("creates, polls until ready, then downloads", async () => {
    let pollCall = 0
    mockRequestPost.mockImplementation((path: string) => {
      if (path === "/api/v2/logistics/create_shipping_document") return Promise.resolve({ response: {} })
      if (path === "/api/v2/logistics/get_shipping_document_result") {
        pollCall += 1
        return pollCall === 1
          ? Promise.resolve({ response: { result_list: [{ order_sn: "S1", status: "PROCESSING" }] } })
          : Promise.resolve({ response: { result_list: [{ order_sn: "S1", status: "READY" }] } })
      }
      throw new Error(`unexpected path ${path}`)
    })
    const fakeBuffer = Buffer.from("fake-pdf")
    mockDownloadDocument.mockResolvedValue(fakeBuffer)

    const result = await generateShippingDocument(["S1"])

    expect(result).toEqual({ pdf: fakeBuffer, failedOrderSns: [] })
    expect(pollCall).toBe(2) // polled once, then ready
  })

  it("throws if ALL orders fail document generation", async () => {
    mockRequestPost.mockImplementation((path: string) => {
      if (path === "/api/v2/logistics/create_shipping_document") return Promise.resolve({ response: {} })
      return Promise.resolve({ response: { result_list: [{ order_sn: "S1", status: "FAILED" }] } })
    })

    await expect(generateShippingDocument(["S1"])).rejects.toThrow(/gagal/i)
    expect(mockDownloadDocument).not.toHaveBeenCalled()
  })

  it("downloads the PDF for READY orders and reports failedOrderSns when some (not all) orders fail — partial failure must never become all-or-nothing", async () => {
    mockRequestPost.mockImplementation((path: string) => {
      if (path === "/api/v2/logistics/create_shipping_document") return Promise.resolve({ response: {} })
      return Promise.resolve({
        response: {
          result_list: [
            { order_sn: "S1", status: "READY" },
            { order_sn: "S2", status: "FAILED" },
          ],
        },
      })
    })
    const fakeBuffer = Buffer.from("fake-pdf")
    mockDownloadDocument.mockResolvedValue(fakeBuffer)

    const result = await generateShippingDocument(["S1", "S2"])

    expect(result).toEqual({ pdf: fakeBuffer, failedOrderSns: ["S2"] })
    expect(mockDownloadDocument).toHaveBeenCalledWith(
      "/api/v2/logistics/download_shipping_document",
      {},
      { order_list: [{ order_sn: "S1", shipping_document_type: "THERMAL_AIR_WAYBILL" }] },
    )
  })

  it("throws if polling never reaches READY/FAILED within the retry budget", async () => {
    let pollCalls = 0
    mockRequestPost.mockImplementation((path: string) => {
      if (path === "/api/v2/logistics/create_shipping_document") return Promise.resolve({ response: {} })
      pollCalls += 1
      return Promise.resolve({ response: { result_list: [{ order_sn: "S1", status: "PROCESSING" }] } })
    })

    await expect(generateShippingDocument(["S1"], { pollIntervalMs: 0, maxPolls: 3 })).rejects.toThrow(/timeout|belum siap/i)
    expect(pollCalls).toBe(3)
  })
})
