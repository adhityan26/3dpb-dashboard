import { NextResponse } from 'next/server'

// GET /api/v1/info — Spoolman-compatible server info
export async function GET() {
  return NextResponse.json({
    version: '0.19.1',
    debug_mode: false,
  })
}
