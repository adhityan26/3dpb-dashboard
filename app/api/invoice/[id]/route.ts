import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getQuotation, updateQuotation, deleteQuotation } from '@/lib/invoice/service'
import type { UpdateQuotationInput } from '@/lib/invoice/types'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const item = await getQuotation(id)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body: UpdateQuotationInput = await req.json()
  const result = await updateQuotation(id, body)
  return NextResponse.json(result)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deleteQuotation(id)
  return new NextResponse(null, { status: 204 })
}
