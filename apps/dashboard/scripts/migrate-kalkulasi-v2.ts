/**
 * Migrasi data kalkulasi lama ke bentuk v2 (idempoten):
 * - HELM FINISHING → 3 baris KalkulasiLabor (skip kalau kalkulasi sudah punya labor rows)
 * - gantunganType/switchQty/hasLabel → baris KomponenKustom (skip per-nama kalau sudah ada)
 * Kolom legacy TIDAK dihapus di sini (drop = Fase 0b-2b-2). Harga snapshot dari Config saat migrasi.
 * Jalankan: pnpm --filter shopee-dashboard db:migrate-kalk-v2
 */
import 'dotenv/config'
import { prisma } from '@/lib/db'

async function configNum(key: string, fallback: number): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key } })
  const n = row ? parseFloat(row.value) : NaN
  return Number.isFinite(n) ? n : fallback
}

async function main() {
  const preparer = await configNum('kalk.preparer.perJam', 35000)
  const finisher = await configNum('kalk.finisher.perJam', 75000)
  const switchHarga = await configNum('kalk.switch.perPcs', 2500)
  const labelHarga = await configNum('kalk.label.perLembar', 750)
  const gantunganHarga: Record<string, number> = {
    kew_kew: await configNum('kalk.gantungan.kew_kew', 900),
    ring: await configNum('kalk.gantungan.ring', 800),
    rantai: await configNum('kalk.gantungan.rantai', 350),
    tali: await configNum('kalk.gantungan.tali', 400),
  }

  const all = await prisma.kalkulasiHarga.findMany({
    include: { labor: true, komponenKustom: true },
  })
  let laborMigrated = 0, komponenMigrated = 0

  for (const k of all) {
    // 1. Helm → labor
    if (k.produktType === 'HELM' && k.finishType === 'FINISHING' && k.labor.length === 0) {
      await prisma.kalkulasiLabor.createMany({
        data: [
          { kalkulasiId: k.id, urutan: 1, nama: 'Preparer (sanding + assembly)', jam: k.jamSanding + k.jamAssembly, ratePerJam: preparer },
          { kalkulasiId: k.id, urutan: 2, nama: 'Finisher (painting)', jam: k.jamPainting, ratePerJam: finisher },
          { kalkulasiId: k.id, urutan: 3, nama: 'Consumables finishing', flat: k.flatFinishingCost },
        ],
      })
      laborMigrated++
      console.log(`labor    ${k.nama} (${k.id})`)
    }

    // 2. Aksesori → komponen rows
    const target: { nama: string; harga: number; qty: number }[] = []
    if (k.gantunganType && gantunganHarga[k.gantunganType] !== undefined) {
      target.push({ nama: `Gantungan ${k.gantunganType}`, harga: gantunganHarga[k.gantunganType], qty: 1 })
    }
    if (k.switchQty > 0) target.push({ nama: 'Switch', harga: switchHarga, qty: k.switchQty })
    if (k.hasLabel) target.push({ nama: 'Label', harga: labelHarga, qty: 1 })
    const missing = target.filter(t => !k.komponenKustom.some(existing => existing.nama === t.nama))
    if (missing.length > 0) {
      await prisma.komponenKustom.createMany({ data: missing.map(t => ({ kalkulasiId: k.id, ...t })) })
      komponenMigrated += missing.length
      console.log(`komponen ${k.nama}: +${missing.length}`)
    }
  }

  console.log(`Selesai. ${all.length} kalkulasi diperiksa, ${laborMigrated} dapat labor rows, ${komponenMigrated} baris komponen ditambahkan.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
