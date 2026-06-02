import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listQuotations, createQuotation } from '@/lib/invoice/service'
import type { QuotationInput } from '@/lib/invoice/types'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await listQuotations()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body: QuotationInput = await req.json()
  if (!body.buyerNama?.trim()) return NextResponse.json({ error: 'buyerNama required' }, { status: 400 })
  if (!body.items?.length) return NextResponse.json({ error: 'items required' }, { status: 400 })
  // Pass tanggal for backdating and ongkir for shipping cost
  const result = await createQuotation({
    ...body,
    tanggal: body.tanggal ?? null,
    ongkir: typeof body.ongkir === 'number' ? body.ongkir : 0,
  })
  return NextResponse.json(result, { status: 201 })
}
