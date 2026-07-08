import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { assignSpoolToSlot } from '@/lib/filamen/ams-service'

// PUT { spoolId: string | null }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { spoolId } = await req.json() as { spoolId: string | null }
  const slot = await assignSpoolToSlot(id, spoolId ?? null)
  return NextResponse.json(slot)
}
