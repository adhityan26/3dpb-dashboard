import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deleteHistory } from '@/lib/history/service'

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ produkId: string; historyId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { historyId } = await params
  await deleteHistory(historyId)
  return new NextResponse(null, { status: 204 })
}
