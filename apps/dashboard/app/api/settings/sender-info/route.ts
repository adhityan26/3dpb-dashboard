import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { SenderInfo } from '@/lib/invoice/types'

const CONFIG_KEY = 'invoice.senderInfo'
const DEFAULT: SenderInfo = { nama: '', telepon: '', alamat: '' }

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } })
  const senderInfo: SenderInfo = row ? JSON.parse(row.value) : DEFAULT
  return NextResponse.json({ senderInfo })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as Partial<SenderInfo>
  if (typeof body.nama !== 'string' || typeof body.telepon !== 'string' || typeof body.alamat !== 'string') {
    return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  }

  const cleaned: SenderInfo = {
    nama: body.nama.trim(),
    telepon: body.telepon.trim(),
    alamat: body.alamat.trim(),
  }
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value: JSON.stringify(cleaned) },
    create: { key: CONFIG_KEY, value: JSON.stringify(cleaned) },
  })
  return NextResponse.json({ senderInfo: cleaned })
}
