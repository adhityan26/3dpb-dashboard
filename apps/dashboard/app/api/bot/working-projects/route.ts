import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { prisma } from '@/lib/db'
import { createWorkingProject, createWorkingProjectsForOrder, summarizeOrderCreate } from '@/lib/working-projects/service'

// Read access for the Discord-side AI assistant (e.g. "rekap cincin di
// Tokped dan Shopee") — before this existed, the assistant had no read API
// for order data and would fall back to poking at the retired local
// orders.db directly. Supports the filters an assistant recap actually
// needs: status, platform, a plain-text search over customer/product/order
// numbers, and a result cap (default 100, since a recap prompt doesn't need
// the full history).
export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const platform = searchParams.get('platform')
  const q = searchParams.get('q')
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500)

  const projects = await prisma.workingProject.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(platform ? { platform } : {}),
      ...(q
        ? {
            OR: [
              { customer: { contains: q, mode: 'insensitive' } },
              { product: { contains: q, mode: 'insensitive' } },
              { sourceOrderNo: { contains: q, mode: 'insensitive' } },
              { orderNoLegacy: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (!body.source || !body.forumChannelId || !body.customer || !body.product) {
    return NextResponse.json({ error: 'source, forumChannelId, customer, product are required' }, { status: 400 })
  }

  if ((body.source === 'shopee' || body.source === 'tokopedia') && body.sourceOrderNo) {
    if (!Array.isArray(body.units) || body.units.length === 0) {
      return NextResponse.json({ error: 'units wajib untuk order marketplace' }, { status: 400 })
    }
    const { units, forumChannelId, ...rest } = body
    const batch = await createWorkingProjectsForOrder({
      source: body.source,
      sourceOrderNo: body.sourceOrderNo,
      units,
      base: { ...rest, forumChannelIdFor: () => forumChannelId },
    })
    return NextResponse.json(summarizeOrderCreate(batch), { status: 201 })
  }

  const result = await createWorkingProject(body)
  return NextResponse.json(result, { status: 201 })
}
