import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listSpools, createSpool } from '@/lib/filamen/spool-service'
import type { CreateSpoolInput } from '@/lib/filamen/spool-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await listSpools()
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: CreateSpoolInput = await req.json()
  if (!body.brand || !body.material || !body.colorName || !body.colorHex) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const spool = await createSpool(body)
  return NextResponse.json(spool, { status: 201 })
}
