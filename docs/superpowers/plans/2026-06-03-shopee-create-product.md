# Shopee Create Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan wizard 5-step di KatalogCard untuk membuat produk baru di Shopee langsung dari dashboard, dengan pre-fill dari katalog dan kalkulasi, category attributes dinamis, variasi opsional, dan link edit ke Shopee Seller Center setelah berhasil.

**Architecture:** Backend: 4 proxy routes (categories, attributes, logistics, products) menggunakan `shopeeRequest` (GET) dan signed POST helper. Frontend: `ShopeeCreateWizard` modal + 5 step components + `CategoryPicker` + `AttributeFields`, dibuka dari tombol baru di `ShopeeLinksSection`. Simpan `item_id` ke `shopeeLinks` via existing `addShopeeLink()`.

**Tech Stack:** Next.js App Router, React useState, @tanstack/react-query, lucide-react, existing `shopeeRequest` dari `lib/shopee/client.ts`, existing `uploadImageToShopee` dari `lib/shopee/media.ts`.

---

## Codebase Context (Baca Ini Dulu)

Project: `/Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard`

**Pattern GET Shopee API** — gunakan `shopeeRequest` dari `lib/shopee/client.ts`:
```ts
import { shopeeRequest } from "./client"
const json = await shopeeRequest<ResponseType>("/api/v2/product/get_category", { parent_category_id: 0, language: "id" })
```

**Pattern POST Shopee API** — `shopeeRequest` hanya GET. Untuk POST, gunakan pattern dari `lib/shopee/media.ts` (lihat `uploadImageToShopee`): `getShopAuth()` + `buildSignedUrl()` + `fetch` POST JSON. Kedua helper ini **private** di media.ts — duplikasi pola minimal di `create-product.ts` (bukan import).

**Pattern API Route** — auth check + call service:
```ts
import { auth } from "@/lib/auth"
const session = await auth()
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
```

**Pattern React Query hook** — lihat `lib/hooks/use-katalog.ts` sebagai contoh (`apiFetch`, `useQuery`, `useMutation`, `useQueryClient`).

**Existing function** `addShopeeLink(produkInternalId, shopeeItemId, shopeeModelId?, namaProduk?)` di `lib/katalog/service.ts` — dipanggil setelah `add_item` sukses.

**Existing function** `uploadImageToShopee(buffer, filename, contentType)` di `lib/shopee/media.ts` — returns `{ imageId, imageUrl }`.

---

## File Structure

```
lib/shopee/
  types.ts                     MODIFY — tambah 4 interface baru
  create-product.ts            CREATE — shopeeGetCategories, shopeeGetAttributes, shopeeGetLogistics, shopeeAddItem

app/api/shopee/
  categories/route.ts          CREATE — GET proxy
  attributes/route.ts          CREATE — GET proxy
  logistics/route.ts           CREATE — GET proxy
  products/route.ts            CREATE — POST add_item + addShopeeLink

lib/hooks/
  use-shopee-create.ts         CREATE — 4 React Query hooks

components/katalog/shopee-create/
  CategoryPicker.tsx           CREATE — drill-down, leaf-only selection
  AttributeFields.tsx          CREATE — dynamic form per input_type
  ShopeeCreateWizard.tsx       CREATE — modal + state + step navigation
  StepInfo.tsx                 CREATE — step 1
  StepMedia.tsx                CREATE — step 2
  StepPricing.tsx              CREATE — step 3
  StepShipping.tsx             CREATE — step 4
  StepVariants.tsx             CREATE — step 5 (opsional)

components/katalog/
  ShopeeLinksSection.tsx       MODIFY — tambah tombol + render wizard + success banner
```

---

### Task 1: Types + lib/shopee/create-product.ts

**Files:**
- Modify: `lib/shopee/types.ts`
- Create: `lib/shopee/create-product.ts`

Context: Fondasi backend. `shopeeGetCategories`, `shopeeGetAttributes`, `shopeeGetLogistics` pakai `shopeeRequest` (GET). `shopeeAddItem` perlu POST dengan JSON body — duplikasi pola signing dari `media.ts` (private di sana, tidak bisa diimport).

- [ ] **Step 1: Tambah 4 interface ke `lib/shopee/types.ts`**

Tambahkan di akhir file:

```ts
// ===== Shopee Create Product types =====

export interface ShopeeCategory {
  category_id: number
  parent_category_id: number
  category_name: string
  has_children: boolean
}

export interface ShopeeCategoryAttribute {
  attribute_id: number
  attribute_name: string
  is_mandatory: boolean
  input_type: "TEXT_FILED" | "DROP_DOWN" | "MULTIPLE_SELECT" | "COMBO_BOX"
  attribute_value_list: Array<{
    value_id: number
    original_value_name: string
  }>
}

export interface ShopeeLogisticChannel {
  logistic_id: number          // mapped from logistics_channel_id
  logistic_name: string        // mapped from logistics_channel_name
  enabled: boolean
}

export interface ShopeeAddItemPayload {
  item_name: string
  description: string
  original_price?: number
  category_id: number
  image: { image_id_list: string[] }
  weight: number
  condition: "NEW" | "USED"
  item_status: "UNLIST"
  logistic_info: Array<{
    logistic_id: number
    enabled: boolean
    is_free: boolean
  }>
  stock_info_v2?: {
    seller_stock: [{ stock: number }]
  }
  package_length?: number
  package_width?: number
  package_height?: number
  attribute_list?: Array<{
    attribute_id: number
    attribute_value_list: Array<{
      value_id?: number
      original_value_name?: string
    }>
  }>
  tier_variation?: Array<{
    name: string
    option_list: Array<{ option: string }>
  }>
  model?: Array<{
    tier_index: number[]
    original_price: number
    stock_info_v2: { seller_stock: [{ stock: number }] }
  }>
}

export interface ShopeeAddItemResult {
  item_id: number
}
```

- [ ] **Step 2: Buat `lib/shopee/create-product.ts`**

```ts
import crypto from "crypto"
import { prisma } from "@/lib/db"
import { shopeeRequest } from "./client"
import type {
  ShopeeCategory,
  ShopeeCategoryAttribute,
  ShopeeLogisticChannel,
  ShopeeAddItemPayload,
  ShopeeAddItemResult,
} from "./types"

const BASE_URL = process.env.SHOPEE_BASE_URL ?? "https://partner.shopeemobile.com"

// ── POST signing (mirrors pattern from media.ts) ─────────────────────────────

interface ShopPostAuth {
  partnerId: string
  partnerKey: string
  shopId: string
  accessToken: string
}

async function getPostAuth(): Promise<ShopPostAuth> {
  const partnerId = process.env.SHOPEE_PARTNER_ID
  const partnerKey = process.env.SHOPEE_PARTNER_KEY
  if (!partnerId || !partnerKey) {
    throw new Error("SHOPEE_PARTNER_ID or SHOPEE_PARTNER_KEY is not set")
  }
  const [shopIdRow, accessRow] = await Promise.all([
    prisma.config.findUnique({ where: { key: "shopee_shop_id" } }),
    prisma.config.findUnique({ where: { key: "shopee_access_token" } }),
  ])
  const shopId = shopIdRow?.value ?? process.env.SHOPEE_SHOP_ID ?? null
  const accessToken = accessRow?.value ?? null
  if (!shopId) throw new Error("Shopee shop_id not found. Please connect via Settings.")
  if (!accessToken) throw new Error("Shopee not authorized. Please connect via Settings.")
  return { partnerId, partnerKey, shopId, accessToken }
}

function buildSignedPostUrl(auth: ShopPostAuth, path: string, timestamp: number): string {
  const sig = crypto
    .createHmac("sha256", auth.partnerKey)
    .update(`${auth.partnerId}${path}${timestamp}${auth.accessToken}${auth.shopId}`)
    .digest("hex")
  const url = new URL(`${BASE_URL}${path}`)
  url.searchParams.set("partner_id", auth.partnerId)
  url.searchParams.set("timestamp", String(timestamp))
  url.searchParams.set("access_token", auth.accessToken)
  url.searchParams.set("shop_id", auth.shopId)
  url.searchParams.set("sign", sig)
  return url.toString()
}

// ── GET helpers ───────────────────────────────────────────────────────────────

interface ShopeeCategoryListResponse {
  response: {
    category_list: Array<{
      category_id: number
      parent_category_id: number
      category_name: string
      has_children: boolean
    }>
  }
  error?: string
  message?: string
}

export async function shopeeGetCategories(
  parentCategoryId: number,
): Promise<ShopeeCategory[]> {
  const json = await shopeeRequest<ShopeeCategoryListResponse>(
    "/api/v2/product/get_category",
    { language: "id", parent_category_id: parentCategoryId },
  )
  if (json.error) throw new Error(`Shopee get_category: ${json.error} — ${json.message}`)
  return json.response.category_list ?? []
}

interface ShopeeAttributeListResponse {
  response: {
    attribute_list: Array<{
      attribute_id: number
      attribute_name: string
      is_mandatory: boolean
      input_type: ShopeeCategoryAttribute["input_type"]
      attribute_value_list: Array<{ value_id: number; original_value_name: string }>
    }>
  }
  error?: string
  message?: string
}

export async function shopeeGetAttributes(
  categoryId: number,
): Promise<ShopeeCategoryAttribute[]> {
  const json = await shopeeRequest<ShopeeAttributeListResponse>(
    "/api/v2/product/get_attributes",
    { language: "id", category_id: categoryId },
  )
  if (json.error) throw new Error(`Shopee get_attributes: ${json.error} — ${json.message}`)
  return json.response.attribute_list ?? []
}

interface ShopeeChannelListResponse {
  response: {
    logistics_channel_list: Array<{
      logistics_channel_id: number
      logistics_channel_name: string
      enabled: boolean
    }>
  }
  error?: string
  message?: string
}

export async function shopeeGetLogistics(): Promise<ShopeeLogisticChannel[]> {
  const json = await shopeeRequest<ShopeeChannelListResponse>(
    "/api/v2/logistics/get_channel_list",
  )
  if (json.error) throw new Error(`Shopee get_channel_list: ${json.error} — ${json.message}`)
  return (json.response.logistics_channel_list ?? []).map(c => ({
    logistic_id: c.logistics_channel_id,
    logistic_name: c.logistics_channel_name,
    enabled: c.enabled,
  }))
}

// ── POST add_item ─────────────────────────────────────────────────────────────

interface ShopeeAddItemResponse {
  response?: { item_id?: number }
  error?: string
  message?: string
}

export async function shopeeAddItem(
  payload: ShopeeAddItemPayload,
): Promise<ShopeeAddItemResult> {
  const auth = await getPostAuth()
  const path = "/api/v2/product/add_item"
  const timestamp = Math.floor(Date.now() / 1000)
  const url = buildSignedPostUrl(auth, path, timestamp)

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  const json = (await res.json()) as ShopeeAddItemResponse

  if (json.error) {
    throw new Error(`Shopee add_item: ${json.error} — ${json.message ?? "no message"}`)
  }
  const itemId = json.response?.item_id
  if (!itemId) throw new Error("Shopee add_item response missing item_id")
  return { item_id: itemId }
}
```

- [ ] **Step 3: Verifikasi TypeScript**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | grep -E "create-product|shopee/types" || echo "no errors"
```

Expected: tidak ada error.

- [ ] **Step 4: Commit**

```bash
git add lib/shopee/types.ts lib/shopee/create-product.ts
git commit -m "feat(shopee): add create-product helpers and types"
```

---

### Task 2: API Routes — categories, attributes, logistics

**Files:**
- Create: `app/api/shopee/categories/route.ts`
- Create: `app/api/shopee/attributes/route.ts`
- Create: `app/api/shopee/logistics/route.ts`

Context: Tiga proxy routes yang diakses frontend untuk populate CategoryPicker dan jasa kirim. Auth wajib — semua butuh session.

- [ ] **Step 1: Buat `app/api/shopee/categories/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { shopeeGetCategories } from "@/lib/shopee/create-product"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parentId = Number(req.nextUrl.searchParams.get("parent_category_id") ?? "0")
  if (isNaN(parentId)) return NextResponse.json({ error: "Invalid parent_category_id" }, { status: 400 })

  const categories = await shopeeGetCategories(parentId)
  return NextResponse.json(categories)
}
```

- [ ] **Step 2: Buat `app/api/shopee/attributes/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { shopeeGetAttributes } from "@/lib/shopee/create-product"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const categoryId = Number(req.nextUrl.searchParams.get("category_id"))
  if (!categoryId || isNaN(categoryId)) {
    return NextResponse.json({ error: "category_id is required" }, { status: 400 })
  }

  const attributes = await shopeeGetAttributes(categoryId)
  return NextResponse.json(attributes)
}
```

- [ ] **Step 3: Buat `app/api/shopee/logistics/route.ts`**

```ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { shopeeGetLogistics } from "@/lib/shopee/create-product"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const logistics = await shopeeGetLogistics()
  return NextResponse.json(logistics)
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "api/shopee" || echo "no errors"
```

- [ ] **Step 5: Commit**

```bash
git add "app/api/shopee/categories/route.ts" "app/api/shopee/attributes/route.ts" "app/api/shopee/logistics/route.ts"
git commit -m "feat(shopee): add categories, attributes, logistics proxy routes"
```

---

### Task 3: API Route — POST /api/shopee/products

**Files:**
- Create: `app/api/shopee/products/route.ts`

Context: Menerima wizard state yang sudah final, memanggil `shopeeAddItem`, lalu menyimpan `item_id` ke katalog via existing `addShopeeLink`. Juga mengimport type `ShopeeCreateProductInput` dari sini (defined inline karena tidak perlu dishare).

- [ ] **Step 1: Buat `app/api/shopee/products/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { shopeeAddItem } from "@/lib/shopee/create-product"
import { addShopeeLink } from "@/lib/katalog/service"
import type { ShopeeAddItemPayload } from "@/lib/shopee/types"

export interface ShopeeCreateProductInput {
  katalogId: string
  itemName: string
  description: string
  categoryId: number
  condition: "NEW" | "USED"
  imageIds: string[]
  weight: number
  packageLength?: number
  packageWidth?: number
  packageHeight?: number
  logistics: Array<{ logistic_id: number; enabled: boolean; is_free: boolean }>
  attributes: Array<{
    attribute_id: number
    value_id?: number
    value_text?: string
  }>
  // No variant
  price?: number
  stock?: number
  // With variant
  tierVariation?: { name: string; options: string[] }
  models?: Array<{ optionIndex: number; price: number; stock: number }>
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body: ShopeeCreateProductInput = await req.json()

  // Validate required fields
  if (!body.katalogId?.trim()) return NextResponse.json({ error: "katalogId required" }, { status: 400 })
  if (!body.itemName?.trim()) return NextResponse.json({ error: "itemName required" }, { status: 400 })
  if (!body.categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 })
  if (!body.imageIds?.length) return NextResponse.json({ error: "at least 1 image required" }, { status: 400 })
  if (!body.weight || body.weight <= 0) return NextResponse.json({ error: "weight required" }, { status: 400 })
  if (!body.logistics?.length) return NextResponse.json({ error: "at least 1 logistic required" }, { status: 400 })

  const hasVariants = !!(body.tierVariation?.options?.length && body.models?.length)
  if (!hasVariants && (!body.price || body.price <= 0)) {
    return NextResponse.json({ error: "price required when no variants" }, { status: 400 })
  }
  if (!hasVariants && (!body.stock || body.stock <= 0)) {
    return NextResponse.json({ error: "stock required when no variants" }, { status: 400 })
  }

  // Build attribute_list
  const attribute_list = (body.attributes ?? [])
    .filter(a => a.value_id != null || a.value_text?.trim())
    .map(a => ({
      attribute_id: a.attribute_id,
      attribute_value_list: a.value_id != null
        ? [{ value_id: a.value_id }]
        : [{ original_value_name: a.value_text! }],
    }))

  // Build payload
  const payload: ShopeeAddItemPayload = {
    item_name: body.itemName.trim(),
    description: body.description?.trim() ?? "",
    category_id: body.categoryId,
    condition: body.condition,
    item_status: "UNLIST",
    image: { image_id_list: body.imageIds },
    weight: body.weight,
    logistic_info: body.logistics,
    ...(body.packageLength && body.packageWidth && body.packageHeight ? {
      package_length: body.packageLength,
      package_width: body.packageWidth,
      package_height: body.packageHeight,
    } : {}),
    ...(attribute_list.length ? { attribute_list } : {}),
    ...(!hasVariants ? {
      original_price: body.price,
      stock_info_v2: { seller_stock: [{ stock: body.stock! }] },
    } : {
      tier_variation: [{
        name: body.tierVariation!.name,
        option_list: body.tierVariation!.options.map(o => ({ option: o })),
      }],
      model: body.models!.map(m => ({
        tier_index: [m.optionIndex],
        original_price: m.price,
        stock_info_v2: { seller_stock: [{ stock: m.stock }] },
      })),
    }),
  }

  const result = await shopeeAddItem(payload)

  // Save to katalog shopeeLinks
  await addShopeeLink(body.katalogId, String(result.item_id), null)

  return NextResponse.json({
    item_id: result.item_id,
    shopeeEditUrl: `https://seller.shopee.co.id/portal/product/edit/${result.item_id}`,
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "api/shopee/products" || echo "no errors"
```

- [ ] **Step 3: Commit**

```bash
git add "app/api/shopee/products/route.ts"
git commit -m "feat(shopee): add POST /api/shopee/products route (add_item + link)"
```

---

### Task 4: React Query Hooks — use-shopee-create.ts

**Files:**
- Create: `lib/hooks/use-shopee-create.ts`

Context: 4 hooks yang digunakan wizard. Pattern identik dengan `use-katalog.ts` — copy `apiFetch` function karena tidak ada shared utility. `useShopeeAttributes` menerima `categoryId | null` dan hanya fetch jika non-null.

- [ ] **Step 1: Buat `lib/hooks/use-shopee-create.ts`**

```ts
"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ShopeeCategory, ShopeeCategoryAttribute, ShopeeLogisticChannel } from "@/lib/shopee/types"
import type { ShopeeCreateProductInput } from "@/app/api/shopee/products/route"

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  const contentLength = res.headers.get("content-length")
  if (res.status === 204 || contentLength === "0" || !res.body) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export function useShopeeCategories(parentCategoryId: number) {
  return useQuery({
    queryKey: ["shopee-categories", parentCategoryId],
    queryFn: () =>
      apiFetch<ShopeeCategory[]>(`/api/shopee/categories?parent_category_id=${parentCategoryId}`),
    staleTime: 10 * 60 * 1000, // 10 min — categories don't change often
  })
}

export function useShopeeAttributes(categoryId: number | null) {
  return useQuery({
    queryKey: ["shopee-attributes", categoryId],
    queryFn: () =>
      apiFetch<ShopeeCategoryAttribute[]>(`/api/shopee/attributes?category_id=${categoryId}`),
    enabled: categoryId != null,
    staleTime: 10 * 60 * 1000,
  })
}

export function useShopeeLogistics() {
  return useQuery({
    queryKey: ["shopee-logistics"],
    queryFn: () => apiFetch<ShopeeLogisticChannel[]>("/api/shopee/logistics"),
    staleTime: 10 * 60 * 1000,
  })
}

export interface ShopeeCreateProductResult {
  item_id: number
  shopeeEditUrl: string
}

export function useCreateShopeeProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ShopeeCreateProductInput) =>
      apiFetch<ShopeeCreateProductResult>("/api/shopee/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["katalog"] })
    },
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "use-shopee-create" || echo "no errors"
```

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-shopee-create.ts
git commit -m "feat(shopee): add useShopeeCategories, useShopeeAttributes, useShopeeLogistics, useCreateShopeeProduct hooks"
```

---

### Task 5: CategoryPicker Component

**Files:**
- Create: `components/katalog/shopee-create/CategoryPicker.tsx`

Context: Drill-down category browser. Mulai di root (parent_category_id=0). User navigasi ke dalam dengan klik parent. Hanya leaf (has_children=false) bisa dipilih sebagai kategori final. Breadcrumb untuk navigasi balik. Saat leaf dipilih, callback `onSelect(categoryId, categoryPath)` dipanggil.

- [ ] **Step 1: Buat `components/katalog/shopee-create/CategoryPicker.tsx`**

```tsx
"use client"

import { useState } from "react"
import { ChevronRight, ChevronLeft } from "lucide-react"
import { useShopeeCategories } from "@/lib/hooks/use-shopee-create"
import type { ShopeeCategory } from "@/lib/shopee/types"

interface Props {
  selectedCategoryId: number | null
  onSelect: (categoryId: number, path: Array<{ id: number; name: string }>) => void
}

export function CategoryPicker({ selectedCategoryId, onSelect }: Props) {
  // Stack of { id, name } representing current navigation path
  const [navPath, setNavPath] = useState<Array<{ id: number; name: string }>>([])

  const currentParentId = navPath.length > 0 ? navPath[navPath.length - 1].id : 0
  const { data: categories, isLoading } = useShopeeCategories(currentParentId)

  function handleDrillDown(cat: ShopeeCategory) {
    if (!cat.has_children) {
      // Leaf — select it
      const newPath = [...navPath, { id: cat.category_id, name: cat.category_name }]
      onSelect(cat.category_id, newPath)
    } else {
      // Parent — navigate into it
      setNavPath(prev => [...prev, { id: cat.category_id, name: cat.category_name }])
    }
  }

  function handleBack() {
    setNavPath(prev => prev.slice(0, -1))
  }

  return (
    <div
      className="rounded-[10px] overflow-hidden"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* Breadcrumb */}
      <div
        className="flex items-center gap-1 px-3 py-2 text-[11px] flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", minHeight: "34px" }}
      >
        {navPath.length > 0 && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 hover:opacity-70 transition-opacity flex-shrink-0"
            style={{ color: "#a5b4fc" }}
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
        )}
        {navPath.length === 0 ? (
          <span style={{ color: "rgba(255,255,255,0.3)" }}>Pilih kategori...</span>
        ) : (
          navPath.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3" style={{ color: "rgba(255,255,255,0.2)" }} />}
              <span style={{ color: i === navPath.length - 1 ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)" }}>
                {p.name}
              </span>
            </span>
          ))
        )}
      </div>

      {/* Category list */}
      <div className="max-h-48 overflow-y-auto">
        {isLoading && (
          <div className="px-3 py-4 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Memuat kategori...
          </div>
        )}
        {!isLoading && (!categories || categories.length === 0) && (
          <div className="px-3 py-4 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Tidak ada kategori
          </div>
        )}
        {(categories ?? []).map(cat => {
          const isSelected = !cat.has_children && cat.category_id === selectedCategoryId
          return (
            <button
              key={cat.category_id}
              onClick={() => handleDrillDown(cat)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-all hover:opacity-80"
              style={{
                background: isSelected ? "rgba(99,102,241,0.15)" : "transparent",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                color: isSelected ? "#a5b4fc" : "rgba(255,255,255,0.7)",
              }}
            >
              <span className="text-[12px]">{cat.category_name}</span>
              {cat.has_children ? (
                <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
              ) : isSelected ? (
                <span className="text-[10px]" style={{ color: "#a5b4fc" }}>✓</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "CategoryPicker" || echo "no errors"
```

- [ ] **Step 3: Commit**

```bash
git add components/katalog/shopee-create/CategoryPicker.tsx
git commit -m "feat(shopee): add CategoryPicker drill-down component"
```

---

### Task 6: AttributeFields Component

**Files:**
- Create: `components/katalog/shopee-create/AttributeFields.tsx`

Context: Render dynamic form fields dari array `ShopeeCategoryAttribute`. Tiap attribute punya `input_type` berbeda. Nilai dikembalikan via `onChange(attributeId, { value_id?, value_text? })`. Field mandatory ditandai `*` merah.

- [ ] **Step 1: Buat `components/katalog/shopee-create/AttributeFields.tsx`**

```tsx
"use client"

import type { ShopeeCategoryAttribute } from "@/lib/shopee/types"

export interface AttributeValue {
  value_id?: number
  value_text?: string
}

interface Props {
  attributes: ShopeeCategoryAttribute[]
  values: Record<number, AttributeValue>   // key = attribute_id
  onChange: (attributeId: number, value: AttributeValue) => void
}

export function AttributeFields({ attributes, values, onChange }: Props) {
  if (attributes.length === 0) return null

  return (
    <div className="space-y-3">
      {attributes.map(attr => {
        const current = values[attr.attribute_id]
        const inputStyle = {
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "8px",
          color: "rgba(255,255,255,0.8)",
          fontSize: "13px",
          padding: "7px 10px",
          width: "100%",
          outline: "none",
        } as const

        return (
          <div key={attr.attribute_id}>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
              {attr.attribute_name}
              {attr.is_mandatory && <span className="ml-0.5" style={{ color: "#f87171" }}>*</span>}
            </label>

            {attr.input_type === "TEXT_FILED" && (
              <input
                type="text"
                value={current?.value_text ?? ""}
                onChange={e => onChange(attr.attribute_id, { value_text: e.target.value })}
                placeholder={attr.attribute_name}
                style={inputStyle}
              />
            )}

            {(attr.input_type === "DROP_DOWN" || attr.input_type === "COMBO_BOX") && (
              <select
                value={current?.value_id ?? ""}
                onChange={e => {
                  const opt = attr.attribute_value_list.find(v => v.value_id === Number(e.target.value))
                  if (opt) onChange(attr.attribute_id, { value_id: opt.value_id, value_text: opt.original_value_name })
                  else onChange(attr.attribute_id, {})
                }}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">— Pilih —</option>
                {attr.attribute_value_list.map(opt => (
                  <option key={opt.value_id} value={opt.value_id}>
                    {opt.original_value_name}
                  </option>
                ))}
              </select>
            )}

            {attr.input_type === "MULTIPLE_SELECT" && (
              <div
                className="rounded-[8px] max-h-32 overflow-y-auto"
                style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }}
              >
                {attr.attribute_value_list.map(opt => {
                  const isChecked = current?.value_id === opt.value_id
                  return (
                    <label
                      key={opt.value_id}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            onChange(attr.attribute_id, { value_id: opt.value_id, value_text: opt.original_value_name })
                          } else {
                            onChange(attr.attribute_id, {})
                          }
                        }}
                        className="w-3.5 h-3.5 accent-indigo-500"
                      />
                      <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                        {opt.original_value_name}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "AttributeFields" || echo "no errors"
```

- [ ] **Step 3: Commit**

```bash
git add components/katalog/shopee-create/AttributeFields.tsx
git commit -m "feat(shopee): add AttributeFields dynamic form component"
```

---

### Task 7: ShopeeCreateWizard + StepInfo

**Files:**
- Create: `components/katalog/shopee-create/ShopeeCreateWizard.tsx`
- Create: `components/katalog/shopee-create/StepInfo.tsx`

Context: Wizard modal fullscreen. Semua state di wizard, di-pass ke step via props. Step 1 berisi nama, kategori (CategoryPicker), attributes (AttributeFields setelah kategori dipilih), kondisi, deskripsi. Validasi: itemName non-empty + categoryId non-null + semua mandatory attributes terisi.

- [ ] **Step 1: Buat `components/katalog/shopee-create/ShopeeCreateWizard.tsx`**

```tsx
"use client"

import { useState } from "react"
import { X } from "lucide-react"
import type { ProdukInternalData } from "@/lib/katalog/types"
import type { AttributeValue } from "./AttributeFields"
import { StepInfo } from "./StepInfo"
import { StepMedia } from "./StepMedia"
import { StepPricing } from "./StepPricing"
import { StepShipping } from "./StepShipping"
import { StepVariants } from "./StepVariants"

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5
  // Step 1
  itemName: string
  description: string
  categoryId: number | null
  categoryPath: Array<{ id: number; name: string }>
  condition: "NEW" | "USED"
  attributeValues: Record<number, AttributeValue>
  // Step 2
  images: Array<{ imageId: string; imageUrl: string }>
  // Step 3
  price: number
  stock: number
  // Step 4
  weight: number
  packageLength: number
  packageWidth: number
  packageHeight: number
  selectedLogistics: number[]
  variantsEnabled: boolean
  // Step 5
  tierVariationName: string
  tierVariationOptions: string[]
  models: Array<{ optionIndex: number; price: number; stock: number }>
}

interface Props {
  katalog: ProdukInternalData
  onClose: () => void
  onSuccess: (itemId: number, editUrl: string) => void
}

const STEP_LABELS = ["Info", "Media", "Harga", "Kirim", "Variasi"]

export function ShopeeCreateWizard({ katalog, onClose, onSuccess }: Props) {
  const [state, setState] = useState<WizardState>({
    step: 1,
    itemName: katalog.nama,
    description: katalog.deskripsi ?? "",
    categoryId: null,
    categoryPath: [],
    condition: "NEW",
    attributeValues: {},
    images: [],
    price: katalog.shopeeA ?? 0,
    stock: 1,
    weight: 0,
    packageLength: 0,
    packageWidth: 0,
    packageHeight: 0,
    selectedLogistics: [],
    variantsEnabled: false,
    tierVariationName: "",
    tierVariationOptions: [],
    models: [],
  })

  function update(patch: Partial<WizardState>) {
    setState(prev => ({ ...prev, ...patch }))
  }

  const maxStep = state.variantsEnabled ? 5 : 4
  const stepLabels = state.variantsEnabled ? STEP_LABELS : STEP_LABELS.slice(0, 4)

  function goNext() {
    if (state.step < maxStep) update({ step: (state.step + 1) as WizardState["step"] })
  }

  function goPrev() {
    if (state.step > 1) update({ step: (state.step - 1) as WizardState["step"] })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-[20px] overflow-hidden"
        style={{ background: "rgba(14,14,44,0.99)", border: "1px solid rgba(99,102,241,0.2)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div>
            <div className="text-[14px] font-bold text-white">🛒 Buat Produk di Shopee</div>
            <div className="text-[11px] mt-0.5 truncate max-w-xs" style={{ color: "rgba(165,180,252,0.5)" }}>
              {katalog.nama}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-opacity hover:opacity-70"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          {stepLabels.map((label, i) => {
            const stepNum = i + 1
            const isActive = state.step === stepNum
            const isDone = state.step > stepNum
            return (
              <div key={stepNum} className="flex items-center gap-2">
                {i > 0 && <div className="flex-1 h-px w-6" style={{ background: isDone ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.1)" }} />}
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                    style={{
                      background: isActive ? "rgba(99,102,241,0.8)" : isDone ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.08)",
                      color: isActive ? "white" : isDone ? "#a5b4fc" : "rgba(255,255,255,0.3)",
                      border: stepNum === 5 ? "1px dashed rgba(99,102,241,0.3)" : "none",
                    }}
                  >
                    {isDone ? "✓" : stepNum}
                  </div>
                  <span className="text-[10px] hidden sm:block" style={{ color: isActive ? "#a5b4fc" : "rgba(255,255,255,0.3)" }}>
                    {label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state.step === 1 && <StepInfo state={state} update={update} />}
          {state.step === 2 && <StepMedia state={state} update={update} katalogImageUrl={katalog.imageUrl} />}
          {state.step === 3 && <StepPricing state={state} update={update} />}
          {state.step === 4 && <StepShipping state={state} update={update} />}
          {state.step === 5 && <StepVariants state={state} update={update} />}
        </div>

        {/* Navigation */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={state.step === 1 ? onClose : goPrev}
            className="text-[12px] px-4 py-2 rounded-[8px] transition-opacity hover:opacity-70"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
          >
            {state.step === 1 ? "Batal" : "← Kembali"}
          </button>

          {state.step < maxStep ? (
            <button
              onClick={goNext}
              className="text-[12px] font-semibold px-4 py-2 rounded-[8px] transition-opacity hover:opacity-80"
              style={{ background: "rgba(99,102,241,0.3)", color: "#a5b4fc" }}
            >
              Lanjut →
            </button>
          ) : (
            <SubmitButton state={state} katalogId={katalog.id} onSuccess={onSuccess} />
          )}
        </div>
      </div>
    </div>
  )
}

function SubmitButton({ state, katalogId, onSuccess }: {
  state: WizardState
  katalogId: string
  onSuccess: (itemId: number, editUrl: string) => void
}) {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setIsPending(true)
    setError(null)
    try {
      const hasVariants = state.variantsEnabled && state.tierVariationOptions.length >= 2

      const body = {
        katalogId,
        itemName: state.itemName,
        description: state.description,
        categoryId: state.categoryId!,
        condition: state.condition,
        imageIds: state.images.map(i => i.imageId),
        weight: state.weight,
        ...(state.packageLength && state.packageWidth && state.packageHeight ? {
          packageLength: state.packageLength,
          packageWidth: state.packageWidth,
          packageHeight: state.packageHeight,
        } : {}),
        logistics: state.selectedLogistics.map(id => ({ logistic_id: id, enabled: true, is_free: false })),
        attributes: Object.entries(state.attributeValues)
          .filter(([, v]) => v.value_id != null || v.value_text?.trim())
          .map(([id, v]) => ({ attribute_id: Number(id), ...v })),
        ...(hasVariants ? {
          tierVariation: { name: state.tierVariationName, options: state.tierVariationOptions },
          models: state.models,
        } : {
          price: state.price,
          stock: state.stock,
        }),
      }

      const res = await fetch("/api/shopee/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onSuccess(json.item_id, json.shopeeEditUrl)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat produk")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <div className="text-[10px] px-3 py-1 rounded-[6px]" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
          ❌ {error}
        </div>
      )}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="text-[12px] font-semibold px-4 py-2 rounded-[8px] transition-opacity hover:opacity-80 disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.5), rgba(124,132,248,0.5))", color: "#a5b4fc" }}
      >
        {isPending ? "Membuat..." : "🛒 Buat Produk di Shopee"}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Buat `components/katalog/shopee-create/StepInfo.tsx`**

```tsx
"use client"

import { useShopeeAttributes } from "@/lib/hooks/use-shopee-create"
import { CategoryPicker } from "./CategoryPicker"
import { AttributeFields } from "./AttributeFields"
import type { WizardState } from "./ShopeeCreateWizard"
import type { AttributeValue } from "./AttributeFields"

interface Props {
  state: WizardState
  update: (patch: Partial<WizardState>) => void
}

const labelStyle = { color: "rgba(255,255,255,0.5)" } as const
const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "rgba(255,255,255,0.85)",
  fontSize: "13px",
  padding: "8px 12px",
  width: "100%",
  outline: "none",
} as const

export function StepInfo({ state, update }: Props) {
  const { data: attributes = [], isLoading: attrsLoading } = useShopeeAttributes(state.categoryId)

  function handleAttributeChange(attributeId: number, value: AttributeValue) {
    update({
      attributeValues: { ...state.attributeValues, [attributeId]: value },
    })
  }

  return (
    <div className="space-y-4">
      {/* Nama produk */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={labelStyle}>
          Nama Produk <span style={{ color: "#f87171" }}>*</span>
        </label>
        <input
          type="text"
          value={state.itemName}
          onChange={e => update({ itemName: e.target.value })}
          maxLength={120}
          placeholder="Nama produk (maks 120 karakter)"
          style={inputStyle}
        />
        <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
          {state.itemName.length}/120
        </div>
      </div>

      {/* Kategori */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={labelStyle}>
          Kategori <span style={{ color: "#f87171" }}>*</span>
          {state.categoryId && (
            <span className="ml-2 text-[10px]" style={{ color: "#4ade80" }}>✓ dipilih</span>
          )}
        </label>
        <CategoryPicker
          selectedCategoryId={state.categoryId}
          onSelect={(categoryId, path) => update({ categoryId, categoryPath: path, attributeValues: {} })}
        />
        {state.categoryPath.length > 0 && (
          <div className="text-[10px] mt-1" style={{ color: "rgba(165,180,252,0.5)" }}>
            {state.categoryPath.map(p => p.name).join(" › ")}
          </div>
        )}
      </div>

      {/* Attributes (hanya muncul setelah kategori dipilih) */}
      {state.categoryId && (
        <div>
          <label className="block text-[11px] font-medium mb-2" style={labelStyle}>
            Atribut Kategori
          </label>
          {attrsLoading ? (
            <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Memuat atribut...</div>
          ) : (
            <AttributeFields
              attributes={attributes}
              values={state.attributeValues}
              onChange={handleAttributeChange}
            />
          )}
        </div>
      )}

      {/* Kondisi */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={labelStyle}>
          Kondisi <span style={{ color: "#f87171" }}>*</span>
        </label>
        <div className="flex gap-2">
          {(["NEW", "USED"] as const).map(c => (
            <button
              key={c}
              onClick={() => update({ condition: c })}
              className="px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all"
              style={{
                background: state.condition === c ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${state.condition === c ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.1)"}`,
                color: state.condition === c ? "#a5b4fc" : "rgba(255,255,255,0.45)",
              }}
            >
              {c === "NEW" ? "Baru" : "Bekas"}
            </button>
          ))}
        </div>
      </div>

      {/* Deskripsi */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={labelStyle}>
          Deskripsi <span style={{ color: "rgba(255,255,255,0.25)" }}>(opsional)</span>
        </label>
        <textarea
          value={state.description}
          onChange={e => update({ description: e.target.value })}
          rows={4}
          placeholder="Deskripsi produk..."
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "ShopeeCreateWizard|StepInfo" || echo "no errors"
```

- [ ] **Step 4: Commit**

```bash
git add components/katalog/shopee-create/ShopeeCreateWizard.tsx components/katalog/shopee-create/StepInfo.tsx
git commit -m "feat(shopee): add ShopeeCreateWizard modal and StepInfo"
```

---

### Task 8: StepMedia

**Files:**
- Create: `components/katalog/shopee-create/StepMedia.tsx`

Context: Upload gambar ke Shopee media space. Auto-import `katalogImageUrl` saat komponen mount (jika ada dan belum di-upload). Upload baru via file input → `uploadImageToShopee` (server-side — perlu API route proxy atau panggil langsung via server action). **Catatan:** `uploadImageToShopee` adalah server function di `lib/shopee/media.ts` — tidak bisa dipanggil langsung dari client. Buat API route `POST /api/shopee/upload-image` sebagai proxy.

- [ ] **Step 1: Buat `app/api/shopee/upload-image/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { uploadImageToShopee } from "@/lib/shopee/media"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("image") as File | null
  if (!file) return NextResponse.json({ error: "image is required" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const result = await uploadImageToShopee(buffer, file.name, file.type || "image/jpeg")
  return NextResponse.json(result)
}
```

- [ ] **Step 2: Buat `components/katalog/shopee-create/StepMedia.tsx`**

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { Upload, X } from "lucide-react"
import type { WizardState } from "./ShopeeCreateWizard"

interface Props {
  state: WizardState
  update: (patch: Partial<WizardState>) => void
  katalogImageUrl: string | null
}

export function StepMedia({ state, update, katalogImageUrl }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const autoImportDone = useRef(false)

  // Auto-import katalog image on first mount
  useEffect(() => {
    if (autoImportDone.current) return
    if (!katalogImageUrl || state.images.length > 0) return
    autoImportDone.current = true

    async function importKatalogImage() {
      setUploading(true)
      try {
        const res = await fetch(katalogImageUrl!)
        if (!res.ok) return
        const blob = await res.blob()
        const file = new File([blob], "katalog-image.jpg", { type: blob.type || "image/jpeg" })
        await uploadFile(file)
      } catch {
        // silently skip if katalog image import fails
      } finally {
        setUploading(false)
      }
    }
    importKatalogImage()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadFile(file: File) {
    const fd = new FormData()
    fd.append("image", file)
    setUploading(true)
    setUploadError(null)
    try {
      const res = await fetch("/api/shopee/upload-image", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      update({ images: [...state.images, { imageId: json.imageId, imageUrl: json.imageUrl }] })
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload gagal")
    } finally {
      setUploading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ""
  }

  function removeImage(index: number) {
    update({ images: state.images.filter((_, i) => i !== index) })
  }

  const canAddMore = state.images.length < 9 && !uploading

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Foto Produk <span style={{ color: "#f87171" }}>*</span>
          <span className="ml-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
            {state.images.length}/9
          </span>
        </label>

        <div className="grid grid-cols-3 gap-3">
          {state.images.map((img, idx) => (
            <div key={img.imageId} className="relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.imageUrl}
                alt={`Image ${idx + 1}`}
                className="w-full h-full object-cover rounded-[8px]"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              />
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "rgba(239,68,68,0.8)" }}
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}

          {canAddMore && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-[8px] flex flex-col items-center justify-center gap-1 transition-opacity hover:opacity-70"
              style={{
                border: "1px dashed rgba(99,102,241,0.3)",
                background: "rgba(99,102,241,0.05)",
                color: "rgba(165,180,252,0.5)",
              }}
            >
              <Upload className="w-5 h-5" />
              <span className="text-[10px]">Upload</span>
            </button>
          )}

          {uploading && (
            <div
              className="aspect-square rounded-[8px] flex items-center justify-center"
              style={{ border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)" }}
            >
              <span className="text-[10px] animate-pulse" style={{ color: "rgba(255,255,255,0.3)" }}>
                Uploading...
              </span>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />

        {uploadError && (
          <div className="text-[10px] mt-2 px-3 py-1.5 rounded-[6px]" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
            ❌ {uploadError}
          </div>
        )}

        <div className="text-[10px] mt-2" style={{ color: "rgba(255,255,255,0.25)" }}>
          Format: JPG, PNG, WebP · Maks 9 gambar · Gambar dari katalog otomatis di-import
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "StepMedia|upload-image" || echo "no errors"
```

- [ ] **Step 4: Commit**

```bash
git add "app/api/shopee/upload-image/route.ts" components/katalog/shopee-create/StepMedia.tsx
git commit -m "feat(shopee): add upload-image route and StepMedia component"
```

---

### Task 9: StepPricing + StepShipping + StepVariants

**Files:**
- Create: `components/katalog/shopee-create/StepPricing.tsx`
- Create: `components/katalog/shopee-create/StepShipping.tsx`
- Create: `components/katalog/shopee-create/StepVariants.tsx`

- [ ] **Step 1: Buat `components/katalog/shopee-create/StepPricing.tsx`**

```tsx
"use client"

import type { WizardState } from "./ShopeeCreateWizard"

interface Props {
  state: WizardState
  update: (patch: Partial<WizardState>) => void
}

const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "rgba(255,255,255,0.85)",
  fontSize: "13px",
  padding: "8px 12px",
  width: "100%",
  outline: "none",
} as const

export function StepPricing({ state, update }: Props) {
  if (state.variantsEnabled) {
    return (
      <div
        className="flex items-center gap-3 p-4 rounded-[10px]"
        style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}
      >
        <span className="text-xl">⚡</span>
        <div>
          <div className="text-[13px] font-medium" style={{ color: "#fbbf24" }}>Variasi aktif</div>
          <div className="text-[11px] mt-0.5" style={{ color: "rgba(251,191,36,0.6)" }}>
            Harga dan stok diatur per variasi di step berikutnya.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Harga <span style={{ color: "#f87171" }}>*</span>
        </label>
        <div className="relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-medium"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Rp
          </span>
          <input
            type="number"
            min={0}
            value={state.price || ""}
            onChange={e => update({ price: Number(e.target.value) })}
            placeholder="0"
            style={{ ...inputStyle, paddingLeft: "36px" }}
          />
        </div>
        {state.price > 0 && (
          <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
            Rp {Math.round(state.price).toLocaleString("id-ID")}
          </div>
        )}
      </div>

      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Stok <span style={{ color: "#f87171" }}>*</span>
        </label>
        <input
          type="number"
          min={1}
          value={state.stock || ""}
          onChange={e => update({ stock: Number(e.target.value) })}
          placeholder="1"
          style={inputStyle}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Buat `components/katalog/shopee-create/StepShipping.tsx`**

```tsx
"use client"

import { useShopeeLogistics } from "@/lib/hooks/use-shopee-create"
import type { WizardState } from "./ShopeeCreateWizard"

interface Props {
  state: WizardState
  update: (patch: Partial<WizardState>) => void
}

const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "rgba(255,255,255,0.85)",
  fontSize: "13px",
  padding: "8px 12px",
  width: "100%",
  outline: "none",
} as const

export function StepShipping({ state, update }: Props) {
  const { data: logistics = [], isLoading } = useShopeeLogistics()

  function toggleLogistic(id: number) {
    const sel = state.selectedLogistics
    update({
      selectedLogistics: sel.includes(id)
        ? sel.filter(l => l !== id)
        : [...sel, id],
    })
  }

  return (
    <div className="space-y-4">
      {/* Berat */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Berat <span style={{ color: "#f87171" }}>*</span>
        </label>
        <div className="relative">
          <input
            type="number"
            min={0}
            step={0.1}
            value={state.weight || ""}
            onChange={e => update({ weight: Number(e.target.value) })}
            placeholder="0.3"
            style={{ ...inputStyle, paddingRight: "40px" }}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            kg
          </span>
        </div>
      </div>

      {/* Dimensi */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Dimensi Paket <span style={{ color: "rgba(255,255,255,0.25)" }}>(opsional, cm)</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["packageLength", "packageWidth", "packageHeight"] as const).map((key, i) => (
            <div key={key} className="relative">
              <input
                type="number"
                min={0}
                value={state[key] || ""}
                onChange={e => update({ [key]: Number(e.target.value) } as Partial<WizardState>)}
                placeholder={["P", "L", "T"][i]}
                style={inputStyle}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Jasa kirim */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Jasa Kirim <span style={{ color: "#f87171" }}>*</span>
          <span className="ml-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
            (pilih min. 1)
          </span>
        </label>
        <div
          className="rounded-[10px] overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
        >
          {isLoading && (
            <div className="px-3 py-4 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              Memuat jasa kirim...
            </div>
          )}
          {logistics.map(l => {
            const isSelected = state.selectedLogistics.includes(l.logistic_id)
            return (
              <label
                key={l.logistic_id}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:opacity-80 transition-opacity"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleLogistic(l.logistic_id)}
                  className="w-3.5 h-3.5 accent-indigo-500"
                />
                <span className="text-[12px]" style={{ color: isSelected ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)" }}>
                  {l.logistic_name}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Toggle variasi */}
      <div
        className="flex items-center justify-between p-3 rounded-[10px]"
        style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}
      >
        <div>
          <div className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Aktifkan Variasi</div>
          <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            Contoh: ukuran S/M/L, warna
          </div>
        </div>
        <button
          onClick={() => update({ variantsEnabled: !state.variantsEnabled })}
          className="relative w-10 h-6 rounded-full transition-colors"
          style={{ background: state.variantsEnabled ? "rgba(99,102,241,0.7)" : "rgba(255,255,255,0.15)" }}
        >
          <div
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
            style={{ transform: state.variantsEnabled ? "translateX(20px)" : "translateX(2px)" }}
          />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Buat `components/katalog/shopee-create/StepVariants.tsx`**

```tsx
"use client"

import { useState } from "react"
import { X, Plus } from "lucide-react"
import type { WizardState } from "./ShopeeCreateWizard"

interface Props {
  state: WizardState
  update: (patch: Partial<WizardState>) => void
}

const inputStyle = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "8px",
  color: "rgba(255,255,255,0.85)",
  fontSize: "12px",
  padding: "6px 10px",
  outline: "none",
} as const

export function StepVariants({ state, update }: Props) {
  const [optionInput, setOptionInput] = useState("")

  function addOption() {
    const val = optionInput.trim()
    if (!val || state.tierVariationOptions.includes(val)) return
    const newOptions = [...state.tierVariationOptions, val]
    const newModels = newOptions.map((_, i) => {
      const existing = state.models.find(m => m.optionIndex === i)
      return existing ?? { optionIndex: i, price: state.price || 0, stock: state.stock || 1 }
    })
    update({ tierVariationOptions: newOptions, models: newModels })
    setOptionInput("")
  }

  function removeOption(index: number) {
    const newOptions = state.tierVariationOptions.filter((_, i) => i !== index)
    const newModels = newOptions.map((_, i) => {
      const existing = state.models.find(m => m.optionIndex === i)
      return { ...(existing ?? { price: state.price || 0, stock: state.stock || 1 }), optionIndex: i }
    })
    update({ tierVariationOptions: newOptions, models: newModels })
  }

  function updateModel(optionIndex: number, field: "price" | "stock", value: number) {
    update({
      models: state.models.map(m =>
        m.optionIndex === optionIndex ? { ...m, [field]: value } : m,
      ),
    })
  }

  return (
    <div className="space-y-4">
      {/* Nama variasi */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Nama Variasi <span style={{ color: "#f87171" }}>*</span>
          <span className="ml-1.5 font-normal" style={{ color: "rgba(255,255,255,0.25)" }}>Contoh: Ukuran, Warna</span>
        </label>
        <input
          type="text"
          value={state.tierVariationName}
          onChange={e => update({ tierVariationName: e.target.value })}
          placeholder="Ukuran"
          style={{ ...inputStyle, width: "100%", fontSize: "13px", padding: "8px 12px" }}
        />
      </div>

      {/* Opsi variasi */}
      <div>
        <label className="block text-[11px] font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
          Opsi <span style={{ color: "#f87171" }}>*</span>
          <span className="ml-1.5 font-normal" style={{ color: "rgba(255,255,255,0.25)" }}>Min. 2</span>
        </label>
        <div className="flex gap-2 mb-2 flex-wrap">
          {state.tierVariationOptions.map((opt, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px]"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc" }}
            >
              {opt}
              <button onClick={() => removeOption(i)} className="hover:opacity-70 transition-opacity">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={optionInput}
            onChange={e => setOptionInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOption() }}}
            placeholder="Tambah opsi..."
            style={{ ...inputStyle, flex: 1, fontSize: "13px", padding: "8px 12px" }}
          />
          <button
            onClick={addOption}
            className="px-3 py-2 rounded-[8px] flex items-center gap-1 text-[12px] transition-opacity hover:opacity-70"
            style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.25)" }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabel harga & stok per opsi */}
      {state.tierVariationOptions.length > 0 && (
        <div>
          <label className="block text-[11px] font-medium mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
            Harga & Stok per Opsi
          </label>
          <div
            className="rounded-[10px] overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div
              className="grid text-[10px] font-semibold px-3 py-2"
              style={{
                gridTemplateColumns: "1fr 110px 90px",
                gap: "8px",
                background: "rgba(255,255,255,0.03)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.3)",
              }}
            >
              <span>{state.tierVariationName || "Opsi"}</span>
              <span>Harga (Rp)</span>
              <span>Stok</span>
            </div>
            {state.tierVariationOptions.map((opt, i) => {
              const model = state.models.find(m => m.optionIndex === i)
              return (
                <div
                  key={i}
                  className="grid items-center px-3 py-2"
                  style={{
                    gridTemplateColumns: "1fr 110px 90px",
                    gap: "8px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>{opt}</span>
                  <input
                    type="number"
                    min={0}
                    value={model?.price || ""}
                    onChange={e => updateModel(i, "price", Number(e.target.value))}
                    placeholder="0"
                    style={inputStyle}
                  />
                  <input
                    type="number"
                    min={1}
                    value={model?.stock || ""}
                    onChange={e => updateModel(i, "stock", Number(e.target.value))}
                    placeholder="1"
                    style={inputStyle}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep -E "StepPricing|StepShipping|StepVariants" || echo "no errors"
```

- [ ] **Step 5: Commit**

```bash
git add components/katalog/shopee-create/StepPricing.tsx components/katalog/shopee-create/StepShipping.tsx components/katalog/shopee-create/StepVariants.tsx
git commit -m "feat(shopee): add StepPricing, StepShipping, StepVariants components"
```

---

### Task 10: Wire ShopeeLinksSection + Build + Deploy

**Files:**
- Modify: `components/katalog/ShopeeLinksSection.tsx`

Context: Tambah (1) state `wizardOpen` dan `successResult`, (2) tombol "+ Buat Produk Baru di Shopee" di bagian bawah section, (3) render `ShopeeCreateWizard` ketika `wizardOpen=true`, (4) banner sukses dengan link ke Shopee setelah wizard berhasil. Baca file dulu sebelum edit untuk tahu lokasi yang tepat.

- [ ] **Step 1: Baca current ShopeeLinksSection**

```bash
wc -l "/Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard/components/katalog/ShopeeLinksSection.tsx"
```

- [ ] **Step 2: Tambah imports dan state ke ShopeeLinksSection**

Tambahkan di bagian `import` atas file:
```tsx
import { ShopeeCreateWizard } from "./shopee-create/ShopeeCreateWizard"
import type { ProdukInternalData } from "@/lib/katalog/types"
```

Ubah interface `Props` untuk menerima full `produk`:
```tsx
interface Props {
  produk: ProdukInternalData      // ganti dari produkId + links terpisah
}
```

Di dalam `ShopeeLinksSection`, tambah state:
```tsx
const [wizardOpen, setWizardOpen] = useState(false)
const [successResult, setSuccessResult] = useState<{ itemId: number; editUrl: string } | null>(null)
```

Ambil `produkId` dan `links` dari prop baru:
```tsx
const { id: produkId, shopeeLinks: links } = produk
```

- [ ] **Step 3: Tambah tombol "Buat di Shopee" dan wizard ke JSX**

Di akhir JSX section (sebelum closing `</div>`), tambahkan:

```tsx
{/* Success banner */}
{successResult && (
  <div
    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[8px] mt-2"
    style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}
  >
    <div>
      <div className="text-[11px] font-semibold" style={{ color: "#4ade80" }}>
        ✅ Produk berhasil dibuat (item #{successResult.itemId})
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
        Status: DRAFT — lengkapi atribut di Shopee
      </div>
    </div>
    <a
      href={successResult.editUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-[6px] transition-opacity hover:opacity-80"
      style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", whiteSpace: "nowrap" }}
    >
      Edit di Shopee →
    </a>
  </div>
)}

{/* Create new button */}
<button
  onClick={() => { setSuccessResult(null); setWizardOpen(true) }}
  className="w-full mt-2 py-2 rounded-[8px] text-[11px] font-medium transition-all hover:opacity-80 flex items-center justify-center gap-1.5"
  style={{
    background: "rgba(99,102,241,0.06)",
    border: "1px dashed rgba(99,102,241,0.3)",
    color: "rgba(165,180,252,0.6)",
  }}
>
  + Buat Produk Baru di Shopee
</button>

{/* Wizard modal */}
{wizardOpen && (
  <ShopeeCreateWizard
    katalog={produk}
    onClose={() => setWizardOpen(false)}
    onSuccess={(itemId, editUrl) => {
      setWizardOpen(false)
      setSuccessResult({ itemId, editUrl })
    }}
  />
)}
```

- [ ] **Step 4: Update semua pemanggil ShopeeLinksSection**

`ShopeeLinksSection` sekarang menerima `produk: ProdukInternalData` bukan `{ produkId, links }`. Cari dan update semua tempat yang me-render `<ShopeeLinksSection>`:

```bash
grep -rn "ShopeeLinksSection" /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard/components/ --include="*.tsx"
```

Di `KatalogCard.tsx`, ganti:
```tsx
// BEFORE:
<ShopeeLinksSection produkId={produk.id} links={produk.shopeeLinks} />

// AFTER:
<ShopeeLinksSection produk={produk} />
```

- [ ] **Step 5: TypeScript check full**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: tidak ada error. Kalau ada error, fix sebelum lanjut.

- [ ] **Step 6: Build production**

```bash
npm run build 2>&1 | grep -E "error|Error|✓ Compiled" | head -10
```

Expected: `✓ Compiled successfully`

- [ ] **Step 7: Commit + Deploy**

```bash
git add components/katalog/ShopeeLinksSection.tsx components/katalog/KatalogCard.tsx
git commit -m "feat(shopee): wire ShopeeCreateWizard into ShopeeLinksSection with success banner"
bash deploy.sh 2>&1 | tail -5
```

- [ ] **Step 8: Smoke test**

1. Buka `/produk` tab Katalog
2. Expand salah satu KatalogCard
3. Di section Shopee Products → klik "+ Buat Produk Baru di Shopee"
4. Wizard terbuka → isi Step 1 (nama, pilih kategori, isi attributes)
5. Step 2 (foto dari katalog auto-import)
6. Step 3 (harga & stok)
7. Step 4 (berat + pilih jasa kirim)
8. Klik "Buat Produk di Shopee"
9. Banner sukses muncul dengan link "Edit di Shopee →"
10. Klik link → produk terbuka di Shopee Seller Center (status DRAFT)
