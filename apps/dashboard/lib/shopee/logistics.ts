import { shopeeRequest, shopeeRequestPost, shopeeDownloadDocument } from "./client"

interface ShippingParameterResponse {
  response: {
    pickup: { address_list: { address_id: number; time_slot_list: { pickup_time_id: string }[] }[] } | null
    dropoff: { branch_list: { branch_id: number; address: string }[] } | null
  }
}

export interface ShippingParameter {
  pickup: { addressId: number; timeSlotId: string | null } | null
  dropoff: { branchList: { branchId: number; address: string }[] } | null
}

/**
 * Fetch the available pickup time slots / drop-off branches for an order,
 * before calling shipOrder. v1 policy: caller auto-picks the FIRST time slot
 * for pickup (see mapping below) — no manual slot picker yet.
 */
export async function getShippingParameter(orderSn: string): Promise<ShippingParameter> {
  const json = await shopeeRequest<ShippingParameterResponse>(
    "/api/v2/logistics/get_shipping_parameter",
    { order_sn: orderSn },
  )

  const pickupAddr = json.response.pickup?.address_list?.[0]
  const pickup = pickupAddr
    ? { addressId: pickupAddr.address_id, timeSlotId: pickupAddr.time_slot_list[0]?.pickup_time_id ?? null }
    : null

  const dropoff = json.response.dropoff
    ? { branchList: json.response.dropoff.branch_list.map((b) => ({ branchId: b.branch_id, address: b.address })) }
    : null

  return { pickup, dropoff }
}

export type ShipMethod =
  | { kind: "pickup"; addressId: number; timeSlotId: string }
  | { kind: "dropoff"; branchId: number }

/**
 * Arrange shipment for one order. Never throws — bulk callers need per-order
 * success/failure, not an exception that aborts the whole batch (see the
 * design spec's partial-failure requirement).
 */
export async function shipOrder(
  orderSn: string,
  method: ShipMethod,
): Promise<{ success: true } | { success: false; error: string }> {
  const body =
    method.kind === "pickup"
      ? { pickup: { address_id: method.addressId, pickup_time_id: method.timeSlotId } }
      : { dropoff: { branch_id: method.branchId } }

  try {
    await shopeeRequestPost("/api/v2/logistics/ship_order", { order_sn: orderSn }, body)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function createShippingDocument(orderSnList: string[]): Promise<void> {
  await shopeeRequestPost(
    "/api/v2/logistics/create_shipping_document",
    {},
    { order_list: orderSnList.map((orderSn) => ({ order_sn: orderSn })) },
  )
}

interface ShippingDocumentResultResponse {
  response: { result_list: { order_sn: string; status: "PROCESSING" | "READY" | "FAILED" }[] }
}

export async function getShippingDocumentResult(
  orderSnList: string[],
): Promise<{ orderSn: string; status: "PROCESSING" | "READY" | "FAILED" }[]> {
  const json = await shopeeRequest<ShippingDocumentResultResponse>(
    "/api/v2/logistics/get_shipping_document_result",
    { order_sn_list: orderSnList.join(",") },
  )
  return json.response.result_list.map((r) => ({ orderSn: r.order_sn, status: r.status }))
}

export async function downloadShippingDocument(orderSnList: string[]): Promise<Buffer> {
  return shopeeDownloadDocument(
    "/api/v2/logistics/download_shipping_document",
    {},
    {
      order_list: orderSnList.map((orderSn) => ({
        order_sn: orderSn,
        shipping_document_type: "THERMAL_AIR_WAYBILL",
      })),
    },
  )
}

/**
 * Orchestrates the full flow: kick off generation, poll until every order's
 * document is READY (or fail fast on FAILED / timeout), then download the
 * combined PDF. Default poll: every 1500ms, up to 10 attempts (~15s) —
 * override via options for tests.
 */
export async function generateShippingDocument(
  orderSnList: string[],
  options: { pollIntervalMs?: number; maxPolls?: number } = {},
): Promise<Buffer> {
  const pollIntervalMs = options.pollIntervalMs ?? 1500
  const maxPolls = options.maxPolls ?? 10

  await createShippingDocument(orderSnList)

  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const results = await getShippingDocumentResult(orderSnList)

    const failed = results.find((r) => r.status === "FAILED")
    if (failed) throw new Error(`Pembuatan dokumen resi gagal untuk order ${failed.orderSn}`)

    const allReady = results.every((r) => r.status === "READY")
    if (allReady) return downloadShippingDocument(orderSnList)

    if (attempt < maxPolls - 1 && pollIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
  }

  throw new Error("Dokumen resi belum siap (timeout) — coba generate ulang beberapa saat lagi")
}
