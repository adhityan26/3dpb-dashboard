import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { addShopeeLink } from '@/lib/katalog/service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body: { shopeeItemId: string; shopeeModelId?: string | null } = await req.json()
  if (!body.shopeeItemId?.trim()) {
    return NextResponse.json({ error: 'shopeeItemId is required' }, { status: 400 })
  }
  await addShopeeLink(id, body.shopeeItemId.trim(), body.shopeeModelId ?? null)
  return new NextResponse(null, { status: 204 })
}
