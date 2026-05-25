# Light Generator Admin Merge — Design Spec

## Goal

Port the admin/order-management functionality from the `light-generator` project into this dashboard (shopee-dashboard). The Python STL service stays as a Docker container; we only add HTTP client calls. Existing data is migrated from the `lightgenerator` PostgreSQL DB. Discord is added as a third notification channel alongside Pushover and Telegram. Two proxy endpoints (`/api/island-check`, `/api/shadow-preview`) are exposed for the 3dpb-app landing page to call via shared secret.

## Architecture

**Runtime:** Next.js App Router (existing stack). No new runtimes.

**DB:** Add `LightGeneratorOrder` Prisma model to `shopee_dashboard` (same DB already used). One-time migration script reads from `lightgenerator` DB and writes to `shopee_dashboard`.

**Storage:** MinIO via `@aws-sdk/client-s3`. New `lib/minio.ts` singleton. Bucket `lamp-orders`, layout unchanged:
```
orders/{orderId}/input.{ext}       — customer silhouette upload
orders/{orderId}/casing.stl        — generated STL
orders/{orderId}/additional.png    — floor insert image (optional)
```

**STL Service:** `light-generator-stl-service-1` container already running on `homelab` Docker network. New `lib/stl-service.ts` HTTP client — POST multipart to `/generate` and `/preview` endpoints.

**Auth:** Existing dashboard auth (NextAuth). All `/api/light-generator/*` and `/light-generator/*` routes are protected by existing middleware.

---

## Scope

### In scope (this spec)
- Port admin UI: order list + filter, order detail + management
- Prisma schema: `LightGeneratorOrder` model
- MinIO integration: upload/replace images, download STL
- STL service integration: trigger generation, preview
- One-time data migration from `lightgenerator` DB
- Sanity intake flow: read `lightGeneratorOrder` docs from Sanity, confirm → copy to local DB + MinIO
- Discord notification channel (add alongside existing Pushover + Telegram)
- Notification settings: per-channel toggle (Pushover / Telegram / Discord) for all notifications

### Out of scope (future)
- Customer order form (belongs in 3DPB App)
- BullMQ / Redis queue (generation is synchronous)

---

## File Structure

```
app/(dashboard)/
  light-generator/
    page.tsx                    — order list + filter chips by status
    [id]/
      page.tsx                  — order detail

app/api/light-generator/
  orders/
    route.ts                    — GET list (query: status, limit, offset)
    [id]/
      route.ts                  — GET detail; PATCH status / notesOperator / configJsonOperator
      confirm/route.ts          — POST → copy Sanity order to local DB + MinIO + notify
  island-check/route.ts         — POST (public + OPS_API_SECRET) → proxy to STL service /check-islands
  shadow-preview/route.ts       — POST (public + OPS_API_SECRET) → proxy to STL service /preview
      generate/route.ts         — POST → call STL service → save to MinIO → update stlPath
      preview/route.ts          — POST → call STL service preview → return PNG
      silhouette/route.ts       — PUT multipart upload → MinIO → update imagePath
      additional/route.ts       — PUT multipart upload → MinIO → update additionalImagePath
      stl/route.ts              — GET → MinIO presigned URL redirect

lib/
  minio.ts                      — S3 client singleton (MinIO)
  stl-service.ts                — Python STL service HTTP client

prisma/schema.prisma            — add LightGeneratorOrder model

scripts/
  migrate-lg-orders.mjs         — one-time migration: lightgenerator → shopee_dashboard
```

---

## Prisma Model

```prisma
model LightGeneratorOrder {
  id                  String   @id   // "LG-YYYYMMDD-XXXX"
  sanityDocId         String?         // Sanity _id — stored at confirm time for fast write-back
  status              String   @default("submitted")
  statusNote          String?         // operator note → synced back to Sanity for customer tracking
  customerName        String
  customerContact     String
  notesCustomer       String?
  // All generator config fields (size, shape, shapeRatio, shadowDiameter, etc.)
  // stored as a single JSON blob for simplicity and forward compatibility.
  configJson          String
  imagePath           String   // MinIO key: orders/{id}/input.{ext}
  configJsonOperator  String?  // operator override — null means use configJson
  stlPath             String?  // MinIO key: orders/{id}/casing.stl
  notesOperator       String?
  additionalImagePath String?  // MinIO key: orders/{id}/additional.png
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([status])
  @@index([createdAt])
}
```

`configJson` shape (from Sanity schema):
```json
{
  "size": "M",
  "shape": "circle",
  "shapeRatio": null,
  "shadowDiameter": 30,
  "shadowOffsetX": 0,
  "shadowOffsetY": 0,
  "supportStems": true
}
```
`shapeRatio` is `{ width, height }` for `rect`/`oval`, `null` otherwise.

---

## Order Status Flow

```
submitted → paid → generating → ready → shipped
                                      ↘ cancelled (from any status)
```

Status transitions are free-form — admin can set any status from the detail page.

---

## API Routes

### `GET /api/light-generator/orders`
Query params: `status`, `limit` (default 100), `offset` (default 0)
Returns: `{ orders: LightGeneratorOrder[], total: number }`

### `GET /api/light-generator/orders/[id]`
Returns full order object.

### `PATCH /api/light-generator/orders/[id]`
Body: `{ status?, statusNote?, notesOperator?, configJsonOperator? }`
1. Update local DB
2. If `status` or `statusNote` changed → patch Sanity document via `sanityWrite.patch(sanityDocId).set({ status, statusNote }).commit()`
Returns updated order.

> `sanityDocId` is stored on the local record at confirm time — no GROQ lookup needed on each status update. Falls back to GROQ lookup (`*[_type == "lightGeneratorOrder" && orderId == $id][0]._id`) if `sanityDocId` is null (migrated legacy orders).

### `POST /api/light-generator/orders/[id]/generate`
1. Read `imagePath` → download from MinIO
2. Parse `configJsonOperator ?? configJson`
3. POST multipart to STL service `/generate`
4. Upload STL bytes → MinIO `orders/{id}/casing.stl`
5. `PATCH` order: `stlPath`, `status = "ready"`
Returns: `{ ok: true, stlSize: number }`

### `POST /api/light-generator/orders/[id]/preview`
Same as generate but calls `/preview`, returns PNG as `image/png`.

### `PUT /api/light-generator/orders/[id]/silhouette`
Multipart upload → MinIO → update `imagePath`.

### `PUT /api/light-generator/orders/[id]/additional`
Multipart upload → MinIO → update `additionalImagePath`.

### `GET /api/light-generator/orders/[id]/stl`
Generates MinIO presigned URL (1 hour), redirects to it.

---

### `POST /api/island-check` *(public, no dashboard auth)*
Called by 3dpb-app landing page. Auth via `Authorization: Bearer OPS_API_SECRET`.

**Request:** `{ imageAssetId: string }`

`imageAssetId` = Sanity asset `_id`. Download image from Sanity CDN:
```
https://cdn.sanity.io/images/<SANITY_PROJECT_ID>/<SANITY_DATASET>/<id_tanpa_prefix_"image-">
```
Example: `image-abc123-800x600-png` → `https://cdn.sanity.io/images/.../abc123-800x600.png`

Flow:
1. Validate `Authorization: Bearer OPS_API_SECRET`
2. Download image from Sanity CDN by `imageAssetId`
3. POST multipart to STL service `/check-islands` (image + config_json `{}`)
4. Always return `200`:
   - Success → `{ hasFloatingIslands: boolean }`
   - Any error → `{ hasFloatingIslands: null, fallback: true }`

### `POST /api/shadow-preview` *(public, no dashboard auth)*
Called by 3dpb-app landing page. Auth via `Authorization: Bearer OPS_API_SECRET`.

**Request:**
```json
{
  "imageAssetId": "image-abc123defg",
  "config": { "diameter": 15, "offsetX": 0, "offsetY": 0 }
}
```
Note: `config` here is shadow-only (flat, in cm/mm) — not the full order config.

Flow:
1. Validate `Authorization: Bearer OPS_API_SECRET`
2. Download image from Sanity CDN by `imageAssetId`
3. POST multipart to STL service `/preview` (image + config_json containing shadow params)
4. Stream PNG bytes directly as `Content-Type: image/png` response
5. On any error → return `500` (landing page proxy catches this and returns `{ fallback: true }` to browser)

MinIO is NOT involved — internal only, not publicly accessible. Landing page proxy forwards the raw bytes; browser creates a blob URL to display the image.

---

## UI Pages

### `/light-generator` — Order List
- Status filter chips: All / submitted / paid / generating / ready / shipped / cancelled
- Table columns: ID, customer name, size, shape, status badge, created date
- Row click → navigate to detail
- Count per status shown in chip

### `/light-generator/[id]` — Order Detail
- **Header:** order ID, status badge, status update dropdown + save button
- **Customer card:** name, contact, customer notes
- **Config card:** shows current effective config (operator override if set, else customer). Edit button opens JSON editor. Save stores to `configJsonOperator`.
- **Images card:** silhouette image (with zoom modal) + upload/replace button; floor insert image (optional, same). Uses existing `ImageZoomModal`.
- **STL card:** Generate button (triggers `/generate`), shows last generated info, Download button (hits `/stl` redirect). Generate button disabled while `status === "generating"`.
- **Status note (customer-visible):** textarea labeled "Pesan ke Customer" — synced to Sanity `statusNote`. Displayed on customer order tracking page.
- **Operator notes (internal):** textarea, internal only, not synced to Sanity.

---

## Sanity Intake Flow

Orders arrive in Sanity (submitted by customer via 3DPB App). Admin reviews them and confirms payment → order is copied to local DB.

### Sanity Document Type: `lightGeneratorOrder`
```
orderId         string   — "LG-YYYYMMDD-XXXX"
status          string   — 'submitted' | 'paid' | ...
customerName    string
customerContact string
customerNotes   string?
size            string   — 'S' | 'M' | 'L'
shape           string   — 'circle' | 'square' | 'triangle' | 'rect' | 'oval'
shapeRatio      object?  — { width, height } for rect/oval only
shadowDiameter  number   — cm
shadowOffsetX   number   — mm
shadowOffsetY   number   — mm
supportStems    boolean
silhouetteImage sanity.imageAsset  — required
floorInsertImage sanity.imageAsset — optional
submittedAt     datetime
```

### New API Route: `POST /api/light-generator/orders/[id]/confirm`

Triggered by admin when order is confirmed/paid. Steps:
1. Fetch order from Sanity by `orderId`
2. Download `silhouetteImage` from Sanity CDN → upload to MinIO `orders/{id}/input.png`
3. Download `floorInsertImage` (if present) → upload to MinIO `orders/{id}/additional.png`
4. Map Sanity `config` field (JSON string) → local `configJson` (same value, different field name)
5. `prisma.lightGeneratorOrder.create(...)` with all fields
6. Send notification (Pushover + Discord + Telegram if enabled): "New LG order confirmed: {id}"
7. Update Sanity document `status` → `'paid'`

### New UI: "Pending from Sanity" panel on `/light-generator`

Above the main order table, show a collapsible panel of Sanity orders that are NOT yet in local DB (status `submitted`). Columns: orderId, customer name, size, shape, submitted date. Each row has a "Confirm" button that calls the confirm endpoint.

Sanity orders are fetched via existing `sanityRead` client using GROQ:
```groq
*[_type == "lightGeneratorOrder" && status == "submitted"] | order(submittedAt desc)
```

---

## Notification System Extension

### Discord Channel

Add `DISCORD_WEBHOOK_URL` to env vars. New sender in `lib/notifications/senders.ts`:

```typescript
export async function sendDiscord(message: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL
  if (!url) return
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  })
}
```

### Per-Channel Settings

Extend `lib/settings/types.ts` notification config:

```typescript
interface NotificationSettings {
  pushover: { enabled: boolean; userKey: string; appToken: string }
  telegram: { enabled: boolean; botToken: string; chatId: string }
  discord: { enabled: boolean; webhookUrl: string }  // ← new
}
```

`lib/notifications/senders.ts` — add unified `sendNotification(message)` that reads settings and fans out to all enabled channels. All existing call sites switch to `sendNotification()`.

`components/settings/NotificationConfigCard.tsx` — add Discord section (enabled toggle + webhook URL field).

---

## Environment Variables

Add to `.env.deploy`:

```
# MinIO
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=<from .synology.env>
MINIO_BUCKET=lamp-orders

# STL Service
STL_SERVICE_URL=http://light-generator-stl-service-1:8001
STL_SERVICE_TOKEN=<from light-generator env>

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1508309106262544615/NfafWldfERGvv0q3sfqm8FdpfdAF5bgy87czruBvjARlWpevpizFclyRp4VzUk7cawNd

# Shared secret for 3dpb-app → dashboard proxy calls (island-check, shadow-preview)
# Same value must be set in 3dpb-app as OPS_API_SECRET
OPS_API_SECRET=<generate: openssl rand -hex 32>
# Already present: SANITY_PROJECT_ID, SANITY_DATASET — used for Sanity CDN image download
```

---

## Data Migration

`scripts/migrate-lg-orders.mjs` reads all rows from `lightgenerator.orders` (via `postgres` or `pg` direct connection) and upserts into `shopee_dashboard` via Prisma + pg adapter. Run once after deploy, same pattern as `migrate-sqlite-to-pg.mjs`.

Source DB: `postgresql://postgres:<password>@light-generator-postgres-1:5432/lightgenerator`

---

## Sidebar Integration

Add "Light Generator" section to `CMSSidebar` (or main dashboard sidebar) with:
- Orders link → `/light-generator`
- Badge showing count of `submitted` + `paid` orders (unprocessed)
