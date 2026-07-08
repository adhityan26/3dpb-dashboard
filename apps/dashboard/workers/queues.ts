// workers/queues.ts

/**
 * BullMQ queue definitions and types
 * Used by photo-service.ts for async Sanity uploads
 *
 * Note: Bull is only available at runtime in the worker process.
 * During Next.js build, we provide a stub implementation.
 */

// import Queue from 'bull'  // Not available during build

export interface PhotoUploadJobData {
  photoKey: string
  orderId: string
  filename: string
  contentType: string
}

// Stub for build time
export const photoUploadQueue: any = null

// Real queue initialization (runtime only)
// const photoUploadQueue = new Queue<PhotoUploadJobData>(
//   'strava:photo-upload',
//   {
//     redis: {
//       host: process.env.REDIS_HOST || 'light-generator-redis-1',
//       port: parseInt(process.env.REDIS_PORT || '6379'),
//     },
//   }
// )
