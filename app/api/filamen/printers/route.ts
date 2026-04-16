import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listPrinters, createPrinter } from '@/lib/filamen/printer-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const printers = await listPrinters()
  return NextResponse.json(printers)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const printer = await createPrinter(body)
  return NextResponse.json(printer, { status: 201 })
}
