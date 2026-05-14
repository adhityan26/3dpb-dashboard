import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listFilamentHarga, upsertFilamentHarga, deleteFilamentHarga } from '@/lib/kalkulator/service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listFilamentHarga())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { brand, material, hargaPerGram } = await req.json()
  if (!brand || !material || !hargaPerGram) return NextResponse.json({ error: 'brand, material, hargaPerGram required' }, { status: 400 })
  const result = await upsertFilamentHarga(brand, material, hargaPerGram)
  return NextResponse.json(result, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  await deleteFilamentHarga(id)
  return new NextResponse(null, { status: 204 })
}
