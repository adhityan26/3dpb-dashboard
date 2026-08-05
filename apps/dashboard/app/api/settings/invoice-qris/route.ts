import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { decodeQrisImage } from '@/lib/invoice/qris-decode'

const CONFIG_KEY = 'invoice.qrisImage'
const PAYLOAD_CONFIG_KEY = 'invoice.qrisPayload'
const MAX_BYTES = 2_000_000  // ~2MB data URL ceiling
const DECODE_WARNING = 'QR tidak terbaca otomatis — fitur jumlah dinamis tidak tersedia untuk gambar ini'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [imageRow, payloadRow] = await Promise.all([
    prisma.config.findUnique({ where: { key: CONFIG_KEY } }),
    prisma.config.findUnique({ where: { key: PAYLOAD_CONFIG_KEY } }),
  ])
  const qris: string = imageRow ? imageRow.value : ''
  const qrisPayload: string | null = payloadRow && payloadRow.value ? payloadRow.value : null
  return NextResponse.json({ qris, qrisPayload })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { qris } = await req.json() as { qris: string }
  if (typeof qris !== 'string') return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  if (qris && !qris.startsWith('data:image/')) {
    return NextResponse.json({ error: 'QRIS must be an image data URL' }, { status: 400 })
  }
  if (qris.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Gambar terlalu besar (maks ~1.5MB)' }, { status: 400 })
  }

  let qrisPayload: string | null = null
  let decodeWarning: string | undefined

  if (qris) {
    try {
      qrisPayload = await decodeQrisImage(qris)
      if (!qrisPayload) decodeWarning = DECODE_WARNING
    } catch {
      decodeWarning = DECODE_WARNING
    }
  }

  await Promise.all([
    prisma.config.upsert({
      where: { key: CONFIG_KEY },
      update: { value: qris },
      create: { key: CONFIG_KEY, value: qris },
    }),
    prisma.config.upsert({
      where: { key: PAYLOAD_CONFIG_KEY },
      update: { value: qrisPayload ?? '' },
      create: { key: PAYLOAD_CONFIG_KEY, value: qrisPayload ?? '' },
    }),
  ])

  return NextResponse.json({ qris, qrisPayload, decodeWarning })
}
