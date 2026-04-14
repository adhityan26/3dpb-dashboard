import { prisma } from '@/lib/db'
import type { SpoolData, SpoolStatus, SpoolsResponse } from './types'

type PrismaSpoolWithCount = NonNullable<Awaited<ReturnType<typeof prisma.spool.findUnique>>> & {
  _count?: { amsSlots: number }
  spoolmanSpool?: { usedWeight: number; initialWeight: number | null } | null
}

function toSpoolData(s: PrismaSpoolWithCount): SpoolData {
  return {
    id: s.id,
    brand: s.brand,
    material: s.material,
    colorName: s.colorName,
    colorHex: s.colorHex,
    status: s.status as SpoolStatus,
    barcode: s.barcode,
    nfcTagId: s.nfcTagId ?? null,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    assignedSlotCount: s._count?.amsSlots ?? 0,
    usedWeight: s.spoolmanSpool?.usedWeight ?? null,
    initialWeight: s.spoolmanSpool?.initialWeight ?? null,
  }
}

export async function listSpools(): Promise<SpoolsResponse> {
  const spools = await prisma.spool.findMany({
    orderBy: [{ brand: 'asc' }, { colorName: 'asc' }, { createdAt: 'asc' }],
    include: {
      _count: { select: { amsSlots: true } },
      spoolmanSpool: { select: { usedWeight: true, initialWeight: true } },
    },
  })

  const byStatus = { new: 0, full: 0, mid: 0, low: 0, empty: 0 } as Record<SpoolStatus, number>
  for (const s of spools) byStatus[s.status as SpoolStatus]++

  return {
    spools: spools.map(toSpoolData),
    kpi: { total: spools.length, byStatus },
  }
}

export async function getSpoolByBarcode(barcode: string): Promise<SpoolData | null> {
  const s = await prisma.spool.findUnique({
    where: { barcode },
    include: { _count: { select: { amsSlots: true } } },
  })
  if (!s) return null
  return toSpoolData({ ...s, spoolmanSpool: null })
}

export async function getSpoolByNfc(nfcTagId: string): Promise<SpoolData | null> {
  const s = await prisma.spool.findUnique({
    where: { nfcTagId },
    include: { _count: { select: { amsSlots: true } } },
  })
  if (!s) return null
  return toSpoolData({ ...s, spoolmanSpool: null })
}

export interface CreateSpoolInput {
  brand: string
  material: string
  colorName: string
  colorHex: string
  catalogId?: string
  nfcTagId?: string
  notes?: string
}

export async function createSpool(input: CreateSpoolInput): Promise<SpoolData> {
  const s = await prisma.spool.create({
    data: {
      brand: input.brand,
      material: input.material,
      colorName: input.colorName,
      colorHex: input.colorHex,
      catalogId: input.catalogId ?? null,
      nfcTagId: input.nfcTagId ?? null,
      notes: input.notes ?? '',
      status: 'new',
    },
    include: { _count: { select: { amsSlots: true } } },
  })
  return toSpoolData({ ...s, spoolmanSpool: null })
}

export interface UpdateSpoolInput {
  status?: SpoolStatus
  nfcTagId?: string | null
  notes?: string
}

export async function updateSpool(id: string, input: UpdateSpoolInput): Promise<SpoolData> {
  const s = await prisma.spool.update({
    where: { id },
    data: {
      ...(input.status !== undefined && { status: input.status }),
      ...(input.nfcTagId !== undefined && { nfcTagId: input.nfcTagId }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: { _count: { select: { amsSlots: true } } },
  })
  return toSpoolData({ ...s, spoolmanSpool: null })
}

export async function deleteSpool(id: string): Promise<void> {
  await prisma.spool.delete({ where: { id } })
}
