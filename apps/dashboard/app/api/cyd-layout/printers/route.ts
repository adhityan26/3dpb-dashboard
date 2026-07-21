import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPrintersWithLiveStatus } from '@/lib/printers/live-status'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const printers = await getPrintersWithLiveStatus()
  // id = slug (bukan cuid Prisma) -> ini yang langsung dipakai sebagai cell.printer di editor.
  // Printer tanpa slug (belum di-generate/diisi manual) DIKELUARKAN dari palette -- tak bisa
  // dipasang ke layout sebelum punya identitas MQTT yang valid.
  return NextResponse.json(
    printers
      .filter((p) => p.slug !== null)
      .map((p) => ({ id: p.slug as string, name: p.name, model: p.model, live: p.live }))
  )
}
