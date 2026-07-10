import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setDefaultPrinterProfile } from '@/lib/kalkulator/profiles-service'

export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await setDefaultPrinterProfile(id)
  return new NextResponse(null, { status: 204 })
}
