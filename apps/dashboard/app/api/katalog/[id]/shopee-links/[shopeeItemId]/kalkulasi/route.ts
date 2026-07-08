import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setVariantKalkulasi } from '@/lib/katalog/service'

// shopeeItemId param = link's internal cuid (reuses slug name to avoid Next.js conflict)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shopeeItemId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { shopeeItemId: linkId } = await params
  const body: { kalkulasiId: string | null } = await req.json()
  await setVariantKalkulasi(linkId, body.kalkulasiId ?? null)
  return new NextResponse(null, { status: 204 })
}
