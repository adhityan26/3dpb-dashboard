import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getReadyToShipOrders } from "@/lib/orders/service"

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await getReadyToShipOrders()
  const orders = result.orders
    .filter(o => !o.labelPrinted)
    .map(o => ({ orderSn: o.orderSn, status: o.shopeeStatus, buyer: o.buyerUsername }))
  return NextResponse.json({ orders, count: orders.length })
}
