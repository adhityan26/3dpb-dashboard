import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setVariantKalkulasi } from '@/lib/katalog/service'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; linkId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { linkId } = await params
  const body: { kalkulasiId: string | null } = await req.json()
  await setVariantKalkulasi(linkId, body.kalkulasiId ?? null)
  return new NextResponse(null, { status: 204 })
}
