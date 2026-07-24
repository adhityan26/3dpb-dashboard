import { prisma } from '@/lib/db'
import { readRetained } from '@/lib/cyd-layout/mqtt-client'

export interface LivePrinterStatus {
  state: string
  progress: number
  remainingMin: number
  filename: string
}

export interface PrinterWithLiveStatus {
  id: string
  slug: string | null
  name: string
  model: string
  notes: string
  live: LivePrinterStatus | null
}

interface MqttPrinterEntry {
  id: string
  state: string
  progress: number
  remaining_min: number
  filename: string
}

export async function getPrintersWithLiveStatus(): Promise<PrinterWithLiveStatus[]> {
  const printers = await prisma.printer.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })

  const liveById = new Map<string, LivePrinterStatus>()
  const raw = await readRetained('3dpb/printers')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { payload: MqttPrinterEntry[] }
      for (const entry of parsed.payload) {
        liveById.set(entry.id, { state: entry.state, progress: entry.progress, remainingMin: entry.remaining_min, filename: entry.filename ?? '' })
      }
    } catch {
      // MQTT payload korup/tak terduga -> treat sebagai tak ada data live, jangan crash
    }
  }

  return printers.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    model: p.model,
    notes: p.notes,
    live: p.slug ? (liveById.get(p.slug) ?? null) : null,
  }))
}
