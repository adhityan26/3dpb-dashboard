import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { updateSpool, deleteSpool } from '@/lib/filamen/spool-service'
import type { UpdateSpoolInput } from '@/lib/filamen/spool-service'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body: UpdateSpoolInput = await req.json()
  const spool = await updateSpool(id, body)
  return NextResponse.json(spool)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await deleteSpool(id)
  return new NextResponse(null, { status: 204 })
}
