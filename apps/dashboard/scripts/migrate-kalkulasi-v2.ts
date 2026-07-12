/**
 * Migrasi data kalkulasi lama ke bentuk v2 (idempoten):
 * - HELM FINISHING → 3 baris KalkulasiLabor (skip kalau kalkulasi sudah punya labor rows)
 * - gantunganType/switchQty/hasLabel → baris KomponenKustom (skip per-nama kalau sudah ada),
 *   lalu kolom sumber di-null-kan (gantunganType → null, switchQty → 0, hasLabel → false)
 *   supaya legacyKomponen() (resolve-v2.ts) tidak membaca kolom LAGI di edit/duplicate
 *   berikutnya (double-count). Run ulang aman: kolom sudah null/0/false → target kosong → skip.
 *   Kalau record dibuat/diedit lagi lewat UI legacy setelah run pertama (kolom terisi lagi),
 *   run berikutnya akan memigrasi bersih tanpa re-poison — bukan menambah baris duplikat,
 *   karena `missing` di-dedupe terhadap komponenKustom yang sudah ada per-nama.
 * Kolom labor lama (jamSanding/jamPainting/jamAssembly/flatFinishingCost) TIDAK di-null-kan —
 * masih dipakai UI lama untuk form edit, dan tidak double-count karena legacyLabor() di
 * resolve-v2.ts hanya dipakai saat input.labor absen; hasil yang sudah tersimpan (baris
 * KalkulasiLabor) tidak berubah oleh kolom ini. JANGAN ubah perilaku labor.
 * Harga snapshot dari Config saat migrasi.
 * Jalankan: pnpm --filter shopee-dashboard db:migrate-kalk-v2
 */
import 'dotenv/config'
import { prisma } from '@/lib/db'

async function configNum(key: string, fallback: number): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key } })
  const n = row ? parseFloat(row.value) : NaN
  return Number.isFinite(n) ? n : fallback
}

/** Enumerasi semua rate gantungan dari Config (prefix kalk.gantungan.), sama seperti
 *  loadRates() — supaya gantungan custom (bukan cuma 4 default) ikut termigrasi. */
async function loadGantunganHarga(): Promise<Record<string, number>> {
  const rows = await prisma.config.findMany({ where: { key: { startsWith: 'kalk.gantungan.' } } })
  const gantungan: Record<string, number> = { kew_kew: 900, ring: 800, rantai: 350, tali: 400 }
  for (const row of rows) {
    gantungan[row.key.replace('kalk.gantungan.', '')] = parseFloat(row.value)
  }
  return gantungan
}

async function main() {
  const preparer = await configNum('kalk.preparer.perJam', 35000)
  const finisher = await configNum('kalk.finisher.perJam', 75000)
  const switchHarga = await configNum('kalk.switch.perPcs', 2500)
  const labelHarga = await configNum('kalk.label.perLembar', 750)
  const gantunganHarga = await loadGantunganHarga()

  const all = await prisma.kalkulasiHarga.findMany({
    include: { labor: true, komponenKustom: true },
  })
  let laborMigrated = 0, komponenMigrated = 0, kolomDinolkan = 0

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

    // 2. Aksesori → komponen rows, lalu null-kan kolom sumber (anti double-count di legacyKomponen)
    const target: { nama: string; harga: number; qty: number }[] = []
    if (k.gantunganType && gantunganHarga[k.gantunganType] !== undefined) {
      target.push({ nama: `Gantungan ${k.gantunganType}`, harga: gantunganHarga[k.gantunganType], qty: 1 })
    }
    if (k.switchQty > 0) target.push({ nama: 'Switch', harga: switchHarga, qty: k.switchQty })
    if (k.hasLabel) target.push({ nama: 'Label', harga: labelHarga, qty: 1 })

    if (target.length > 0) {
      const missing = target.filter(t => !k.komponenKustom.some(existing => existing.nama === t.nama))
      if (missing.length > 0) {
        await prisma.komponenKustom.createMany({ data: missing.map(t => ({ kalkulasiId: k.id, ...t })) })
        komponenMigrated += missing.length
        console.log(`komponen ${k.nama}: +${missing.length}`)
      }
      await prisma.kalkulasiHarga.update({
        where: { id: k.id },
        data: { gantunganType: null, switchQty: 0, hasLabel: false },
      })
      kolomDinolkan++
      console.log(`kolom    ${k.nama}: gantunganType/switchQty/hasLabel di-null-kan`)
    }
  }

  console.log(`Selesai. ${all.length} kalkulasi diperiksa, ${laborMigrated} dapat labor rows, ${komponenMigrated} baris komponen ditambahkan, ${kolomDinolkan} kalkulasi kolom aksesori di-null-kan.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
