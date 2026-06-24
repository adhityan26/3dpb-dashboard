export interface ParsedInvoiceItem {
  namaProduk: string
  qty: number
  hargaPerUnit: number
  channelHarga: "marketplace"
}

export type ParseItemsResult =
  | { ok: true; items: ParsedInvoiceItem[] }
  | { ok: false; error: string }

/**
 * Parse the /invoice buat items string.
 * Format: `nama|qty|harga` per item, items separated by `;`.
 * Example: "Keychain|2|15000; Stand|1|50000"
 */
export function parseInvoiceItems(raw: string): ParseItemsResult {
  const chunks = raw.split(";").map(s => s.trim()).filter(Boolean)
  if (chunks.length === 0) {
    return { ok: false, error: "Items kosong. Format: `nama|qty|harga; nama|qty|harga`" }
  }
  const items: ParsedInvoiceItem[] = []
  for (const chunk of chunks) {
    const parts = chunk.split("|").map(s => s.trim())
    if (parts.length !== 3 || parts.some(p => p === "")) {
      return { ok: false, error: `Format item salah: \`${chunk}\` — harus \`nama|qty|harga\`` }
    }
    const [namaProduk, qtyStr, hargaStr] = parts
    const qty = Number(qtyStr)
    const hargaPerUnit = Number(hargaStr)
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
      return { ok: false, error: `Qty tidak valid pada \`${chunk}\` — harus bilangan bulat > 0` }
    }
    if (!Number.isFinite(hargaPerUnit) || hargaPerUnit <= 0) {
      return { ok: false, error: `Harga tidak valid pada \`${chunk}\` — harus angka > 0` }
    }
    items.push({ namaProduk, qty, hargaPerUnit, channelHarga: "marketplace" })
  }
  return { ok: true, items }
}
