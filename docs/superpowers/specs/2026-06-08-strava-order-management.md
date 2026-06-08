# Strava Order Management — Unified Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Strava order management to 3PB Ops dashboard with unified Order page (Shopee | Light Generator | Strava tabs). Include customer info, item details, status workflow, and result photo upload with smart TTL caching.

**Architecture:** Strava orders mirror Light Generator pattern: landing page submission → Sanity CMS approval → PostgreSQL storage → dashboard management. Photos stored in MinIO (primary) + Sanity (public CDN with 30-day TTL). Tracking page fetches from Sanity, with on-demand re-fetch to MinIO if expired.

**Tech Stack:** PostgreSQL (order data), MinIO (photos), Sanity CMS (approval gate + photo CDN), BullMQ (background jobs for Sanity upload).

---

## Data Model

### Prisma Schema Addition

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
}
```

### Sanity Doc Type: `stravaOrder`

```typescript
// Schema in Sanity Studio
{
  name: 'stravaOrder',
  title: 'Strava Order',
  type: 'document',
  fields: [
    { name: 'orderId', type: 'string', title: 'Order ID', readOnly: true },
    { name: 'status', type: 'string', enum: ['submitted', 'confirmed', 'processing', 'completed', 'cancelled'] },
    { name: 'customerName', type: 'string' },
    { name: 'customerEmail', type: 'string' },
    { name: 'customerPhone', type: 'string' },
    {
      name: 'items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'productName', type: 'string' },
            { name: 'quantity', type: 'number' },
            { name: 'unitPrice', type: 'number' },
            { name: 'notes', type: 'text' },
          ],
        },
      ],
    },
    { name: 'totalAmount', type: 'number' },
    { name: 'operatorNotes', type: 'text' },
    { name: 'submittedAt', type: 'datetime', readOnly: true },
  ],
  initialValue: { status: 'submitted' },
}
```

---

## API Routes

### Order CRUD

**POST /api/strava/orders**
- Create order from landing page submission
- Input: { customerName, customerEmail, customerPhone?, items[], totalAmount }
- Output: { orderId, sanityDocId }
- Side effect: Create Sanity doc with status='submitted'

**GET /api/strava/orders**
- Fetch all orders, optionally filtered by status
- Query: `?status=pending|confirmed|processing|completed`
- Output: Array of StravaOrder + counts by status

**GET /api/strava/orders/:id**
- Fetch single order detail
- Output: StravaOrder + resultPhotos (with Sanity URLs)

**PATCH /api/strava/orders/:id**
- Update status, notes, etc.
- Input: { status?, operatorNotes? }
- Output: updated StravaOrder

**POST /api/strava/orders/:id/confirm**
- Admin confirm from Sanity → sync to PostgreSQL
- Called by Sanity webhook or manual trigger
- Creates/updates PostgreSQL record with status='confirmed'

### Photo Management

**POST /api/strava/orders/:id/photos**
- Upload result photo(s) to MinIO
- Enqueue background job: upload to Sanity with TTL=30d
- Input: FormData { files: File[] }
- Output: { photoKeys: string[] }

**GET /api/strava/orders/:id/photos/:photoKey**
- Fetch photo for tracking page (public endpoint)
- Check if photo exists in Sanity CDN
  - If yes: redirect to Sanity asset URL
  - If expired: fetch from MinIO, re-upload to Sanity, redirect
- Response: 301 redirect to photo URL

---

## Services & Utilities

### `lib/strava/types.ts`

```typescript
export type StravaStatus = 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled'

export interface StravaOrder {
  id: string
  orderId: string
  customerName: string
  customerEmail: string
  customerPhone?: string
  items: Array<{ productName: string; quantity: number; unitPrice: number; notes?: string }>
  totalAmount: number
  status: StravaStatus
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
```

### `lib/strava/sanity-helpers.ts`

```typescript
export async function fetchPendingStravaOrders() {
  return sanity.fetch(
    `*[_type == "stravaOrder" && status == "submitted"] | order(submittedAt desc) { ... }`
  )
}

export async function fetchAllStravaOrders() {
  return sanity.fetch(
    `*[_type == "stravaOrder"] | order(submittedAt desc) { ... }`
  )
}

export async function countPendingStravaOrders() {
  const docs = await fetchPendingStravaOrders()
  return docs.length
}

export async function createSanityStravaOrder(orderData: StravaOrder) {
  return sanity.create({
    _type: 'stravaOrder',
    orderId: orderData.orderId,
    status: 'submitted',
    customerName: orderData.customerName,
    customerEmail: orderData.customerEmail,
    customerPhone: orderData.customerPhone,
    items: orderData.items,
    totalAmount: orderData.totalAmount,
    submittedAt: orderData.submittedAt,
  })
}

export async function updateSanityStravaOrder(docId: string, updates: Partial<StravaOrder>) {
  return sanity.patch(docId).set(updates).commit()
}
```

### `lib/strava/service.ts`

```typescript
// CRUD operations
export async function createStravaOrder(data: Omit<StravaOrder, 'id' | 'createdAt' | 'updatedAt'>) {
  // 1. Create in PostgreSQL
  const order = await prisma.stravaOrder.create({ data })
  
  // 2. Create in Sanity
  const sanityDoc = await createSanityStravaOrder(order)
  
  // 3. Update PostgreSQL with sanityDocId
  return prisma.stravaOrder.update({
    where: { id: order.id },
    data: { sanityDocId: sanityDoc._id },
  })
}

export async function getStravaOrders(status?: StravaStatus) {
  return prisma.stravaOrder.findMany({
    where: status ? { status } : undefined,
    orderBy: { submittedAt: 'desc' },
  })
}

export async function getStravaOrder(id: string) {
  return prisma.stravaOrder.findUnique({ where: { id } })
}

export async function updateStravaOrder(id: string, data: Partial<StravaOrder>) {
  const updated = await prisma.stravaOrder.update({
    where: { id },
    data,
  })
  
  // Sync to Sanity if status changed
  if (data.status && updated.sanityDocId) {
    await updateSanityStravaOrder(updated.sanityDocId, { status: data.status })
  }
  
  return updated
}

export async function confirmStravaOrder(id: string) {
  return updateStravaOrder(id, { status: 'confirmed', confirmedAt: new Date() })
}
```

### `lib/strava/photo-service.ts`

```typescript
export async function uploadResultPhotos(orderId: string, files: File[]) {
  const keys: string[] = []
  
  for (const file of files) {
    const key = `strava/${orderId}/${Date.now()}-${file.name}`
    
    // 1. Upload to MinIO
    await minioUpload(key, file)
    keys.push(key)
    
    // 2. Enqueue Sanity upload job (async, TTL=30d)
    await photoUploadQueue.add({
      orderId,
      photoKey: key,
      ttlDays: 30,
    })
  }
  
  // 3. Update PostgreSQL
  await prisma.stravaOrder.update({
    where: { orderId },
    data: {
      resultPhotoKeys: { push: keys },
    },
  })
  
  return keys
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
    const minioUrl = minioGetUrl(key)
    const expired = !sanityUrl // no Sanity URL = expired
    
    photos.push({
      key,
      minioUrl,
      sanityUrl: sanityUrl || minioUrl,
      expired,
    })
  }
  
  return photos
}

// Background job: upload photo to Sanity with TTL
export async function uploadPhotoToSanity(orderId: string, photoKey: string, ttlDays: number) {
  try {
    const stream = await minioGetObject(photoKey)
    const buffer = await streamToBuffer(stream)
    
    const asset = await sanity.assets.upload('image', buffer, {
      filename: photoKey.split('/').pop(),
      metadata: {
        source: { name: 'strava-order-result' },
        custom: {
          orderId,
          uploadedAt: new Date().toISOString(),
          expiresAt: addDays(new Date(), ttlDays).toISOString(),
        },
      },
    })
    
    // Store mapping: photoKey → sanityAssetId
    await redis.set(`photo:${photoKey}:sanity`, asset._id, 'EX', ttlDays * 86400)
    
    return asset._id
  } catch (err) {
    console.error(`Failed to upload photo to Sanity: ${photoKey}`, err)
    throw err
  }
}
```

---

## Dashboard UI Components

### Layout: Sidebar Navigation

**Updated `/app/(dashboard)/order/page.tsx`:**
- Add left sidebar with channel nav: Shopee | Light Generator | Strava
- Current OrderPage content = Shopee tab
- New tabs will show respective order lists

### `components/order/StravaOrderList.tsx`

Columns: Order ID/Date | Customer Name | Status Badge | Actions

Props:
```typescript
interface StravaOrderListProps {
  orders: StravaOrderWithPhotos[]
  onStatusChange: (orderId: string, newStatus: StravaStatus) => void
  onViewDetails: (orderId: string) => void
}
```

### `components/order/StravaOrderDetail.tsx`

Modal/sidebar showing:
- Order ID, date, customer info (name, email, phone)
- Items table (product name, qty, unit price, total)
- Status timeline
- Operator notes editor
- Result photo gallery (upload + display)
- Action buttons: update status, mark complete, cancel

### `components/order/StravaPhotoUpload.tsx`

File upload component:
- Drag-and-drop or file picker
- Multiple files
- Show upload progress
- Display uploaded photos with captions

---

## Hooks

### `lib/hooks/use-strava-orders.ts`

```typescript
export function useStravaOrders(status?: StravaStatus) {
  return useQuery({
    queryKey: ['strava-orders', status],
    queryFn: () => fetch(`/api/strava/orders?status=${status}`).then(r => r.json()),
    refetchInterval: 30_000,
  })
}

export function useStravaOrderDetail(orderId: string) {
  return useQuery({
    queryKey: ['strava-order', orderId],
    queryFn: () => fetch(`/api/strava/orders/${orderId}`).then(r => r.json()),
  })
}

export function useUpdateStravaOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ orderId, data }: { orderId: string; data: Partial<StravaOrder> }) =>
      fetch(`/api/strava/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ['strava-order', orderId] })
      queryClient.invalidateQueries({ queryKey: ['strava-orders'] })
    },
  })
}

export function useUploadStravaPhotos() {
  return useMutation({
    mutationFn: ({ orderId, files }: { orderId: string; files: File[] }) => {
      const formData = new FormData()
      files.forEach(f => formData.append('files', f))
      return fetch(`/api/strava/orders/${orderId}/photos`, {
        method: 'POST',
        body: formData,
      }).then(r => r.json())
    },
  })
}
```

---

## Background Jobs (BullMQ)

### Photo Upload Queue

**Queue name:** `strava:photo-upload`

**Job shape:**
```typescript
interface PhotoUploadJob {
  orderId: string
  photoKey: string
  ttlDays: number
}
```

**Processor:** `uploadPhotoToSanity(orderId, photoKey, ttlDays)`
- Run on worker: upload to Sanity, store mapping in Redis, set expiry

---

## Sanity Studio Manager

### `components/cms/StravaOrdersManager.tsx`

Reuse pattern from `LgOrdersManager`:
- Fetch pending orders from Sanity
- List view: Order ID | Customer | Status
- Detail view: edit order, confirm, view photos
- Confirm button → sync to PostgreSQL

---

## Testing & Error Handling

### Unit Tests

- **Order creation:** Sanity doc created, PostgreSQL record created, orderId matches
- **Photo upload:** MinIO storage verified, background job enqueued, PostgreSQL updated
- **Photo fetch (expired):** Sanity URL fails, MinIO fetch succeeds, re-upload triggered
- **Status update:** PostgreSQL updated, Sanity synced
- **Confirm order:** Status changed, timestamps set

### Error Scenarios

- Order creation fails in PostgreSQL → rollback Sanity doc
- Photo upload to MinIO fails → don't enqueue Sanity job
- Background job fails → retry with exponential backoff (max 3 retries)
- Sanity photo fetch fails → fallback to MinIO URL

---

## Summary

**Files to create/modify:**
- Prisma schema: add `StravaOrder` model
- API routes: `/api/strava/orders/*` (CRUD + photos)
- Services: `lib/strava/*` (types, sanity-helpers, service, photo-service)
- Components: dashboard sidebar nav, StravaOrderList, StravaOrderDetail, StravaPhotoUpload
- Hooks: `useStravaOrders`, `useStravaOrderDetail`, `useUpdateStravaOrder`, `useUploadStravaPhotos`
- BullMQ: photo upload processor
- Sanity Studio: StravaOrdersManager component
- Tests: order CRUD, photo management, status sync

**Dependencies:** No new external deps (BullMQ, MinIO, Sanity already in use)

**Deployment:** Standard build + docker deploy with Redis/BullMQ running

