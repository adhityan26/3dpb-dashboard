import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { removeShopeeLink } from '@/lib/katalog/service'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; shopeeItemId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, shopeeItemId } = await params
  const shopeeModelId = new URL(req.url).searchParams.get('shopeeModelId')
  await removeShopeeLink(id, shopeeItemId, shopeeModelId)
  return new NextResponse(null, { status: 204 })
}
