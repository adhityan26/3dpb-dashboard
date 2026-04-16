import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveFilamentToCatalog } from '@/lib/filamen/catalog-mapper'
import type { FilamentCatalogEntry } from '@/lib/filamen/types'

const SHEETS: { type: 'swoosh' | 'clickers'; url: string }[] = [
  {
    type: 'swoosh',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRmZCxW1eEcen77HbLA1WSVc0Um6zaWNQtpn1sTMZEedbFT0R4gWXrlM-4yOF9I59Mh08WoYVNNCk_i/pub?gid=0&single=true&output=csv',
  },
  {
    type: 'clickers',
    url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRmZCxW1eEcen77HbLA1WSVc0Um6zaWNQtpn1sTMZEedbFT0R4gWXrlM-4yOF9I59Mh08WoYVNNCk_i/pub?gid=20301720&single=true&output=csv',
  },
]

interface SlotEntry {
  productType: 'swoosh' | 'clickers'
  variantName: string
  slotNumber: number
  filamentName: string
}

function parseCsv(csv: string, productType: 'swoosh' | 'clickers'): SlotEntry[] {
  const lines = csv.trim().split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return []

  const results: SlotEntry[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim())
    const variantName = cols[0]?.replace(/^\uFEFF/, '') // strip BOM
    if (!variantName) continue

    for (let slot = 1; slot <= 8; slot++) {
      const filamentName = cols[slot]
      if (filamentName) {
        results.push({ productType, variantName, slotNumber: slot, filamentName })
      }
    }
  }
  return results
}

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pre-fetch catalog once for auto color mapping
  const catalog: FilamentCatalogEntry[] = await prisma.filamentCatalog.findMany()

  let totalUpserted = 0
  let totalDeleted = 0

  for (const sheet of SHEETS) {
    const res = await fetch(sheet.url, { next: { revalidate: 0 } })
    if (!res.ok) throw new Error(`Gagal fetch ${sheet.type}: HTTP ${res.status}`)
    const csv = await res.text()
    const newSlots = parseCsv(csv, sheet.type)

    // Get existing slots for this product type
    const existing = await prisma.amsSlot.findMany({
      where: { productType: sheet.type },
    })

    // Build lookup set for new slots
    const newKeys = new Set(newSlots.map((s) => `${s.variantName}|||${s.slotNumber}`))

    // Delete slots no longer in sheet (preserve DB rows so spool assignments aren't lost for kept slots)
    const toDelete = existing.filter(
      (e) => !newKeys.has(`${e.variantName}|||${e.slotNumber}`)
    )
    if (toDelete.length > 0) {
      await prisma.amsSlot.deleteMany({ where: { id: { in: toDelete.map((e) => e.id) } } })
      totalDeleted += toDelete.length
    }

    // Upsert all new slots (keeps existing spoolId; auto-maps catalogId)
    for (const slot of newSlots) {
      const catalogMatch = resolveFilamentToCatalog(slot.filamentName, catalog)
      await prisma.amsSlot.upsert({
        where: {
          productType_variantName_slotNumber: {
            productType: slot.productType,
            variantName: slot.variantName,
            slotNumber: slot.slotNumber,
          },
        },
        update: {
          filamentName: slot.filamentName,
          catalogId: catalogMatch?.id ?? null,
          updatedAt: new Date(),
        },
        create: {
          productType: slot.productType,
          variantName: slot.variantName,
          slotNumber: slot.slotNumber,
          filamentName: slot.filamentName,
          catalogId: catalogMatch?.id ?? null,
          updatedAt: new Date(),
        },
      })
      totalUpserted++
    }
  }

  // Update last sync time
  await prisma.config.upsert({
    where: { key: 'last_ams_sync' },
    update: { value: new Date().toISOString(), updatedAt: new Date() },
    create: { key: 'last_ams_sync', value: new Date().toISOString(), updatedAt: new Date() },
  })

  return NextResponse.json({ upserted: totalUpserted, deleted: totalDeleted })
}
