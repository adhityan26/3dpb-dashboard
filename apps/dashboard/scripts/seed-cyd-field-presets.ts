/**
 * Seed idempoten preset field CYD (Ringkas + Detail) — nilai persis dari
 * FIELD_PRESETS lama (lib/cyd-layout/types.ts) sebelum dipindah ke DB.
 * Aman dijalankan berulang: create-if-missing by name, tidak menimpa data yang sudah ada.
 *
 * Jalankan: pnpm --filter shopee-dashboard db:seed-cyd-presets
 */
import 'dotenv/config'
import { prisma } from '@/lib/db'

const PRESETS = [
  { name: 'Ringkas', fields: [['name'], ['state', 'progress'], ['progressBar']] },
  {
    name: 'Detail',
    fields: [
      ['name', 'type'],
      ['state', 'progress'],
      ['progressBar'],
      [{ id: 'timeLeft', label: 'Sisa' }, { id: 'eta', label: 'ETA' }],
      ['filename'],
    ],
  },
] as const

async function main() {
  for (const p of PRESETS) {
    const existing = await prisma.cydFieldPreset.findFirst({ where: { name: p.name } })
    if (existing) {
      console.log(`skip   ${p.name} (sudah ada)`)
      continue
    }
    await prisma.cydFieldPreset.create({ data: { name: p.name, fieldsJson: JSON.stringify(p.fields) } })
    console.log(`create ${p.name}`)
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
