import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { duplicateKalkulasi } from '@/lib/kalkulator/service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { nama, batch } = await req.json()
  if (!nama?.trim()) return NextResponse.json({ error: 'nama is required' }, { status: 400 })
  const result = await duplicateKalkulasi(id, nama, batch)
  return NextResponse.json(result, { status: 201 })
}
