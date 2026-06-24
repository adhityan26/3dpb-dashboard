import type { DiscordInteraction, DiscordOption } from "./types"
import { handleInvoiceBuat, handleInvoiceStatus } from "./commands/invoice"
import { handleShopeeOrder } from "./commands/shopee"
import { handleKalkulator } from "./commands/kalkulator"
import { handleProdukCari } from "./commands/produk"
import { handleOrderPerluCetak } from "./commands/order"
import { handleStokFilament } from "./commands/stok"

function sub(interaction: DiscordInteraction): { name: string; options?: DiscordOption[] } | null {
  const top = interaction.data?.options?.[0]
  if (top && top.options !== undefined && (top as DiscordOption).value === undefined) {
    return { name: top.name, options: top.options }
  }
  return null
}

export async function dispatchCommand(interaction: DiscordInteraction): Promise<string> {
  const name = interaction.data?.name
  const s = sub(interaction)

  if (name === "invoice" && s?.name === "buat") return handleInvoiceBuat(s.options)
  if (name === "invoice" && s?.name === "status") return handleInvoiceStatus(s.options)
  if (name === "shopee" && s?.name === "order") return handleShopeeOrder(s.options)
  if (name === "produk" && s?.name === "cari") return handleProdukCari(s.options)
  if (name === "order" && s?.name === "perlu-cetak") return handleOrderPerluCetak()
  if (name === "stok" && s?.name === "filament") return handleStokFilament(s.options)
  if (name === "kalkulator") return handleKalkulator(interaction.data?.options)

  throw new Error(`Unknown command: ${name}${s ? ` ${s.name}` : ""}`)
}
