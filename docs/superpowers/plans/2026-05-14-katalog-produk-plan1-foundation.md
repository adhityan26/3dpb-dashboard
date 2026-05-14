# Plan: Katalog Produk Internal — Foundation Layer

**Date:** 2026-05-14
**Feature:** ProdukInternal catalog + HPP-from-kalkulasi + remove manual HPP edit
**Plan scope:** DB + Service + API + Hooks + product enrichment + HPP edit removal

---

## Context & Goal

The dashboard currently stores HPP via `ProductHpp` / `VariantHpp` tables with a manual inline-edit UI. This plan replaces that system with:

1. A new `ProdukInternal` model (internal catalog entries, e.g. "Flexi Shark")
2. `ProdukInternalShopeeLink` — a join table mapping one `ProdukInternal` to many Shopee item IDs
3. HPP is now read from `ProdukInternal.primaryKalkulasi.hppTotal` — calculated, not manually entered
4. `ProductSummary` gains a `katalog` field; the manual HPP edit UI is removed from `ProductRow`/`ProductList`/`produk/page.tsx`

**The `ProductHpp` and `VariantHpp` tables and their service code are NOT deleted in this plan** — that is a separate cleanup task. Only the UI wires for editing them are removed.

---

## File Map

| Action   | Path                                                                         | Responsibility                                               |
|----------|------------------------------------------------------------------------------|--------------------------------------------------------------|
| Modify   | `prisma/schema.prisma`                                                       | Add ProdukInternal + ProdukInternalShopeeLink + back-relation |
| Create   | `prisma/migrations/20260514_add_produk_internal/migration.sql`               | SQLite DDL for new tables                                    |
| Create   | `lib/katalog/types.ts`                                                       | ProdukInternalData, ProdukInternalInput                      |
| Create   | `lib/katalog/service.ts`                                                     | CRUD + link management service functions                     |
| Create   | `app/api/katalog/route.ts`                                                   | GET list, POST create                                        |
| Create   | `app/api/katalog/[id]/route.ts`                                              | GET, PUT, DELETE by id                                       |
| Create   | `app/api/katalog/[id]/shopee-links/route.ts`                                 | POST add Shopee link                                         |
| Create   | `app/api/katalog/[id]/shopee-links/[shopeeItemId]/route.ts`                  | DELETE remove Shopee link                                    |
| Create   | `app/api/katalog/[id]/kalkulasi/route.ts`                                    | PUT set primary kalkulasi                                    |
| Create   | `lib/hooks/use-katalog.ts`                                                   | React Query hooks                                            |
| Modify   | `lib/products/types.ts`                                                      | Add `katalog?` field to ProductSummary                       |
| Modify   | `lib/products/service.ts`                                                    | Replace ProductHpp lookup with katalog lookup                |
| Modify   | `components/products/ProductRow.tsx`                                         | Remove HPP edit UI; show katalog HPP read-only               |
| Modify   | `components/products/ProductList.tsx`                                        | Remove HPP edit props                                        |
| Modify   | `app/(dashboard)/produk/page.tsx`                                            | Remove HppEditModal, useSetHpp, canEditHpp                   |

---

## Task 1 — DB Schema + Migration

### Step 1.1 — Modify `prisma/schema.prisma`

Add the two new models and the back-relation on `KalkulasiHarga`.

**Current end of `KalkulasiHarga` model (lines ~211–214):**
```prisma
  plates            KalkulasiPlate[]
  komponenKustom    KomponenKustom[]
  produkLinks       KalkulasiProduk[]
}
```

**Replace with:**
```prisma
  plates               KalkulasiPlate[]
  komponenKustom       KomponenKustom[]
  produkLinks          KalkulasiProduk[]
  produkInternalLinks  ProdukInternal[]
}
```

Then append after the last model in the file (after `ResinHarga`):

```prisma
model ProdukInternal {
  id                 String                     @id @default(cuid())
  nama               String
  deskripsi          String?
  primaryKalkulasiId String?
  primaryKalkulasi   KalkulasiHarga?            @relation(fields: [primaryKalkulasiId], references: [id], onDelete: SetNull)
  shopeeLinks        ProdukInternalShopeeLink[]
  createdAt          DateTime                   @default(now())
  updatedAt          DateTime                   @updatedAt
}

model ProdukInternalShopeeLink {
  id               String         @id @default(cuid())
  produkInternalId String
  produkInternal   ProdukInternal @relation(fields: [produkInternalId], references: [id], onDelete: Cascade)
  shopeeItemId     String

  @@unique([produkInternalId, shopeeItemId])
}
```

### Step 1.2 — Create `prisma/migrations/20260514_add_produk_internal/migration.sql`

```sql
-- CreateTable: ProdukInternal
CREATE TABLE "ProdukInternal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nama" TEXT NOT NULL,
    "deskripsi" TEXT,
    "primaryKalkulasiId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProdukInternal_primaryKalkulasiId_fkey"
        FOREIGN KEY ("primaryKalkulasiId")
        REFERENCES "KalkulasiHarga" ("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: ProdukInternalShopeeLink
CREATE TABLE "ProdukInternalShopeeLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "produkInternalId" TEXT NOT NULL,
    "shopeeItemId" TEXT NOT NULL,
    CONSTRAINT "ProdukInternalShopeeLink_produkInternalId_fkey"
        FOREIGN KEY ("produkInternalId")
        REFERENCES "ProdukInternal" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateUniqueIndex: prevent duplicate Shopee links per ProdukInternal
CREATE UNIQUE INDEX "ProdukInternalShopeeLink_produkInternalId_shopeeItemId_key"
    ON "ProdukInternalShopeeLink"("produkInternalId", "shopeeItemId");
```

### Step 1.3 — Verify

```bash
npx tsc --noEmit
```

Expected: no errors. The schema types will not be generated until `prisma generate` runs, but TypeScript compilation of non-Prisma files should pass.

Then apply the migration:

```bash
npx prisma migrate dev --name add_produk_internal
```

Or if using `db push` workflow:

```bash
npx prisma db push
```

### Step 1.4 — Commit

```
git add prisma/schema.prisma prisma/migrations/20260514_add_produk_internal/migration.sql
git commit -m "feat(db): add ProdukInternal and ProdukInternalShopeeLink models"
```

---

## Task 2 — Types + Service

### Step 2.1 — Create `lib/katalog/types.ts`

```typescript
export interface ProdukInternalData {
  id: string
  nama: string
  deskripsi: string | null
  primaryKalkulasiId: string | null
  // Denormalized from primaryKalkulasi for convenience in UI:
  hppTotal: number | null
  floorPrice: number | null
  shopeeA: number | null
  kalkulasiStatus: string | null   // KalkulasiStatus value e.g. "AMAN"
  kalkulasiNama: string | null     // .nama from the linked KalkulasiHarga
  shopeeLinks: { id: string; shopeeItemId: string }[]
  createdAt: string
  updatedAt: string
}

export interface ProdukInternalInput {
  nama: string
  deskripsi?: string
}
```

### Step 2.2 — Create `lib/katalog/service.ts`

```typescript
import { prisma } from '@/lib/db'
import type { ProdukInternalData, ProdukInternalInput } from './types'

const INCLUDE_ALL = {
  primaryKalkulasi: true,
  shopeeLinks: true,
} as const

function toProdukInternalData(raw: any): ProdukInternalData {
  const k = raw.primaryKalkulasi ?? null
  return {
    id: raw.id,
    nama: raw.nama,
    deskripsi: raw.deskripsi ?? null,
    primaryKalkulasiId: raw.primaryKalkulasiId ?? null,
    hppTotal: k ? (k.hppTotal ?? null) : null,
    floorPrice: k ? (k.floorPrice ?? null) : null,
    shopeeA: k ? (k.shopeeA ?? null) : null,
    kalkulasiStatus: k ? (k.status ?? null) : null,
    kalkulasiNama: k ? (k.nama ?? null) : null,
    shopeeLinks: (raw.shopeeLinks ?? []).map((l: any) => ({
      id: l.id,
      shopeeItemId: l.shopeeItemId,
    })),
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
  }
}

export async function listKatalog(): Promise<ProdukInternalData[]> {
  const rows = await prisma.produkInternal.findMany({
    include: INCLUDE_ALL,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toProdukInternalData)
}

export async function getKatalog(id: string): Promise<ProdukInternalData | null> {
  const row = await prisma.produkInternal.findUnique({
    where: { id },
    include: INCLUDE_ALL,
  })
  if (!row) return null
  return toProdukInternalData(row)
}

export async function createKatalog(input: ProdukInternalInput): Promise<ProdukInternalData> {
  const row = await prisma.produkInternal.create({
    data: {
      nama: input.nama.trim(),
      deskripsi: input.deskripsi?.trim() ?? null,
    },
    include: INCLUDE_ALL,
  })
  return toProdukInternalData(row)
}

export async function updateKatalog(
  id: string,
  input: ProdukInternalInput,
): Promise<ProdukInternalData> {
  const row = await prisma.produkInternal.update({
    where: { id },
    data: {
      nama: input.nama.trim(),
      deskripsi: input.deskripsi?.trim() ?? null,
    },
    include: INCLUDE_ALL,
  })
  return toProdukInternalData(row)
}

export async function deleteKatalog(id: string): Promise<void> {
  await prisma.produkInternal.delete({ where: { id } })
}

/**
 * Adds a Shopee item link to a ProdukInternal.
 * Uses upsert to be idempotent (@@unique ensures no duplicates).
 */
export async function addShopeeLink(
  produkInternalId: string,
  shopeeItemId: string,
): Promise<void> {
  await prisma.produkInternalShopeeLink.upsert({
    where: {
      produkInternalId_shopeeItemId: { produkInternalId, shopeeItemId },
    },
    create: { produkInternalId, shopeeItemId },
    update: {},
  })
}

export async function removeShopeeLink(
  produkInternalId: string,
  shopeeItemId: string,
): Promise<void> {
  await prisma.produkInternalShopeeLink.delete({
    where: {
      produkInternalId_shopeeItemId: { produkInternalId, shopeeItemId },
    },
  })
}

export async function setKatalogKalkulasi(
  id: string,
  kalkulasiId: string | null,
): Promise<ProdukInternalData> {
  const row = await prisma.produkInternal.update({
    where: { id },
    data: { primaryKalkulasiId: kalkulasiId },
    include: INCLUDE_ALL,
  })
  return toProdukInternalData(row)
}
```

### Step 2.3 — Verify

```bash
npx tsc --noEmit
```

### Step 2.4 — Commit

```
git add lib/katalog/types.ts lib/katalog/service.ts
git commit -m "feat(katalog): add ProdukInternal types and service"
```

---

## Task 3 — API Routes

All routes follow the same auth guard pattern as `/api/kalkulator`. Note: Next.js 16 App Router requires `params` to be awaited as `Promise<{ id: string }>`.

### Step 3.1 — Create `app/api/katalog/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listKatalog, createKatalog } from '@/lib/katalog/service'
import type { ProdukInternalInput } from '@/lib/katalog/types'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await listKatalog()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body: ProdukInternalInput = await req.json()
  if (!body.nama?.trim()) {
    return NextResponse.json({ error: 'nama is required' }, { status: 400 })
  }
  const result = await createKatalog(body)
  return NextResponse.json(result, { status: 201 })
}
```

### Step 3.2 — Create `app/api/katalog/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getKatalog, updateKatalog, deleteKatalog } from '@/lib/katalog/service'
import type { ProdukInternalInput } from '@/lib/katalog/types'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const item = await getKatalog(id)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body: ProdukInternalInput = await req.json()
  if (!body.nama?.trim()) {
    return NextResponse.json({ error: 'nama is required' }, { status: 400 })
  }
  const result = await updateKatalog(id, body)
  return NextResponse.json(result)
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deleteKatalog(id)
  return new NextResponse(null, { status: 204 })
}
```

### Step 3.3 — Create `app/api/katalog/[id]/shopee-links/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { addShopeeLink } from '@/lib/katalog/service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body: { shopeeItemId: string } = await req.json()
  if (!body.shopeeItemId?.trim()) {
    return NextResponse.json({ error: 'shopeeItemId is required' }, { status: 400 })
  }
  await addShopeeLink(id, body.shopeeItemId.trim())
  return new NextResponse(null, { status: 204 })
}
```

### Step 3.4 — Create `app/api/katalog/[id]/shopee-links/[shopeeItemId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { removeShopeeLink } from '@/lib/katalog/service'

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string; shopeeItemId: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, shopeeItemId } = await params
  await removeShopeeLink(id, shopeeItemId)
  return new NextResponse(null, { status: 204 })
}
```

### Step 3.5 — Create `app/api/katalog/[id]/kalkulasi/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setKatalogKalkulasi } from '@/lib/katalog/service'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  // Body: { kalkulasiId: string | null }
  // Pass null to unlink; pass a valid KalkulasiHarga id to link.
  const body: { kalkulasiId: string | null } = await req.json()
  const result = await setKatalogKalkulasi(id, body.kalkulasiId ?? null)
  return NextResponse.json(result)
}
```

### Step 3.6 — Verify

```bash
npx tsc --noEmit
```

### Step 3.7 — Commit

```
git add app/api/katalog/
git commit -m "feat(api): add /api/katalog routes (CRUD + shopee-links + kalkulasi)"
```

---

## Task 4 — React Query Hooks

### Step 4.1 — Create `lib/hooks/use-katalog.ts`

Follows the exact pattern of `lib/hooks/use-kalkulator.ts`: local `apiFetch` helper, typed keys, one hook per operation.

```typescript
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProdukInternalData, ProdukInternalInput } from '@/lib/katalog/types'

const KATALOG_KEY = ['katalog'] as const

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  const contentLength = res.headers.get('content-length')
  if (res.status === 204 || contentLength === '0' || !res.body) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export function useKatalogList() {
  return useQuery({
    queryKey: KATALOG_KEY,
    queryFn: () =>
      apiFetch<{ items: ProdukInternalData[] }>('/api/katalog').then((r) => r.items),
  })
}

export function useKatalog(id: string) {
  return useQuery({
    queryKey: [...KATALOG_KEY, id],
    queryFn: () => apiFetch<ProdukInternalData>(`/api/katalog/${id}`),
    enabled: !!id,
  })
}

export function useCreateKatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ProdukInternalInput) =>
      apiFetch<ProdukInternalData>('/api/katalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KATALOG_KEY }),
  })
}

export function useUpdateKatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProdukInternalInput }) =>
      apiFetch<ProdukInternalData>(`/api/katalog/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, id] })
    },
  })
}

export function useDeleteKatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/katalog/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KATALOG_KEY }),
  })
}

export function useAddShopeeLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      katalogId,
      shopeeItemId,
    }: {
      katalogId: string
      shopeeItemId: string
    }) =>
      apiFetch<void>(`/api/katalog/${katalogId}/shopee-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopeeItemId }),
      }),
    onSuccess: (_, { katalogId }) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, katalogId] })
    },
  })
}

export function useRemoveShopeeLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      katalogId,
      shopeeItemId,
    }: {
      katalogId: string
      shopeeItemId: string
    }) =>
      apiFetch<void>(`/api/katalog/${katalogId}/shopee-links/${shopeeItemId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, { katalogId }) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, katalogId] })
    },
  })
}

export function useSetKatalogKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      katalogId,
      kalkulasiId,
    }: {
      katalogId: string
      kalkulasiId: string | null
    }) =>
      apiFetch<ProdukInternalData>(`/api/katalog/${katalogId}/kalkulasi`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kalkulasiId }),
      }),
    onSuccess: (_, { katalogId }) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, katalogId] })
    },
  })
}
```

### Step 4.2 — Verify

```bash
npx tsc --noEmit
```

### Step 4.3 — Commit

```
git add lib/hooks/use-katalog.ts
git commit -m "feat(hooks): add useKatalog* React Query hooks"
```

---

## Task 5 — Product Enrichment + Type Update

### Step 5.1 — Modify `lib/products/types.ts`

Add the `katalog` optional field to `ProductSummary`. Keep `hpp: number | null` — it now sources from katalog, not `ProductHpp`.

**Full replacement of the file:**

```typescript
export type ProductStatus =
  | "NORMAL"
  | "BANNED"
  | "DELETED"
  | "UNLIST"
  | "REVIEWING"

export interface VariantSummary {
  variantId: string
  variantName: string
  sku: string | null
  stock: number
  price: number
  hpp: number | null
}

export interface KatalogInfo {
  id: string
  nama: string
  hppTotal: number
  floorPrice: number
  shopeeA: number
  kalkulasiStatus: string
}

export interface ProductSummary {
  productId: string
  name: string
  status: ProductStatus
  imageUrl: string | null
  hasVariants: boolean
  stockTotal: number
  priceMin: number
  priceMax: number
  /** HPP sourced from linked ProdukInternal.primaryKalkulasi.hppTotal. Null if no katalog link. */
  hpp: number | null
  /** Full katalog record if this Shopee item has a ProdukInternal link. */
  katalog: KatalogInfo | null
  variants: VariantSummary[]
  qtySold30d: number
  omzet30d: number
  grossMargin30d: number | null
  isStockLow: boolean
  perluPerhatian: boolean
  lowestStock: number
}

export interface ProductsListResult {
  products: ProductSummary[]
  kpi: {
    totalProducts: number
    stokKritis: number
    perluPerhatian: number
    totalStockItems: number
  }
  fetchedAt: string
}

export const STOCK_LOW_THRESHOLD = 5
export const NO_SALES_DAYS_THRESHOLD = 7
```

### Step 5.2 — Modify `lib/products/service.ts`

Replace the `ProductHpp` / `VariantHpp` lookup block with a `ProdukInternalShopeeLink` lookup. The change is confined to the enrichment section (roughly lines 100–168 in the original).

**Remove this block (lines 100–112 in original):**

```typescript
  const [productHpps, variantHpps, soldStats] = await Promise.all([
    prisma.productHpp.findMany({
      where: { productId: { in: itemIds.map(String) } },
    }),
    prisma.variantHpp.findMany(),
    getSoldStatsPerItem(),
  ])
  const productHppMap = new Map(
    productHpps.map((p) => [p.productId, p.hpp ?? null] as const),
  )
  const variantHppMap = new Map(
    variantHpps.map((v) => [v.variantId, v.hpp ?? null] as const),
  )
```

**Replace with:**

```typescript
  const itemIdStrings = itemIds.map(String)

  const [shopeeLinks, soldStats] = await Promise.all([
    prisma.produkInternalShopeeLink.findMany({
      where: { shopeeItemId: { in: itemIdStrings } },
      include: {
        produkInternal: {
          include: { primaryKalkulasi: true },
        },
      },
    }),
    getSoldStatsPerItem(),
  ])

  // Map shopeeItemId -> KatalogInfo (from linked ProdukInternal's primary kalkulasi)
  const katalogByItemId = new Map<string, import('./types').KatalogInfo>()
  for (const link of shopeeLinks) {
    const pi = link.produkInternal
    const k = pi.primaryKalkulasi
    if (k && k.hppTotal > 0) {
      katalogByItemId.set(link.shopeeItemId, {
        id: pi.id,
        nama: pi.nama,
        hppTotal: k.hppTotal,
        floorPrice: k.floorPrice,
        shopeeA: k.shopeeA,
        kalkulasiStatus: k.status,
      })
    }
  }
```

**Then in the `products` mapping block, change the product-level HPP logic (originally lines 114–168):**

Remove:
```typescript
    const productHpp = productHppMap.get(productIdStr) ?? null

    let grossMargin30d: number | null = null
    if (productHpp !== null) {
      grossMargin30d = stats.omzet - productHpp * stats.qty
    }
```

Replace with:
```typescript
    const katalog = katalogByItemId.get(productIdStr) ?? null
    const productHpp = katalog?.hppTotal ?? null

    let grossMargin30d: number | null = null
    if (productHpp !== null) {
      grossMargin30d = stats.omzet - productHpp * stats.qty
    }
```

And in the `return { ... }` object at the end of the mapping closure, change:

Remove `hpp: productHpp,` and ensure `katalog` is also included.

**Updated return object:**
```typescript
    return {
      productId: productIdStr,
      name: b.item_name,
      status: b.item_status as ProductStatus,
      imageUrl: b.image?.image_url_list?.[0] ?? null,
      hasVariants,
      stockTotal,
      priceMin,
      priceMax,
      hpp: productHpp,
      katalog,
      variants,
      qtySold30d: stats.qty,
      omzet30d: stats.omzet,
      grossMargin30d,
      isStockLow,
      perluPerhatian,
      lowestStock,
    }
```

Also remove the variant-level HPP line that applied `variantHppMap`:

Remove (inside variants mapping, line ~118–122):
```typescript
      ? (variantsByItem.get(b.item_id) ?? []).map((v) => ({
          ...v,
          hpp: variantHppMap.get(v.variantId) ?? null,
        }))
```

Replace with (variants no longer have override HPP; they inherit from product):
```typescript
      ? (variantsByItem.get(b.item_id) ?? [])
```

> Note: `VariantSummary.hpp` is kept in the type for forward-compatibility; it will always be `null` in this plan. A future plan may populate it from per-variant kalkulasi links.

### Step 5.3 — Verify

```bash
npx tsc --noEmit
npm test -- --passWithNoTests 2>&1 | tail -5
```

### Step 5.4 — Commit

```
git add lib/products/types.ts lib/products/service.ts
git commit -m "feat(products): enrich ProductSummary with katalog HPP from ProdukInternal"
```

---

## Task 6 — Remove HPP Edit UI

### Step 6.1 — Modify `components/products/ProductRow.tsx`

**Remove from Props interface:**
- `onEditHpp: (product: ProductSummary) => void`
- `onQuickSetHpp: (productId: string, hpp: number | null, variantId?: string) => void`
- `canEditHpp: boolean`

**Remove from function signature:**
- `onEditHpp`, `onQuickSetHpp`, `canEditHpp`

**Remove import:**
```typescript
import { InlineHppEdit } from "./InlineHppEdit"
```

**Remove the "Edit Batch" button block** (lines ~230–239):
```tsx
          {canEditHpp && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditHpp(product)}
              title="Edit semua HPP (termasuk override per varian)"
            >
              Edit Batch
            </Button>
          )}
```

**Remove the camera-upload guard** `{canEditHpp && (` around the upload button (line ~159) and its closing `)}` — always show the upload button (or gate it differently if needed; see note below).

> Note on upload button: The `canEditHpp` guard also controlled the image upload button. Since we're removing `canEditHpp`, check with team whether image upload should remain ungated. For this plan, keep the upload button **always visible** (non-HPP functionality). If role-gating is still needed, a follow-up plan should introduce a separate `canUploadImage` prop.

**Remove the product-level `InlineHppEdit`** block (lines ~220–225):
```tsx
                <InlineHppEdit
                  value={product.hpp}
                  onSave={(v) => onQuickSetHpp(product.productId, v)}
                  disabled={!canEditHpp}
                  label="HPP:"
                />
```

**Replace with katalog read-only display:**
```tsx
                {product.katalog ? (
                  <span
                    className="text-xs"
                    title={`dari kalkulasi "${product.katalog.nama}"`}
                  >
                    HPP: Rp {product.katalog.hppTotal.toLocaleString("id-ID")}
                    <span className="ml-1 text-[10px] opacity-50">
                      (via {product.katalog.nama})
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">HPP: —</span>
                )}
```

**Remove the variant-level `InlineHppEdit`** block inside the expanded variants section (lines ~268–291):
```tsx
                      <div className="flex justify-end items-center gap-1">
                        <InlineHppEdit
                          value={v.hpp}
                          onSave={(nv) =>
                            onQuickSetHpp(
                              product.productId,
                              nv,
                              v.variantId,
                            )
                          }
                          disabled={!canEditHpp}
                          placeholder={
                            product.hpp !== null
                              ? `${fmt(product.hpp)} (default)`
                              : "Set HPP"
                          }
                          label=""
                          compact
                        />
                        {v.hpp !== null && (
                          <span className="text-[9px] text-blue-500">
                            override
                          </span>
                        )}
                      </div>
```

**Replace variant HPP block with nothing** — the variant row already shows `stock` and `price`; HPP is now product-level from the katalog, not variant-level.

**Full updated `ProductRow.tsx` after changes:**

```tsx
"use client"

import { useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ProductSummary } from "@/lib/products/types"
import { STOCK_LOW_THRESHOLD } from "@/lib/products/types"

interface Props {
  product: ProductSummary
  onUploadImage: (productId: string, file: File) => void
  uploadingImageFor: string | null
}

function fmt(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n)
}

const STATUS_COLOR: Record<ProductSummary["status"], string> = {
  NORMAL: "bg-green-100 text-green-800",
  UNLIST: "bg-gray-100 text-gray-700",
  BANNED: "bg-red-100 text-red-800",
  DELETED: "bg-red-100 text-red-800",
  REVIEWING: "bg-amber-100 text-amber-800",
}

function ProductThumb({
  src,
  alt,
  onClick,
}: {
  src: string | null
  alt: string
  onClick?: () => void
}) {
  const [errored, setErrored] = useState(false)
  if (!src || errored) {
    return (
      <div className="w-14 h-14 shrink-0 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 text-2xl">
        📦
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      onClick={(e) => {
        if (!onClick) return
        e.stopPropagation()
        onClick()
      }}
      className={`w-14 h-14 shrink-0 rounded object-cover border border-gray-200 bg-gray-50 ${
        onClick ? "cursor-zoom-in hover:ring-2 hover:ring-[#EE4D2D]" : ""
      }`}
      loading="lazy"
    />
  )
}

function ImageZoomModal({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-zoom-out"
      onClick={onClose}
      role="dialog"
      aria-label="Zoom gambar"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-2xl hover:text-[#EE4D2D]"
        aria-label="Tutup"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl cursor-default"
      />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded max-w-[90vw] truncate">
        {alt}
      </div>
    </div>
  )
}

export function ProductRow({
  product,
  onUploadImage,
  uploadingImageFor,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isUploading = uploadingImageFor === product.productId

  const bgClass = product.isStockLow
    ? "bg-red-50/40"
    : product.perluPerhatian
      ? "row-status-pending"
      : ""

  const priceLabel =
    product.priceMin === product.priceMax
      ? fmt(product.priceMin)
      : `${fmt(product.priceMin)} – ${fmt(product.priceMax)}`

  return (
    <Card className={bgClass}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => product.hasVariants && setExpanded((e) => !e)}
            className="flex-1 text-left flex items-start gap-3 min-w-0"
          >
            <div className="relative shrink-0">
              <ProductThumb
                src={product.imageUrl}
                alt={product.name}
                onClick={
                  product.imageUrl ? () => setZoomOpen(true) : undefined
                }
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
                disabled={isUploading}
                title="Upload foto baru"
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#EE4D2D] hover:bg-[#d44226] text-white text-[10px] flex items-center justify-center shadow border-2 border-white disabled:opacity-50 disabled:cursor-wait"
              >
                {isUploading ? "⋯" : "📷"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onUploadImage(product.productId, file)
                  e.target.value = ""
                }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{product.name}</span>
                <Badge className={STATUS_COLOR[product.status]}>
                  {product.status}
                </Badge>
                {product.isStockLow && (
                  <Badge className="bg-red-100 text-red-800">Stok Kritis</Badge>
                )}
                {product.qtySold30d === 0 && product.status === "NORMAL" && (
                  <Badge className="bg-amber-100 text-amber-800">
                    Tidak ada sales 30d
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-500 flex gap-3 flex-wrap items-center">
                <span>Stok: {fmtNum(product.stockTotal)}</span>
                <span>Harga: {priceLabel}</span>
                <span>
                  30d: {fmtNum(product.qtySold30d)} pcs ·{" "}
                  {fmt(product.omzet30d)}
                </span>
                {product.grossMargin30d !== null && (
                  <span
                    className={
                      product.grossMargin30d > 0
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    Margin: {fmt(product.grossMargin30d)}
                  </span>
                )}
                {product.katalog ? (
                  <span
                    className="text-xs"
                    title={`dari kalkulasi "${product.katalog.nama}"`}
                  >
                    HPP: Rp {product.katalog.hppTotal.toLocaleString("id-ID")}
                    <span className="ml-1 text-[10px] opacity-50">
                      (via {product.katalog.nama})
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">HPP: —</span>
                )}
              </div>
            </div>
          </button>
        </div>

        {expanded && product.hasVariants && (
          <div className="mt-3 border-t pt-3">
            <div className="text-xs font-semibold text-gray-500 mb-2">
              Varian ({product.variants.length})
            </div>
            <div className="space-y-1.5">
              {product.variants.map((v) => {
                const isLow = v.stock < STOCK_LOW_THRESHOLD
                return (
                  <div
                    key={v.variantId}
                    className={`flex justify-between items-center text-xs px-2 py-1.5 rounded ${isLow ? "bg-red-50" : "bg-gray-50"}`}
                  >
                    <div>
                      <div className="font-medium">{v.variantName}</div>
                      {v.sku && (
                        <div className="text-gray-400">SKU: {v.sku}</div>
                      )}
                    </div>
                    <div className="text-right space-y-0.5">
                      <div
                        className={`font-semibold ${isLow ? "text-red-600" : ""}`}
                      >
                        {v.stock} pcs
                      </div>
                      <div className="text-gray-500">{fmt(v.price)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
      {zoomOpen && product.imageUrl && (
        <ImageZoomModal
          src={product.imageUrl}
          alt={product.name}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </Card>
  )
}
```

### Step 6.2 — Modify `components/products/ProductList.tsx`

Remove `onEditHpp`, `onQuickSetHpp`, and `canEditHpp` from the Props interface and the function signature. Remove them from the `ProductRow` call.

**Full replacement:**

```tsx
"use client"

import type { ProductSummary } from "@/lib/products/types"
import { ProductRow } from "./ProductRow"

interface Props {
  products: ProductSummary[]
  onUploadImage: (productId: string, file: File) => void
  uploadingImageFor: string | null
}

export function ProductList({
  products,
  onUploadImage,
  uploadingImageFor,
}: Props) {
  if (products.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        Tidak ada produk untuk filter ini.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {products.map((p) => (
        <ProductRow
          key={p.productId}
          product={p}
          onUploadImage={onUploadImage}
          uploadingImageFor={uploadingImageFor}
        />
      ))}
    </div>
  )
}
```

### Step 6.3 — Modify `app/(dashboard)/produk/page.tsx`

Remove:
- `import { HppEditModal } from "@/components/products/HppEditModal"`
- `useSetHpp` from `use-products` import
- `const setHpp = useSetHpp()`
- `const canEditHpp = ...` (and all its usage)
- `const [editingProduct, setEditingProduct] = ...`
- The `<HppEditModal ...>` JSX block
- Props `onEditHpp`, `onQuickSetHpp`, `canEditHpp` from `<ProductList />`

**Full replacement of `ProdukPageInner` function:**

```tsx
function ProdukPageInner() {
  const { intervalMs } = useRefreshConfig()
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    useProducts()
  const uploadImage = useUploadProductImage()
  const router = useRouter()
  const searchParams = useSearchParams()
  const VALID_TABS = ["produk", "filamen", "kalkulator"] as const
  type ProdukTab = typeof VALID_TABS[number]
  const rawTab = searchParams.get("tab") ?? "produk"
  const produkTab: ProdukTab = (VALID_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as ProdukTab)
    : "produk"
  function setProdukTab(tab: ProdukTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`?${params.toString()}`, { scroll: false })
  }
  const [filter, setFilter] = useState<ProductFilterValue>("perlu_perhatian")
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null)
  const [toast, setToast] = useState<{
    message: string
    type: "success" | "error"
  } | null>(null)

  function handleUploadImage(productId: string, file: File) {
    setUploadingImageFor(productId)
    setToast(null)
    uploadImage.mutate(
      { productId, file },
      {
        onSuccess: () => {
          setToast({
            message:
              "✅ Foto di-upload. Shopee mungkin review perubahan dalam beberapa menit.",
            type: "success",
          })
        },
        onError: (err) => {
          setToast({
            message: `❌ Upload gagal: ${err.message}`,
            type: "error",
          })
        },
        onSettled: () => {
          setUploadingImageFor(null)
          setTimeout(() => setToast(null), 6000)
        },
      },
    )
  }

  const filtered = useMemo(() => {
    if (!data) return []
    switch (filter) {
      case "perlu_perhatian":
        return data.products.filter((p) => p.perluPerhatian)
      case "stok_kritis":
        return data.products.filter((p) => p.isStockLow)
      case "unlist":
        return data.products.filter((p) => p.status === "UNLIST")
      default:
        return data.products
    }
  }, [data, filter])

  const counts = useMemo(() => {
    if (!data) return { all: 0, perlu_perhatian: 0, stok_kritis: 0, unlist: 0 }
    return {
      all: data.products.length,
      perlu_perhatian: data.products.filter((p) => p.perluPerhatian).length,
      stok_kritis: data.products.filter((p) => p.isStockLow).length,
      unlist: data.products.filter((p) => p.status === "UNLIST").length,
    }
  }, [data])

  return (
    <div className="space-y-4">
      {/* Sub-tab nav: Produk / Filamen / Kalkulator */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setProdukTab("produk")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            produkTab === "produk"
              ? "border-[#EE4D2D] text-[#EE4D2D]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Produk
        </button>
        <button
          onClick={() => setProdukTab("filamen")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            produkTab === "filamen"
              ? "border-[#EE4D2D] text-[#EE4D2D]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Filamen
        </button>
        <button
          onClick={() => setProdukTab("kalkulator")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            produkTab === "kalkulator"
              ? "border-indigo-500 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          }`}
        >
          🧮 Kalkulator
        </button>
      </div>

      {produkTab === "kalkulator" ? (
        <KalkulasiTab />
      ) : produkTab === "filamen" ? (
        <FilamenTab />
      ) : (
        <>
          {isLoading && !data && (
            <div className="py-12 text-center text-gray-400">
              Memuat produk...
            </div>
          )}

          {isError &&
            (() => {
              const msg =
                error instanceof Error ? error.message : "Unknown error"
              const needsConnect =
                msg.toLowerCase().includes("not authorized") ||
                msg.toLowerCase().includes("shop_id not found")
              return (
                <div className="py-12 text-center space-y-3">
                  <div className="text-red-500">{msg}</div>
                  {needsConnect && (
                    <a
                      href="/api/shopee/auth"
                      className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-[#EE4D2D] hover:bg-[#d44226] text-white text-sm font-medium"
                    >
                      Hubungkan Shopee
                    </a>
                  )}
                  <div>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                      Coba lagi
                    </Button>
                  </div>
                </div>
              )
            })()}

          {data && (
            <>
              <GlassPageHeader title="Produk" subtitle="Pantau produk aktif dan HPP">
                <RefreshIndicator
                  lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
                  intervalMs={intervalMs}
                  onRefresh={() => refetch()}
                />
              </GlassPageHeader>

              <ProductsKpiBar kpi={data.kpi} />

              <ProductFilter
                value={filter}
                onChange={setFilter}
                counts={counts}
              />

              <ProductList
                products={filtered}
                onUploadImage={handleUploadImage}
                uploadingImageFor={uploadingImageFor}
              />

              {toast && (
                <div
                  className={`fixed bottom-4 right-4 z-50 max-w-sm p-3 rounded-md shadow-lg text-sm ${
                    toast.type === "success"
                      ? "bg-green-50 border border-green-200 text-green-800"
                      : "bg-red-50 border border-red-200 text-red-800"
                  }`}
                >
                  {toast.message}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
```

Also update the **imports** at the top of `produk/page.tsx` — remove unused ones:

```typescript
"use client"

import { useMemo, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FilamenTab } from "@/components/filamen/FilamenTab"
import { KalkulasiTab } from "@/components/kalkulator/KalkulasiTab"
import { ProductsKpiBar } from "@/components/products/ProductsKpiBar"
import { ProductFilter } from "@/components/products/ProductFilter"
import { ProductList } from "@/components/products/ProductList"
import { RefreshIndicator } from "@/components/layout/RefreshIndicator"
import {
  useProducts,
  useUploadProductImage,
} from "@/lib/hooks/use-products"
import { useRefreshConfig } from "@/lib/use-refresh-config"
import { Button } from "@/components/ui/button"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { ProductFilterValue } from "@/components/products/types"
```

Removed: `useSession` from `next-auth/react`, `HppEditModal`, `useSetHpp`, `type ProductSummary`.

### Step 6.4 — Verify

```bash
npx tsc --noEmit
```

### Step 6.5 — Commit

```
git add components/products/ProductRow.tsx components/products/ProductList.tsx app/\(dashboard\)/produk/page.tsx
git commit -m "feat(products): remove manual HPP edit UI; show katalog HPP read-only"
```

---

## Self-Review

### Spec coverage

| Requirement | Covered |
|---|---|
| Remove manual HPP editing from Shopee products | Yes — Task 6 removes all InlineHppEdit, HppEditModal, useSetHpp, canEditHpp wiring |
| Add ProdukInternal model | Yes — Task 1 schema + migration |
| HPP comes from kalkulasi | Yes — Task 5 reads from `primaryKalkulasi.hppTotal` |
| 1 ProdukInternal → many Shopee items | Yes — `ProdukInternalShopeeLink` join table with `@@unique` |
| DB + Service + API + Hooks | Yes — Tasks 1–4 |
| Product enrichment | Yes — Task 5 replaces ProductHpp lookup |
| HPP edit UI removal | Yes — Task 6 |

### Placeholder scan

No `TODO`, `FIXME`, `...`, `// implement`, or `any stub` present in any code block above.

### Type consistency

| Type | Defined in | Used in |
|---|---|---|
| `ProdukInternalData` | `lib/katalog/types.ts` | `lib/katalog/service.ts`, `lib/hooks/use-katalog.ts`, all 5 API routes |
| `ProdukInternalInput` | `lib/katalog/types.ts` | `lib/katalog/service.ts`, `app/api/katalog/route.ts`, `app/api/katalog/[id]/route.ts` |
| `KatalogInfo` | `lib/products/types.ts` | `lib/products/service.ts` (constructed in katalog enrichment), `components/products/ProductRow.tsx` (read via `product.katalog`) |
| `katalog: KatalogInfo \| null` | `ProductSummary` in `lib/products/types.ts` | `lib/products/service.ts` (returned), `ProductRow.tsx` (rendered) |

All fields between `ProdukInternalData` (service output) and `KatalogInfo` (embedded in `ProductSummary`) are consistent: `hppTotal`, `floorPrice`, `shopeeA`, `kalkulasiStatus`, `id`, `nama` — all typed as non-null numbers/strings inside `KatalogInfo` (only set when `k.hppTotal > 0` in the service, so the guard in `katalogByItemId.set` is valid).

### Edge case notes

1. **`hppTotal === 0` guard** — The service only adds a `KatalogInfo` to `katalogByItemId` when `k.hppTotal > 0`. This means a linked kalkulasi with zero HPP shows as `katalog: null` in the product. This is intentional: a 0-HPP kalkulasi is likely uninitialized and shouldn't affect margin calculations. If zero-HPP display is ever desired, remove the `> 0` guard and update `KatalogInfo` to allow `hppTotal: number` (already allowed; just change the set condition).

2. **Multiple Shopee links per item** — A Shopee item can appear in at most one `ProdukInternal` link effectively (the `shopeeLinks` query returns all links; if two `ProdukInternal` rows link the same `shopeeItemId`, the last one in `shopeeLinks` wins due to `for` loop overwrite). The `@@unique([produkInternalId, shopeeItemId])` prevents duplicate links within the same `ProdukInternal`, but does not prevent two different `ProdukInternal` rows linking the same Shopee item. This is a future-plan concern; for now the behavior is deterministic (last writer wins).

3. **`ProductHpp` / `VariantHpp` tables** — Not dropped in this plan. The import `prisma.productHpp.findMany` is removed from the service, but the table and model remain in the schema. A separate cleanup plan can drop them once the team confirms no other code paths read them.

4. **`useSession` removal from produk page** — `canEditHpp` was the only use of `useSession` in `ProdukPageInner`. After removal, the `"use client"` directive is still valid. If `useSession` is needed for other future features on this page, it can be re-added.

5. **`InlineHppEdit` component** — Not deleted in this plan. It may still be used in `HppEditModal`. A separate cleanup plan should audit and delete it.

---

## Execution Order

Run tasks in order 1 → 2 → 3 → 4 → 5 → 6. Each task ends with a `npx tsc --noEmit` check before commit. Tasks 3 and 4 can be executed in parallel if using worktrees.
