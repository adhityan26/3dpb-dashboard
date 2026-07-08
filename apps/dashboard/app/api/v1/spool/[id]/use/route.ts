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

// PUT /api/v1/spool/{id}/use — add to used_weight (Spoolman consumption tracking)
export async function PUT(
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

  // use_weight adds to existing, or use_length converts via filament density+diameter
  let addedWeight = 0
  if (typeof body.use_weight === 'number') {
    addedWeight = body.use_weight
  } else if (typeof body.use_length === 'number') {
    // Convert length (mm) to weight (g): w = length * π * (d/2)² * density
    const d = existing.filament.diameter / 10  // mm to cm
    const density = existing.filament.density
    addedWeight = body.use_length * Math.PI * Math.pow(d / 2, 2) * density / 1000
  }

  const newUsedWeight = Math.min(
    existing.usedWeight + addedWeight,
    existing.initialWeight ?? Infinity
  )

  const updated = await prisma.spoolmanSpool.update({
    where: { id: spoolId },
    data: {
      usedWeight: newUsedWeight,
      lastUsed: new Date(),
      updatedAt: new Date(),
    },
    include: { filament: { include: { vendor: true } } },
  })

  // Sync status to our Spool
  if (existing.spoolId) {
    await prisma.spool.update({
      where: { id: existing.spoolId },
      data: {
        status: spoolStatus(updated.initialWeight, updated.usedWeight),
        updatedAt: new Date(),
      },
    })
  }

  return NextResponse.json({
    id: updated.id,
    registered: updated.createdAt.toISOString(),
    first_used: updated.firstUsed?.toISOString() ?? null,
    last_used: updated.lastUsed?.toISOString() ?? null,
    filament: {
      id: updated.filament.id,
      name: updated.filament.name,
      vendor: updated.filament.vendor ? { id: updated.filament.vendor.id, name: updated.filament.vendor.name } : null,
      material: updated.filament.material,
      density: updated.filament.density,
      diameter: updated.filament.diameter,
      weight: updated.filament.weight ?? null,
      spool_weight: updated.filament.spoolWeight ?? null,
      color_hex: updated.filament.colorHex ?? null,
      external_id: updated.filament.externalId ?? null,
    },
    price: null,
    initial_weight: updated.initialWeight ?? null,
    spool_weight: updated.filament.spoolWeight ?? null,
    remaining_weight: updated.initialWeight != null
      ? Math.max(0, updated.initialWeight - updated.usedWeight)
      : null,
    used_weight: updated.usedWeight,
    location: null,
    lot_nr: updated.lotNr ?? null,
    comment: null,
    archived: false,
    extra: null,
  })
}
