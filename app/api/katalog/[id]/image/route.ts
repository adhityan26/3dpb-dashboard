import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/db'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP allowed' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const filename = `${id}.${ext}`
  const dir = path.join(process.cwd(), 'data', 'images', 'katalog')

  await mkdir(dir, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(dir, filename), buffer)

  const imageUrl = `/api/images/katalog/${filename}`
  await prisma.produkInternal.update({ where: { id }, data: { imageUrl } })

  return NextResponse.json({ imageUrl })
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const record = await prisma.produkInternal.findUnique({ where: { id }, select: { imageUrl: true } })

  if (record?.imageUrl) {
    const filename = path.basename(record.imageUrl)
    const filePath = path.join(process.cwd(), 'data', 'images', 'katalog', filename)
    await unlink(filePath).catch(() => {}) // ignore if file already gone
  }

  await prisma.produkInternal.update({ where: { id }, data: { imageUrl: null } })
  return new NextResponse(null, { status: 204 })
}
