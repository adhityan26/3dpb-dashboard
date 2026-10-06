# WP per unit — Tahap 1 (skema, unit order, income per order) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order baru dibuat menjadi satu WP per unit (qty n → n WP) di bawah `MarketplaceOrder`, dan income (harga jual/biaya/pendapatan) dihitung per order lalu dibagi proporsional ke WP.

**Architecture:** Tabel `MarketplaceOrder` menyimpan income order; `WorkingProject` mendapat `orderId`, `sourceItemKey`, `itemPrice`. Fungsi pure `expandOrderUnits` (item → unit berkunci) dan `allocateOrderIncome` (pembagian proporsional) diuji terpisah; `createWorkingProjectsForOrder` dipakai oleh auto-create, route POST dashboard, dan bot. `income-sync` membaca per `MarketplaceOrder`.

**Tech Stack:** Next.js 16, Prisma 7 + Postgres, Vitest (+RTL), TypeScript. Jalankan perintah dari `apps/dashboard` dengan `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.

**Spec:** `docs/superpowers/specs/2026-10-07-wp-per-item-orders-design.md` (revisi 3). Tahap 2 (backfill + invoice per order) dan Tahap 3 (skrip pemecah 21 WP aktif) adalah plan terpisah.

## Global Constraints

- Komentar kode & pesan commit: Bahasa Inggris. Commit pakai `git add <path spesifik>` (jangan `-A`). Akhiri commit dengan `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- JANGAN deploy; JANGAN menyentuh DB produksi / API marketplace dari tes. Tes memakai mock.
- Kunci unit = `<kunciBaris>#<n>`; `n` berjalan **per kunci baris di seluruh order**. Kunci baris Shopee = `line_item_id`, Tokopedia = `sku_id`.
- Hanya unit aktif yang dibuat WP: Shopee `qty − cancelled_qty`, Tokopedia `quantity`.
- Alokasi income: `salePrice` dan `feesTotal` **order** keduanya dibagi proporsional bobot `itemPrice`; selisih pembulatan ke WP terakhir; `Σ bobot = 0` → bagi rata; WP `Canceled` tidak ikut.
- Client bundle tidak boleh meng-import `@/lib/db` (pure helper dipisah dari service).
- WP gabungan lama (tanpa `sourceItemKey`) mewakili seluruh order: order itu dilewati oleh pembuatan unit.

## File Structure

- Modify `apps/dashboard/prisma/schema.prisma` — `MarketplaceOrder`; kolom baru WP; hapus kolom income dari WP.
- Create `apps/dashboard/lib/working-projects/order-units.ts` — pure: tipe `OrderLine`, `OrderUnit`, `expandOrderUnits`.
- Create `apps/dashboard/lib/working-projects/income-allocation.ts` — pure: `allocateOrderIncome`.
- Modify `apps/dashboard/lib/orders/types.ts`, `lib/orders/service.ts`, `lib/tokopedia/types.ts`, `lib/tokopedia/parse.ts` — meneruskan id/qty/harga baris.
- Modify `apps/dashboard/lib/working-projects/service.ts` — `createWorkingProjectsForOrder`, dedupe dua query.
- Modify `apps/dashboard/lib/working-projects/auto-create.ts`, `app/api/working-projects/route.ts`, `app/api/bot/working-projects/route.ts`, `components/order/OrderRow.tsx`, `components/order/TokopediaOrderRow.tsx` — memakai fungsi baru.
- Modify `apps/dashboard/lib/working-projects/income.ts`, `income-sync.ts` — income per `MarketplaceOrder`; `resolveWpIncome` memakai alokasi.
- Modify `apps/dashboard/app/api/working-projects/route.ts` (GET) — menyertakan income order per WP.
- Tests di `apps/dashboard/lib/working-projects/__tests__/`.

---

### Task 1: Skema

**Files:** Modify `apps/dashboard/prisma/schema.prisma`

**Interfaces:** Produces model `MarketplaceOrder`, field WP `orderId`, `sourceItemKey`, `itemPrice`.

- [ ] **Step 1: Ubah schema.** Tambahkan model dan field, hapus 6 kolom income dari `WorkingProject`:

```prisma
model MarketplaceOrder {
  id              String   @id @default(cuid())
  source          String   // 'shopee' | 'tokopedia'
  sourceOrderNo   String
  salePrice       Int?
  feesTotal       Int?
  netIncome       Int?
  incomeStatus    String?  // 'estimated' | 'settled' | 'unavailable'
  incomeSettledAt DateTime?
  incomeSyncedAt  DateTime?
  quotationId     String?  // invoice of this order (no FK, like WorkingProject.quotationId)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  projects        WorkingProject[]

  @@unique([source, sourceOrderNo])
}
```

Di `WorkingProject`: ganti blok income (`salePrice` … `incomeSyncedAt`) dengan

```prisma
  orderId        String?
  order          MarketplaceOrder? @relation(fields: [orderId], references: [id])
  sourceItemKey  String?
  itemPrice      Int?
  ...
  @@unique([source, sourceOrderNo, sourceItemKey])
  @@index([orderId])
```

- [ ] **Step 2:** `pnpm exec prisma generate` — Expected: sukses. `pnpm exec tsc --noEmit -p . 2>&1 | grep -v __tests__ | grep error` — Expected: error hanya di `income-sync.ts`, `income.ts`, `WorkingProjectOrdersTab.tsx`, hook (dikerjakan Task 5–6); catat daftarnya.
- [ ] **Step 3: Commit** — `git add apps/dashboard/prisma/schema.prisma && git commit -m "feat(working-projects): MarketplaceOrder parent and per-unit WP fields"` (typecheck merah sementara; Task 5–6 memperbaikinya — commit boleh tetap karena branch belum dideploy).

---

### Task 2: Unit order (pure)

**Files:** Create `apps/dashboard/lib/working-projects/order-units.ts`; Test `lib/working-projects/__tests__/order-units.test.ts`

**Interfaces:** Produces:

```ts
export interface OrderLine { key: string; productName: string; variantName: string | null; qty: number; unitPrice: number; productId: string | null }
export interface OrderUnit { itemKey: string; productName: string; variantName: string | null; unitPrice: number; productId: string | null }
export function expandOrderUnits(lines: OrderLine[]): OrderUnit[]
```

- [ ] **Step 1: Tes yang gagal**

```ts
import { describe, it, expect } from 'vitest'
import { expandOrderUnits, type OrderLine } from '../order-units'

const line = (over: Partial<OrderLine>): OrderLine => ({ key: 'A', productName: 'GL Ring', variantName: '7', qty: 1, unitPrice: 136500, productId: 'p1', ...over })

describe('expandOrderUnits', () => {
  it('one unit per quantity, keyed <lineKey>#<n>', () => {
    const u = expandOrderUnits([line({ qty: 2 })])
    expect(u.map((x) => x.itemKey)).toEqual(['A#1', 'A#2'])
  })
  it('two lines with different keys each start at #1', () => {
    const u = expandOrderUnits([line({ key: 'A', variantName: '7' }), line({ key: 'B', variantName: '13' })])
    expect(u.map((x) => [x.itemKey, x.variantName])).toEqual([['A#1', '7'], ['B#1', '13']])
  })
  it('numbers continue across lines that share a key', () => {
    const u = expandOrderUnits([line({ key: 'A', qty: 1 }), line({ key: 'A', qty: 2 })])
    expect(u.map((x) => x.itemKey)).toEqual(['A#1', 'A#2', 'A#3'])
  })
  it('skips lines with no active quantity', () => {
    expect(expandOrderUnits([line({ qty: 0 })])).toEqual([])
  })
})
```

- [ ] **Step 2:** `pnpm exec vitest run lib/working-projects/__tests__/order-units.test.ts` — Expected: FAIL (module tidak ada).
- [ ] **Step 3: Implementasi**

```ts
// One WP is created per unit, not per order line: a line with qty 2 becomes two WPs, so
// the packing list and the per-size progress count every ring. The unit key is stable
// across re-fetches, which is what makes creation idempotent.
export interface OrderLine {
  key: string // Shopee line_item_id / Tokopedia sku_id
  productName: string
  variantName: string | null
  qty: number // active quantity (already net of cancelled units)
  unitPrice: number
  productId: string | null
}

export interface OrderUnit {
  itemKey: string
  productName: string
  variantName: string | null
  unitPrice: number
  productId: string | null
}

export function expandOrderUnits(lines: OrderLine[]): OrderUnit[] {
  const seen = new Map<string, number>() // numbering runs per key across the whole order
  const units: OrderUnit[] = []
  for (const l of lines) {
    for (let i = 0; i < Math.max(0, Math.floor(l.qty)); i++) {
      const n = (seen.get(l.key) ?? 0) + 1
      seen.set(l.key, n)
      units.push({ itemKey: `${l.key}#${n}`, productName: l.productName, variantName: l.variantName, unitPrice: l.unitPrice, productId: l.productId })
    }
  }
  return units
}
```

- [ ] **Step 4:** jalankan tes — Expected: PASS. **Step 5: Commit** (`order-units.ts` + tes).

---

### Task 3: Alokasi income (pure)

**Files:** Create `apps/dashboard/lib/working-projects/income-allocation.ts`; Test `__tests__/income-allocation.test.ts`

**Interfaces:** Produces:

```ts
export interface OrderIncomeTotals { salePrice: number; feesTotal: number; netIncome: number }
export function allocateOrderIncome(order: OrderIncomeTotals, weights: number[]): { salePrice: number; feesTotal: number; netIncome: number }[]
```

- [ ] **Step 1: Tes yang gagal**

```ts
import { describe, it, expect } from 'vitest'
import { allocateOrderIncome } from '../income-allocation'

const order = { salePrice: 273000, feesTotal: 53890, netIncome: 219110 }
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('allocateOrderIncome', () => {
  it('splits sale price and fees by weight and the parts add back to the order', () => {
    const r = allocateOrderIncome(order, [136500, 136500])
    expect(r.map((x) => x.salePrice)).toEqual([136500, 136500])
    expect(sum(r.map((x) => x.feesTotal))).toBe(53890)
    expect(sum(r.map((x) => x.netIncome))).toBe(219110)
  })
  it('puts the rounding remainder on the last WP', () => {
    const r = allocateOrderIncome({ salePrice: 100, feesTotal: 10, netIncome: 90 }, [1, 1, 1])
    expect(sum(r.map((x) => x.salePrice))).toBe(100)
    expect(r[0].salePrice).toBe(33)
    expect(r[2].salePrice).toBe(34)
  })
  it('weights by item price, not evenly', () => {
    const r = allocateOrderIncome({ salePrice: 300, feesTotal: 30, netIncome: 270 }, [100, 200])
    expect(r.map((x) => x.salePrice)).toEqual([100, 200])
    expect(r.map((x) => x.feesTotal)).toEqual([10, 20])
  })
  it('splits evenly when every weight is zero', () => {
    const r = allocateOrderIncome({ salePrice: 100, feesTotal: 10, netIncome: 90 }, [0, 0])
    expect(r.map((x) => x.salePrice)).toEqual([50, 50])
  })
  it('a single WP gets the whole order', () => {
    expect(allocateOrderIncome(order, [136500])).toEqual([order])
  })
  it('returns nothing for no WPs', () => {
    expect(allocateOrderIncome(order, [])).toEqual([])
  })
})
```

- [ ] **Step 2:** run — Expected: FAIL. **Step 3: Implementasi**

```ts
export interface OrderIncomeTotals { salePrice: number; feesTotal: number; netIncome: number }

// Splits an order's income over its WPs. Sale price and fees are both allocated from the
// ORDER totals (item prices are only the weights), so the parts always add back to the
// order even when the lines don't sum to the order's sale price (vouchers, subsidies).
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const shares = weights.map((w) => (sum > 0 ? Math.floor((total * w) / sum) : Math.floor(total / weights.length)))
  shares[shares.length - 1] += total - shares.reduce((a, b) => a + b, 0)
  return shares
}

export function allocateOrderIncome(order: OrderIncomeTotals, weights: number[]): OrderIncomeTotals[] {
  if (weights.length === 0) return []
  const sale = split(order.salePrice, weights)
  const fees = split(order.feesTotal, weights)
  return weights.map((_, i) => ({ salePrice: sale[i], feesTotal: fees[i], netIncome: sale[i] - fees[i] }))
}
```

Catatan: `netIncome` order = `salePrice − feesTotal` (Shopee: fees = selling − escrow; Tokopedia: earning − |fees| = settlement) sehingga jumlah `netIncome` WP = `netIncome` order. Tes "single WP" memakai order yang memenuhi `salePrice − feesTotal = netIncome`; perbaiki fixture bila tidak (273000 − 53890 = 219110 ✓).

- [ ] **Step 4:** run — Expected: PASS. **Step 5: Commit.**

---

### Task 4: Baris order dari parser (id, qty, harga)

**Files:** Modify `lib/orders/types.ts`, `lib/orders/service.ts`, `lib/tokopedia/types.ts`, `lib/tokopedia/parse.ts`; Test `lib/tokopedia/__tests__/parse.test.ts` (tambah kasus)

**Interfaces:** Consumes `OrderLine` (Task 2). Produces `OrderItemSummary` + `lineItemId: number | null; modelId: number | null; cancelledQty: number`, dan `TokopediaOrderSummary.products[]` + `skuId: string; productId: string; unitPrice: number`; helper `orderLinesFromShopee(items)` / `orderLinesFromTokopedia(products)` di `order-units.ts`.

- [ ] **Step 1:** Tambah ke `OrderItemSummary`: `lineItemId: number | null`, `modelId: number | null`, `cancelledQty: number`. Di `lib/orders/service.ts` (map `d.item_list`) isi `lineItemId: it.line_item_id ?? null`, `modelId: it.model_id ?? null`, `cancelledQty: it.cancelled_qty ?? 0`; pastikan `ShopeeOrderItem` di `lib/shopee/types.ts` mendeklarasikan `line_item_id?: number`, `cancelled_qty?: number`.
- [ ] **Step 2:** Di `parseOrder` tambah ke tiap produk `skuId: String(s.sku_id ?? "")`, `productId: String(s.product_id ?? "")`, `unitPrice: qty > 0 ? Math.round(priceVal(s.sku_total_price) / qty) : 0` (perluas tipe di `types.ts`). Tes: fixture `sku_module` dengan `sku_id`, `product_id`, `quantity: 2`, `sku_total_price` → `skuId`, `unitPrice` terhitung.
- [ ] **Step 3:** Di `order-units.ts` tambah:

```ts
export function orderLinesFromShopee(items: { lineItemId: number | null; itemId: number; modelId: number | null; productName: string; variantName: string | null; qty: number; cancelledQty: number; unitPrice: number }[]): OrderLine[] {
  return items.map((it) => ({
    key: it.lineItemId != null ? String(it.lineItemId) : `${it.itemId}:${it.modelId ?? 0}`,
    productName: it.productName,
    variantName: it.variantName,
    qty: it.qty - it.cancelledQty,
    unitPrice: it.unitPrice,
    productId: String(it.itemId),
  }))
}

export function orderLinesFromTokopedia(products: { skuId: string; productId: string; name: string; variant: string; qty: number; unitPrice: number }[]): OrderLine[] {
  return products.map((p) => ({ key: p.skuId, productName: p.name, variantName: p.variant || null, qty: p.qty, unitPrice: p.unitPrice, productId: p.productId || null }))
}
```

dengan tes untuk keduanya (qty − cancelled, fallback kunci Shopee bila `line_item_id` kosong).
- [ ] **Step 4:** `pnpm exec vitest run lib/working-projects lib/tokopedia lib/orders` — Expected: PASS. **Step 5: Commit.**

---

### Task 5: createWorkingProjectsForOrder + semua pintu masuk

**Files:** Modify `lib/working-projects/service.ts`, `auto-create.ts`, `app/api/working-projects/route.ts`, `app/api/bot/working-projects/route.ts`, `components/order/OrderRow.tsx`, `components/order/TokopediaOrderRow.tsx`; Test `__tests__/create-for-order.test.ts`, `__tests__/auto-create.test.ts` (perbarui)

**Interfaces:** Produces:

```ts
export async function createWorkingProjectsForOrder(input: {
  source: 'shopee' | 'tokopedia'
  sourceOrderNo: string
  units: OrderUnit[]
  base: Omit<Parameters<typeof createWorkingProject>[0], 'source' | 'sourceOrderNo' | 'product' | 'variant' | 'sourceProductId' | 'forumChannelId'> & { forumChannelIdFor: (unit: OrderUnit) => string }
}): Promise<{ created: number; skipped: number; results: Awaited<ReturnType<typeof createWorkingProject>>[] }>
```

- [ ] **Step 1: Tes yang gagal** (mock `@/lib/db` dan `./discord-sync` seperti `service.test.ts`): (a) order dengan 2 unit → 2 baris `workingProject.create` dengan `sourceItemKey` `A#1`/`B#1`, `variant` terisi, `itemPrice`, `orderId` dari upsert `marketplaceOrder`; (b) sudah ada WP **tanpa** `sourceItemKey` untuk order → `created: 0`, tidak ada `create`; (c) unit yang kuncinya sudah ada dilewati, yang lain dibuat; (d) `findFirst` dipanggil dengan `sourceItemKey: null` untuk cek WP lama (bukan `undefined`).
- [ ] **Step 2:** run — FAIL. **Step 3: Implementasi** di `service.ts`: ubah `createWorkingProject` agar menerima `orderId?`, `sourceItemKey?`, `itemPrice?` dan **guard lama hanya berlaku bila `sourceItemKey` tidak diberikan** (cek `where: { source, sourceOrderNo, sourceItemKey: null }` — memblokir hanya WP gabungan/legacy; cek per unit `where: { source, sourceOrderNo, sourceItemKey: input.sourceItemKey }`). Tambah `createWorkingProjectsForOrder`:

```ts
export async function createWorkingProjectsForOrder(input: {...}) {
  const order = await prisma.marketplaceOrder.upsert({
    where: { source_sourceOrderNo: { source: input.source, sourceOrderNo: input.sourceOrderNo } },
    update: {}, create: { source: input.source, sourceOrderNo: input.sourceOrderNo },
  })
  // A WP without an item key is a legacy combined WP that already stands for the whole order.
  const legacy = await prisma.workingProject.findFirst({ where: { source: input.source, sourceOrderNo: input.sourceOrderNo, sourceItemKey: null } })
  if (legacy) return { created: 0, skipped: input.units.length, results: [] }
  const results = []
  let created = 0, skipped = 0
  for (const unit of input.units) {
    const r = await createWorkingProject({
      ...input.base, source: input.source, sourceOrderNo: input.sourceOrderNo,
      product: unit.productName, variant: unit.variantName ?? undefined,
      sourceProductId: unit.productId ?? undefined,
      forumChannelId: input.base.forumChannelIdFor(unit),
      orderId: order.id, sourceItemKey: unit.itemKey, itemPrice: unit.unitPrice,
    })
    results.push(r)
    if (r.skipped) skipped++; else created++
  }
  return { created, skipped, results }
}
```

- [ ] **Step 4:** `auto-create.ts`: kandidat membawa `units` (dari `orderLinesFromShopee`/`orderLinesFromTokopedia` → `expandOrderUnits`); loop memanggil `createWorkingProjectsForOrder` dengan `forumChannelIdFor: (u) => forumChannelIdForCategory(detectProductCategory({ product: u.productName, sourceProductId: u.productId ?? undefined, configuredProductIds }))`; hitung `created/skipped` dari hasilnya. Perbarui `auto-create.test.ts` (fixture dengan `qty` dan beberapa baris; assert jumlah WP = jumlah unit).
- [ ] **Step 5:** Pintu manual: `app/api/working-projects/route.ts` POST — bila `body.source !== 'manual'` dan `body.units` (array `OrderUnit`) ada → `createWorkingProjectsForOrder`; tanpa `units` untuk order marketplace → 400 (`units wajib untuk order marketplace`). `OrderRow`/`TokopediaOrderRow` mengirim `units` dari `expandOrderUnits(orderLinesFrom…(order.items))`. Bot `POST` mengikuti aturan sama (dokumentasi bot diperbarui di Tahap 2). Tes route: marketplace tanpa `units` → 400; manual tetap seperti sebelumnya.
- [ ] **Step 6:** `pnpm exec vitest run lib/working-projects components/order app/api` — PASS. **Step 7: Commit.**

---

### Task 6: Income per order dan tampilan per WP

**Files:** Modify `lib/working-projects/income.ts`, `income-sync.ts`, `app/api/working-projects/route.ts` (GET), `lib/hooks/use-working-projects.ts`, `components/order/WorkingProjectOrdersTab.tsx`; Tests `income.test.ts`, `income-sync.test.ts`, `WorkingProjectOrdersTab.test.tsx`

**Interfaces:** Consumes `allocateOrderIncome`. Produces `WorkingProject.order?: { salePrice, feesTotal, netIncome, incomeStatus, incomeSettledAt, quotationId, activeWeights... }` — GET menyertakan `order` plus daftar `siblings: {id, itemPrice, status}[]` supaya alokasi bisa dihitung di klien.

- [ ] **Step 1:** `income-sync.ts`: target = `marketplaceOrder` yang punya ≥1 WP `Done` dan (incomeStatus null/estimated stale 12 jam, atau unavailable stale 3 hari); `save()` menulis ke `marketplaceOrder`; pemetaan Tokopedia `pending` per `sourceOrderNo` (satu `MarketplaceOrder` per nomor, jadi tak ada grup). Perbarui seluruh tes `income-sync.test.ts` ke bentuk baru (mock `prisma.marketplaceOrder.findMany/update`).
- [ ] **Step 2:** `income.ts`: `resolveWpIncome(wp)` — manual → invoice; punya `order` dengan income → `allocateOrderIncome(order, siblingsActiveWeights)[indexWP]`, `status` dari order; WP tanpa `itemPrice` (gabungan lama) → angka order apa adanya. Tes: dua WP satu order menjumlah ke order; WP Canceled tidak ikut penyebut; gabungan lama memakai order penuh.
- [ ] **Step 3:** GET `/api/working-projects` `include: { order: { include: { projects: { select: { id: true, itemPrice: true, status: true } } } } }` dan petakan ke `order` + `siblings` pada JSON; perbarui tipe hook dan `IncomeCells`/export agar memakai `resolveWpIncome`. Tes tab Orders: dua WP satu order menampilkan bagian masing-masing, penanda "1 dari 2 unit order ini".
- [ ] **Step 4:** `pnpm exec vitest run lib/working-projects components/order app/api` + `pnpm exec tsc --noEmit -p . | grep -v __tests__ | grep error` — Expected: PASS, tanpa error. **Step 5: Commit.**

---

### Task 7: Verifikasi tahap 1 (read-only)

- [ ] **Step 1:** Skrip sekali jalan read-only (jangan di-commit) memuat order `586311573917172770` dari Tokopedia dan mencetak `expandOrderUnits(orderLinesFromTokopedia(parseOrder(raw).products))` — Expected: 2 unit (`<sku_id>#1` ukuran 7, `<sku_id>#1` ukuran 13), `unitPrice` 136500 masing-masing; dan untuk Shopee `260922NX7KND3X` 2 unit berkunci `line_item_id`.
- [ ] **Step 2:** Jalankan seluruh tes dashboard: `pnpm exec vitest run` — Expected: PASS (selain kegagalan yang sudah ada sebelum branch ini; bandingkan dengan `master`).
- [ ] **Step 3:** Laporkan ke pemilik; **jangan deploy** — Tahap 2 (backfill + invoice) harus selesai dulu karena `db push` tahap 1 membuat WP lama tanpa `orderId`.

## Self-Review

- Spec: kunci unit (Task 2/4), alokasi (Task 3/6), `MarketplaceOrder` + kolom WP + unique/index (Task 1), satu fungsi untuk semua pintu (Task 5), dedupe dua query (Task 5), income-sync per order (Task 6). Di Tahap 2/3: backfill, invoice per order, bot docs, skrip pemecah.
- Konsistensi nama: `OrderLine/OrderUnit/expandOrderUnits`, `allocateOrderIncome`, `createWorkingProjectsForOrder`, `orderLinesFromShopee/Tokopedia`.
