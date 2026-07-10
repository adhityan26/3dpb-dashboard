import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listPO, createPO } from '@/lib/po/service'
import { DuplicatePONomorError, type POInput } from '@/lib/po/types'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await listPO()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body: POInput = await req.json()
  if (!body.vendorNama?.trim()) return NextResponse.json({ error: 'vendorNama required' }, { status: 400 })
  try {
    const result = await createPO(body)
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof DuplicatePONomorError) return NextResponse.json({ error: err.message }, { status: 409 })
    throw err
  }
}
