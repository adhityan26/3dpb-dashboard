// app/api/strava/orders/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
  createStravaOrder,
  getStravaOrders,
} from '@/lib/strava/service'
import type { CreateStravaOrderInput, StravaStatus } from '@/lib/strava/types'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateStravaOrderInput

    // Validate
    if (!body.customerName || !body.customerEmail || !body.items?.length || !body.totalAmount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const order = await createStravaOrder(body)
    return NextResponse.json(order, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/strava/orders]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status') as StravaStatus | null
    const orders = await getStravaOrders(status || undefined)
    return NextResponse.json(orders)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[GET /api/strava/orders]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
