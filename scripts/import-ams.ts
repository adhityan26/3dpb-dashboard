import * as XLSX from 'xlsx'
import { prisma } from '@/lib/db'
import path from 'path'
import { randomUUID } from 'crypto'

function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  productType: 'swoosh' | 'clickers'
) {
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][]

  const slots: {
    productType: string
    variantName: string
    slotNumber: number
    filamentName: string
  }[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const variantName = row[0]?.toString().trim()
    if (!variantName) continue

    for (let slot = 1; slot <= 8; slot++) {
      const filamentName = row[slot]?.toString().trim()
      if (!filamentName) continue
      slots.push({ productType, variantName, slotNumber: slot, filamentName })
    }
  }

  return slots
}

async function main() {
  const excelPath = path.resolve(
    process.env.EXCEL_PATH ??
      '/Users/adhityatangahu/Downloads/Urutan Fillament Swoosh.xlsx'
  )

  const wb = XLSX.readFile(excelPath)
  const swooshSlots = parseSheet(wb, 'Swoosh', 'swoosh')
  const clickerSlots = parseSheet(wb, 'Clickers', 'clickers')
  const allSlots = [...swooshSlots, ...clickerSlots]

  console.log(`Importing ${allSlots.length} AMS slots...`)

  const now = new Date().toISOString()

  for (const slot of allSlots) {
    // Check if record exists
    const existing = await prisma.amsSlot.findUnique({
      where: {
        productType_variantName_slotNumber: {
          productType: slot.productType,
          variantName: slot.variantName,
          slotNumber: slot.slotNumber,
        },
      },
    })

    if (existing) {
      await prisma.$executeRaw`
        UPDATE "AmsSlot"
        SET "filamentName" = ${slot.filamentName}, "updatedAt" = ${now}
        WHERE "productType" = ${slot.productType}
          AND "variantName" = ${slot.variantName}
          AND "slotNumber" = ${slot.slotNumber}
      `
    } else {
      const id = randomUUID()
      await prisma.$executeRaw`
        INSERT INTO "AmsSlot" ("id", "productType", "variantName", "slotNumber", "filamentName", "createdAt", "updatedAt")
        VALUES (${id}, ${slot.productType}, ${slot.variantName}, ${slot.slotNumber}, ${slot.filamentName}, ${now}, ${now})
      `
    }
  }

  console.log('Done.')
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
