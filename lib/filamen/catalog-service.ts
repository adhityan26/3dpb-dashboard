import { prisma } from '@/lib/db'
import type { FilamentCatalogEntry } from './types'

const SPOOLMANDB_API = 'https://api.github.com/repos/Donkie/SpoolmanDB/contents/filaments'
const SPOOLMANDB_RAW = 'https://raw.githubusercontent.com/Donkie/SpoolmanDB/main/filaments'

interface SpoolmanColor {
  name: string
  hex: string
}

interface SpoolmanFilamentEntry {
  material: string
  colors?: SpoolmanColor[]
}

interface SpoolmanBrandFile {
  manufacturer: string
  filaments: SpoolmanFilamentEntry[]
}

interface GithubContentItem {
  name: string
  type: string
}

export async function syncCatalogFromSpoolmanDB(): Promise<{ count: number }> {
  // Step 1: get list of brand JSON files
  const listRes = await fetch(SPOOLMANDB_API, {
    headers: { Accept: 'application/vnd.github+json' },
    next: { revalidate: 0 },
  })
  if (!listRes.ok) throw new Error(`SpoolmanDB listing failed: ${listRes.status}`)
  const files: GithubContentItem[] = await listRes.json()
  const brandFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.json'))

  let count = 0
  for (const file of brandFiles) {
    const rawRes = await fetch(`${SPOOLMANDB_RAW}/${file.name}`, { next: { revalidate: 0 } })
    if (!rawRes.ok) continue

    const brand: SpoolmanBrandFile = await rawRes.json()
    const brandName = brand.manufacturer

    for (const filament of brand.filaments) {
      if (!filament.colors?.length) continue
      for (const color of filament.colors) {
        if (!color.hex) continue
        const colorHex = color.hex.startsWith('#') ? color.hex : `#${color.hex}`
        await prisma.filamentCatalog.upsert({
          where: {
            brand_material_colorName: {
              brand: brandName,
              material: filament.material,
              colorName: color.name,
            },
          },
          update: { colorHex, syncedAt: new Date() },
          create: {
            brand: brandName,
            material: filament.material,
            colorName: color.name,
            colorHex,
          },
        })
        count++
      }
    }
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
