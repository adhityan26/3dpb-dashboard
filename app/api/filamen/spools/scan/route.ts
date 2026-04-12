import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSpoolByBarcode, getSpoolByNfc } from '@/lib/filamen/spool-service'

// POST { type: 'barcode'|'nfc', value: string }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, value } = await req.json() as { type: 'barcode' | 'nfc'; value: string }

  const spool = type === 'nfc'
    ? await getSpoolByNfc(value)
    : await getSpoolByBarcode(value)

  if (!spool) {
    return NextResponse.json({ found: false, rawValue: value }, { status: 404 })
  }

  return NextResponse.json({ found: true, spool })
}
