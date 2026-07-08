import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

const KEY = 'filament.brandAliases'

const DEFAULTS: Record<string, string> = {
  BambuLab: 'Bambu Lab',
  Bambu: 'Bambu Lab',
  bambulab: 'Bambu Lab',
  esun: 'eSUN',
  'e-sun': 'eSUN',
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await prisma.config.findUnique({ where: { key: KEY } })
  if (!row) {
    return NextResponse.json({ aliases: DEFAULTS })
  }

  let aliases: Record<string, string>
  try {
    aliases = JSON.parse(row.value) as Record<string, string>
  } catch {
    aliases = DEFAULTS
  }

  return NextResponse.json({ aliases })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { aliases?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.aliases || typeof body.aliases !== 'object' || Array.isArray(body.aliases)) {
    return NextResponse.json({ error: 'aliases must be an object' }, { status: 400 })
  }

  // Validate all values are strings
  const aliases = body.aliases as Record<string, unknown>
  for (const [k, v] of Object.entries(aliases)) {
    if (typeof v !== 'string') {
      return NextResponse.json({ error: `Value for key "${k}" must be a string` }, { status: 400 })
    }
  }

  const value = JSON.stringify(aliases)

  await prisma.config.upsert({
    where: { key: KEY },
    update: { value },
    create: { key: KEY, value },
  })

  return NextResponse.json({ ok: true })
}
