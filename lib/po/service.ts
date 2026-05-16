import { prisma } from '@/lib/db'
import type { POData, POInput, UpdatePOInput, POListItem, POStatus } from './types'

function toItemData(raw: any) {
  return {
    id: raw.id, poId: raw.poId, namaProduct: raw.namaProduct,
    kode: raw.kode ?? null, qty: raw.qty, uom: raw.uom,
    harga: raw.harga, diskon: raw.diskon, total: raw.total,
    isFilament: Boolean(raw.isFilament), brand: raw.brand ?? null,
    material: raw.material ?? null, colorName: raw.colorName ?? null,
    filamentCatalogId: raw.filamentCatalogId ?? null,
  }
}

function toPOData(raw: any): POData {
  const items = (raw.items ?? []).map(toItemData)
  return {
    id: raw.id, nomor: raw.nomor ?? null, vendorNama: raw.vendorNama,
    tanggal: raw.tanggal instanceof Date ? raw.tanggal.toISOString() : String(raw.tanggal),
    status: raw.status as POStatus, catatan: raw.catatan ?? null, items,
    grandTotal: items.reduce((s: number, i: any) => s + i.total, 0),
    filamentItemCount: items.filter((i: any) => i.isFilament).length,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt),
  }
}

export async function listPO(): Promise<POListItem[]> {
  const rows = await prisma.purchaseOrder.findMany({
    include: { items: { select: { total: true, isFilament: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(raw => ({
    id: raw.id, nomor: raw.nomor ?? null, vendorNama: raw.vendorNama,
    tanggal: raw.tanggal instanceof Date ? raw.tanggal.toISOString() : String(raw.tanggal),
    status: raw.status as POStatus,
    itemCount: raw.items.length,
    grandTotal: raw.items.reduce((s, i) => s + i.total, 0),
    filamentItemCount: raw.items.filter(i => i.isFilament).length,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt),
  }))
}

export async function getPO(id: string): Promise<POData | null> {
  const raw = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: { orderBy: { id: 'asc' } } },
  })
  if (!raw) return null
  return toPOData(raw)
}

export async function createPO(input: POInput): Promise<POData> {
  const raw = await prisma.purchaseOrder.create({
    data: {
      nomor: input.nomor ?? null,
      vendorNama: input.vendorNama,
      tanggal: input.tanggal ? new Date(input.tanggal) : new Date(),
      catatan: input.catatan ?? null,
      items: {
        create: input.items.map(item => ({
          namaProduct: item.namaProduct,
          kode: item.kode ?? null,
          qty: item.qty, uom: item.uom ?? 'EA',
          harga: item.harga, diskon: item.diskon ?? 0, total: item.total,
          isFilament: item.isFilament ?? false,
          brand: item.brand ?? null, material: item.material ?? null,
          colorName: item.colorName ?? null,
          filamentCatalogId: item.filamentCatalogId ?? null,
        })),
      },
    },
    include: { items: { orderBy: { id: 'asc' } } },
  })
  return toPOData(raw)
}

export async function updatePO(id: string, input: UpdatePOInput): Promise<POData> {
  const data: any = {}
  if (input.nomor !== undefined) data.nomor = input.nomor
  if (input.vendorNama !== undefined) data.vendorNama = input.vendorNama
  if (input.tanggal !== undefined) data.tanggal = new Date(input.tanggal)
  if (input.catatan !== undefined) data.catatan = input.catatan
  if (input.status !== undefined) data.status = input.status

  if (input.items !== undefined) {
    await prisma.purchaseOrderItem.deleteMany({ where: { poId: id } })
    data.items = {
      create: input.items.map(item => ({
        namaProduct: item.namaProduct, kode: item.kode ?? null,
        qty: item.qty, uom: item.uom ?? 'EA',
        harga: item.harga, diskon: item.diskon ?? 0, total: item.total,
        isFilament: item.isFilament ?? false,
        brand: item.brand ?? null, material: item.material ?? null,
        colorName: item.colorName ?? null, filamentCatalogId: item.filamentCatalogId ?? null,
      })),
    }
  }

  const raw = await prisma.purchaseOrder.update({
    where: { id }, data,
    include: { items: { orderBy: { id: 'asc' } } },
  })
  return toPOData(raw)
}

export async function deletePO(id: string): Promise<void> {
  await prisma.purchaseOrder.delete({ where: { id } })
}

/**
 * Mark PO as RECEIVED and create Spool records for filament items.
 * 1 qty = 1 Spool roll.
 */
export async function receivePO(id: string): Promise<void> {
  const po = await getPO(id)
  if (!po) throw new Error('PO not found')
  if (po.status === 'RECEIVED') throw new Error('Already received')

  // Create Spool records for filament items
  const spoolsToCreate = []
  for (const item of po.items.filter(i => i.isFilament && i.brand && i.material)) {
    const qty = Math.floor(item.qty) // whole rolls only
    for (let i = 0; i < qty; i++) {
      spoolsToCreate.push({
        brand: item.brand!,
        material: item.material!,
        colorName: item.colorName ?? 'Unknown',
        colorHex: '#808080',  // default gray — can be updated later
        status: 'new',
        notes: `PO: ${po.nomor ?? po.id} - ${item.namaProduct}`,
        catalogId: item.filamentCatalogId ?? null,
      })
    }
  }

  await prisma.$transaction([
    ...spoolsToCreate.map(s => prisma.spool.create({ data: s })),
    prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'RECEIVED' },
    }),
  ])
}
