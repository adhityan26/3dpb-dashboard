import { prisma } from '@/lib/db'
import type { ProdukInternalData, ProdukInternalInput } from './types'

const INCLUDE_ALL = {
  primaryKalkulasi: {
    include: {
      plates: { orderBy: { urutan: 'asc' as const } },
    },
  },
  shopeeLinks: true,
  history: {
    select: { qty: true, tanggal: true },
    orderBy: { tanggal: 'desc' as const },
    take: 200,
  },
} as const

function toProdukInternalData(raw: any): ProdukInternalData {
  const k = raw.primaryKalkulasi ?? null
  const history = raw.history ?? []
  const historyStats = history.length > 0 ? {
    totalQty: history.reduce((s: number, h: any) => s + h.qty, 0),
    totalRuns: history.length,
    lastPrintedAt: history[0]?.tanggal instanceof Date
      ? history[0].tanggal.toISOString()
      : history[0]?.tanggal ? String(history[0].tanggal) : null,
  } : null
  return {
    id: raw.id,
    nama: raw.nama,
    deskripsi: raw.deskripsi ?? null,
    kategori: raw.kategori ?? null,
    tags: raw.tags ? raw.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    sourceModel: raw.sourceModel ?? null,
    imageUrl: raw.imageUrl ?? null,
    primaryKalkulasiId: raw.primaryKalkulasiId ?? null,
    hppTotal: k ? (k.hppTotal ?? null) : null,
    floorPrice: k ? (k.floorPrice ?? null) : null,
    offlineA: k ? (k.offlineA ?? null) : null,
    shopeeA: k ? (k.shopeeA ?? null) : null,
    hargaShopeeAktual: k ? (k.hargaShopeeAktual ?? null) : null,
    kalkulasiStatus: k ? (k.status ?? null) : null,
    kalkulasiNama: k ? (k.nama ?? null) : null,
    kalkulasiBatch: k ? (k.batch ?? null) : null,
    plates: (k?.plates ?? []).map((p: any) => ({
      namaPart: p.namaPart ?? null,
      tipe: p.tipe,
      printer: p.printer ?? null,
      gramasi: p.gramasi,
      durasiJam: p.durasiJam,
    })),
    shopeeLinks: (raw.shopeeLinks ?? []).map((l: any) => ({
      id: l.id,
      shopeeItemId: l.shopeeItemId,
    })),
    historyStats,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
  }
}

export async function listKatalog(): Promise<ProdukInternalData[]> {
  const rows = await prisma.produkInternal.findMany({
    include: INCLUDE_ALL,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toProdukInternalData)
}

export async function getKatalog(id: string): Promise<ProdukInternalData | null> {
  const row = await prisma.produkInternal.findUnique({
    where: { id },
    include: INCLUDE_ALL,
  })
  if (!row) return null
  return toProdukInternalData(row)
}

function toTagsString(tags?: string[] | null): string | null {
  return tags?.length ? tags.map(t => t.trim()).filter(Boolean).join(',') : null
}

export async function createKatalog(input: ProdukInternalInput): Promise<ProdukInternalData> {
  const row = await prisma.produkInternal.create({
    data: {
      nama: input.nama.trim(),
      deskripsi: input.deskripsi?.trim() ?? null,
      kategori: input.kategori?.trim() ?? null,
      tags: toTagsString(input.tags),
      sourceModel: input.sourceModel?.trim() ?? null,
    },
    include: INCLUDE_ALL,
  })
  return toProdukInternalData(row)
}

export async function updateKatalog(
  id: string,
  input: ProdukInternalInput,
): Promise<ProdukInternalData> {
  const row = await prisma.produkInternal.update({
    where: { id },
    data: {
      nama: input.nama.trim(),
      deskripsi: input.deskripsi?.trim() ?? null,
      kategori: input.kategori?.trim() ?? null,
      tags: toTagsString(input.tags),
      sourceModel: input.sourceModel?.trim() ?? null,
    },
    include: INCLUDE_ALL,
  })
  return toProdukInternalData(row)
}

export async function deleteKatalog(id: string): Promise<void> {
  await prisma.produkInternal.delete({ where: { id } })
}

/**
 * Adds a Shopee item link to a ProdukInternal.
 * Uses upsert to be idempotent (@@unique ensures no duplicates).
 */
export async function addShopeeLink(
  produkInternalId: string,
  shopeeItemId: string,
): Promise<void> {
  await prisma.produkInternalShopeeLink.upsert({
    where: {
      produkInternalId_shopeeItemId: { produkInternalId, shopeeItemId },
    },
    create: { produkInternalId, shopeeItemId },
    update: {},
  })
}

export async function removeShopeeLink(
  produkInternalId: string,
  shopeeItemId: string,
): Promise<void> {
  await prisma.produkInternalShopeeLink.delete({
    where: {
      produkInternalId_shopeeItemId: { produkInternalId, shopeeItemId },
    },
  })
}

export async function setKatalogKalkulasi(
  id: string,
  kalkulasiId: string | null,
): Promise<ProdukInternalData> {
  const row = await prisma.produkInternal.update({
    where: { id },
    data: { primaryKalkulasiId: kalkulasiId },
    include: INCLUDE_ALL,
  })
  return toProdukInternalData(row)
}
