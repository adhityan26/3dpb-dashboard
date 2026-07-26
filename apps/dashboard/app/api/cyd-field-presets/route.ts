import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listFieldPresets, createFieldPreset } from '@/lib/cyd-layout/field-preset-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listFieldPresets())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  try {
    return NextResponse.json(await createFieldPreset(body), { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
