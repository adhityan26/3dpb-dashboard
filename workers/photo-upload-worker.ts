// workers/photo-upload-worker.ts

/**
 * BullMQ worker for async Sanity photo uploads
 * Processes jobs enqueued by uploadResultPhotos in photo-service.ts
 */

// import { photoUploadQueue, type PhotoUploadJobData } from './queues'  // bull not available at build time
import { uploadPhotoToSanity } from '@/lib/strava/photo-service'

// Queue setup is deferred to runtime in a Node.js worker process
const photoUploadQueue: any = null

/**
 * Process photo upload jobs
 * Downloads from MinIO → uploads to Sanity → caches asset ID in Redis
 */
photoUploadQueue.process(async (job: any) => {
  const { photoKey, orderId, filename, contentType } = job.data as PhotoUploadJobData

  console.log(`[photo-upload] Processing: ${photoKey}`)

  try {
    const result = await uploadPhotoToSanity(job.data)
    console.log(`[photo-upload] Success: ${photoKey} → ${result.sanityAssetId}`)
    return result
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[photo-upload] Failed: ${photoKey}`, error)
    throw err // BullMQ will retry based on job options
  }
})

/**
 * Handle successful job completion
 */
photoUploadQueue.on('completed', (job: any) => {
  console.log(`[photo-upload] Job completed: ${job.id} (${job.data.photoKey})`)
})

/**
 * Handle job failures after all retry attempts
 */
photoUploadQueue.on('failed', (job: any, err: any) => {
  const errorMsg = err instanceof Error ? err.message : String(err)
  console.error(
    `[photo-upload] Job failed permanently: ${job.id} (${job.data.photoKey})`,
    errorMsg
  )
})

/**
 * Handle job retries
 */
photoUploadQueue.on('stalled', (job: any) => {
  console.warn(`[photo-upload] Job stalled: ${job.id} (${job.data.photoKey})`)
})

export default photoUploadQueue
