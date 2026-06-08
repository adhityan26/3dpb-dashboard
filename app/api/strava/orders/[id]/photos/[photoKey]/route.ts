// app/api/strava/orders/[id]/photos/[photoKey]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { getSanityPhotoUrl } from '@/lib/strava/photo-service'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getMinioClient } from '@/lib/minio'

const MINIO_BUCKET = process.env.STRAVA_MINIO_BUCKET ?? 'strava-orders'

/**
 * GET /api/strava/orders/{id}/photos/{photoKey}
 *
 * Public photo endpoint with TTL and MinIO fallback.
 *
 * Logic:
 * 1. Try getSanityPhotoUrl(photoKey) → check cache
 * 2. If expired (no URL): fetch from MinIO, re-upload to Sanity (future: trigger job)
 * 3. If found: use that URL
 * 4. If not found anywhere: 404
 * 5. Redirect with 301 to photo URL
 *
 * Response: 301 redirect to photo URL
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photoKey: string }> }
) {
  try {
    const { id, photoKey } = await params

    // Validate params
    if (!id || !photoKey) {
      return NextResponse.json(
        { error: 'Missing id or photoKey' },
        { status: 400 }
      )
    }

    // Try to get Sanity photo URL from cache
    const sanityUrl = await getSanityPhotoUrl(photoKey)

    if (sanityUrl) {
      // Found in cache, redirect to Sanity URL
      return NextResponse.redirect(sanityUrl, { status: 301 })
    }

    // Not in cache or expired - try MinIO fallback
    const minio = getMinioClient()

    try {
      const minioUrl = await getSignedUrl(
        minio,
        new GetObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: photoKey,
        }),
        { expiresIn: 60 * 60 } // 1 hour
      )

      // Photo exists in MinIO, redirect to MinIO URL
      // Note: In future, could trigger re-upload to Sanity job here
      return NextResponse.redirect(minioUrl, { status: 301 })
    } catch (minioError) {
      // Photo not found in MinIO either
      return NextResponse.json(
        { error: 'Photo not found' },
        { status: 404 }
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[GET /api/strava/orders/[id]/photos/[photoKey]]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
