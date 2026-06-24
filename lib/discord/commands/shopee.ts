import type { DiscordOption } from "../types"
import { getOption, rupiah } from "../format"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getEscrowDetail } from "@/lib/shopee/escrow"

const SELLER_ORDER_URL = "https://seller.shopee.co.id/portal/sale/order"

export async function handleShopeeOrder(options: DiscordOption[] | undefined): Promise<string> {
  const sn = String(getOption(options, "sn") ?? "").trim()
  if (!sn) return "❌ Order SN wajib diisi."

  const [details, escrow] = await Promise.all([
    getOrderDetail([sn]),
    getEscrowDetail(sn),
  ])
  const detail = details[0]
  if (!detail) return `❌ Order \`${sn}\` tidak ditemukan.`

  const itemLines = detail.item_list
    .map(i => `• ${i.item_name} ×${i.model_quantity_purchased}`)
    .join("\n")

  const lines = [
    `📦 **${detail.order_sn}** — ${detail.order_status}`,
    itemLines,
    `Total: ${rupiah(detail.total_amount)}`,
  ]
  if (escrow) {
    lines.push(`Buyer bayar: ${rupiah(escrow.buyer_payment_amount)}`)
    lines.push(`Diterima (escrow): ${rupiah(escrow.escrow_amount)}`)
  }
  lines.push(`${SELLER_ORDER_URL}/${detail.order_sn}`)
  return lines.join("\n")
}
