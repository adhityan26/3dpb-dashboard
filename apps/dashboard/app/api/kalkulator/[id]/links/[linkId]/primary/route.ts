import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setPrimaryLink } from '@/lib/kalkulator/service'

export async function PUT(_: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { linkId } = await params
  await setPrimaryLink(linkId)
  return new NextResponse(null, { status: 204 })
}
