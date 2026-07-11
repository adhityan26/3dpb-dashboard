import { prisma } from '@/lib/db'
import type { SettingsV2, ChannelDef } from '@3pb/kalkulator-core'

const CHANNEL_PREFIX = 'kalk.channel.'

function capitalize(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

/**
 * SettingsV2 dari Config kalk.* — channel via key dinamis kalk.channel.<id>
 * (pola sama dengan kalk.packing.*; edit lewat PUT /api/kalkulator/rates existing).
 * failureRatePct global TIDAK ada di sini — di v2 failure rate milik material profile.
 */
export async function loadSettingsV2(): Promise<SettingsV2> {
  const configs = await prisma.config.findMany({ where: { key: { startsWith: 'kalk.' } } })
  const map = Object.fromEntries(configs.map(c => [c.key, c.value]))

  const channels: ChannelDef[] = []
  for (const [key, val] of Object.entries(map)) {
    if (!key.startsWith(CHANNEL_PREFIX)) continue
    const id = key.slice(CHANNEL_PREFIX.length)
    const feeMultiplier = parseFloat(val)
    if (!id || !Number.isFinite(feeMultiplier)) continue
    channels.push({ id, nama: capitalize(id), feeMultiplier })
  }
  channels.sort((a, b) => (a.id === 'offline' ? -1 : b.id === 'offline' ? 1 : a.id.localeCompare(b.id)))

  if (channels.length === 0) {
    const adminEcommerce = parseFloat(map['kalk.adminEcommerce'] ?? '1.2')
    channels.push(
      { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
      { id: 'shopee', nama: 'Shopee', feeMultiplier: Number.isFinite(adminEcommerce) ? adminEcommerce : 1.2 },
    )
  }

  // offline wajib selalu ada (basis harga tanpa fee) — meski user mengisi
  // kalk.channel.* tanpa menyertakan offline
  if (!channels.some(c => c.id === 'offline')) {
    channels.unshift({ id: 'offline', nama: 'Offline', feeMultiplier: 1 })
  }

  return {
    failureSpreadPct: parseFloat(map['kalk.failureSpread.pct'] ?? '50'),
    testLayerPct: parseFloat(map['kalk.testLayer.pct'] ?? '5'),
    marginMultipliers: {
      A: parseFloat(map['kalk.margin.a'] ?? '1.1'),
      B: parseFloat(map['kalk.margin.b'] ?? '1.5'),
      C: parseFloat(map['kalk.margin.c'] ?? '2.0'),
    },
    resellerBulkMultiplier: parseFloat(map['kalk.resellerBulk.multiplier'] ?? '1.05'),
    channels,
  }
}
