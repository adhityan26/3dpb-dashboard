import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAmsSections } from '@/lib/filamen/ams-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await getAmsSections()
  return NextResponse.json(data)
}
