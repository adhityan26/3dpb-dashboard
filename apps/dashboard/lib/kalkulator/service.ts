import { prisma } from '@/lib/db'
import { loadRates } from './rates'
import { loadSettingsV2 } from './settings-v2'
import { listPrinterProfiles, listMaterialProfiles } from './profiles-service'
import { buildHasilV2, resolveMesinAktual, legacyLabor, type ResolveDeps } from './resolve-v2'
import type {
  KalkulasiInput, KalkulasiData, KalkulasiProdukInput,
  FilamentHargaData, ResinHargaData, MarginTier
} from './types'

const INCLUDE_ALL = {
  plates: { orderBy: { urutan: 'asc' as const } },
  komponenKustom: true,
  labor: { orderBy: { urutan: 'asc' as const } },
  produkLinks: true,
}

async function loadDeps(): Promise<ResolveDeps> {
  const [rates, settings, printerProfiles, materialProfiles] = await Promise.all([
    loadRates(), loadSettingsV2(), listPrinterProfiles(), listMaterialProfiles(),
  ])
  return { rates, settings, printerProfiles, materialProfiles }
}

function toKalkulasiData(raw: any): KalkulasiData {
  return {
    ...raw,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
    plates: (raw.plates ?? []).map((p: any) => ({
      ...p,
      materials: p.materialsJson ? JSON.parse(p.materialsJson) : undefined,
      filamentHargaId: p.filamentHargaId ?? undefined,
      hargaPerGram: p.filamentHargaPerGram ?? undefined,
      printerProfileId: p.printerProfileId ?? undefined,
      mesinPerJam: p.mesinPerJam ?? undefined,
    })),
    komponenKustom: raw.komponenKustom ?? [],
    labor: (raw.labor ?? []).map(({ id, kalkulasiId, urutan, ...l }: any) => ({
      nama: l.nama,
      ...(l.jam != null && { jam: l.jam }),
      ...(l.ratePerJam != null && { ratePerJam: l.ratePerJam }),
      ...(l.flat != null && { flat: l.flat }),
    })),
    hargaChannel: raw.hargaChannelJson ? JSON.parse(raw.hargaChannelJson) : undefined,
    produkLinks: raw.produkLinks ?? [],
    produktType: raw.produktType ?? 'SIMPLE',
    finishType: raw.finishType ?? 'RAW',
    jamSanding: raw.jamSanding ?? 0,
    jamPainting: raw.jamPainting ?? 0,
    jamAssembly: raw.jamAssembly ?? 0,
    flatFinishingCost: raw.flatFinishingCost ?? 0,
  }
}

function laborCreate(input: KalkulasiInput, deps: ResolveDeps) {
  const items = input.labor ?? legacyLabor(input, deps.rates)
  return items.map((l, i) => ({ urutan: i + 1, nama: l.nama, jam: l.jam ?? null, ratePerJam: l.ratePerJam ?? null, flat: l.flat ?? null }))
}

function komponenCreate(input: KalkulasiInput) {
  if (input.komponen) return input.komponen.map(k => ({ nama: k.nama, harga: k.harga, qty: k.qty }))
  return input.komponenKustom.map(k => ({ nama: k.nama, harga: k.harga, qty: k.qty }))
}

/** Kolom aksesori legacy — kalau input pakai bentuk baru (komponen[]), null-kan
 *  supaya tidak dobel-hitung lewat resolveInputV2 (yang jatuh balik ke legacyKomponen
 *  hanya saat input.komponen absen). */
function legacyAksesoriCols(input: KalkulasiInput) {
  if (input.komponen) {
    return { packingType: null, gantunganType: null, switchQty: 0, hasLabel: false }
  }
  return {
    packingType: input.packingType,
    gantunganType: input.gantunganType,
    switchQty: input.switchQty,
    hasLabel: input.hasLabel,
  }
}

function platesCreate(input: KalkulasiInput, deps: ResolveDeps) {
  return input.plates.map((p, i) => ({
    urutan: i + 1,
    namaPart: p.namaPart,
    tipe: p.tipe ?? 'FDM',
    printer: p.printer,
    gramasi: p.gramasi ?? 0,
    materialsJson: p.materials ? JSON.stringify(p.materials) : null,
    durasiJam: p.durasiJam,
    filamentHargaId: p.filamentHargaId ?? null,
    filamentHargaPerGram: p.hargaPerGram ?? null,
    printerProfileId: p.printerProfileId ?? null,
    mesinPerJam: resolveMesinAktual(p, deps),
  }))
}

export interface ListKalkulasiOpts { page?: number; limit?: number }

export async function listKalkulasi(opts?: ListKalkulasiOpts): Promise<{ items: KalkulasiData[]; total: number; page?: number; limit?: number }> {
  const paginate = opts?.page !== undefined && opts?.limit !== undefined && opts.limit > 0
  const [rows, total] = await Promise.all([
    prisma.kalkulasiHarga.findMany({
      include: INCLUDE_ALL,
      orderBy: { createdAt: 'desc' },
      ...(paginate && { skip: (Math.max(1, opts!.page!) - 1) * opts!.limit!, take: opts!.limit! }),
    }),
    prisma.kalkulasiHarga.count(),
  ])
  return { items: rows.map(toKalkulasiData), total, ...(paginate && { page: Math.max(1, opts!.page!), limit: opts!.limit! }) }
}

export async function getKalkulasi(id: string): Promise<KalkulasiData | null> {
  const item = await prisma.kalkulasiHarga.findUnique({ where: { id }, include: INCLUDE_ALL })
  return item ? toKalkulasiData(item) : null
}

export async function createKalkulasi(input: KalkulasiInput): Promise<KalkulasiData> {
  const deps = await loadDeps()
  const hasil = buildHasilV2(input, deps)
  const record = await prisma.kalkulasiHarga.create({
    data: {
      nama: input.nama,
      batch: input.batch,
      marginTier: input.marginTier,
      hargaShopeeAktual: input.hargaShopeeAktual,
      hargaOfflineAktual: input.hargaOfflineAktual,
      ...legacyAksesoriCols(input),
      produktType: input.produktType ?? 'SIMPLE',
      finishType: input.finishType ?? 'RAW',
      jamSanding: input.jamSanding ?? 0,
      jamPainting: input.jamPainting ?? 0,
      jamAssembly: input.jamAssembly ?? 0,
      flatFinishingCost: input.flatFinishingCost ?? 0,
      ...hasil,
      plates: { create: platesCreate(input, deps) },
      komponenKustom: { create: komponenCreate(input) },
      labor: { create: laborCreate(input, deps) },
    },
    include: INCLUDE_ALL,
  })
  return toKalkulasiData(record)
}

export async function updateKalkulasi(id: string, input: KalkulasiInput): Promise<KalkulasiData> {
  const deps = await loadDeps()
  const hasil = buildHasilV2(input, deps)
  await prisma.$transaction([
    prisma.kalkulasiPlate.deleteMany({ where: { kalkulasiId: id } }),
    prisma.komponenKustom.deleteMany({ where: { kalkulasiId: id } }),
    prisma.kalkulasiLabor.deleteMany({ where: { kalkulasiId: id } }),
  ])
  const record = await prisma.kalkulasiHarga.update({
    where: { id },
    data: {
      nama: input.nama,
      batch: input.batch,
      marginTier: input.marginTier,
      hargaShopeeAktual: input.hargaShopeeAktual,
      hargaOfflineAktual: input.hargaOfflineAktual,
      ...legacyAksesoriCols(input),
      produktType: input.produktType ?? 'SIMPLE',
      finishType: input.finishType ?? 'RAW',
      jamSanding: input.jamSanding ?? 0,
      jamPainting: input.jamPainting ?? 0,
      jamAssembly: input.jamAssembly ?? 0,
      flatFinishingCost: input.flatFinishingCost ?? 0,
      ...hasil,
      plates: { create: platesCreate(input, deps) },
      komponenKustom: { create: komponenCreate(input) },
      labor: { create: laborCreate(input, deps) },
    },
    include: INCLUDE_ALL,
  })
  return toKalkulasiData(record)
}

export async function deleteKalkulasi(id: string): Promise<void> {
  await prisma.kalkulasiHarga.delete({ where: { id } })
}

export async function duplicateKalkulasi(id: string, newNama: string, newBatch?: number): Promise<KalkulasiData> {
  const source = await getKalkulasi(id)
  if (!source) throw new Error('Kalkulasi not found')
  const input: KalkulasiInput = {
    nama: newNama,
    batch: newBatch ?? source.batch,
    marginTier: source.marginTier as MarginTier,
    hargaShopeeAktual: source.hargaShopeeAktual ?? undefined,
    hargaOfflineAktual: source.hargaOfflineAktual ?? undefined,
    packingType: source.packingType as any ?? undefined,
    gantunganType: source.gantunganType ?? undefined,
    switchQty: source.switchQty,
    hasLabel: source.hasLabel,
    plates: source.plates.map(p => ({ namaPart: p.namaPart ?? undefined, tipe: p.tipe as 'FDM' | 'SLA', printer: p.printer ?? undefined, gramasi: p.gramasi, materials: p.materials, durasiJam: p.durasiJam, filamentHargaId: p.filamentHargaId, hargaPerGram: p.hargaPerGram, printerProfileId: p.printerProfileId ?? undefined })),
    komponenKustom: source.komponenKustom.map(k => ({ nama: k.nama, harga: k.harga, qty: k.qty })),
    produktType: source.produktType as import('./types').ProduktType,
    finishType: source.finishType as import('./types').FinishType,
    jamSanding: source.jamSanding,
    jamPainting: source.jamPainting,
    jamAssembly: source.jamAssembly,
    flatFinishingCost: source.flatFinishingCost,
    labor: source.labor && source.labor.length > 0 ? source.labor : undefined,
  }
  return createKalkulasi(input)
}

export async function addProdukLink(kalkulasiId: string, input: KalkulasiProdukInput): Promise<void> {
  await prisma.kalkulasiProduk.create({ data: { kalkulasiId, shopeeItemId: input.shopeeItemId, namaManual: input.namaManual, isPrimary: input.isPrimary ?? false } })
}

export async function removeProdukLink(linkId: string): Promise<void> {
  await prisma.kalkulasiProduk.delete({ where: { id: linkId } })
}

export async function setPrimaryLink(linkId: string): Promise<void> {
  const link = await prisma.kalkulasiProduk.findUnique({ where: { id: linkId } })
  if (!link) return
  await prisma.kalkulasiProduk.updateMany({
    where: link.shopeeItemId ? { shopeeItemId: link.shopeeItemId } : { namaManual: link.namaManual ?? undefined },
    data: { isPrimary: false },
  })
  await prisma.kalkulasiProduk.update({ where: { id: linkId }, data: { isPrimary: true } })
}

export async function listFilamentHarga(): Promise<FilamentHargaData[]> {
  return prisma.filamentHarga.findMany({ orderBy: [{ brand: 'asc' }, { material: 'asc' }] })
}

export async function upsertFilamentHarga(brand: string, material: string, hargaPerGram: number): Promise<FilamentHargaData> {
  return prisma.filamentHarga.upsert({
    where: { brand_material: { brand, material } },
    create: { brand, material, hargaPerGram, spoolCount: 0 },
    update: { hargaPerGram, spoolCount: 0 }, // manual edit resets spoolCount ke 0
  })
}

export async function deleteFilamentHarga(id: string): Promise<void> {
  await prisma.filamentHarga.delete({ where: { id } })
}

/**
 * Recompute hargaPerGram di FilamentHarga dari moving average harga beli spool.
 * Asumsi: 1 spool = 1000g (standard). hargaBeli dalam Rp per spool.
 * Formula: AVG(hargaBeli) / 1000 = hargaPerGram
 *
 * @param pairs - opsional, filter brand+material tertentu. Jika kosong → recompute semua.
 * @returns jumlah FilamentHarga yang di-upsert
 */
export async function recomputeFilamentHarga(
  pairs?: { brand: string; material: string }[]
): Promise<number> {
  const spools = await prisma.spool.findMany({
    where: {
      hargaBeli: { not: null },
      ...(pairs && pairs.length > 0 && {
        OR: pairs.map(p => ({ brand: p.brand, material: p.material }))
      })
    },
    select: { brand: true, material: true, hargaBeli: true },
  })

  if (spools.length === 0) return 0

  const groups = new Map<string, { total: number; count: number; brand: string; material: string }>()
  for (const s of spools) {
    const key = `${s.brand}||${s.material}`
    const g = groups.get(key) ?? { total: 0, count: 0, brand: s.brand, material: s.material }
    g.total += s.hargaBeli!
    g.count++
    groups.set(key, g)
  }

  // Upsert FilamentHarga per group - dalam transaction untuk atomicity
  const upsertOps = []
  for (const g of groups.values()) {
    const hargaPerGram = Math.round(g.total / g.count / 1000 * 10) / 10
    upsertOps.push(
      prisma.filamentHarga.upsert({
        where: { brand_material: { brand: g.brand, material: g.material } },
        update: { hargaPerGram, spoolCount: g.count },
        create: { brand: g.brand, material: g.material, hargaPerGram, spoolCount: g.count },
      })
    )
  }
  await prisma.$transaction(upsertOps)
  return upsertOps.length
}

export async function listResinHarga(): Promise<ResinHargaData[]> {
  return prisma.resinHarga.findMany({ orderBy: [{ brand: 'asc' }, { grade: 'asc' }] })
}

export async function upsertResinHarga(brand: string, grade: string, hargaPerGram: number): Promise<ResinHargaData> {
  return prisma.resinHarga.upsert({ where: { brand_grade: { brand, grade } }, create: { brand, grade, hargaPerGram }, update: { hargaPerGram } })
}

export async function deleteResinHarga(id: string): Promise<void> {
  await prisma.resinHarga.delete({ where: { id } })
}
