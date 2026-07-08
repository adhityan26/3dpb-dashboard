import { prisma } from '@/lib/db'
import type { AmsSlotData, AmsAlternativeData, AmsVariant, AmsSectionResponse, ProductType } from './types'

function toAlternativeData(a: {
  id: string; type: string; catalogId: string | null; brand: string | null; material: string | null
  catalog?: { id: string; brand: string; material: string; colorName: string; colorHex: string } | null
}): AmsAlternativeData {
  return {
    id: a.id,
    type: a.type as 'specific' | 'general',
    catalogId: a.catalogId,
    catalogColorHex: a.catalog?.colorHex ?? null,
    catalogBrand: a.catalog?.brand ?? null,
    catalogMaterial: a.catalog?.material ?? null,
    catalogColorName: a.catalog?.colorName ?? null,
    brand: a.brand,
    material: a.material,
  }
}

function toSlotData(s: {
  id: string
  productType: string
  variantName: string
  slotNumber: number
  filamentName: string
  spoolId: string | null
  spool: { id: string; barcode: string; status: string; colorHex: string; brand: string; colorName: string } | null
  catalog?: { colorHex: string } | null
  alternatives: Array<{
    id: string; type: string; catalogId: string | null; brand: string | null; material: string | null
    catalog?: { id: string; brand: string; material: string; colorName: string; colorHex: string } | null
  }>
}): AmsSlotData {
  return {
    id: s.id,
    productType: s.productType as ProductType,
    variantName: s.variantName,
    slotNumber: s.slotNumber,
    filamentName: s.filamentName,
    catalogColorHex: s.catalog?.colorHex ?? null,
    spoolId: s.spoolId,
    spool: s.spool
      ? {
          id: s.spool.id,
          barcode: s.spool.barcode,
          status: s.spool.status as 'new' | 'full' | 'mid' | 'low' | 'empty',
          colorHex: s.spool.colorHex,
          brand: s.spool.brand,
          colorName: s.spool.colorName,
        }
      : null,
    alternatives: (s.alternatives ?? []).map(toAlternativeData),
  }
}

export async function getAmsSections(): Promise<AmsSectionResponse> {
  const slots = await prisma.amsSlot.findMany({
    orderBy: [{ variantName: 'asc' }, { slotNumber: 'asc' }],
    include: {
      spool: {
        select: { id: true, barcode: true, status: true, colorHex: true, brand: true, colorName: true },
      },
      catalog: { select: { colorHex: true } },
      alternatives: {
        include: {
          catalog: { select: { id: true, brand: true, material: true, colorName: true, colorHex: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  function groupByVariant(productType: ProductType): AmsVariant[] {
    const filtered = slots.filter((s) => s.productType === productType)
    const variantMap = new Map<string, AmsSlotData[]>()
    for (const s of filtered) {
      const list = variantMap.get(s.variantName) ?? []
      list.push(toSlotData(s))
      variantMap.set(s.variantName, list)
    }
    return Array.from(variantMap.entries()).map(([variantName, variantSlots]) => ({
      variantName,
      slots: variantSlots.sort((a, b) => a.slotNumber - b.slotNumber),
      hasLowSpool: variantSlots.some(
        (sl) => sl.spool?.status === 'low' || sl.spool?.status === 'empty'
      ),
    }))
  }

  return {
    swoosh: groupByVariant('swoosh'),
    clickers: groupByVariant('clickers'),
  }
}

export async function assignSpoolToSlot(
  slotId: string,
  spoolId: string | null
): Promise<AmsSlotData> {
  const updated = await prisma.amsSlot.update({
    where: { id: slotId },
    data: { spoolId },
    include: {
      spool: {
        select: { id: true, barcode: true, status: true, colorHex: true, brand: true, colorName: true },
      },
      catalog: { select: { colorHex: true } },
      alternatives: {
        include: {
          catalog: { select: { id: true, brand: true, material: true, colorName: true, colorHex: true } },
        },
      },
    },
  })
  return toSlotData(updated)
}
