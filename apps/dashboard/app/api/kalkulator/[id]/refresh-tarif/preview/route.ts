import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { previewRefreshTarif } from '@/lib/kalkulator/service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const result = await previewRefreshTarif(id)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gagal preview refresh tarif' }, { status: 404 })
  }
}
