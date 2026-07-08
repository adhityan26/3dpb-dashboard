import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { addPayment } from '@/lib/invoice/service'
import type { AddPaymentInput } from '@/lib/invoice/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body: AddPaymentInput = await req.json()
  if (!body.jumlah || body.jumlah <= 0) return NextResponse.json({ error: 'jumlah harus > 0' }, { status: 400 })
  if (!body.metode?.trim()) return NextResponse.json({ error: 'metode wajib diisi' }, { status: 400 })
  const result = await addPayment(id, body)
  return NextResponse.json(result)
}
