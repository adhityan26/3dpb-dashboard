import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { recomputeFilamentHarga } from '@/lib/kalkulator/service'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const updated = await recomputeFilamentHarga()
  return NextResponse.json({ updated })
}
