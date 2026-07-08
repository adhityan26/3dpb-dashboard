# Shopee Dashboard — Plan 6: Tab Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Tab Settings yang menampilkan status koneksi Shopee, konfigurasi Telegram bot & Pushover, alert threshold (stok minimum, ROAS, order numpuk), auto-refresh interval, dan manajemen user (Owner bisa buat/edit/hapus Admin & Test User). Semua konfigurasi disimpan di Prisma `Config` table kecuali refresh interval yang pakai localStorage (per-browser).

**Architecture:** Service layer membaca/menulis `Config` key-value store untuk semua settings. User management pakai Prisma `User` model yang sudah ada. Frontend pakai shadcn/ui forms dengan toast notification untuk feedback. Semua endpoint settings adalah Owner-only.

**Tech Stack:** Next.js 16, React Query v5, Prisma 7, NextAuth v5, bcryptjs (existing).

**Dependencies:** Plan 1 (Foundation). Plan 7 (Notifikasi) akan pakai config dari plan ini.

---

## Scope & Non-Scope

**In scope:**
- Shopee connection status + re-authorize button
- Telegram bot config (token + chat ID) dengan tombol test
- Pushover config (user key + app token) dengan tombol test
- Alert threshold config (stok min, ROAS min, order pile-up)
- Auto-refresh interval selector (replace localStorage-only approach)
- User management: list users, create, edit role, delete, reset password
- Test user creation (untuk Shopee app review)

**Not in scope (defer ke Plan 7):**
- Kirim notifikasi otomatis saat trigger (Telegram/Pushover actual send)
- Background job untuk monitoring dan alert detection

Plan 6 hanya setup **infrastructure**-nya. Actual notification sending ada di Plan 7.

---

## Data Storage

Semua config disimpan di `Config` table (key-value) yang sudah ada dari Plan 1:

| Key | Type | Deskripsi |
|-----|------|-----------|
| `telegram_bot_token` | string | Bot token from @BotFather |
| `telegram_chat_id` | string | Chat/group ID untuk notif |
| `pushover_user_key` | string | Pushover user key |
| `pushover_app_token` | string | Pushover app token |
| `alert_stock_min` | string (number) | Default 5 |
| `alert_roas_min` | string (number) | Default 2 |
| `alert_order_pileup_count` | string (number) | Default 5 |
| `alert_order_pileup_hours` | string (number) | Default 1 |
| `shopee_access_token` | string | (existing) |
| `shopee_refresh_token` | string | (existing) |
| `shopee_shop_id` | string | (existing) |

Auto-refresh interval TIDAK disimpan di DB — tetap di localStorage untuk per-browser preference.

---

## File Structure

```
shopee-dashboard/
├── lib/
│   ├── settings/
│   │   ├── types.ts              # NEW: Setting types (shape of config bundle)
│   │   └── service.ts            # NEW: getSettings, updateSettings, getShopeeStatus
│   ├── users/
│   │   └── service.ts            # NEW: listUsers, createUser, updateUser, deleteUser, resetPassword
│   └── hooks/
│       ├── use-settings.ts       # NEW: useSettings, useUpdateSettings
│       └── use-users.ts          # NEW: useUsers, useCreateUser, useDeleteUser, useResetPassword
├── app/
│   ├── api/
│   │   ├── settings/
│   │   │   ├── route.ts          # GET current, PATCH update
│   │   │   └── test-notification/
│   │   │       └── route.ts      # POST test telegram/pushover
│   │   └── users/
│   │       ├── route.ts          # GET list, POST create
│   │       └── [userId]/
│   │           ├── route.ts      # DELETE, PATCH (role)
│   │           └── password/
│   │               └── route.ts  # PATCH (reset password)
│   └── (dashboard)/
│       └── settings/
│           └── page.tsx          # REPLACE placeholder
└── components/
    └── settings/
        ├── ShopeeStatusCard.tsx      # connection status + reconnect
        ├── NotificationConfigCard.tsx # Telegram + Pushover forms
        ├── AlertThresholdCard.tsx    # threshold inputs
        ├── RefreshIntervalCard.tsx   # interval selector
        ├── UserManagementCard.tsx    # user list + actions
        └── UserFormModal.tsx         # create/edit user modal
```

---

## Task 1: Settings Types + Service

**Files:**
- Create: `lib/settings/types.ts`
- Create: `lib/settings/service.ts`

- [ ] **Step 1: Create `lib/settings/types.ts`**

```typescript
export interface NotificationConfig {
  telegramBotToken: string | null
  telegramChatId: string | null
  pushoverUserKey: string | null
  pushoverAppToken: string | null
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
  tokenUpdatedAt: string | null // ISO string
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

// Config keys used in Prisma Config table
export const CONFIG_KEYS = {
  TELEGRAM_BOT_TOKEN: "telegram_bot_token",
  TELEGRAM_CHAT_ID: "telegram_chat_id",
  PUSHOVER_USER_KEY: "pushover_user_key",
  PUSHOVER_APP_TOKEN: "pushover_app_token",
  ALERT_STOCK_MIN: "alert_stock_min",
  ALERT_ROAS_MIN: "alert_roas_min",
  ALERT_ORDER_PILEUP_COUNT: "alert_order_pileup_count",
  ALERT_ORDER_PILEUP_HOURS: "alert_order_pileup_hours",
  SHOPEE_ACCESS_TOKEN: "shopee_access_token",
  SHOPEE_REFRESH_TOKEN: "shopee_refresh_token",
  SHOPEE_SHOP_ID: "shopee_shop_id",
} as const
```

- [ ] **Step 2: Create `lib/settings/service.ts`**

```typescript
import { prisma } from "@/lib/db"
import {
  CONFIG_KEYS,
  DEFAULT_THRESHOLDS,
  type AllSettings,
  type NotificationConfig,
  type AlertThresholds,
  type ShopeeStatus,
} from "./types"

async function getConfigValue(key: string): Promise<string | null> {
  const row = await prisma.config.findUnique({ where: { key } })
  return row?.value ?? null
}

async function setConfigValue(key: string, value: string | null): Promise<void> {
  if (value === null || value === "") {
    await prisma.config.deleteMany({ where: { key } })
  } else {
    await prisma.config.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }
}

function parseNumber(s: string | null, fallback: number): number {
  if (s === null) return fallback
  const n = Number(s)
  return Number.isNaN(n) ? fallback : n
}

export async function getNotificationConfig(): Promise<NotificationConfig> {
  const [botToken, chatId, userKey, appToken] = await Promise.all([
    getConfigValue(CONFIG_KEYS.TELEGRAM_BOT_TOKEN),
    getConfigValue(CONFIG_KEYS.TELEGRAM_CHAT_ID),
    getConfigValue(CONFIG_KEYS.PUSHOVER_USER_KEY),
    getConfigValue(CONFIG_KEYS.PUSHOVER_APP_TOKEN),
  ])
  return {
    telegramBotToken: botToken,
    telegramChatId: chatId,
    pushoverUserKey: userKey,
    pushoverAppToken: appToken,
  }
}

export async function getAlertThresholds(): Promise<AlertThresholds> {
  const [stockMin, roasMin, pileupCount, pileupHours] = await Promise.all([
    getConfigValue(CONFIG_KEYS.ALERT_STOCK_MIN),
    getConfigValue(CONFIG_KEYS.ALERT_ROAS_MIN),
    getConfigValue(CONFIG_KEYS.ALERT_ORDER_PILEUP_COUNT),
    getConfigValue(CONFIG_KEYS.ALERT_ORDER_PILEUP_HOURS),
  ])
  return {
    stockMin: parseNumber(stockMin, DEFAULT_THRESHOLDS.stockMin),
    roasMin: parseNumber(roasMin, DEFAULT_THRESHOLDS.roasMin),
    orderPileupCount: parseNumber(
      pileupCount,
      DEFAULT_THRESHOLDS.orderPileupCount,
    ),
    orderPileupHours: parseNumber(
      pileupHours,
      DEFAULT_THRESHOLDS.orderPileupHours,
    ),
  }
}

export async function getShopeeStatus(): Promise<ShopeeStatus> {
  const [accessToken, shopIdRow] = await Promise.all([
    prisma.config.findUnique({
      where: { key: CONFIG_KEYS.SHOPEE_ACCESS_TOKEN },
    }),
    prisma.config.findUnique({
      where: { key: CONFIG_KEYS.SHOPEE_SHOP_ID },
    }),
  ])
  return {
    connected: !!accessToken?.value,
    shopId: shopIdRow?.value ?? null,
    tokenUpdatedAt: accessToken?.updatedAt?.toISOString() ?? null,
  }
}

export async function getAllSettings(): Promise<AllSettings> {
  const [notification, thresholds, shopee] = await Promise.all([
    getNotificationConfig(),
    getAlertThresholds(),
    getShopeeStatus(),
  ])
  return { notification, thresholds, shopee }
}

export async function updateNotificationConfig(
  config: Partial<NotificationConfig>,
): Promise<void> {
  const updates: Array<Promise<void>> = []
  if (config.telegramBotToken !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.TELEGRAM_BOT_TOKEN, config.telegramBotToken),
    )
  }
  if (config.telegramChatId !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.TELEGRAM_CHAT_ID, config.telegramChatId),
    )
  }
  if (config.pushoverUserKey !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.PUSHOVER_USER_KEY, config.pushoverUserKey),
    )
  }
  if (config.pushoverAppToken !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.PUSHOVER_APP_TOKEN, config.pushoverAppToken),
    )
  }
  await Promise.all(updates)
}

export async function updateAlertThresholds(
  thresholds: Partial<AlertThresholds>,
): Promise<void> {
  const updates: Array<Promise<void>> = []
  if (thresholds.stockMin !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.ALERT_STOCK_MIN, String(thresholds.stockMin)),
    )
  }
  if (thresholds.roasMin !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.ALERT_ROAS_MIN, String(thresholds.roasMin)),
    )
  }
  if (thresholds.orderPileupCount !== undefined) {
    updates.push(
      setConfigValue(
        CONFIG_KEYS.ALERT_ORDER_PILEUP_COUNT,
        String(thresholds.orderPileupCount),
      ),
    )
  }
  if (thresholds.orderPileupHours !== undefined) {
    updates.push(
      setConfigValue(
        CONFIG_KEYS.ALERT_ORDER_PILEUP_HOURS,
        String(thresholds.orderPileupHours),
      ),
    )
  }
  await Promise.all(updates)
}

/**
 * Send a test notification to Telegram. Returns { ok, error }.
 * Does NOT save config — caller must save first.
 */
export async function sendTestTelegram(
  botToken: string,
  chatId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ Test notifikasi dari Shopee Dashboard berhasil!",
        }),
      },
    )
    const json = (await res.json()) as { ok?: boolean; description?: string }
    if (!json.ok) {
      return { ok: false, error: json.description ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error"
    return { ok: false, error: msg }
  }
}

/**
 * Send a test notification to Pushover. Returns { ok, error }.
 */
export async function sendTestPushover(
  userKey: string,
  appToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = new URLSearchParams({
      token: appToken,
      user: userKey,
      message: "✅ Test notifikasi dari Shopee Dashboard berhasil!",
      title: "Shopee Dashboard",
    })
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    const json = (await res.json()) as { status?: number; errors?: string[] }
    if (json.status !== 1) {
      return { ok: false, error: json.errors?.join(", ") ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error"
    return { ok: false, error: msg }
  }
}
```

- [ ] **Step 3: Verify build & commit**

```bash
npm run build 2>&1 | tail -10
git add lib/settings/
git commit -m "feat(settings): add types and service for config, thresholds, test notifications"
```

---

## Task 2: Users Service

**Files:**
- Create: `lib/users/service.ts`

- [ ] **Step 1: Create service**

```typescript
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

export type UserRole = "OWNER" | "ADMIN" | "TEST_USER"

export interface UserSummary {
  id: string
  email: string
  name: string
  role: string
  createdAt: string
}

function isValidRole(role: string): role is UserRole {
  return role === "OWNER" || role === "ADMIN" || role === "TEST_USER"
}

export async function listUsers(): Promise<UserSummary[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  })
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  }))
}

export async function createUser(params: {
  email: string
  name: string
  password: string
  role: string
}): Promise<UserSummary> {
  if (!isValidRole(params.role)) {
    throw new Error(`Invalid role: ${params.role}`)
  }
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
  })
  if (existing) {
    throw new Error("Email sudah terdaftar")
  }
  const hashed = await bcrypt.hash(params.password, 10)
  const user = await prisma.user.create({
    data: {
      email: params.email,
      name: params.name,
      password: hashed,
      role: params.role,
    },
  })
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function updateUserRole(
  userId: string,
  newRole: string,
): Promise<void> {
  if (!isValidRole(newRole)) {
    throw new Error(`Invalid role: ${newRole}`)
  }
  // Prevent demoting the last OWNER
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error("User not found")
  if (user.role === "OWNER" && newRole !== "OWNER") {
    const ownerCount = await prisma.user.count({ where: { role: "OWNER" } })
    if (ownerCount <= 1) {
      throw new Error("Tidak bisa demote Owner terakhir")
    }
  }
  await prisma.user.update({
    where: { id: userId },
    data: { role: newRole },
  })
}

export async function deleteUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error("User not found")
  if (user.role === "OWNER") {
    const ownerCount = await prisma.user.count({ where: { role: "OWNER" } })
    if (ownerCount <= 1) {
      throw new Error("Tidak bisa hapus Owner terakhir")
    }
  }
  await prisma.user.delete({ where: { id: userId } })
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error("Password minimal 8 karakter")
  }
  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  })
}
```

- [ ] **Step 2: Verify build & commit**

```bash
npm run build 2>&1 | tail -10
git add lib/users/
git commit -m "feat(users): add service for user management with guards against removing last owner"
```

---

## Task 3: Settings API Routes

**Files:**
- Create: `app/api/settings/route.ts`
- Create: `app/api/settings/test-notification/route.ts`

- [ ] **Step 1: Settings GET + PATCH**

Create `app/api/settings/route.ts`:

```typescript
import { auth } from "@/lib/auth"
import {
  getAllSettings,
  updateNotificationConfig,
  updateAlertThresholds,
} from "@/lib/settings/service"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const settings = await getAllSettings()
    return NextResponse.json(settings)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: { notification?: unknown; thresholds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    if (body.notification && typeof body.notification === "object") {
      const n = body.notification as Record<string, unknown>
      await updateNotificationConfig({
        telegramBotToken:
          typeof n.telegramBotToken === "string" || n.telegramBotToken === null
            ? (n.telegramBotToken as string | null)
            : undefined,
        telegramChatId:
          typeof n.telegramChatId === "string" || n.telegramChatId === null
            ? (n.telegramChatId as string | null)
            : undefined,
        pushoverUserKey:
          typeof n.pushoverUserKey === "string" || n.pushoverUserKey === null
            ? (n.pushoverUserKey as string | null)
            : undefined,
        pushoverAppToken:
          typeof n.pushoverAppToken === "string" || n.pushoverAppToken === null
            ? (n.pushoverAppToken as string | null)
            : undefined,
      })
    }

    if (body.thresholds && typeof body.thresholds === "object") {
      const t = body.thresholds as Record<string, unknown>
      await updateAlertThresholds({
        stockMin:
          typeof t.stockMin === "number" ? t.stockMin : undefined,
        roasMin: typeof t.roasMin === "number" ? t.roasMin : undefined,
        orderPileupCount:
          typeof t.orderPileupCount === "number"
            ? t.orderPileupCount
            : undefined,
        orderPileupHours:
          typeof t.orderPileupHours === "number"
            ? t.orderPileupHours
            : undefined,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("PATCH /api/settings failed:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Test notification endpoint**

Create `app/api/settings/test-notification/route.ts`:

```typescript
import { auth } from "@/lib/auth"
import { sendTestTelegram, sendTestPushover } from "@/lib/settings/service"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: {
    channel?: unknown
    telegramBotToken?: unknown
    telegramChatId?: unknown
    pushoverUserKey?: unknown
    pushoverAppToken?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (body.channel === "telegram") {
    if (
      typeof body.telegramBotToken !== "string" ||
      typeof body.telegramChatId !== "string"
    ) {
      return NextResponse.json(
        { error: "telegramBotToken and telegramChatId are required" },
        { status: 400 },
      )
    }
    const result = await sendTestTelegram(
      body.telegramBotToken,
      body.telegramChatId,
    )
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  }

  if (body.channel === "pushover") {
    if (
      typeof body.pushoverUserKey !== "string" ||
      typeof body.pushoverAppToken !== "string"
    ) {
      return NextResponse.json(
        { error: "pushoverUserKey and pushoverAppToken are required" },
        { status: 400 },
      )
    }
    const result = await sendTestPushover(
      body.pushoverUserKey,
      body.pushoverAppToken,
    )
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  }

  return NextResponse.json(
    { error: "channel must be 'telegram' or 'pushover'" },
    { status: 400 },
  )
}
```

- [ ] **Step 3: Verify build & commit**

```bash
npm run build 2>&1 | tail -10
git add app/api/settings/
git commit -m "feat(api): add GET/PATCH /api/settings and POST /api/settings/test-notification"
```

---

## Task 4: Users API Routes

**Files:**
- Create: `app/api/users/route.ts`
- Create: `app/api/users/[userId]/route.ts`
- Create: `app/api/users/[userId]/password/route.ts`

- [ ] **Step 1: GET list + POST create**

Create `app/api/users/route.ts`:

```typescript
import { auth } from "@/lib/auth"
import { listUsers, createUser } from "@/lib/users/service"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const users = await listUsers()
    return NextResponse.json({ users })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: {
    email?: unknown
    name?: unknown
    password?: unknown
    role?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (
    typeof body.email !== "string" ||
    typeof body.name !== "string" ||
    typeof body.password !== "string" ||
    typeof body.role !== "string"
  ) {
    return NextResponse.json(
      { error: "email, name, password, role are required" },
      { status: 400 },
    )
  }

  if (body.password.length < 8) {
    return NextResponse.json(
      { error: "Password minimal 8 karakter" },
      { status: 400 },
    )
  }

  try {
    const user = await createUser({
      email: body.email,
      name: body.name,
      password: body.password,
      role: body.role,
    })
    return NextResponse.json({ user })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
```

- [ ] **Step 2: PATCH role + DELETE**

Create `app/api/users/[userId]/route.ts`:

```typescript
import { auth } from "@/lib/auth"
import { updateUserRole, deleteUser } from "@/lib/users/service"
import { NextRequest, NextResponse } from "next/server"

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId } = await ctx.params
  let body: { role?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.role !== "string") {
    return NextResponse.json({ error: "role must be string" }, { status: 400 })
  }

  try {
    await updateUserRole(userId, body.role)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId } = await ctx.params

  // Prevent self-delete
  if (session.user.id === userId) {
    return NextResponse.json(
      { error: "Tidak bisa hapus akun sendiri" },
      { status: 400 },
    )
  }

  try {
    await deleteUser(userId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
```

- [ ] **Step 3: Reset password**

Create `app/api/users/[userId]/password/route.ts`:

```typescript
import { auth } from "@/lib/auth"
import { resetUserPassword } from "@/lib/users/service"
import { NextRequest, NextResponse } from "next/server"

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId } = await ctx.params
  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (typeof body.password !== "string") {
    return NextResponse.json(
      { error: "password must be string" },
      { status: 400 },
    )
  }

  try {
    await resetUserPassword(userId, body.password)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
```

- [ ] **Step 4: Verify build & commit**

```bash
npm run build 2>&1 | tail -10
git add app/api/users/
git commit -m "feat(api): add user management endpoints (CRUD + password reset)"
```

---

## Task 5: React Query Hooks

**Files:**
- Create: `lib/hooks/use-settings.ts`
- Create: `lib/hooks/use-users.ts`

- [ ] **Step 1: Settings hooks**

Create `lib/hooks/use-settings.ts`:

```typescript
"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { AllSettings, NotificationConfig, AlertThresholds } from "@/lib/settings/types"

const SETTINGS_KEY = ["settings"] as const

async function fetchSettings(): Promise<AllSettings> {
  const res = await fetch("/api/settings")
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: fetchSettings,
  })
}

interface UpdateSettingsVars {
  notification?: Partial<NotificationConfig>
  thresholds?: Partial<AlertThresholds>
}

async function updateSettings(vars: UpdateSettingsVars): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}

interface TestNotificationVars {
  channel: "telegram" | "pushover"
  telegramBotToken?: string
  telegramChatId?: string
  pushoverUserKey?: string
  pushoverAppToken?: string
}

async function testNotification(
  vars: TestNotificationVars,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/settings/test-notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
  })
  return res.json()
}

export function useTestNotification() {
  return useMutation({
    mutationFn: testNotification,
  })
}
```

- [ ] **Step 2: Users hooks**

Create `lib/hooks/use-users.ts`:

```typescript
"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { UserSummary } from "@/lib/users/service"

const USERS_KEY = ["users"] as const

async function fetchUsers(): Promise<{ users: UserSummary[] }> {
  const res = await fetch("/api/users")
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: fetchUsers,
  })
}

interface CreateUserVars {
  email: string
  name: string
  password: string
  role: string
}

async function createUser(vars: CreateUserVars): Promise<void> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

async function updateUserRole(vars: {
  userId: string
  role: string
}): Promise<void> {
  const res = await fetch(`/api/users/${vars.userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: vars.role }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateUserRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

async function deleteUserReq(userId: string): Promise<void> {
  const res = await fetch(`/api/users/${userId}`, { method: "DELETE" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteUserReq,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

async function resetPassword(vars: {
  userId: string
  password: string
}): Promise<void> {
  const res = await fetch(`/api/users/${vars.userId}/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: vars.password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useResetPassword() {
  return useMutation({
    mutationFn: resetPassword,
  })
}
```

- [ ] **Step 3: Verify build & commit**

```bash
npm run build 2>&1 | tail -10
git add lib/hooks/use-settings.ts lib/hooks/use-users.ts
git commit -m "feat(hooks): add useSettings, useUsers, and related mutation hooks"
```

---

## Task 6: Settings Components

**Files:**
- Create: `components/settings/ShopeeStatusCard.tsx`
- Create: `components/settings/NotificationConfigCard.tsx`
- Create: `components/settings/AlertThresholdCard.tsx`
- Create: `components/settings/RefreshIntervalCard.tsx`
- Create: `components/settings/UserManagementCard.tsx`
- Create: `components/settings/UserFormModal.tsx`

Each component should be a client component using the hooks from Task 5. See the detailed specs below.

### Step 1: ShopeeStatusCard

Create `components/settings/ShopeeStatusCard.tsx`:

```typescript
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ShopeeStatus } from "@/lib/settings/types"

interface Props {
  status: ShopeeStatus
}

export function ShopeeStatusCard({ status }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🛍️ Koneksi Shopee</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${status.connected ? "bg-green-500" : "bg-red-500"}`}
          />
          <span className="text-sm font-medium">
            {status.connected ? "Terhubung" : "Tidak Terhubung"}
          </span>
        </div>
        {status.shopId && (
          <div className="text-xs text-gray-500">Shop ID: {status.shopId}</div>
        )}
        {status.tokenUpdatedAt && (
          <div className="text-xs text-gray-500">
            Token terakhir diperbarui:{" "}
            {new Date(status.tokenUpdatedAt).toLocaleString("id-ID")}
          </div>
        )}
        <a
          href="/api/shopee/auth"
          className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-[#EE4D2D] hover:bg-[#d44226] text-white text-sm font-medium"
        >
          {status.connected ? "Hubungkan Ulang" : "Hubungkan Shopee"}
        </a>
      </CardContent>
    </Card>
  )
}
```

### Step 2: NotificationConfigCard

Create `components/settings/NotificationConfigCard.tsx`:

```typescript
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { NotificationConfig } from "@/lib/settings/types"
import {
  useUpdateSettings,
  useTestNotification,
} from "@/lib/hooks/use-settings"

interface Props {
  config: NotificationConfig
}

export function NotificationConfigCard({ config }: Props) {
  const [trackedConfig, setTrackedConfig] = useState(config)
  const [form, setForm] = useState({
    telegramBotToken: config.telegramBotToken ?? "",
    telegramChatId: config.telegramChatId ?? "",
    pushoverUserKey: config.pushoverUserKey ?? "",
    pushoverAppToken: config.pushoverAppToken ?? "",
  })
  const [feedback, setFeedback] = useState<string | null>(null)

  // Reset form when upstream config changes (e.g., after save)
  if (config !== trackedConfig) {
    setTrackedConfig(config)
    setForm({
      telegramBotToken: config.telegramBotToken ?? "",
      telegramChatId: config.telegramChatId ?? "",
      pushoverUserKey: config.pushoverUserKey ?? "",
      pushoverAppToken: config.pushoverAppToken ?? "",
    })
  }

  const update = useUpdateSettings()
  const test = useTestNotification()

  function handleSave() {
    setFeedback(null)
    update.mutate(
      {
        notification: {
          telegramBotToken: form.telegramBotToken || null,
          telegramChatId: form.telegramChatId || null,
          pushoverUserKey: form.pushoverUserKey || null,
          pushoverAppToken: form.pushoverAppToken || null,
        },
      },
      {
        onSuccess: () => setFeedback("✅ Config tersimpan"),
        onError: (err) => setFeedback(`❌ ${err.message}`),
      },
    )
  }

  function handleTestTelegram() {
    setFeedback(null)
    test.mutate(
      {
        channel: "telegram",
        telegramBotToken: form.telegramBotToken,
        telegramChatId: form.telegramChatId,
      },
      {
        onSuccess: (result) => {
          setFeedback(
            result.ok ? "✅ Telegram test berhasil" : `❌ ${result.error}`,
          )
        },
      },
    )
  }

  function handleTestPushover() {
    setFeedback(null)
    test.mutate(
      {
        channel: "pushover",
        pushoverUserKey: form.pushoverUserKey,
        pushoverAppToken: form.pushoverAppToken,
      },
      {
        onSuccess: (result) => {
          setFeedback(
            result.ok ? "✅ Pushover test berhasil" : `❌ ${result.error}`,
          )
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
          <div className="text-sm font-semibold">Telegram Bot</div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-token">Bot Token</Label>
            <Input
              id="tg-token"
              type="password"
              value={form.telegramBotToken}
              onChange={(e) =>
                setForm({ ...form, telegramBotToken: e.target.value })
              }
              placeholder="123456:ABC-DEF..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-chat">Chat / Group ID</Label>
            <Input
              id="tg-chat"
              value={form.telegramChatId}
              onChange={(e) =>
                setForm({ ...form, telegramChatId: e.target.value })
              }
              placeholder="-100123456"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestTelegram}
            disabled={
              test.isPending ||
              !form.telegramBotToken ||
              !form.telegramChatId
            }
          >
            Test Telegram
          </Button>
        </div>

        {/* Pushover */}
        <div className="space-y-3 pt-3 border-t">
          <div className="text-sm font-semibold">Pushover</div>
          <div className="space-y-1.5">
            <Label htmlFor="po-user">User Key</Label>
            <Input
              id="po-user"
              type="password"
              value={form.pushoverUserKey}
              onChange={(e) =>
                setForm({ ...form, pushoverUserKey: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-token">App Token</Label>
            <Input
              id="po-token"
              type="password"
              value={form.pushoverAppToken}
              onChange={(e) =>
                setForm({ ...form, pushoverAppToken: e.target.value })
              }
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestPushover}
            disabled={
              test.isPending ||
              !form.pushoverUserKey ||
              !form.pushoverAppToken
            }
          >
            Test Pushover
          </Button>
        </div>

        {feedback && <div className="text-xs">{feedback}</div>}

        <div className="pt-3 border-t">
          <Button
            onClick={handleSave}
            disabled={update.isPending}
            className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
          >
            {update.isPending ? "Menyimpan..." : "Simpan Config"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

### Step 3: AlertThresholdCard

Create `components/settings/AlertThresholdCard.tsx`:

```typescript
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { AlertThresholds } from "@/lib/settings/types"
import { useUpdateSettings } from "@/lib/hooks/use-settings"

interface Props {
  thresholds: AlertThresholds
}

export function AlertThresholdCard({ thresholds }: Props) {
  const [tracked, setTracked] = useState(thresholds)
  const [form, setForm] = useState({
    stockMin: String(thresholds.stockMin),
    roasMin: String(thresholds.roasMin),
    orderPileupCount: String(thresholds.orderPileupCount),
    orderPileupHours: String(thresholds.orderPileupHours),
  })
  const [feedback, setFeedback] = useState<string | null>(null)

  if (thresholds !== tracked) {
    setTracked(thresholds)
    setForm({
      stockMin: String(thresholds.stockMin),
      roasMin: String(thresholds.roasMin),
      orderPileupCount: String(thresholds.orderPileupCount),
      orderPileupHours: String(thresholds.orderPileupHours),
    })
  }

  const update = useUpdateSettings()

  function handleSave() {
    setFeedback(null)
    const parsed = {
      stockMin: Number(form.stockMin),
      roasMin: Number(form.roasMin),
      orderPileupCount: Number(form.orderPileupCount),
      orderPileupHours: Number(form.orderPileupHours),
    }
    if (
      Object.values(parsed).some((v) => Number.isNaN(v) || v < 0)
    ) {
      setFeedback("❌ Semua nilai harus angka positif")
      return
    }
    update.mutate(
      { thresholds: parsed },
      {
        onSuccess: () => setFeedback("✅ Threshold tersimpan"),
        onError: (err) => setFeedback(`❌ ${err.message}`),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">⚠️ Alert Threshold</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="stock-min">Stok Minimum (pcs)</Label>
            <Input
              id="stock-min"
              type="number"
              value={form.stockMin}
              onChange={(e) => setForm({ ...form, stockMin: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="roas-min">ROAS Minimum (x)</Label>
            <Input
              id="roas-min"
              type="number"
              step="0.1"
              value={form.roasMin}
              onChange={(e) => setForm({ ...form, roasMin: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-count">Order Numpuk (count)</Label>
            <Input
              id="order-count"
              type="number"
              value={form.orderPileupCount}
              onChange={(e) =>
                setForm({ ...form, orderPileupCount: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-hours">Setelah (jam)</Label>
            <Input
              id="order-hours"
              type="number"
              value={form.orderPileupHours}
              onChange={(e) =>
                setForm({ ...form, orderPileupHours: e.target.value })
              }
            />
          </div>
        </div>
        {feedback && <div className="text-xs">{feedback}</div>}
        <Button
          onClick={handleSave}
          disabled={update.isPending}
          className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
        >
          {update.isPending ? "Menyimpan..." : "Simpan Threshold"}
        </Button>
      </CardContent>
    </Card>
  )
}
```

### Step 4: RefreshIntervalCard

Create `components/settings/RefreshIntervalCard.tsx`:

```typescript
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRefreshConfig } from "@/lib/use-refresh-config"

export function RefreshIntervalCard() {
  const { intervalMs, updateInterval, options } = useRefreshConfig()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🔄 Auto Refresh</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Interval polling data Shopee API. Simpan per-browser (localStorage).
        </p>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const isActive = intervalMs === opt.value
            return (
              <Button
                key={opt.value}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => updateInterval(opt.value)}
                className={
                  isActive
                    ? "bg-[#EE4D2D] hover:bg-[#d44226] text-white"
                    : ""
                }
              >
                {opt.label}
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
```

### Step 5: UserFormModal

Create `components/settings/UserFormModal.tsx`:

```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface UserFormData {
  email: string
  name: string
  password: string
  role: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (data: UserFormData) => void
  isPending: boolean
  error: string | null
}

const ROLES = [
  { value: "ADMIN", label: "Admin (akses Order & Stok)" },
  { value: "TEST_USER", label: "Test User (read-only, untuk Shopee review)" },
]

export function UserFormModal({
  open,
  onClose,
  onSubmit,
  isPending,
  error,
}: Props) {
  const [form, setForm] = useState<UserFormData>({
    email: "",
    name: "",
    password: "",
    role: "ADMIN",
  })

  if (!open) return null

  function handleSubmit() {
    onSubmit(form)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-5 border-b">
          <h2 className="font-semibold">Tambah User Baru</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Nama</Label>
            <Input
              id="new-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Password (min 8 karakter)</Label>
            <Input
              id="new-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-role">Role</Label>
            <select
              id="new-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full h-9 px-3 rounded-md border border-input bg-transparent text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {error && <div className="text-xs text-red-500">{error}</div>}
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
          >
            {isPending ? "Menyimpan..." : "Buat User"}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

### Step 6: UserManagementCard

Create `components/settings/UserManagementCard.tsx`:

```typescript
"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  useUsers,
  useCreateUser,
  useDeleteUser,
  useUpdateUserRole,
  useResetPassword,
} from "@/lib/hooks/use-users"
import { UserFormModal, type UserFormData } from "./UserFormModal"

const ROLE_COLOR: Record<string, string> = {
  OWNER: "bg-purple-100 text-purple-800",
  ADMIN: "bg-blue-100 text-blue-800",
  TEST_USER: "bg-gray-100 text-gray-700",
}

export function UserManagementCard() {
  const { data: session } = useSession()
  const { data, isLoading } = useUsers()
  const createUser = useCreateUser()
  const deleteUser = useDeleteUser()
  const updateRole = useUpdateUserRole()
  const resetPw = useResetPassword()
  const [showModal, setShowModal] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  function handleCreate(form: UserFormData) {
    setCreateError(null)
    createUser.mutate(form, {
      onSuccess: () => {
        setShowModal(false)
      },
      onError: (err) => setCreateError(err.message),
    })
  }

  function handleDelete(userId: string, email: string) {
    if (!confirm(`Hapus user ${email}?`)) return
    deleteUser.mutate(userId)
  }

  function handleResetPassword(userId: string, email: string) {
    const newPw = prompt(`Password baru untuk ${email} (min 8 karakter):`)
    if (!newPw) return
    resetPw.mutate(
      { userId, password: newPw },
      {
        onSuccess: () => alert("✅ Password berhasil di-reset"),
        onError: (err) => alert(`❌ ${err.message}`),
      },
    )
  }

  function handleRoleChange(userId: string, role: string) {
    updateRole.mutate({ userId, role })
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">👥 Manajemen User</CardTitle>
          <Button
            size="sm"
            onClick={() => {
              setCreateError(null)
              setShowModal(true)
            }}
            className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
          >
            + Tambah User
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="text-sm text-gray-400">Memuat user...</div>
          )}
          {data && (
            <div className="space-y-2">
              {data.users.map((u) => {
                const isSelf = session?.user?.id === u.id
                return (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {u.name}
                        </span>
                        <Badge className={ROLE_COLOR[u.role] ?? ""}>
                          {u.role}
                        </Badge>
                        {isSelf && (
                          <span className="text-xs text-gray-400">(kamu)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </div>
                    <div className="flex gap-1">
                      {!isSelf && (
                        <select
                          value={u.role}
                          onChange={(e) =>
                            handleRoleChange(u.id, e.target.value)
                          }
                          className="h-8 px-2 rounded border border-input bg-transparent text-xs"
                        >
                          <option value="OWNER">OWNER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="TEST_USER">TEST_USER</option>
                        </select>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleResetPassword(u.id, u.email)}
                      >
                        Reset PW
                      </Button>
                      {!isSelf && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(u.id, u.email)}
                          disabled={deleteUser.isPending}
                        >
                          Hapus
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <UserFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreate}
        isPending={createUser.isPending}
        error={createError}
      />
    </>
  )
}
```

- [ ] **Step 7: Verify build & commit**

```bash
npm run build 2>&1 | tail -15
git add components/settings/
git commit -m "feat(settings): add Shopee status, notification, threshold, user management cards"
```

---

## Task 7: Settings Page

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Replace placeholder**

```typescript
"use client"

import { ShopeeStatusCard } from "@/components/settings/ShopeeStatusCard"
import { NotificationConfigCard } from "@/components/settings/NotificationConfigCard"
import { AlertThresholdCard } from "@/components/settings/AlertThresholdCard"
import { RefreshIntervalCard } from "@/components/settings/RefreshIntervalCard"
import { UserManagementCard } from "@/components/settings/UserManagementCard"
import { useSettings } from "@/lib/hooks/use-settings"
import { Button } from "@/components/ui/button"

export default function SettingsPage() {
  const { data, isLoading, isError, error, refetch } = useSettings()

  if (isLoading && !data) {
    return (
      <div className="py-12 text-center text-gray-400">Memuat settings...</div>
    )
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    return (
      <div className="py-12 text-center space-y-3">
        <div className="text-red-500">{msg}</div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ShopeeStatusCard status={data.shopee} />
        <RefreshIntervalCard />
      </div>

      <NotificationConfigCard config={data.notification} />

      <AlertThresholdCard thresholds={data.thresholds} />

      <UserManagementCard />
    </div>
  )
}
```

- [ ] **Step 2: Verify build & commit**

```bash
npm run build 2>&1 | tail -15
git add "app/(dashboard)/settings/page.tsx"
git commit -m "feat(settings): add real Settings tab page"
```

---

## Task 8: End-to-End Verification

- [ ] **Step 1: Build + lint clean**

```bash
npm run build 2>&1 | tail -20
npm run lint 2>&1 | tail -10
```

- [ ] **Step 2: Unauthenticated tests**

```bash
npm run start > /tmp/shopee-dash.log 2>&1 &
SERVER_PID=$!
sleep 6

echo "=== Unauth tests ==="
curl -s -o /dev/null -w "/api/settings: %{http_code}\n" http://localhost:3000/api/settings
curl -s -X PATCH -o /dev/null -w "/api/settings PATCH: %{http_code}\n" http://localhost:3000/api/settings
curl -s -X POST -o /dev/null -w "/api/settings/test-notification: %{http_code}\n" http://localhost:3000/api/settings/test-notification
curl -s -o /dev/null -w "/api/users: %{http_code}\n" http://localhost:3000/api/users
curl -s -X POST -o /dev/null -w "/api/users POST: %{http_code}\n" http://localhost:3000/api/users
curl -s -X DELETE -o /dev/null -w "/api/users/TEST: %{http_code}\n" http://localhost:3000/api/users/TEST
curl -s -o /dev/null -w "/settings: %{http_code}\n" http://localhost:3000/settings

kill $SERVER_PID 2>/dev/null
wait 2>/dev/null
```

Expected: semua API endpoint 403 (Forbidden, not 401 — karena bukan hanya tidak login tapi juga butuh OWNER). `/settings` page 307.

- [ ] **Step 3: Manual test**

Login Owner, buka tab **Settings**:

1. **Shopee Status** — tampil "Terhubung" kalau sudah auth, ada tombol "Hubungkan Ulang"
2. **Refresh Interval** — pilih 3 menit (default), bisa di-switch ke 1/5/10 menit/manual
3. **Notifikasi**:
   - Input bot token Telegram + chat ID kamu → klik "Test Telegram" → cek HP, pesan test masuk
   - Input Pushover user key + app token → klik "Test Pushover" → cek notif
   - Klik "Simpan Config"
4. **Alert Threshold** — ubah angka, klik simpan, verify tersimpan dengan refresh halaman
5. **Manajemen User**:
   - Klik "+ Tambah User" → buat Admin user
   - Login ulang sebagai user baru → harus bisa akses Order dan Produk saja
   - Kembali sebagai Owner → reset password user yang baru dibuat
   - Coba hapus Owner utama → harus ditolak dengan error "tidak bisa hapus owner terakhir"
6. Coba login sebagai Admin → tab Settings tidak muncul di nav bar

---

## What's NOT in this plan

- **Actual notification sending saat trigger** — Plan 7
- **Background job monitoring** — Plan 7
- **Email verification saat buat user** — defer, cukup email+password saja
- **Forgot password flow** — Owner bisa reset password user manual, tidak perlu self-service
- **2FA** — defer
- **Audit log** (siapa update config kapan) — defer
- **Import/export config via JSON** — defer
- **Shopee re-authorize tanpa leave dashboard** — menunggu fix OAuth popup flow
