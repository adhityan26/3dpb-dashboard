import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { shipOrder, getShippingParameter, type ShipMethod } from "@/lib/shopee/logistics"

export type RequestedShipMethod = { kind: "pickup" } | { kind: "dropoff"; branchId: number }

export interface ShipRequestInput {
  orders: { orderSn: string; method: RequestedShipMethod }[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body: ShipRequestInput = await req.json()
  if (!Array.isArray(body.orders) || body.orders.length === 0) {
    return NextResponse.json({ error: "orders wajib diisi" }, { status: 400 })
  }

  // Processed sequentially (not Promise.all) so per-order calls to
  // getShippingParameter/shipOrder happen in the same order as `body.orders`
  // — deterministic behavior callers (and tests) can rely on.
  const results: { orderSn: string; success: boolean; error?: string }[] = []
  for (const { orderSn, method } of body.orders) {
    let resolvedMethod: ShipMethod

    if (method.kind === "pickup") {
      const param = await getShippingParameter(orderSn)
      if (!param.pickup) {
        results.push({ orderSn, success: false, error: "Tidak ada slot pickup tersedia untuk order ini" })
        continue
      }
      if (!param.pickup.timeSlotId) {
        results.push({ orderSn, success: false, error: "Tidak ada slot waktu pickup tersedia untuk order ini" })
        continue
      }
      resolvedMethod = { kind: "pickup", addressId: param.pickup.addressId, timeSlotId: param.pickup.timeSlotId }
    } else {
      resolvedMethod = { kind: "dropoff", branchId: method.branchId }
    }

    const outcome = await shipOrder(orderSn, resolvedMethod)
    results.push(
      outcome.success
        ? { orderSn, success: true }
        : { orderSn, success: false, error: outcome.error },
    )
  }

  return NextResponse.json({ results })
}
