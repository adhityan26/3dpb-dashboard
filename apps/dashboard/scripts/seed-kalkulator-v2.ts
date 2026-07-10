/**
 * Seed idempoten data kalkulator v2 dari nilai Config kalk.* existing.
 * Aman dijalankan berulang: create-if-missing, TIDAK pernah menimpa data yang sudah ada.
 *
 * Jalankan: pnpm --filter shopee-dashboard db:seed-kalk-v2
 */
import 'dotenv/config'
import { prisma } from '@/lib/db'

async function configNum(key: string, fallback: number): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key } })
  const n = row ? parseFloat(row.value) : NaN
  return Number.isFinite(n) ? n : fallback
}

async function createIfMissing<T>(exists: () => Promise<T | null>, create: () => Promise<unknown>, label: string) {
  if (await exists()) {
    console.log(`skip   ${label} (sudah ada)`)
    return
  }
  await create()
  console.log(`create ${label}`)
}

async function main() {
  // 1. Printer profile default — dari kalk.mesin.perJam (P1P, hitungan manual user)
  const mesinPerJam = await configNum('kalk.mesin.perJam', 4000)
  await createIfMissing(
    () => prisma.kalkPrinterProfile.findFirst({ where: { isDefault: true } }),
    () => prisma.kalkPrinterProfile.create({
      data: { nama: 'Default (P1P)', mesinPerJam, isDefault: true },
    }),
    `printer profile Default (P1P) mesinPerJam=${mesinPerJam}`,
  )

  // 2. Material profile generik — dari rates FDM/SLA + failure rate global
  const failureRatePct = await configNum('kalk.failureRate.pct', 12)
  const materials = [
    { nama: 'FDM Generik', tipe: 'FDM', hppPerGram: await configNum('kalk.fdm.hppPerGram', 300), jualPerGram: await configNum('kalk.fdm.jualPerGram', 900) },
    { nama: 'SLA Generik', tipe: 'SLA', hppPerGram: await configNum('kalk.sla.hppPerGram', 1750), jualPerGram: await configNum('kalk.sla.jualPerGram', 3500) },
  ]
  for (const m of materials) {
    await createIfMissing(
      () => prisma.kalkMaterialProfile.findUnique({ where: { nama_tipe: { nama: m.nama, tipe: m.tipe } } }),
      () => prisma.kalkMaterialProfile.create({ data: { ...m, failureRatePct } }),
      `material profile ${m.nama}`,
    )
  }

  // 3. Komponen preset — dari gantungan/switch/label Config
  const komponen: { nama: string; harga: number }[] = [
    { nama: 'Gantungan kew-kew', harga: await configNum('kalk.gantungan.kew_kew', 900) },
    { nama: 'Gantungan ring', harga: await configNum('kalk.gantungan.ring', 800) },
    { nama: 'Gantungan rantai', harga: await configNum('kalk.gantungan.rantai', 350) },
    { nama: 'Gantungan tali', harga: await configNum('kalk.gantungan.tali', 400) },
    { nama: 'Switch', harga: await configNum('kalk.switch.perPcs', 2500) },
    { nama: 'Label', harga: await configNum('kalk.label.perLembar', 750) },
  ]
  for (const k of komponen) {
    await createIfMissing(
      () => prisma.komponenPreset.findUnique({ where: { nama: k.nama } }),
      () => prisma.komponenPreset.create({ data: k }),
      `komponen preset ${k.nama} (Rp${k.harga})`,
    )
  }

  // 4. Labor preset — helm tiers existing jadi preset bawaan
  const preparer = await configNum('kalk.preparer.perJam', 35000)
  const finisher = await configNum('kalk.finisher.perJam', 75000)
  const consumables = await configNum('kalk.helm.consumables.default', 55000)
  const HELM_TIERS: Record<string, { s: number; p: number; a: number }> = {
    MINIMAL: { s: 0.5, p: 0.5, a: 0.25 },
    LIGHT: { s: 1.5, p: 1.0, a: 0.5 },
    MEDIUM: { s: 2.5, p: 2.0, a: 0.75 },
    HEAVY: { s: 4.0, p: 3.5, a: 1.0 },
  }
  for (const [tier, t] of Object.entries(HELM_TIERS)) {
    const items = [
      { nama: 'Preparer (sanding + assembly)', jam: t.s + t.a, ratePerJam: preparer },
      { nama: 'Finisher (painting)', jam: t.p, ratePerJam: finisher },
      { nama: 'Consumables finishing', flat: consumables },
    ]
    await createIfMissing(
      () => prisma.laborPreset.findUnique({ where: { nama: `Helm ${tier}` } }),
      () => prisma.laborPreset.create({ data: { nama: `Helm ${tier}`, itemsJson: JSON.stringify(items) } }),
      `labor preset Helm ${tier}`,
    )
  }

  // 5. Channel fee — Config keys dinamis (pola kalk.packing.*)
  const adminEcommerce = await configNum('kalk.adminEcommerce', 1.2)
  const channels: { key: string; value: string }[] = [
    { key: 'kalk.channel.offline', value: '1' },
    { key: 'kalk.channel.shopee', value: String(adminEcommerce) },
  ]
  for (const c of channels) {
    await createIfMissing(
      () => prisma.config.findUnique({ where: { key: c.key } }),
      () => prisma.config.create({ data: c }),
      `config ${c.key}=${c.value}`,
    )
  }

  console.log('Seed kalkulator v2 selesai.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
