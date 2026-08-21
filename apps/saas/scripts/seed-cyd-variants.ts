import "dotenv/config";
import { prisma } from "../lib/db";

/**
 * Seed idempoten untuk 2 varian CYD yang ada saat ini (dengan/tanpa casing). Model masa depan
 * (ukuran lebih besar/hi-res) tinggal insert row baru -- lihat spec sub-project 1 §"CYD Product
 * Variants". Cek-by-label dulu (bukan upsert Prisma biasa, karena CydVariant tidak punya unique
 * key selain id) supaya aman dijalankan berkali-kali.
 *
 * Usage: pnpm --filter @3pb/saas exec tsx scripts/seed-cyd-variants.ts
 */
const VARIANTS = [
  { label: "CYD Standar (dengan casing)", price: 250000, slotBonus: 10 },
  { label: "CYD Standar (tanpa casing)", price: 180000, slotBonus: 10 },
];

async function main() {
  for (const v of VARIANTS) {
    const existing = await prisma.cydVariant.findFirst({ where: { label: v.label } });
    if (existing) {
      console.log(`Sudah ada, dilewati: ${v.label} (${existing.id})`);
      continue;
    }
    const created = await prisma.cydVariant.create({ data: v });
    console.log(`Dibuat: ${v.label} (${created.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
