import { getReadyToShipOrders } from "@/lib/orders/service"

export async function handleOrderPerluCetak(): Promise<string> {
  const result = await getReadyToShipOrders()
  const perluCetak = result.orders.filter(o => !o.labelPrinted)
  if (perluCetak.length === 0) return "✅ Tidak ada order yang perlu dicetak."
  const lines = perluCetak.slice(0, 15).map(o =>
    `• \`${o.orderSn}\` — ${o.shopeeStatus}${o.buyerUsername ? ` · ${o.buyerUsername}` : ""}`,
  )
  const extra = perluCetak.length > 15 ? `\n…dan ${perluCetak.length - 15} lagi` : ""
  return `🖨️ ${perluCetak.length} order perlu cetak:\n${lines.join("\n")}${extra}`
}
