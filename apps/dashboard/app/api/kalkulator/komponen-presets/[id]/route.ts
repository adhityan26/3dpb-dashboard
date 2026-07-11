import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deleteKomponenPreset } from '@/lib/kalkulator/profiles-service'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await deleteKomponenPreset(id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
