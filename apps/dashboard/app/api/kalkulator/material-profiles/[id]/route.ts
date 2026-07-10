import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deleteMaterialProfile } from '@/lib/kalkulator/profiles-service'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deleteMaterialProfile(id)
  return new NextResponse(null, { status: 204 })
}
