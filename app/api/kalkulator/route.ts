import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listKalkulasi, createKalkulasi } from '@/lib/kalkulator/service'
import type { KalkulasiInput } from '@/lib/kalkulator/types'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await listKalkulasi()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body: KalkulasiInput = await req.json()
  if (!body.nama?.trim()) return NextResponse.json({ error: 'nama is required' }, { status: 400 })
  const hasPlates = body.plates?.length > 0
  const hasKomponen = body.komponenKustom?.some((k: { harga: number }) => k.harga > 0)
  if (!hasPlates && !hasKomponen) return NextResponse.json({ error: 'isi minimal 1 plate atau 1 komponen' }, { status: 400 })
  const result = await createKalkulasi(body)
  return NextResponse.json(result, { status: 201 })
}
