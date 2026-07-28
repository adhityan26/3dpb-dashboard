// Usage: pnpm tsx scripts/backfill-printer-slug.ts          -> dry-run, cuma print
//        pnpm tsx scripts/backfill-printer-slug.ts --apply  -> beneran tulis ke DB
//
// PENTING: slug HARUS match persis id yang sudah dipublish printer-monitor-core
// ke topik MQTT 3dpb/printers (lihat services/printer-monitor/config.json di
// repo terpisah) — kalau meleset, printer tampil kosong di CYD (lihat spec
// docs/superpowers/specs/2026-07-21-cyd-layout-editor-v2-design.md §5).
// Verifikasi manual tiap baris print sebelum jalankan --apply.
import crypto from "crypto";
import { prisma } from '../lib/db'
import { slugify } from '../lib/utils/slugify'

export function truncateSlugSafe(slug: string, maxLen: number): string {
  if (slug.length <= maxLen) return slug;
  // Potong, sisakan 5 karakter buat suffix hash pendek biar tak collision antar-slug yang truncate ke prefix sama.
  const suffix = crypto.createHash("sha256").update(slug).digest("hex").slice(0, 4);
  return `${slug.slice(0, maxLen - 5)}-${suffix}`;
}

const MAX_SLUG_LEN = 23; // cocok LAYOUT_LIMITS.maxPrinterIdLength (Task 2)

async function auditLongSlugs(apply: boolean) {
  const printers = await prisma.printer.findMany({ where: { slug: { not: null } } });
  const long = printers.filter((p) => (p.slug as string).length > MAX_SLUG_LEN);
  if (long.length === 0) {
    console.log("Semua slug existing sudah ≤ 23 karakter.");
    return;
  }
  console.log(`${long.length} printer dengan slug > ${MAX_SLUG_LEN} karakter:\n`);
  for (const p of long) {
    const proposed = truncateSlugSafe(p.slug as string, MAX_SLUG_LEN);
    console.log(`  ${(p.slug as string).padEnd(30)} (${(p.slug as string).length}) -> ${proposed} (${proposed.length})`);
  }
  if (!apply) {
    console.log("\nDry-run. Verifikasi manual (slug baru harus match ulang ke id MQTT 3dpb/printers");
    console.log("kalau service printer-monitor juga diupdate), baru jalankan --apply.");
    return;
  }
  for (const p of long) {
    await prisma.printer.update({ where: { id: p.id }, data: { slug: truncateSlugSafe(p.slug as string, MAX_SLUG_LEN) } });
  }
  console.log(`\n${long.length} slug di-update.`);
}

async function main() {
  const apply = process.argv.includes('--apply')

  // Audit dan fix slug yang > 23 karakter sebelum proses slug null
  await auditLongSlugs(apply)
  console.log()

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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().finally(() => prisma.$disconnect())
}
