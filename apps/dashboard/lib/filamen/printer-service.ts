import { prisma } from '@/lib/db'

export interface PrinterData {
  id: string
  name: string
  model: string
  isActive: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export interface PrinterInput {
  name: string
  model?: string
  isActive?: boolean
  notes?: string
}

function toResponse(p: { id: string; name: string; model: string; isActive: boolean; notes: string; createdAt: Date; updatedAt: Date }): PrinterData {
  return { ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }
}

export async function listPrinters(): Promise<PrinterData[]> {
  const printers = await prisma.printer.findMany({ orderBy: { name: 'asc' } })
  return printers.map(toResponse)
}

export async function createPrinter(input: PrinterInput): Promise<PrinterData> {
  const printer = await prisma.printer.create({
    data: {
      name: input.name.trim(),
      model: input.model?.trim() ?? '',
      isActive: input.isActive ?? true,
      notes: input.notes?.trim() ?? '',
      updatedAt: new Date(),
    },
  })
  return toResponse(printer)
}

export async function updatePrinter(id: string, input: Partial<PrinterInput>): Promise<PrinterData> {
  const printer = await prisma.printer.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.model !== undefined && { model: input.model.trim() }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.notes !== undefined && { notes: input.notes.trim() }),
      updatedAt: new Date(),
    },
  })
  return toResponse(printer)
}

export async function deletePrinter(id: string): Promise<void> {
  await prisma.printer.delete({ where: { id } })
}
