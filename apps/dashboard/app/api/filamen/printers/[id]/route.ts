import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { updatePrinter, deletePrinter } from '@/lib/filamen/printer-service'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const printer = await updatePrinter(id, body)
  return NextResponse.json(printer)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deletePrinter(id)
  return new NextResponse(null, { status: 204 })
}
