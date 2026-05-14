import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listKatalog, createKatalog } from '@/lib/katalog/service'
import type { ProdukInternalInput } from '@/lib/katalog/types'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await listKatalog()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body: ProdukInternalInput = await req.json()
  if (!body.nama?.trim()) {
    return NextResponse.json({ error: 'nama is required' }, { status: 400 })
  }
  const result = await createKatalog(body)
  return NextResponse.json(result, { status: 201 })
}
