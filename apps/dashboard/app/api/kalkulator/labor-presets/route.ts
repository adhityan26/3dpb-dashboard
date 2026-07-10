import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listLaborPresets, upsertLaborPreset } from '@/lib/kalkulator/profiles-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listLaborPresets())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.nama?.trim()) return NextResponse.json({ error: 'nama wajib diisi' }, { status: 400 })
  try {
    return NextResponse.json(await upsertLaborPreset(body), { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'INVALID_ITEMS') return NextResponse.json({ error: 'INVALID_ITEMS' }, { status: 400 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
