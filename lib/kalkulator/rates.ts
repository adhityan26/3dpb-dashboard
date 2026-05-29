import { prisma } from '@/lib/db'
import type { KalkulatorRates } from './types'

export async function loadRates(): Promise<KalkulatorRates> {
  const configs = await prisma.config.findMany({
    where: { key: { startsWith: 'kalk.' } },
  })
  const map = Object.fromEntries(configs.map(c => [c.key, c.value]))

  const packing: Record<string, number> = { S: 1500, M: 2500, L: 5000, XL: 8000 }
  const gantungan: Record<string, number> = { kew_kew: 900, ring: 800, rantai: 350, tali: 400 }

  for (const [key, val] of Object.entries(map)) {
    if (key.startsWith('kalk.packing.')) packing[key.replace('kalk.packing.', '')] = parseFloat(val)
    if (key.startsWith('kalk.gantungan.')) gantungan[key.replace('kalk.gantungan.', '')] = parseFloat(val)
  }

  return {
    fdmHppPerGram:  parseFloat(map['kalk.fdm.hppPerGram']  ?? '300'),
    fdmJualPerGram: parseFloat(map['kalk.fdm.jualPerGram'] ?? '900'),
    slaHppPerGram:  parseFloat(map['kalk.sla.hppPerGram']  ?? '1750'),
    slaJualPerGram: parseFloat(map['kalk.sla.jualPerGram'] ?? '3500'),
    mesinPerJam:    parseFloat(map['kalk.mesin.perJam']     ?? '4000'),
    adminEcommerce: parseFloat(map['kalk.adminEcommerce']   ?? '1.2'),
    switchPerPcs:   parseFloat(map['kalk.switch.perPcs']    ?? '2500'),
    labelPerLembar: parseFloat(map['kalk.label.perLembar']  ?? '750'),
    packing,
    gantungan,
    failureRatePct:   parseFloat(map['kalk.failureRate.pct']   ?? '12'),
    failureSpreadPct: parseFloat(map['kalk.failureSpread.pct'] ?? '50'),
    testLayerPct:     parseFloat(map['kalk.testLayer.pct']     ?? '5'),
  }
}

export async function updateRate(key: string, value: string): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}
