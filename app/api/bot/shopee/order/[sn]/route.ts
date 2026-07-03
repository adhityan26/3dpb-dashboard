import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getEscrowDetail } from "@/lib/shopee/escrow"

const SELLER_ORDER_URL = "https://seller.shopee.co.id/portal/sale/order"

export async function GET(req: NextRequest, { params }: { params: Promise<{ sn: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { sn } = await params

  const [details, escrow] = await Promise.all([getOrderDetail([sn]), getEscrowDetail(sn)])
  const detail = details[0]
  if (!detail) return NextResponse.json({ error: `Order ${sn} tidak ditemukan` }, { status: 404 })

  return NextResponse.json({
    orderSn: detail.order_sn,
    status: detail.order_status,
    total: detail.total_amount,
    items: detail.item_list.map(i => ({ name: i.item_name, qty: i.model_quantity_purchased })),
    buyerPaid: escrow ? escrow.buyer_payment_amount : null,
    received: escrow ? escrow.escrow_amount : null,
    url: `${SELLER_ORDER_URL}/${detail.order_sn}`,
  })
}
