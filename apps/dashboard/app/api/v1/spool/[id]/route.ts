import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function spoolStatus(initialWeight: number | null, usedWeight: number): string {
  if (!initialWeight || initialWeight === 0) return 'new'
  const pct = 1 - usedWeight / initialWeight
  if (pct >= 0.9) return 'full'
  if (pct >= 0.4) return 'mid'
  if (pct > 0) return 'low'
  return 'empty'
}

function toSpoolResponse(s: {
  id: number; lotNr: string | null; initialWeight: number | null; usedWeight: number
  firstUsed: Date | null; lastUsed: Date | null; createdAt: Date
  filament: {
    id: number; externalId: string | null; name: string; material: string
    diameter: number; density: number; weight: number | null; spoolWeight: number | null
    colorHex: string | null; vendorId: number | null; createdAt: Date
    vendor?: { id: number; name: string; comment: string; emptySpoolWeight: number | null; externalId: string | null; createdAt: Date } | null
  }
}) {
  return {
    id: s.id,
    registered: s.createdAt.toISOString(),
    first_used: s.firstUsed?.toISOString() ?? null,
    last_used: s.lastUsed?.toISOString() ?? null,
    filament: {
      id: s.filament.id,
      registered: s.filament.createdAt.toISOString(),
      name: s.filament.name,
      vendor: s.filament.vendor ? {
        id: s.filament.vendor.id,
        registered: s.filament.vendor.createdAt.toISOString(),
        name: s.filament.vendor.name,
        comment: s.filament.vendor.comment,
        empty_spool_weight: s.filament.vendor.emptySpoolWeight ?? null,
        external_id: s.filament.vendor.externalId ?? null,
        extra: null,
      } : null,
      material: s.filament.material,
      price: null,
      density: s.filament.density,
      diameter: s.filament.diameter,
      weight: s.filament.weight ?? null,
      spool_weight: s.filament.spoolWeight ?? null,
      article_number: null,
      comment: null,
      settings_extruder_temp: null,
      settings_bed_temp: null,
      color_hex: s.filament.colorHex ?? null,
      multi_color_hexes: null,
      multi_color_direction: null,
      external_id: s.filament.externalId ?? null,
      extra: null,
    },
    price: null,
    initial_weight: s.initialWeight ?? null,
    spool_weight: s.filament.spoolWeight ?? null,
    remaining_weight: s.initialWeight != null
      ? Math.max(0, s.initialWeight - s.usedWeight)
      : null,
    used_weight: s.usedWeight,
    location: null,
    lot_nr: s.lotNr ?? null,
    comment: null,
    archived: false,
    extra: null,
  }
}

// GET /api/v1/spool/{id} — fetch single spool
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const spoolId = parseInt(id, 10)
  if (isNaN(spoolId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const spool = await prisma.spoolmanSpool.findUnique({
    where: { id: spoolId },
    include: { filament: { include: { vendor: true } } },
  })
  if (!spool) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(toSpoolResponse(spool))
}

// PATCH /api/v1/spool/{id} — update existing spool
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const spoolId = parseInt(id, 10)
  if (isNaN(spoolId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const body = await req.json()
  const existing = await prisma.spoolmanSpool.findUnique({
    where: { id: spoolId },
    include: { filament: { include: { vendor: true } } },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const initialWeight = body.initial_weight ?? existing.initialWeight
  const usedWeight = body.used_weight ?? existing.usedWeight

  const updated = await prisma.spoolmanSpool.update({
    where: { id: spoolId },
    data: {
      filamentId: body.filament_id ?? existing.filamentId,
      lotNr: body.lot_nr ?? existing.lotNr,
      initialWeight,
      usedWeight,
      lastUsed: body.last_used ? new Date(body.last_used) : existing.lastUsed,
      updatedAt: new Date(),
    },
    include: { filament: { include: { vendor: true } } },
  })

  // Sync status to our Spool
  if (existing.spoolId) {
    await prisma.spool.update({
      where: { id: existing.spoolId },
      data: {
        status: spoolStatus(initialWeight, usedWeight),
        updatedAt: new Date(),
      },
    })
  }

  return NextResponse.json(toSpoolResponse(updated))
}
