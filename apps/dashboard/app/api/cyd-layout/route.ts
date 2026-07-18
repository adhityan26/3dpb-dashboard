import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildLayoutConfig, findDuplicatePrinterIds } from '@/lib/cyd-layout/build-config'
import { publishAndConfirm } from '@/lib/cyd-layout/mqtt-client'

const CONFIG_TOPIC = '3dpb/cyd/internal-rack/layout'
const READBACK_TOPIC = '3dpb/cyd/internal-rack/layout/current'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const assignment = body?.assignment
  if (!assignment || typeof assignment !== 'object') {
    return NextResponse.json({ error: 'assignment wajib diisi' }, { status: 400 })
  }

  const duplicates = findDuplicatePrinterIds(assignment)
  if (duplicates.length > 0) {
    return NextResponse.json({ error: 'Satu printer tidak boleh dipasang di lebih dari satu slot' }, { status: 400 })
  }

  const config = buildLayoutConfig(assignment)
  const payload = JSON.stringify(config)
  const confirmed = await publishAndConfirm(CONFIG_TOPIC, READBACK_TOPIC, payload)

  return NextResponse.json({ confirmed })
}
