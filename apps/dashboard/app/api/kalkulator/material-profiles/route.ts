import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listMaterialProfiles, upsertMaterialProfile } from '@/lib/kalkulator/profiles-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listMaterialProfiles())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.nama?.trim()) return NextResponse.json({ error: 'nama wajib diisi' }, { status: 400 })
  if (body.tipe !== 'FDM' && body.tipe !== 'SLA') return NextResponse.json({ error: 'tipe harus FDM/SLA' }, { status: 400 })
  const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  if (!n(body.hppPerGram) || !n(body.jualPerGram) || !n(body.failureRatePct)) {
    return NextResponse.json({ error: 'hppPerGram/jualPerGram/failureRatePct harus angka ≥ 0' }, { status: 400 })
  }
  return NextResponse.json(await upsertMaterialProfile(body), { status: 201 })
}
