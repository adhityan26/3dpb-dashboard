import { prisma } from '@/lib/db'
import type {
  QuotationData, QuotationInput, UpdateQuotationInput,
  QuotationListItem, QuotationItemData, ChannelHarga,
  InvoicePaymentData, AddPaymentInput,
} from './types'

// ── helpers ────────────────────────────────────────────────────────────────────

function toIsoString(d: Date | string | null | undefined): string | null {
  if (!d) return null
  if (d instanceof Date) return d.toISOString()
  return String(d)
}

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
    diskon: raw.diskon ?? 0,
    diskonPct: raw.diskonPct ?? null,
    subtotal: raw.qty * raw.hargaPerUnit - (raw.diskon ?? 0),
  }
}

function toPaymentData(raw: any): InvoicePaymentData {
  return {
    id: raw.id,
    quotationId: raw.quotationId,
    tanggal: toIsoString(raw.tanggal)!,
    jumlah: raw.jumlah,
    metode: raw.metode,
    catatan: raw.catatan ?? null,
    createdAt: toIsoString(raw.createdAt)!,
  }
}

function toQuotationData(raw: any): QuotationData {
  const items = (raw.items ?? []).map(toItemData)
  const payments = (raw.payments ?? []).map(toPaymentData)
  const subtotalProduk = items.reduce((s: number, i: QuotationItemData) => s + i.subtotal, 0)
  const ongkir = raw.ongkir ?? 0
  const diskonGlobal = raw.diskonGlobal ?? 0
  const total = subtotalProduk - diskonGlobal + ongkir
  const totalPaid = payments.reduce((s: number, p: InvoicePaymentData) => s + p.jumlah, 0)
  return {
    id: raw.id,
    nomor: raw.nomor,
    buyerNama: raw.buyerNama,
    buyerContact: raw.buyerContact ?? null,
    catatan: raw.catatan ?? null,
    status: raw.status,
    tanggal: toIsoString(raw.tanggal)!,
    dueDate: toIsoString(raw.dueDate),
    ongkir,
    diskonGlobal,
    diskonGlobalPct: raw.diskonGlobalPct ?? null,
    shopeeOrderSn: raw.shopeeOrderSn ?? null,
    items,
    payments,
    subtotalProduk,
    total,
    totalPaid,
    sisaBayar: Math.max(0, total - totalPaid),
    createdAt: toIsoString(raw.createdAt)!,
    updatedAt: toIsoString(raw.updatedAt)!,
  }
}

// Full include for detail queries
const FULL_INCLUDE = {
  items: { orderBy: { id: 'asc' as const } },
  payments: { orderBy: { tanggal: 'asc' as const } },
}

// ── nomor generation ───────────────────────────────────────────────────────────

async function generateNomor(tanggal?: string | null): Promise<string> {
  const date = tanggal ? new Date(tanggal) : new Date()
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
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

// ── status auto-derive helper ──────────────────────────────────────────────────

function deriveStatus(totalPaid: number, total: number, currentStatus: string): string {
  if (totalPaid >= total && total > 0) return 'PAID'
  if (totalPaid > 0) return 'PARTIAL'
  // Revert to a stable non-payment status
  if (currentStatus === 'PAID' || currentStatus === 'PARTIAL') {
    return 'SENT'
  }
  return currentStatus
}

// ── public API ─────────────────────────────────────────────────────────────────

export async function listQuotations(): Promise<QuotationListItem[]> {
  const rows = await prisma.quotation.findMany({
    include: {
      items: { select: { qty: true, hargaPerUnit: true, diskon: true } },
      payments: { select: { jumlah: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(raw => {
    const r = raw as any
    const subtotalProduk = (r.items ?? []).reduce((s: number, i: any) => s + (i.qty * i.hargaPerUnit - (i.diskon ?? 0)), 0)
    const ongkir = r.ongkir ?? 0
    const diskonGlobal = r.diskonGlobal ?? 0
    const total = subtotalProduk - diskonGlobal + ongkir
    const totalPaid = (r.payments ?? []).reduce((s: number, p: any) => s + p.jumlah, 0)
    return {
      id: r.id,
      nomor: r.nomor,
      buyerNama: r.buyerNama,
      buyerContact: r.buyerContact ?? null,
      status: r.status as any,
      tanggal: toIsoString(r.tanggal)!,
      dueDate: toIsoString(r.dueDate),
      ongkir,
      shopeeOrderSn: r.shopeeOrderSn ?? null,
      total,
      totalPaid,
      sisaBayar: Math.max(0, total - totalPaid),
      itemCount: r.items?.length ?? 0,
      createdAt: toIsoString(r.createdAt)!,
    }
  })
}

export async function getQuotation(id: string): Promise<QuotationData | null> {
  const raw = await prisma.quotation.findUnique({
    where: { id },
    include: FULL_INCLUDE,
  })
  if (!raw) return null
  return toQuotationData(raw)
}

export async function createQuotation(input: QuotationInput): Promise<QuotationData> {
  const nomor = await generateNomor(input.tanggal)
  const raw = await (prisma.quotation.create as any)({
    data: {
      nomor,
      buyerNama: input.buyerNama.trim(),
      buyerContact: input.buyerContact?.trim() ?? null,
      catatan: input.catatan?.trim() ?? null,
      tanggal: input.tanggal ? new Date(input.tanggal) : new Date(),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      ongkir: input.ongkir ?? 0,
      diskonGlobal: input.diskonGlobal ?? 0,
      diskonGlobalPct: input.diskonGlobalPct ?? null,
      shopeeOrderSn: input.shopeeOrderSn?.trim() ?? null,
      items: {
        create: input.items.map(item => ({
          produkInternalId: item.produkInternalId ?? null,
          namaProduk: item.namaProduk,
          qty: item.qty,
          hargaPerUnit: item.hargaPerUnit,
          channelHarga: item.channelHarga,
          catatan: item.catatan?.trim() ?? null,
          diskon: item.diskon ?? 0,
          diskonPct: item.diskonPct ?? null,
        })),
      },
    },
    include: FULL_INCLUDE,
  })
  return toQuotationData(raw)
}

export async function updateQuotation(id: string, input: UpdateQuotationInput): Promise<QuotationData> {
  const updateData: any = {}
  if (input.buyerNama !== undefined) updateData.buyerNama = input.buyerNama.trim()
  if (input.buyerContact !== undefined) updateData.buyerContact = input.buyerContact?.trim() ?? null
  if (input.catatan !== undefined) updateData.catatan = input.catatan?.trim() ?? null
  if (input.dueDate !== undefined) updateData.dueDate = input.dueDate ? new Date(input.dueDate) : null
  if (input.ongkir !== undefined) updateData.ongkir = input.ongkir
  if (input.diskonGlobal !== undefined) updateData.diskonGlobal = input.diskonGlobal
  if (input.diskonGlobalPct !== undefined) updateData.diskonGlobalPct = input.diskonGlobalPct
  if (input.status !== undefined) updateData.status = input.status
  if (input.shopeeOrderSn !== undefined) updateData.shopeeOrderSn = input.shopeeOrderSn

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
        diskon: item.diskon ?? 0,
        diskonPct: item.diskonPct ?? null,
      })),
    }
  }

  const raw = await prisma.quotation.update({
    where: { id },
    data: updateData,
    include: FULL_INCLUDE,
  })
  return toQuotationData(raw)
}

export async function deleteQuotation(id: string): Promise<void> {
  await prisma.quotation.delete({ where: { id } })
}

// ── payment operations ─────────────────────────────────────────────────────────

export async function addPayment(quotationId: string, input: AddPaymentInput): Promise<QuotationData> {
  await prisma.invoicePayment.create({
    data: {
      quotationId,
      tanggal: input.tanggal ? new Date(input.tanggal) : new Date(),
      jumlah: input.jumlah,
      metode: input.metode,
      catatan: input.catatan?.trim() ?? null,
    },
  })
  const raw = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: FULL_INCLUDE })
  return toQuotationData(raw)
}

export async function deletePayment(quotationId: string, paymentId: string): Promise<QuotationData> {
  await prisma.invoicePayment.delete({ where: { id: paymentId } })
  const raw = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: FULL_INCLUDE })
  return toQuotationData(raw)
}
