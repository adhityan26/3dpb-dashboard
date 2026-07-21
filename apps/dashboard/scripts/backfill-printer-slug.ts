// Usage: pnpm tsx scripts/backfill-printer-slug.ts          -> dry-run, cuma print
//        pnpm tsx scripts/backfill-printer-slug.ts --apply  -> beneran tulis ke DB
//
// PENTING: slug HARUS match persis id yang sudah dipublish printer-monitor-core
// ke topik MQTT 3dpb/printers (lihat services/printer-monitor/config.json di
// repo terpisah) — kalau meleset, printer tampil kosong di CYD (lihat spec
// docs/superpowers/specs/2026-07-21-cyd-layout-editor-v2-design.md §5).
// Verifikasi manual tiap baris print sebelum jalankan --apply.
import { prisma } from '../lib/db'
import { slugify } from '../lib/utils/slugify'

async function main() {
  const apply = process.argv.includes('--apply')
  const printers = await prisma.printer.findMany({ where: { slug: null } })

  if (printers.length === 0) {
    console.log('Semua printer sudah punya slug.')
    return
  }

  console.log(`${printers.length} printer belum punya slug:\n`)
  for (const p of printers) {
    const proposed = slugify(p.name)
    console.log(`  ${p.name.padEnd(20)} -> ${proposed}`)
  }

  if (!apply) {
    console.log('\nDry-run selesai. Verifikasi manual daftar di atas cocok dengan')
    console.log('id MQTT 3dpb/printers (mosquitto_sub -t 3dpb/printers), baru jalankan:')
    console.log('  pnpm tsx scripts/backfill-printer-slug.ts --apply')
    return
  }

  for (const p of printers) {
    await prisma.printer.update({ where: { id: p.id }, data: { slug: slugify(p.name) } })
  }
  console.log(`\n${printers.length} printer di-update.`)
}

main().finally(() => prisma.$disconnect())
