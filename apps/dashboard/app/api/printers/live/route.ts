import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPrintersWithLiveStatus } from '@/lib/printers/live-status'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const printers = await getPrintersWithLiveStatus()
  return NextResponse.json(printers)
}
