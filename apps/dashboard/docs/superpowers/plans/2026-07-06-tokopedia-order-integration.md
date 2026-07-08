# Tokopedia Order Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Tokopedia Seller Center orders (cookie-session backend) into the dashboard — a "Tokopedia" Order channel + a Settings session card — plus read-only bot endpoints, with all parsing in one place.

**Architecture:** A single `lib/tokopedia/` service layer manages the session (stored in the `Config` table), makes authenticated requests, and returns raw Tokopedia data. Dashboard routes parse that raw data into a typed summary server-side (one parser, `parse.ts`); bot routes return it raw. The dashboard owns the session; the bot only consumes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7 (Config table), Vitest.

## Global Constraints

- DRY: parsing raw→summary lives ONLY in `lib/tokopedia/parse.ts`; `tokopediaRequest` is the ONLY place that builds the cookie string + headers and detects `code 10000`. Dashboard and bot both go through the service — never re-implement request/parse logic in a route.
- Cookie values are NEVER returned to any client — session GET returns only metadata.
- Dashboard routes are session-gated via `auth()`. Bot routes use `requireBotToken(req)` from `lib/bot/auth.ts` → 401 if false.
- Bot routes are READ-ONLY and never touch the session.
- `code 10000` from Tokopedia → `SESSION_INVALID` (ambiguous expired-vs-IP; do not pretend to distinguish).
- Node 22 runtime — if `npx vitest`/`npx tsc` errors "Unexpected token ?", run `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22` first. Tests via Vitest.
- This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before using unfamiliar route APIs.

## File Structure

- `lib/tokopedia/types.ts` — `TokopediaError`, `SessionMeta`, `TokopediaOrderSummary`, raw-shape helper types.
- `lib/tokopedia/session.ts` — `decodeJwtExp`, `saveSession`, `getSessionStatus`, `getRawSession` (Config-backed).
- `lib/tokopedia/client.ts` — `tokopediaRequest` (the one place doing cookies/headers/code-10000).
- `lib/tokopedia/orders.ts` — `listOrders`, `getOrderById` (raw).
- `lib/tokopedia/parse.ts` — `SKU_DISPLAY_STATUS`, `parseOrder` (dashboard-only).
- `app/api/tokopedia/session/route.ts` (POST+GET), `app/api/tokopedia/session/test/route.ts` (POST), `app/api/tokopedia/orders/route.ts` (GET), `app/api/tokopedia/orders/[id]/route.ts` (GET) — dashboard.
- `app/api/bot/tokopedia/orders/route.ts` (GET), `app/api/bot/tokopedia/orders/[id]/route.ts` (GET) — bot.
- `lib/hooks/use-tokopedia.ts` — React Query hooks.
- `components/settings/TokopediaSessionCard.tsx` + render in Settings page.
- `components/order/OrderSidebar.tsx` (+ `tokopedia` channel), `app/(dashboard)/order/page.tsx` (+ `TokopediaOrderView`).
- `docs/bot-api.md` (+ Tokopedia bot endpoints).

---

## Task 1: Types + JWT decode + session storage

**Files:**
- Create: `lib/tokopedia/types.ts`, `lib/tokopedia/session.ts`
- Test: `lib/tokopedia/__tests__/session.test.ts`

**Interfaces:**
- Produces (types.ts):
  - `type TokopediaErrorCode = "SESSION_MISSING" | "SESSION_INVALID" | "SESSION_EXPIRED" | "NOT_FOUND" | "UNKNOWN"`
  - `class TokopediaError extends Error { code: TokopediaErrorCode; constructor(code, message?) }`
  - `interface SessionMeta { sellerId: string; appId: string; updatedAt: string; tokenExpiry: string | null }`
  - `interface StoredSession { cookies: Record<string,string>; sellerId: string; appId: string; userAgent: string | null; updatedAt: string; tokenExpiry: string | null }`
  - `interface TokopediaOrderSummary { orderId: string; statusCode: number | null; statusLabel: string; products: { name: string; variant: string; qty: number; totalPrice: number }[]; courier: string | null; serviceType: string | null; trackingNo: string | null; latestLogistic: { msg: string; timestamp: number } | null; grandTotal: number; subTotal: number; buyerNickname: string | null; latestRtsTime: number | null; note: string | null }`
- Produces (session.ts): `decodeJwtExp(token: string): number | null`; `saveSession(cookies: {name:string;value:string}[]): Promise<SessionMeta>`; `getSessionStatus(): Promise<{exists:boolean; sellerId?:string; updatedAt?:string; tokenExpiry?:string|null; expired?:boolean}>`; `getRawSession(): Promise<StoredSession | null>`.

- [ ] **Step 1: Write the failing test**

Create `lib/tokopedia/__tests__/session.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({ prisma: { config: { findUnique: vi.fn(), upsert: vi.fn() } } }))

import { prisma } from "@/lib/db"
import { decodeJwtExp, saveSession, getSessionStatus, getRawSession } from "@/lib/tokopedia/session"
import { TokopediaError } from "@/lib/tokopedia/types"

const mock = prisma as any

// A JWT with payload { "exp": 1783248893 } (base64url of the payload segment)
function jwtWithExp(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url")
  return `header.${payload}.sig`
}

function cookieArr(over: Record<string,string> = {}) {
  const base: Record<string,string> = {
    SELLER_TOKEN: jwtWithExp(1783248893),
    oec_seller_id_unified_seller_env: "7496108703209719955",
    app_id_unified_seller_env: "4068",
    sessionid: "abc",
    ...over,
  }
  return Object.entries(base).map(([name, value]) => ({ name, value }))
}

describe("decodeJwtExp", () => {
  it("returns exp seconds from a JWT payload", () => {
    expect(decodeJwtExp(jwtWithExp(1783248893))).toBe(1783248893)
  })
  it("returns null for a malformed token", () => {
    expect(decodeJwtExp("not-a-jwt")).toBeNull()
    expect(decodeJwtExp("a.b")).toBeNull()
  })
})

describe("saveSession", () => {
  beforeEach(() => vi.clearAllMocks())

  it("extracts sellerId/appId/expiry and upserts the config row", async () => {
    mock.config.upsert.mockResolvedValue({})
    const meta = await saveSession(cookieArr())
    expect(meta.sellerId).toBe("7496108703209719955")
    expect(meta.appId).toBe("4068")
    expect(meta.tokenExpiry).toBe(new Date(1783248893 * 1000).toISOString())
    const arg = mock.config.upsert.mock.calls[0][0]
    expect(arg.where.key).toBe("tokopedia.session")
    const stored = JSON.parse(arg.create.value)
    expect(stored.cookies.SELLER_TOKEN).toBeTruthy()
    expect(stored.cookies.sessionid).toBe("abc")
    expect(stored.sellerId).toBe("7496108703209719955")
  })

  it("throws when SELLER_TOKEN is missing", async () => {
    const arr = cookieArr().filter(c => c.name !== "SELLER_TOKEN")
    await expect(saveSession(arr)).rejects.toThrow(TokopediaError)
  })

  it("throws when the seller-id cookie is missing", async () => {
    const arr = cookieArr().filter(c => c.name !== "oec_seller_id_unified_seller_env")
    await expect(saveSession(arr)).rejects.toThrow(TokopediaError)
  })
})

describe("getSessionStatus", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns exists:false when no row", async () => {
    mock.config.findUnique.mockResolvedValue(null)
    expect(await getSessionStatus()).toEqual({ exists: false })
  })

  it("returns metadata and expired:false for a future expiry", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600
    mock.config.findUnique.mockResolvedValue({ value: JSON.stringify({
      cookies: {}, sellerId: "S1", appId: "4068", userAgent: null,
      updatedAt: "2026-07-06T00:00:00.000Z", tokenExpiry: new Date(future*1000).toISOString(),
    }) })
    const s = await getSessionStatus()
    expect(s.exists).toBe(true)
    expect(s.sellerId).toBe("S1")
    expect(s.expired).toBe(false)
  })

  it("returns expired:true for a past expiry", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600
    mock.config.findUnique.mockResolvedValue({ value: JSON.stringify({
      cookies: {}, sellerId: "S1", appId: "4068", userAgent: null,
      updatedAt: "2026-07-06T00:00:00.000Z", tokenExpiry: new Date(past*1000).toISOString(),
    }) })
    expect((await getSessionStatus()).expired).toBe(true)
  })
})

describe("getRawSession", () => {
  beforeEach(() => vi.clearAllMocks())
  it("returns null when no row", async () => {
    mock.config.findUnique.mockResolvedValue(null)
    expect(await getRawSession()).toBeNull()
  })
  it("parses and returns the stored session", async () => {
    mock.config.findUnique.mockResolvedValue({ value: JSON.stringify({
      cookies: { a: "1" }, sellerId: "S1", appId: "4068", userAgent: "UA",
      updatedAt: "x", tokenExpiry: null,
    }) })
    const s = await getRawSession()
    expect(s?.cookies.a).toBe("1")
    expect(s?.userAgent).toBe("UA")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tokopedia/__tests__/session.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement types.ts**

Create `lib/tokopedia/types.ts`:

```typescript
export type TokopediaErrorCode =
  | "SESSION_MISSING" | "SESSION_INVALID" | "SESSION_EXPIRED" | "NOT_FOUND" | "UNKNOWN"

export class TokopediaError extends Error {
  code: TokopediaErrorCode
  constructor(code: TokopediaErrorCode, message?: string) {
    super(message ?? code)
    this.code = code
    this.name = "TokopediaError"
  }
}

export interface SessionMeta {
  sellerId: string
  appId: string
  updatedAt: string
  tokenExpiry: string | null
}

export interface StoredSession {
  cookies: Record<string, string>
  sellerId: string
  appId: string
  userAgent: string | null
  updatedAt: string
  tokenExpiry: string | null
}

export interface TokopediaOrderSummary {
  orderId: string
  statusCode: number | null
  statusLabel: string
  products: { name: string; variant: string; qty: number; totalPrice: number }[]
  courier: string | null
  serviceType: string | null
  trackingNo: string | null
  latestLogistic: { msg: string; timestamp: number } | null
  grandTotal: number
  subTotal: number
  buyerNickname: string | null
  latestRtsTime: number | null
  note: string | null
}
```

- [ ] **Step 4: Implement session.ts**

Create `lib/tokopedia/session.ts`:

```typescript
import { prisma } from "@/lib/db"
import { TokopediaError, type SessionMeta, type StoredSession } from "./types"

const CONFIG_KEY = "tokopedia.session"

export function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))
    return typeof payload.exp === "number" ? payload.exp : null
  } catch {
    return null
  }
}

export async function saveSession(cookies: { name: string; value: string }[]): Promise<SessionMeta> {
  const flat: Record<string, string> = {}
  for (const c of cookies) if (c?.name) flat[c.name] = c.value

  const sellerToken = flat["SELLER_TOKEN"]
  const sellerId = flat["oec_seller_id_unified_seller_env"]
  const appId = flat["app_id_unified_seller_env"] ?? "4068"
  if (!sellerToken) throw new TokopediaError("UNKNOWN", "SELLER_TOKEN cookie tidak ditemukan")
  if (!sellerId) throw new TokopediaError("UNKNOWN", "Cookie seller id (oec_seller_id_unified_seller_env) tidak ditemukan")

  const exp = decodeJwtExp(sellerToken)
  const tokenExpiry = exp != null ? new Date(exp * 1000).toISOString() : null
  const updatedAt = new Date().toISOString()

  const stored: StoredSession = { cookies: flat, sellerId, appId, userAgent: flat["_user_agent"] ?? null, updatedAt, tokenExpiry }
  const value = JSON.stringify(stored)
  await prisma.config.upsert({
    where: { key: CONFIG_KEY },
    update: { value },
    create: { key: CONFIG_KEY, value },
  })
  return { sellerId, appId, updatedAt, tokenExpiry }
}

export async function getRawSession(): Promise<StoredSession | null> {
  const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as StoredSession
  } catch {
    return null
  }
}

export async function getSessionStatus(): Promise<{
  exists: boolean; sellerId?: string; updatedAt?: string; tokenExpiry?: string | null; expired?: boolean
}> {
  const s = await getRawSession()
  if (!s) return { exists: false }
  const expired = s.tokenExpiry != null && new Date(s.tokenExpiry).getTime() < Date.now()
  return { exists: true, sellerId: s.sellerId, updatedAt: s.updatedAt, tokenExpiry: s.tokenExpiry, expired }
}
```

Note: `_user_agent` is an optional synthetic cookie key the Settings UI can inject if it captures the browser UA; absent in normal exports (→ null), which the client falls back to a default UA for.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/tokopedia/__tests__/session.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/tokopedia/types.ts lib/tokopedia/session.ts lib/tokopedia/__tests__/session.test.ts
git commit -m "feat(tokopedia): session storage (Config-backed) + JWT expiry decode"
```

---

## Task 2: Authenticated request client

**Files:**
- Create: `lib/tokopedia/client.ts`
- Test: `lib/tokopedia/__tests__/client.test.ts`

**Interfaces:**
- Consumes: `getRawSession` (Task 1), `TokopediaError` (Task 1).
- Produces: `tokopediaRequest<T = unknown>(body: object): Promise<T>` — returns `json.data`; throws `TokopediaError("SESSION_MISSING")` if no session, `TokopediaError("SESSION_INVALID")` on `code === 10000`, `TokopediaError("UNKNOWN", msg)` on other non-zero codes.

- [ ] **Step 1: Write the failing test**

Create `lib/tokopedia/__tests__/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("@/lib/tokopedia/session", () => ({ getRawSession: vi.fn() }))

import { tokopediaRequest } from "@/lib/tokopedia/client"
import { getRawSession } from "@/lib/tokopedia/session"
import { TokopediaError } from "@/lib/tokopedia/types"

const mockSession = getRawSession as any

const SESSION = {
  cookies: { SELLER_TOKEN: "jwt", sessionid: "sid", msToken: "mt" },
  sellerId: "S1", appId: "4068", userAgent: null, updatedAt: "x", tokenExpiry: null,
}

describe("tokopediaRequest", () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it("throws SESSION_MISSING when no session", async () => {
    mockSession.mockResolvedValue(null)
    await expect(tokopediaRequest({})).rejects.toMatchObject({ code: "SESSION_MISSING" })
  })

  it("sends cookies + seller id in the URL and returns data on code 0", async () => {
    mockSession.mockResolvedValue(SESSION)
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ code: 0, data: { total_count: 1, main_orders: [] } }),
    } as any)
    const data = await tokopediaRequest({ count: 1 })
    expect(data).toEqual({ total_count: 1, main_orders: [] })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain("oec_seller_id=S1")
    expect(String(url)).toContain("aid=4068")
    expect((init as any).headers.cookie).toContain("SELLER_TOKEN=jwt")
    expect((init as any).headers.cookie).toContain("msToken=mt")
    expect((init as any).method).toBe("POST")
  })

  it("throws SESSION_INVALID on code 10000", async () => {
    mockSession.mockResolvedValue(SESSION)
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ code: 10000, message: "session invalid" }),
    } as any)
    await expect(tokopediaRequest({})).rejects.toMatchObject({ code: "SESSION_INVALID" })
  })

  it("throws UNKNOWN on other non-zero codes", async () => {
    mockSession.mockResolvedValue(SESSION)
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, json: async () => ({ code: 500, message: "boom" }),
    } as any)
    await expect(tokopediaRequest({})).rejects.toMatchObject({ code: "UNKNOWN" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tokopedia/__tests__/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/tokopedia/client.ts`:

```typescript
import { getRawSession } from "./session"
import { TokopediaError } from "./types"

const BASE = "https://seller-id.tokopedia.com/api/fulfillment/order/list"
const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"

export async function tokopediaRequest<T = unknown>(body: object): Promise<T> {
  const session = await getRawSession()
  if (!session) throw new TokopediaError("SESSION_MISSING")

  const cookieString = Object.entries(session.cookies)
    .filter(([name]) => name !== "_user_agent")
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")

  const url = `${BASE}?aid=${session.appId}&locale=id-ID&oec_seller_id=${session.sellerId}&seller_id=${session.sellerId}`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9,id;q=0.8",
      "content-type": "application/json",
      origin: "https://seller-id.tokopedia.com",
      referer: "https://seller-id.tokopedia.com/order",
      "user-agent": session.userAgent ?? DEFAULT_UA,
      cookie: cookieString,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new TokopediaError("UNKNOWN", `HTTP ${res.status}`)
  const json = await res.json() as { code: number; message?: string; data?: T }
  if (json.code === 10000) throw new TokopediaError("SESSION_INVALID", json.message ?? "session invalid / IP mismatch")
  if (json.code !== 0) throw new TokopediaError("UNKNOWN", json.message ?? `Tokopedia code ${json.code}`)
  return json.data as T
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tokopedia/__tests__/client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tokopedia/client.ts lib/tokopedia/__tests__/client.test.ts
git commit -m "feat(tokopedia): authenticated request client with code-10000 handling"
```

---

## Task 3: Orders service (raw list + get-by-id)

**Files:**
- Create: `lib/tokopedia/orders.ts`
- Test: `lib/tokopedia/__tests__/orders.test.ts`

**Interfaces:**
- Consumes: `tokopediaRequest` (Task 2).
- Produces: `TokopediaRawData` = `{ total_count: number; main_orders: TokopediaRawOrder[] }` (exported from orders.ts); `TokopediaRawOrder = Record<string, unknown>`; `listOrders(tab: "perlu-dikirim" | "semua", opts?: { count?: number; offset?: number }): Promise<TokopediaRawData>`; `getOrderById(id: string): Promise<TokopediaRawOrder | null>`.

- [ ] **Step 1: Write the failing test**

Create `lib/tokopedia/__tests__/orders.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/tokopedia/client", () => ({ tokopediaRequest: vi.fn() }))

import { listOrders, getOrderById } from "@/lib/tokopedia/orders"
import { tokopediaRequest } from "@/lib/tokopedia/client"

const mockReq = tokopediaRequest as any

describe("listOrders", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sends the perlu-dikirim filter", async () => {
    mockReq.mockResolvedValue({ total_count: 0, main_orders: [] })
    await listOrders("perlu-dikirim")
    const body = mockReq.mock.calls[0][0]
    expect(body.search_condition.condition_list.order_status.value).toEqual(["1"])
    expect(body.search_condition.condition_list.search_tab.value).toEqual(["101"])
    expect(body.count).toBe(20)
  })

  it("omits the status filter for the semua tab", async () => {
    mockReq.mockResolvedValue({ total_count: 0, main_orders: [] })
    await listOrders("semua")
    const body = mockReq.mock.calls[0][0]
    expect(body.search_condition.condition_list.order_status).toBeUndefined()
  })

  it("honors count/offset overrides", async () => {
    mockReq.mockResolvedValue({ total_count: 0, main_orders: [] })
    await listOrders("perlu-dikirim", { count: 5, offset: 40 })
    const body = mockReq.mock.calls[0][0]
    expect(body.count).toBe(5)
    expect(body.offset).toBe(40)
  })
})

describe("getOrderById", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sends the main_order_id filter and returns the first order", async () => {
    mockReq.mockResolvedValue({ total_count: 1, main_orders: [{ main_order_id: "X" }] })
    const order = await getOrderById("X")
    const body = mockReq.mock.calls[0][0]
    expect(body.search_condition.condition_list.main_order_id.value).toEqual(["X"])
    expect(order).toEqual({ main_order_id: "X" })
  })

  it("returns null when no order matches", async () => {
    mockReq.mockResolvedValue({ total_count: 0, main_orders: [] })
    expect(await getOrderById("X")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tokopedia/__tests__/orders.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/tokopedia/orders.ts`:

```typescript
import { tokopediaRequest } from "./client"

export type TokopediaRawOrder = Record<string, unknown>
export interface TokopediaRawData {
  total_count: number
  main_orders: TokopediaRawOrder[]
}

export async function listOrders(
  tab: "perlu-dikirim" | "semua",
  opts: { count?: number; offset?: number } = {},
): Promise<TokopediaRawData> {
  const condition_list: Record<string, unknown> =
    tab === "perlu-dikirim"
      ? { order_status: { value: ["1"] }, search_tab: { value: ["101"] } }
      : {}
  const body = {
    count: opts.count ?? 20,
    offset: opts.offset ?? 0,
    pagination_type: 0,
    sort_info: "11",
    search_condition: { condition_list },
    search_cursor: "",
  }
  return tokopediaRequest<TokopediaRawData>(body)
}

export async function getOrderById(id: string): Promise<TokopediaRawOrder | null> {
  const body = {
    count: 1,
    offset: 0,
    pagination_type: 0,
    sort_info: "11",
    search_condition: { condition_list: { main_order_id: { value: [id] } } },
    search_cursor: "",
  }
  const data = await tokopediaRequest<TokopediaRawData>(body)
  return data.main_orders[0] ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tokopedia/__tests__/orders.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tokopedia/orders.ts lib/tokopedia/__tests__/orders.test.ts
git commit -m "feat(tokopedia): orders service (raw list + get-by-id)"
```

---

## Task 4: Parser (raw → summary, single source of truth)

**Files:**
- Create: `lib/tokopedia/parse.ts`
- Test: `lib/tokopedia/__tests__/parse.test.ts`

**Interfaces:**
- Consumes: `TokopediaRawOrder` (Task 3), `TokopediaOrderSummary` (Task 1).
- Produces: `SKU_DISPLAY_STATUS: Record<number,string>`; `parseOrder(raw: TokopediaRawOrder): TokopediaOrderSummary`.

- [ ] **Step 1: Write the failing test**

Create `lib/tokopedia/__tests__/parse.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { parseOrder } from "@/lib/tokopedia/parse"

const RAW = {
  main_order_id: "584595347055215631",
  trade_order_module: { pay_method: "BCA VA", latest_rts_time: 1783200000, payment_time: 1783100000 },
  order_status_module: [{ sku_display_status: 121, main_order_status: 102 }],
  sku_module: [
    { product_name: "Kaiju No. 8 Mask", sku_name: "No Damage", quantity: 1, sku_total_price: { price_val: "150000" } },
    { product_name: "Stand", sku_name: "", quantity: 2, sku_total_price: { price_val: "50000" } },
  ],
  delivery_module: [{
    tracking_no: "JY1030437471",
    shipment_provider_info: { name: "J&T Express" },
    logistics_service_info: { logistics_service_name: "Reguler" },
  }],
  price_module: { grand_total: { price_val: "556813" }, sub_total: { price_val: "200000" } },
  note_module: { buyer_note: "tolong bungkus rapi" },
  buyer_info_module: { buyer_nickname: "m*******4" },
  logistics_info_module: [{ logistics_detail_item: { display_msg: "Paket tiba di sortir Bandung", timestamp: 1783189245000 } }],
}

describe("parseOrder", () => {
  it("maps the full order to a summary", () => {
    const s = parseOrder(RAW)
    expect(s.orderId).toBe("584595347055215631")
    expect(s.statusCode).toBe(121)
    expect(s.statusLabel).toBe("Dikirim")
    expect(s.products).toEqual([
      { name: "Kaiju No. 8 Mask", variant: "No Damage", qty: 1, totalPrice: 150000 },
      { name: "Stand", variant: "", qty: 2, totalPrice: 50000 },
    ])
    expect(s.courier).toBe("J&T Express")
    expect(s.serviceType).toBe("Reguler")
    expect(s.trackingNo).toBe("JY1030437471")
    expect(s.latestLogistic).toEqual({ msg: "Paket tiba di sortir Bandung", timestamp: 1783189245000 })
    expect(s.grandTotal).toBe(556813)
    expect(s.subTotal).toBe(200000)
    expect(s.buyerNickname).toBe("m*******4")
    expect(s.latestRtsTime).toBe(1783200000)
    expect(s.note).toBe("tolong bungkus rapi")
  })

  it("labels an unknown status code", () => {
    const s = parseOrder({ ...RAW, order_status_module: [{ sku_display_status: 999 }] })
    expect(s.statusCode).toBe(999)
    expect(s.statusLabel).toBe("Tidak diketahui")
  })

  it("handles missing tracking / empty modules gracefully", () => {
    const s = parseOrder({
      main_order_id: "1",
      order_status_module: [],
      sku_module: [],
      delivery_module: [],
      price_module: {},
      logistics_info_module: [],
    })
    expect(s.statusCode).toBeNull()
    expect(s.statusLabel).toBe("Tidak diketahui")
    expect(s.trackingNo).toBeNull()
    expect(s.courier).toBeNull()
    expect(s.latestLogistic).toBeNull()
    expect(s.products).toEqual([])
    expect(s.grandTotal).toBe(0)
    expect(s.buyerNickname).toBeNull()
    expect(s.note).toBeNull()
  })

  it("falls back to last_tracking_no when tracking_no is empty", () => {
    const raw = { ...RAW, delivery_module: [{ tracking_no: "", last_tracking_no: "BACKUP1", shipment_provider_info: { name: "JNE" } }] }
    expect(parseOrder(raw).trackingNo).toBe("BACKUP1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tokopedia/__tests__/parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/tokopedia/parse.ts`:

```typescript
import type { TokopediaRawOrder } from "./orders"
import type { TokopediaOrderSummary } from "./types"

export const SKU_DISPLAY_STATUS: Record<number, string> = {
  110: "Perlu Dikirim",
  120: "Dikirim",
  121: "Dikirim",
  130: "Dikirim",
  140: "Selesai",
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): number {
  if (v == null) return 0
  const n = typeof v === "number" ? v : Number(String(v))
  return Number.isFinite(n) ? n : 0
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function priceVal(mod: any): number {
  return num(mod?.price_val)
}

export function parseOrder(raw: TokopediaRawOrder): TokopediaOrderSummary {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = raw as any
  const statusMod = o.order_status_module?.[0]
  const statusCode: number | null = typeof statusMod?.sku_display_status === "number" ? statusMod.sku_display_status : null
  const statusLabel = statusCode != null ? (SKU_DISPLAY_STATUS[statusCode] ?? "Tidak diketahui") : "Tidak diketahui"

  const delivery = o.delivery_module?.[0]
  const trackingNo = (delivery?.tracking_no || delivery?.last_tracking_no) || null

  const logistic = o.logistics_info_module?.[0]?.logistics_detail_item
  const latestLogistic = logistic?.display_msg
    ? { msg: String(logistic.display_msg), timestamp: num(logistic.timestamp) }
    : null

  return {
    orderId: String(o.main_order_id ?? ""),
    statusCode,
    statusLabel,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    products: Array.isArray(o.sku_module) ? o.sku_module.map((s: any) => ({
      name: String(s.product_name ?? ""),
      variant: String(s.sku_name ?? ""),
      qty: num(s.quantity),
      totalPrice: priceVal(s.sku_total_price),
    })) : [],
    courier: delivery?.shipment_provider_info?.name ?? null,
    serviceType: delivery?.logistics_service_info?.logistics_service_name ?? null,
    trackingNo,
    latestLogistic,
    grandTotal: priceVal(o.price_module?.grand_total),
    subTotal: priceVal(o.price_module?.sub_total),
    buyerNickname: o.buyer_info_module?.buyer_nickname ?? null,
    latestRtsTime: o.trade_order_module?.latest_rts_time != null ? num(o.trade_order_module.latest_rts_time) : null,
    note: o.note_module?.buyer_note || null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tokopedia/__tests__/parse.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/tokopedia/parse.ts lib/tokopedia/__tests__/parse.test.ts
git commit -m "feat(tokopedia): single-source parser raw->summary"
```

---

## Task 5: Dashboard routes (session + orders)

**Files:**
- Create: `app/api/tokopedia/session/route.ts`, `app/api/tokopedia/session/test/route.ts`, `app/api/tokopedia/orders/route.ts`, `app/api/tokopedia/orders/[id]/route.ts`
- Test: `lib/tokopedia/__tests__/dashboard-routes.test.ts`

**Interfaces:**
- Consumes: `auth` (`@/lib/auth`); `saveSession`, `getSessionStatus` (Task 1); `listOrders`, `getOrderById` (Task 3); `parseOrder` (Task 4); `TokopediaError` (Task 1).
- Produces: the 5 dashboard endpoints described in the spec.

- [ ] **Step 1: Write the failing test**

Create `lib/tokopedia/__tests__/dashboard-routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/tokopedia/session", () => ({ saveSession: vi.fn(), getSessionStatus: vi.fn() }))
vi.mock("@/lib/tokopedia/orders", () => ({ listOrders: vi.fn(), getOrderById: vi.fn() }))
vi.mock("@/lib/tokopedia/parse", () => ({ parseOrder: vi.fn((o) => ({ orderId: o.main_order_id })) }))

import { POST as sessionPOST, GET as sessionGET } from "@/app/api/tokopedia/session/route"
import { POST as testPOST } from "@/app/api/tokopedia/session/test/route"
import { GET as ordersGET } from "@/app/api/tokopedia/orders/route"
import { GET as orderGET } from "@/app/api/tokopedia/orders/[id]/route"
import { auth } from "@/lib/auth"
import { saveSession, getSessionStatus } from "@/lib/tokopedia/session"
import { listOrders, getOrderById } from "@/lib/tokopedia/orders"
import { TokopediaError } from "@/lib/tokopedia/types"

const mockAuth = auth as any
const mockSave = saveSession as any
const mockStatus = getSessionStatus as any
const mockList = listOrders as any
const mockById = getOrderById as any
const authed = () => mockAuth.mockResolvedValue({ user: { email: "a@b.c" } })
const reqJson = (body: unknown, url = "http://x/api/tokopedia/orders") =>
  ({ json: async () => body, url } as any)

describe("dashboard tokopedia routes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("session POST 401 without auth", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await sessionPOST(reqJson({ cookies: [] }))
    expect(res.status).toBe(401)
  })

  it("session POST saves and returns meta", async () => {
    authed()
    mockSave.mockResolvedValue({ sellerId: "S1", appId: "4068", updatedAt: "u", tokenExpiry: "e" })
    const res = await sessionPOST(reqJson({ cookies: [{ name: "SELLER_TOKEN", value: "x" }] }))
    expect(res.status).toBe(200)
    expect((await res.json()).sellerId).toBe("S1")
  })

  it("session GET returns status", async () => {
    authed()
    mockStatus.mockResolvedValue({ exists: true, sellerId: "S1", expired: false })
    const res = await sessionGET(reqJson({}))
    expect((await res.json()).sellerId).toBe("S1")
  })

  it("session test returns ok:false with error code on session failure", async () => {
    authed()
    mockList.mockRejectedValue(new TokopediaError("SESSION_INVALID"))
    const res = await testPOST(reqJson({}))
    expect(await res.json()).toEqual({ ok: false, error: "SESSION_INVALID" })
  })

  it("session test returns ok:true on success", async () => {
    authed()
    mockList.mockResolvedValue({ total_count: 0, main_orders: [] })
    const res = await testPOST(reqJson({}))
    expect(await res.json()).toEqual({ ok: true })
  })

  it("orders GET parses and returns summaries", async () => {
    authed()
    mockList.mockResolvedValue({ total_count: 1, main_orders: [{ main_order_id: "O1" }] })
    const res = await ordersGET(reqJson({}, "http://x/api/tokopedia/orders?tab=perlu-dikirim"))
    const body = await res.json()
    expect(body.totalCount).toBe(1)
    expect(body.orders[0].orderId).toBe("O1")
    expect(mockList.mock.calls[0][0]).toBe("perlu-dikirim")
  })

  it("orders GET maps session error to 409", async () => {
    authed()
    mockList.mockRejectedValue(new TokopediaError("SESSION_MISSING"))
    const res = await ordersGET(reqJson({}, "http://x/api/tokopedia/orders?tab=semua"))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe("SESSION_MISSING")
  })

  it("order-by-id 404 when null", async () => {
    authed()
    mockById.mockResolvedValue(null)
    const res = await orderGET(reqJson({}), { params: Promise.resolve({ id: "X" }) })
    expect(res.status).toBe(404)
  })

  it("order-by-id returns the parsed order", async () => {
    authed()
    mockById.mockResolvedValue({ main_order_id: "X" })
    const res = await orderGET(reqJson({}), { params: Promise.resolve({ id: "X" }) })
    expect((await res.json()).orderId).toBe("X")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tokopedia/__tests__/dashboard-routes.test.ts`
Expected: FAIL — routes not found.

- [ ] **Step 3: Implement a shared session-error mapper + the session routes**

Create `app/api/tokopedia/session/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { saveSession, getSessionStatus } from "@/lib/tokopedia/session"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null) as { cookies?: unknown } | null
  if (!body || !Array.isArray(body.cookies)) {
    return NextResponse.json({ error: "cookies harus berupa array dari EditThisCookies" }, { status: 400 })
  }
  try {
    const meta = await saveSession(body.cookies as { name: string; value: string }[])
    return NextResponse.json({ ok: true, ...meta })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan session" }, { status: 400 })
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await getSessionStatus())
}
```

Create `app/api/tokopedia/session/test/route.ts`:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listOrders } from "@/lib/tokopedia/orders"
import { TokopediaError } from "@/lib/tokopedia/types"

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    await listOrders("perlu-dikirim", { count: 1 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const code = err instanceof TokopediaError ? err.code : "UNKNOWN"
    return NextResponse.json({ ok: false, error: code })
  }
}
```

- [ ] **Step 4: Implement the orders routes**

Create `app/api/tokopedia/orders/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { listOrders } from "@/lib/tokopedia/orders"
import { parseOrder } from "@/lib/tokopedia/parse"
import { TokopediaError } from "@/lib/tokopedia/types"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tab = new URL(req.url).searchParams.get("tab") === "semua" ? "semua" : "perlu-dikirim"
  try {
    const data = await listOrders(tab)
    return NextResponse.json({ totalCount: data.total_count, orders: data.main_orders.map(parseOrder) })
  } catch (err) {
    if (err instanceof TokopediaError) return NextResponse.json({ error: err.code }, { status: 409 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status: 500 })
  }
}
```

Create `app/api/tokopedia/orders/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getOrderById } from "@/lib/tokopedia/orders"
import { parseOrder } from "@/lib/tokopedia/parse"
import { TokopediaError } from "@/lib/tokopedia/types"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  try {
    const raw = await getOrderById(id)
    if (!raw) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json(parseOrder(raw))
  } catch (err) {
    if (err instanceof TokopediaError) return NextResponse.json({ error: err.code }, { status: 409 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status: 500 })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/tokopedia/__tests__/dashboard-routes.test.ts`
Expected: PASS (9 tests). Then `npx tsc --noEmit 2>&1 | grep -E "app/api/tokopedia"` → no output.

- [ ] **Step 6: Commit**

```bash
git add app/api/tokopedia lib/tokopedia/__tests__/dashboard-routes.test.ts
git commit -m "feat(tokopedia): dashboard session + orders routes (parsed)"
```

---

## Task 6: Bot routes (raw passthrough)

**Files:**
- Create: `app/api/bot/tokopedia/orders/route.ts`, `app/api/bot/tokopedia/orders/[id]/route.ts`
- Test: `lib/tokopedia/__tests__/bot-routes.test.ts`

**Interfaces:**
- Consumes: `requireBotToken` (`@/lib/bot/auth`); `listOrders`, `getOrderById` (Task 3); `TokopediaError` (Task 1).
- Produces: `GET /api/bot/tokopedia/orders?tab=` → `{ok:true, data}` raw; `GET /api/bot/tokopedia/orders/[id]` → `{ok:true, data}` raw or `{ok:false, error:"not_found"}`.

- [ ] **Step 1: Write the failing test**

Create `lib/tokopedia/__tests__/bot-routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))
vi.mock("@/lib/tokopedia/orders", () => ({ listOrders: vi.fn(), getOrderById: vi.fn() }))

import { GET as listGET } from "@/app/api/bot/tokopedia/orders/route"
import { GET as byIdGET } from "@/app/api/bot/tokopedia/orders/[id]/route"
import { requireBotToken } from "@/lib/bot/auth"
import { listOrders, getOrderById } from "@/lib/tokopedia/orders"
import { TokopediaError } from "@/lib/tokopedia/types"

const mockAuth = requireBotToken as any
const mockList = listOrders as any
const mockById = getOrderById as any
const req = (url = "http://x/api/bot/tokopedia/orders") => ({ headers: { get: () => "Bearer x" }, url } as any)

describe("bot tokopedia routes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("list 401 without token", async () => {
    mockAuth.mockReturnValue(false)
    const res = await listGET(req())
    expect(res.status).toBe(401)
  })

  it("list returns raw data passthrough", async () => {
    mockAuth.mockReturnValue(true)
    mockList.mockResolvedValue({ total_count: 2, main_orders: [{ main_order_id: "A" }] })
    const res = await listGET(req("http://x/api/bot/tokopedia/orders?tab=semua"))
    const body = await res.json()
    expect(body).toEqual({ ok: true, data: { total_count: 2, main_orders: [{ main_order_id: "A" }] } })
    expect(mockList.mock.calls[0][0]).toBe("semua")
  })

  it("list returns ok:false with session error code", async () => {
    mockAuth.mockReturnValue(true)
    mockList.mockRejectedValue(new TokopediaError("SESSION_INVALID"))
    const res = await listGET(req())
    expect(await res.json()).toEqual({ ok: false, error: "SESSION_INVALID" })
  })

  it("by-id returns raw order", async () => {
    mockAuth.mockReturnValue(true)
    mockById.mockResolvedValue({ main_order_id: "X" })
    const res = await byIdGET(req(), { params: Promise.resolve({ id: "X" }) })
    expect(await res.json()).toEqual({ ok: true, data: { main_order_id: "X" } })
  })

  it("by-id returns not_found", async () => {
    mockAuth.mockReturnValue(true)
    mockById.mockResolvedValue(null)
    const res = await byIdGET(req(), { params: Promise.resolve({ id: "X" }) })
    expect(await res.json()).toEqual({ ok: false, error: "not_found" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/tokopedia/__tests__/bot-routes.test.ts`
Expected: FAIL — routes not found.

- [ ] **Step 3: Implement**

Create `app/api/bot/tokopedia/orders/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { listOrders } from "@/lib/tokopedia/orders"
import { TokopediaError } from "@/lib/tokopedia/types"

export async function GET(req: NextRequest) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tab = new URL(req.url).searchParams.get("tab") === "semua" ? "semua" : "perlu-dikirim"
  try {
    const data = await listOrders(tab)
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    const error = err instanceof TokopediaError ? err.code : (err instanceof Error ? err.message : "error")
    return NextResponse.json({ ok: false, error })
  }
}
```

Create `app/api/bot/tokopedia/orders/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getOrderById } from "@/lib/tokopedia/orders"
import { TokopediaError } from "@/lib/tokopedia/types"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  try {
    const raw = await getOrderById(id)
    if (!raw) return NextResponse.json({ ok: false, error: "not_found" })
    return NextResponse.json({ ok: true, data: raw })
  } catch (err) {
    const error = err instanceof TokopediaError ? err.code : (err instanceof Error ? err.message : "error")
    return NextResponse.json({ ok: false, error })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/tokopedia/__tests__/bot-routes.test.ts`
Expected: PASS (5 tests). Then `npx tsc --noEmit 2>&1 | grep -E "app/api/bot/tokopedia"` → no output.

- [ ] **Step 5: Commit**

```bash
git add app/api/bot/tokopedia lib/tokopedia/__tests__/bot-routes.test.ts
git commit -m "feat(tokopedia): bot raw-passthrough order endpoints"
```

---

## Task 7: Hooks + Settings session card + Order channel UI

**Files:**
- Create: `lib/hooks/use-tokopedia.ts`, `components/settings/TokopediaSessionCard.tsx`
- Modify: `components/order/OrderSidebar.tsx`, `app/(dashboard)/order/page.tsx`, `app/(dashboard)/settings/page.tsx`

**Interfaces:**
- Consumes: the dashboard routes from Task 5.
- Produces: `useTokopediaSession()`, `useSaveTokopediaSession()`, `useTestTokopediaSession()`, `useTokopediaOrders(tab)`, `useTokopediaOrder(id)` hooks; `TokopediaSessionCard`; a `"tokopedia"` `OrderChannel`.

- [ ] **Step 1: Add the hooks**

Create `lib/hooks/use-tokopedia.ts`:

```typescript
"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TokopediaOrderSummary } from "@/lib/tokopedia/types"

interface SessionStatus { exists: boolean; sellerId?: string; updatedAt?: string; tokenExpiry?: string | null; expired?: boolean }

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(j.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function useTokopediaSession() {
  return useQuery({ queryKey: ["tokopedia", "session"], queryFn: () => apiFetch<SessionStatus>("/api/tokopedia/session"), staleTime: 30_000 })
}

export function useSaveTokopediaSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cookies: unknown[]) =>
      apiFetch("/api/tokopedia/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cookies }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokopedia", "session"] }),
  })
}

export function useTestTokopediaSession() {
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; error?: string }>("/api/tokopedia/session/test", { method: "POST" }),
  })
}

export function useTokopediaOrders(tab: "perlu-dikirim" | "semua") {
  return useQuery({
    queryKey: ["tokopedia", "orders", tab],
    queryFn: () => apiFetch<{ totalCount: number; orders: TokopediaOrderSummary[] }>(`/api/tokopedia/orders?tab=${tab}`),
  })
}

export function useTokopediaOrder(id: string | null) {
  return useQuery({
    queryKey: ["tokopedia", "order", id],
    queryFn: () => apiFetch<TokopediaOrderSummary>(`/api/tokopedia/orders/${id}`),
    enabled: !!id,
  })
}
```

- [ ] **Step 2: Add the Settings session card**

Create `components/settings/TokopediaSessionCard.tsx`:

```typescript
"use client"

import { useState } from "react"
import { useTokopediaSession, useSaveTokopediaSession, useTestTokopediaSession } from "@/lib/hooks/use-tokopedia"

export function TokopediaSessionCard() {
  const { data: status } = useTokopediaSession()
  const saveMut = useSaveTokopediaSession()
  const testMut = useTestTokopediaSession()
  const [raw, setRaw] = useState("")
  const [msg, setMsg] = useState<string | null>(null)

  async function handleSave() {
    setMsg(null)
    let cookies: unknown
    try { cookies = JSON.parse(raw) } catch { setMsg("❌ JSON tidak valid"); return }
    if (!Array.isArray(cookies)) { setMsg("❌ Harus array dari EditThisCookies"); return }
    try {
      await saveMut.mutateAsync(cookies)
      setRaw("")
      setMsg("✅ Session tersimpan")
    } catch (e) { setMsg("❌ " + (e instanceof Error ? e.message : "gagal")) }
  }

  async function handleTest() {
    setMsg(null)
    const r = await testMut.mutateAsync()
    setMsg(r.ok ? "✅ Koneksi OK" : "❌ " + r.error)
  }

  const expired = status?.expired
  return (
    <div className="rounded-[16px] p-5 space-y-4 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">🟢 Tokopedia Session</div>
        <div className="text-xs mt-0.5 g-t4">Paste cookies dari EditThisCookies (login seller-id.tokopedia.com dari jaringan server)</div>
      </div>

      {status?.exists ? (
        <div className="text-xs g-t2 space-y-1">
          <div>Seller ID: <span className="font-mono">{status.sellerId}</span></div>
          <div>Update: {status.updatedAt ? new Date(status.updatedAt).toLocaleString("id-ID") : "-"}</div>
          <div>Expiry token: {status.tokenExpiry ? new Date(status.tokenExpiry).toLocaleString("id-ID") : "-"}
            {" "}<span style={{ color: expired ? "#f87171" : "#34d399" }}>{expired ? "(expired)" : "(aktif)"}</span></div>
        </div>
      ) : <div className="text-xs g-t4">Belum ada session tersimpan.</div>}

      <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={4}
        placeholder='[{"name":"SELLER_TOKEN","value":"..."}, ...]'
        className="glass-input w-full rounded-[8px] px-3 py-2 text-xs font-mono" />

      <div className="flex gap-2 items-center">
        <button onClick={handleSave} disabled={!raw.trim() || saveMut.isPending}
          className="h-9 px-4 rounded-[8px] text-sm font-semibold text-white"
          style={{ background: raw.trim() ? "linear-gradient(135deg,#5055e8,#7c84f8)" : "var(--g-inner)" }}>
          Simpan
        </button>
        <button onClick={handleTest} disabled={!status?.exists || testMut.isPending}
          className="h-9 px-4 rounded-[8px] text-sm font-semibold" style={{ background: "var(--g-inner)", color: "var(--g-t2)" }}>
          {testMut.isPending ? "Menguji..." : "Test koneksi"}
        </button>
        {msg && <span className="text-xs">{msg}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Render the card on the Settings page**

In `app/(dashboard)/settings/page.tsx`, import `TokopediaSessionCard` and render `<TokopediaSessionCard />` in the same stack/tab as `InvoiceMethodsCard` (match the existing layout there).

- [ ] **Step 4: Add the Tokopedia channel to OrderSidebar**

In `components/order/OrderSidebar.tsx`, extend the union and nav list:

```typescript
export type OrderChannel = "shopee" | "light-generator" | "strava" | "tokopedia"

const NAV_ITEMS: { channel: OrderChannel; icon: string; label: string }[] = [
  { channel: "shopee", icon: "🛒", label: "Shopee" },
  { channel: "tokopedia", icon: "🟢", label: "Tokopedia" },
  { channel: "light-generator", icon: "💡", label: "Light Generator" },
  { channel: "strava", icon: "🏃", label: "Strava" },
]
```

- [ ] **Step 5: Add the TokopediaOrderView to the Order page**

In `app/(dashboard)/order/page.tsx`, add imports and a view component, and render it when `channel === "tokopedia"`:

```tsx
import { useTokopediaSession, useTokopediaOrders, useTokopediaOrder } from "@/lib/hooks/use-tokopedia"
```

```tsx
function TokopediaOrderView() {
  const [tab, setTab] = useState<"perlu-dikirim" | "semua">("perlu-dikirim")
  const [searchId, setSearchId] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const { data: sessionStatus } = useTokopediaSession()
  const { data, isLoading, isError, error } = useTokopediaOrders(tab)
  const { data: detail } = useTokopediaOrder(openId ?? searchId.trim() || null)

  const sessionBad = sessionStatus && (!sessionStatus.exists || sessionStatus.expired)

  return (
    <div className="space-y-4">
      {sessionBad && (
        <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: "rgba(245,158,11,0.4)", color: "#f59e0b" }}>
          Session Tokopedia belum ada / expired. Buka Settings → Tokopedia Session untuk paste cookies.
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {(["perlu-dikirim", "semua"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-full text-sm font-medium border ${tab === t ? "bg-indigo-600 text-white border-indigo-600" : "border-border text-muted-foreground hover:bg-muted"}`}>
            {t === "perlu-dikirim" ? "Perlu Dikirim" : "Semua"}
          </button>
        ))}
        <input value={searchId} onChange={e => setSearchId(e.target.value)} placeholder="Cari order ID..."
          className="ml-auto h-8 rounded-md border px-3 text-sm bg-transparent" />
      </div>

      {isError ? (
        <p className="py-8 text-center text-destructive">{error instanceof Error ? error.message : "Error"}</p>
      ) : isLoading ? (
        <p className="py-8 text-center text-muted-foreground">Memuat...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b">
              <th className="py-2 pr-4">Order ID</th><th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Produk</th><th className="py-2 pr-4">Kurir</th>
              <th className="py-2 pr-4">Resi</th><th className="py-2 pr-4">Total</th>
            </tr></thead>
            <tbody>
              {(data?.orders ?? []).map(o => (
                <tr key={o.orderId} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(o.orderId)}>
                  <td className="py-2 pr-4 font-mono text-xs">{o.orderId}</td>
                  <td className="py-2 pr-4">{o.statusLabel}</td>
                  <td className="py-2 pr-4">{o.products.map(p => `${p.name}${p.variant ? ` (${p.variant})` : ""} ×${p.qty}`).join(", ")}</td>
                  <td className="py-2 pr-4">{o.courier ?? "-"}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{o.trackingNo ?? "-"}</td>
                  <td className="py-2 pr-4">Rp {o.grandTotal.toLocaleString("id-ID")}</td>
                </tr>
              ))}
              {(data?.orders ?? []).length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada order</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && (openId || searchId.trim()) && (
        <div className="rounded-md border p-4 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono">{detail.orderId} · {detail.statusLabel}</span>
            <button className="text-xs text-muted-foreground" onClick={() => { setOpenId(null); setSearchId("") }}>tutup</button>
          </div>
          <div>Produk: {detail.products.map(p => `${p.name}${p.variant ? ` (${p.variant})` : ""} ×${p.qty}`).join(", ")}</div>
          <div>Kurir: {detail.courier ?? "-"} {detail.serviceType ? `(${detail.serviceType})` : ""} · Resi: {detail.trackingNo ?? "-"}</div>
          {detail.latestLogistic && <div>Update: {detail.latestLogistic.msg}</div>}
          <div>Buyer: {detail.buyerNickname ?? "-"} · Total: Rp {detail.grandTotal.toLocaleString("id-ID")}</div>
          {detail.note && <div>Catatan: {detail.note}</div>}
        </div>
      )}
    </div>
  )
}
```

And in the channel switch, add: `{channel === "tokopedia" && <TokopediaOrderView />}`. Ensure `useState` is imported in the file (it already is — the page uses it).

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit` — no new errors.
Run: `npx prisma generate` then `npm run build` — build succeeds (the `/order` and `/settings` routes compile). If the local build fails only on the pre-existing lightningcss/rollup native-binary issue, note it and rely on the Docker build.

- [ ] **Step 7: Commit**

```bash
git add lib/hooks/use-tokopedia.ts components/settings/TokopediaSessionCard.tsx components/order/OrderSidebar.tsx "app/(dashboard)/order/page.tsx" "app/(dashboard)/settings/page.tsx"
git commit -m "feat(tokopedia): session card + order channel UI + hooks"
```

---

## Task 8: Bot API docs

**Files:**
- Modify: `docs/bot-api.md`

- [ ] **Step 1: Append the Tokopedia bot endpoints**

In `docs/bot-api.md`, add a section:

```markdown
### GET /api/bot/tokopedia/orders?tab={perlu-dikirim|semua}
→ `{ "ok": true, "data": { "total_count": N, "main_orders": [ ...raw Tokopedia orders... ] } }`
Raw Tokopedia response — the bot maps fields itself. Session errors: `{ "ok": false, "error": "SESSION_INVALID" | "SESSION_MISSING" }` (fix by re-pasting cookies in the dashboard Settings).

### GET /api/bot/tokopedia/orders/{id}
→ `{ "ok": true, "data": { ...raw order... } }` · `{ "ok": false, "error": "not_found" }` when the id matches nothing · session errors as above.

Note: the Tokopedia session is managed only from the dashboard (Settings → Tokopedia Session). The bot cannot save or refresh it.
```

- [ ] **Step 2: Full verification**

Run: `npm test` (all pass, including the new Tokopedia suites) and `npx tsc --noEmit` (no new errors).

- [ ] **Step 3: Commit**

```bash
git add docs/bot-api.md
git commit -m "docs(bot): Tokopedia order endpoints"
```

- [ ] **Step 4: Deploy** (after merge)

Run: `bash deploy.sh`. Then paste real cookies via Settings → Tokopedia Session, click "Test koneksi" (expect ✅), and open Order → Tokopedia (expect the Perlu Dikirim list, or the session banner if cookies aren't valid).
```
