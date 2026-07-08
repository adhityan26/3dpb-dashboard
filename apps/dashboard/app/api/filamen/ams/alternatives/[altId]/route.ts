import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ altId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { altId } = await params
  await prisma.amsSlotAlternative.delete({ where: { id: altId } })
  return new NextResponse(null, { status: 204 })
}
