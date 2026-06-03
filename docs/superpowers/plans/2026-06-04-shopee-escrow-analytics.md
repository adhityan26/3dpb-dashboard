# Shopee Escrow Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tampilkan data keuangan real dari Shopee (buyer paid, escrow/diterima, real fee rate) — per-produk di halaman Produk dan analytics aggregate di Settings.

**Architecture:** Tambah `getEscrowDetail(orderSn)` wrapper ke Shopee API, cache escrow per order_sn di Redis (TTL 24 jam — data tidak berubah setelah order selesai). `getSoldStatsPerItem` diperluas untuk juga mengumpulkan `buyerPaid` dan `received` via distribusi proporsional dari escrow. Settings card menampilkan aggregate fee analytics. ProductRow menampilkan kolom financial baru.

**Prerequisite:** Plan `2026-06-04-redis-cache-migration.md` harus sudah dieksekusi dan di-deploy. `lib/redis.ts` dengan `redisGet`/`redisSet` harus sudah tersedia.

**Tech Stack:** Shopee Partner API v2 `/payment/get_escrow_detail`, ioredis, React, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/shopee/escrow.ts` | Create | `getEscrowDetail(orderSn)` + `ShopeeEscrowDetail` type |
| `lib/products/service.ts` | Modify | Extend `SoldStats` + `getSoldStatsPerItem` to fetch escrow |
| `lib/products/types.ts` | Modify | Add `buyerPaid`, `received` to `ProductSummary` |
| `app/api/settings/shopee-fee/route.ts` | Create | GET — aggregate escrow analytics (30d) |
| `lib/hooks/use-settings.ts` | Create | `useShopeeeFeeAnalytics` hook |
| `components/settings/ShopeeFeeAnalyticsCard.tsx` | Create | Fee analytics card for Settings page |
| `app/(dashboard)/settings/page.tsx` | Modify | Add ShopeeFeeAnalyticsCard |
| `components/products/ProductRow.tsx` | Modify | Show buyerPaid, received, margin per produk |

---

### Task 1: Shopee Escrow API wrapper

**Files:**
- Create: `lib/shopee/escrow.ts`

Context: `shopeeRequest` is in `lib/shopee/client.ts`. `getModelList` in `lib/shopee/products.ts` is a good reference for how to call it.

The Shopee endpoint is `GET /api/v2/payment/get_escrow_detail` with param `order_sn`. It returns an object with `response` containing the escrow data.

- [ ] **Step 1: Create lib/shopee/escrow.ts**

```typescript
import { shopeeRequest } from "./client"

export interface ShopeeEscrowDetail {
  order_sn: string
  buyer_payment_amount: number    // total yang buyer bayar
  escrow_amount: number           // total yang seller terima
  commission_fee: number          // komisi Shopee
  service_fee: number             // biaya layanan
  transaction_fee: number         // biaya payment gateway
  actual_shipping_fee: number     // ongkir yang dicharge ke seller
  order_income?: {
    items?: Array<{
      item_id: number
      item_name: string
      model_id: number
      model_name?: string
      original_price: number
      discounted_price: number
      quantity_purchased: number
    }>
  }
}

interface EscrowDetailResponse {
  order_income: ShopeeEscrowDetail
}

export async function getEscrowDetail(orderSn: string): Promise<ShopeeEscrowDetail | null> {
  try {
    const json = await shopeeRequest<EscrowDetailResponse>(
      "/api/v2/payment/get_escrow_detail",
      { order_sn: orderSn }
    )
    return json.order_income ?? null
  } catch (err) {
    console.warn(`[escrow] getEscrowDetail failed for ${orderSn}:`, err instanceof Error ? err.message : err)
    return null
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 3: Commit**

```bash
git add lib/shopee/escrow.ts
git commit -m "feat(shopee): add getEscrowDetail API wrapper"
```

---

### Task 2: Extend SoldStats + getSoldStatsPerItem to include escrow data

**Files:**
- Modify: `lib/products/service.ts`

Context: `SoldStats` interface and `getSoldStatsPerItem` are in `lib/products/service.ts`. `getOrdersInRange` returns orders with `orderSn` field. We already import `getOrdersInRange`.

We fetch escrow per order, cache in Redis with key `escrow:{orderSn}` TTL 86400 (24h — escrow data is immutable). Then distribute to items proportionally.

- [ ] **Step 1: Add escrow import to service.ts**

Add to imports at top of `lib/products/service.ts`:
```typescript
import { getEscrowDetail } from "@/lib/shopee/escrow"
```

- [ ] **Step 2: Update SoldStats interface**

Find `interface SoldStats` and replace:
```typescript
interface SoldStats {
  qty: number
  omzet: number
  buyerPaid: number  // distributed dari buyer_payment_amount
  received: number   // distributed dari escrow_amount
}
```

- [ ] **Step 3: Replace getSoldStatsPerItem**

Find the full `getSoldStatsPerItem` function and replace with:

```typescript
async function getSoldStatsPerItem(itemIds?: string[]): Promise<Map<string, SoldStats>> {
  const now = Math.floor(Date.now() / 1000)
  const from = now - 30 * 24 * 60 * 60
  const orders = await getOrdersInRange({ timeFrom: from, timeTo: now })
  const filterSet = itemIds ? new Set(itemIds) : null

  // Fetch escrow for all orders concurrently (limit 10 at a time), cached per order_sn
  const CONCURRENCY = 10
  const escrowByOrderSn = new Map<string, { buyerPaid: number; escrow: number; items: Array<{ item_id: number; model_id: number; discounted_price: number; qty: number }> }>()

  const uniqueOrders = [...new Set(orders.map(o => o.orderSn))]
  for (let i = 0; i < uniqueOrders.length; i += CONCURRENCY) {
    const batch = uniqueOrders.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async (sn) => {
      const cacheKey = `escrow:${sn}`
      const cached = await redisGet<{ buyerPaid: number; escrow: number; items: Array<{ item_id: number; model_id: number; discounted_price: number; qty: number }> }>(cacheKey)
      if (cached) {
        escrowByOrderSn.set(sn, cached)
        return
      }
      const detail = await getEscrowDetail(sn)
      if (!detail) return
      const items = (detail.order_income?.items ?? []).map(it => ({
        item_id: it.item_id,
        model_id: it.model_id,
        discounted_price: it.discounted_price,
        qty: it.quantity_purchased,
      }))
      const entry = { buyerPaid: detail.buyer_payment_amount, escrow: detail.escrow_amount, items }
      escrowByOrderSn.set(sn, entry)
      await redisSet(cacheKey, entry, 86400)  // 24h — escrow is immutable
    }))
  }

  const map = new Map<string, SoldStats>()

  for (const order of orders) {
    for (const item of order.item_list) {
      const key = String(item.item_id)
      if (filterSet && !filterSet.has(key)) continue

      const existing = map.get(key) ?? { qty: 0, omzet: 0, buyerPaid: 0, received: 0 }
      existing.qty += item.model_quantity_purchased
      existing.omzet += item.model_discounted_price * item.model_quantity_purchased

      // Distribute escrow proportionally by item value
      const escrowData = escrowByOrderSn.get(order.orderSn)
      if (escrowData && escrowData.items.length > 0) {
        const itemValue = item.model_discounted_price * item.model_quantity_purchased
        const orderItemsTotal = escrowData.items.reduce((s, it) => s + it.discounted_price * it.qty, 0)
        const ratio = orderItemsTotal > 0 ? itemValue / orderItemsTotal : 0
        existing.buyerPaid += escrowData.buyerPaid * ratio
        existing.received += escrowData.escrow * ratio
      }

      map.set(key, existing)
    }
  }
  return map
}
```

- [ ] **Step 4: Check order.item_list type**

Read `lib/orders/types.ts` to confirm the field names for order items. The `item_list` on `OrderSummary` may use different field names than `item.item_id` / `item.model_quantity_purchased` / `item.model_discounted_price`. Adjust if needed.

Expected: `OrderSummary.item_list` is `OrderItemSummary[]` which has `qty`, `unitPrice`, and needs item_id. If `item_id` is not on `OrderItemSummary`, check `ShopeeOrderDetail.item_list` in `lib/shopee/types.ts`.

**Important:** `getSoldStatsPerItem` currently uses raw `order.item_list` from Shopee API (not the mapped `OrderItemSummary`). Confirm by reading `lib/products/service.ts` around the `getSoldStatsPerItem` function carefully before editing.

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
If errors about item fields, fix field names to match actual types. Expected final: `TypeScript compilation completed`

- [ ] **Step 6: Commit**

```bash
git add lib/products/service.ts
git commit -m "feat(products): extend SoldStats with buyerPaid/received from escrow"
```

---

### Task 3: Add buyerPaid + received to ProductSummary and propagate

**Files:**
- Modify: `lib/products/types.ts`
- Modify: `lib/products/service.ts` (getProductsPage + fetchProductsFresh return objects)

- [ ] **Step 1: Update ProductSummary type**

Read `lib/products/types.ts`. Find `ProductSummary` interface and add after `omzet30d`:
```typescript
buyerPaid30d: number    // real buyer_payment distributed
received30d: number     // real escrow distributed
```

- [ ] **Step 2: Update getProductsPage return mapping**

In `lib/products/service.ts`, find the `indexRows.map((row) => {` block in `getProductsPage`. Update the returned object to include:
```typescript
qtySold30d: stats.qty,
omzet30d: stats.omzet,
buyerPaid30d: stats.buyerPaid,
received30d: stats.received,
grossMargin30d: productHpp !== null
  ? stats.received - productHpp * stats.qty
  : null,
```

Note: grossMargin now uses `stats.received` (real escrow) instead of `stats.omzet / adminFee`.

- [ ] **Step 3: Update fetchProductsFresh return mapping**

Same change in `fetchProductsFresh` — find `qtySold30d: stats.qty` line and add `buyerPaid30d` + `received30d`, update `grossMargin30d` to use `stats.received`.

- [ ] **Step 4: Remove loadRates from both functions**

Since grossMargin now uses real `received` from escrow (not `omzet / adminFee`), the `loadRates()` call and `adminFee` variable in both `getProductsPage` and `fetchProductsFresh` can be removed. Remove them.

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 6: Commit**

```bash
git add lib/products/types.ts lib/products/service.ts
git commit -m "feat(products): add buyerPaid30d/received30d to ProductSummary, use real escrow for margin"
```

---

### Task 4: Settings fee analytics API + hook

**Files:**
- Create: `app/api/settings/shopee-fee/route.ts`
- Create: `lib/hooks/use-settings.ts`

- [ ] **Step 1: Create API route**

```typescript
// app/api/settings/shopee-fee/route.ts
import { auth } from "@/lib/auth"
import { getOrdersInRange } from "@/lib/orders/service"
import { getEscrowDetail } from "@/lib/shopee/escrow"
import { redisGet, redisSet } from "@/lib/redis"
import { NextResponse } from "next/server"

const CACHE_KEY = "settings:shopee-fee-analytics"
const CACHE_TTL = 3600  // 1 hour

export interface ShopeeFeeAnalytics {
  period: string                    // e.g. "30 hari terakhir"
  ordersAnalyzed: number
  totalOmzet: number
  totalBuyerPaid: number
  totalReceived: number
  totalCommission: number
  totalServiceFee: number
  totalTransactionFee: number
  totalShippingFee: number
  realFeeRatePct: number            // (1 - received/buyerPaid) * 100
  fetchedAt: string
}

export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const cached = await redisGet<ShopeeFeeAnalytics>(CACHE_KEY)
  if (cached) return NextResponse.json(cached)

  try {
    const now = Math.floor(Date.now() / 1000)
    const from = now - 30 * 24 * 60 * 60
    const orders = await getOrdersInRange({ timeFrom: from, timeTo: now })
    const uniqueSns = [...new Set(orders.map(o => o.orderSn))]

    let totalOmzet = 0
    let totalBuyerPaid = 0
    let totalReceived = 0
    let totalCommission = 0
    let totalServiceFee = 0
    let totalTransactionFee = 0
    let totalShippingFee = 0
    let ordersAnalyzed = 0

    // Accumulate omzet from order items
    for (const order of orders) {
      for (const item of order.item_list) {
        totalOmzet += item.unitPrice * item.qty
      }
    }

    // Fetch escrow for each order (concurrency 10)
    const CONCURRENCY = 10
    for (let i = 0; i < uniqueSns.length; i += CONCURRENCY) {
      const batch = uniqueSns.slice(i, i + CONCURRENCY)
      const results = await Promise.all(batch.map(sn => {
        const cacheKey = `escrow:${sn}`
        return redisGet<{ buyerPaid: number; escrow: number }>(cacheKey)
          .then(cached => cached ?? getEscrowDetail(sn))
      }))
      for (const detail of results) {
        if (!detail) continue
        if ('buyer_payment_amount' in detail) {
          // Raw ShopeeEscrowDetail
          totalBuyerPaid += detail.buyer_payment_amount
          totalReceived += detail.escrow_amount
          totalCommission += detail.commission_fee ?? 0
          totalServiceFee += detail.service_fee ?? 0
          totalTransactionFee += detail.transaction_fee ?? 0
          totalShippingFee += detail.actual_shipping_fee ?? 0
        } else {
          // Cached compact form
          totalBuyerPaid += detail.buyerPaid
          totalReceived += detail.escrow
        }
        ordersAnalyzed++
      }
    }

    const realFeeRatePct = totalBuyerPaid > 0
      ? (1 - totalReceived / totalBuyerPaid) * 100
      : 0

    const result: ShopeeFeeAnalytics = {
      period: "30 hari terakhir",
      ordersAnalyzed,
      totalOmzet: Math.round(totalOmzet),
      totalBuyerPaid: Math.round(totalBuyerPaid),
      totalReceived: Math.round(totalReceived),
      totalCommission: Math.round(totalCommission),
      totalServiceFee: Math.round(totalServiceFee),
      totalTransactionFee: Math.round(totalTransactionFee),
      totalShippingFee: Math.round(totalShippingFee),
      realFeeRatePct: Math.round(realFeeRatePct * 10) / 10,
      fetchedAt: new Date().toISOString(),
    }

    await redisSet(CACHE_KEY, result, CACHE_TTL)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create lib/hooks/use-settings.ts**

```typescript
"use client"

import { useQuery } from "@tanstack/react-query"
import type { ShopeeFeeAnalytics } from "@/app/api/settings/shopee-fee/route"

export function useShopeeFeeAnalytics() {
  return useQuery({
    queryKey: ["settings", "shopee-fee"],
    queryFn: async () => {
      const res = await fetch("/api/settings/shopee-fee")
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<ShopeeFeeAnalytics>
    },
    staleTime: 60 * 60 * 1000,  // 1 hour — matches server cache
    retry: false,
  })
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 4: Commit**

```bash
git add "app/api/settings/shopee-fee/route.ts" lib/hooks/use-settings.ts
git commit -m "feat(settings): shopee fee analytics API + hook"
```

---

### Task 5: ShopeeFeeAnalyticsCard component

**Files:**
- Create: `components/settings/ShopeeFeeAnalyticsCard.tsx`

Context: Look at `components/settings/KalkulatorSettingsCard.tsx` for UI patterns (glass-card style, `g-card`, `g-accent`, etc). The card is read-only — no form inputs.

- [ ] **Step 1: Create the component**

```tsx
"use client"

import { useShopeeFeeAnalytics } from "@/lib/hooks/use-settings"
import { useKalkulatorRates } from "@/lib/hooks/use-kalkulator"

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function pct(n: number) { return `${n.toFixed(1)}%` }

export function ShopeeFeeAnalyticsCard() {
  const { data, isLoading, isError, error } = useShopeeFeeAnalytics()
  const { data: rates } = useKalkulatorRates()
  const settingFeeRatePct = rates ? (1 - 1 / rates.adminEcommerce) * 100 : null

  return (
    <div className="rounded-[16px] p-5 space-y-4 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">📊 Analitik Biaya Shopee</div>
        <div className="text-xs mt-0.5 g-t4">
          Data real dari escrow Shopee — {data?.period ?? "30 hari terakhir"}
          {data?.fetchedAt && (
            <span className="ml-2">· diperbarui {new Date(data.fetchedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="text-sm text-center py-6 g-t4">Mengambil data escrow Shopee...</div>
      )}

      {isError && (
        <div className="text-xs text-red-400 py-2">
          Gagal load: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {data && (
        <>
          {/* Fee rate comparison */}
          <div className="rounded-[10px] p-3 space-y-2"
               style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
            <div className="text-xs font-semibold g-accent uppercase tracking-wider">Fee Rate</div>
            <div className="flex items-center justify-between">
              <span className="text-xs g-t3">Real fee rate (dari escrow)</span>
              <span className="text-sm font-bold" style={{ color: "#f87171" }}>
                {pct(data.realFeeRatePct)}
              </span>
            </div>
            {settingFeeRatePct !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs g-t3">Setting adminEcommerce</span>
                <span className="text-sm font-semibold g-t2">{pct(settingFeeRatePct)}</span>
              </div>
            )}
            {settingFeeRatePct !== null && (
              <div className="flex items-center justify-between pt-1"
                   style={{ borderTop: "1px solid var(--g-inner-border)" }}>
                <span className="text-xs g-t4">Selisih</span>
                <span className="text-xs font-medium"
                      style={{ color: data.realFeeRatePct > settingFeeRatePct ? "#f87171" : "#34d399" }}>
                  {data.realFeeRatePct > settingFeeRatePct ? "+" : ""}
                  {pct(data.realFeeRatePct - settingFeeRatePct)}
                  {data.realFeeRatePct > settingFeeRatePct
                    ? " — setting terlalu rendah"
                    : " — setting sudah aman"}
                </span>
              </div>
            )}
          </div>

          {/* Aggregate totals */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Total Omzet", value: fmt(data.totalOmzet) },
              { label: "Total Buyer Paid", value: fmt(data.totalBuyerPaid) },
              { label: "Total Diterima", value: fmt(data.totalReceived), highlight: true },
              { label: "Order Dianalisa", value: `${data.ordersAnalyzed} order` },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="rounded-[8px] px-3 py-2"
                   style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
                <div className="text-[10px] g-t4">{label}</div>
                <div className="text-sm font-semibold mt-0.5"
                     style={{ color: highlight ? "#34d399" : "var(--g-t1)" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Fee breakdown */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2 g-accent">
              Breakdown Potongan
            </div>
            <div className="space-y-1">
              {[
                { label: "Komisi Shopee", value: data.totalCommission },
                { label: "Service Fee", value: data.totalServiceFee },
                { label: "Transaction Fee", value: data.totalTransactionFee },
                { label: "Ongkir (beban seller)", value: data.totalShippingFee },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="g-t3">{label}</span>
                  <span className="font-mono g-t2">{fmt(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 3: Commit**

```bash
git add components/settings/ShopeeFeeAnalyticsCard.tsx
git commit -m "feat(settings): ShopeeFeeAnalyticsCard UI component"
```

---

### Task 6: Add card to Settings page + update ProductRow

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`
- Modify: `components/products/ProductRow.tsx`

- [ ] **Step 1: Read Settings page**

```bash
cat -n "app/(dashboard)/settings/page.tsx"
```

Find where `KalkulatorSettingsCard` is rendered. Import and add `ShopeeFeeAnalyticsCard` after it:

```tsx
import { ShopeeFeeAnalyticsCard } from "@/components/settings/ShopeeFeeAnalyticsCard"
// ...
<ShopeeFeeAnalyticsCard />
```

- [ ] **Step 2: Update ProductRow to show financial stats**

Read `components/products/ProductRow.tsx`. In the stats row (where `omzet30d` is shown), add `buyerPaid30d`, `received30d`, and updated `grossMargin30d`.

Find this existing line in the stats flex div:
```tsx
<span>30d: {fmtNum(product.qtySold30d)} pcs · {fmt(product.omzet30d)}</span>
```

Replace with:
```tsx
<span>30d: {fmtNum(product.qtySold30d)} pcs</span>
<span>Omzet: {fmt(product.omzet30d)}</span>
{product.buyerPaid30d > 0 && (
  <span>Buyer paid: {fmt(product.buyerPaid30d)}</span>
)}
{product.received30d > 0 && (
  <span style={{ color: "rgba(52,211,153,0.8)" }}>
    Diterima: {fmt(product.received30d)}
  </span>
)}
```

And update the grossMargin display — it's already there, just confirm it uses `product.grossMargin30d` (which now uses real escrow in service).

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/settings/page.tsx" components/products/ProductRow.tsx
git commit -m "feat: add ShopeeFeeAnalyticsCard to Settings, show escrow stats in ProductRow"
```

---

### Task 7: Deploy + smoke test

- [ ] **Step 1: Deploy**

```bash
./deploy.sh
```

- [ ] **Step 2: Check logs for errors**

```bash
docker -H tcp://192.168.88.113:2375 logs shopee-dashboard --tail 30 2>&1 | grep -i "escrow\|error\|Error" | head -20
```

- [ ] **Step 3: Verify escrow cache keys in Redis**

```bash
# After browsing Produk page
docker -H tcp://192.168.88.113:2375 exec light-generator-redis-1 redis-cli KEYS "escrow:*" | head -5
docker -H tcp://192.168.88.113:2375 exec light-generator-redis-1 redis-cli KEYS "settings:*"
```

Expected: `escrow:<order_sn>` keys and `settings:shopee-fee-analytics` key appear.

- [ ] **Step 4: Verify Settings page**

Buka Settings → scroll ke "Analitik Biaya Shopee" → data muncul (mungkin perlu tunggu beberapa menit untuk fetch semua escrow).
