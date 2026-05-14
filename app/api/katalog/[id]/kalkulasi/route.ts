import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setKatalogKalkulasi } from '@/lib/katalog/service'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body: { kalkulasiId: string | null } = await req.json()
  const result = await setKatalogKalkulasi(id, body.kalkulasiId ?? null)
  return NextResponse.json(result)
}
