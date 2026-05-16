import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import type { OCRPOResult } from '@/lib/po/types'

const GEMINI_KEY = process.env.GEMINI_API_KEY

const PROMPT = `Extract purchase order data from this invoice image. Return ONLY valid JSON (no markdown, no explanation):
{
  "nomor": "invoice/PO number or null",
  "vendorNama": "vendor/supplier name",
  "tanggal": "date in YYYY-MM-DD format or null",
  "items": [
    {
      "namaProduct": "full product name",
      "kode": "product code or null",
      "qty": number,
      "uom": "unit e.g. EA Roll kg",
      "harga": price_per_unit_as_number,
      "diskon": discount_percentage_as_number_or_0,
      "total": total_price_as_number,
      "isFilament": true_if_this_is_3d_printing_filament_or_resin,
      "brand": "brand name e.g. eSUN BambuLab Sunlu Bambu or null",
      "material": "material type e.g. PLA+ PETG TPU ABS Resin or null",
      "colorName": "color name e.g. Red Blue White or null"
    }
  ]
}
All prices as plain numbers (no Rp or comma formatting). If a field is unknown, use null.`

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!GEMINI_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: 'No image uploaded' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mimeType = file.type || 'image/jpeg'

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(30000),
    }
  )

  if (!geminiRes.ok) {
    const err = await geminiRes.text()
    return NextResponse.json({ error: `Gemini error: ${err}` }, { status: 500 })
  }

  const geminiData = await geminiRes.json()
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

  // Strip markdown code blocks if present
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    const result: OCRPOResult = JSON.parse(cleaned)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Failed to parse Gemini response', raw: text }, { status: 500 })
  }
}
