import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPO, updatePO, deletePO } from '@/lib/po/service'
import { DuplicatePONomorError, type UpdatePOInput } from '@/lib/po/types'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const item = await getPO(id)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body: UpdatePOInput = await req.json()
  try {
    const result = await updatePO(id, body)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof DuplicatePONomorError) return NextResponse.json({ error: err.message }, { status: 409 })
    throw err
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deletePO(id)
  return new NextResponse(null, { status: 204 })
}
