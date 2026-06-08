// app/api/strava/orders/[id]/photos/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { uploadResultPhotos } from '@/lib/strava/photo-service'

/**
 * POST /api/strava/orders/{id}/photos
 *
 * Upload result photos for a completed Strava order.
 * Photos are stored in MinIO and queued for Sanity sync.
 *
 * Body: multipart/form-data with field 'files' (multiple files)
 * Response: 201 + { photoKeys: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Get FormData
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json(
        { error: 'Invalid multipart body' },
        { status: 400 }
      )
    }

    // Get files from 'files' field
    const files = formData.getAll('files')

    // Validate files array not empty
    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "Missing 'files' field or empty array" },
        { status: 400 }
      )
    }

    // Convert to array of { file, filename }
    const fileArray = files
      .filter((f) => f instanceof File)
      .map((f) => ({
        file: f as Blob,
        filename: (f as File).name,
      }))

    if (fileArray.length === 0) {
      return NextResponse.json(
        { error: "No valid files provided" },
        { status: 400 }
      )
    }

    // Upload photos
    const result = await uploadResultPhotos(id, fileArray)

    return NextResponse.json(
      {
        photoKeys: result.resultPhotoKeys || [],
      },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/strava/orders/[id]/photos]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
