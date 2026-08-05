# Pengiriman Massal (Shopee bulk print resi) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/order/pengiriman` page in `apps/dashboard` where the team can select multiple Shopee "Ready to Ship" orders, arrange shipment (pickup or drop-off to counter), generate Shopee's shipping documents, and print the resulting combined PDF resi — without leaving the internal dashboard.

**Architecture:** New `lib/shopee/logistics.ts` wraps four Shopee Logistics API v2 endpoints, reusing the existing `shopeeRequest` (GET) helper in `lib/shopee/client.ts` where possible and a new `shopeeRequestPost` helper (added to `client.ts`) for the three endpoints that need a JSON body. Two new auth-gated API routes (`/api/shopee/logistics/ship`, `/api/shopee/logistics/document`) sit in front of it. A new client-side page composes a purpose-built selectable order list with a 3-step flow (select → arrange shipment → generate & print), reusing the existing `getReadyToShipOrders()` data layer — no new order-fetching logic.

**Tech Stack:** Next.js 16 (App Router, `"use client"` pages), TypeScript, Vitest, existing `lib/shopee/client.ts` HMAC-signed request infra, Prisma-backed order data via `lib/orders/service.ts`.

## Global Constraints

- Scope is **Shopee only** — no Tokopedia changes in this plan.
- Both **pickup** and **drop-off to counter** must be supported, selected by the user per batch.
- The printed resi must be **Shopee's own original PDF** (from `download_shipping_document`) — never a custom-designed label.
- `create_shipping_document`/`download_shipping_document` accept an **array of orders and return one combined PDF** — never call them one order at a time.
- v1 auto-selects the **first available pickup time slot** — no manual slot-picker UI.
- Partial failure (some orders fail to ship) is a **normal, expected state** — every step must report per-order success/failure, never all-or-nothing.
- New page lives at `apps/dashboard/app/(dashboard)/order/pengiriman/page.tsx`, wrapped in `PageShell` (title required), and is **self-contained** — it fetches and selects its own orders, not dependent on selection state from `/order`.
- Every new route file starts with the exact auth-gate block already used throughout `apps/dashboard/app/api/shopee/*`:
  ```ts
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  ```
- Test files go in sibling `__tests__/` directories (e.g. `lib/shopee/__tests__/logistics.test.ts`), matching every existing test in `lib/shopee/`.

---

## File Structure

```
apps/dashboard/lib/shopee/client.ts                          [MODIFY] add shopeeRequestPost + shopeeDownloadDocument
apps/dashboard/lib/shopee/logistics.ts                        [CREATE] getShippingParameter, shipOrder, createShippingDocument, getShippingDocumentResult, downloadShippingDocument
apps/dashboard/lib/shopee/__tests__/logistics.test.ts         [CREATE]
apps/dashboard/lib/shopee/__tests__/client.test.ts            [CREATE] (new POST helper coverage)
apps/dashboard/app/api/shopee/logistics/ship/route.ts          [CREATE] POST — resolves pickup slot server-side, arranges shipment for a batch of orders
apps/dashboard/app/api/shopee/logistics/ship/__tests__/route.test.ts [CREATE]
apps/dashboard/app/api/shopee/logistics/document/route.ts      [CREATE] POST — generate + return combined PDF
apps/dashboard/app/api/shopee/logistics/document/__tests__/route.test.ts [CREATE]
apps/dashboard/components/order/BulkShippingOrderList.tsx      [CREATE] selectable order list (checkboxes)
apps/dashboard/components/order/__tests__/BulkShippingOrderList.test.tsx [CREATE]
apps/dashboard/app/(dashboard)/order/pengiriman/page.tsx       [CREATE] the 3-step page
apps/dashboard/app/(dashboard)/order/page.tsx                  [MODIFY] add entry-point link/button to the new page
```

---

### Task 1: `shopeeRequestPost` helper + `getShippingParameter`

**Files:**
- Modify: `apps/dashboard/lib/shopee/client.ts`
- Create: `apps/dashboard/lib/shopee/logistics.ts`
- Create: `apps/dashboard/lib/shopee/__tests__/client.test.ts`
- Create: `apps/dashboard/lib/shopee/__tests__/logistics.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (first task).
- Produces:
  - `shopeeRequestPost<T = unknown>(path: string, params: Record<string, string | number>, body: Record<string, unknown>): Promise<T>` — exported from `client.ts`, used by Tasks 2 & 3.
  - `getShippingParameter(orderSn: string): Promise<ShippingParameter>` — exported from `logistics.ts`.
  - `interface ShippingParameter { pickup: { addressId: number; timeSlotId: string | null } | null; dropoff: { branchList: { branchId: number; address: string }[] } | null }` — exported from `logistics.ts`, consumed by Task 2 and the page (Task 5).

`apps/dashboard/lib/shopee/client.ts` currently exports `shopeeRequest<T>(path, params, options?)` which is **hardcoded to GET** — it builds a signed `URLSearchParams` query string and does a bare `fetch(url)`. It does not support a request body. Read the file first; the new helper must reuse the exact same signing/token/retry logic, just switch the HTTP method and add a JSON body.

- [ ] **Step 1: Read the existing client to copy its signing/retry logic exactly**

Read `apps/dashboard/lib/shopee/client.ts` in full before writing `shopeeRequestPost` — copy its `signShopApi`, token-refresh-on-`error_auth`, and transient-retry (`error_server`/`error_network`/`error_inner`, up to 3 attempts, 500ms/1s/2s backoff) behavior verbatim, only changing the `fetch` call to `POST` with a JSON body. Do not duplicate the signing math into a second implementation — extract the shared parts into a private helper both `shopeeRequest` and `shopeeRequestPost` call, e.g.:

```ts
async function buildSignedUrl(path: string, params: Record<string, string | number>): Promise<URL> {
  const shopId = await getShopId()
  const { accessToken } = await getTokens()
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = signShopApi(path, timestamp, accessToken, shopId)
  const url = new URL(`${SHOPEE_HOST}${path}`)
  url.searchParams.set("partner_id", String(PARTNER_ID))
  url.searchParams.set("shop_id", String(shopId))
  url.searchParams.set("timestamp", String(timestamp))
  url.searchParams.set("access_token", accessToken)
  url.searchParams.set("sign", sign)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  return url
}
```

(Exact constant names `SHOPEE_HOST`/`PARTNER_ID`/`getShopId`/`getTokens`/`signShopApi` must match whatever `client.ts` actually calls them — adjust to match, this is illustrative of the refactor shape, not a literal diff.)

- [ ] **Step 2: Write the failing test for `shopeeRequestPost`**

```ts
// apps/dashboard/lib/shopee/__tests__/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// client.ts reads shop id / tokens from prisma — mock the same way existing
// client-dependent tests in this repo mock prisma (check lib/shopee/__tests__/orders.test.ts
// or lib/shopee/client.ts's own existing tests, if any, for the exact prisma mock shape
// before writing this — copy that pattern here rather than re-guessing it).

import { shopeeRequestPost } from "@/lib/shopee/client"

describe("shopeeRequestPost", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("sends a POST with a JSON body to the signed URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { ok: true } }),
    })

    await shopeeRequestPost("/api/v2/logistics/ship_order", { order_sn: "S1" }, { pickup: { address_id: 1 } })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [urlArg, initArg] = mockFetch.mock.calls[0]
    expect(String(urlArg)).toContain("/api/v2/logistics/ship_order")
    expect(String(urlArg)).toContain("order_sn=S1")
    expect(initArg.method).toBe("POST")
    expect(JSON.parse(initArg.body)).toEqual({ pickup: { address_id: 1 } })
    expect(initArg.headers["Content-Type"]).toBe("application/json")
  })

  it("throws when Shopee returns an error field", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: "error_param", message: "invalid order_sn" }),
    })

    await expect(
      shopeeRequestPost("/api/v2/logistics/ship_order", { order_sn: "BAD" }, {}),
    ).rejects.toThrow(/invalid order_sn/)
  })
})
```

**Before finalizing this test**, open `apps/dashboard/lib/shopee/__tests__/orders.test.ts` (or any other existing test in `lib/shopee/__tests__/` that exercises `shopeeRequest` against a real fetch mock, not just a `vi.mock("@/lib/shopee/client")` shortcut) to see exactly how shop id / access token resolution is mocked at the `fetch`/prisma layer for this kind of lower-level test. Match that setup instead of inventing a new one — the snippet above is illustrative of intent (assert method/body/URL), not a literal copy-paste.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run lib/shopee/__tests__/client.test.ts`
Expected: FAIL — `shopeeRequestPost` is not exported / not defined.

- [ ] **Step 4: Implement `shopeeRequestPost` in `client.ts`**

Add alongside the existing `shopeeRequest`, exporting a POST-capable sibling that reuses the shared signing helper from Step 1:

```ts
export async function shopeeRequestPost<T = unknown>(
  path: string,
  params: Record<string, string | number>,
  body: Record<string, unknown>,
  options: { transientAttempt?: number } = {},
): Promise<T> {
  const url = await buildSignedUrl(path, params)
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  })
  const json = await res.json()

  if (json.error) {
    // Match shopeeRequest's existing token-refresh + transient-retry behavior:
    // re-run the same error-branch logic (error_auth → refresh + 1 retry;
    // error_server/error_network/error_inner → retry up to 3x with backoff)
    // by extracting it into a shared handler both functions call, rather than
    // duplicating the branches here. See Step 1 — factor this out first.
    throw new Error(`Shopee API error (${json.error}): ${json.message ?? "unknown"}`)
  }

  return json as T
}
```

Follow the existing file's exact error/retry branching (don't skip the token-refresh-on-`error_auth` case — a POST call can hit an expired token exactly like a GET call). If `shopeeRequest`'s retry/refresh logic isn't already factored into a reusable function, extract it now so both `shopeeRequest` and `shopeeRequestPost` call the same error-handling path — do not write two copies of the retry logic.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run lib/shopee/__tests__/client.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the failing test for `getShippingParameter`**

```ts
// apps/dashboard/lib/shopee/__tests__/logistics.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/shopee/client", () => ({ shopeeRequest: vi.fn(), shopeeRequestPost: vi.fn() }))

import { getShippingParameter } from "@/lib/shopee/logistics"
import { shopeeRequest } from "@/lib/shopee/client"

const mockRequest = shopeeRequest as any

describe("getShippingParameter", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("maps a pickup response", async () => {
    mockRequest.mockResolvedValue({
      response: {
        pickup: { address_list: [{ address_id: 111, time_slot_list: [{ pickup_time_id: "slot-1" }] }] },
        dropoff: null,
      },
    })
    const result = await getShippingParameter("S1")
    expect(mockRequest).toHaveBeenCalledWith("/api/v2/logistics/get_shipping_parameter", { order_sn: "S1" })
    expect(result).toEqual({
      pickup: { addressId: 111, timeSlotId: "slot-1" },
      dropoff: null,
    })
  })

  it("maps a dropoff-only response (no time slots)", async () => {
    mockRequest.mockResolvedValue({
      response: {
        pickup: null,
        dropoff: { branch_list: [{ branch_id: 42, address: "Jl. Counter No. 1" }] },
      },
    })
    const result = await getShippingParameter("S2")
    expect(result).toEqual({
      pickup: null,
      dropoff: { branchList: [{ branchId: 42, address: "Jl. Counter No. 1" }] },
    })
  })

  it("returns null pickup when no time slot is available", async () => {
    mockRequest.mockResolvedValue({
      response: { pickup: { address_list: [{ address_id: 111, time_slot_list: [] }] }, dropoff: null },
    })
    const result = await getShippingParameter("S3")
    expect(result.pickup).toEqual({ addressId: 111, timeSlotId: null })
  })
})
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run lib/shopee/__tests__/logistics.test.ts`
Expected: FAIL — `apps/dashboard/lib/shopee/logistics.ts` does not exist yet.

- [ ] **Step 8: Implement `logistics.ts` with `getShippingParameter`**

```ts
// apps/dashboard/lib/shopee/logistics.ts
import { shopeeRequest, shopeeRequestPost } from "./client"

interface ShippingParameterResponse {
  response: {
    pickup: { address_list: { address_id: number; time_slot_list: { pickup_time_id: string }[] }[] } | null
    dropoff: { branch_list: { branch_id: number; address: string }[] } | null
  }
}

export interface ShippingParameter {
  pickup: { addressId: number; timeSlotId: string | null } | null
  dropoff: { branchList: { branchId: number; address: string }[] } | null
}

/**
 * Fetch the available pickup time slots / drop-off branches for an order,
 * before calling shipOrder. v1 policy: caller auto-picks the FIRST time slot
 * for pickup (see mapping below) — no manual slot picker yet.
 */
export async function getShippingParameter(orderSn: string): Promise<ShippingParameter> {
  const json = await shopeeRequest<ShippingParameterResponse>(
    "/api/v2/logistics/get_shipping_parameter",
    { order_sn: orderSn },
  )

  const pickupAddr = json.response.pickup?.address_list?.[0]
  const pickup = pickupAddr
    ? { addressId: pickupAddr.address_id, timeSlotId: pickupAddr.time_slot_list[0]?.pickup_time_id ?? null }
    : null

  const dropoff = json.response.dropoff
    ? { branchList: json.response.dropoff.branch_list.map((b) => ({ branchId: b.branch_id, address: b.address })) }
    : null

  return { pickup, dropoff }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run lib/shopee/__tests__/logistics.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: Manual verification against the real Shopee API (validates the spec's open risk)**

This is the task the spec flags as the project's biggest unknown: whether the Shopee app's Open Platform scope even includes Logistics API access. Before continuing to Task 2, manually invoke `getShippingParameter` against one real `READY_TO_SHIP` order_sn (e.g. via a throwaway script run with `pnpm --filter shopee-dashboard exec tsx` or a temporary API route hit with curl) using the **real production Shopee credentials already configured** in this app.

- If it returns a valid `pickup`/`dropoff` shape: scope is confirmed, proceed to Task 2.
- If it 403s / returns a permission-denied Shopee error: STOP. Report to the user that the Logistics API scope isn't enabled on the Shopee Open Platform app, and that Shopee Partner support needs to grant it before this plan can continue. Do not proceed to Task 2 until resolved.
- If the actual response shape differs from what Step 8 assumes (field names, nesting): adjust `ShippingParameterResponse`/`getShippingParameter`'s mapping and the Step 6 test fixtures to match the real shape, then re-run Step 9's test.

- [ ] **Step 11: Commit**

```bash
cd apps/dashboard
git add lib/shopee/client.ts lib/shopee/logistics.ts lib/shopee/__tests__/client.test.ts lib/shopee/__tests__/logistics.test.ts
git commit -m "feat(shopee): add shopeeRequestPost helper and getShippingParameter"
```

---

### Task 2: `shipOrder` + `POST /api/shopee/logistics/ship`

**Files:**
- Modify: `apps/dashboard/lib/shopee/logistics.ts`
- Modify: `apps/dashboard/lib/shopee/__tests__/logistics.test.ts`
- Create: `apps/dashboard/app/api/shopee/logistics/ship/route.ts`
- Create: `apps/dashboard/app/api/shopee/logistics/ship/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `shopeeRequestPost` (Task 1), `ShippingParameter` shape (Task 1) to know what a caller passes in for `pickup`/`dropoff`.
- Produces:
  - `shipOrder(orderSn: string, method: ShipMethod): Promise<{ success: true } | { success: false; error: string }>` — exported from `logistics.ts`, where `type ShipMethod = { kind: "pickup"; addressId: number; timeSlotId: string } | { kind: "dropoff"; branchId: number }`. Consumed by the route in this task and, indirectly, the page (Task 5).
  - `type RequestedShipMethod = { kind: "pickup" } | { kind: "dropoff"; branchId: number }` — exported from the route file, the shape the *client* sends (pickup has no address/slot yet — the route resolves it server-side via `getShippingParameter`, per the spec's "auto-pick first slot" policy). Consumed by the page (Task 5).
  - `POST /api/shopee/logistics/ship` — request body `{ orders: { orderSn: string; method: RequestedShipMethod }[] }`, response `{ results: { orderSn: string; success: boolean; error?: string }[] }`. Consumed by the page (Task 5).

- [ ] **Step 1: Write the failing test for `shipOrder`**

Append to `apps/dashboard/lib/shopee/__tests__/logistics.test.ts`:

```ts
import { shipOrder } from "@/lib/shopee/logistics"
import { shopeeRequestPost } from "@/lib/shopee/client"

const mockRequestPost = shopeeRequestPost as any

describe("shipOrder", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("ships a pickup order with the given address/time slot", async () => {
    mockRequestPost.mockResolvedValue({ response: {} })
    const result = await shipOrder("S1", { kind: "pickup", addressId: 111, timeSlotId: "slot-1" })
    expect(mockRequestPost).toHaveBeenCalledWith(
      "/api/v2/logistics/ship_order",
      { order_sn: "S1" },
      { pickup: { address_id: 111, pickup_time_id: "slot-1" } },
    )
    expect(result).toEqual({ success: true })
  })

  it("ships a dropoff order with the given branch", async () => {
    mockRequestPost.mockResolvedValue({ response: {} })
    const result = await shipOrder("S2", { kind: "dropoff", branchId: 42 })
    expect(mockRequestPost).toHaveBeenCalledWith(
      "/api/v2/logistics/ship_order",
      { order_sn: "S2" },
      { dropoff: { branch_id: 42 } },
    )
    expect(result).toEqual({ success: true })
  })

  it("returns success:false with Shopee's message when shipping fails", async () => {
    mockRequestPost.mockRejectedValue(new Error("Shopee API error (error_order): stock changed"))
    const result = await shipOrder("S3", { kind: "pickup", addressId: 1, timeSlotId: "x" })
    expect(result).toEqual({ success: false, error: "Shopee API error (error_order): stock changed" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run lib/shopee/__tests__/logistics.test.ts`
Expected: FAIL — `shipOrder` not exported.

- [ ] **Step 3: Implement `shipOrder`**

Append to `apps/dashboard/lib/shopee/logistics.ts`:

```ts
export type ShipMethod =
  | { kind: "pickup"; addressId: number; timeSlotId: string }
  | { kind: "dropoff"; branchId: number }

/**
 * Arrange shipment for one order. Never throws — bulk callers need per-order
 * success/failure, not an exception that aborts the whole batch (see the
 * design spec's partial-failure requirement).
 */
export async function shipOrder(
  orderSn: string,
  method: ShipMethod,
): Promise<{ success: true } | { success: false; error: string }> {
  const body =
    method.kind === "pickup"
      ? { pickup: { address_id: method.addressId, pickup_time_id: method.timeSlotId } }
      : { dropoff: { branch_id: method.branchId } }

  try {
    await shopeeRequestPost("/api/v2/logistics/ship_order", { order_sn: orderSn }, body)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run lib/shopee/__tests__/logistics.test.ts`
Expected: PASS (6 tests total)

- [ ] **Step 5: Write the failing test for the route**

The route accepts `RequestedShipMethod` from the client (pickup has no address/slot — the route resolves it server-side via `getShippingParameter`, per the spec's "auto-pick first slot" policy). This keeps the client simple (Task 5's page never needs to call `getShippingParameter` itself or handle its shape) and keeps this whole concern inside one task instead of a later task reaching back to modify it.

```ts
// apps/dashboard/app/api/shopee/logistics/ship/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/shopee/logistics", () => ({ shipOrder: vi.fn(), getShippingParameter: vi.fn() }))

import { POST } from "../route"
import { auth } from "@/lib/auth"
import { shipOrder, getShippingParameter } from "@/lib/shopee/logistics"

const mockAuth = auth as any
const mockShipOrder = shipOrder as any
const mockGetShippingParameter = getShippingParameter as any

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/shopee/logistics/ship", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any
}

describe("POST /api/shopee/logistics/ship", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ orders: [] }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when orders is empty", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const res = await POST(makeRequest({ orders: [] }))
    expect(res.status).toBe(400)
  })

  it("resolves pickup address/time slot server-side, then ships", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGetShippingParameter.mockResolvedValue({ pickup: { addressId: 111, timeSlotId: "slot-1" }, dropoff: null })
    mockShipOrder.mockResolvedValue({ success: true })

    const res = await POST(makeRequest({ orders: [{ orderSn: "S1", method: { kind: "pickup" } }] }))

    expect(mockGetShippingParameter).toHaveBeenCalledWith("S1")
    expect(mockShipOrder).toHaveBeenCalledWith("S1", { kind: "pickup", addressId: 111, timeSlotId: "slot-1" })
    const json = await res.json()
    expect(json).toEqual({ results: [{ orderSn: "S1", success: true }] })
  })

  it("reports failure without calling shipOrder when no pickup slot is available", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGetShippingParameter.mockResolvedValue({ pickup: null, dropoff: null })

    const res = await POST(makeRequest({ orders: [{ orderSn: "S1", method: { kind: "pickup" } }] }))

    const json = await res.json()
    expect(json).toEqual({ results: [{ orderSn: "S1", success: false, error: "Tidak ada slot pickup tersedia untuk order ini" }] })
    expect(mockShipOrder).not.toHaveBeenCalled()
  })

  it("ships a dropoff order directly (no slot resolution needed) and reports partial failure without aborting the batch", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGetShippingParameter.mockResolvedValue({ pickup: { addressId: 111, timeSlotId: "slot-1" }, dropoff: null })
    mockShipOrder
      .mockResolvedValueOnce({ success: true }) // S1 pickup
      .mockResolvedValueOnce({ success: false, error: "stock changed" }) // S2 dropoff

    const res = await POST(
      makeRequest({
        orders: [
          { orderSn: "S1", method: { kind: "pickup" } },
          { orderSn: "S2", method: { kind: "dropoff", branchId: 2 } },
        ],
      }),
    )

    expect(mockShipOrder).toHaveBeenCalledWith("S2", { kind: "dropoff", branchId: 2 })
    const json = await res.json()
    expect(json).toEqual({
      results: [
        { orderSn: "S1", success: true },
        { orderSn: "S2", success: false, error: "stock changed" },
      ],
    })
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run app/api/shopee/logistics/ship/__tests__/route.test.ts`
Expected: FAIL — route file doesn't exist.

- [ ] **Step 7: Implement the route**

```ts
// apps/dashboard/app/api/shopee/logistics/ship/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { shipOrder, getShippingParameter, type ShipMethod } from "@/lib/shopee/logistics"

export type RequestedShipMethod = { kind: "pickup" } | { kind: "dropoff"; branchId: number }

export interface ShipRequestInput {
  orders: { orderSn: string; method: RequestedShipMethod }[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body: ShipRequestInput = await req.json()
  if (!Array.isArray(body.orders) || body.orders.length === 0) {
    return NextResponse.json({ error: "orders wajib diisi" }, { status: 400 })
  }

  const results = await Promise.all(
    body.orders.map(async ({ orderSn, method }) => {
      let resolvedMethod: ShipMethod

      if (method.kind === "pickup") {
        const param = await getShippingParameter(orderSn)
        if (!param.pickup) {
          return { orderSn, success: false as const, error: "Tidak ada slot pickup tersedia untuk order ini" }
        }
        if (!param.pickup.timeSlotId) {
          return { orderSn, success: false as const, error: "Tidak ada slot waktu pickup tersedia untuk order ini" }
        }
        resolvedMethod = { kind: "pickup", addressId: param.pickup.addressId, timeSlotId: param.pickup.timeSlotId }
      } else {
        resolvedMethod = { kind: "dropoff", branchId: method.branchId }
      }

      const outcome = await shipOrder(orderSn, resolvedMethod)
      return outcome.success
        ? { orderSn, success: true as const }
        : { orderSn, success: false as const, error: outcome.error }
    }),
  )

  return NextResponse.json({ results })
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run app/api/shopee/logistics/ship/__tests__/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Commit**

```bash
cd apps/dashboard
git add lib/shopee/logistics.ts lib/shopee/__tests__/logistics.test.ts app/api/shopee/logistics/ship
git commit -m "feat(shopee): add shipOrder and POST /api/shopee/logistics/ship"
```

---

### Task 3: Shipping-document generation + `POST /api/shopee/logistics/document`

**Files:**
- Modify: `apps/dashboard/lib/shopee/client.ts` (add `shopeeDownloadDocument`)
- Modify: `apps/dashboard/lib/shopee/logistics.ts`
- Modify: `apps/dashboard/lib/shopee/__tests__/logistics.test.ts`
- Create: `apps/dashboard/lib/shopee/__tests__/client.test.ts` (append `shopeeDownloadDocument` case — file created in Task 1)
- Create: `apps/dashboard/app/api/shopee/logistics/document/route.ts`
- Create: `apps/dashboard/app/api/shopee/logistics/document/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `shopeeRequestPost` (Task 1).
- Produces:
  - `createShippingDocument(orderSnList: string[]): Promise<void>` — kicks off Shopee's async doc generation. Consumed by `generateShippingDocument` (this task).
  - `getShippingDocumentResult(orderSnList: string[]): Promise<{ orderSn: string; status: "PROCESSING" | "READY" | "FAILED" }[]>` — consumed by `generateShippingDocument` (this task).
  - `downloadShippingDocument(orderSnList: string[]): Promise<Buffer>` — returns the raw combined PDF bytes. Consumed by `generateShippingDocument` (this task) and, indirectly, the route.
  - `generateShippingDocument(orderSnList: string[]): Promise<Buffer>` — orchestrates create → poll → download, exported from `logistics.ts`. Consumed by the route in this task.
  - `POST /api/shopee/logistics/document` — request body `{ orderSnList: string[] }`, response is a raw `application/pdf` body. Consumed by the page (Task 5).

Shopee's `download_shipping_document` endpoint returns the PDF as the **raw HTTP response body** (`Content-Type: application/pdf`), not JSON — it cannot go through `shopeeRequestPost` (which always does `res.json()`). It needs its own client helper.

- [ ] **Step 1: Write the failing test for `shopeeDownloadDocument`**

Append to `apps/dashboard/lib/shopee/__tests__/client.test.ts`:

```ts
import { shopeeDownloadDocument } from "@/lib/shopee/client"

describe("shopeeDownloadDocument", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns the raw response body bytes on success", async () => {
    const fakePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // "%PDF"
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === "content-type" ? "application/pdf" : null) },
      arrayBuffer: async () => fakePdfBytes.buffer,
    })

    const result = await shopeeDownloadDocument(
      "/api/v2/logistics/download_shipping_document",
      {},
      { order_list: [{ order_sn: "S1" }] },
    )

    expect(Buffer.isBuffer(result)).toBe(true)
    expect(result.equals(Buffer.from(fakePdfBytes))).toBe(true)
  })

  it("throws when Shopee returns a JSON error instead of a PDF", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
      json: async () => ({ error: "error_param", message: "document not ready" }),
    })

    await expect(
      shopeeDownloadDocument("/api/v2/logistics/download_shipping_document", {}, { order_list: [{ order_sn: "S1" }] }),
    ).rejects.toThrow(/document not ready/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run lib/shopee/__tests__/client.test.ts`
Expected: FAIL — `shopeeDownloadDocument` not exported.

- [ ] **Step 3: Implement `shopeeDownloadDocument` in `client.ts`**

```ts
export async function shopeeDownloadDocument(
  path: string,
  params: Record<string, string | number>,
  body: Record<string, unknown>,
): Promise<Buffer> {
  const url = await buildSignedUrl(path, params)
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })

  const contentType = res.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    // Shopee returns JSON instead of a PDF when the document isn't ready or the call errored.
    const json = await res.json()
    throw new Error(`Shopee API error (${json.error ?? "unknown"}): ${json.message ?? "document not ready"}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
```

(Reuses `buildSignedUrl` extracted in Task 1 Step 1 — do not re-implement signing here.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run lib/shopee/__tests__/client.test.ts`
Expected: PASS (4 tests total)

- [ ] **Step 5: Write the failing test for `createShippingDocument`, `getShippingDocumentResult`, `downloadShippingDocument`, `generateShippingDocument`**

Append to `apps/dashboard/lib/shopee/__tests__/logistics.test.ts`:

```ts
import {
  createShippingDocument,
  getShippingDocumentResult,
  downloadShippingDocument,
  generateShippingDocument,
} from "@/lib/shopee/logistics"
import { shopeeDownloadDocument } from "@/lib/shopee/client"

const mockDownloadDocument = shopeeDownloadDocument as any

describe("createShippingDocument", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("kicks off document generation for a batch of orders", async () => {
    mockRequestPost.mockResolvedValue({ response: {} })
    await createShippingDocument(["S1", "S2"])
    expect(mockRequestPost).toHaveBeenCalledWith(
      "/api/v2/logistics/create_shipping_document",
      {},
      { order_list: [{ order_sn: "S1" }, { order_sn: "S2" }] },
    )
  })
})

describe("getShippingDocumentResult", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("maps per-order status", async () => {
    mockRequest.mockResolvedValue({
      response: { result_list: [{ order_sn: "S1", status: "READY" }, { order_sn: "S2", status: "PROCESSING" }] },
    })
    const result = await getShippingDocumentResult(["S1", "S2"])
    expect(result).toEqual([
      { orderSn: "S1", status: "READY" },
      { orderSn: "S2", status: "PROCESSING" },
    ])
  })
})

describe("downloadShippingDocument", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("downloads the combined PDF for a batch of orders", async () => {
    const fakeBuffer = Buffer.from("fake-pdf")
    mockDownloadDocument.mockResolvedValue(fakeBuffer)
    const result = await downloadShippingDocument(["S1", "S2"])
    expect(mockDownloadDocument).toHaveBeenCalledWith(
      "/api/v2/logistics/download_shipping_document",
      {},
      { order_list: [{ order_sn: "S1", shipping_document_type: "THERMAL_AIR_WAYBILL" }, { order_sn: "S2", shipping_document_type: "THERMAL_AIR_WAYBILL" }] },
    )
    expect(result).toBe(fakeBuffer)
  })
})

describe("generateShippingDocument", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("creates, polls until ready, then downloads", async () => {
    mockRequestPost.mockResolvedValue({ response: {} }) // create_shipping_document
    mockRequest
      .mockResolvedValueOnce({ response: { result_list: [{ order_sn: "S1", status: "PROCESSING" }] } })
      .mockResolvedValueOnce({ response: { result_list: [{ order_sn: "S1", status: "READY" }] } })
    const fakeBuffer = Buffer.from("fake-pdf")
    mockDownloadDocument.mockResolvedValue(fakeBuffer)

    const result = await generateShippingDocument(["S1"])

    expect(result).toBe(fakeBuffer)
    expect(mockRequest).toHaveBeenCalledTimes(2) // polled once, then ready
  })

  it("throws if a document generation fails", async () => {
    mockRequestPost.mockResolvedValue({ response: {} })
    mockRequest.mockResolvedValue({ response: { result_list: [{ order_sn: "S1", status: "FAILED" }] } })

    await expect(generateShippingDocument(["S1"])).rejects.toThrow(/gagal/i)
  })

  it("throws if polling never reaches READY within the retry budget", async () => {
    mockRequestPost.mockResolvedValue({ response: {} })
    mockRequest.mockResolvedValue({ response: { result_list: [{ order_sn: "S1", status: "PROCESSING" }] } })

    await expect(generateShippingDocument(["S1"], { pollIntervalMs: 0, maxPolls: 3 })).rejects.toThrow(/timeout|belum siap/i)
    expect(mockRequest).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run lib/shopee/__tests__/logistics.test.ts`
Expected: FAIL — the four new exports don't exist.

- [ ] **Step 7: Implement the four functions**

Append to `apps/dashboard/lib/shopee/logistics.ts`:

```ts
import { shopeeDownloadDocument } from "./client"

export async function createShippingDocument(orderSnList: string[]): Promise<void> {
  await shopeeRequestPost(
    "/api/v2/logistics/create_shipping_document",
    {},
    { order_list: orderSnList.map((orderSn) => ({ order_sn: orderSn })) },
  )
}

interface ShippingDocumentResultResponse {
  response: { result_list: { order_sn: string; status: "PROCESSING" | "READY" | "FAILED" }[] }
}

export async function getShippingDocumentResult(
  orderSnList: string[],
): Promise<{ orderSn: string; status: "PROCESSING" | "READY" | "FAILED" }[]> {
  const json = await shopeeRequest<ShippingDocumentResultResponse>(
    "/api/v2/logistics/get_shipping_document_result",
    { order_sn_list: orderSnList.join(",") },
  )
  return json.response.result_list.map((r) => ({ orderSn: r.order_sn, status: r.status }))
}

export async function downloadShippingDocument(orderSnList: string[]): Promise<Buffer> {
  return shopeeDownloadDocument(
    "/api/v2/logistics/download_shipping_document",
    {},
    {
      order_list: orderSnList.map((orderSn) => ({
        order_sn: orderSn,
        shipping_document_type: "THERMAL_AIR_WAYBILL",
      })),
    },
  )
}

/**
 * Orchestrates the full flow: kick off generation, poll until every order's
 * document is READY (or fail fast on FAILED / timeout), then download the
 * combined PDF. Default poll: every 1500ms, up to 10 attempts (~15s) —
 * override via options for tests.
 */
export async function generateShippingDocument(
  orderSnList: string[],
  options: { pollIntervalMs?: number; maxPolls?: number } = {},
): Promise<Buffer> {
  const pollIntervalMs = options.pollIntervalMs ?? 1500
  const maxPolls = options.maxPolls ?? 10

  await createShippingDocument(orderSnList)

  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const results = await getShippingDocumentResult(orderSnList)

    const failed = results.find((r) => r.status === "FAILED")
    if (failed) throw new Error(`Pembuatan dokumen resi gagal untuk order ${failed.orderSn}`)

    const allReady = results.every((r) => r.status === "READY")
    if (allReady) return downloadShippingDocument(orderSnList)

    if (attempt < maxPolls - 1 && pollIntervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
  }

  throw new Error("Dokumen resi belum siap (timeout) — coba generate ulang beberapa saat lagi")
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run lib/shopee/__tests__/logistics.test.ts`
Expected: PASS (13 tests total)

- [ ] **Step 9: Write the failing test for the route**

```ts
// apps/dashboard/app/api/shopee/logistics/document/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/shopee/logistics", () => ({ generateShippingDocument: vi.fn() }))

import { POST } from "../route"
import { auth } from "@/lib/auth"
import { generateShippingDocument } from "@/lib/shopee/logistics"

const mockAuth = auth as any
const mockGenerate = generateShippingDocument as any

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/shopee/logistics/document", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any
}

describe("POST /api/shopee/logistics/document", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    const res = await POST(makeRequest({ orderSnList: [] }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when orderSnList is empty", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    const res = await POST(makeRequest({ orderSnList: [] }))
    expect(res.status).toBe(400)
  })

  it("returns the PDF with an application/pdf content type", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGenerate.mockResolvedValue(Buffer.from("fake-pdf"))

    const res = await POST(makeRequest({ orderSnList: ["S1", "S2"] }))

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.toString()).toBe("fake-pdf")
  })

  it("returns 502 with Shopee's error message when generation fails", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } })
    mockGenerate.mockRejectedValue(new Error("Dokumen resi belum siap (timeout)"))

    const res = await POST(makeRequest({ orderSnList: ["S1"] }))

    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json).toEqual({ error: "Dokumen resi belum siap (timeout)" })
  })
})
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run app/api/shopee/logistics/document/__tests__/route.test.ts`
Expected: FAIL — route file doesn't exist.

- [ ] **Step 11: Implement the route**

```ts
// apps/dashboard/app/api/shopee/logistics/document/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateShippingDocument } from "@/lib/shopee/logistics"

export interface ShippingDocumentInput {
  orderSnList: string[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body: ShippingDocumentInput = await req.json()
  if (!Array.isArray(body.orderSnList) || body.orderSnList.length === 0) {
    return NextResponse.json({ error: "orderSnList wajib diisi" }, { status: 400 })
  }

  try {
    const pdf = await generateShippingDocument(body.orderSnList)
    return new NextResponse(pdf, { status: 200, headers: { "Content-Type": "application/pdf" } })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal membuat dokumen resi"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run app/api/shopee/logistics/document/__tests__/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 13: Commit**

```bash
cd apps/dashboard
git add lib/shopee/client.ts lib/shopee/logistics.ts lib/shopee/__tests__/client.test.ts lib/shopee/__tests__/logistics.test.ts app/api/shopee/logistics/document
git commit -m "feat(shopee): add shipping document generation and POST /api/shopee/logistics/document"
```

---

### Task 4: `BulkShippingOrderList` component

**Files:**
- Create: `apps/dashboard/components/order/BulkShippingOrderList.tsx`
- Create: `apps/dashboard/components/order/__tests__/BulkShippingOrderList.test.tsx`

**Interfaces:**
- Consumes: `OrderSummary` type from `apps/dashboard/lib/orders/types.ts` (already exists — has `orderSn: string`, `shopeeStatus: string`, `items: OrderItemSummary[]`, `buyerUsername: string | null`).
- Produces:
  - `interface BulkShippingOrderListProps { orders: OrderSummary[]; selectedSns: Set<string>; onToggleSelect: (orderSn: string) => void; onToggleSelectAll: () => void }` — exported alongside the component, consumed by the page (Task 5).
  - `BulkShippingOrderList(props: BulkShippingOrderListProps)` — default-style named export, JSX component.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/dashboard/components/order/__tests__/BulkShippingOrderList.test.tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BulkShippingOrderList } from "../BulkShippingOrderList"
import type { OrderSummary } from "@/lib/orders/types"

function makeOrder(orderSn: string): OrderSummary {
  return {
    orderSn,
    shopeeStatus: "READY_TO_SHIP",
    createTime: 0,
    updateTime: 0,
    totalAmount: 10000,
    currency: "IDR",
    buyerUsername: "buyer1",
    items: [{ itemId: 1, itemName: "Vas Bunga", quantity: 1, imageUrl: null } as never],
    labelPrinted: false,
    labelPrintedAt: null,
    labelPrintedBy: null,
    isPreOrder: false,
    shipByDate: null,
  }
}

describe("BulkShippingOrderList", () => {
  it("renders a checkbox per order and a select-all checkbox", () => {
    const orders = [makeOrder("S1"), makeOrder("S2")]
    render(
      <BulkShippingOrderList
        orders={orders}
        selectedSns={new Set()}
        onToggleSelect={() => {}}
        onToggleSelectAll={() => {}}
      />,
    )
    expect(screen.getAllByRole("checkbox")).toHaveLength(3) // 2 rows + select-all
  })

  it("calls onToggleSelect with the order sn when a row checkbox is clicked", () => {
    const onToggleSelect = vi.fn()
    render(
      <BulkShippingOrderList
        orders={[makeOrder("S1")]}
        selectedSns={new Set()}
        onToggleSelect={onToggleSelect}
        onToggleSelectAll={() => {}}
      />,
    )
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    expect(onToggleSelect).toHaveBeenCalledWith("S1")
  })

  it("calls onToggleSelectAll when the header checkbox is clicked", () => {
    const onToggleSelectAll = vi.fn()
    render(
      <BulkShippingOrderList
        orders={[makeOrder("S1")]}
        selectedSns={new Set()}
        onToggleSelect={() => {}}
        onToggleSelectAll={onToggleSelectAll}
      />,
    )
    fireEvent.click(screen.getByLabelText(/pilih semua/i))
    expect(onToggleSelectAll).toHaveBeenCalled()
  })

  it("shows a row as checked when its orderSn is in selectedSns", () => {
    render(
      <BulkShippingOrderList
        orders={[makeOrder("S1")]}
        selectedSns={new Set(["S1"])}
        onToggleSelect={() => {}}
        onToggleSelectAll={() => {}}
      />,
    )
    expect(screen.getByLabelText("Pilih order S1")).toBeChecked()
  })

  it("renders an empty state when there are no orders", () => {
    render(
      <BulkShippingOrderList orders={[]} selectedSns={new Set()} onToggleSelect={() => {}} onToggleSelectAll={() => {}} />,
    )
    expect(screen.getByText(/tidak ada order/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run components/order/__tests__/BulkShippingOrderList.test.tsx`
Expected: FAIL — component file doesn't exist.

- [ ] **Step 3: Implement the component**

```tsx
// apps/dashboard/components/order/BulkShippingOrderList.tsx
"use client"

import type { OrderSummary } from "@/lib/orders/types"

export interface BulkShippingOrderListProps {
  orders: OrderSummary[]
  selectedSns: Set<string>
  onToggleSelect: (orderSn: string) => void
  onToggleSelectAll: () => void
}

export function BulkShippingOrderList({ orders, selectedSns, onToggleSelect, onToggleSelectAll }: BulkShippingOrderListProps) {
  if (orders.length === 0) {
    return <div className="py-12 text-center text-gray-400 text-sm">Tidak ada order Ready to Ship saat ini.</div>
  }

  const allSelected = orders.length > 0 && orders.every((o) => selectedSns.has(o.orderSn))

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 pb-2 border-b border-white/10 font-semibold text-sm">
        <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} aria-label="Pilih semua order" />
        Pilih Semua ({orders.length})
      </label>
      {orders.map((order) => (
        <label key={order.orderSn} className="flex items-center gap-2 py-2 border-b border-white/5 text-sm">
          <input
            type="checkbox"
            checked={selectedSns.has(order.orderSn)}
            onChange={() => onToggleSelect(order.orderSn)}
            aria-label={`Pilih order ${order.orderSn}`}
          />
          <span className="flex-1">
            #{order.orderSn} — {order.items.map((i) => i.itemName).join(", ")}
            {order.buyerUsername ? ` — ${order.buyerUsername}` : ""}
          </span>
        </label>
      ))}
    </div>
  )
}
```

Match the exact indentation/prop-interface-above-component style already used by `apps/dashboard/components/order/OrderList.tsx` — read that file once more before finalizing this one so class names/spacing feel consistent with its sibling.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && pnpm vitest run components/order/__tests__/BulkShippingOrderList.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd apps/dashboard
git add components/order/BulkShippingOrderList.tsx components/order/__tests__/BulkShippingOrderList.test.tsx
git commit -m "feat(order): add BulkShippingOrderList selectable list component"
```

---

### Task 5: `/order/pengiriman` page (3-step flow)

**Files:**
- Create: `apps/dashboard/app/(dashboard)/order/pengiriman/page.tsx`
- Create: `apps/dashboard/app/(dashboard)/order/pengiriman/__tests__/page.test.tsx`

**Interfaces:**
- Consumes:
  - `BulkShippingOrderList` + `BulkShippingOrderListProps` (Task 4).
  - `RequestedShipMethod` (Task 2) — the shape the page posts to `/api/shopee/logistics/ship`; for pickup it's just `{ kind: "pickup" }` (no address/slot — the route resolves that server-side). The page only talks to `/api/shopee/logistics/*` over `fetch`, matching how the rest of the app's client pages talk to their API routes — check `apps/dashboard/lib/hooks/use-orders.ts` for the existing `fetch()`-based hook pattern before writing this.
  - `useOrders()` hook from `@/lib/hooks/use-orders` (existing) for the order list data — do not write new fetch logic.
  - `PageShell` from `@/components/layout/PageShell` (existing, `title` required).
- Produces: the page itself (route, not imported anywhere else).

Before writing this task, read `apps/dashboard/lib/hooks/use-orders.ts` in full to confirm `useOrders()`'s exact return shape (loading/data/error fields) and copy its calling convention.

- [ ] **Step 1: Write the failing test for the page's client-side state machine**

Test the state transitions directly (selection → arrange → result → generate) rather than full E2E rendering, since the page makes real `fetch` calls to the two new routes:

```tsx
// apps/dashboard/app/(dashboard)/order/pengiriman/__tests__/page.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

vi.mock("@/lib/hooks/use-orders", () => ({
  useOrders: () => ({
    data: {
      orders: [
        { orderSn: "S1", shopeeStatus: "READY_TO_SHIP", items: [{ itemName: "Vas Bunga" }], buyerUsername: "b1" },
        { orderSn: "S2", shopeeStatus: "READY_TO_SHIP", items: [{ itemName: "Miniatur" }], buyerUsername: "b2" },
        { orderSn: "S3", shopeeStatus: "PROCESSED", items: [{ itemName: "Sudah diproses" }], buyerUsername: "b3" },
      ],
    },
    isLoading: false,
    error: null,
  }),
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)
vi.stubGlobal("open", vi.fn())

import PengirimanPage from "../page"

describe("Pengiriman Massal page", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("only lists READY_TO_SHIP orders (filters out PROCESSED)", () => {
    render(<PengirimanPage />)
    expect(screen.getByText(/S1/)).toBeInTheDocument()
    expect(screen.getByText(/S2/)).toBeInTheDocument()
    expect(screen.queryByText(/S3/)).not.toBeInTheDocument()
  })

  it("disables the arrange-shipment button until at least one order is selected", () => {
    render(<PengirimanPage />)
    expect(screen.getByRole("button", { name: /atur pengiriman/i })).toBeDisabled()
  })

  it("enables arrange-shipment once an order is checked, and posts to /api/shopee/logistics/ship", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ orderSn: "S1", success: true }] }),
    })

    render(<PengirimanPage />)
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    fireEvent.click(screen.getByRole("button", { name: /pickup/i }))

    const shipButton = screen.getByRole("button", { name: /atur pengiriman/i })
    expect(shipButton).not.toBeDisabled()
    fireEvent.click(shipButton)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      "/api/shopee/logistics/ship",
      expect.objectContaining({ method: "POST" }),
    ))
    await waitFor(() => expect(screen.getByText(/1 order berhasil diatur/i)).toBeInTheDocument())
  })

  it("shows the generate-resi button only after at least one order ships successfully, and opens the PDF in a new tab", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ orderSn: "S1", success: true }] }) })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["pdf"], { type: "application/pdf" }) })

    render(<PengirimanPage />)
    fireEvent.click(screen.getByLabelText("Pilih order S1"))
    fireEvent.click(screen.getByRole("button", { name: /pickup/i }))
    fireEvent.click(screen.getByRole("button", { name: /atur pengiriman/i }))
    await waitFor(() => screen.getByRole("button", { name: /generate.*cetak resi/i }))

    fireEvent.click(screen.getByRole("button", { name: /generate.*cetak resi/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      "/api/shopee/logistics/document",
      expect.objectContaining({ method: "POST" }),
    ))
    await waitFor(() => expect(window.open).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && pnpm vitest run "app/(dashboard)/order/pengiriman/__tests__/page.test.tsx"`
Expected: FAIL — page file doesn't exist.

- [ ] **Step 3: Implement the page**

```tsx
// apps/dashboard/app/(dashboard)/order/pengiriman/page.tsx
"use client"

import { useMemo, useState } from "react"
import { PageShell } from "@/components/layout/PageShell"
import { BulkShippingOrderList } from "@/components/order/BulkShippingOrderList"
import { useOrders } from "@/lib/hooks/use-orders"
import type { OrderSummary } from "@/lib/orders/types"

type Method = "pickup" | "dropoff"
type ShipResult = { orderSn: string; success: boolean; error?: string }

export default function PengirimanPage() {
  const { data, isLoading } = useOrders()
  const [selectedSns, setSelectedSns] = useState<Set<string>>(new Set())
  const [method, setMethod] = useState<Method | null>(null)
  const [shipResults, setShipResults] = useState<ShipResult[] | null>(null)
  const [isShipping, setIsShipping] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const readyOrders = useMemo<OrderSummary[]>(
    () => (data?.orders ?? []).filter((o: OrderSummary) => o.shopeeStatus === "READY_TO_SHIP"),
    [data],
  )

  function toggleSelect(orderSn: string) {
    setSelectedSns((prev) => {
      const next = new Set(prev)
      next.has(orderSn) ? next.delete(orderSn) : next.add(orderSn)
      return next
    })
    setShipResults(null)
  }

  function toggleSelectAll() {
    setSelectedSns((prev) =>
      prev.size === readyOrders.length ? new Set() : new Set(readyOrders.map((o) => o.orderSn)),
    )
    setShipResults(null)
  }

  async function handleArrangeShipment() {
    if (!method || selectedSns.size === 0) return
    setIsShipping(true)
    setShipResults(null)
    try {
      // v1: pickup auto-picks the first available address/time slot per order via
      // getShippingParameter server-side would be ideal, but to keep the client
      // simple and match the spec's "auto-pick first slot" policy, the ship route
      // is called with method:"pickup" and no addressId/timeSlotId — the server
      // resolves the first slot itself. Dropoff requires a branchId chosen up front.
      const res = await fetch("/api/shopee/logistics/ship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders: Array.from(selectedSns).map((orderSn) => ({ orderSn, method: { kind: method } })),
        }),
      })
      const json = await res.json()
      setShipResults(json.results)
    } finally {
      setIsShipping(false)
    }
  }

  async function handleGenerateResi() {
    const successfulSns = (shipResults ?? []).filter((r) => r.success).map((r) => r.orderSn)
    if (successfulSns.length === 0) return
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const res = await fetch("/api/shopee/logistics/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderSnList: successfulSns }),
      })
      if (!res.ok) {
        const json = await res.json()
        setGenerateError(json.error ?? "Gagal generate resi")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
    } finally {
      setIsGenerating(false)
    }
  }

  const successCount = (shipResults ?? []).filter((r) => r.success).length
  const failCount = (shipResults ?? []).filter((r) => !r.success).length

  return (
    <PageShell title="Pengiriman Massal" description="Pilih order, atur pengiriman, lalu cetak resi sekaligus.">
      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-400">Memuat order...</div>
      ) : (
        <>
          <BulkShippingOrderList
            orders={readyOrders}
            selectedSns={selectedSns}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />

          {selectedSns.size > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-indigo-500/10 border border-indigo-500/25">
              <div className="text-xs uppercase tracking-wide text-gray-400">
                Langkah 1 — Atur Pengiriman ({selectedSns.size} dipilih)
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setMethod("pickup")}
                  className={method === "pickup" ? "font-bold" : ""}
                >
                  📦 Pickup (dijemput kurir)
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("dropoff")}
                  className={method === "dropoff" ? "font-bold" : ""}
                >
                  🏬 Drop-off ke Counter
                </button>
              </div>
              <button
                type="button"
                onClick={handleArrangeShipment}
                disabled={!method || isShipping}
                className="mt-3 w-full"
              >
                {isShipping ? "Mengatur..." : `Atur Pengiriman (${selectedSns.size} order)`}
              </button>
            </div>
          )}

          {shipResults && (
            <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
              <div className="text-xs uppercase tracking-wide text-gray-400">Langkah 2 — Hasil</div>
              <div className="text-sm mt-1">
                {successCount} order berhasil diatur
                {failCount > 0 ? ` — ${failCount} gagal` : ""}
              </div>
              {failCount > 0 && (
                <ul className="text-xs text-red-400 mt-1 list-disc list-inside">
                  {shipResults.filter((r) => !r.success).map((r) => (
                    <li key={r.orderSn}>{r.orderSn}: {r.error}</li>
                  ))}
                </ul>
              )}
              {successCount > 0 && (
                <button type="button" onClick={handleGenerateResi} disabled={isGenerating} className="mt-3 w-full">
                  {isGenerating ? "Membuat resi..." : `Generate & Cetak Resi (${successCount} order)`}
                </button>
              )}
              {generateError && <div className="text-xs text-red-400 mt-2">{generateError}</div>}
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
```

The `method: { kind: method }` payload sent for pickup (just `{ kind: "pickup" }`) matches `RequestedShipMethod` from Task 2 exactly — no address/slot needed here, the route resolves it server-side. Nothing further to adjust in the route.

- [ ] **Step 4: Run the page test to verify it fails, then passes**

Run: `cd apps/dashboard && pnpm vitest run "app/(dashboard)/order/pengiriman/__tests__/page.test.tsx"`
Expected first: FAIL (page didn't exist before Step 3). After Step 3's implementation:
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd apps/dashboard
git add "app/(dashboard)/order/pengiriman"
git commit -m "feat(order): add Pengiriman Massal page (select, arrange shipment, generate resi)"
```

---

### Task 6: Entry-point link from `/order`

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/order/page.tsx`

**Interfaces:**
- Consumes: nothing new — a link to `/order/pengiriman` (Task 5).
- Produces: nothing consumed by later tasks (last task).

- [ ] **Step 1: Read the current page header/actions area**

Read `apps/dashboard/app/(dashboard)/order/page.tsx` to find where `PageShell`'s `actions` prop is populated (if it already has header buttons) — add the new link alongside them rather than restructuring the header.

- [ ] **Step 2: Add the link**

Add a `Link` from `next/link` to `/order/pengiriman` in the `actions` area (or immediately above the order list if `PageShell`'s `actions` isn't already used on this page), styled consistently with any existing header buttons on the page (match whatever button/link component or class names already appear there — do not introduce a new button style):

```tsx
import Link from "next/link"

// ... inside the actions area:
<Link href="/order/pengiriman" className="/* match existing header button classes found in Step 1 */">
  🖨️ Pengiriman Massal
</Link>
```

- [ ] **Step 3: Manual verification**

Run the dashboard dev server (`pnpm --filter shopee-dashboard dev`), open `/order`, confirm the new link is visible and navigates to `/order/pengiriman`, which renders the order list, arrange-shipment panel, and (once you have a real Ready-to-Ship order and Logistics API scope confirmed in Task 1 Step 10) successfully ships and downloads a resi PDF end-to-end.

- [ ] **Step 4: Run the full dashboard test suite**

Run: `cd apps/dashboard && pnpm test`
Expected: all tests pass, including every test added in Tasks 1–5.

- [ ] **Step 5: Commit**

```bash
cd apps/dashboard
git add app/\(dashboard\)/order/page.tsx
git commit -m "feat(order): link to Pengiriman Massal from the Order page"
```
