import type { DiscordOption } from "../types"
import { getOption, rupiah } from "../format"
import { parseInvoiceItems } from "../parse-items"
import { createQuotation, getQuotationByNomor } from "@/lib/invoice/service"

const BASE_URL = "https://dashboard.3dprintingbandung.my.id"

export async function handleInvoiceBuat(options: DiscordOption[] | undefined): Promise<string> {
  const buyer = String(getOption(options, "buyer") ?? "").trim()
  const itemsRaw = String(getOption(options, "items") ?? "")
  const ongkirRaw = getOption(options, "ongkir")
  if (!buyer) return "❌ Nama buyer wajib diisi."

  const parsed = parseInvoiceItems(itemsRaw)
  if (!parsed.ok) return `❌ ${parsed.error}`

  const ongkir = typeof ongkirRaw === "number" ? ongkirRaw : 0
  const inv = await createQuotation({
    buyerNama: buyer,
    ongkir,
    items: parsed.items,
  })
  return `✅ Invoice **${inv.nomor}** dibuat — total ${rupiah(inv.total)}\n${BASE_URL}/tagihan`
}

export async function handleInvoiceStatus(options: DiscordOption[] | undefined): Promise<string> {
  const nomor = String(getOption(options, "nomor") ?? "").trim()
  if (!nomor) return "❌ Nomor invoice wajib diisi."
  const inv = await getQuotationByNomor(nomor)
  if (!inv) return `❌ Invoice \`${nomor}\` tidak ditemukan.`
  return [
    `🧾 **${inv.nomor}** — ${inv.status}`,
    `Total: ${rupiah(inv.total)}`,
    `Sudah bayar: ${rupiah(inv.totalPaid)}`,
    `Sisa: ${rupiah(inv.sisaBayar)}`,
  ].join("\n")
}
