import type { MarginTier, ChannelDef } from "@3pb/kalkulator-core"

export interface RekomendasiCell { harga: number; laba: number; marginPct: number }

export interface HasilLike {
  hppTotal: number
  offlineA: number; offlineB: number; offlineC: number
  shopeeA: number; shopeeB: number; shopeeC: number
}

/** Harga per channel×tier sudah ada di `hasil` (offlineA/B/C, shopeeA/B/C), tapi laba/margin
 *  cuma di-precompute buat tier A (marginOfflineA/marginShopeeA) — B/C dihitung di sini,
 *  formula sama persis (net = harga ÷ feeMultiplier channel, margin = (net-hpp)/net). */
export function cellFor(hasil: HasilLike, channelId: string, tier: MarginTier, channels?: ChannelDef[]): RekomendasiCell {
  const isShopee = channelId === "shopee"
  const harga = isShopee
    ? (tier === "A" ? hasil.shopeeA : tier === "B" ? hasil.shopeeB : hasil.shopeeC)
    : (tier === "A" ? hasil.offlineA : tier === "B" ? hasil.offlineB : hasil.offlineC)
  const feeMultiplier = channels?.find(c => c.id === channelId)?.feeMultiplier ?? (isShopee ? 1.2 : 1)
  const net = feeMultiplier > 0 ? harga / feeMultiplier : harga
  const marginPct = net > 0 ? ((net - hasil.hppTotal) / net) * 100 : 0
  return { harga, laba: net - hasil.hppTotal, marginPct }
}
