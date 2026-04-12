import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getCatalogGrouped, syncCatalogFromSpoolmanDB } from '@/lib/filamen/catalog-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
