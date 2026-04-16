import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: slotId } = await params
  const body = await req.json() as { type: 'specific' | 'general'; catalogId?: string; brand?: string; material?: string }

  if (body.type === 'specific' && !body.catalogId) {
    return NextResponse.json({ error: 'catalogId required for specific type' }, { status: 400 })
  }
  if (body.type === 'general' && (!body.brand || !body.material)) {
    return NextResponse.json({ error: 'brand and material required for general type' }, { status: 400 })
  }

  const alt = await prisma.amsSlotAlternative.create({
    data: {
      slotId,
      type: body.type,
      catalogId: body.type === 'specific' ? body.catalogId : null,
      brand: body.type === 'general' ? body.brand : null,
      material: body.type === 'general' ? body.material : null,
    },
    include: {
      catalog: { select: { id: true, brand: true, material: true, colorName: true, colorHex: true } },
    },
  })

  return NextResponse.json(alt, { status: 201 })
}
