import { prisma } from "@/lib/db"
import type { AlertEvent } from "../types"

export async function detectSpoolLow(): Promise<AlertEvent[]> {
  const lowSpools = await prisma.spool.findMany({
    where: { status: "low" },
    include: {
      amsSlots: {
        select: { productType: true },
      },
    },
  })

  return lowSpools.map((spool) => {
    const variantCount = spool.amsSlots.length
    const id = `#${spool.barcode.slice(0, 8).toUpperCase()}`
    const variantNote =
      variantCount > 0
        ? ` — dipakai di ${variantCount} slot${spool.amsSlots[0]?.productType ? ` (${spool.amsSlots[0].productType})` : ""}`
        : ""

    return {
      kind: "spool_low" as const,
      severity: "warning" as const,
      alertKey: `spool-low:${spool.id}`,
      title: "Spool Hampir Habis",
      body: `Spool ${spool.brand} ${spool.colorName} (${id}) hampir habis${variantNote}`,
    }
  })
}
