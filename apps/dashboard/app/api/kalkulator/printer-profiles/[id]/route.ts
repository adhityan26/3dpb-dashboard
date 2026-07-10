import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { updatePrinterProfile, deletePrinterProfile } from '@/lib/kalkulator/profiles-service'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    return NextResponse.json(await updatePrinterProfile(id, await req.json()))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    const status = msg === 'NOT_FOUND' ? 404 : msg === 'INVALID_INPUT' ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await deletePrinterProfile(id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    const status = msg === 'DEFAULT_PROFILE' ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
