import type { DiscordOption } from "../types"
import { getOption, rupiah } from "../format"
import { getProductsPage } from "@/lib/products/service"

export async function handleProdukCari(options: DiscordOption[] | undefined): Promise<string> {
  const kata = String(getOption(options, "kata") ?? "").trim()
  if (!kata) return "❌ Kata kunci wajib diisi."

  const page = await getProductsPage({ page: 1, limit: 5, q: kata, status: "all" })
  if (page.products.length === 0) return `Tidak ada produk cocok untuk \`${kata}\`.`

  const lines = page.products.map(p => {
    const harga = p.priceMin === p.priceMax ? rupiah(p.priceMin) : `${rupiah(p.priceMin)}–${rupiah(p.priceMax)}`
    const hpp = p.hpp != null ? rupiah(p.hpp) : "—"
    const margin = p.grossMargin30d != null ? `${Math.round(p.grossMargin30d)}%` : "—"
    return `• **${p.name}**\n  harga ${harga} · HPP ${hpp} · margin ${margin} · stok ${p.stockTotal}`
  })
  return `🔎 Hasil untuk \`${kata}\` (${page.total} total):\n${lines.join("\n")}`
}
