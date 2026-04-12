import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getCatalogGrouped, syncCatalogFromSpoolmanDB } from '@/lib/filamen/catalog-service'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const count = await prisma.filamentCatalog.count()
  if (count === 0) {
    // Auto-seed on first use — silently ignore network errors
    try {
      await syncCatalogFromSpoolmanDB()
    } catch (e) {
      console.warn('Auto-seed catalog failed:', e)
    }
  }

  const grouped = await getCatalogGrouped()
  return NextResponse.json({ catalog: grouped })
}

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await syncCatalogFromSpoolmanDB()
  return NextResponse.json(result)
}
