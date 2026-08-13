# Analisa Income Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken date-range filter on `/analisa`, and add an income
breakdown section (buyer payment, Shopee price, admin fee, net received) —
both as a range summary and per-product — backed by a new `OrderEscrow`
cache table that self-heals when Shopee returns/disputes change a
`COMPLETED` order's payout after the fact.

**Architecture:** New Prisma model `OrderEscrow` caches Shopee's
per-order escrow detail (fetched via existing `getEscrowDetail()`).
`lib/analytics/income.ts` syncs this cache against orders in the requested
range (fill misses, re-check orders still inside a 30-day mutable window
via a new Shopee Returns API module) and allocates order-level fees to
products proportionally by revenue share. `lib/analytics/service.ts` merges
this into the existing `AnalyticsData` payload. The API route and client
hook are fixed to actually forward the selected `FlexRange` (including
custom ranges) instead of collapsing everything to `7d`. A new UI section
renders the summary + per-product table below the existing charts.

**Tech Stack:** Next.js 16 (App Router, Turbopack), Prisma + PostgreSQL,
TanStack Query, Vitest, existing `lib/shopee/client.ts` signing helpers.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-13-analisa-income-breakdown-design.md`
- Node 22 required for all commands: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`
- Run all commands from `apps/dashboard/` unless noted.
- `RETURN_MUTABLE_WINDOW_DAYS = 30` (spec §4) — order re-checked against
  Returns API only if `orderCompleteTime` is within 30 days of "now".
- `OrderEscrow.orderSn` is the primary key; sync always **upserts** (never
  insert-only) so refund/dispute updates overwrite the cached row in place.
- Only `order_status === "COMPLETED"` orders are ever synced to
  `OrderEscrow` — non-completed orders contribute `adminFee: null` /
  `received: null` in the per-product breakdown (spec §5).
- Admin fee per product is an **estimate**, allocated proportionally by
  `(item.model_discounted_price * item.model_quantity_purchased) /
  order.total_amount` — Shopee does not expose real per-item fees (spec §4).
- A failed escrow/returns sync must never break the rest of `/analisa` —
  `daily`/`topProducts`/`kpi` must keep rendering (spec §7).
- Do not deploy — this repo's rule is deploys happen only when the user
  explicitly runs `./deploy.sh` themselves.

---

## File Structure

- `prisma/schema.prisma` — add `model OrderEscrow` (Task 1)
- `lib/shopee/returns.ts` (new) — `getReturnListForOrders()`, wraps
  `/api/v2/returns/get_return_list` (Task 2)
- `lib/analytics/income.ts` (new) — `syncAndGetEscrowForOrders()`,
  `allocateFeePerProduct()` — the sync + allocation core (Task 3)
- `lib/analytics/types.ts` — add `IncomeBreakdownSummary`,
  `ProductIncomeBreakdown`, extend `AnalyticsData` (Task 4)
- `lib/analytics/service.ts` — wire `income.ts` into `getAnalytics()`
  (Task 4)
- `app/api/analytics/route.ts` — fix `parseRange` to accept the full
  `FlexRange` incl. custom dates (Task 5)
- `lib/hooks/use-analytics.ts` — fix `fetchAnalytics()` to serialize
  `FlexRange` (incl. custom object) into query params (Task 5)
- `components/analytics/IncomeBreakdownSection.tsx` (new) — summary card +
  per-product table (Task 6)
- `app/(dashboard)/analisa/page.tsx` — render the new section (Task 6)

---

### Task 1: `OrderEscrow` Prisma model + migration

**Files:**
- Modify: `apps/dashboard/prisma/schema.prisma`
- Test: none (schema-only; verified via `prisma migrate dev` + `prisma validate`)

**Interfaces:**
- Produces: Prisma model `OrderEscrow` with fields `orderSn` (String, @id),
  `buyerPaymentAmount` (Float), `escrowAmount` (Float), `commissionFee`
  (Float), `serviceFee` (Float), `transactionFee` (Float),
  `actualShippingFee` (Float), `hasReturnFlag` (Boolean, default false),
  `orderCompleteTime` (Int), `fetchedAt` (DateTime, default now),
  `updatedAt` (DateTime, @updatedAt). Accessed later via
  `prisma.orderEscrow.findMany/upsert`.

- [ ] **Step 1: Add the model to schema.prisma**

Open `apps/dashboard/prisma/schema.prisma` and add this block after the
existing `model VariantHpp { ... }` block (end of file):

```prisma
model OrderEscrow {
  orderSn            String   @id
  buyerPaymentAmount Float
  escrowAmount       Float
  commissionFee      Float
  serviceFee         Float
  transactionFee     Float
  actualShippingFee  Float
  hasReturnFlag      Boolean  @default(false)
  orderCompleteTime  Int
  fetchedAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

- [ ] **Step 2: Generate and apply the migration**

Run (from `apps/dashboard/`):
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm prisma migrate dev --name add_order_escrow
```
Expected: creates `prisma/migrations/<timestamp>_add_order_escrow/`, prints
"Your database is now in sync with your schema", exits 0.

- [ ] **Step 3: Verify the client generated**

Run:
```bash
pnpm prisma validate
```
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/prisma/schema.prisma apps/dashboard/prisma/migrations
git commit -m "feat(analisa): add OrderEscrow cache table"
```

---

### Task 2: Shopee Returns API module

**Files:**
- Create: `apps/dashboard/lib/shopee/returns.ts`
- Test: `apps/dashboard/lib/shopee/__tests__/returns.test.ts`

**Interfaces:**
- Consumes: `shopeeRequest<T>(path: string, params: Record<string, string | number>, options?: { transientAttempt?: number }): Promise<T>` from `@/lib/shopee/client` (existing, signature confirmed at `lib/shopee/client.ts:191`).
- Produces:
  ```ts
  export interface ShopeeReturnEntry {
    return_sn: string
    order_sn: string
    status: string
    refund_amount: number
  }
  export async function getReturnListForOrders(params: {
    createTimeFrom: number // unix seconds
    createTimeTo: number
    orderSns: string[]
  }): Promise<ShopeeReturnEntry[]>
  export function isReturnFinal(status: string): boolean
  ```
  `getReturnListForOrders` fetches all returns created in the given window
  (paginating via `more`/`next_cursor` like `lib/shopee/orders.ts` does),
  then filters the combined list down to entries whose `order_sn` is in
  `params.orderSns`. `isReturnFinal` returns true for status values meaning
  the return has been fully processed with a refund (`"ACCEPTED"`,
  `"CLOSED"`, `"JUDGING"` are NOT final — only a resolved/completed refund
  state counts). **Verify exact Shopee status enum values against
  `/api/v2/returns/get_return_list` official docs before finalizing this
  list** — treat the values below as the best inference from Shopee's
  other v2 APIs in this repo and confirm/correct them from the live API
  response shape during implementation.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/lib/shopee/__tests__/returns.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockShopeeRequest = vi.fn()
vi.mock("@/lib/shopee/client", () => ({
  shopeeRequest: (...args: unknown[]) => mockShopeeRequest(...args),
}))

import { getReturnListForOrders, isReturnFinal } from "../returns"

beforeEach(() => {
  mockShopeeRequest.mockReset()
})

describe("getReturnListForOrders", () => {
  it("filters returns down to the requested order_sns", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      response: {
        return: [
          { return_sn: "RT1", order_sn: "ORD1", status: "REFUND_APPROVED", refund_amount: 5000 },
          { return_sn: "RT2", order_sn: "ORD_OTHER", status: "REFUND_APPROVED", refund_amount: 3000 },
        ],
        more: false,
      },
    })

    const result = await getReturnListForOrders({
      createTimeFrom: 1000,
      createTimeTo: 2000,
      orderSns: ["ORD1"],
    })

    expect(result).toEqual([
      { return_sn: "RT1", order_sn: "ORD1", status: "REFUND_APPROVED", refund_amount: 5000 },
    ])
  })

  it("paginates when more is true", async () => {
    mockShopeeRequest
      .mockResolvedValueOnce({
        response: {
          return: [{ return_sn: "RT1", order_sn: "ORD1", status: "REFUND_APPROVED", refund_amount: 1000 }],
          more: true,
          next_cursor: "cursor123",
        },
      })
      .mockResolvedValueOnce({
        response: {
          return: [{ return_sn: "RT2", order_sn: "ORD1", status: "REFUND_APPROVED", refund_amount: 500 }],
          more: false,
        },
      })

    const result = await getReturnListForOrders({
      createTimeFrom: 1000,
      createTimeTo: 2000,
      orderSns: ["ORD1"],
    })

    expect(result).toHaveLength(2)
    expect(mockShopeeRequest).toHaveBeenCalledTimes(2)
  })

  it("returns empty array when Shopee API has no returns", async () => {
    mockShopeeRequest.mockResolvedValueOnce({
      response: { return: [], more: false },
    })
    const result = await getReturnListForOrders({
      createTimeFrom: 1000,
      createTimeTo: 2000,
      orderSns: ["ORD1"],
    })
    expect(result).toEqual([])
  })
})

describe("isReturnFinal", () => {
  it("treats REFUND_APPROVED as final", () => {
    expect(isReturnFinal("REFUND_APPROVED")).toBe(true)
  })
  it("treats REQUESTED/PROCESSING as not final", () => {
    expect(isReturnFinal("REQUESTED")).toBe(false)
    expect(isReturnFinal("PROCESSING")).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm vitest run lib/shopee/__tests__/returns.test.ts
```
Expected: FAIL — `Cannot find module '../returns'`

- [ ] **Step 3: Implement `lib/shopee/returns.ts`**

```ts
import { shopeeRequest } from "./client"

export interface ShopeeReturnEntry {
  return_sn: string
  order_sn: string
  status: string
  refund_amount: number
}

interface ReturnListResponse {
  response: {
    return: ShopeeReturnEntry[]
    more: boolean
    next_cursor?: string
  }
}

// Statuses meaning the return has been resolved with a refund actually
// paid out — these are the ones that mean cached escrow data is stale.
// NOTE: verify against live Shopee /api/v2/returns/get_return_list
// responses; adjust this set if the real enum differs.
const FINAL_REFUNDED_STATUSES = new Set(["REFUND_APPROVED", "COMPLETED"])

export function isReturnFinal(status: string): boolean {
  return FINAL_REFUNDED_STATUSES.has(status)
}

export async function getReturnListForOrders(params: {
  createTimeFrom: number
  createTimeTo: number
  orderSns: string[]
}): Promise<ShopeeReturnEntry[]> {
  const wanted = new Set(params.orderSns)
  const all: ShopeeReturnEntry[] = []
  let cursor: string | undefined
  let hasMore = true
  let safety = 0

  while (hasMore && safety < 20) {
    const json = await shopeeRequest<ReturnListResponse>(
      "/api/v2/returns/get_return_list",
      {
        create_time_from: params.createTimeFrom,
        create_time_to: params.createTimeTo,
        page_size: 100,
        ...(cursor ? { cursor } : {}),
      },
    )
    all.push(...json.response.return)
    hasMore = json.response.more
    cursor = json.response.next_cursor
    safety++
  }

  return all.filter((r) => wanted.has(r.order_sn))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run lib/shopee/__tests__/returns.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/shopee/returns.ts apps/dashboard/lib/shopee/__tests__/returns.test.ts
git commit -m "feat(shopee): add Returns API client for return/refund lookups"
```

---

### Task 3: Income sync + fee allocation service

**Files:**
- Create: `apps/dashboard/lib/analytics/income.ts`
- Test: `apps/dashboard/lib/analytics/__tests__/income.test.ts`

**Interfaces:**
- Consumes:
  - `getEscrowDetail(orderSn: string): Promise<ShopeeEscrowDetail | null>` from `@/lib/shopee/escrow` (existing, `lib/shopee/escrow.ts:28`)
  - `getReturnListForOrders(params): Promise<ShopeeReturnEntry[]>` and `isReturnFinal(status: string): boolean` from `@/lib/shopee/returns` (Task 2)
  - `prisma.orderEscrow.findMany/upsert` from `@/lib/db` (Task 1 model)
  - `ShopeeOrderDetail` type from `@/lib/shopee/types` (existing) — has `order_sn: string`, `order_status: string`, `update_time: number`, `total_amount: number`, `item_list: Array<{ item_id, model_id?, item_name, model_quantity_purchased, model_discounted_price }>`
- Produces (used by Task 4):
  ```ts
  export const RETURN_MUTABLE_WINDOW_DAYS = 30
  export interface OrderEscrowRow {
    orderSn: string
    buyerPaymentAmount: number
    escrowAmount: number
    commissionFee: number
    serviceFee: number
    transactionFee: number
    actualShippingFee: number
    hasReturnFlag: boolean
  }
  export async function syncAndGetEscrowForOrders(
    orders: Array<Pick<ShopeeOrderDetail, "order_sn" | "order_status" | "update_time">>,
    nowSec: number,
  ): Promise<Map<string, OrderEscrowRow>>
  export interface ProductFeeAllocation {
    productName: string
    adminFee: number | null
    received: number | null
    hasReturn: boolean
  }
  export function allocateFeePerProduct(
    orders: Array<Pick<ShopeeOrderDetail, "order_sn" | "total_amount" | "item_list">>,
    escrowByOrderSn: Map<string, OrderEscrowRow>,
  ): Map<string, ProductFeeAllocation[]> // keyed by order_sn, one entry per item line
  ```
  `nowSec` is passed in (not read from `Date.now()` internally) so tests
  can control the "current time" for window-mutability checks.

- [ ] **Step 1: Write the failing tests**

Create `apps/dashboard/lib/analytics/__tests__/income.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFindMany = vi.fn()
const mockUpsert = vi.fn()
vi.mock("@/lib/db", () => ({
  prisma: {
    orderEscrow: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}))

const mockGetEscrowDetail = vi.fn()
vi.mock("@/lib/shopee/escrow", () => ({
  getEscrowDetail: (...args: unknown[]) => mockGetEscrowDetail(...args),
}))

const mockGetReturnListForOrders = vi.fn()
vi.mock("@/lib/shopee/returns", () => ({
  getReturnListForOrders: (...args: unknown[]) => mockGetReturnListForOrders(...args),
  isReturnFinal: (status: string) => status === "REFUND_APPROVED",
}))

import { syncAndGetEscrowForOrders, allocateFeePerProduct } from "../income"

const NOW = 1_700_000_000 // fixed reference "now" in seconds

beforeEach(() => {
  mockFindMany.mockReset()
  mockUpsert.mockReset()
  mockGetEscrowDetail.mockReset()
  mockGetReturnListForOrders.mockReset()
})

describe("syncAndGetEscrowForOrders", () => {
  it("fetches escrow for a COMPLETED order missing from cache", async () => {
    mockFindMany.mockResolvedValue([]) // nothing cached
    mockGetEscrowDetail.mockResolvedValue({
      order_sn: "ORD1",
      buyer_payment_amount: 100000,
      escrow_amount: 90000,
      commission_fee: 5000,
      service_fee: 3000,
      transaction_fee: 2000,
      actual_shipping_fee: 0,
    })
    mockUpsert.mockResolvedValue({})

    const orders = [{ order_sn: "ORD1", order_status: "COMPLETED", update_time: NOW - 86400 }]
    const result = await syncAndGetEscrowForOrders(orders, NOW)

    expect(mockGetEscrowDetail).toHaveBeenCalledWith("ORD1")
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderSn: "ORD1" },
        create: expect.objectContaining({ orderSn: "ORD1", escrowAmount: 90000 }),
      }),
    )
    expect(result.get("ORD1")?.escrowAmount).toBe(90000)
  })

  it("skips non-COMPLETED orders entirely", async () => {
    mockFindMany.mockResolvedValue([])
    const orders = [{ order_sn: "ORD2", order_status: "SHIPPING", update_time: NOW }]
    const result = await syncAndGetEscrowForOrders(orders, NOW)
    expect(mockGetEscrowDetail).not.toHaveBeenCalled()
    expect(result.has("ORD2")).toBe(false)
  })

  it("does not re-fetch a cached order outside the mutable window", async () => {
    const oldCompleteTime = NOW - 40 * 86400 // 40 days ago, outside 30-day window
    mockFindMany.mockResolvedValue([
      {
        orderSn: "ORD3",
        buyerPaymentAmount: 1,
        escrowAmount: 1,
        commissionFee: 0,
        serviceFee: 0,
        transactionFee: 0,
        actualShippingFee: 0,
        hasReturnFlag: false,
        orderCompleteTime: oldCompleteTime,
      },
    ])
    const orders = [{ order_sn: "ORD3", order_status: "COMPLETED", update_time: oldCompleteTime }]

    await syncAndGetEscrowForOrders(orders, NOW)

    expect(mockGetReturnListForOrders).not.toHaveBeenCalled()
    expect(mockGetEscrowDetail).not.toHaveBeenCalled()
  })

  it("re-fetches and overwrites when a cached order inside the window has a final return", async () => {
    const recentCompleteTime = NOW - 5 * 86400 // 5 days ago, inside window
    mockFindMany.mockResolvedValue([
      {
        orderSn: "ORD4",
        buyerPaymentAmount: 100000,
        escrowAmount: 90000,
        commissionFee: 5000,
        serviceFee: 3000,
        transactionFee: 2000,
        actualShippingFee: 0,
        hasReturnFlag: false,
        orderCompleteTime: recentCompleteTime,
      },
    ])
    mockGetReturnListForOrders.mockResolvedValue([
      { return_sn: "RT1", order_sn: "ORD4", status: "REFUND_APPROVED", refund_amount: 20000 },
    ])
    mockGetEscrowDetail.mockResolvedValue({
      order_sn: "ORD4",
      buyer_payment_amount: 100000,
      escrow_amount: 70000, // reduced after refund
      commission_fee: 5000,
      service_fee: 3000,
      transaction_fee: 2000,
      actual_shipping_fee: 0,
    })
    mockUpsert.mockResolvedValue({})

    const orders = [{ order_sn: "ORD4", order_status: "COMPLETED", update_time: recentCompleteTime }]
    const result = await syncAndGetEscrowForOrders(orders, NOW)

    expect(mockGetEscrowDetail).toHaveBeenCalledWith("ORD4")
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderSn: "ORD4" },
        create: expect.objectContaining({ escrowAmount: 70000, hasReturnFlag: true }),
      }),
    )
    expect(result.get("ORD4")?.escrowAmount).toBe(70000)
    expect(result.get("ORD4")?.hasReturnFlag).toBe(true)
  })

  it("leaves cached data untouched when return check finds nothing final", async () => {
    const recentCompleteTime = NOW - 5 * 86400
    mockFindMany.mockResolvedValue([
      {
        orderSn: "ORD5",
        buyerPaymentAmount: 100000,
        escrowAmount: 90000,
        commissionFee: 5000,
        serviceFee: 3000,
        transactionFee: 2000,
        actualShippingFee: 0,
        hasReturnFlag: false,
        orderCompleteTime: recentCompleteTime,
      },
    ])
    mockGetReturnListForOrders.mockResolvedValue([])

    const orders = [{ order_sn: "ORD5", order_status: "COMPLETED", update_time: recentCompleteTime }]
    const result = await syncAndGetEscrowForOrders(orders, NOW)

    expect(mockGetEscrowDetail).not.toHaveBeenCalled()
    expect(result.get("ORD5")?.escrowAmount).toBe(90000)
  })
})

describe("allocateFeePerProduct", () => {
  it("allocates fees proportionally by item revenue share", () => {
    const escrowByOrderSn = new Map([
      [
        "ORD1",
        {
          orderSn: "ORD1",
          buyerPaymentAmount: 100000,
          escrowAmount: 90000,
          commissionFee: 6000,
          serviceFee: 3000,
          transactionFee: 1000,
          actualShippingFee: 0,
          hasReturnFlag: false,
        },
      ],
    ])
    const orders = [
      {
        order_sn: "ORD1",
        total_amount: 100000,
        item_list: [
          { item_id: 1, item_name: "Produk A", model_quantity_purchased: 1, model_discounted_price: 75000 },
          { item_id: 2, item_name: "Produk B", model_quantity_purchased: 1, model_discounted_price: 25000 },
        ],
      },
    ]

    const result = allocateFeePerProduct(orders, escrowByOrderSn)
    const lines = result.get("ORD1")!

    // Total fee = 10000, split 75/25
    expect(lines.find((l) => l.productName === "Produk A")?.adminFee).toBeCloseTo(7500)
    expect(lines.find((l) => l.productName === "Produk B")?.adminFee).toBeCloseTo(2500)
  })

  it("returns null adminFee/received for orders with no escrow entry", () => {
    const orders = [
      {
        order_sn: "ORD2",
        total_amount: 50000,
        item_list: [
          { item_id: 1, item_name: "Produk C", model_quantity_purchased: 1, model_discounted_price: 50000 },
        ],
      },
    ]
    const result = allocateFeePerProduct(orders, new Map())
    const lines = result.get("ORD2")!
    expect(lines[0].adminFee).toBeNull()
    expect(lines[0].received).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run lib/analytics/__tests__/income.test.ts
```
Expected: FAIL — `Cannot find module '../income'`

- [ ] **Step 3: Implement `lib/analytics/income.ts`**

```ts
import { prisma } from "@/lib/db"
import { getEscrowDetail } from "@/lib/shopee/escrow"
import { getReturnListForOrders, isReturnFinal } from "@/lib/shopee/returns"

export const RETURN_MUTABLE_WINDOW_DAYS = 30

export interface OrderEscrowRow {
  orderSn: string
  buyerPaymentAmount: number
  escrowAmount: number
  commissionFee: number
  serviceFee: number
  transactionFee: number
  actualShippingFee: number
  hasReturnFlag: boolean
}

interface OrderLike {
  order_sn: string
  order_status: string
  update_time: number
}

function toRow(cached: {
  orderSn: string
  buyerPaymentAmount: number
  escrowAmount: number
  commissionFee: number
  serviceFee: number
  transactionFee: number
  actualShippingFee: number
  hasReturnFlag: boolean
}): OrderEscrowRow {
  return {
    orderSn: cached.orderSn,
    buyerPaymentAmount: cached.buyerPaymentAmount,
    escrowAmount: cached.escrowAmount,
    commissionFee: cached.commissionFee,
    serviceFee: cached.serviceFee,
    transactionFee: cached.transactionFee,
    actualShippingFee: cached.actualShippingFee,
    hasReturnFlag: cached.hasReturnFlag,
  }
}

async function upsertFromEscrowDetail(
  orderSn: string,
  orderCompleteTime: number,
  hasReturnFlag: boolean,
  detail: NonNullable<Awaited<ReturnType<typeof getEscrowDetail>>>,
): Promise<OrderEscrowRow> {
  const data = {
    orderSn,
    buyerPaymentAmount: detail.buyer_payment_amount,
    escrowAmount: detail.escrow_amount,
    commissionFee: detail.commission_fee,
    serviceFee: detail.service_fee,
    transactionFee: detail.transaction_fee,
    actualShippingFee: detail.actual_shipping_fee,
    hasReturnFlag,
    orderCompleteTime,
  }
  await prisma.orderEscrow.upsert({
    where: { orderSn },
    create: data,
    update: data,
  })
  return toRow({ ...data })
}

export async function syncAndGetEscrowForOrders(
  orders: OrderLike[],
  nowSec: number,
): Promise<Map<string, OrderEscrowRow>> {
  const completed = orders.filter((o) => o.order_status === "COMPLETED")
  if (completed.length === 0) return new Map()

  const orderSns = completed.map((o) => o.order_sn)
  const cached = await prisma.orderEscrow.findMany({
    where: { orderSn: { in: orderSns } },
  })
  const cachedBySn = new Map(cached.map((c) => [c.orderSn, c]))

  const result = new Map<string, OrderEscrowRow>()

  // Tahap 1: isi cache yang kosong
  const missing = completed.filter((o) => !cachedBySn.has(o.order_sn))
  for (const order of missing) {
    const detail = await getEscrowDetail(order.order_sn)
    if (!detail) continue // skip on fetch failure, retried next load
    const row = await upsertFromEscrowDetail(
      order.order_sn,
      order.update_time,
      false,
      detail,
    )
    result.set(order.order_sn, row)
  }

  // Tahap 2: cek refund pada order dalam window mutable
  const windowSec = RETURN_MUTABLE_WINDOW_DAYS * 24 * 60 * 60
  const inWindow = completed.filter((o) => {
    const c = cachedBySn.get(o.order_sn)
    if (!c) return false // already handled in tahap 1
    return nowSec - c.orderCompleteTime <= windowSec
  })

  if (inWindow.length > 0) {
    const oldestComplete = Math.min(...inWindow.map((o) => cachedBySn.get(o.order_sn)!.orderCompleteTime))
    let returns: Awaited<ReturnType<typeof getReturnListForOrders>> = []
    try {
      returns = await getReturnListForOrders({
        createTimeFrom: oldestComplete,
        createTimeTo: nowSec,
        orderSns: inWindow.map((o) => o.order_sn),
      })
    } catch {
      returns = [] // best-effort; retried next load
    }

    const finalReturnSns = new Set(
      returns.filter((r) => isReturnFinal(r.status)).map((r) => r.order_sn),
    )

    for (const order of inWindow) {
      const cachedRow = cachedBySn.get(order.order_sn)!
      if (!finalReturnSns.has(order.order_sn)) {
        result.set(order.order_sn, toRow(cachedRow))
        continue
      }
      const detail = await getEscrowDetail(order.order_sn)
      if (!detail) {
        result.set(order.order_sn, toRow(cachedRow)) // keep stale data, retry next load
        continue
      }
      const row = await upsertFromEscrowDetail(order.order_sn, cachedRow.orderCompleteTime, true, detail)
      result.set(order.order_sn, row)
    }
  } else {
    // No orders in window among the cached ones — still surface their cached rows.
    for (const order of completed) {
      const c = cachedBySn.get(order.order_sn)
      if (c && !result.has(order.order_sn)) result.set(order.order_sn, toRow(c))
    }
  }

  return result
}

interface OrderItemLike {
  item_id: number
  item_name: string
  model_quantity_purchased: number
  model_discounted_price: number
}

interface OrderWithItemsLike {
  order_sn: string
  total_amount: number
  item_list: OrderItemLike[]
}

export interface ProductFeeAllocation {
  productName: string
  adminFee: number | null
  received: number | null
  hasReturn: boolean
}

export function allocateFeePerProduct(
  orders: OrderWithItemsLike[],
  escrowByOrderSn: Map<string, OrderEscrowRow>,
): Map<string, ProductFeeAllocation[]> {
  const result = new Map<string, ProductFeeAllocation[]>()

  for (const order of orders) {
    const escrow = escrowByOrderSn.get(order.order_sn)
    const totalFee = escrow
      ? escrow.commissionFee + escrow.serviceFee + escrow.transactionFee
      : 0

    const lines: ProductFeeAllocation[] = order.item_list.map((item) => {
      const itemRevenue = item.model_discounted_price * item.model_quantity_purchased
      const share = order.total_amount > 0 ? itemRevenue / order.total_amount : 0

      return {
        productName: item.item_name,
        adminFee: escrow ? totalFee * share : null,
        received: escrow ? escrow.escrowAmount * share : null,
        hasReturn: escrow?.hasReturnFlag ?? false,
      }
    })

    result.set(order.order_sn, lines)
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run lib/analytics/__tests__/income.test.ts
```
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/analytics/income.ts apps/dashboard/lib/analytics/__tests__/income.test.ts
git commit -m "feat(analisa): sync escrow cache + proportional fee allocation"
```

---

### Task 4: Wire income breakdown into `getAnalytics()`

**Files:**
- Modify: `apps/dashboard/lib/analytics/types.ts`
- Modify: `apps/dashboard/lib/analytics/service.ts:114-218` (the `getAnalytics` function and surrounding aggregation loop)
- Test: `apps/dashboard/lib/analytics/__tests__/service.test.ts` (create if it doesn't exist — check first with `ls apps/dashboard/lib/analytics/__tests__/` before writing; if a `service.test.ts` already exists, add these cases to it instead of creating a new file)

**Interfaces:**
- Consumes: `syncAndGetEscrowForOrders`, `allocateFeePerProduct`, `OrderEscrowRow`, `ProductFeeAllocation` from `@/lib/analytics/income` (Task 3)
- Produces: `AnalyticsData` gains two new fields consumed by Task 6's UI:
  ```ts
  export interface IncomeBreakdownSummary {
    totalBuyerPayment: number
    totalShopeePrice: number
    totalAdminFee: number
    totalReceived: number
    completedOrderCount: number
    totalOrderCount: number
  }
  export interface ProductIncomeBreakdown {
    productName: string
    qty: number
    buyerPayment: number
    shopeePrice: number
    adminFee: number | null
    received: number | null
    hasReturn: boolean
  }
  // AnalyticsData additionally has:
  // incomeSummary: IncomeBreakdownSummary
  // incomeByProduct: ProductIncomeBreakdown[]
  ```

- [ ] **Step 1: Check for an existing service test file**

```bash
ls apps/dashboard/lib/analytics/__tests__/ 2>/dev/null
```
If `service.test.ts` exists, read it first to match its existing mocking
style before adding new cases in Step 2.

- [ ] **Step 2: Write the failing test**

If no `service.test.ts` exists, create `apps/dashboard/lib/analytics/__tests__/service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  prisma: {
    productHpp: { findMany: vi.fn().mockResolvedValue([]) },
    variantHpp: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

const mockGetOrdersInRange = vi.fn()
vi.mock("@/lib/orders/service", () => ({
  getOrdersInRange: (...args: unknown[]) => mockGetOrdersInRange(...args),
}))

vi.mock("@/lib/shopee/ads", () => ({
  getAllAdsDailyPerformance: vi.fn().mockResolvedValue([]),
}))

const mockSyncAndGetEscrowForOrders = vi.fn()
const mockAllocateFeePerProduct = vi.fn()
vi.mock("@/lib/analytics/income", () => ({
  syncAndGetEscrowForOrders: (...args: unknown[]) => mockSyncAndGetEscrowForOrders(...args),
  allocateFeePerProduct: (...args: unknown[]) => mockAllocateFeePerProduct(...args),
}))

import { getAnalytics } from "../service"

beforeEach(() => {
  mockGetOrdersInRange.mockReset()
  mockSyncAndGetEscrowForOrders.mockReset()
  mockAllocateFeePerProduct.mockReset()
  process.env.SHOPEE_MOCK_ANALYTICS = "false"
})

describe("getAnalytics income breakdown", () => {
  it("aggregates incomeSummary and incomeByProduct from synced escrow", async () => {
    const order = {
      order_sn: "ORD1",
      order_status: "COMPLETED",
      create_time: Math.floor(Date.now() / 1000) - 3600,
      update_time: Math.floor(Date.now() / 1000) - 3600,
      total_amount: 100000,
      item_list: [
        { item_id: 1, item_name: "Produk A", model_quantity_purchased: 1, model_discounted_price: 100000 },
      ],
    }
    mockGetOrdersInRange.mockResolvedValue([order])

    const escrowRow = {
      orderSn: "ORD1",
      buyerPaymentAmount: 100000,
      escrowAmount: 90000,
      commissionFee: 6000,
      serviceFee: 3000,
      transactionFee: 1000,
      actualShippingFee: 0,
      hasReturnFlag: false,
    }
    mockSyncAndGetEscrowForOrders.mockResolvedValue(new Map([["ORD1", escrowRow]]))
    mockAllocateFeePerProduct.mockReturnValue(
      new Map([
        [
          "ORD1",
          [{ productName: "Produk A", adminFee: 10000, received: 90000, hasReturn: false }],
        ],
      ]),
    )

    const result = await getAnalytics("7d")

    expect(result.incomeSummary).toEqual({
      totalBuyerPayment: 100000,
      totalShopeePrice: 100000,
      totalAdminFee: 10000,
      totalReceived: 90000,
      completedOrderCount: 1,
      totalOrderCount: 1,
    })
    expect(result.incomeByProduct).toEqual([
      {
        productName: "Produk A",
        qty: 1,
        buyerPayment: 100000,
        shopeePrice: 100000,
        adminFee: 10000,
        received: 90000,
        hasReturn: false,
      },
    ])
  })

  it("marks non-completed order products as not-final (null fee/received)", async () => {
    const order = {
      order_sn: "ORD2",
      order_status: "SHIPPING",
      create_time: Math.floor(Date.now() / 1000) - 3600,
      update_time: Math.floor(Date.now() / 1000) - 3600,
      total_amount: 50000,
      item_list: [
        { item_id: 2, item_name: "Produk B", model_quantity_purchased: 1, model_discounted_price: 50000 },
      ],
    }
    mockGetOrdersInRange.mockResolvedValue([order])
    mockSyncAndGetEscrowForOrders.mockResolvedValue(new Map())
    mockAllocateFeePerProduct.mockReturnValue(
      new Map([["ORD2", [{ productName: "Produk B", adminFee: null, received: null, hasReturn: false }]]]),
    )

    const result = await getAnalytics("7d")

    expect(result.incomeByProduct[0]).toEqual({
      productName: "Produk B",
      qty: 1,
      buyerPayment: 50000,
      shopeePrice: 50000,
      adminFee: null,
      received: null,
      hasReturn: false,
    })
    expect(result.incomeSummary.completedOrderCount).toBe(0)
    expect(result.incomeSummary.totalOrderCount).toBe(1)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run lib/analytics/__tests__/service.test.ts
```
Expected: FAIL — `incomeSummary` is `undefined` (property doesn't exist yet)

- [ ] **Step 4: Add types to `lib/analytics/types.ts`**

Add these interfaces and extend `AnalyticsData` (append before the closing
of the file, and add the two new fields to the existing `AnalyticsData`
interface):

```ts
export interface IncomeBreakdownSummary {
  totalBuyerPayment: number
  totalShopeePrice: number
  totalAdminFee: number
  totalReceived: number
  completedOrderCount: number
  totalOrderCount: number
}

export interface ProductIncomeBreakdown {
  productName: string
  qty: number
  buyerPayment: number
  shopeePrice: number
  adminFee: number | null
  received: number | null
  hasReturn: boolean
}
```

Then modify the existing `AnalyticsData` interface (`lib/analytics/types.ts:14-29`)
to add two fields after `topProducts: TopProduct[]`:
```ts
  topProducts: TopProduct[]
  incomeSummary: IncomeBreakdownSummary
  incomeByProduct: ProductIncomeBreakdown[]
}
```

- [ ] **Step 5: Wire into `lib/analytics/service.ts`**

Add the import at the top of the file (after the existing imports at line 6):
```ts
import { syncAndGetEscrowForOrders, allocateFeePerProduct } from "./income"
import type { IncomeBreakdownSummary, ProductIncomeBreakdown } from "./types"
```

Inside `getAnalytics()`, after the existing order-aggregation loop
(`lib/analytics/service.ts:149-169`, which builds `productMap`/`totalOmzet`)
and before the ads-aggregation block, insert:

```ts
  // Income breakdown: sync escrow cache, allocate fees per product
  const nowSec = Math.floor(Date.now() / 1000)
  const escrowByOrderSn = await syncAndGetEscrowForOrders(orders, nowSec)
  const feeByOrderSn = allocateFeePerProduct(orders, escrowByOrderSn)

  const incomeByProductMap = new Map<string, ProductIncomeBreakdown>()
  for (const order of orders) {
    const lines = feeByOrderSn.get(order.order_sn) ?? []
    for (let i = 0; i < order.item_list.length; i++) {
      const item = order.item_list[i]
      const line = lines[i]
      const existing = incomeByProductMap.get(item.item_name) ?? {
        productName: item.item_name,
        qty: 0,
        buyerPayment: 0,
        shopeePrice: 0,
        adminFee: line.adminFee !== null ? 0 : null,
        received: line.received !== null ? 0 : null,
        hasReturn: false,
      }
      existing.qty += item.model_quantity_purchased
      existing.shopeePrice += item.model_discounted_price * item.model_quantity_purchased
      existing.buyerPayment += item.model_discounted_price * item.model_quantity_purchased
      if (line.adminFee !== null) {
        existing.adminFee = (existing.adminFee ?? 0) + line.adminFee
      }
      if (line.received !== null) {
        existing.received = (existing.received ?? 0) + line.received
      }
      existing.hasReturn = existing.hasReturn || line.hasReturn
      incomeByProductMap.set(item.item_name, existing)
    }
  }
  const incomeByProduct = Array.from(incomeByProductMap.values())

  const completedOrderCount = orders.filter((o) => o.order_status === "COMPLETED").length
  const incomeSummary: IncomeBreakdownSummary = {
    totalBuyerPayment: incomeByProduct.reduce((s, p) => s + p.buyerPayment, 0),
    totalShopeePrice: incomeByProduct.reduce((s, p) => s + p.shopeePrice, 0),
    totalAdminFee: incomeByProduct.reduce((s, p) => s + (p.adminFee ?? 0), 0),
    totalReceived: incomeByProduct.reduce((s, p) => s + (p.received ?? 0), 0),
    completedOrderCount,
    totalOrderCount: orders.length,
  }
```

Then add `incomeSummary` and `incomeByProduct` to the object returned at
the end of `getAnalytics()` (`lib/analytics/service.ts:202-217`):
```ts
  return {
    range: { startDate: r.startDate, endDate: r.endDate },
    fetchedAt: new Date().toISOString(),
    kpi: { /* ...unchanged... */ },
    daily,
    topProducts,
    incomeSummary,
    incomeByProduct,
  }
```

Note: `order.item_list[i]`/`lines[i]` pairing relies on `allocateFeePerProduct`
(Task 3) producing one line per `item_list` entry in the same order — this
is guaranteed by its implementation (`order.item_list.map(...)`).

- [ ] **Step 6: Handle escrow/returns sync failures without breaking the page (spec §7)**

Wrap the sync call so a hard failure (e.g. Shopee API down) still lets
`daily`/`topProducts`/`kpi` render. Replace the `syncAndGetEscrowForOrders`
call from Step 5 with:
```ts
  let escrowByOrderSn = new Map<string, Awaited<ReturnType<typeof syncAndGetEscrowForOrders>> extends Map<string, infer V> ? V : never>()
  try {
    escrowByOrderSn = await syncAndGetEscrowForOrders(orders, nowSec)
  } catch (err) {
    console.error("[analytics] escrow sync failed, income breakdown will show as not-final:", err)
  }
```
(This replaces the plain `const escrowByOrderSn = await syncAndGetEscrowForOrders(orders, nowSec)` line from Step 5 — same variable, now defensively wrapped.)

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm vitest run lib/analytics/__tests__/service.test.ts lib/analytics/__tests__/income.test.ts
```
Expected: PASS (all tests green)

- [ ] **Step 8: Run the full analytics test suite + typecheck**

```bash
pnpm vitest run lib/analytics
pnpm tsc --noEmit
```
Expected: all pass, no type errors

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/lib/analytics/types.ts apps/dashboard/lib/analytics/service.ts apps/dashboard/lib/analytics/__tests__/service.test.ts
git commit -m "feat(analisa): wire income breakdown into getAnalytics()"
```

---

### Task 5: Fix the date-range filter bug

**Files:**
- Modify: `apps/dashboard/app/api/analytics/route.ts`
- Modify: `apps/dashboard/lib/hooks/use-analytics.ts`
- Test: `apps/dashboard/app/api/analytics/__tests__/route.test.ts` (create — check `ls apps/dashboard/app/api/analytics/__tests__/` first in case one already exists for other assertions)

**Interfaces:**
- Consumes: `resolveRange`, `isCustomRange`, `FlexRange`, `DateRangePreset` from `@/lib/dateRange` (existing)
- Produces: `parseRangeFromSearchParams(searchParams: URLSearchParams): FlexRange` (new exported helper in `route.ts`, testable in isolation); `fetchAnalytics(range: FlexRange)` in the hook now builds a correct query string for both presets and custom ranges.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/app/api/analytics/__tests__/route.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseRangeFromSearchParams } from "../route"

describe("parseRangeFromSearchParams", () => {
  it("parses known presets", () => {
    expect(parseRangeFromSearchParams(new URLSearchParams("range=this_week"))).toBe("this_week")
    expect(parseRangeFromSearchParams(new URLSearchParams("range=this_month"))).toBe("this_month")
    expect(parseRangeFromSearchParams(new URLSearchParams("range=30d"))).toBe("30d")
  })

  it("parses a custom range when from/to are present", () => {
    const params = new URLSearchParams("range=custom&from=2026-08-01&to=2026-08-10")
    expect(parseRangeFromSearchParams(params)).toEqual({ from: "2026-08-01", to: "2026-08-10" })
  })

  it("falls back to 7d for missing or invalid range", () => {
    expect(parseRangeFromSearchParams(new URLSearchParams(""))).toBe("7d")
    expect(parseRangeFromSearchParams(new URLSearchParams("range=bogus"))).toBe("7d")
  })

  it("falls back to 7d when custom is requested but from/to are missing", () => {
    expect(parseRangeFromSearchParams(new URLSearchParams("range=custom"))).toBe("7d")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run app/api/analytics/__tests__/route.test.ts
```
Expected: FAIL — `parseRangeFromSearchParams` is not exported from `../route`

- [ ] **Step 3: Rewrite `parseRange` in `route.ts`**

Replace the entire `parseRange` function (`app/api/analytics/route.ts:7-10`)
with:

```ts
import type { FlexRange, DateRangePreset } from "@/lib/dateRange"

const KNOWN_PRESETS: DateRangePreset[] = ["7d", "30d", "this_week", "this_month", "custom"]

export function parseRangeFromSearchParams(searchParams: URLSearchParams): FlexRange {
  const raw = searchParams.get("range")
  if (raw === "custom") {
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    if (from && to) return { from, to }
    return "7d"
  }
  if (raw && (KNOWN_PRESETS as string[]).includes(raw) && raw !== "custom") {
    return raw as DateRangePreset
  }
  return "7d"
}
```

Then update the `GET` handler to use it — replace this line:
```ts
  const range = parseRange(req.nextUrl.searchParams.get("range"))
```
with:
```ts
  const range = parseRangeFromSearchParams(req.nextUrl.searchParams)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run app/api/analytics/__tests__/route.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Fix the client hook's query serialization**

The root cause on the client side: `fetchAnalytics` in
`lib/hooks/use-analytics.ts:8-15` does
`` fetch(`/api/analytics?range=${range}`) `` — when `range` is a custom
object `{from, to}`, template-string interpolation produces the literal
string `[object Object]`. Replace the whole `fetchAnalytics` function with:

```ts
import { isCustomRange, type FlexRange } from "@/lib/dateRange"

async function fetchAnalytics(range: AnalyticsRange): Promise<AnalyticsData> {
  const params = new URLSearchParams()
  if (isCustomRange(range)) {
    params.set("range", "custom")
    params.set("from", range.from)
    params.set("to", range.to)
  } else {
    params.set("range", range)
  }
  const res = await fetch(`/api/analytics?${params.toString()}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}
```

Also update the `queryKey` in `useAnalytics` (`lib/hooks/use-analytics.ts:19`)
so TanStack Query treats different custom ranges as different cache
entries (currently `["analytics", range]` already includes the whole
`range` value, including custom objects, so no change needed there — verify
this by reading the current file content before editing, since object
identity inside `queryKey` is compared by TanStack Query via structural
hashing, which handles this correctly already).

- [ ] **Step 6: Manual verification in the browser**

Start the dev server and confirm the filter now actually changes data:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter shopee-dashboard dev
```
Open `/analisa`, switch between "7 Hari" / "Minggu Ini" / "Bulan Ini" /
custom dates, and confirm (via Network tab or visible KPI changes) that
each selection sends a different `range`/`from`/`to` query and returns
different `range.startDate`/`range.endDate` in the response.

- [ ] **Step 7: Run full test suite + typecheck**

```bash
pnpm vitest run
pnpm tsc --noEmit
```
Expected: all green

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/app/api/analytics/route.ts apps/dashboard/app/api/analytics/__tests__/route.test.ts apps/dashboard/lib/hooks/use-analytics.ts
git commit -m "fix(analisa): actually forward the selected date range to the API"
```

---

### Task 6: Income breakdown UI section

**Files:**
- Create: `apps/dashboard/components/analytics/IncomeBreakdownSection.tsx`
- Test: `apps/dashboard/components/analytics/__tests__/IncomeBreakdownSection.test.tsx` (check `ls apps/dashboard/components/analytics/__tests__/` first to match the existing render-test pattern used for `ProfitCard`/`TopProductsChart`, e.g. via `renderToStaticMarkup` per this repo's documented SSR test convention)
- Modify: `apps/dashboard/app/(dashboard)/analisa/page.tsx`

**Interfaces:**
- Consumes: `IncomeBreakdownSummary`, `ProductIncomeBreakdown` from `@/lib/analytics/types` (Task 4); `Card`/`CardContent` from `@/components/ui/card` (existing, used by `ProfitCard.tsx`)
- Produces: `IncomeBreakdownSection({ summary, products }: { summary: IncomeBreakdownSummary; products: ProductIncomeBreakdown[] })` — default export not used, named export to match `ProfitCard`'s pattern (`export function ProfitCard(...)`).

- [ ] **Step 1: Check the existing component test pattern**

```bash
ls apps/dashboard/components/analytics/__tests__/ 2>/dev/null
cat apps/dashboard/components/analytics/__tests__/ProfitCard.test.tsx 2>/dev/null || find apps/dashboard/components/analytics -name "*.test.tsx" | head -1 | xargs cat
```
Use whatever render/assertion style that file uses (likely
`renderToStaticMarkup` from `react-dom/server`, per this repo's SSR test
convention noted in prior work) for Step 2 below — adapt the exact import
if it differs from the sketch here.

- [ ] **Step 2: Write the failing test**

Create `apps/dashboard/components/analytics/__tests__/IncomeBreakdownSection.test.tsx`
(adjust the render call to match the pattern found in Step 1 if different):

```tsx
import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { IncomeBreakdownSection } from "../IncomeBreakdownSection"
import type { IncomeBreakdownSummary, ProductIncomeBreakdown } from "@/lib/analytics/types"

const summary: IncomeBreakdownSummary = {
  totalBuyerPayment: 100000,
  totalShopeePrice: 100000,
  totalAdminFee: 10000,
  totalReceived: 90000,
  completedOrderCount: 1,
  totalOrderCount: 2,
}

const products: ProductIncomeBreakdown[] = [
  {
    productName: "Produk A",
    qty: 1,
    buyerPayment: 100000,
    shopeePrice: 100000,
    adminFee: 10000,
    received: 90000,
    hasReturn: true,
  },
  {
    productName: "Produk B (belum final)",
    qty: 1,
    buyerPayment: 50000,
    shopeePrice: 50000,
    adminFee: null,
    received: null,
    hasReturn: false,
  },
]

describe("IncomeBreakdownSection", () => {
  it("renders summary totals and coverage count", () => {
    const html = renderToStaticMarkup(<IncomeBreakdownSection summary={summary} products={products} />)
    expect(html).toContain("1 dari 2")
  })

  it("marks not-final rows and return-flagged rows", () => {
    const html = renderToStaticMarkup(<IncomeBreakdownSection summary={summary} products={products} />)
    expect(html).toContain("Produk A")
    expect(html).toContain("Ada refund")
    expect(html).toContain("Produk B (belum final)")
    expect(html).toContain("Belum final")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run components/analytics/__tests__/IncomeBreakdownSection.test.tsx
```
Expected: FAIL — `Cannot find module '../IncomeBreakdownSection'`

- [ ] **Step 4: Implement `IncomeBreakdownSection.tsx`**

```tsx
"use client"

import { Card, CardContent } from "@/components/ui/card"
import type { IncomeBreakdownSummary, ProductIncomeBreakdown } from "@/lib/analytics/types"

interface Props {
  summary: IncomeBreakdownSummary
  products: ProductIncomeBreakdown[]
}

function fmt(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtOrNull(amount: number | null): string {
  return amount === null ? "Belum final" : fmt(amount)
}

export function IncomeBreakdownSection({ summary, products }: Props) {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">📊 Breakdown Penghasilan</h3>
          <p className="text-xs text-gray-400">
            {summary.completedOrderCount} dari {summary.totalOrderCount} order sudah final (selesai)
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-gray-500 text-xs">Buyer Bayar</div>
            <div className="font-medium">{fmt(summary.totalBuyerPayment)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Harga Shopee</div>
            <div className="font-medium">{fmt(summary.totalShopeePrice)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Biaya Admin</div>
            <div className="font-medium text-red-600">{fmt(summary.totalAdminFee)}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs">Diterima Bersih</div>
            <div className="font-medium text-green-700">{fmt(summary.totalReceived)}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs border-b">
                <th className="py-1 pr-2">Produk</th>
                <th className="py-1 pr-2 text-right">Qty</th>
                <th className="py-1 pr-2 text-right">Buyer Bayar</th>
                <th className="py-1 pr-2 text-right">Harga Shopee</th>
                <th className="py-1 pr-2 text-right">Biaya Admin</th>
                <th className="py-1 text-right">Diterima</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.productName} className="border-b last:border-0">
                  <td className="py-1 pr-2">
                    {p.productName}
                    {p.hasReturn && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                        Ada refund
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-2 text-right">{p.qty}</td>
                  <td className="py-1 pr-2 text-right">{fmt(p.buyerPayment)}</td>
                  <td className="py-1 pr-2 text-right">{fmt(p.shopeePrice)}</td>
                  <td
                    className={`py-1 pr-2 text-right ${p.adminFee === null ? "italic text-gray-400" : ""}`}
                  >
                    {fmtOrNull(p.adminFee)}
                  </td>
                  <td className={`py-1 text-right ${p.received === null ? "italic text-gray-400" : ""}`}>
                    {fmtOrNull(p.received)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400">
          Biaya admin per produk adalah estimasi proporsional dari total biaya per order,
          karena Shopee tidak menyediakan rincian biaya per item.
        </p>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run components/analytics/__tests__/IncomeBreakdownSection.test.tsx
```
Expected: PASS (2 tests)

- [ ] **Step 6: Render the section on `/analisa`**

Modify `apps/dashboard/app/(dashboard)/analisa/page.tsx`:

Add the import near the other component imports (after line 7):
```tsx
import { IncomeBreakdownSection } from "@/components/analytics/IncomeBreakdownSection"
```

Add the section in the JSX, after the existing `<div className="grid ...">`
block containing `TopProductsChart`/`ProfitCard` (currently
`page.tsx:74-77`):
```tsx
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TopProductsChart products={data.topProducts} />
          <ProfitCard kpi={data.kpi} />
        </div>

        <IncomeBreakdownSection summary={data.incomeSummary} products={data.incomeByProduct} />
```

- [ ] **Step 7: Manual verification in the browser**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter shopee-dashboard dev
```
Open `/analisa`, confirm the new "Breakdown Penghasilan" card renders below
the existing charts with the 4 summary numbers and the per-product table.
If `SHOPEE_MOCK_ANALYTICS=true` is set in `.env.local`, note that
`generateMockAnalytics` (in `lib/analytics/mock.ts`) does NOT produce
`incomeSummary`/`incomeByProduct` yet — see Task 7 below for that fix
before this can be verified end-to-end against mock data.

- [ ] **Step 8: Run full test suite + typecheck**

```bash
pnpm vitest run
pnpm tsc --noEmit
```
Expected: all green

- [ ] **Step 9: Commit**

```bash
git add apps/dashboard/components/analytics/IncomeBreakdownSection.tsx apps/dashboard/components/analytics/__tests__/IncomeBreakdownSection.test.tsx apps/dashboard/app/\(dashboard\)/analisa/page.tsx
git commit -m "feat(analisa): render income breakdown section on the Analisa page"
```

---

### Task 7: Extend mock analytics generator

**Files:**
- Modify: `apps/dashboard/lib/analytics/mock.ts`
- Test: `apps/dashboard/lib/analytics/__tests__/mock.test.ts` (create if none exists — check first)

**Interfaces:**
- Consumes: `IncomeBreakdownSummary`, `ProductIncomeBreakdown` from `@/lib/analytics/types` (Task 4)
- Produces: `generateMockAnalytics(startDate: string, endDate: string): AnalyticsData` now also returns valid `incomeSummary`/`incomeByProduct` so `SHOPEE_MOCK_ANALYTICS=true` local dev (documented in this repo's CLAUDE.md/session history as the standard way to run `/analisa` without live Shopee credentials) doesn't crash the new UI section.

- [ ] **Step 1: Read the current mock generator**

```bash
cat apps/dashboard/lib/analytics/mock.ts
```
Note its existing shape for `topProducts` — reuse the same product names
and proportions to keep the mock internally consistent.

- [ ] **Step 2: Write the failing test**

Create `apps/dashboard/lib/analytics/__tests__/mock.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { generateMockAnalytics } from "../mock"

describe("generateMockAnalytics", () => {
  it("includes a non-empty income breakdown consistent with topProducts", () => {
    const data = generateMockAnalytics("2026-08-01", "2026-08-07")

    expect(data.incomeSummary.totalBuyerPayment).toBeGreaterThan(0)
    expect(data.incomeSummary.totalShopeePrice).toBeGreaterThan(0)
    expect(data.incomeSummary.completedOrderCount).toBeGreaterThan(0)
    expect(data.incomeByProduct.length).toBe(data.topProducts.length)

    for (const p of data.incomeByProduct) {
      expect(p.adminFee).not.toBeNull()
      expect(p.received).not.toBeNull()
      expect(p.received!).toBeLessThan(p.buyerPayment)
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run lib/analytics/__tests__/mock.test.ts
```
Expected: FAIL — `incomeSummary` undefined

- [ ] **Step 4: Extend the mock generator**

Add this logic to `generateMockAnalytics` in `lib/analytics/mock.ts`, right
before its `return` statement (read the actual current variable names from
Step 1's output and adapt — the sketch below assumes it already computes a
`topProducts: TopProduct[]` array in scope, matching the real type from
`lib/analytics/types.ts`):

```ts
  const incomeByProduct: ProductIncomeBreakdown[] = topProducts.map((p) => {
    const adminFee = Math.round(p.omzet * 0.08) // mock: ~8% total Shopee fees
    return {
      productName: p.productName,
      qty: p.qty,
      buyerPayment: p.omzet,
      shopeePrice: p.omzet,
      adminFee,
      received: p.omzet - adminFee,
      hasReturn: false,
    }
  })

  const incomeSummary: IncomeBreakdownSummary = {
    totalBuyerPayment: incomeByProduct.reduce((s, p) => s + p.buyerPayment, 0),
    totalShopeePrice: incomeByProduct.reduce((s, p) => s + p.shopeePrice, 0),
    totalAdminFee: incomeByProduct.reduce((s, p) => s + (p.adminFee ?? 0), 0),
    totalReceived: incomeByProduct.reduce((s, p) => s + (p.received ?? 0), 0),
    completedOrderCount: totalOrders, // reuse whatever mock order-count variable is already in scope
    totalOrderCount: totalOrders,
  }
```

Add `incomeSummary` and `incomeByProduct` to the returned `AnalyticsData`
object, and add the import at the top of the file:
```ts
import type { AnalyticsData, DailyPoint, TopProduct, IncomeBreakdownSummary, ProductIncomeBreakdown } from "./types"
```

If the mock file's actual variable name for total order count differs from
`totalOrders` (verify in Step 1's output), use that variable instead.

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run lib/analytics/__tests__/mock.test.ts
```
Expected: PASS

- [ ] **Step 6: Run full test suite + typecheck**

```bash
pnpm vitest run
pnpm tsc --noEmit
```
Expected: all green

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/lib/analytics/mock.ts apps/dashboard/lib/analytics/__tests__/mock.test.ts
git commit -m "feat(analisa): include income breakdown in mock analytics data"
```

---

## Self-Review Notes

**Spec coverage:**
- Bug fix (filter tanggal) → Task 5. ✅
- `OrderEscrow` schema → Task 1. ✅
- Returns API module → Task 2. ✅
- Sync logic (fill cache, re-check mutable window, overwrite on final
  return) → Task 3. ✅
- Fee allocation proportional per product → Task 3 (`allocateFeePerProduct`). ✅
- `AnalyticsData` extension + service wiring → Task 4. ✅
- UI summary card + per-product table + badges/footnote → Task 6. ✅
- Error handling (escrow/returns failures don't break the page) → Task 4
  Step 6, Task 3's per-order try/skip semantics. ✅
- Testing section of spec → covered by each task's own test files. ✅
- Mock data consistency (not explicitly in spec, but required for local
  dev per this repo's `SHOPEE_MOCK_ANALYTICS` convention) → Task 7, added
  during self-review as a gap-fill. ✅

**Out of scope (per spec, intentionally not planned):** return/dispute
detail UI, escrow change history/audit trail, automatic backfill for old
orders. None of these have tasks — correct.

**Type consistency check:** `OrderEscrowRow`, `ProductFeeAllocation`,
`IncomeBreakdownSummary`, `ProductIncomeBreakdown` field names verified
identical across Task 3 → Task 4 → Task 6 → Task 7 (`adminFee`, `received`,
`hasReturn`, `productName`, `qty`, `buyerPayment`, `shopeePrice`).
