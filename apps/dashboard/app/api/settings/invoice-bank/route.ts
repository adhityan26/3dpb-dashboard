import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

const CONFIG_KEY = 'invoice.bankAccount'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } })
  const bankAccount: string = row ? row.value : ''
  return NextResponse.json({ bankAccount })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { bankAccount } = await req.json() as { bankAccount: string }
  if (typeof bankAccount !== 'string') return NextResponse.json({ error: 'Invalid' }, { status: 400 })

  const cleaned = bankAccount.trim()
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value: cleaned },
    create: { key: CONFIG_KEY, value: cleaned },
  })
  return NextResponse.json({ bankAccount: cleaned })
}
