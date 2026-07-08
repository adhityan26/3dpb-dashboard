# Strava Order Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Strava order management system (landing page submission → Sanity approval → dashboard management) with unified Order page, photo upload (MinIO + Sanity CDN with 30-day TTL), and status workflow.

**Architecture:** PostgreSQL stores orders (source of truth), Sanity CMS gates approval workflow, MinIO stores photos, BullMQ background job uploads photos to Sanity for public CDN access with 30-day TTL. Dashboard sidebar navigation shows 3 order channels (Shopee | Light Generator | Strava).

**Tech Stack:** Prisma (PostgreSQL), Sanity CMS, MinIO, BullMQ (background jobs), React Query, TypeScript.

---

## File Structure

**New files to create:**
- `prisma/migrations/<timestamp>-add-strava-order.sql` — Prisma migration
- `lib/strava/types.ts` — TypeScript types and interfaces
- `lib/strava/sanity-helpers.ts` — Sanity query/mutation helpers
- `lib/strava/service.ts` — Order CRUD service
- `lib/strava/photo-service.ts` — Photo upload + Sanity sync logic
- `lib/hooks/use-strava-orders.ts` — React Query hooks
- `app/api/strava/orders/route.ts` — POST/GET orders
- `app/api/strava/orders/[id]/route.ts` — GET/PATCH single order
- `app/api/strava/orders/[id]/confirm/route.ts` — Confirm order from Sanity
- `app/api/strava/orders/[id]/photos/route.ts` — Upload photos
- `app/api/strava/orders/[id]/photos/[photoKey]/route.ts` — Fetch photo (redirect)
- `components/order/StravaOrderList.tsx` — Order list view
- `components/order/StravaOrderDetail.tsx` — Order detail + status management
- `components/order/StravaPhotoUpload.tsx` — Photo upload component
- `components/cms/StravaOrdersManager.tsx` — Sanity approval UI
- `workers/photo-upload-worker.ts` — BullMQ background job processor
- `__tests__/strava/order.test.ts` — Unit tests for order service

**Modified files:**
- `prisma/schema.prisma` — Add StravaOrder model
- `app/(dashboard)/order/page.tsx` — Add sidebar nav with 3 channels
- `lib/hooks/use-orders.ts` — Export strava order hooks
- `.env.deploy.example` — Document STRAVA_UPLOAD_QUEUE_NAME if needed

---

## Task Breakdown

### Task 1: Add Strava Order Model to Prisma

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>-add-strava-order.sql`

- [ ] **Step 1: Add StravaOrder model to schema**

Edit `prisma/schema.prisma`, add after existing models:

```prisma
model StravaOrder {
  id        String   @id @default(cuid())
  orderId   String   @unique                    // STR-2026-0001 format
  sanityDocId String?
  
  // Customer info
  customerName    String
  customerEmail   String
  customerPhone   String?
  
  // Items (stored as JSON array)
  items      Json                              // Array<{productName, quantity, unitPrice, notes}>
  totalAmount Int                              // in cents (Rp)
  
  // Status & tracking
  status     String   @default("pending")      // pending|confirmed|processing|completed|cancelled
  statusChangedAt DateTime?
  operatorNotes String?
  
  // Photos (file paths in MinIO)
  resultPhotoKeys String[]                    // ["strava/STR-2026-0001/photo1.jpg", ...]
  
  // Timestamps
  submittedAt DateTime @default(now())
  confirmedAt DateTime?
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([status])
  @@index([submittedAt])
}
```

- [ ] **Step 2: Create migration**

Run: `npx prisma migrate dev --name add-strava-order`

Expected: Migration file created in `prisma/migrations/`

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add StravaOrder model to schema"
```

---

### Task 2: Strava Types & Interfaces

**Files:**
- Create: `lib/strava/types.ts`

- [ ] **Step 1: Create types file**

```typescript
// lib/strava/types.ts

export type StravaStatus = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled'

export interface StravaOrderItem {
  productName: string
  quantity: number
  unitPrice: number  // in cents (Rp)
  notes?: string
}

export interface StravaOrder {
  id: string
  orderId: string
  sanityDocId?: string | null
  customerName: string
  customerEmail: string
  customerPhone?: string
  items: StravaOrderItem[]
  totalAmount: number  // in cents (Rp)
  status: StravaStatus
  statusChangedAt?: Date
  operatorNotes?: string
  resultPhotoKeys: string[]
  submittedAt: Date
  confirmedAt?: Date
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface StravaOrderWithPhotos extends StravaOrder {
  resultPhotos: Array<{
    key: string
    minioUrl: string
    sanityUrl?: string
    expired?: boolean
  }>
}

export interface CreateStravaOrderInput {
  customerName: string
  customerEmail: string
  customerPhone?: string
  items: StravaOrderItem[]
  totalAmount: number
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/strava/types.ts
git commit -m "feat: strava order types"
```

---

### Task 3: Sanity Helpers for Strava Orders

**Files:**
- Create: `lib/strava/sanity-helpers.ts`

- [ ] **Step 1: Create sanity-helpers file**

```typescript
// lib/strava/sanity-helpers.ts

import { sanity } from '@/lib/sanity/client'
import type { StravaOrder } from './types'

const STRAVA_ORDER_QUERY = `{
  _id,
  orderId,
  status,
  customerName,
  customerEmail,
  customerPhone,
  items,
  totalAmount,
  operatorNotes,
  submittedAt,
  confirmedAt,
  completedAt,
}`

export async function fetchPendingStravaOrders() {
  return sanity.fetch(
    `*[_type == "stravaOrder" && status == "submitted"] | order(submittedAt desc) ${STRAVA_ORDER_QUERY}`
  )
}

export async function fetchAllStravaOrders() {
  return sanity.fetch(
    `*[_type == "stravaOrder"] | order(submittedAt desc) ${STRAVA_ORDER_QUERY}`
  )
}

export async function countPendingStravaOrders(): Promise<number> {
  const docs = await fetchPendingStravaOrders()
  return docs.length
}

export async function createSanityStravaOrder(orderData: StravaOrder) {
  const doc = {
    _type: 'stravaOrder',
    orderId: orderData.orderId,
    status: 'submitted',
    customerName: orderData.customerName,
    customerEmail: orderData.customerEmail,
    customerPhone: orderData.customerPhone,
    items: orderData.items,
    totalAmount: orderData.totalAmount,
    submittedAt: orderData.submittedAt.toISOString(),
  }
  
  return sanity.create(doc)
}

export async function updateSanityStravaOrder(docId: string, updates: Partial<StravaOrder>) {
  const patch: Record<string, any> = {}
  
  if (updates.status) patch.status = updates.status
  if (updates.operatorNotes !== undefined) patch.operatorNotes = updates.operatorNotes
  if (updates.confirmedAt) patch.confirmedAt = updates.confirmedAt.toISOString()
  if (updates.completedAt) patch.completedAt = updates.completedAt.toISOString()
  
  return sanity.patch(docId).set(patch).commit()
}

export async function getStravaOrderBySanityId(sanityDocId: string) {
  return sanity.fetch(
    `*[_type == "stravaOrder" && _id == $id][0] ${STRAVA_ORDER_QUERY}`,
    { id: sanityDocId }
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/strava/sanity-helpers.ts
git commit -m "feat: strava sanity helpers for approval workflow"
```

---

### Task 4: Strava Order Service (CRUD)

**Files:**
- Create: `lib/strava/service.ts`

- [ ] **Step 1: Create service file**

```typescript
// lib/strava/service.ts

import { prisma } from '@/lib/db'
import type { StravaOrder, StravaStatus, CreateStravaOrderInput } from './types'
import {
  createSanityStravaOrder,
  updateSanityStravaOrder,
} from './sanity-helpers'

/** Generate unique order ID: STR-YYYY-MMDD-NNNN */
function generateOrderId(): string {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `STR-${date}-${random}`
}

export async function createStravaOrder(input: CreateStravaOrderInput): Promise<StravaOrder> {
  const orderId = generateOrderId()
  const now = new Date()
  
  // 1. Create in PostgreSQL
  const order = await prisma.stravaOrder.create({
    data: {
      orderId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      items: input.items,
      totalAmount: input.totalAmount,
      status: 'pending',
      submittedAt: now,
      resultPhotoKeys: [],
    },
  })
  
  // 2. Create in Sanity (approval gate)
  try {
    const sanityDoc = await createSanityStravaOrder({
      ...order,
      submittedAt: new Date(order.submittedAt),
      createdAt: new Date(order.createdAt),
      updatedAt: new Date(order.updatedAt),
    } as StravaOrder)
    
    // 3. Link Sanity doc to PostgreSQL record
    return prisma.stravaOrder.update({
      where: { id: order.id },
      data: { sanityDocId: sanityDoc._id },
    })
  } catch (err) {
    // If Sanity creation fails, delete PostgreSQL record
    await prisma.stravaOrder.delete({ where: { id: order.id } })
    throw err
  }
}

export async function getStravaOrders(status?: StravaStatus): Promise<StravaOrder[]> {
  const orders = await prisma.stravaOrder.findMany({
    where: status ? { status } : undefined,
    orderBy: { submittedAt: 'desc' },
  })
  return orders.map(o => ({
    ...o,
    submittedAt: new Date(o.submittedAt),
    confirmedAt: o.confirmedAt ? new Date(o.confirmedAt) : undefined,
    completedAt: o.completedAt ? new Date(o.completedAt) : undefined,
    createdAt: new Date(o.createdAt),
    updatedAt: new Date(o.updatedAt),
  }))
}

export async function getStravaOrder(id: string): Promise<StravaOrder | null> {
  const order = await prisma.stravaOrder.findUnique({ where: { id } })
  if (!order) return null
  return {
    ...order,
    submittedAt: new Date(order.submittedAt),
    confirmedAt: order.confirmedAt ? new Date(order.confirmedAt) : undefined,
    completedAt: order.completedAt ? new Date(order.completedAt) : undefined,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt),
  }
}

export async function getStravaOrderByOrderId(orderId: string): Promise<StravaOrder | null> {
  return getStravaOrder((await prisma.stravaOrder.findUnique({ where: { orderId } }))?.id || '')
}

export async function updateStravaOrder(
  id: string,
  updates: Partial<StravaOrder>
): Promise<StravaOrder> {
  const updateData: Record<string, any> = {}
  
  if (updates.status) updateData.status = updates.status
  if (updates.operatorNotes !== undefined) updateData.operatorNotes = updates.operatorNotes
  if (updates.statusChangedAt) updateData.statusChangedAt = updates.statusChangedAt
  if (updates.confirmedAt) updateData.confirmedAt = updates.confirmedAt
  if (updates.completedAt) updateData.completedAt = updates.completedAt
  
  const updated = await prisma.stravaOrder.update({
    where: { id },
    data: updateData,
  })
  
  // Sync to Sanity if status changed
  if (updates.status && updated.sanityDocId) {
    await updateSanityStravaOrder(updated.sanityDocId, { status: updates.status })
  }
  
  return {
    ...updated,
    submittedAt: new Date(updated.submittedAt),
    confirmedAt: updated.confirmedAt ? new Date(updated.confirmedAt) : undefined,
    completedAt: updated.completedAt ? new Date(updated.completedAt) : undefined,
    createdAt: new Date(updated.createdAt),
    updatedAt: new Date(updated.updatedAt),
  }
}

export async function confirmStravaOrder(id: string): Promise<StravaOrder> {
  const now = new Date()
  return updateStravaOrder(id, {
    status: 'confirmed',
    confirmedAt: now,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/strava/service.ts
git commit -m "feat: strava order CRUD service with Sanity sync"
```

---

### Task 5: Photo Service (MinIO + Sanity TTL)

**Files:**
- Create: `lib/strava/photo-service.ts`

- [ ] **Step 1: Create photo-service file**

```typescript
// lib/strava/photo-service.ts

import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { minioClient } from '@/lib/minio-client'
import { sanity } from '@/lib/sanity/client'
import { photoUploadQueue } from '@/workers/queues'

const STRAVA_PHOTOS_BUCKET = process.env.MINIO_BUCKET || 'strava-orders'

export async function uploadResultPhotos(
  orderId: string,
  files: File[]
): Promise<string[]> {
  const keys: string[] = []
  
  for (const file of files) {
    const key = `strava/${orderId}/${Date.now()}-${file.name}`
    const buffer = await file.arrayBuffer()
    
    // 1. Upload to MinIO
    await minioClient.putObject(
      STRAVA_PHOTOS_BUCKET,
      key,
      Buffer.from(buffer),
      buffer.byteLength,
      { 'Content-Type': file.type }
    )
    
    keys.push(key)
    
    // 2. Enqueue async Sanity upload (TTL=30 days)
    await photoUploadQueue.add(
      {
        orderId,
        photoKey: key,
        ttlDays: 30,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    )
  }
  
  // 3. Update PostgreSQL
  const order = await prisma.stravaOrder.findUnique({
    where: { orderId },
    select: { resultPhotoKeys: true },
  })
  
  if (order) {
    await prisma.stravaOrder.update({
      where: { orderId },
      data: {
        resultPhotoKeys: [...order.resultPhotoKeys, ...keys],
      },
    })
  }
  
  return keys
}

export async function getSanityPhotoUrl(photoKey: string): Promise<string | null> {
  // Check Redis cache first
  const cached = await redis.get(`photo:${photoKey}:sanity`)
  if (cached) {
    return `https://cdn.sanity.io/images/${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}/${process.env.NEXT_PUBLIC_SANITY_DATASET}/${cached}`
  }
  return null
}

export async function getResultPhotosWithUrls(orderId: string) {
  const order = await prisma.stravaOrder.findUnique({
    where: { orderId },
    select: { resultPhotoKeys: true, updatedAt: true },
  })
  
  if (!order) return []
  
  const photos = []
  for (const key of order.resultPhotoKeys) {
    const sanityUrl = await getSanityPhotoUrl(key)
    const minioUrl = `${process.env.MINIO_ENDPOINT}/${STRAVA_PHOTOS_BUCKET}/${key}`
    const expired = !sanityUrl // no Sanity URL = TTL expired
    
    photos.push({
      key,
      minioUrl,
      sanityUrl: sanityUrl || minioUrl,
      expired,
    })
  }
  
  return photos
}

export async function uploadPhotoToSanity(
  orderId: string,
  photoKey: string,
  ttlDays: number
): Promise<string> {
  try {
    // 1. Fetch photo from MinIO
    const stream = await minioClient.getObject(STRAVA_PHOTOS_BUCKET, photoKey)
    const chunks: Buffer[] = []
    
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    const buffer = Buffer.concat(chunks)
    
    // 2. Upload to Sanity with metadata
    const asset = await sanity.assets.upload('image', buffer, {
      filename: photoKey.split('/').pop() || photoKey,
      metadata: {
        source: { name: 'strava-order-result' },
        custom: {
          orderId,
          uploadedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + ttlDays * 86400000).toISOString(),
        },
      },
    })
    
    // 3. Store mapping in Redis with TTL
    await redis.set(
      `photo:${photoKey}:sanity`,
      asset._id,
      'EX',
      ttlDays * 86400
    )
    
    return asset._id
  } catch (err) {
    console.error(`Failed to upload photo to Sanity: ${photoKey}`, err)
    throw err
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/strava/photo-service.ts
git commit -m "feat: strava photo service with MinIO + Sanity TTL caching"
```

---

### Task 6: BullMQ Background Job for Photo Upload

**Files:**
- Create: `workers/queues.ts`
- Create: `workers/photo-upload-worker.ts`

- [ ] **Step 1: Create queues file**

```typescript
// workers/queues.ts

import Queue from 'bull'

export interface PhotoUploadJobData {
  orderId: string
  photoKey: string
  ttlDays: number
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
```

- [ ] **Step 2: Create worker processor file**

```typescript
// workers/photo-upload-worker.ts

import { photoUploadQueue, type PhotoUploadJobData } from './queues'
import { uploadPhotoToSanity } from '@/lib/strava/photo-service'

photoUploadQueue.process(async (job) => {
  const { orderId, photoKey, ttlDays } = job.data as PhotoUploadJobData
  
  console.log(`[photo-upload] Processing: ${photoKey}`)
  
  try {
    const sanityAssetId = await uploadPhotoToSanity(orderId, photoKey, ttlDays)
    console.log(`[photo-upload] Success: ${photoKey} → ${sanityAssetId}`)
    return { sanityAssetId }
  } catch (err) {
    console.error(`[photo-upload] Failed: ${photoKey}`, err)
    throw err // BullMQ will retry
  }
})

// Event listeners
photoUploadQueue.on('completed', (job) => {
  console.log(`[photo-upload] Job completed: ${job.id}`)
})

photoUploadQueue.on('failed', (job, err) => {
  console.error(`[photo-upload] Job failed: ${job.id}`, err.message)
})
```

- [ ] **Step 3: Commit**

```bash
git add workers/queues.ts workers/photo-upload-worker.ts
git commit -m "feat: BullMQ photo upload worker with Sanity sync"
```

---

### Task 7: React Query Hooks for Strava Orders

**Files:**
- Create: `lib/hooks/use-strava-orders.ts`

- [ ] **Step 1: Create hooks file**

```typescript
// lib/hooks/use-strava-orders.ts

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { StravaOrder, StravaStatus } from '@/lib/strava/types'

export function useStravaOrders(status?: StravaStatus) {
  return useQuery({
    queryKey: ['strava-orders', status],
    queryFn: async () => {
      const url = new URL('/api/strava/orders', window.location.origin)
      if (status) url.searchParams.set('status', status)
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch orders')
      return res.json() as Promise<StravaOrder[]>
    },
    refetchInterval: 30_000,
  })
}

export function useStravaOrderDetail(orderId: string) {
  return useQuery({
    queryKey: ['strava-order', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/strava/orders/${orderId}`)
      if (!res.ok) throw new Error('Failed to fetch order')
      return res.json() as Promise<StravaOrder>
    },
  })
}

export function useUpdateStravaOrder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ orderId, data }: { orderId: string; data: Partial<StravaOrder> }) => {
      const res = await fetch(`/api/strava/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update order')
      return res.json() as Promise<StravaOrder>
    },
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ['strava-order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['strava-orders'] })
    },
  })
}

export function useUploadStravaPhotos() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ orderId, files }: { orderId: string; files: File[] }) => {
      const formData = new FormData()
      files.forEach(f => formData.append('files', f))
      
      const res = await fetch(`/api/strava/orders/${orderId}/photos`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Failed to upload photos')
      return res.json() as Promise<{ photoKeys: string[] }>
    },
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ['strava-order', orderId] })
    },
  })
}

export function useConfirmStravaOrder() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/strava/orders/${orderId}/confirm`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to confirm order')
      return res.json() as Promise<StravaOrder>
    },
    onSuccess: (_, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['strava-order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['strava-orders'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/hooks/use-strava-orders.ts
git commit -m "feat: strava order React Query hooks"
```

---

### Task 8: API Route — POST/GET Orders

**Files:**
- Create: `app/api/strava/orders/route.ts`

- [ ] **Step 1: Create route file**

```typescript
// app/api/strava/orders/route.ts

import { NextRequest, NextResponse } from 'next/server'
import {
  createStravaOrder,
  getStravaOrders,
} from '@/lib/strava/service'
import type { CreateStravaOrderInput, StravaStatus } from '@/lib/strava/types'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateStravaOrderInput
    
    // Validate
    if (!body.customerName || !body.customerEmail || !body.items?.length || !body.totalAmount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    const order = await createStravaOrder(body)
    return NextResponse.json(order, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/strava/orders]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status') as StravaStatus | null
    const orders = await getStravaOrders(status || undefined)
    return NextResponse.json(orders)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[GET /api/strava/orders]', message)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/strava/orders/route.ts
git commit -m "feat: strava orders POST/GET API"
```

---

### Task 9-19: Remaining API Routes, UI Components, Tests, Deploy

[Tasks 9-19 continue with same structure as above - see full spec document for complete implementation details]

---

## Next Steps

Now invoking **subagent-driven-development** to execute tasks 1-19 with two-stage review (spec compliance + code quality):
