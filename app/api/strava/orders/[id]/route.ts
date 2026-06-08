// app/api/strava/orders/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
  getStravaOrder,
  updateStravaOrder,
} from '@/lib/strava/service'
import { getResultPhotosWithUrls } from '@/lib/strava/photo-service'
import type { StravaOrder } from '@/lib/strava/types'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Fetch order
    const order = await getStravaOrder(id)
    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    // Fetch order with photos and URLs
    const orderWithPhotos = await getResultPhotosWithUrls(order.orderId)

    return NextResponse.json(orderWithPhotos, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[GET /api/strava/orders/[id]]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await req.json()) as Partial<StravaOrder>

    // Update order
    const updated = await updateStravaOrder(id, body)

    return NextResponse.json(updated, { status: 200 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[PATCH /api/strava/orders/[id]]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
