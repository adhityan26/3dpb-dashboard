import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { addProdukLink } from '@/lib/kalkulator/service'
import type { KalkulasiProdukInput } from '@/lib/kalkulator/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body: KalkulasiProdukInput = await req.json()
  if (!body.shopeeItemId && !body.namaManual) {
    return NextResponse.json({ error: 'shopeeItemId or namaManual is required' }, { status: 400 })
  }
  await addProdukLink(id, body)
  return new NextResponse(null, { status: 201 })
}
