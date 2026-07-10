import { prisma } from '@/lib/db'
import { hitungMesinPerJam, type LaborItem } from '@3pb/kalkulator-core'

// ── Printer profile ──────────────────────────────────────────────────────────

export interface PrinterProfileData {
  id: string
  nama: string
  mesinPerJam: number
  watt: number | null
  tarifPerKwh: number | null
  hargaPrinter: number | null
  umurPakaiJam: number | null
  maintenancePerJam: number | null
  isDefault: boolean
}

export interface PrinterProfileInput {
  nama: string
  mesinPerJam?: number
  watt?: number
  tarifPerKwh?: number
  hargaPrinter?: number
  umurPakaiJam?: number
  maintenancePerJam?: number
}

type PrinterRow = PrinterProfileData & { createdAt: Date; updatedAt: Date }

function toPrinterData(r: PrinterRow): PrinterProfileData {
  const { createdAt, updatedAt, ...data } = r
  return data
}

/** mesinPerJam eksplisit menang; kalau tidak ada, derive dari breakdown lengkap. */
function resolveMesinPerJam(input: PrinterProfileInput): number {
  if (input.mesinPerJam !== undefined) return input.mesinPerJam
  if (input.watt !== undefined && input.tarifPerKwh !== undefined
      && input.hargaPrinter !== undefined && input.umurPakaiJam !== undefined) {
    return hitungMesinPerJam({
      watt: input.watt,
      tarifPerKwh: input.tarifPerKwh,
      hargaPrinter: input.hargaPrinter,
      umurPakaiJam: input.umurPakaiJam,
      maintenancePerJam: input.maintenancePerJam,
    })
  }
  throw new Error('INVALID_INPUT')
}

export async function listPrinterProfiles(): Promise<PrinterProfileData[]> {
  const rows = await prisma.kalkPrinterProfile.findMany({ orderBy: [{ isDefault: 'desc' }, { nama: 'asc' }] })
  return rows.map(toPrinterData)
}

export async function createPrinterProfile(input: PrinterProfileInput): Promise<PrinterProfileData> {
  const mesinPerJam = resolveMesinPerJam(input)
  const row = await prisma.kalkPrinterProfile.create({
    data: {
      nama: input.nama.trim(),
      mesinPerJam,
      watt: input.watt ?? null,
      tarifPerKwh: input.tarifPerKwh ?? null,
      hargaPrinter: input.hargaPrinter ?? null,
      umurPakaiJam: input.umurPakaiJam ?? null,
      maintenancePerJam: input.maintenancePerJam ?? null,
    },
  })
  return toPrinterData(row)
}

export async function updatePrinterProfile(id: string, input: Partial<PrinterProfileInput>): Promise<PrinterProfileData> {
  const existing = await prisma.kalkPrinterProfile.findUnique({ where: { id } })
  if (!existing) throw new Error('NOT_FOUND')
  const merged: PrinterProfileInput = {
    nama: input.nama ?? existing.nama,
    mesinPerJam: input.mesinPerJam,
    watt: input.watt ?? existing.watt ?? undefined,
    tarifPerKwh: input.tarifPerKwh ?? existing.tarifPerKwh ?? undefined,
    hargaPrinter: input.hargaPrinter ?? existing.hargaPrinter ?? undefined,
    umurPakaiJam: input.umurPakaiJam ?? existing.umurPakaiJam ?? undefined,
    maintenancePerJam: input.maintenancePerJam ?? existing.maintenancePerJam ?? undefined,
  }
  // Kalau caller tidak mengirim mesinPerJam eksplisit dan tidak ada breakdown lengkap,
  // pertahankan nilai lama.
  let mesinPerJam: number
  try {
    mesinPerJam = resolveMesinPerJam(merged)
  } catch {
    mesinPerJam = existing.mesinPerJam
  }
  const row = await prisma.kalkPrinterProfile.update({
    where: { id },
    data: {
      nama: merged.nama.trim(),
      mesinPerJam,
      watt: merged.watt ?? null,
      tarifPerKwh: merged.tarifPerKwh ?? null,
      hargaPrinter: merged.hargaPrinter ?? null,
      umurPakaiJam: merged.umurPakaiJam ?? null,
      maintenancePerJam: merged.maintenancePerJam ?? null,
    },
  })
  return toPrinterData(row)
}

export async function deletePrinterProfile(id: string): Promise<void> {
  const existing = await prisma.kalkPrinterProfile.findUnique({ where: { id } })
  if (existing?.isDefault) throw new Error('DEFAULT_PROFILE')
  await prisma.kalkPrinterProfile.delete({ where: { id } })
}

export async function setDefaultPrinterProfile(id: string): Promise<void> {
  const existing = await prisma.kalkPrinterProfile.findUnique({ where: { id } })
  if (!existing) throw new Error('NOT_FOUND')
  await prisma.kalkPrinterProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
  await prisma.kalkPrinterProfile.update({ where: { id }, data: { isDefault: true } })
}

// ── Material profile ─────────────────────────────────────────────────────────

export interface MaterialProfileData {
  id: string
  nama: string
  tipe: string
  hppPerGram: number
  jualPerGram: number
  failureRatePct: number
}

export interface MaterialProfileInput {
  nama: string
  tipe: 'FDM' | 'SLA'
  hppPerGram: number
  jualPerGram: number
  failureRatePct: number
}

export async function listMaterialProfiles(): Promise<MaterialProfileData[]> {
  const rows = await prisma.kalkMaterialProfile.findMany({ orderBy: [{ tipe: 'asc' }, { nama: 'asc' }] })
  return rows.map(({ createdAt, updatedAt, ...m }) => m)
}

export async function upsertMaterialProfile(input: MaterialProfileInput): Promise<MaterialProfileData> {
  const data = {
    nama: input.nama.trim(),
    tipe: input.tipe,
    hppPerGram: input.hppPerGram,
    jualPerGram: input.jualPerGram,
    failureRatePct: input.failureRatePct,
  }
  const { createdAt, updatedAt, ...row } = await prisma.kalkMaterialProfile.upsert({
    where: { nama_tipe: { nama: data.nama, tipe: data.tipe } },
    create: data,
    update: { hppPerGram: data.hppPerGram, jualPerGram: data.jualPerGram, failureRatePct: data.failureRatePct },
  })
  return row
}

export async function deleteMaterialProfile(id: string): Promise<void> {
  await prisma.kalkMaterialProfile.delete({ where: { id } })
}

// ── Komponen preset ──────────────────────────────────────────────────────────

export interface KomponenPresetData {
  id: string
  nama: string
  harga: number
  isActive: boolean
}

export async function listKomponenPresets(): Promise<KomponenPresetData[]> {
  const rows = await prisma.komponenPreset.findMany({ orderBy: { nama: 'asc' } })
  return rows.map(({ createdAt, updatedAt, ...k }) => k)
}

export async function upsertKomponenPreset(input: { nama: string; harga: number; isActive?: boolean }): Promise<KomponenPresetData> {
  const nama = input.nama.trim()
  const { createdAt, updatedAt, ...row } = await prisma.komponenPreset.upsert({
    where: { nama },
    create: { nama, harga: input.harga, isActive: input.isActive ?? true },
    update: { harga: input.harga, ...(input.isActive !== undefined && { isActive: input.isActive }) },
  })
  return row
}

export async function deleteKomponenPreset(id: string): Promise<void> {
  await prisma.komponenPreset.delete({ where: { id } })
}

// ── Labor preset ─────────────────────────────────────────────────────────────

export interface LaborPresetData {
  id: string
  nama: string
  items: LaborItem[]
}

function parseItems(itemsJson: string): LaborItem[] {
  try {
    const parsed = JSON.parse(itemsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function validateItems(items: LaborItem[]): void {
  const valid = items.length > 0 && items.every(i =>
    i.nama?.trim() && (((i.jam ?? 0) > 0 && (i.ratePerJam ?? 0) > 0) || (i.flat ?? 0) > 0)
  )
  if (!valid) throw new Error('INVALID_ITEMS')
}

export async function listLaborPresets(): Promise<LaborPresetData[]> {
  const rows = await prisma.laborPreset.findMany({ orderBy: { nama: 'asc' } })
  return rows.map(r => ({ id: r.id, nama: r.nama, items: parseItems(r.itemsJson) }))
}

export async function upsertLaborPreset(input: { nama: string; items: LaborItem[] }): Promise<LaborPresetData> {
  validateItems(input.items)
  const nama = input.nama.trim()
  const itemsJson = JSON.stringify(input.items)
  const row = await prisma.laborPreset.upsert({
    where: { nama },
    create: { nama, itemsJson },
    update: { itemsJson },
  })
  return { id: row.id, nama: row.nama, items: parseItems(row.itemsJson) }
}

export async function deleteLaborPreset(id: string): Promise<void> {
  await prisma.laborPreset.delete({ where: { id } })
}
