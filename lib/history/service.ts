import { prisma } from '@/lib/db'
import type { ProdukHistoryData, ProdukHistoryInput, ProdukHistoryStats } from './types'

function toData(raw: any): ProdukHistoryData {
  return {
    id: raw.id,
    produkInternalId: raw.produkInternalId,
    tanggal: raw.tanggal instanceof Date ? raw.tanggal.toISOString() : String(raw.tanggal),
    qty: raw.qty,
    catatan: raw.catatan ?? null,
    kalkulasiId: raw.kalkulasiId ?? null,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt),
  }
}

export async function listHistory(produkInternalId: string): Promise<ProdukHistoryData[]> {
  const rows = await prisma.produkHistory.findMany({
    where: { produkInternalId },
    orderBy: { tanggal: 'desc' },
  })
  return rows.map(toData)
}

export async function addHistory(
  produkInternalId: string,
  input: ProdukHistoryInput,
): Promise<ProdukHistoryData> {
  const row = await prisma.produkHistory.create({
    data: {
      produkInternalId,
      tanggal: input.tanggal ? new Date(input.tanggal) : new Date(),
      qty: input.qty,
      catatan: input.catatan?.trim() ?? null,
      kalkulasiId: input.kalkulasiId ?? null,
    },
  })
  return toData(row)
}

export async function deleteHistory(id: string): Promise<void> {
  await prisma.produkHistory.delete({ where: { id } })
}

export async function getHistoryStats(produkInternalId: string): Promise<ProdukHistoryStats> {
  const rows = await prisma.produkHistory.findMany({
    where: { produkInternalId },
    select: { qty: true, tanggal: true },
    orderBy: { tanggal: 'desc' },
  })
  return {
    totalQty: rows.reduce((s, r) => s + r.qty, 0),
    totalRuns: rows.length,
    lastPrintedAt: rows[0]?.tanggal
      ? (rows[0].tanggal instanceof Date ? rows[0].tanggal.toISOString() : String(rows[0].tanggal))
      : null,
  }
}
