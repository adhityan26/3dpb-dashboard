import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { receivePO } from '@/lib/po/service'

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await receivePO(id)
  return new NextResponse(null, { status: 204 })
}
