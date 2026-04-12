import { prisma } from '@/lib/db'
import type { FilamentCatalogEntry } from './types'

interface SpoolmanFilament {
  manufacturer: { name: string }
  material: string
  name: string
  color_hex?: string
}

export async function syncCatalogFromSpoolmanDB(): Promise<{ count: number }> {
  const res = await fetch(
    'https://raw.githubusercontent.com/Donkie/SpoolmanDB/master/filaments.json',
    { next: { revalidate: 0 } }
  )
  if (!res.ok) throw new Error(`SpoolmanDB fetch failed: ${res.status}`)

  const filaments: SpoolmanFilament[] = await res.json()

  let count = 0
  for (const f of filaments) {
    if (!f.color_hex) continue
    await prisma.filamentCatalog.upsert({
      where: {
        brand_material_colorName: {
          brand: f.manufacturer.name,
          material: f.material,
          colorName: f.name,
        },
      },
      update: { colorHex: f.color_hex, syncedAt: new Date() },
      create: {
        brand: f.manufacturer.name,
        material: f.material,
        colorName: f.name,
        colorHex: f.color_hex,
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
