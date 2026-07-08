import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params
  // Sanitize: strip any path traversal
  const safeName = path.basename(filename)
  const filePath = path.join(process.cwd(), 'data', 'images', 'katalog', safeName)

  try {
    const data = await readFile(filePath)
    const ext = safeName.split('.').pop()?.toLowerCase()
    const contentType =
      ext === 'png'  ? 'image/png'  :
      ext === 'webp' ? 'image/webp' :
                       'image/jpeg'
    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
