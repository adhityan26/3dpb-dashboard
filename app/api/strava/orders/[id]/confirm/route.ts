// app/api/strava/orders/[id]/confirm/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { confirmStravaOrder } from '@/lib/strava/service'

/**
 * POST /api/strava/orders/{id}/confirm
 *
 * Sanity approval sync endpoint.
 * Called by Sanity after admin approval.
 *
 * Authorization: INTERNAL_NOTIFICATION_SECRET header
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const internalSecret = process.env.INTERNAL_NOTIFICATION_SECRET
    const headerSecret = req.headers.get('authorization')

    // Check authorization
    if (!internalSecret || headerSecret !== `Bearer ${internalSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = params

    // Confirm order
    const confirmed = await confirmStravaOrder(id)

    return NextResponse.json(confirmed, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/strava/orders/[id]/confirm]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
