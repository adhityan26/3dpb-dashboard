import { prisma } from '@/lib/db'
import { hitungKalkulasi } from './formula'
import { loadRates } from './rates'
import type {
  KalkulasiInput, KalkulasiData, KalkulasiProdukInput,
  FilamentHargaData, ResinHargaData, MarginTier
} from './types'

const INCLUDE_ALL = {
  plates: { orderBy: { urutan: 'asc' as const } },
  komponenKustom: true,
  produkLinks: true,
}

function toKalkulasiData(raw: any): KalkulasiData {
  return {
    ...raw,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
    plates: raw.plates ?? [],
    komponenKustom: raw.komponenKustom ?? [],
    produkLinks: raw.produkLinks ?? [],
  }
}

function buildHasil(input: KalkulasiInput, rates: any) {
  return hitungKalkulasi(
    input.plates,
    {
      packingType: input.packingType,
      gantunganType: input.gantunganType,
      switchQty: input.switchQty,
      hasLabel: input.hasLabel,
      komponenKustom: input.komponenKustom,
    },
    input.batch,
    rates,
    input.marginTier as MarginTier,
    input.hargaShopeeAktual
  )
}

export async function listKalkulasi(): Promise<KalkulasiData[]> {
  const items = await prisma.kalkulasiHarga.findMany({
    include: INCLUDE_ALL,
    orderBy: { createdAt: 'desc' },
  })
  return items.map(toKalkulasiData)
}

export async function getKalkulasi(id: string): Promise<KalkulasiData | null> {
  const item = await prisma.kalkulasiHarga.findUnique({ where: { id }, include: INCLUDE_ALL })
  return item ? toKalkulasiData(item) : null
}

export async function createKalkulasi(input: KalkulasiInput): Promise<KalkulasiData> {
  const rates = await loadRates()
  const hasil = buildHasil(input, rates)
  const record = await prisma.kalkulasiHarga.create({
    data: {
      nama: input.nama,
      batch: input.batch,
      marginTier: input.marginTier,
      hargaShopeeAktual: input.hargaShopeeAktual,
      packingType: input.packingType,
      gantunganType: input.gantunganType,
      switchQty: input.switchQty,
      hasLabel: input.hasLabel,
      ...hasil,
      plates: { create: input.plates.map((p, i) => ({ urutan: i + 1, namaPart: p.namaPart, tipe: p.tipe, printer: p.printer, gramasi: p.gramasi, durasiJam: p.durasiJam })) },
      komponenKustom: { create: input.komponenKustom.map(k => ({ nama: k.nama, harga: k.harga, qty: k.qty })) },
    },
    include: INCLUDE_ALL,
  })
  return toKalkulasiData(record)
}

export async function updateKalkulasi(id: string, input: KalkulasiInput): Promise<KalkulasiData> {
  const rates = await loadRates()
  const hasil = buildHasil(input, rates)
  await prisma.$transaction([
    prisma.kalkulasiPlate.deleteMany({ where: { kalkulasiId: id } }),
    prisma.komponenKustom.deleteMany({ where: { kalkulasiId: id } }),
  ])
  const record = await prisma.kalkulasiHarga.update({
    where: { id },
    data: {
      nama: input.nama,
      batch: input.batch,
      marginTier: input.marginTier,
      hargaShopeeAktual: input.hargaShopeeAktual,
      packingType: input.packingType,
      gantunganType: input.gantunganType,
      switchQty: input.switchQty,
      hasLabel: input.hasLabel,
      ...hasil,
      plates: { create: input.plates.map((p, i) => ({ urutan: i + 1, namaPart: p.namaPart, tipe: p.tipe, printer: p.printer, gramasi: p.gramasi, durasiJam: p.durasiJam })) },
      komponenKustom: { create: input.komponenKustom.map(k => ({ nama: k.nama, harga: k.harga, qty: k.qty })) },
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
    packingType: source.packingType as any ?? undefined,
    gantunganType: source.gantunganType ?? undefined,
    switchQty: source.switchQty,
    hasLabel: source.hasLabel,
    plates: source.plates.map(p => ({ namaPart: p.namaPart ?? undefined, tipe: p.tipe as 'FDM' | 'SLA', printer: p.printer ?? undefined, gramasi: p.gramasi, durasiJam: p.durasiJam })),
    komponenKustom: source.komponenKustom.map(k => ({ nama: k.nama, harga: k.harga, qty: k.qty })),
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
  return prisma.filamentHarga.upsert({ where: { brand_material: { brand, material } }, create: { brand, material, hargaPerGram }, update: { hargaPerGram } })
}

export async function deleteFilamentHarga(id: string): Promise<void> {
  await prisma.filamentHarga.delete({ where: { id } })
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
