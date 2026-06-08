// workers/queues.ts

/**
 * BullMQ queue definitions and types
 * Used by photo-service.ts for async Sanity uploads
 */

import Queue from 'bull'

export interface PhotoUploadJobData {
  photoKey: string
  orderId: string
  filename: string
  contentType: string
}

export const photoUploadQueue = new Queue<PhotoUploadJobData>(
  'strava:photo-upload',
  {
    redis: {
      host: process.env.REDIS_HOST || 'light-generator-redis-1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
  }
)
