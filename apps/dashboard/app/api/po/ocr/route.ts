import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { OCRPOResult } from '@/lib/po/types'

const OCR_URL    = process.env.HOMELAB_OCR_URL    ?? 'http://192.168.88.92:3000/webhook/ocr'
const OCR_SECRET = process.env.HOMELAB_OCR_SECRET ?? ''

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: 'No image uploaded' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mimeType = file.type || 'image/jpeg'
  const dataUrl = `data:${mimeType};base64,${base64}`

  // Call homelab Claude Vision OCR
  let ocrText: string
  try {
    const ocrRes = await fetch(OCR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': OCR_SECRET,
      },
      body: JSON.stringify({ image: dataUrl }),
      signal: AbortSignal.timeout(90000),  // 90s — Claude Vision can be slow for complex invoices
    })

    if (!ocrRes.ok) {
      const err = await ocrRes.text()
      return NextResponse.json({ error: `OCR API error: ${err}` }, { status: 500 })
    }

    const data = await ocrRes.json()
    ocrText = data.text ?? ''
  } catch (e) {
    return NextResponse.json({
      error: `OCR connection failed: ${e instanceof Error ? e.message : String(e)}`
    }, { status: 500 })
  }

  if (!ocrText.trim()) {
    return NextResponse.json({ error: 'OCR returned empty text' }, { status: 500 })
  }

  // Try to parse as JSON directly (homelab Claude returns structured JSON)
  const cleaned = ocrText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    const result: OCRPOResult = JSON.parse(cleaned)
    return NextResponse.json(result)
  } catch {
    // Return raw text so caller can show it to user
    return NextResponse.json({ error: 'OCR result is not JSON', raw: ocrText }, { status: 422 })
  }
}
