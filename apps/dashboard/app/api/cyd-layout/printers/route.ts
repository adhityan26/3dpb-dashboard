import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { readRetained } from '@/lib/cyd-layout/mqtt-client'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = await readRetained('3dpb/printers')
  if (!raw) return NextResponse.json([])

  try {
    const parsed = JSON.parse(raw) as { payload: { id: string; name: string }[] }
    return NextResponse.json(parsed.payload.map((p) => ({ id: p.id, name: p.name })))
  } catch {
    return NextResponse.json([])
  }
}
