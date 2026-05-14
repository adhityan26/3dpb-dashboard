import { prisma } from '@/lib/db'
import type {
  QuotationData, QuotationInput, UpdateQuotationInput,
  QuotationListItem, QuotationItemData, ChannelHarga
} from './types'

function toItemData(raw: any): QuotationItemData {
  return {
    id: raw.id,
    quotationId: raw.quotationId,
    produkInternalId: raw.produkInternalId ?? null,
    namaProduk: raw.namaProduk,
    qty: raw.qty,
    hargaPerUnit: raw.hargaPerUnit,
    channelHarga: raw.channelHarga as ChannelHarga,
    catatan: raw.catatan ?? null,
    subtotal: raw.qty * raw.hargaPerUnit,
  }
}

function toQuotationData(raw: any): QuotationData {
  const items = (raw.items ?? []).map(toItemData)
  const total = items.reduce((s: number, i: QuotationItemData) => s + i.subtotal, 0)
  const dpAmount = raw.dpAmount ?? null
  return {
    id: raw.id,
    nomor: raw.nomor,
    buyerNama: raw.buyerNama,
    buyerContact: raw.buyerContact ?? null,
    catatan: raw.catatan ?? null,
    status: raw.status,
    tanggal: raw.tanggal instanceof Date ? raw.tanggal.toISOString() : String(raw.tanggal),
    dueDate: raw.dueDate ? (raw.dueDate instanceof Date ? raw.dueDate.toISOString() : String(raw.dueDate)) : null,
    dpAmount,
    dpTanggal: raw.dpTanggal ? (raw.dpTanggal instanceof Date ? raw.dpTanggal.toISOString() : String(raw.dpTanggal)) : null,
    items,
    total,
    sisaBayar: dpAmount != null ? Math.max(0, total - dpAmount) : total,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : String(raw.updatedAt),
  }
}

async function generateNomor(): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '')
  const prefix = `INV-${dateStr}-`
  const existing = await prisma.quotation.findMany({
    where: { nomor: { startsWith: prefix } },
    select: { nomor: true },
    orderBy: { nomor: 'desc' },
  })
  const maxSeq = existing.reduce((max, q) => {
    const seq = parseInt(q.nomor.slice(prefix.length)) || 0
    return Math.max(max, seq)
  }, 0)
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`
}

export async function listQuotations(): Promise<QuotationListItem[]> {
  const rows = await prisma.quotation.findMany({
    include: { items: { select: { qty: true, hargaPerUnit: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(raw => {
    const total = (raw.items ?? []).reduce((s: number, i: any) => s + i.qty * i.hargaPerUnit, 0)
    const dpAmount = raw.dpAmount ?? null
    return {
      id: raw.id,
      nomor: raw.nomor,
      buyerNama: raw.buyerNama,
      buyerContact: raw.buyerContact ?? null,
      status: raw.status as any,
      tanggal: raw.tanggal instanceof Date ? raw.tanggal.toISOString() : String(raw.tanggal),
      dueDate: raw.dueDate ? (raw.dueDate instanceof Date ? raw.dueDate.toISOString() : String(raw.dueDate)) : null,
      total,
      dpAmount,
      sisaBayar: dpAmount != null ? Math.max(0, total - dpAmount) : total,
      itemCount: raw.items?.length ?? 0,
      createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : String(raw.createdAt),
    }
  })
}

export async function getQuotation(id: string): Promise<QuotationData | null> {
  const raw = await prisma.quotation.findUnique({
    where: { id },
    include: { items: { orderBy: { id: 'asc' } } },
  })
  if (!raw) return null
  return toQuotationData(raw)
}

export async function createQuotation(input: QuotationInput): Promise<QuotationData> {
  const nomor = await generateNomor()
  const raw = await prisma.quotation.create({
    data: {
      nomor,
      buyerNama: input.buyerNama.trim(),
      buyerContact: input.buyerContact?.trim() ?? null,
      catatan: input.catatan?.trim() ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      items: {
        create: input.items.map(item => ({
          produkInternalId: item.produkInternalId ?? null,
          namaProduk: item.namaProduk,
          qty: item.qty,
          hargaPerUnit: item.hargaPerUnit,
          channelHarga: item.channelHarga,
          catatan: item.catatan?.trim() ?? null,
        })),
      },
    },
    include: { items: { orderBy: { id: 'asc' } } },
  })
  return toQuotationData(raw)
}

export async function updateQuotation(id: string, input: UpdateQuotationInput): Promise<QuotationData> {
  const updateData: any = {}
  if (input.buyerNama !== undefined) updateData.buyerNama = input.buyerNama.trim()
  if (input.buyerContact !== undefined) updateData.buyerContact = input.buyerContact?.trim() ?? null
  if (input.catatan !== undefined) updateData.catatan = input.catatan?.trim() ?? null
  if (input.dueDate !== undefined) updateData.dueDate = input.dueDate ? new Date(input.dueDate) : null
  if (input.status !== undefined) updateData.status = input.status
  if (input.dpAmount !== undefined) updateData.dpAmount = input.dpAmount
  if (input.dpTanggal !== undefined) updateData.dpTanggal = input.dpTanggal ? new Date(input.dpTanggal) : null

  // If items provided, replace all items
  if (input.items !== undefined) {
    await prisma.quotationItem.deleteMany({ where: { quotationId: id } })
    updateData.items = {
      create: input.items.map(item => ({
        produkInternalId: item.produkInternalId ?? null,
        namaProduk: item.namaProduk,
        qty: item.qty,
        hargaPerUnit: item.hargaPerUnit,
        channelHarga: item.channelHarga,
        catatan: item.catatan?.trim() ?? null,
      })),
    }
  }

  const raw = await prisma.quotation.update({
    where: { id },
    data: updateData,
    include: { items: { orderBy: { id: 'asc' } } },
  })
  return toQuotationData(raw)
}

export async function deleteQuotation(id: string): Promise<void> {
  await prisma.quotation.delete({ where: { id } })
}
