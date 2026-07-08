import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deletePayment } from '@/lib/invoice/service'

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, paymentId } = await params
  const result = await deletePayment(id, paymentId)
  return NextResponse.json(result)
}
