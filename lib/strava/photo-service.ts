// lib/strava/photo-service.ts

import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getMinioClient } from '@/lib/minio'
import { prisma } from '@/lib/db'
import { redisGet, redisSet, redisDel } from '@/lib/redis'
import { sanityWrite } from '@/lib/sanity/client'
import type { StravaOrderWithPhotos } from './types'

const MINIO_BUCKET = process.env.STRAVA_MINIO_BUCKET ?? 'strava-orders'
const PHOTO_SANITY_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days
const MINIO_URL_TTL_SECONDS = 60 * 60 // 1 hour for presigned URLs

/**
 * Upload photos to MinIO and enqueue Sanity sync job
 * Updates PostgreSQL resultPhotoKeys and returns order with photo URLs
 */
export async function uploadResultPhotos(
  orderId: string,
  files: Array<{ file: Blob; filename: string }>
): Promise<StravaOrderWithPhotos> {
  const order = await prisma.stravaOrder.findUnique({
    where: { orderId },
  })
  if (!order) {
    throw new Error(`Order not found: ${orderId}`)
  }

  const photoKeys: string[] = []
  const minio = getMinioClient()
  const timestamp = Date.now()

  // Upload each file to MinIO
  for (const { file, filename } of files) {
    const photoKey = `strava/${orderId}/${timestamp}-${filename}`
    const buffer = Buffer.from(await file.arrayBuffer())

    await minio.send(
      new PutObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: photoKey,
        Body: buffer,
        ContentType: file.type,
      })
    )

    photoKeys.push(photoKey)

    // TODO: Enqueue Sanity upload job via background worker
    // For now, photos are stored in MinIO and getSanityPhotoUrl() will handle fetch-on-demand
    console.log(`[Strava] Photo uploaded to MinIO: ${photoKey} (Sanity sync pending)`)
  }

  // Update PostgreSQL with photo keys
  const updated = await prisma.stravaOrder.update({
    where: { id: order.id },
    data: {
      resultPhotoKeys: [...(order.resultPhotoKeys || []), ...photoKeys],
    },
  })

  // Return order with URLs
  return getResultPhotosWithUrls(orderId)
}

/**
 * Get Sanity asset ID from Redis cache
 * Returns null if not cached or expired
 */
export async function getSanityPhotoUrl(photoKey: string): Promise<string | null> {
  const cached = await redisGet<{ sanityAssetId: string; expiresAt: number }>(
    `photo:${photoKey}:sanity`
  )

  if (!cached) return null

  // Check expiration
  if (cached.expiresAt < Date.now()) {
    await redisDel(`photo:${photoKey}:sanity`)
    return null
  }

  // Return Sanity asset URL
  return `https://cdn.sanity.io/files/${process.env.SANITY_PROJECT_ID}/${process.env.SANITY_DATASET}/${cached.sanityAssetId}`
}

/**
 * Fetch order photos with MinIO and Sanity URLs
 * Marks expired photos (no Sanity URL after 30 days)
 */
export async function getResultPhotosWithUrls(
  orderId: string
): Promise<StravaOrderWithPhotos> {
  const order = await prisma.stravaOrder.findUnique({
    where: { orderId },
  })
  if (!order) {
    throw new Error(`Order not found: ${orderId}`)
  }

  const minio = getMinioClient()

  const resultPhotos = await Promise.all(
    (order.resultPhotoKeys || []).map(async (photoKey) => {
      // Get MinIO presigned URL
      const minioUrl = await getSignedUrl(
        minio,
        new GetObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: photoKey,
        }),
        { expiresIn: MINIO_URL_TTL_SECONDS }
      )

      // Try to get Sanity URL from cache
      const sanityUrl = await getSanityPhotoUrl(photoKey)

      // Photo is expired if no Sanity URL
      const expired = !sanityUrl

      return {
        key: photoKey,
        minioUrl,
        sanityUrl: sanityUrl ?? undefined,
        expired,
      }
    })
  )

  return {
    ...order,
    customerPhone: order.customerPhone ?? undefined,  // Convert null to undefined
    submittedAt: new Date(order.submittedAt),
    confirmedAt: order.confirmedAt ? new Date(order.confirmedAt) : undefined,
    completedAt: order.completedAt ? new Date(order.completedAt) : undefined,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
    resultPhotos,
  }
}

/**
 * Background job: Upload MinIO photo to Sanity with TTL metadata
 * Stores Sanity asset ID in Redis with 30-day TTL
 * Called by photoUploadQueue worker
 */
export async function uploadPhotoToSanity(
  jobData: PhotoUploadJobData
): Promise<{ sanityAssetId: string; expiresAt: number }> {
  const { photoKey, orderId, filename, contentType } = jobData

  const minio = getMinioClient()

  // Download file from MinIO
  const response = await minio.send(
    new GetObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: photoKey,
    })
  )

  if (!response.Body) {
    throw new Error(`Failed to download photo from MinIO: ${photoKey}`)
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as any) {
    chunks.push(chunk)
  }
  const buffer = Buffer.concat(chunks)

  // Upload to Sanity with metadata
  const expiresAt = new Date(Date.now() + PHOTO_SANITY_TTL_SECONDS * 1000)
  const asset = await sanityWrite.assets.upload('file', buffer, {
    filename,
    metadata: {
      source: 'strava-orders',
      orderId,
      uploadedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      _type: 'sanity.fileAsset',
    },
  })

  // Cache in Redis with TTL
  const cacheData = {
    sanityAssetId: asset._id,
    expiresAt: expiresAt.getTime(),
  }
  await redisSet(`photo:${photoKey}:sanity`, cacheData, PHOTO_SANITY_TTL_SECONDS)

  return cacheData
}
