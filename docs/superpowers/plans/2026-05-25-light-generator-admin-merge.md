# Light Generator Admin Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the light-generator admin & order-management panel into this Next.js dashboard, adding MinIO storage, STL service HTTP client, Discord notification channel, per-channel toggles, and two public proxy endpoints for the 3dpb-app landing page.

**Architecture:** Next.js App Router (existing stack). New Prisma model `LightGeneratorOrder` in the existing `shopee_dashboard` PostgreSQL DB. MinIO for file storage (bucket `lamp-orders`). Python STL service container stays as-is; a thin HTTP client wraps it. Sanity is the order intake channel; admin confirms → copies to local DB + MinIO. Bidirectional status/statusNote sync: local DB ↔ Sanity on every PATCH.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (PrismaPg adapter), `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@sanity/client` (already installed), React Query (already installed), Tailwind + shadcn/ui (already installed)

---

## File Map

**New files:**
- `lib/minio.ts` — S3Client singleton (MinIO)
- `lib/lg-storage.ts` — MinIO helpers (upload buffer, presigned URL, delete)
- `lib/stl-service.ts` — Python STL service HTTP client
- `lib/light-generator/types.ts` — shared TS types for LG orders
- `lib/light-generator/service.ts` — DB queries for LG orders
- `lib/light-generator/sanity-helpers.ts` — Sanity CDN URL builder + order fetch helpers
- `lib/hooks/use-light-generator.ts` — React Query hooks for LG orders
- `app/api/light-generator/orders/route.ts` — GET list
- `app/api/light-generator/orders/[id]/route.ts` — GET detail, PATCH
- `app/api/light-generator/orders/[id]/confirm/route.ts` — POST confirm from Sanity
- `app/api/light-generator/orders/[id]/silhouette/route.ts` — PUT upload silhouette
- `app/api/light-generator/orders/[id]/additional/route.ts` — PUT upload floor insert
- `app/api/light-generator/orders/[id]/generate/route.ts` — POST trigger STL generate
- `app/api/light-generator/orders/[id]/preview/route.ts` — POST trigger STL preview
- `app/api/light-generator/orders/[id]/stl/route.ts` — GET presigned redirect
- `app/api/island-check/route.ts` — POST proxy (public + OPS_API_SECRET)
- `app/api/shadow-preview/route.ts` — POST proxy (public + OPS_API_SECRET)
- `app/(dashboard)/light-generator/page.tsx` — order list + pending Sanity panel
- `app/(dashboard)/light-generator/[id]/page.tsx` — order detail
- `scripts/migrate-lg-orders.mjs` — one-time migration from `lightgenerator` DB

**Modified files:**
- `prisma/schema.prisma` — add `LightGeneratorOrder` model
- `lib/settings/types.ts` — add Discord fields + `enabled` booleans per channel
- `lib/settings/service.ts` — add Discord config getters/setters, add `updateDiscordConfig`
- `lib/notifications/senders.ts` — add `sendToDiscord`, refactor `sendAlert` → `sendNotification` (fan-out respects enabled flags)
- `components/settings/NotificationConfigCard.tsx` — add Discord section + enabled toggles for all 3 channels
- `app/api/settings/route.ts` — handle Discord fields in PATCH
- `components/layout/TabNav.tsx` — add Light Generator tab
- `components/layout/MobileBottomNav.tsx` — add Light Generator tab
- `app/(dashboard)/layout.tsx` — add LG badge count to `getBadges()`
- `.env.deploy` — add MinIO, STL service, Discord, OPS_API_SECRET env vars

---

## Task 1: Install packages + add env vars + Prisma model

**Files:**
- Modify: `package.json`
- Modify: `prisma/schema.prisma`
- Modify: `.env.deploy`

- [ ] **Step 1: Install new npm packages**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npm install --legacy-peer-deps @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Expected output: added 2 packages (or similar)

- [ ] **Step 2: Add `LightGeneratorOrder` model to `prisma/schema.prisma`**

Append after the last model in the file:

```prisma
model LightGeneratorOrder {
  id                  String   @id   // "LG-YYYYMMDD-XXXX"
  sanityDocId         String?         // Sanity _id stored at confirm time
  status              String   @default("submitted")
  statusNote          String?         // operator note, synced to Sanity
  customerName        String
  customerContact     String
  notesCustomer       String?
  configJson          String          // JSON blob: { size, shape, shapeRatio, shadowDiameter, shadowOffsetX, shadowOffsetY, supportStems }
  imagePath           String          // MinIO key: orders/{id}/input.{ext}
  configJsonOperator  String?         // operator override — null means use configJson
  stlPath             String?         // MinIO key: orders/{id}/casing.stl
  notesOperator       String?
  additionalImagePath String?         // MinIO key: orders/{id}/additional.png
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([status])
  @@index([createdAt])
}
```

- [ ] **Step 3: Push schema to DB**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
DATABASE_URL="postgresql://postgres:sI92qLc9z3Buf4iY9C6l2tmd6R9QarYE@light-generator-postgres-1:5432/shopee_dashboard" npx prisma db push --accept-data-loss
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Add env vars to `.env.deploy`**

Append to `.env.deploy`:

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

# Shared secret for 3dpb-app → dashboard proxy calls
OPS_API_SECRET=<generate: openssl rand -hex 32>
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma package.json package-lock.json .env.deploy
git commit -m "feat(lg): add LightGeneratorOrder Prisma model + install S3 packages"
```

---

## Task 2: MinIO client + storage helpers

**Files:**
- Create: `lib/minio.ts`
- Create: `lib/lg-storage.ts`

- [ ] **Step 1: Create `lib/minio.ts`**

```typescript
import { S3Client } from "@aws-sdk/client-s3"

// Lazy singleton — build-time safe (env vars may not be present during docker build)
let _client: S3Client | null = null

export function getMinioClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
      region: "us-east-1",
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
      },
      forcePathStyle: true, // required for MinIO
    })
  }
  return _client
}

export const LG_BUCKET = process.env.MINIO_BUCKET ?? "lamp-orders"
```

- [ ] **Step 2: Create `lib/lg-storage.ts`**

```typescript
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { getMinioClient, LG_BUCKET } from "./minio"

/** Upload raw bytes to MinIO. Returns the MinIO object key. */
export async function uploadToMinio(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const client = getMinioClient()
  await client.send(
    new PutObjectCommand({
      Bucket: LG_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
  return key
}

/** Download object from MinIO as a Buffer. */
export async function downloadFromMinio(key: string): Promise<Buffer> {
  const client = getMinioClient()
  const res = await client.send(
    new GetObjectCommand({ Bucket: LG_BUCKET, Key: key }),
  )
  if (!res.Body) throw new Error(`MinIO: empty body for key ${key}`)
  const chunks: Uint8Array[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** Generate a presigned GET URL for a MinIO object (default: 1 hour). */
export async function getPresignedUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getMinioClient()
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: LG_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  )
}

/** Delete an object from MinIO. Silently ignores NoSuchKey errors. */
export async function deleteFromMinio(key: string): Promise<void> {
  const client = getMinioClient()
  try {
    await client.send(new DeleteObjectCommand({ Bucket: LG_BUCKET, Key: key }))
  } catch (err: unknown) {
    const e = err as { name?: string }
    if (e?.name !== "NoSuchKey") throw err
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/minio.ts lib/lg-storage.ts
git commit -m "feat(lg): add MinIO client singleton + storage helpers"
```

---

## Task 3: STL service HTTP client

**Files:**
- Create: `lib/stl-service.ts`

- [ ] **Step 1: Create `lib/stl-service.ts`**

```typescript
/**
 * HTTP client for the Python FastAPI STL service
 * (container: light-generator-stl-service-1, port 8001)
 *
 * Endpoints used:
 *   POST /generate         — image + config_json → STL bytes
 *   POST /preview          — image + config_json → PNG bytes
 *   POST /check-islands    — image + config_json → { has_floating_islands: bool }
 */

function getServiceUrl(): string {
  return process.env.STL_SERVICE_URL ?? "http://localhost:8001"
}

function getServiceToken(): string {
  return process.env.STL_SERVICE_TOKEN ?? ""
}

function buildAuthHeaders(): Record<string, string> {
  const token = getServiceToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Build a multipart FormData with an image buffer + JSON config blob. */
function buildFormData(
  imageBuffer: Buffer,
  imageFilename: string,
  configJson: object,
): FormData {
  const form = new FormData()
  const blob = new Blob([imageBuffer])
  form.append("image", blob, imageFilename)
  form.append("config_json", JSON.stringify(configJson))
  return form
}

/** POST image + config to STL service /generate. Returns raw STL bytes. */
export async function stlGenerate(
  imageBuffer: Buffer,
  imageFilename: string,
  config: object,
): Promise<Buffer> {
  const form = buildFormData(imageBuffer, imageFilename, config)
  const res = await fetch(`${getServiceUrl()}/generate`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`STL service /generate error ${res.status}: ${text}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** POST image + config to STL service /preview. Returns raw PNG bytes. */
export async function stlPreview(
  imageBuffer: Buffer,
  imageFilename: string,
  config: object,
): Promise<Buffer> {
  const form = buildFormData(imageBuffer, imageFilename, config)
  const res = await fetch(`${getServiceUrl()}/preview`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`STL service /preview error ${res.status}: ${text}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** POST image + config to STL service /check-islands. */
export async function stlCheckIslands(
  imageBuffer: Buffer,
  imageFilename: string,
  config: object = {},
): Promise<{ has_floating_islands: boolean }> {
  const form = buildFormData(imageBuffer, imageFilename, config)
  const res = await fetch(`${getServiceUrl()}/check-islands`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`STL service /check-islands error ${res.status}: ${text}`)
  }
  return res.json() as Promise<{ has_floating_islands: boolean }>
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/stl-service.ts
git commit -m "feat(lg): add STL service HTTP client"
```

---

## Task 4: Notification system — Discord + per-channel enabled flags

**Files:**
- Modify: `lib/settings/types.ts`
- Modify: `lib/settings/service.ts`
- Modify: `lib/notifications/senders.ts`

- [ ] **Step 1: Update `lib/settings/types.ts`**

Replace the `NotificationConfig` interface and `CONFIG_KEYS` with:

```typescript
export interface NotificationConfig {
  // Telegram
  telegramEnabled: boolean
  telegramBotToken: string | null
  telegramChatId: string | null
  // Pushover
  pushoverEnabled: boolean
  pushoverUserKey: string | null
  pushoverAppToken: string | null
  // Discord
  discordEnabled: boolean
  discordWebhookUrl: string | null
}

export interface AlertThresholds {
  stockMin: number
  roasMin: number
  orderPileupCount: number
  orderPileupHours: number
}

export interface ShopeeStatus {
  connected: boolean
  shopId: string | null
  tokenUpdatedAt: string | null
}

export interface AllSettings {
  notification: NotificationConfig
  thresholds: AlertThresholds
  shopee: ShopeeStatus
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  stockMin: 5,
  roasMin: 2,
  orderPileupCount: 5,
  orderPileupHours: 1,
}

export const CONFIG_KEYS = {
  TELEGRAM_ENABLED: "telegram_enabled",
  TELEGRAM_BOT_TOKEN: "telegram_bot_token",
  TELEGRAM_CHAT_ID: "telegram_chat_id",
  PUSHOVER_ENABLED: "pushover_enabled",
  PUSHOVER_USER_KEY: "pushover_user_key",
  PUSHOVER_APP_TOKEN: "pushover_app_token",
  DISCORD_ENABLED: "discord_enabled",
  DISCORD_WEBHOOK_URL: "discord_webhook_url",
  ALERT_STOCK_MIN: "alert_stock_min",
  ALERT_ROAS_MIN: "alert_roas_min",
  ALERT_ORDER_PILEUP_COUNT: "alert_order_pileup_count",
  ALERT_ORDER_PILEUP_HOURS: "alert_order_pileup_hours",
  SHOPEE_ACCESS_TOKEN: "shopee_access_token",
  SHOPEE_REFRESH_TOKEN: "shopee_refresh_token",
  SHOPEE_SHOP_ID: "shopee_shop_id",
} as const
```

- [ ] **Step 2: Update `lib/settings/service.ts` — extend `getNotificationConfig` and `updateNotificationConfig`**

Replace the `getNotificationConfig` function:

```typescript
export async function getNotificationConfig(): Promise<NotificationConfig> {
  const [
    tgEnabled, botToken, chatId,
    poEnabled, userKey, appToken,
    discordEnabled, discordUrl,
  ] = await Promise.all([
    getConfigValue(CONFIG_KEYS.TELEGRAM_ENABLED),
    getConfigValue(CONFIG_KEYS.TELEGRAM_BOT_TOKEN),
    getConfigValue(CONFIG_KEYS.TELEGRAM_CHAT_ID),
    getConfigValue(CONFIG_KEYS.PUSHOVER_ENABLED),
    getConfigValue(CONFIG_KEYS.PUSHOVER_USER_KEY),
    getConfigValue(CONFIG_KEYS.PUSHOVER_APP_TOKEN),
    getConfigValue(CONFIG_KEYS.DISCORD_ENABLED),
    getConfigValue(CONFIG_KEYS.DISCORD_WEBHOOK_URL),
  ])
  return {
    telegramEnabled: tgEnabled === "true",
    telegramBotToken: botToken,
    telegramChatId: chatId,
    pushoverEnabled: poEnabled === "true",
    pushoverUserKey: userKey,
    pushoverAppToken: appToken,
    discordEnabled: discordEnabled === "true",
    discordWebhookUrl: discordUrl,
  }
}
```

Replace the `updateNotificationConfig` function:

```typescript
export async function updateNotificationConfig(
  config: Partial<NotificationConfig>,
): Promise<void> {
  const updates: Array<Promise<void>> = []
  if (config.telegramEnabled !== undefined)
    updates.push(setConfigValue(CONFIG_KEYS.TELEGRAM_ENABLED, String(config.telegramEnabled)))
  if (config.telegramBotToken !== undefined)
    updates.push(setConfigValue(CONFIG_KEYS.TELEGRAM_BOT_TOKEN, config.telegramBotToken))
  if (config.telegramChatId !== undefined)
    updates.push(setConfigValue(CONFIG_KEYS.TELEGRAM_CHAT_ID, config.telegramChatId))
  if (config.pushoverEnabled !== undefined)
    updates.push(setConfigValue(CONFIG_KEYS.PUSHOVER_ENABLED, String(config.pushoverEnabled)))
  if (config.pushoverUserKey !== undefined)
    updates.push(setConfigValue(CONFIG_KEYS.PUSHOVER_USER_KEY, config.pushoverUserKey))
  if (config.pushoverAppToken !== undefined)
    updates.push(setConfigValue(CONFIG_KEYS.PUSHOVER_APP_TOKEN, config.pushoverAppToken))
  if (config.discordEnabled !== undefined)
    updates.push(setConfigValue(CONFIG_KEYS.DISCORD_ENABLED, String(config.discordEnabled)))
  if (config.discordWebhookUrl !== undefined)
    updates.push(setConfigValue(CONFIG_KEYS.DISCORD_WEBHOOK_URL, config.discordWebhookUrl))
  await Promise.all(updates)
}
```

Also add a test-discord helper at the bottom of `lib/settings/service.ts`:

```typescript
export async function sendTestDiscord(
  webhookUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "✅ Test notifikasi dari Shopee Dashboard berhasil!" }),
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" }
  }
}
```

- [ ] **Step 3: Update `lib/notifications/senders.ts`**

Replace the entire file with:

```typescript
import { getNotificationConfig } from "@/lib/settings/service"
import { prisma } from "@/lib/db"
import type { AlertEvent } from "./types"

interface SendResult {
  ok: boolean
  channel: "telegram" | "pushover" | "discord"
  error?: string
}

function severityIcon(severity: AlertEvent["severity"]): string {
  switch (severity) {
    case "critical": return "🚨"
    case "high":     return "⚠️"
    case "warning":  return "🟡"
    default:         return "ℹ️"
  }
}

function formatMessage(event: AlertEvent): string {
  const icon = severityIcon(event.severity)
  return `${icon} *${event.title}*\n\n${event.body}`
}

export async function sendToTelegram(event: AlertEvent): Promise<SendResult> {
  const cfg = await getNotificationConfig()
  if (!cfg.telegramEnabled || !cfg.telegramBotToken || !cfg.telegramChatId) {
    return { ok: false, channel: "telegram", error: "Telegram not configured or disabled" }
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.telegramChatId,
          text: formatMessage(event),
          parse_mode: "Markdown",
        }),
      },
    )
    const json = (await res.json()) as { ok?: boolean; description?: string }
    if (!json.ok) {
      return { ok: false, channel: "telegram", error: json.description ?? `HTTP ${res.status}` }
    }
    await prisma.notificationLog.create({
      data: { alertKey: event.alertKey, channel: "telegram", message: `${event.title}: ${event.body}` },
    })
    return { ok: true, channel: "telegram" }
  } catch (err) {
    return { ok: false, channel: "telegram", error: err instanceof Error ? err.message : "Network error" }
  }
}

export async function sendToPushover(event: AlertEvent): Promise<SendResult> {
  const cfg = await getNotificationConfig()
  if (!cfg.pushoverEnabled || !cfg.pushoverUserKey || !cfg.pushoverAppToken) {
    return { ok: false, channel: "pushover", error: "Pushover not configured or disabled" }
  }
  const priorityMap: Record<AlertEvent["severity"], number> = {
    info: -1, warning: 0, high: 1, critical: 2,
  }
  try {
    const bodyParams: Record<string, string> = {
      token: cfg.pushoverAppToken,
      user: cfg.pushoverUserKey,
      title: `${severityIcon(event.severity)} ${event.title}`,
      message: event.body,
      priority: String(priorityMap[event.severity]),
    }
    if (event.severity === "critical") {
      bodyParams.retry = "60"
      bodyParams.expire = "3600"
    }
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(bodyParams).toString(),
    })
    const json = (await res.json()) as { status?: number; errors?: string[] }
    if (json.status !== 1) {
      return { ok: false, channel: "pushover", error: json.errors?.join(", ") ?? `HTTP ${res.status}` }
    }
    await prisma.notificationLog.create({
      data: { alertKey: event.alertKey, channel: "pushover", message: `${event.title}: ${event.body}` },
    })
    return { ok: true, channel: "pushover" }
  } catch (err) {
    return { ok: false, channel: "pushover", error: err instanceof Error ? err.message : "Network error" }
  }
}

export async function sendToDiscord(event: AlertEvent): Promise<SendResult> {
  const cfg = await getNotificationConfig()
  if (!cfg.discordEnabled || !cfg.discordWebhookUrl) {
    return { ok: false, channel: "discord", error: "Discord not configured or disabled" }
  }
  try {
    const icon = severityIcon(event.severity)
    const res = await fetch(cfg.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `${icon} **${event.title}**\n\n${event.body}` }),
    })
    if (!res.ok) {
      return { ok: false, channel: "discord", error: `HTTP ${res.status}` }
    }
    await prisma.notificationLog.create({
      data: { alertKey: event.alertKey, channel: "discord", message: `${event.title}: ${event.body}` },
    })
    return { ok: true, channel: "discord" }
  } catch (err) {
    return { ok: false, channel: "discord", error: err instanceof Error ? err.message : "Network error" }
  }
}

/**
 * Send a plain-text notification to all enabled channels.
 * Use for LG order events (not structured AlertEvent alerts).
 */
export async function sendNotification(message: string): Promise<void> {
  const event: AlertEvent = {
    alertKey: `lg-notify-${Date.now()}`,
    title: "Light Generator",
    body: message,
    severity: "info",
  }
  await Promise.allSettled([
    sendToTelegram(event),
    sendToPushover(event),
    sendToDiscord(event),
  ])
}

/**
 * Send an alert to all configured channels in parallel.
 * Returns true if at least one channel succeeded.
 */
export async function sendAlert(event: AlertEvent): Promise<{
  anySent: boolean
  results: SendResult[]
}> {
  const results = await Promise.all([
    sendToTelegram(event),
    sendToPushover(event),
    sendToDiscord(event),
  ])
  return { anySent: results.some((r) => r.ok), results }
}
```

- [ ] **Step 4: Update `app/api/settings/test-notification/route.ts` to handle Discord**

Find the file and add a `discord` branch. Open the existing file and add after the pushover block:

```typescript
if (body.channel === "discord") {
  if (!body.discordWebhookUrl) {
    return NextResponse.json({ ok: false, error: "Missing webhookUrl" })
  }
  const result = await sendTestDiscord(body.discordWebhookUrl)
  return NextResponse.json(result)
}
```

Also add `sendTestDiscord` to the import from `@/lib/settings/service`.

- [ ] **Step 5: Commit**

```bash
git add lib/settings/types.ts lib/settings/service.ts lib/notifications/senders.ts app/api/settings/
git commit -m "feat(lg): add Discord notification channel + per-channel enabled flags"
```

---

## Task 5: Settings UI — Discord section + enabled toggles

**Files:**
- Modify: `components/settings/NotificationConfigCard.tsx`
- Modify: `lib/hooks/use-settings.ts`

- [ ] **Step 1: Update `lib/hooks/use-settings.ts` to support Discord test**

In the `TestNotificationVars` interface, extend with:

```typescript
interface TestNotificationVars {
  channel: "telegram" | "pushover" | "discord"
  telegramBotToken?: string
  telegramChatId?: string
  pushoverUserKey?: string
  pushoverAppToken?: string
  discordWebhookUrl?: string
}
```

- [ ] **Step 2: Replace `components/settings/NotificationConfigCard.tsx`**

```typescript
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { NotificationConfig } from "@/lib/settings/types"
import { useUpdateSettings, useTestNotification } from "@/lib/hooks/use-settings"

interface Props {
  config: NotificationConfig
}

function configToForm(config: NotificationConfig) {
  return {
    telegramEnabled: config.telegramEnabled,
    telegramBotToken: config.telegramBotToken ?? "",
    telegramChatId: config.telegramChatId ?? "",
    pushoverEnabled: config.pushoverEnabled,
    pushoverUserKey: config.pushoverUserKey ?? "",
    pushoverAppToken: config.pushoverAppToken ?? "",
    discordEnabled: config.discordEnabled,
    discordWebhookUrl: config.discordWebhookUrl ?? "",
  }
}

export function NotificationConfigCard({ config }: Props) {
  const [trackedConfig, setTrackedConfig] = useState(config)
  const [form, setForm] = useState(configToForm(config))
  const [feedback, setFeedback] = useState<string | null>(null)

  if (config !== trackedConfig) {
    setTrackedConfig(config)
    setForm(configToForm(config))
  }

  const update = useUpdateSettings()
  const test = useTestNotification()

  function handleSave() {
    setFeedback(null)
    update.mutate(
      {
        notification: {
          telegramEnabled: form.telegramEnabled,
          telegramBotToken: form.telegramBotToken || null,
          telegramChatId: form.telegramChatId || null,
          pushoverEnabled: form.pushoverEnabled,
          pushoverUserKey: form.pushoverUserKey || null,
          pushoverAppToken: form.pushoverAppToken || null,
          discordEnabled: form.discordEnabled,
          discordWebhookUrl: form.discordWebhookUrl || null,
        },
      },
      {
        onSuccess: () => setFeedback("✅ Config tersimpan"),
        onError: (err) => setFeedback(`❌ ${err.message}`),
      },
    )
  }

  function handleTest(channel: "telegram" | "pushover" | "discord") {
    setFeedback(null)
    test.mutate(
      channel === "telegram"
        ? { channel, telegramBotToken: form.telegramBotToken, telegramChatId: form.telegramChatId }
        : channel === "pushover"
          ? { channel, pushoverUserKey: form.pushoverUserKey, pushoverAppToken: form.pushoverAppToken }
          : { channel, discordWebhookUrl: form.discordWebhookUrl },
      {
        onSuccess: (result) => {
          setFeedback(result.ok ? `✅ ${channel} test berhasil` : `❌ ${result.error}`)
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🔔 Notifikasi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Telegram */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Telegram Bot</div>
            <Switch
              checked={form.telegramEnabled}
              onCheckedChange={(v) => setForm({ ...form, telegramEnabled: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-token">Bot Token</Label>
            <Input id="tg-token" type="password" value={form.telegramBotToken}
              onChange={(e) => setForm({ ...form, telegramBotToken: e.target.value })}
              placeholder="123456:ABC-DEF..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-chat">Chat / Group ID</Label>
            <Input id="tg-chat" value={form.telegramChatId}
              onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
              placeholder="-100123456" />
          </div>
          <Button variant="outline" size="sm" onClick={() => handleTest("telegram")}
            disabled={test.isPending || !form.telegramBotToken || !form.telegramChatId}>
            Test Telegram
          </Button>
        </div>

        {/* Pushover */}
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Pushover</div>
            <Switch
              checked={form.pushoverEnabled}
              onCheckedChange={(v) => setForm({ ...form, pushoverEnabled: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-user">User Key</Label>
            <Input id="po-user" type="password" value={form.pushoverUserKey}
              onChange={(e) => setForm({ ...form, pushoverUserKey: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-token">App Token</Label>
            <Input id="po-token" type="password" value={form.pushoverAppToken}
              onChange={(e) => setForm({ ...form, pushoverAppToken: e.target.value })} />
          </div>
          <Button variant="outline" size="sm" onClick={() => handleTest("pushover")}
            disabled={test.isPending || !form.pushoverUserKey || !form.pushoverAppToken}>
            Test Pushover
          </Button>
        </div>

        {/* Discord */}
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Discord Webhook</div>
            <Switch
              checked={form.discordEnabled}
              onCheckedChange={(v) => setForm({ ...form, discordEnabled: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discord-url">Webhook URL</Label>
            <Input id="discord-url" type="password" value={form.discordWebhookUrl}
              onChange={(e) => setForm({ ...form, discordWebhookUrl: e.target.value })}
              placeholder="https://discord.com/api/webhooks/..." />
          </div>
          <Button variant="outline" size="sm" onClick={() => handleTest("discord")}
            disabled={test.isPending || !form.discordWebhookUrl}>
            Test Discord
          </Button>
        </div>

        {feedback && <div className="text-xs">{feedback}</div>}

        <div className="pt-3 border-t">
          <Button onClick={handleSave} disabled={update.isPending}
            className="bg-[#EE4D2D] hover:bg-[#d44226] text-white">
            {update.isPending ? "Menyimpan..." : "Simpan Config"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Update `app/api/settings/route.ts` PATCH handler to pass Discord fields**

In the existing PATCH handler, extend the `updateNotificationConfig` call to also pass:

```typescript
discordEnabled:
  typeof n.discordEnabled === "boolean" ? n.discordEnabled : undefined,
discordWebhookUrl:
  typeof n.discordWebhookUrl === "string" || n.discordWebhookUrl === null
    ? (n.discordWebhookUrl as string | null)
    : undefined,
```

- [ ] **Step 4: Commit**

```bash
git add components/settings/NotificationConfigCard.tsx lib/hooks/use-settings.ts app/api/settings/route.ts
git commit -m "feat(lg): add Discord section + per-channel enabled toggles to settings UI"
```

---

## Task 6: Shared LG types + service + Sanity helpers

**Files:**
- Create: `lib/light-generator/types.ts`
- Create: `lib/light-generator/service.ts`
- Create: `lib/light-generator/sanity-helpers.ts`

- [ ] **Step 1: Create `lib/light-generator/types.ts`**

```typescript
export interface LgConfigJson {
  size: "S" | "M" | "L"
  shape: "circle" | "square" | "triangle" | "rect" | "oval"
  shapeRatio: { width: number; height: number } | null
  shadowDiameter: number
  shadowOffsetX: number
  shadowOffsetY: number
  supportStems: boolean
}

export type LgStatus =
  | "submitted"
  | "paid"
  | "generating"
  | "ready"
  | "shipped"
  | "cancelled"

export interface LgOrder {
  id: string
  sanityDocId: string | null
  status: string
  statusNote: string | null
  customerName: string
  customerContact: string
  notesCustomer: string | null
  configJson: string
  imagePath: string
  configJsonOperator: string | null
  stlPath: string | null
  notesOperator: string | null
  additionalImagePath: string | null
  createdAt: string
  updatedAt: string
}

/** Sanity `lightGeneratorOrder` document shape */
export interface SanityLgOrder {
  _id: string
  orderId: string
  status: string
  customerName: string
  customerContact: string
  customerNotes?: string
  size: "S" | "M" | "L"
  shape: "circle" | "square" | "triangle" | "rect" | "oval"
  shapeRatio?: { width: number; height: number }
  shadowDiameter: number
  shadowOffsetX: number
  shadowOffsetY: number
  supportStems: boolean
  silhouetteImage: { asset: { _ref: string } }
  floorInsertImage?: { asset: { _ref: string } } | null
  submittedAt: string
}
```

- [ ] **Step 2: Create `lib/light-generator/sanity-helpers.ts`**

```typescript
import { sanityRead, sanityWrite } from "@/lib/sanity/client"
import type { SanityLgOrder } from "./types"

/**
 * Convert a Sanity asset _ref like "image-abc123-800x600-png"
 * to a Sanity CDN URL: https://cdn.sanity.io/images/{project}/{dataset}/abc123-800x600.png
 */
export function sanityAssetRefToUrl(ref: string): string {
  const projectId = process.env.SANITY_PROJECT_ID ?? "placeholder"
  const dataset = process.env.SANITY_DATASET ?? "production"
  // Strip "image-" prefix, replace last "-" before extension with "."
  const withoutPrefix = ref.replace(/^image-/, "")
  const filename = withoutPrefix.replace(/-([a-z0-9]+)$/, ".$1")
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${filename}`
}

/** Fetch pending Sanity LG orders (status == "submitted") */
export async function fetchSanityPendingOrders(): Promise<SanityLgOrder[]> {
  return sanityRead.fetch<SanityLgOrder[]>(
    `*[_type == "lightGeneratorOrder" && status == "submitted"] | order(submittedAt desc) {
      _id, orderId, status, customerName, customerContact, customerNotes,
      size, shape, shapeRatio, shadowDiameter, shadowOffsetX, shadowOffsetY, supportStems,
      silhouetteImage { asset { _ref } },
      floorInsertImage { asset { _ref } },
      submittedAt
    }`,
  )
}

/** Fetch a single Sanity LG order by orderId */
export async function fetchSanityOrderById(orderId: string): Promise<SanityLgOrder | null> {
  return sanityRead.fetch<SanityLgOrder | null>(
    `*[_type == "lightGeneratorOrder" && orderId == $orderId][0] {
      _id, orderId, status, customerName, customerContact, customerNotes,
      size, shape, shapeRatio, shadowDiameter, shadowOffsetX, shadowOffsetY, supportStems,
      silhouetteImage { asset { _ref } },
      floorInsertImage { asset { _ref } },
      submittedAt
    }`,
    { orderId },
  )
}

/** Patch status and optional statusNote back to Sanity */
export async function patchSanityOrderStatus(
  sanityDocId: string,
  status: string,
  statusNote?: string | null,
): Promise<void> {
  const patch = sanityWrite.patch(sanityDocId).set({ status })
  if (statusNote !== undefined) {
    patch.set({ statusNote: statusNote ?? "" })
  }
  await patch.commit()
}
```

- [ ] **Step 3: Create `lib/light-generator/service.ts`**

```typescript
import { prisma } from "@/lib/db"
import type { LgOrder } from "./types"

function serializeOrder(o: {
  id: string
  sanityDocId: string | null
  status: string
  statusNote: string | null
  customerName: string
  customerContact: string
  notesCustomer: string | null
  configJson: string
  imagePath: string
  configJsonOperator: string | null
  stlPath: string | null
  notesOperator: string | null
  additionalImagePath: string | null
  createdAt: Date
  updatedAt: Date
}): LgOrder {
  return {
    ...o,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }
}

export async function listLgOrders(opts: {
  status?: string
  limit?: number
  offset?: number
}): Promise<{ orders: LgOrder[]; total: number }> {
  const where = opts.status ? { status: opts.status } : {}
  const [orders, total] = await Promise.all([
    prisma.lightGeneratorOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 100,
      skip: opts.offset ?? 0,
    }),
    prisma.lightGeneratorOrder.count({ where }),
  ])
  return { orders: orders.map(serializeOrder), total }
}

export async function getLgOrder(id: string): Promise<LgOrder | null> {
  const o = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!o) return null
  return serializeOrder(o)
}

/** Count submitted + paid orders for the sidebar badge */
export async function countLgPendingOrders(): Promise<number> {
  return prisma.lightGeneratorOrder.count({
    where: { status: { in: ["submitted", "paid"] } },
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/light-generator/
git commit -m "feat(lg): add LG types, DB service, and Sanity helpers"
```

---

## Task 7: Order CRUD API routes

**Files:**
- Create: `app/api/light-generator/orders/route.ts`
- Create: `app/api/light-generator/orders/[id]/route.ts`

- [ ] **Step 1: Create `app/api/light-generator/orders/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { listLgOrders } from "@/lib/light-generator/service"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? undefined
  const limit = Number(searchParams.get("limit") ?? "100")
  const offset = Number(searchParams.get("offset") ?? "0")

  try {
    const result = await listLgOrders({ status, limit, offset })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `app/api/light-generator/orders/[id]/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { getLgOrder } from "@/lib/light-generator/service"
import { patchSanityOrderStatus } from "@/lib/light-generator/sanity-helpers"
import { prisma } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await getLgOrder(id)
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(order)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const existing = await getLgOrder(id)
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let body: {
    status?: string
    statusNote?: string | null
    notesOperator?: string | null
    configJsonOperator?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Build update payload — only include defined fields
  const data: Record<string, unknown> = {}
  if (body.status !== undefined) data.status = body.status
  if (body.statusNote !== undefined) data.statusNote = body.statusNote
  if (body.notesOperator !== undefined) data.notesOperator = body.notesOperator
  if (body.configJsonOperator !== undefined) data.configJsonOperator = body.configJsonOperator

  const updated = await prisma.lightGeneratorOrder.update({ where: { id }, data })

  // Sync status + statusNote back to Sanity if either changed
  const statusChanged = body.status !== undefined && body.status !== existing.status
  const statusNoteChanged = body.statusNote !== undefined && body.statusNote !== existing.statusNote
  if (statusChanged || statusNoteChanged) {
    let sanityDocId = existing.sanityDocId
    if (!sanityDocId) {
      // Fallback: GROQ lookup for migrated orders that have no sanityDocId stored
      const { sanityRead } = await import("@/lib/sanity/client")
      const doc = await sanityRead.fetch<{ _id: string } | null>(
        `*[_type == "lightGeneratorOrder" && orderId == $id][0]{ _id }`,
        { id },
      )
      sanityDocId = doc?._id ?? null
    }
    if (sanityDocId) {
      await patchSanityOrderStatus(
        sanityDocId,
        updated.status,
        statusNoteChanged ? (body.statusNote ?? null) : undefined,
      ).catch((err) => {
        // Log but don't fail the request if Sanity sync fails
        console.error("[LG PATCH] Sanity sync failed:", err)
      })
    }
  }

  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/light-generator/orders/
git commit -m "feat(lg): add order list + detail CRUD API routes"
```

---

## Task 8: Sanity confirm API

**Files:**
- Create: `app/api/light-generator/orders/[id]/confirm/route.ts`

- [ ] **Step 1: Create `app/api/light-generator/orders/[id]/confirm/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { fetchSanityOrderById, sanityAssetRefToUrl, patchSanityOrderStatus } from "@/lib/light-generator/sanity-helpers"
import { uploadToMinio } from "@/lib/lg-storage"
import { sendNotification } from "@/lib/notifications/senders"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Check if already confirmed
  const existing = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (existing) {
    return NextResponse.json({ error: "Order already confirmed" }, { status: 409 })
  }

  // 1. Fetch from Sanity
  const sanityOrder = await fetchSanityOrderById(id)
  if (!sanityOrder) {
    return NextResponse.json({ error: "Order not found in Sanity" }, { status: 404 })
  }

  // 2. Download silhouette from Sanity CDN → upload to MinIO
  const silhouetteUrl = sanityAssetRefToUrl(sanityOrder.silhouetteImage.asset._ref)
  const silhouetteRes = await fetch(silhouetteUrl)
  if (!silhouetteRes.ok) {
    return NextResponse.json({ error: "Failed to download silhouette from Sanity CDN" }, { status: 502 })
  }
  const silhouetteBuffer = Buffer.from(await silhouetteRes.arrayBuffer())
  // Detect extension from Content-Type
  const ct = silhouetteRes.headers.get("content-type") ?? "image/png"
  const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png"
  const imagePath = `orders/${id}/input.${ext}`
  await uploadToMinio(imagePath, silhouetteBuffer, ct)

  // 3. Download floor insert image (optional)
  let additionalImagePath: string | null = null
  if (sanityOrder.floorInsertImage?.asset._ref) {
    const floorUrl = sanityAssetRefToUrl(sanityOrder.floorInsertImage.asset._ref)
    const floorRes = await fetch(floorUrl)
    if (floorRes.ok) {
      const floorBuffer = Buffer.from(await floorRes.arrayBuffer())
      const floorCt = floorRes.headers.get("content-type") ?? "image/png"
      additionalImagePath = `orders/${id}/additional.png`
      await uploadToMinio(additionalImagePath, floorBuffer, floorCt)
    }
  }

  // 4. Build configJson from Sanity fields
  const configJson = JSON.stringify({
    size: sanityOrder.size,
    shape: sanityOrder.shape,
    shapeRatio: sanityOrder.shapeRatio ?? null,
    shadowDiameter: sanityOrder.shadowDiameter,
    shadowOffsetX: sanityOrder.shadowOffsetX,
    shadowOffsetY: sanityOrder.shadowOffsetY,
    supportStems: sanityOrder.supportStems,
  })

  // 5. Create in local DB
  await prisma.lightGeneratorOrder.create({
    data: {
      id,
      sanityDocId: sanityOrder._id,
      status: "paid",
      customerName: sanityOrder.customerName,
      customerContact: sanityOrder.customerContact,
      notesCustomer: sanityOrder.customerNotes ?? null,
      configJson,
      imagePath,
      additionalImagePath,
    },
  })

  // 6. Send notification
  await sendNotification(`✅ New LG order confirmed: ${id} (${sanityOrder.customerName})`)

  // 7. Update Sanity status → 'paid'
  await patchSanityOrderStatus(sanityOrder._id, "paid").catch((err) => {
    console.error("[LG confirm] Sanity status update failed:", err)
  })

  return NextResponse.json({ ok: true, id })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/light-generator/orders/
git commit -m "feat(lg): add Sanity confirm endpoint (copy order to local DB + MinIO)"
```

---

## Task 9: File + STL management API routes

**Files:**
- Create: `app/api/light-generator/orders/[id]/silhouette/route.ts`
- Create: `app/api/light-generator/orders/[id]/additional/route.ts`
- Create: `app/api/light-generator/orders/[id]/generate/route.ts`
- Create: `app/api/light-generator/orders/[id]/preview/route.ts`
- Create: `app/api/light-generator/orders/[id]/stl/route.ts`

- [ ] **Step 1: Create `app/api/light-generator/orders/[id]/silhouette/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { uploadToMinio } from "@/lib/lg-storage"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const form = await req.formData()
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.type.includes("jpeg") || file.type.includes("jpg") ? "jpg" : "png"
  const key = `orders/${id}/input.${ext}`
  await uploadToMinio(key, buffer, file.type)

  const updated = await prisma.lightGeneratorOrder.update({
    where: { id },
    data: { imagePath: key },
  })
  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}
```

- [ ] **Step 2: Create `app/api/light-generator/orders/[id]/additional/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { uploadToMinio } from "@/lib/lg-storage"
import { NextRequest, NextResponse } from "next/server"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const form = await req.formData()
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const key = `orders/${id}/additional.png`
  await uploadToMinio(key, buffer, file.type)

  const updated = await prisma.lightGeneratorOrder.update({
    where: { id },
    data: { additionalImagePath: key },
  })
  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  })
}
```

- [ ] **Step 3: Create `app/api/light-generator/orders/[id]/generate/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { downloadFromMinio, uploadToMinio } from "@/lib/lg-storage"
import { stlGenerate } from "@/lib/stl-service"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Mark as generating
  await prisma.lightGeneratorOrder.update({ where: { id }, data: { status: "generating" } })

  try {
    // 1. Download silhouette from MinIO
    const imageBuffer = await downloadFromMinio(order.imagePath)
    const filename = order.imagePath.split("/").pop() ?? "input.png"

    // 2. Parse effective config (operator override if set, else customer config)
    const configJson = JSON.parse(order.configJsonOperator ?? order.configJson)

    // 3. Call STL service
    const stlBytes = await stlGenerate(imageBuffer, filename, configJson)

    // 4. Upload STL to MinIO
    const stlKey = `orders/${id}/casing.stl`
    await uploadToMinio(stlKey, stlBytes, "model/stl")

    // 5. Update order
    await prisma.lightGeneratorOrder.update({
      where: { id },
      data: { stlPath: stlKey, status: "ready" },
    })

    return NextResponse.json({ ok: true, stlSize: stlBytes.byteLength })
  } catch (err) {
    // Reset status on failure
    await prisma.lightGeneratorOrder.update({ where: { id }, data: { status: "paid" } })
    const msg = err instanceof Error ? err.message : "Generation failed"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 4: Create `app/api/light-generator/orders/[id]/preview/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { downloadFromMinio } from "@/lib/lg-storage"
import { stlPreview } from "@/lib/stl-service"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const imageBuffer = await downloadFromMinio(order.imagePath)
  const filename = order.imagePath.split("/").pop() ?? "input.png"
  const configJson = JSON.parse(order.configJsonOperator ?? order.configJson)

  const pngBytes = await stlPreview(imageBuffer, filename, configJson)
  return new NextResponse(pngBytes, {
    status: 200,
    headers: { "Content-Type": "image/png" },
  })
}
```

- [ ] **Step 5: Create `app/api/light-generator/orders/[id]/stl/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getPresignedUrl } from "@/lib/lg-storage"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const order = await prisma.lightGeneratorOrder.findUnique({ where: { id } })
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!order.stlPath) return NextResponse.json({ error: "No STL generated yet" }, { status: 404 })

  const url = await getPresignedUrl(order.stlPath, 3600)
  return NextResponse.redirect(url, 302)
}
```

- [ ] **Step 6: Commit**

```bash
git add app/api/light-generator/orders/
git commit -m "feat(lg): add file upload + STL generate/preview/download routes"
```

---

## Task 10: Public proxy endpoints (island-check + shadow-preview)

**Files:**
- Create: `app/api/island-check/route.ts`
- Create: `app/api/shadow-preview/route.ts`

- [ ] **Step 1: Create `app/api/island-check/route.ts`**

No dashboard auth — uses `OPS_API_SECRET` header validation. Always returns 200.

```typescript
import { stlCheckIslands } from "@/lib/stl-service"
import { sanityAssetRefToUrl } from "@/lib/light-generator/sanity-helpers"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  // Auth: Bearer OPS_API_SECRET
  const authHeader = req.headers.get("authorization") ?? ""
  const secret = process.env.OPS_API_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { hasFloatingIslands: null, fallback: true },
      { status: 200 },
    )
  }

  try {
    const body = await req.json() as { imageAssetId?: string }
    const { imageAssetId } = body
    if (!imageAssetId) {
      return NextResponse.json({ hasFloatingIslands: null, fallback: true })
    }

    // Download image from Sanity CDN
    const imageUrl = sanityAssetRefToUrl(imageAssetId)
    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) {
      return NextResponse.json({ hasFloatingIslands: null, fallback: true })
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
    const ct = imageRes.headers.get("content-type") ?? "image/png"
    const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png"

    // Call STL service
    const result = await stlCheckIslands(imageBuffer, `silhouette.${ext}`, {})
    return NextResponse.json({ hasFloatingIslands: result.has_floating_islands })
  } catch {
    return NextResponse.json({ hasFloatingIslands: null, fallback: true })
  }
}
```

- [ ] **Step 2: Create `app/api/shadow-preview/route.ts`**

No dashboard auth — uses `OPS_API_SECRET`. On error returns 500 (landing page catches and returns `{ fallback: true }`).

```typescript
import { stlPreview } from "@/lib/stl-service"
import { sanityAssetRefToUrl } from "@/lib/light-generator/sanity-helpers"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? ""
  const secret = process.env.OPS_API_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json() as {
    imageAssetId?: string
    config?: { diameter?: number; offsetX?: number; offsetY?: number }
  }
  const { imageAssetId, config } = body
  if (!imageAssetId) {
    return NextResponse.json({ error: "Missing imageAssetId" }, { status: 400 })
  }

  // Download image from Sanity CDN
  const imageUrl = sanityAssetRefToUrl(imageAssetId)
  const imageRes = await fetch(imageUrl)
  if (!imageRes.ok) {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 })
  }
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer())
  const ct = imageRes.headers.get("content-type") ?? "image/png"
  const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpg" : "png"

  // Build config in STL service format
  const stlConfig = {
    shadow: {
      diameter: config?.diameter ?? 15,
      offsetX: config?.offsetX ?? 0,
      offsetY: config?.offsetY ?? 0,
    },
  }

  // Call STL service /preview — returns PNG bytes
  const pngBytes = await stlPreview(imageBuffer, `silhouette.${ext}`, stlConfig)

  return new NextResponse(pngBytes, {
    status: 200,
    headers: { "Content-Type": "image/png" },
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/island-check/ app/api/shadow-preview/
git commit -m "feat(lg): add public proxy endpoints island-check and shadow-preview"
```

---

## Task 11: React Query hooks for LG orders

**Files:**
- Create: `lib/hooks/use-light-generator.ts`

- [ ] **Step 1: Create `lib/hooks/use-light-generator.ts`**

```typescript
"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { LgOrder, SanityLgOrder } from "@/lib/light-generator/types"

// ── Keys ────────────────────────────────────────────────────────────────────

const LG_ORDERS_KEY = (status?: string) => ["lg-orders", status ?? "all"] as const
const LG_ORDER_KEY = (id: string) => ["lg-order", id] as const
const LG_PENDING_SANITY_KEY = ["lg-sanity-pending"] as const

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchOrders(status?: string): Promise<{ orders: LgOrder[]; total: number }> {
  const params = new URLSearchParams({ limit: "200" })
  if (status) params.set("status", status)
  const res = await fetch(`/api/light-generator/orders?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchOrder(id: string): Promise<LgOrder> {
  const res = await fetch(`/api/light-generator/orders/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchSanityPending(): Promise<SanityLgOrder[]> {
  const res = await fetch("/api/light-generator/sanity-pending")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useLgOrders(status?: string) {
  return useQuery({
    queryKey: LG_ORDERS_KEY(status),
    queryFn: () => fetchOrders(status),
  })
}

export function useLgOrder(id: string) {
  return useQuery({
    queryKey: LG_ORDER_KEY(id),
    queryFn: () => fetchOrder(id),
  })
}

export function useSanityPending() {
  return useQuery({
    queryKey: LG_PENDING_SANITY_KEY,
    queryFn: fetchSanityPending,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useUpdateLgOrder(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      status?: string
      statusNote?: string | null
      notesOperator?: string | null
      configJsonOperator?: string | null
    }) => {
      const res = await fetch(`/api/light-generator/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<LgOrder>
    },
    onSuccess: (updated) => {
      qc.setQueryData(LG_ORDER_KEY(id), updated)
      qc.invalidateQueries({ queryKey: ["lg-orders"] })
    },
  })
}

export function useConfirmLgOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/light-generator/orders/${orderId}/confirm`, {
        method: "POST",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LG_PENDING_SANITY_KEY })
      qc.invalidateQueries({ queryKey: ["lg-orders"] })
    },
  })
}

export function useGenerateLgStl(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/light-generator/orders/${id}/generate`, { method: "POST" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<{ ok: boolean; stlSize: number }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LG_ORDER_KEY(id) })
    },
  })
}

export function useUploadLgFile(id: string, field: "silhouette" | "additional") {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch(`/api/light-generator/orders/${id}/${field}`, {
        method: "PUT",
        body: form,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<LgOrder>
    },
    onSuccess: (updated) => {
      qc.setQueryData(LG_ORDER_KEY(id), updated)
    },
  })
}
```

- [ ] **Step 2: Add a Sanity pending endpoint used by the hook**

Create `app/api/light-generator/sanity-pending/route.ts`:

```typescript
import { auth } from "@/lib/auth"
import { fetchSanityPendingOrders } from "@/lib/light-generator/sanity-helpers"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Fetch Sanity orders with status "submitted"
  const sanityOrders = await fetchSanityPendingOrders()

  // Filter out orders already in local DB
  const localIds = await prisma.lightGeneratorOrder.findMany({
    where: { id: { in: sanityOrders.map((o) => o.orderId) } },
    select: { id: true },
  })
  const localIdSet = new Set(localIds.map((r) => r.id))
  const pending = sanityOrders.filter((o) => !localIdSet.has(o.orderId))

  return NextResponse.json(pending)
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-light-generator.ts app/api/light-generator/sanity-pending/
git commit -m "feat(lg): add React Query hooks + sanity-pending API endpoint"
```

---

## Task 12: Admin UI — Order List Page

**Files:**
- Create: `app/(dashboard)/light-generator/page.tsx`

- [ ] **Step 1: Create `app/(dashboard)/light-generator/page.tsx`**

```typescript
"use client"

import { Suspense, useState } from "react"
import { useRouter } from "next/navigation"
import { useLgOrders, useSanityPending, useConfirmLgOrder } from "@/lib/hooks/use-light-generator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { LgOrder, SanityLgOrder } from "@/lib/light-generator/types"
import type { LgStatus } from "@/lib/light-generator/types"

const STATUSES: Array<LgStatus | "all"> = ["all", "submitted", "paid", "generating", "ready", "shipped", "cancelled"]

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-gray-500",
  paid:       "bg-blue-500",
  generating: "bg-yellow-500",
  ready:      "bg-green-500",
  shipped:    "bg-purple-500",
  cancelled:  "bg-red-500",
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "bg-gray-500"
  return <span className={`inline-block px-2 py-0.5 rounded text-white text-xs font-medium ${color}`}>{status}</span>
}

function PendingSanityPanel() {
  const { data: pending, isLoading } = useSanityPending()
  const confirm = useConfirmLgOrder()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  if (isLoading || !pending?.length) return null

  function handleConfirm(order: SanityLgOrder) {
    setConfirming(order.orderId)
    confirm.mutate(order.orderId, {
      onSuccess: () => {
        setFeedback((f) => ({ ...f, [order.orderId]: "✅ Confirmed" }))
        setConfirming(null)
      },
      onError: (err) => {
        setFeedback((f) => ({ ...f, [order.orderId]: `❌ ${err.message}` }))
        setConfirming(null)
      },
    })
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">⏳ Pending dari Sanity ({pending.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Order ID</th>
                <th className="py-2 pr-4">Nama</th>
                <th className="py-2 pr-4">Ukuran</th>
                <th className="py-2 pr-4">Shape</th>
                <th className="py-2 pr-4">Submitted</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((o) => (
                <tr key={o.orderId} className="border-b hover:bg-muted/30">
                  <td className="py-2 pr-4 font-mono">{o.orderId}</td>
                  <td className="py-2 pr-4">{o.customerName}</td>
                  <td className="py-2 pr-4">{o.size}</td>
                  <td className="py-2 pr-4">{o.shape}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {new Date(o.submittedAt).toLocaleDateString("id-ID")}
                  </td>
                  <td className="py-2">
                    {feedback[o.orderId] ? (
                      <span className="text-xs">{feedback[o.orderId]}</span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(o)}
                        disabled={confirming === o.orderId}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {confirming === o.orderId ? "..." : "Confirm"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function OrderTable({ orders }: { orders: LgOrder[] }) {
  const router = useRouter()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Order ID</th>
            <th className="py-2 pr-4">Nama</th>
            <th className="py-2 pr-4">Ukuran</th>
            <th className="py-2 pr-4">Shape</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Tanggal</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const cfg = JSON.parse(o.configJsonOperator ?? o.configJson) as { size?: string; shape?: string }
            return (
              <tr
                key={o.id}
                className="border-b hover:bg-muted/30 cursor-pointer"
                onClick={() => router.push(`/light-generator/${o.id}`)}
              >
                <td className="py-2 pr-4 font-mono">{o.id}</td>
                <td className="py-2 pr-4">{o.customerName}</td>
                <td className="py-2 pr-4">{cfg.size ?? "-"}</td>
                <td className="py-2 pr-4">{cfg.shape ?? "-"}</td>
                <td className="py-2 pr-4"><StatusBadge status={o.status} /></td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {new Date(o.createdAt).toLocaleDateString("id-ID")}
                </td>
              </tr>
            )
          })}
          {orders.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada order</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function LightGeneratorPageInner() {
  const [activeStatus, setActiveStatus] = useState<LgStatus | "all">("all")
  const { data, isLoading } = useLgOrders(activeStatus === "all" ? undefined : activeStatus)
  const { data: allData } = useLgOrders()

  // Count per status
  const counts: Record<string, number> = {}
  if (allData?.orders) {
    for (const o of allData.orders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">💡 Light Generator Orders</h1>

      <PendingSanityPanel />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const count = s === "all" ? allData?.total : counts[s]
          return (
            <button
              key={s}
              onClick={() => setActiveStatus(s)}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors
                ${activeStatus === s
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-border text-muted-foreground hover:bg-muted"
                }`}
            >
              {s} {count != null && count > 0 ? `(${count})` : ""}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Memuat...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <OrderTable orders={data?.orders ?? []} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function LightGeneratorPage() {
  return (
    <Suspense>
      <LightGeneratorPageInner />
    </Suspense>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/light-generator/page.tsx
git commit -m "feat(lg): add order list page with status filter + pending Sanity panel"
```

---

## Task 13: Admin UI — Order Detail Page

**Files:**
- Create: `app/(dashboard)/light-generator/[id]/page.tsx`

- [ ] **Step 1: Create `app/(dashboard)/light-generator/[id]/page.tsx`**

```typescript
"use client"

import { use, useState } from "react"
import { useLgOrder, useUpdateLgOrder, useGenerateLgStl, useUploadLgFile } from "@/lib/hooks/use-light-generator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { LgConfigJson } from "@/lib/light-generator/types"

const STATUSES = ["submitted", "paid", "generating", "ready", "shipped", "cancelled"]

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-gray-500",
  paid:       "bg-blue-500",
  generating: "bg-yellow-500 animate-pulse",
  ready:      "bg-green-500",
  shipped:    "bg-purple-500",
  cancelled:  "bg-red-500",
}

export default function LgOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: order, isLoading } = useLgOrder(id)
  const updateOrder = useUpdateLgOrder(id)
  const generateStl = useGenerateLgStl(id)
  const uploadSilhouette = useUploadLgFile(id, "silhouette")
  const uploadAdditional = useUploadLgFile(id, "additional")

  const [statusDraft, setStatusDraft] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [notesOperator, setNotesOperator] = useState<string | null>(null)
  const [configOverride, setConfigOverride] = useState<string | null>(null)
  const [configEditing, setConfigEditing] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Memuat...</div>
  if (!order) return <div className="py-12 text-center text-muted-foreground">Order tidak ditemukan</div>

  const effectiveStatus = statusDraft ?? order.status
  const effectiveStatusNote = statusNote ?? order.statusNote ?? ""
  const effectiveNotesOperator = notesOperator ?? order.notesOperator ?? ""
  const effectiveConfig = configOverride ?? order.configJsonOperator ?? order.configJson
  const parsedConfig: LgConfigJson = JSON.parse(order.configJsonOperator ?? order.configJson)

  function handleSaveStatus() {
    setFeedback(null)
    const data: Record<string, unknown> = {}
    if (statusDraft !== null) data.status = statusDraft
    if (statusNote !== null) data.statusNote = statusNote
    if (notesOperator !== null) data.notesOperator = notesOperator
    updateOrder.mutate(data, {
      onSuccess: () => {
        setFeedback("✅ Tersimpan")
        setStatusDraft(null)
        setStatusNote(null)
        setNotesOperator(null)
      },
      onError: (err) => setFeedback(`❌ ${err.message}`),
    })
  }

  function handleSaveConfig() {
    setFeedback(null)
    try {
      JSON.parse(effectiveConfig) // validate JSON
    } catch {
      setFeedback("❌ JSON tidak valid")
      return
    }
    updateOrder.mutate({ configJsonOperator: effectiveConfig }, {
      onSuccess: () => {
        setFeedback("✅ Config tersimpan")
        setConfigOverride(null)
        setConfigEditing(false)
      },
      onError: (err) => setFeedback(`❌ ${err.message}`),
    })
  }

  function handleGenerate() {
    setFeedback(null)
    generateStl.mutate(undefined, {
      onSuccess: (r) => setFeedback(`✅ STL generated (${(r.stlSize / 1024).toFixed(1)} KB)`),
      onError: (err) => setFeedback(`❌ ${err.message}`),
    })
  }

  function handleFileUpload(field: "silhouette" | "additional", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const mut = field === "silhouette" ? uploadSilhouette : uploadAdditional
    mut.mutate(file, {
      onSuccess: () => setFeedback(`✅ ${field === "silhouette" ? "Silhouette" : "Floor insert"} uploaded`),
      onError: (err) => setFeedback(`❌ ${err.message}`),
    })
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold font-mono">{order.id}</h1>
        <span className={`inline-block px-2 py-0.5 rounded text-white text-xs font-medium ${STATUS_COLORS[order.status] ?? "bg-gray-500"}`}>
          {order.status}
        </span>
      </div>
      {feedback && <div className="text-sm py-2">{feedback}</div>}

      {/* Customer card */}
      <Card>
        <CardHeader><CardTitle className="text-sm">👤 Customer</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div><span className="font-medium">Nama:</span> {order.customerName}</div>
          <div><span className="font-medium">Kontak:</span> {order.customerContact}</div>
          {order.notesCustomer && <div><span className="font-medium">Catatan:</span> {order.notesCustomer}</div>}
        </CardContent>
      </Card>

      {/* Config card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">⚙️ Config {order.configJsonOperator ? "(operator override)" : "(customer)"}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setConfigEditing(!configEditing)}>
              {configEditing ? "Cancel" : "Edit"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {configEditing ? (
            <div className="space-y-2">
              <Textarea
                className="font-mono text-xs"
                rows={8}
                value={effectiveConfig}
                onChange={(e) => setConfigOverride(e.target.value)}
              />
              <Button size="sm" onClick={handleSaveConfig} disabled={updateOrder.isPending}>Simpan Config</Button>
            </div>
          ) : (
            <div className="text-sm space-y-1">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Ukuran</span><span>{parsedConfig.size}</span>
                <span className="text-muted-foreground">Shape</span><span>{parsedConfig.shape}</span>
                {parsedConfig.shapeRatio && <>
                  <span className="text-muted-foreground">Ratio</span>
                  <span>{parsedConfig.shapeRatio.width}:{parsedConfig.shapeRatio.height}</span>
                </>}
                <span className="text-muted-foreground">Shadow Ø</span><span>{parsedConfig.shadowDiameter} cm</span>
                <span className="text-muted-foreground">Offset</span>
                <span>X:{parsedConfig.shadowOffsetX} Y:{parsedConfig.shadowOffsetY} mm</span>
                <span className="text-muted-foreground">Support Stems</span><span>{parsedConfig.supportStems ? "Ya" : "Tidak"}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Images card */}
      <Card>
        <CardHeader><CardTitle className="text-sm">🖼️ Gambar</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-xs font-medium mb-1">Silhouette ({order.imagePath.split("/").pop()})</div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <Button variant="outline" size="sm" asChild>
                  <span>{uploadSilhouette.isPending ? "Uploading..." : "Upload / Replace"}</span>
                </Button>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => handleFileUpload("silhouette", e)} />
              </label>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium mb-1">Floor Insert {order.additionalImagePath ? `(${order.additionalImagePath.split("/").pop()})` : "(belum ada)"}</div>
            <label className="cursor-pointer">
              <Button variant="outline" size="sm" asChild>
                <span>{uploadAdditional.isPending ? "Uploading..." : "Upload / Replace"}</span>
              </Button>
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => handleFileUpload("additional", e)} />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* STL card */}
      <Card>
        <CardHeader><CardTitle className="text-sm">🖨️ STL</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {order.stlPath ? `File: ${order.stlPath}` : "Belum ada STL"}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleGenerate}
              disabled={generateStl.isPending || order.status === "generating"}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {generateStl.isPending || order.status === "generating" ? "Generating..." : "Generate STL"}
            </Button>
            {order.stlPath && (
              <Button variant="outline" asChild>
                <a href={`/api/light-generator/orders/${order.id}/stl`} download>
                  Download STL
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Status + notes */}
      <Card>
        <CardHeader><CardTitle className="text-sm">📝 Status & Pesan</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={effectiveStatus} onValueChange={(v) => setStatusDraft(v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleSaveStatus} disabled={updateOrder.isPending} size="sm">
              Simpan
            </Button>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium">Pesan ke Customer (customer-visible)</div>
            <Textarea
              rows={3}
              placeholder="Pesan yang terlihat oleh customer..."
              value={effectiveStatusNote}
              onChange={(e) => setStatusNote(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium">Catatan Operator (internal)</div>
            <Textarea
              rows={3}
              placeholder="Catatan internal..."
              value={effectiveNotesOperator}
              onChange={(e) => setNotesOperator(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(dashboard\)/light-generator/
git commit -m "feat(lg): add order detail page"
```

---

## Task 14: TabNav + layout badge integration

**Files:**
- Modify: `components/layout/TabNav.tsx`
- Modify: `components/layout/MobileBottomNav.tsx`
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Add Light Generator tab to `components/layout/TabNav.tsx`**

In the `TABS` array, add after the `landing` entry:

```typescript
{ href: "/light-generator", label: "Light Gen", icon: "💡", roles: ["OWNER"] },
```

- [ ] **Step 2: Add Light Generator tab to `components/layout/MobileBottomNav.tsx`**

In the `ALL_TABS` array, add after the `landing` entry:

```typescript
{ href: "/light-generator", label: "Light Gen", icon: "💡", roles: ["OWNER"] },
```

- [ ] **Step 3: Add LG badge to `app/(dashboard)/layout.tsx`**

Import `countLgPendingOrders`:
```typescript
import { countLgPendingOrders } from "@/lib/light-generator/service"
```

In `getBadges()`, add alongside existing withTimeout calls:
```typescript
const [orderResult, adsResult, productsResult, lgResult] = await Promise.allSettled([
  withTimeout(countBelumCetak(), 3000),
  withTimeout(getAdsPerformance("7d"), 3000),
  withTimeout(countPerluPerhatian(), 3000),
  withTimeout(countLgPendingOrders(), 3000),
])
// ... existing badge assignments, then:
if (lgResult.status === "fulfilled" && lgResult.value > 0) badges["light-generator"] = lgResult.value
```

- [ ] **Step 4: Commit**

```bash
git add components/layout/ app/\(dashboard\)/layout.tsx
git commit -m "feat(lg): add Light Generator tab to nav + badge count in layout"
```

---

## Task 15: Data migration script

**Files:**
- Create: `scripts/migrate-lg-orders.mjs`

- [ ] **Step 1: Create `scripts/migrate-lg-orders.mjs`**

```javascript
/**
 * One-time migration: lightgenerator PostgreSQL DB → shopee_dashboard
 *
 * Run inside container OR locally with both DBs accessible:
 *   LIGHTGENERATOR_DB_URL=postgresql://postgres:<pass>@light-generator-postgres-1:5432/lightgenerator \
 *   DATABASE_URL=postgresql://postgres:<pass>@light-generator-postgres-1:5432/shopee_dashboard \
 *   node scripts/migrate-lg-orders.mjs
 */

import pkg from "pg"
const { Client } = pkg
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const srcUrl = process.env.LIGHTGENERATOR_DB_URL
const dstUrl = process.env.DATABASE_URL
if (!srcUrl) { console.error("LIGHTGENERATOR_DB_URL is not set"); process.exit(1) }
if (!dstUrl) { console.error("DATABASE_URL is not set"); process.exit(1) }

const srcClient = new Client({ connectionString: srcUrl })
const adapter = new PrismaPg({ connectionString: dstUrl })
const prisma = new PrismaClient({ adapter })

async function migrate() {
  await srcClient.connect()
  console.log("🚀 Starting lightgenerator → shopee_dashboard migration\n")

  // Read all orders from source DB
  const { rows } = await srcClient.query(`
    SELECT
      id, status, "statusNote", "customerName", "customerContact",
      "notesCustomer", "configJson", "imagePath", "configJsonOperator",
      "stlPath", "notesOperator", "additionalImagePath",
      "createdAt", "updatedAt"
    FROM "LightGeneratorOrder"
    ORDER BY "createdAt" ASC
  `)

  console.log(`Found ${rows.length} orders to migrate`)

  let migrated = 0
  let skipped = 0

  for (const row of rows) {
    try {
      await prisma.lightGeneratorOrder.upsert({
        where: { id: row.id },
        create: {
          id:                  row.id,
          sanityDocId:         null, // not available in source DB
          status:              row.status ?? "submitted",
          statusNote:          row.statusNote ?? null,
          customerName:        row.customerName,
          customerContact:     row.customerContact,
          notesCustomer:       row.notesCustomer ?? null,
          configJson:          typeof row.configJson === "string"
                                 ? row.configJson
                                 : JSON.stringify(row.configJson),
          imagePath:           row.imagePath ?? "",
          configJsonOperator:  row.configJsonOperator ?? null,
          stlPath:             row.stlPath ?? null,
          notesOperator:       row.notesOperator ?? null,
          additionalImagePath: row.additionalImagePath ?? null,
          createdAt:           row.createdAt ? new Date(row.createdAt) : new Date(),
          updatedAt:           row.updatedAt ? new Date(row.updatedAt) : new Date(),
        },
        update: {}, // idempotent — don't overwrite on re-run
      })
      migrated++
      if (migrated % 10 === 0) console.log(`  Migrated ${migrated}/${rows.length}...`)
    } catch (err) {
      console.error(`  ⚠️  Failed to migrate ${row.id}:`, err.message)
      skipped++
    }
  }

  console.log(`\n✅ Done. Migrated: ${migrated}, Skipped: ${skipped}`)
  await srcClient.end()
  await prisma.$disconnect()
}

migrate().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
```

- [ ] **Step 2: Commit**

```bash
git add scripts/migrate-lg-orders.mjs
git commit -m "feat(lg): add one-time data migration script from lightgenerator DB"
```

---

## Task 16: Build + deploy + smoke test

- [ ] **Step 1: Verify build locally**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npm run build
```

Expected: no TypeScript errors, build succeeds

- [ ] **Step 2: Deploy to homelab Docker**

```bash
# Build image
DOCKER_HOST=tcp://192.168.88.113:2375 docker build -t shopee-dashboard:latest .

# Stop + remove old container
DOCKER_HOST=tcp://192.168.88.113:2375 docker stop shopee-dashboard 2>/dev/null; \
DOCKER_HOST=tcp://192.168.88.113:2375 docker rm shopee-dashboard 2>/dev/null

# Start new container (env vars injected from .env.deploy)
DOCKER_HOST=tcp://192.168.88.113:2375 docker run -d \
  --name shopee-dashboard \
  --network homelab \
  -p 3100:3100 \
  --env-file .env.deploy \
  shopee-dashboard:latest
```

Expected: container starts, `docker logs shopee-dashboard` shows no crash

- [ ] **Step 3: Run DB schema push inside container**

The entrypoint already runs `prisma db push --accept-data-loss` on startup. Verify with:

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker logs shopee-dashboard 2>&1 | grep -E "prisma|sync"
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Run the data migration script**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker exec shopee-dashboard sh -c \
  "LIGHTGENERATOR_DB_URL='postgresql://postgres:<pass>@light-generator-postgres-1:5432/lightgenerator' \
   DATABASE_URL='postgresql://postgres:sI92qLc9z3Buf4iY9C6l2tmd6R9QarYE@light-generator-postgres-1:5432/shopee_dashboard' \
   node scripts/migrate-lg-orders.mjs"
```

Expected: `✅ Done. Migrated: N, Skipped: 0`

- [ ] **Step 5: Smoke test**

1. Open `https://dashboard.3dprinting.my.id/light-generator` — should show order list
2. If migrated orders exist: click one → detail page loads
3. Open Settings → Notifikasi — should show Telegram + Pushover + Discord sections with enabled toggles
4. Check sidebar/TabNav shows 💡 Light Gen tab

- [ ] **Step 6: Final commit (if any last tweaks)**

```bash
git add -p
git commit -m "fix(lg): post-deploy adjustments"
```

---

## Spec Coverage Self-Check

| Spec requirement | Task |
|---|---|
| Prisma model `LightGeneratorOrder` | Task 1 |
| MinIO `lib/minio.ts` singleton | Task 2 |
| MinIO storage helpers (upload/download/presign) | Task 2 |
| STL service HTTP client | Task 3 |
| Discord notification sender | Task 4 |
| Per-channel `enabled` toggle (Pushover/Telegram/Discord) | Task 4 |
| `sendNotification()` unified fan-out | Task 4 |
| Settings UI Discord section + enabled toggles | Task 5 |
| `GET /api/light-generator/orders` | Task 7 |
| `GET /api/light-generator/orders/[id]` | Task 7 |
| `PATCH /api/light-generator/orders/[id]` + Sanity write-back | Task 7 |
| `POST /api/light-generator/orders/[id]/confirm` | Task 8 |
| `PUT /api/light-generator/orders/[id]/silhouette` | Task 9 |
| `PUT /api/light-generator/orders/[id]/additional` | Task 9 |
| `POST /api/light-generator/orders/[id]/generate` | Task 9 |
| `POST /api/light-generator/orders/[id]/preview` | Task 9 |
| `GET /api/light-generator/orders/[id]/stl` (presigned redirect) | Task 9 |
| `POST /api/island-check` (public + OPS_API_SECRET) | Task 10 |
| `POST /api/shadow-preview` (public + OPS_API_SECRET, raw PNG) | Task 10 |
| React Query hooks for all LG operations | Task 11 |
| Sanity pending endpoint | Task 11 |
| `/light-generator` order list + status filter chips | Task 12 |
| `/light-generator` pending Sanity panel + Confirm button | Task 12 |
| `/light-generator/[id]` detail: all cards (customer, config, images, STL, status) | Task 13 |
| TabNav + MobileBottomNav Light Generator tab | Task 14 |
| Layout badge (submitted+paid count) | Task 14 |
| Data migration script | Task 15 |
| Deploy + run migration | Task 16 |
