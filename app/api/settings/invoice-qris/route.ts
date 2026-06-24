import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

const CONFIG_KEY = 'invoice.qrisImage'
const MAX_BYTES = 2_000_000  // ~2MB data URL ceiling

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } })
  const qris: string = row ? row.value : ''
  return NextResponse.json({ qris })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { qris } = await req.json() as { qris: string }
  if (typeof qris !== 'string') return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  if (qris && !qris.startsWith('data:image/')) {
    return NextResponse.json({ error: 'QRIS must be an image data URL' }, { status: 400 })
  }
  if (qris.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Gambar terlalu besar (maks ~1.5MB)' }, { status: 400 })
  }

  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value: qris },
    create: { key: CONFIG_KEY, value: qris },
  })
  return NextResponse.json({ qris })
}
