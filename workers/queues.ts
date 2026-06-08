// workers/queues.ts

/**
 * BullMQ queue definitions and types
 * Used by photo-service.ts for async Sanity uploads
 */

export interface PhotoUploadJobData {
  photoKey: string
  orderId: string
  filename: string
  contentType: string
}

// Placeholder queue - implementation depends on BullMQ setup
// This will be properly initialized when BullMQ is configured
export const photoUploadQueue = {
  add: async (name: string, data: PhotoUploadJobData, options?: any) => {
    console.warn(`[photo-queue] Job enqueued but queue not configured: ${name}`, { data, options })
    return { id: `mock-${Date.now()}` }
  },
} as any
