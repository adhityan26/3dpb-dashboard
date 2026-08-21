import { NextRequest, NextResponse } from 'next/server'
import { requireApiV1Token } from '@/lib/api-v1/auth'

// GET /api/v1/info — Spoolman-compatible server info
export async function GET(req: NextRequest) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    version: '0.19.1',
    debug_mode: false,
  })
}
