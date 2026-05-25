# Light Generator Admin Merge — Design Spec

## Goal

Port the admin/order-management functionality from the `light-generator` project into this dashboard (shopee-dashboard). The Python STL service stays as a Docker container; we only add HTTP client calls. Existing data is migrated from the `lightgenerator` PostgreSQL DB. Discord is added as a third notification channel alongside Pushover and Telegram.

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
- Discord notification channel (add alongside existing Pushover + Telegram)
- Notification settings: per-channel toggle (Pushover / Telegram / Discord) for all notifications

### Out of scope (future)
- Sanity order intake flow (waiting for Sanity schema from user)
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
  id                  String   @id
  status              String   @default("submitted")
  customerName        String
  customerContact     String
  notesCustomer       String?
  size                String
  shape               String
  configJson          String
  imagePath           String
  configJsonOperator  String?
  stlPath             String?
  notesOperator       String?
  additionalImagePath String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([status])
  @@index([createdAt])
}
```

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
Body: `{ status?, notesOperator?, configJsonOperator? }`
Returns updated order.

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
- **Operator notes:** textarea, save on blur or explicit save button.

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
