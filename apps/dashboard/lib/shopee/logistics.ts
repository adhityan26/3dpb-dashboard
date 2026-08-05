import { shopeeRequest, shopeeRequestPost } from "./client"

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
