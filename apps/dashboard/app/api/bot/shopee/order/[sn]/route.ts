import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getEscrowDetail } from "@/lib/shopee/escrow"

const SELLER_ORDER_URL = "https://seller.shopee.co.id/portal/sale/order"

export async function GET(req: NextRequest, { params }: { params: Promise<{ sn: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { sn } = await params

  let details: Awaited<ReturnType<typeof getOrderDetail>>
  try {
    details = await getOrderDetail([sn])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/order_not_found|error_not_found|order.*(not exist|invalid)/i.test(msg)) {
      return NextResponse.json({ error: `Order ${sn} tidak ditemukan` }, { status: 404 })
    }
    throw err
  }
  const detail = details[0]
  if (!detail) return NextResponse.json({ error: `Order ${sn} tidak ditemukan` }, { status: 404 })

  const escrow = await getEscrowDetail(sn)

  const addr = detail.recipient_address

  return NextResponse.json({
    orderSn: detail.order_sn,
    status: detail.order_status,
    total: detail.total_amount,
    currency: detail.currency,
    createTime: detail.create_time,
    updateTime: detail.update_time,
    shipByDate: detail.ship_by_date ?? null,
    daysToShip: detail.days_to_ship ?? null,
    shippingCarrier: detail.shipping_carrier ?? null,
    paymentMethod: detail.payment_method ?? null,
    cod: detail.cod ?? null,
    messageToSeller: detail.message_to_seller ?? null,
    buyer: {
      username: detail.buyer_username ?? null,
      name: addr?.name ?? null,
      phone: addr?.phone ?? null,
      city: addr?.city ?? null,
      district: addr?.district ?? null,
      state: addr?.state ?? null,
      zip: addr?.zipcode ?? null,
      fullAddress: addr?.full_address ?? null,
    },
    items: detail.item_list.map(i => ({
      name: i.item_name,
      qty: i.model_quantity_purchased,
      sku: i.item_sku ?? null,
      variant: i.model_name ?? null,
      variantSku: i.model_sku ?? null,
      priceOriginal: i.model_original_price ?? null,
      priceDiscounted: i.model_discounted_price ?? null,
      imageUrl: i.image_info?.image_url ?? null,
    })),
    money: {
      buyerPaid: escrow ? escrow.buyer_payment_amount : null,
      received: escrow ? escrow.escrow_amount : null,
      commissionFee: escrow ? escrow.commission_fee : null,
      serviceFee: escrow ? escrow.service_fee : null,
      transactionFee: escrow ? escrow.transaction_fee : null,
      actualShippingFee: escrow ? escrow.actual_shipping_fee : null,
    },
    url: `${SELLER_ORDER_URL}/${detail.order_sn}`,
  })
}
