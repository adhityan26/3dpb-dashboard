import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getKatalog, updateKatalog, deleteKatalog } from '@/lib/katalog/service'
import type { ProdukInternalInput } from '@/lib/katalog/types'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const item = await getKatalog(id)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body: ProdukInternalInput = await req.json()
  if (!body.nama?.trim()) {
    return NextResponse.json({ error: 'nama is required' }, { status: 400 })
  }
  const result = await updateKatalog(id, body)
  return NextResponse.json(result)
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deleteKatalog(id)
  return new NextResponse(null, { status: 204 })
}
