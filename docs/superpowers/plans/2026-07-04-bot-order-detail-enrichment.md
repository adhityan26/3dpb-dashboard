# Bot Order Detail Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich `GET /api/bot/shopee/order/[sn]` with every available Shopee order field (shipping carrier, buyer/recipient info, full item details, full escrow breakdown), grouped into nested objects, and add a separate `GET /api/bot/shopee/order/[sn]/tracking` endpoint for the tracking number.

**Architecture:** Extend the existing `getOrderDetail` Shopee wrapper to request more `response_optional_fields` and widen its return type. Rewrite the bot order route to build a nested JSON shape (`buyer`, `items[]`, `money`, plus flat order-level fields). Add a new `getTrackingNumber` wrapper (`GET /api/v2/logistics/get_tracking_number`) and a new bot route that calls it.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest.

## Global Constraints

- Every `/api/bot/*` route calls `requireBotToken(req)` first and returns 401 before any other work.
- Money/escrow fields are `null` (not omitted) when escrow data is unavailable — never throw for that case.
- Node 22 runtime — if `npx vitest`/`npx tsc` errors with "Unexpected token ?", run `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22` first.
- Tests via Vitest (`npm test` or `npx vitest run <file>`).
- This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before using unfamiliar route APIs.

## File Structure

- `lib/shopee/orders.ts` — extend `getOrderDetail`'s requested fields (Task 1).
- `lib/shopee/types.ts` — widen `ShopeeOrderDetail` with the new fields (Task 1).
- `lib/shopee/tracking.ts` — NEW: `getTrackingNumber(orderSn)` wrapper (Task 2).
- `app/api/bot/shopee/order/[sn]/route.ts` — rewrite response shape (Task 3).
- `app/api/bot/shopee/order/[sn]/tracking/route.ts` — NEW route (Task 2).
- `lib/bot/__tests__/shopee-route.test.ts` — rewritten for the new shape (Task 3).
- `lib/bot/__tests__/shopee-tracking-route.test.ts` — NEW (Task 2).
- `docs/bot-api.md` — update both endpoint docs (Task 4).

---

## Task 1: Widen `getOrderDetail` — request and type the new fields

**Files:**
- Modify: `lib/shopee/orders.ts`, `lib/shopee/types.ts`
- Test: `lib/shopee/__tests__/orders.test.ts` (create if it doesn't already cover `getOrderDetail`'s requested fields; check first)

**Interfaces:**
- Produces: `ShopeeOrderDetail` gains `currency` (already present), `shipping_carrier?: string`, `payment_method?: string`, `cod?: boolean`, `message_to_seller?: string`. `ShopeeOrderItemDetail` (already has `item_sku`, `model_name`, `model_sku`, `model_original_price`, `model_discounted_price`, `image_info` — no changes needed there, they're already fetched via `item_list`).

- [ ] **Step 1: Check for an existing test file covering the requested-fields list**

Run: `find lib/shopee/__tests__ -iname "*order*"`
If a file already asserts the exact `fields` array passed to `shopeeRequest` in `getOrderDetail`, note its path — you'll update it in Step 2. If none exists, you'll create one in Step 2.

- [ ] **Step 2: Write/update the failing test**

Create or update `lib/shopee/__tests__/orders.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/client", () => ({ shopeeRequest: vi.fn() }))

import { getOrderDetail } from "@/lib/shopee/orders"
import { shopeeRequest } from "@/lib/shopee/client"

const mockRequest = shopeeRequest as any

describe("getOrderDetail", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("requests the enriched field set", async () => {
    mockRequest.mockResolvedValue({ response: { order_list: [] } })
    await getOrderDetail(["S1"])
    const params = mockRequest.mock.calls[0][1]
    const fields = String(params.response_optional_fields).split(",")
    expect(fields).toEqual(expect.arrayContaining([
      "buyer_username", "recipient_address", "item_list", "total_amount",
      "order_status", "create_time", "update_time", "ship_by_date", "days_to_ship",
      "shipping_carrier", "payment_method", "cod", "message_to_seller",
    ]))
  })

  it("returns the order list from the response", async () => {
    const order = { order_sn: "S1", order_status: "READY_TO_SHIP" }
    mockRequest.mockResolvedValue({ response: { order_list: [order] } })
    const result = await getOrderDetail(["S1"])
    expect(result).toEqual([order])
  })

  it("returns an empty array without calling the API for an empty input", async () => {
    const result = await getOrderDetail([])
    expect(result).toEqual([])
    expect(mockRequest).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/shopee/__tests__/orders.test.ts`
Expected: FAIL — the field-set assertion fails because `shipping_carrier`/`payment_method`/`cod`/`message_to_seller` aren't requested yet.

- [ ] **Step 4: Extend the requested fields in `lib/shopee/orders.ts`**

Find the `fields` array inside `getOrderDetail` (currently ending with `"days_to_ship"`) and add the four new entries:

```typescript
  const fields = [
    "buyer_username",
    "recipient_address",
    "item_list",
    "total_amount",
    "order_status",
    "create_time",
    "update_time",
    "ship_by_date",
    "days_to_ship",
    "shipping_carrier",
    "payment_method",
    "cod",
    "message_to_seller",
  ].join(",")
```

- [ ] **Step 5: Widen `ShopeeOrderDetail` in `lib/shopee/types.ts`**

Find `export interface ShopeeOrderDetail { ... }` and add the four new optional fields right after `ship_by_date?: number`:

```typescript
export interface ShopeeOrderDetail {
  order_sn: string
  order_status: ShopeeOrderStatus
  create_time: number
  update_time: number
  total_amount: number
  currency: string
  buyer_username?: string
  recipient_address?: {
    name?: string
    phone?: string
    town?: string
    district?: string
    city?: string
    state?: string
    region?: string
    zipcode?: string
    full_address?: string
  }
  item_list: ShopeeOrderItemDetail[]
  days_to_ship?: number
  ship_by_date?: number
  shipping_carrier?: string
  payment_method?: string
  cod?: boolean
  message_to_seller?: string
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run lib/shopee/__tests__/orders.test.ts`
Expected: PASS (3 tests).

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/shopee/(orders|types)\.ts"`
Expected: no output (no new errors in these two files).

- [ ] **Step 7: Commit**

```bash
git add lib/shopee/orders.ts lib/shopee/types.ts lib/shopee/__tests__/orders.test.ts
git commit -m "feat(shopee): request shipping carrier, payment method, cod, buyer message"
```

---

## Task 2: Tracking number wrapper + bot endpoint

**Files:**
- Create: `lib/shopee/tracking.ts`, `app/api/bot/shopee/order/[sn]/tracking/route.ts`
- Test: `lib/shopee/__tests__/tracking.test.ts`, `lib/bot/__tests__/shopee-tracking-route.test.ts`

**Interfaces:**
- Consumes: `shopeeRequest<T>(path, params)` from `lib/shopee/client.ts` (generic, already used by `getOrderDetail`); `requireBotToken(req)` from `lib/bot/auth.ts`.
- Produces: `getTrackingNumber(orderSn: string): Promise<string | null>` in `lib/shopee/tracking.ts`. Route `GET /api/bot/shopee/order/[sn]/tracking` → `{ trackingNumber: string | null }`.

- [ ] **Step 1: Write the failing test for the service wrapper**

Create `lib/shopee/__tests__/tracking.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/client", () => ({ shopeeRequest: vi.fn() }))

import { getTrackingNumber } from "@/lib/shopee/tracking"
import { shopeeRequest } from "@/lib/shopee/client"

const mockRequest = shopeeRequest as any

describe("getTrackingNumber", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("calls the tracking-number endpoint with the order sn", async () => {
    mockRequest.mockResolvedValue({ response: { tracking_number: "SPXTRK123" } })
    await getTrackingNumber("S1")
    expect(mockRequest).toHaveBeenCalledWith(
      "/api/v2/logistics/get_tracking_number",
      { order_sn: "S1" },
    )
  })

  it("returns the tracking number when present", async () => {
    mockRequest.mockResolvedValue({ response: { tracking_number: "SPXTRK123" } })
    const result = await getTrackingNumber("S1")
    expect(result).toBe("SPXTRK123")
  })

  it("returns null when tracking number is empty or absent", async () => {
    mockRequest.mockResolvedValue({ response: { tracking_number: "" } })
    expect(await getTrackingNumber("S1")).toBeNull()
    mockRequest.mockResolvedValue({ response: {} })
    expect(await getTrackingNumber("S2")).toBeNull()
  })

  it("returns null instead of throwing when the API errors (order not yet shipped)", async () => {
    mockRequest.mockRejectedValue(new Error("no logistics info yet"))
    expect(await getTrackingNumber("S1")).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/shopee/__tests__/tracking.test.ts`
Expected: FAIL — `getTrackingNumber` not found.

- [ ] **Step 3: Implement the wrapper**

Create `lib/shopee/tracking.ts`:

```typescript
import { shopeeRequest } from "./client"

interface TrackingNumberResponse {
  response: {
    tracking_number?: string
  }
}

/**
 * Fetch the courier tracking number for an order.
 * Returns null (not a throw) when the order has no tracking number yet
 * (e.g. not shipped) or the Shopee API call fails for that reason.
 */
export async function getTrackingNumber(orderSn: string): Promise<string | null> {
  try {
    const json = await shopeeRequest<TrackingNumberResponse>(
      "/api/v2/logistics/get_tracking_number",
      { order_sn: orderSn },
    )
    return json.response.tracking_number || null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/shopee/__tests__/tracking.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing test for the bot route**

Create `lib/bot/__tests__/shopee-tracking-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/tracking", () => ({ getTrackingNumber: vi.fn() }))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { GET } from "@/app/api/bot/shopee/order/[sn]/tracking/route"
import { getTrackingNumber } from "@/lib/shopee/tracking"
import { requireBotToken } from "@/lib/bot/auth"

const mockTracking = getTrackingNumber as any
const mockAuth = requireBotToken as any
const req = { headers: { get: () => "Bearer x" } } as any
const ctx = (sn: string) => ({ params: Promise.resolve({ sn }) })

describe("GET /api/bot/shopee/order/[sn]/tracking", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(401)
  })

  it("returns the tracking number when available", async () => {
    mockAuth.mockReturnValue(true)
    mockTracking.mockResolvedValue("SPXTRK123")
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ trackingNumber: "SPXTRK123" })
  })

  it("returns null trackingNumber (not an error) when not yet available", async () => {
    mockAuth.mockReturnValue(true)
    mockTracking.mockResolvedValue(null)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ trackingNumber: null })
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run lib/bot/__tests__/shopee-tracking-route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 7: Implement the route**

Create `app/api/bot/shopee/order/[sn]/tracking/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getTrackingNumber } from "@/lib/shopee/tracking"

export async function GET(req: NextRequest, { params }: { params: Promise<{ sn: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { sn } = await params
  const trackingNumber = await getTrackingNumber(sn)
  return NextResponse.json({ trackingNumber })
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run lib/bot/__tests__/shopee-tracking-route.test.ts`
Expected: PASS (3 tests).

Run: `npx tsc --noEmit 2>&1 | grep -E "lib/shopee/tracking\.ts|app/api/bot/shopee/order/\[sn\]/tracking"`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add lib/shopee/tracking.ts lib/shopee/__tests__/tracking.test.ts app/api/bot/shopee/order/[sn]/tracking lib/bot/__tests__/shopee-tracking-route.test.ts
git commit -m "feat(bot): tracking-number endpoint (separate from order detail)"
```

---

## Task 3: Rewrite the order-detail bot route with the full nested shape

**Files:**
- Modify: `app/api/bot/shopee/order/[sn]/route.ts`
- Modify: `lib/bot/__tests__/shopee-route.test.ts` (replace entirely — old assertions target the old flat shape)

**Interfaces:**
- Consumes: `requireBotToken` (`lib/bot/auth.ts`); `getOrderDetail` (`lib/shopee/orders.ts`, now returning the widened `ShopeeOrderDetail` from Task 1); `getEscrowDetail` (`lib/shopee/escrow.ts`, unchanged — already returns `commission_fee`, `service_fee`, `transaction_fee`, `actual_shipping_fee` per the existing `ShopeeEscrowDetail` interface).
- Produces: `GET /api/bot/shopee/order/[sn]` response shape (exact field names/nesting below) — this is the final documented contract for Task 4.

- [ ] **Step 1: Write the failing test (replaces the old file entirely)**

Replace the full contents of `lib/bot/__tests__/shopee-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/orders", () => ({ getOrderDetail: vi.fn() }))
vi.mock("@/lib/shopee/escrow", () => ({ getEscrowDetail: vi.fn() }))
vi.mock("@/lib/bot/auth", () => ({ requireBotToken: vi.fn() }))

import { GET } from "@/app/api/bot/shopee/order/[sn]/route"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getEscrowDetail } from "@/lib/shopee/escrow"
import { requireBotToken } from "@/lib/bot/auth"

const mockDetail = getOrderDetail as any
const mockEscrow = getEscrowDetail as any
const mockAuth = requireBotToken as any
const req = { headers: { get: () => "Bearer x" } } as any
const ctx = (sn: string) => ({ params: Promise.resolve({ sn }) })

const FULL_DETAIL = {
  order_sn: "S1",
  order_status: "READY_TO_SHIP",
  total_amount: 100,
  currency: "IDR",
  create_time: 1700000000,
  update_time: 1700001000,
  ship_by_date: 1700100000,
  days_to_ship: 2,
  shipping_carrier: "SPX Standard",
  payment_method: "COD",
  cod: true,
  message_to_seller: "Tolong bungkus rapi",
  buyer_username: "budi123",
  recipient_address: {
    name: "Budi", phone: "0812xxx", city: "Bandung", district: "Coblong",
    state: "Jawa Barat", zipcode: "40132", full_address: "Jl. Contoh No. 1",
  },
  item_list: [{
    item_name: "Keychain", item_sku: "KC-01", model_name: "Merah", model_sku: "KC-01-RED",
    model_quantity_purchased: 2, model_original_price: 20000, model_discounted_price: 18000,
    image_info: { image_url: "https://example.com/img.jpg" },
  }],
}

const FULL_ESCROW = {
  buyer_payment_amount: 110, escrow_amount: 90,
  commission_fee: 5, service_fee: 2, transaction_fee: 1, actual_shipping_fee: 8,
}

describe("GET /api/bot/shopee/order/[sn]", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("401 when token invalid", async () => {
    mockAuth.mockReturnValue(false)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(401)
  })

  it("404 when order not found", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([])
    mockEscrow.mockResolvedValue(null)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(404)
  })

  it("returns the full nested shape with escrow present", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([FULL_DETAIL])
    mockEscrow.mockResolvedValue(FULL_ESCROW)
    const res = await GET(req, ctx("S1"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      orderSn: "S1",
      status: "READY_TO_SHIP",
      total: 100,
      currency: "IDR",
      createTime: 1700000000,
      updateTime: 1700001000,
      shipByDate: 1700100000,
      daysToShip: 2,
      shippingCarrier: "SPX Standard",
      paymentMethod: "COD",
      cod: true,
      messageToSeller: "Tolong bungkus rapi",
      buyer: {
        username: "budi123",
        name: "Budi",
        phone: "0812xxx",
        city: "Bandung",
        district: "Coblong",
        state: "Jawa Barat",
        zip: "40132",
        fullAddress: "Jl. Contoh No. 1",
      },
      items: [{
        name: "Keychain",
        qty: 2,
        sku: "KC-01",
        variant: "Merah",
        variantSku: "KC-01-RED",
        priceOriginal: 20000,
        priceDiscounted: 18000,
        imageUrl: "https://example.com/img.jpg",
      }],
      money: {
        buyerPaid: 110,
        received: 90,
        commissionFee: 5,
        serviceFee: 2,
        transactionFee: 1,
        actualShippingFee: 8,
      },
      url: "https://seller.shopee.co.id/portal/sale/order/S1",
    })
  })

  it("returns null money and omits absent optional order fields gracefully when escrow and optional fields are missing", async () => {
    mockAuth.mockReturnValue(true)
    mockDetail.mockResolvedValue([{
      order_sn: "S1", order_status: "UNPAID", total_amount: 100, currency: "IDR",
      create_time: 1700000000, update_time: 1700000000, item_list: [],
    }])
    mockEscrow.mockResolvedValue(null)
    const res = await GET(req, ctx("S1"))
    const body = await res.json()
    expect(body.money).toEqual({
      buyerPaid: null, received: null, commissionFee: null, serviceFee: null, transactionFee: null, actualShippingFee: null,
    })
    expect(body.shippingCarrier).toBeNull()
    expect(body.buyer).toEqual({
      username: null, name: null, phone: null, city: null, district: null, state: null, zip: null, fullAddress: null,
    })
    expect(body.items).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/bot/__tests__/shopee-route.test.ts`
Expected: FAIL — current route returns the old flat shape.

- [ ] **Step 3: Implement the new route**

Replace the full contents of `app/api/bot/shopee/order/[sn]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server"
import { requireBotToken } from "@/lib/bot/auth"
import { getOrderDetail } from "@/lib/shopee/orders"
import { getEscrowDetail } from "@/lib/shopee/escrow"

const SELLER_ORDER_URL = "https://seller.shopee.co.id/portal/sale/order"

export async function GET(req: NextRequest, { params }: { params: Promise<{ sn: string }> }) {
  if (!requireBotToken(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { sn } = await params

  const [details, escrow] = await Promise.all([getOrderDetail([sn]), getEscrowDetail(sn)])
  const detail = details[0]
  if (!detail) return NextResponse.json({ error: `Order ${sn} tidak ditemukan` }, { status: 404 })

  const addr = detail.recipient_address

  return NextResponse.json({
    orderSn: detail.order_sn,
    status: detail.order_status,
    total: detail.total_amount,
    currency: detail.currency,
    createTime: detail.create_time,
    updateTime: detail.update_time,
    shipByDate: detail.ship_by_date ?? null,
    daysToShip: detail.days_to_ship ?? null,
    shippingCarrier: detail.shipping_carrier ?? null,
    paymentMethod: detail.payment_method ?? null,
    cod: detail.cod ?? null,
    messageToSeller: detail.message_to_seller ?? null,
    buyer: {
      username: detail.buyer_username ?? null,
      name: addr?.name ?? null,
      phone: addr?.phone ?? null,
      city: addr?.city ?? null,
      district: addr?.district ?? null,
      state: addr?.state ?? null,
      zip: addr?.zipcode ?? null,
      fullAddress: addr?.full_address ?? null,
    },
    items: detail.item_list.map(i => ({
      name: i.item_name,
      qty: i.model_quantity_purchased,
      sku: i.item_sku ?? null,
      variant: i.model_name ?? null,
      variantSku: i.model_sku ?? null,
      priceOriginal: i.model_original_price,
      priceDiscounted: i.model_discounted_price,
      imageUrl: i.image_info?.image_url ?? null,
    })),
    money: {
      buyerPaid: escrow ? escrow.buyer_payment_amount : null,
      received: escrow ? escrow.escrow_amount : null,
      commissionFee: escrow ? escrow.commission_fee : null,
      serviceFee: escrow ? escrow.service_fee : null,
      transactionFee: escrow ? escrow.transaction_fee : null,
      actualShippingFee: escrow ? escrow.actual_shipping_fee : null,
    },
    url: `${SELLER_ORDER_URL}/${detail.order_sn}`,
  })
}
```

Note: `escrow.order_income` (a per-item cost breakdown) is intentionally not surfaced by this route — out of scope for this shape.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/bot/__tests__/shopee-route.test.ts`
Expected: PASS (4 tests).

Run: `npx tsc --noEmit 2>&1 | grep -E "app/api/bot/shopee/order/\[sn\]/route\.ts"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add "app/api/bot/shopee/order/[sn]/route.ts" lib/bot/__tests__/shopee-route.test.ts
git commit -m "feat(bot): enrich order-detail endpoint with full buyer/item/money/shipping data"
```

---

## Task 4: Update API docs

**Files:**
- Modify: `docs/bot-api.md`

- [ ] **Step 1: Replace the shopee order section**

In `docs/bot-api.md`, find the `### GET /api/bot/shopee/order/{sn}` section and replace it with:

```markdown
### GET /api/bot/shopee/order/{sn}
→
```json
{
  "orderSn": "...", "status": "READY_TO_SHIP", "total": 100000, "currency": "IDR",
  "createTime": 1700000000, "updateTime": 1700001000,
  "shipByDate": 1700100000, "daysToShip": 2,
  "shippingCarrier": "SPX Standard", "paymentMethod": "COD", "cod": true,
  "messageToSeller": "Tolong bungkus rapi",
  "buyer": { "username": "...", "name": "...", "phone": "...", "city": "...", "district": "...", "state": "...", "zip": "...", "fullAddress": "..." },
  "items": [{ "name": "...", "qty": 2, "sku": "...", "variant": "...", "variantSku": "...", "priceOriginal": 20000, "priceDiscounted": 18000, "imageUrl": "..." }],
  "money": { "buyerPaid": 110000, "received": 90000, "commissionFee": 5000, "serviceFee": 2000, "transactionFee": 1000, "actualShippingFee": 8000 },
  "url": "https://seller.shopee.co.id/portal/sale/order/..."
}
```
All fields under `buyer`/`money` are `null` when the underlying data isn't available yet (e.g. `money.*` before escrow settles). 404 if the order doesn't exist.

### GET /api/bot/shopee/order/{sn}/tracking
→ `{ "trackingNumber": "SPXTRK123" }` or `{ "trackingNumber": null }` when not yet assigned (e.g. not shipped). Never errors for the not-yet-available case.
```

- [ ] **Step 2: Full verification**

Run: `npm test` (all pass, including the 4 new/updated test files) and `npx tsc --noEmit` (no new errors).

- [ ] **Step 3: Commit**

```bash
git add docs/bot-api.md
git commit -m "docs(bot): document enriched order-detail shape and tracking endpoint"
```

- [ ] **Step 4: Deploy**

Run: `bash deploy.sh`
Smoke test (replace `$TOKEN` and `$SN` with a real order sn):
```bash
curl -s http://192.168.88.113:3100/api/bot/shopee/order/$SN -H "Authorization: Bearer $TOKEN" | head -c 2000
curl -s http://192.168.88.113:3100/api/bot/shopee/order/$SN/tracking -H "Authorization: Bearer $TOKEN"
```
Expected: first call returns the full nested JSON; second returns `{"trackingNumber": ...}`.
