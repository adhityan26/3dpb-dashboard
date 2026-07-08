import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listResinHarga, upsertResinHarga, deleteResinHarga } from '@/lib/kalkulator/service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listResinHarga())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { brand, grade, hargaPerGram } = await req.json()
  if (!brand || !grade || !hargaPerGram) return NextResponse.json({ error: 'brand, grade, hargaPerGram required' }, { status: 400 })
  const result = await upsertResinHarga(brand, grade, hargaPerGram)
  return NextResponse.json(result, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  await deleteResinHarga(id)
  return new NextResponse(null, { status: 204 })
}
