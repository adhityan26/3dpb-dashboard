import { prisma } from '@/lib/db'
import type { FilamentCatalogEntry } from './types'

const SPOOLMANDB_URL = 'https://donkie.github.io/SpoolmanDB/filaments.json'

interface SpoolmanEntry {
  id: string
  manufacturer: string
  name: string
  material: string
  color_hex?: string | null
}

export async function syncCatalogFromSpoolmanDB(): Promise<{ count: number }> {
  const res = await fetch(SPOOLMANDB_URL, { next: { revalidate: 0 } })
  if (!res.ok) throw new Error(`SpoolmanDB fetch failed: ${res.status}`)

  const entries: SpoolmanEntry[] = await res.json()

  let count = 0
  for (const entry of entries) {
    if (!entry.manufacturer || !entry.material || !entry.name || !entry.color_hex) continue
    const colorHex = entry.color_hex.startsWith('#') ? entry.color_hex : `#${entry.color_hex}`

    await prisma.filamentCatalog.upsert({
      where: {
        brand_material_colorName: {
          brand: entry.manufacturer,
          material: entry.material,
          colorName: entry.name,
        },
      },
      update: { colorHex, syncedAt: new Date() },
      create: {
        brand: entry.manufacturer,
        material: entry.material,
        colorName: entry.name,
        colorHex,
      },
    })
    count++
  }

  return { count }
}

export async function getCatalog(): Promise<FilamentCatalogEntry[]> {
  const rows = await prisma.filamentCatalog.findMany({
    orderBy: [{ brand: 'asc' }, { material: 'asc' }, { colorName: 'asc' }],
  })
  return rows.map((r) => ({
    id: r.id,
    brand: r.brand,
    material: r.material,
    colorName: r.colorName,
    colorHex: r.colorHex,
  }))
}

export async function getCatalogGrouped(): Promise<
  Record<string, Record<string, FilamentCatalogEntry[]>>
> {
  const entries = await getCatalog()
  const grouped: Record<string, Record<string, FilamentCatalogEntry[]>> = {}
  for (const e of entries) {
    grouped[e.brand] ??= {}
    grouped[e.brand][e.material] ??= []
    grouped[e.brand][e.material].push(e)
  }
  return grouped
}
