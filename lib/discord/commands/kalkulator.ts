import type { DiscordOption } from "../types"
import { getOption, rupiah } from "../format"
import { loadRates } from "@/lib/kalkulator/rates"
import { hitungKalkulasi } from "@/lib/kalkulator/formula"
import type { MarginTier, PrintTipe } from "@/lib/kalkulator/types"

export async function handleKalkulator(options: DiscordOption[] | undefined): Promise<string> {
  const gramasi = Number(getOption(options, "gramasi") ?? 0)
  const jam = Number(getOption(options, "jam") ?? 0)
  const tipe = (String(getOption(options, "tipe") ?? "FDM") as PrintTipe)
  const tier = (String(getOption(options, "tier") ?? "A") as MarginTier)
  if (gramasi <= 0 || jam <= 0) return "❌ Gramasi dan jam harus > 0."

  const rates = await loadRates()
  const hasil = hitungKalkulasi(
    [{ tipe, gramasi, durasiJam: jam }],
    { switchQty: 0, hasLabel: false, komponenKustom: [] },
    1,
    rates,
    tier,
  )
  return [
    `🧮 **Kalkulasi cepat** (${gramasi}g · ${jam}j · ${tipe} · tier ${tier})`,
    `HPP: ${rupiah(hasil.hppTotal)}`,
    `Floor price: ${rupiah(hasil.floorPrice)}`,
    `Harga Shopee: ${rupiah(hasil.shopeeA)}`,
    `Harga Offline: ${rupiah(hasil.offlineA)}`,
    `Margin Shopee: ${hasil.marginShopeeA}%`,
  ].join("\n")
}
