import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { validateLayoutConfig } from '@/lib/cyd-layout/build-config'
import { publishAndConfirm } from '@/lib/cyd-layout/mqtt-client'

const CONFIG_TOPIC = '3dpb/cyd/internal-rack/layout'
const READBACK_TOPIC = '3dpb/cyd/internal-rack/layout/current'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = validateLayoutConfig(body?.config)
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const payload = JSON.stringify(result.config)
  const confirmed = await publishAndConfirm(CONFIG_TOPIC, READBACK_TOPIC, payload)

  return NextResponse.json({ confirmed })
}
