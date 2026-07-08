import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

const CONFIG_KEY = 'invoice.paymentMethods'
const DEFAULTS = ['Bank Jago', 'Cash', 'QRIS', 'Shopee', 'Tokopedia', 'TikTok']

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } })
  const methods: string[] = row ? JSON.parse(row.value) : DEFAULTS
  return NextResponse.json({ methods })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { methods } = await req.json() as { methods: string[] }
  if (!Array.isArray(methods)) return NextResponse.json({ error: 'Invalid' }, { status: 400 })

  const cleaned = methods.map(m => m.trim()).filter(Boolean)
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value: JSON.stringify(cleaned) },
    create: { key: CONFIG_KEY, value: JSON.stringify(cleaned) },
  })
  return NextResponse.json({ methods: cleaned })
}
