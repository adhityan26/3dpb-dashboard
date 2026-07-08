import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function toResponse(f: {
  id: number; externalId: string | null; name: string; material: string
  diameter: number; density: number; weight: number | null; spoolWeight: number | null
  colorHex: string | null; vendorId: number | null; createdAt: Date
  vendor?: { id: number; name: string; comment: string; emptySpoolWeight: number | null; externalId: string | null; createdAt: Date } | null
}) {
  return {
    id: f.id,
    registered: f.createdAt.toISOString(),
    name: f.name,
    vendor: f.vendor ? {
      id: f.vendor.id,
      registered: f.vendor.createdAt.toISOString(),
      name: f.vendor.name,
      comment: f.vendor.comment,
      empty_spool_weight: f.vendor.emptySpoolWeight ?? null,
      external_id: f.vendor.externalId ?? null,
      extra: null,
    } : null,
    material: f.material,
    price: null,
    density: f.density,
    diameter: f.diameter,
    weight: f.weight ?? null,
    spool_weight: f.spoolWeight ?? null,
    article_number: null,
    comment: null,
    settings_extruder_temp: null,
    settings_bed_temp: null,
    color_hex: f.colorHex ?? null,
    multi_color_hexes: null,
    multi_color_direction: null,
    external_id: f.externalId ?? null,
    extra: null,
  }
}

// GET /api/v1/filament?external_id={id}
export async function GET(req: NextRequest) {
  const externalId = req.nextUrl.searchParams.get('external_id')
  const filaments = await prisma.spoolmanFilament.findMany({
    where: externalId ? { externalId } : undefined,
    include: { vendor: true },
    orderBy: { id: 'asc' },
  })
  return NextResponse.json(filaments.map(toResponse))
}

// POST /api/v1/filament
export async function POST(req: NextRequest) {
  const body = await req.json()
  const filament = await prisma.spoolmanFilament.create({
    data: {
      externalId: body.external_id ?? null,
      name: body.name ?? '',
      material: body.material ?? '',
      diameter: body.diameter ?? 1.75,
      density: body.density ?? 1.24,
      weight: body.weight ?? null,
      spoolWeight: body.spool_weight ?? null,
      colorHex: body.color_hex ?? null,
      vendorId: body.vendor_id ?? null,
      updatedAt: new Date(),
    },
    include: { vendor: true },
  })
  return NextResponse.json(toResponse(filament), { status: 201 })
}
