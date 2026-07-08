import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { recomputeFilamentHarga } from '@/lib/kalkulator/service'

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { field?: string; from?: string; to?: string; brandScope?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { field, from, to, brandScope } = body

  if (!field || !from || !to)
    return NextResponse.json({ error: 'Missing fields: field, from, to required' }, { status: 400 })
  if (!['brand', 'material', 'color'].includes(field))
    return NextResponse.json({ error: 'field must be "brand", "material", or "color"' }, { status: 400 })
  if (from.trim() === to.trim())
    return NextResponse.json({ error: 'from and to must be different' }, { status: 400 })

  try {
    let where: Record<string, unknown>
    let data: Record<string, unknown>

    if (field === 'color') {
      // colorName rename — global or scoped to brand
      where = brandScope ? { colorName: from, brand: brandScope } : { colorName: from }
      data = { colorName: to }
    } else if (field === 'material') {
      // material rename — scoped to brand if brandScope provided
      where = brandScope ? { material: from, brand: brandScope } : { material: from }
      data = { material: to }
      // Also update FilamentHarga — delete conflicts first, then rename
      if (brandScope) {
        const exists = await prisma.filamentHarga.findUnique({ where: { brand_material: { brand: brandScope, material: to } } })
        if (exists) await prisma.filamentHarga.deleteMany({ where: { brand: brandScope, material: from } })
        else await prisma.filamentHarga.updateMany({ where: { material: from, brand: brandScope }, data: { material: to } })
      } else {
        const toBrands = (await prisma.filamentHarga.findMany({ where: { material: to }, select: { brand: true } })).map((r: { brand: string }) => r.brand)
        if (toBrands.length > 0) {
          await prisma.filamentHarga.deleteMany({ where: { material: from, brand: { in: toBrands } } })
        }
        await prisma.filamentHarga.updateMany({ where: { material: from }, data: { material: to } })
      }
    } else {
      // brand rename — global
      where = { brand: from }
      data = { brand: to }
      // Delete FilamentHarga rows for `from` that would conflict with existing `to` rows
      const toMaterials = (await prisma.filamentHarga.findMany({ where: { brand: to }, select: { material: true } })).map((r: { material: string }) => r.material)
      if (toMaterials.length > 0) {
        await prisma.filamentHarga.deleteMany({ where: { brand: from, material: { in: toMaterials } } })
      }
      await prisma.filamentHarga.updateMany({ where: { brand: from }, data: { brand: to } })
    }

    const result = await prisma.spool.updateMany({ where, data })

    // Recompute moving average after rename so FilamentHarga rates stay accurate
    await recomputeFilamentHarga()

    return NextResponse.json({ updated: result.count })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
