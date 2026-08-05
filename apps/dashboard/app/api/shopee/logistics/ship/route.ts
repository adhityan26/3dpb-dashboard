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

  let body: ShipRequestInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!Array.isArray(body.orders) || body.orders.length === 0) {
    return NextResponse.json({ error: "orders wajib diisi" }, { status: 400 })
  }

  // Processed concurrently — Promise.all preserves output order by input
  // index regardless of completion timing, so results stay aligned with
  // body.orders even though each order's calls resolve independently.
  const results = await Promise.all(
    body.orders.map(async ({ orderSn, method }) => {
      let resolvedMethod: ShipMethod

      if (method.kind === "pickup") {
        const param = await getShippingParameter(orderSn)
        if (!param.pickup) {
          return { orderSn, success: false, error: "Tidak ada slot pickup tersedia untuk order ini" }
        }
        if (!param.pickup.timeSlotId) {
          return { orderSn, success: false, error: "Tidak ada slot waktu pickup tersedia untuk order ini" }
        }
        resolvedMethod = { kind: "pickup", addressId: param.pickup.addressId, timeSlotId: param.pickup.timeSlotId }
      } else {
        resolvedMethod = { kind: "dropoff", branchId: method.branchId }
      }

      const outcome = await shipOrder(orderSn, resolvedMethod)
      return outcome.success
        ? { orderSn, success: true }
        : { orderSn, success: false, error: outcome.error }
    }),
  )

  return NextResponse.json({ results })
}
