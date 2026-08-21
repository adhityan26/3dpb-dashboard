import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiV1Token } from '@/lib/api-v1/auth'

function toResponse(v: { id: number; name: string; comment: string; emptySpoolWeight: number | null; externalId: string | null; createdAt: Date }) {
  return {
    id: v.id,
    registered: v.createdAt.toISOString(),
    name: v.name,
    comment: v.comment,
    empty_spool_weight: v.emptySpoolWeight ?? null,
    external_id: v.externalId ?? null,
    extra: null,
  }
}

// GET /api/v1/vendor?name={name}
export async function GET(req: NextRequest) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const name = req.nextUrl.searchParams.get('name')
  const vendors = await prisma.spoolmanVendor.findMany({
    where: name ? { name: { contains: name } } : undefined,
    orderBy: { id: 'asc' },
  })
  return NextResponse.json(vendors.map(toResponse))
}

// POST /api/v1/vendor
export async function POST(req: NextRequest) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const vendor = await prisma.spoolmanVendor.upsert({
    where: { name: body.name },
    update: {
      comment: body.comment ?? '',
      emptySpoolWeight: body.empty_spool_weight ?? null,
      externalId: body.external_id ?? null,
      updatedAt: new Date(),
    },
    create: {
      name: body.name,
      comment: body.comment ?? '',
      emptySpoolWeight: body.empty_spool_weight ?? null,
      externalId: body.external_id ?? null,
      updatedAt: new Date(),
    },
  })
  return NextResponse.json(toResponse(vendor), { status: 201 })
}
