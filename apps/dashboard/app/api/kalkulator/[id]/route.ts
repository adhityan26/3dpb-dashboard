import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getKalkulasi, updateKalkulasi, deleteKalkulasi } from '@/lib/kalkulator/service'
import type { KalkulasiInput } from '@/lib/kalkulator/types'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const item = await getKalkulasi(id)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body: KalkulasiInput = await req.json()
  if (!Array.isArray(body.komponen) || !Array.isArray(body.labor)) {
    return NextResponse.json({ error: 'form kadaluarsa — refresh halaman' }, { status: 400 })
  }
  const result = await updateKalkulasi(id, body)
  return NextResponse.json(result)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deleteKalkulasi(id)
  return new NextResponse(null, { status: 204 })
}
