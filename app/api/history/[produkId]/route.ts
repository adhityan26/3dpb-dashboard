import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listHistory, addHistory, getHistoryStats } from '@/lib/history/service'
import type { ProdukHistoryInput } from '@/lib/history/types'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ produkId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { produkId } = await params
  const [items, stats] = await Promise.all([
    listHistory(produkId),
    getHistoryStats(produkId),
  ])
  return NextResponse.json({ items, stats })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ produkId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { produkId } = await params
  const body: ProdukHistoryInput = await req.json()
  if (!body.qty || body.qty < 1) {
    return NextResponse.json({ error: 'qty harus >= 1' }, { status: 400 })
  }
  const result = await addHistory(produkId, body)
  return NextResponse.json(result, { status: 201 })
}
