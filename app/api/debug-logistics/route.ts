import { auth } from "@/lib/auth"
import { shopeeRequest } from "@/lib/shopee/client"
import { getReadyToShipOrders } from "@/lib/orders/service"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orders = await getReadyToShipOrders()
  const sampleSns = orders.orders.slice(0, 5).map((o) => o.orderSn)

  if (sampleSns.length === 0) {
    return NextResponse.json({ message: "No orders to probe" })
  }

  const raw = await shopeeRequest("/api/v2/logistics/get_shipping_document_result", {
    order_sn_list: sampleSns.join(","),
  })

  return NextResponse.json({ sampleSns, raw })
}
