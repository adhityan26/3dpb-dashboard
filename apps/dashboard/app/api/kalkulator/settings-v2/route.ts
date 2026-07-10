import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadSettingsV2 } from '@/lib/kalkulator/settings-v2'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await loadSettingsV2())
}
