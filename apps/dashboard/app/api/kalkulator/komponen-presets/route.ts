import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listKomponenPresets, upsertKomponenPreset } from '@/lib/kalkulator/profiles-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listKomponenPresets())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.nama?.trim()) return NextResponse.json({ error: 'nama wajib diisi' }, { status: 400 })
  if (typeof body.harga !== 'number' || !Number.isFinite(body.harga) || body.harga < 0) {
    return NextResponse.json({ error: 'harga harus angka ≥ 0' }, { status: 400 })
  }
  return NextResponse.json(await upsertKomponenPreset(body), { status: 201 })
}
