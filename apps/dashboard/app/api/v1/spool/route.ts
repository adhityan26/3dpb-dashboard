import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

function toResponse(s: {
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
      density: s.filament.density,
      diameter: s.filament.diameter,
      weight: s.filament.weight ?? null,
      spool_weight: s.filament.spoolWeight ?? null,
      color_hex: s.filament.colorHex ?? null,
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

// Determine spool status from used/initial weight
function spoolStatus(initialWeight: number | null, usedWeight: number): string {
  if (!initialWeight || initialWeight === 0) return 'new'
  const pct = 1 - usedWeight / initialWeight
  if (pct >= 0.9) return 'full'
  if (pct >= 0.4) return 'mid'
  if (pct > 0) return 'low'
  return 'empty'
}

// GET /api/v1/spool?lot_nr={lotNr}
export async function GET(req: NextRequest) {
  const lotNr = req.nextUrl.searchParams.get('lot_nr')
  const spools = await prisma.spoolmanSpool.findMany({
    where: lotNr ? { lotNr } : undefined,
    include: { filament: { include: { vendor: true } } },
    orderBy: { id: 'asc' },
  })
  return NextResponse.json(spools.map(toResponse))
}

// POST /api/v1/spool — create new spool, also create Spool in our system
export async function POST(req: NextRequest) {
  const body = await req.json()

  const filament = await prisma.spoolmanFilament.findUnique({
    where: { id: body.filament_id },
    include: { vendor: true },
  })
  if (!filament) {
    return NextResponse.json({ error: 'Filament not found' }, { status: 400 })
  }

  const initialWeight = body.initial_weight ?? null
  const usedWeight = body.used_weight ?? 0
  const status = spoolStatus(initialWeight, usedWeight)

  // Auto-create a Spool in our system so it shows up in the UI
  const colorHex = filament.colorHex
    ? (filament.colorHex.startsWith('#') ? filament.colorHex : `#${filament.colorHex}`)
    : '#888888'

  const ourSpool = await prisma.spool.create({
    data: {
      brand: filament.vendor?.name ?? 'Unknown',
      material: filament.material || 'Unknown',
      colorName: filament.name,
      colorHex,
      status,
      nfcTagId: body.lot_nr ?? null,
      notes: `Diimport dari Bambu Spoolman Pal (${filament.externalId ?? 'unknown'})`,
      updatedAt: new Date(),
    },
  })

  const spoolmanSpool = await prisma.spoolmanSpool.create({
    data: {
      filamentId: body.filament_id,
      lotNr: body.lot_nr ?? null,
      initialWeight,
      usedWeight,
      firstUsed: body.first_used ? new Date(body.first_used) : new Date(),
      lastUsed: body.last_used ? new Date(body.last_used) : null,
      spoolId: ourSpool.id,
      updatedAt: new Date(),
    },
    include: { filament: { include: { vendor: true } } },
  })

  return NextResponse.json(toResponse(spoolmanSpool), { status: 201 })
}
