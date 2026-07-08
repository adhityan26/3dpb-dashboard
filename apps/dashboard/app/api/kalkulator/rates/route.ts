import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadRates, updateRate } from '@/lib/kalkulator/rates'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await loadRates())
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const updates = Array.isArray(body) ? body : [body]
  for (const { key, value } of updates) {
    if (!key?.startsWith('kalk.')) return NextResponse.json({ error: `Invalid key: ${key}` }, { status: 400 })
    await updateRate(key, String(value))
  }
  return NextResponse.json(await loadRates())
}
