/** Bentuk data kalkulasi khusus bot Discord — dikurasi, bukan passthrough model DB.
 *  Spec: docs/superpowers/specs/2026-07-28-bot-api-kalkulasi-read-design.md */

import { prisma } from '@/lib/db'

/** Pisah satu kolom warna jadi nama vs hex. DB cuma menyimpan SATU string warna
 *  per entry (FilamentEntry.color maupun KalkulasiPlate.color) — isinya bisa nama
 *  ("Red", input manual) atau hex ("#c12026", lazim dari import 3MF). */
export function splitColor(raw: string | null | undefined): { color: string | null; colorHex: string | null } {
  const v = raw?.trim() ?? ''
  if (!v) return { color: null, colorHex: null }
  return v.startsWith('#') ? { color: null, colorHex: v } : { color: v, colorHex: null }
}

/** Kolom KalkulasiPlate yang dipakai view bot. */
export interface PlateRow {
  namaPart: string | null
  tipe: string
  printer: string | null
  gramasi: number
  durasiJam: number
  materialsJson: string | null
  color: string | null
  filamentHargaId: string | null
  filamentHargaPerGram: number | null
}

export interface CatalogRow { brand: string; material: string; colorName: string; colorHex: string }

export interface BotMaterial {
  brand: string | null
  material: string | null
  color: string | null
  colorHex: string | null
  gramasi: number
  isSupport: boolean
  hargaPerGram: number | null
}

/** brand/material kosong dianggap "tidak diketahui" — FilamentEntry.brand bertipe
 *  string non-nullable, tapi import 3MF mengisinya "" saat vendor/type tak terbaca. */
const blankToNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const finiteOr = (v: unknown, fallback: number | null) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/** Parse kolom JSON-array (materialsJson, hargaChannelJson) dengan guard — meniru parseHargaChannel, BUKAN toKalkulasiData
 *  yang mem-parse telanjang. Satu baris rusak tidak boleh menjatuhkan endpoint bot. */
function parseJsonArray(json: string | null): unknown[] | null {
  if (!json) return null
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : null
  } catch { return null }
}

/** Lengkapi sisi warna yang kosong dari FilamentCatalog, dua arah. Pencocokan
 *  brand+material ketat (bukan fuzzy): "PLA" tidak boleh mengisi warna "PLA HS". */
function enrichColor(m: BotMaterial, catalog: CatalogRow[]): BotMaterial {
  if (!m.brand || !m.material) return m
  const sameProduct = catalog.filter(c => eq(c.brand, m.brand!) && eq(c.material, m.material!))
  if (sameProduct.length === 0) return m

  if (m.colorHex && !m.color) {
    // colorHex tidak unik di katalog (@@unique-nya [brand, material, colorName]) —
    // urutkan supaya hasilnya tidak bergantung urutan baris dari DB.
    const hit = sameProduct
      .filter(c => eq(c.colorHex, m.colorHex!))
      .sort((a, b) => a.colorName.localeCompare(b.colorName))[0]
    if (hit) return { ...m, color: hit.colorName }
  }
  if (m.color && !m.colorHex) {
    const hit = sameProduct.find(c => eq(c.colorName, m.color!))
    if (hit) return { ...m, colorHex: hit.colorHex }
  }
  return m
}

function legacyMaterial(p: PlateRow, filamentHargaMap: Map<string, { brand: string; material: string }>): BotMaterial {
  const fh = p.filamentHargaId ? filamentHargaMap.get(p.filamentHargaId) : undefined
  return {
    brand: blankToNull(fh?.brand),
    material: blankToNull(fh?.material) ?? blankToNull(p.tipe),
    ...splitColor(p.color),
    gramasi: p.gramasi,
    isSupport: false,
    hargaPerGram: p.filamentHargaPerGram ?? null,
  }
}

/** Satukan dua bentuk penyimpanan plate (multi-material vs single-material legacy)
 *  jadi satu array materials, supaya bot cuma perlu paham satu kontrak. */
export function toBotMaterials(
  p: PlateRow,
  filamentHargaMap: Map<string, { brand: string; material: string }>,
  catalog: CatalogRow[],
): BotMaterial[] {
  const raw = parseJsonArray(p.materialsJson)
  const entries = (raw ?? [])
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null && !Array.isArray(e))
    .map<BotMaterial>(e => ({
      brand: blankToNull(e.brand),
      material: blankToNull(e.material),
      ...splitColor(typeof e.color === 'string' ? e.color : null),
      gramasi: finiteOr(e.gramasi, 0) as number,
      isSupport: e.isSupport === true,
      hargaPerGram: finiteOr(e.hargaPerGram, null),
    }))

  // Array kosong / rusak / semua elemennya terbuang → legacy. Invarian: materials tidak pernah kosong.
  const materials = entries.length > 0 ? entries : [legacyMaterial(p, filamentHargaMap)]
  return materials.map(m => enrichColor(m, catalog))
}

/** Brand yang muncul di sekumpulan plate — dipakai mempersempit query FilamentCatalog.
 *  Dedup case-insensitive; kosong berarti query katalog bisa dilewati sama sekali. */
export function collectPlateBrands(
  plates: PlateRow[],
  filamentHargaMap: Map<string, { brand: string; material: string }>,
): string[] {
  const seen = new Map<string, string>()
  const add = (raw: unknown) => {
    const b = blankToNull(raw)
    if (b && !seen.has(b.toLowerCase())) seen.set(b.toLowerCase(), b)
  }
  for (const p of plates) {
    const raw = parseJsonArray(p.materialsJson)
    if (raw) for (const e of raw) if (typeof e === 'object' && e !== null) add((e as Record<string, unknown>).brand)
    if (p.filamentHargaId) add(filamentHargaMap.get(p.filamentHargaId)?.brand)
  }
  return [...seen.values()]
}

export interface BotPlate {
  namaPart: string | null
  tipe: string
  printer: string | null
  durasiJam: number
  gramasiTotal: number
  materials: BotMaterial[]
}

export function toBotPlate(
  p: PlateRow,
  filamentHargaMap: Map<string, { brand: string; material: string }>,
  catalog: CatalogRow[],
): BotPlate {
  const materials = toBotMaterials(p, filamentHargaMap, catalog)
  return {
    namaPart: p.namaPart,
    tipe: p.tipe,
    printer: p.printer,
    durasiJam: p.durasiJam,
    gramasiTotal: materials.reduce((sum, m) => sum + m.gramasi, 0),
    materials,
  }
}

/** Baris KalkulasiHarga + include anak-anaknya, sebatas yang dipakai view bot. */
export interface KalkulasiRow {
  id: string
  nama: string
  createdAt: Date
  updatedAt: Date
  batch: number
  marginTier: string
  status: string
  testLayerEnabled: boolean
  hppProduksi: number; hppKomponen: number; hppFinishing: number; hppTotal: number; floorPrice: number
  shopeeA: number; shopeeB: number; shopeeC: number
  offlineA: number; offlineB: number; offlineC: number
  resellerStd: number; resellerBulk: number
  marginShopeeA: number; marginOfflineA: number
  hargaShopeeAktual: number | null
  hargaOfflineAktual: number | null
  hargaChannelJson: string | null
  plates: PlateRow[]
  komponenKustom: { nama: string; harga: number; qty: number }[]
  labor: { nama: string; jam: number | null; ratePerJam: number | null; flat: number | null }[]
}

/** Snapshot harga per channel. Di-remap eksplisit, bukan spread — HargaChannelV2
 *  punya field `margin` yang tidak masuk kontrak bot. */
function toBotHargaChannel(json: string | null): { channelId: string; A: number; B: number; C: number }[] {
  const raw = parseJsonArray(json)
  if (!raw) return []
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null && !Array.isArray(c))
    .map(c => ({
      channelId: String(c.channelId ?? ''),
      A: finiteOr(c.A, 0) as number,
      B: finiteOr(c.B, 0) as number,
      C: finiteOr(c.C, 0) as number,
    }))
}

/** Seluruh mapping detail hidup di sini — pure, supaya bisa dites tanpa DB.
 *  getKalkulasiForBot tinggal fetch lalu memanggil ini. */
export function toBotDetail(
  r: KalkulasiRow,
  filamentHargaMap: Map<string, { brand: string; material: string }>,
  catalog: CatalogRow[],
) {
  return {
    id: r.id,
    nama: r.nama,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    batch: r.batch,
    marginTier: r.marginTier,
    status: r.status,
    testLayerEnabled: r.testLayerEnabled,
    harga: {
      hppProduksi: r.hppProduksi, hppKomponen: r.hppKomponen, hppFinishing: r.hppFinishing,
      hppTotal: r.hppTotal, floorPrice: r.floorPrice,
      shopeeA: r.shopeeA, shopeeB: r.shopeeB, shopeeC: r.shopeeC,
      offlineA: r.offlineA, offlineB: r.offlineB, offlineC: r.offlineC,
      resellerStd: r.resellerStd, resellerBulk: r.resellerBulk,
      marginShopeeA: r.marginShopeeA, marginOfflineA: r.marginOfflineA,
    },
    aktual: { shopee: r.hargaShopeeAktual ?? null, offline: r.hargaOfflineAktual ?? null },
    plates: r.plates.map(p => toBotPlate(p, filamentHargaMap, catalog)),
    komponen: r.komponenKustom.map(k => ({ nama: k.nama, harga: k.harga, qty: k.qty })),
    labor: r.labor.map(l => ({ nama: l.nama, jam: l.jam ?? null, ratePerJam: l.ratePerJam ?? null, flat: l.flat ?? null })),
    hargaChannel: toBotHargaChannel(r.hargaChannelJson),
  }
}

export const SEARCH_LIMIT_DEFAULT = 5
const SEARCH_LIMIT_MAX = 20

/** limit di-clamp, tidak pernah 400 — bot tidak pantas kena error karena minta 100. */
export function parseLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return SEARCH_LIMIT_DEFAULT
  return Math.min(Math.max(n, 1), SEARCH_LIMIT_MAX)
}

/** Cari kalkulasi tersimpan by nama. `select` sempit — sengaja BUKAN listKalkulasi,
 *  yang menarik INCLUDE_ALL (join plates + komponen + labor + produkLinks) per baris. */
export async function searchKalkulasiRingkas(opts: { q?: string | null; limit: number }) {
  const term = opts.q?.trim() ?? ''
  const where = term ? { nama: { contains: term, mode: 'insensitive' as const } } : {}
  const [rows, total] = await Promise.all([
    prisma.kalkulasiHarga.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      select: {
        id: true, nama: true, createdAt: true, batch: true, status: true,
        hppTotal: true, floorPrice: true, shopeeA: true, offlineA: true,
      },
    }),
    prisma.kalkulasiHarga.count({ where }),
  ])
  return { items: rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })), total }
}

/** Tiga query batch — masing-masing SATU kali untuk seluruh plate, bukan per plate. */
export async function getKalkulasiForBot(id: string) {
  const row = await prisma.kalkulasiHarga.findUnique({
    where: { id },
    include: {
      plates: { orderBy: { urutan: 'asc' } },
      komponenKustom: true,
      labor: { orderBy: { urutan: 'asc' } },
    },
  })
  if (!row) return null

  const fhIds = [...new Set(row.plates.map(p => p.filamentHargaId).filter((v): v is string => !!v))]
  const fhRows = fhIds.length
    ? await prisma.filamentHarga.findMany({ where: { id: { in: fhIds } }, select: { id: true, brand: true, material: true } })
    : []
  const filamentHargaMap = new Map(fhRows.map(f => [f.id, { brand: f.brand, material: f.material }]))

  // Filter brand WAJIB case-insensitive: brand kalkulasi berasal dari vendor slot 3MF /
  // input manual, brand katalog dari manufacturer saat sync — dua sumber, casing bisa beda.
  // `in` yang case-sensitive akan membuang kandidat secara diam-diam.
  const brands = collectPlateBrands(row.plates, filamentHargaMap)
  const catalog = brands.length
    ? await prisma.filamentCatalog.findMany({
        where: { OR: brands.map(b => ({ brand: { equals: b, mode: 'insensitive' as const } })) },
        select: { brand: true, material: true, colorName: true, colorHex: true },
      })
    : []

  return toBotDetail(row, filamentHargaMap, catalog)
}
