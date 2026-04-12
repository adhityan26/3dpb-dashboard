import { prisma } from '@/lib/db'
import type { AmsSlotData, AmsVariant, AmsSectionResponse, ProductType } from './types'

function toSlotData(s: {
  id: string
  productType: string
  variantName: string
  slotNumber: number
  filamentName: string
  spoolId: string | null
  spool: { id: string; barcode: string; status: string; colorHex: string; brand: string; colorName: string } | null
}): AmsSlotData {
  return {
    id: s.id,
    productType: s.productType as ProductType,
    variantName: s.variantName,
    slotNumber: s.slotNumber,
    filamentName: s.filamentName,
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
  }
}

export async function getAmsSections(): Promise<AmsSectionResponse> {
  const slots = await prisma.amsSlot.findMany({
    orderBy: [{ variantName: 'asc' }, { slotNumber: 'asc' }],
    include: {
      spool: {
        select: { id: true, barcode: true, status: true, colorHex: true, brand: true, colorName: true },
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
    },
  })
  return toSlotData(updated)
}

