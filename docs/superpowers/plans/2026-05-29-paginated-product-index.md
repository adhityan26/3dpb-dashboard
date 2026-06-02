# Paginated Product Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "fetch all Shopee products at once" approach with a DB-backed product index supporting pagination + search, where rich data (variants, stock, sold stats) is only fetched for the current page.

**Architecture:** A `ShopeeProductIndex` Prisma table stores lightweight product metadata (id, name, status, image URL). A `syncProductIndex()` service function populates/updates it from the Shopee API. A new `getProductsPage()` function queries the index with filters + pagination, then enriches only the page's products with rich Shopee API data. The produk tab's UI is updated to use the new paginated hook with search + filter tabs + pagination controls.

**Tech Stack:** Next.js App Router, Prisma 7 (PostgreSQL), React Query (`@tanstack/react-query`), TypeScript

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add `ShopeeProductIndex` model |
| `lib/products/types.ts` | Modify | Add `ProductsPageResult` type |
| `lib/products/service.ts` | Modify | Add `syncProductIndex()` and `getProductsPage()` |
| `app/api/products/page/route.ts` | Create | `GET /api/products/page?page=&limit=&q=&status=` |
| `app/api/products/sync-index/route.ts` | Create | `POST /api/products/sync-index` |
| `lib/hooks/use-products.ts` | Modify | Add `useProductsPage()` and `useSyncProductIndex()` |
| `app/(dashboard)/produk/page.tsx` | Modify | Replace produk tab with paginated UI |

---

### Task 1: Prisma Schema — Add `ShopeeProductIndex`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Read current schema** (already done — confirm last model is `LightGeneratorOrder`)

- [ ] **Step 2: Add model to schema**

Append this block at the end of `prisma/schema.prisma` (after `LightGeneratorOrder`):

```prisma
model ShopeeProductIndex {
  itemId       String   @id
  name         String
  status       String   // "NORMAL" | "UNLIST"
  imageUrl     String?
  lastSyncedAt DateTime @default(now()) @updatedAt
}
```

- [ ] **Step 3: Run migration**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx prisma migrate dev --name shopee_product_index
```

Expected output ends with: `Your database is now in sync with your schema.`

- [ ] **Step 4: Verify Prisma client regenerated**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client...`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add ShopeeProductIndex model for paginated product list"
```

---

### Task 2: Types — Add `ProductsPageResult`

**Files:**
- Modify: `lib/products/types.ts`

- [ ] **Step 1: Add new type**

Append to `lib/products/types.ts`:

```typescript
export interface ProductsPageResult {
  products: ProductSummary[]
  total: number
  page: number
  totalPages: number
  fetchedAt: string
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/products/types.ts
git commit -m "feat: add ProductsPageResult type"
```

---

### Task 3: Service Layer — `syncProductIndex` and `getProductsPage`

**Files:**
- Modify: `lib/products/service.ts`

- [ ] **Step 1: Add `syncProductIndex` after `invalidateProductsCache`**

In `lib/products/service.ts`, add this function after the `invalidateProductsCache` export (around line 33):

```typescript
/**
 * Syncs the ShopeeProductIndex table with current items from Shopee API.
 * Upserts all active items, deletes stale rows.
 */
export async function syncProductIndex(): Promise<{ synced: number; deleted: number }> {
  const itemRefs = await getAllItems(["NORMAL", "UNLIST"])
  if (itemRefs.length === 0) {
    // Delete everything if Shopee returns empty (edge case — preserve if API error)
    const deleted = await prisma.shopeeProductIndex.deleteMany()
    return { synced: 0, deleted: deleted.count }
  }

  const itemIds = itemRefs.map((r) => r.item_id)
  const baseInfos = await getItemBaseInfoBatch(itemIds)

  // Upsert all in a transaction
  await prisma.$transaction(
    baseInfos.map((b) =>
      prisma.shopeeProductIndex.upsert({
        where: { itemId: String(b.item_id) },
        update: {
          name: b.item_name,
          status: b.item_status,
          imageUrl: b.image?.image_url_list?.[0] ?? null,
        },
        create: {
          itemId: String(b.item_id),
          name: b.item_name,
          status: b.item_status,
          imageUrl: b.image?.image_url_list?.[0] ?? null,
        },
      }),
    ),
  )

  // Delete stale rows (items no longer returned by Shopee)
  const activeIds = itemIds.map(String)
  const deleted = await prisma.shopeeProductIndex.deleteMany({
    where: { itemId: { notIn: activeIds } },
  })

  return { synced: baseInfos.length, deleted: deleted.count }
}
```

- [ ] **Step 2: Add `getProductsPage` after `syncProductIndex`**

Add this function in `lib/products/service.ts` after `syncProductIndex`:

```typescript
interface GetProductsPageOpts {
  page: number
  limit: number
  q?: string
  status?: string
}

/**
 * Returns a paginated, optionally filtered list of products.
 * Only fetches rich Shopee data (variants, stock, sold stats) for the current page.
 */
export async function getProductsPage(
  opts: GetProductsPageOpts,
): Promise<import("./types").ProductsPageResult> {
  const { page, limit, q, status } = opts
  const skip = (page - 1) * limit

  const where: import("@prisma/client").Prisma.ShopeeProductIndexWhereInput = {}
  if (q && q.trim() !== "") {
    where.name = { contains: q.trim(), mode: "insensitive" }
  }
  if (status && status !== "all") {
    where.status = status.toUpperCase()
  }

  const [total, indexRows] = await Promise.all([
    prisma.shopeeProductIndex.count({ where }),
    prisma.shopeeProductIndex.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: "asc" },
    }),
  ])

  const totalPages = Math.ceil(total / limit)

  if (indexRows.length === 0) {
    return { products: [], total, page, totalPages, fetchedAt: new Date().toISOString() }
  }

  const pageItemIds = indexRows.map((r) => Number(r.itemId))
  const baseInfos = await getItemBaseInfoBatch(pageItemIds)

  // Fetch variant lists for items that have them (limit concurrency to 10)
  const variantsByItem = new Map<number, VariantSummary[]>()
  const itemsWithVariants = baseInfos.filter((b) => b.has_model)
  const BATCH = 10

  for (let i = 0; i < itemsWithVariants.length; i += BATCH) {
    const chunk = itemsWithVariants.slice(i, i + BATCH)
    const results = await Promise.all(
      chunk.map(async (item) => {
        try {
          const res = await getModelList(item.item_id)
          return { itemId: item.item_id, models: res.model }
        } catch (err) {
          console.warn(`getModelList failed for item ${item.item_id}:`, err)
          return { itemId: item.item_id, models: [] }
        }
      }),
    )
    for (const { itemId, models } of results) {
      const variants: VariantSummary[] = models.map((m) => {
        const current = m.price_info?.[0]?.current_price ?? 0
        const original = m.price_info?.[0]?.original_price ?? 0
        return {
          variantId: String(m.model_id),
          variantName: m.model_name ?? `Varian ${m.model_id}`,
          sku: m.model_sku ?? null,
          stock: m.stock_info_v2?.summary_info?.total_available_stock ?? 0,
          price: current,
          originalPrice: original > 0 && original > current ? original : null,
          hpp: null,
        }
      })
      variantsByItem.set(itemId, variants)
    }
  }

  const pageItemIdStrings = pageItemIds.map(String)

  const [shopeeLinks, soldStats] = await Promise.all([
    prisma.produkInternalShopeeLink.findMany({
      where: { shopeeItemId: { in: pageItemIdStrings } },
      include: {
        produkInternal: {
          include: { primaryKalkulasi: true },
        },
      },
    }),
    getSoldStatsPerItem(),
  ])

  const katalogByItemId = new Map<string, KatalogInfo>()
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

  const products: ProductSummary[] = baseInfos.map((b) => {
    const productIdStr = String(b.item_id)
    const hasVariants = b.has_model
    const variants = hasVariants ? (variantsByItem.get(b.item_id) ?? []) : []

    const stockTotal = hasVariants
      ? variants.reduce((s, v) => s + v.stock, 0)
      : (b.stock_info_v2?.summary_info?.total_available_stock ?? 0)

    const prices = hasVariants
      ? variants.map((v) => v.price).filter((p) => p > 0)
      : [b.price_info?.[0]?.current_price ?? 0]
    const priceMin = prices.length > 0 ? Math.min(...prices) : 0
    const priceMax = prices.length > 0 ? Math.max(...prices) : 0

    const origPrices = hasVariants
      ? variants.map((v) => v.originalPrice).filter((p): p is number => p !== null && p > 0)
      : (() => { const op = b.price_info?.[0]?.original_price ?? 0; return op > priceMin ? [op] : [] })()
    const originalPriceMin = origPrices.length > 0 ? Math.min(...origPrices) : null

    const weight = b.weight ?? null
    const dim = b.dimension
    const dimensionCm =
      dim?.package_length && dim?.package_width && dim?.package_height
        ? { l: dim.package_length, w: dim.package_width, h: dim.package_height }
        : null

    const stats = soldStats.get(productIdStr) ?? { qty: 0, omzet: 0 }
    const katalog = katalogByItemId.get(productIdStr) ?? null
    const productHpp = katalog?.hppTotal ?? null

    let grossMargin30d: number | null = null
    if (productHpp !== null) {
      grossMargin30d = stats.omzet - productHpp * stats.qty
    }

    const stockValues = hasVariants ? variants.map((v) => v.stock) : [stockTotal]
    const lowestStock = stockValues.length > 0 ? Math.min(...stockValues) : 0
    const isStockLow = lowestStock < STOCK_LOW_THRESHOLD
    const noSalesRecent = stats.qty === 0
    const perluPerhatian = isStockLow || noSalesRecent

    return {
      productId: productIdStr,
      name: b.item_name,
      status: b.item_status as ProductStatus,
      imageUrl: b.image?.image_url_list?.[0] ?? null,
      hasVariants,
      stockTotal,
      priceMin,
      priceMax,
      originalPriceMin,
      weight,
      dimensionCm,
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
  })

  return {
    products,
    total,
    page,
    totalPages,
    fetchedAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | head -40
```

Fix any type errors before proceeding. Common issue: Prisma `mode: "insensitive"` needs the type import — if there's an error on the `where` object, replace the explicit type annotation with `const where: Parameters<typeof prisma.shopeeProductIndex.findMany>[0]['where'] = {}`.

- [ ] **Step 4: Commit**

```bash
git add lib/products/service.ts lib/products/types.ts
git commit -m "feat: add syncProductIndex and getProductsPage service functions"
```

---

### Task 4: API Routes — `GET /api/products/page` and `POST /api/products/sync-index`

**Files:**
- Create: `app/api/products/page/route.ts`
- Create: `app/api/products/sync-index/route.ts`

- [ ] **Step 1: Create `app/api/products/page/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { getProductsPage } from "@/lib/products/service"
import { NextRequest, NextResponse } from "next/server"

const ALLOWED_ROLES = ["OWNER", "ADMIN", "TEST_USER"]

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20")))
  const q = searchParams.get("q") ?? ""
  const status = searchParams.get("status") ?? ""

  try {
    const result = await getProductsPage({ page, limit, q, status })

    // Redact HPP + margin for non-owner roles
    if (session.user.role !== "OWNER") {
      return NextResponse.json({
        ...result,
        products: result.products.map((p) => ({
          ...p,
          hpp: null,
          grossMargin30d: null,
          variants: p.variants.map((v) => ({ ...v, hpp: null })),
        })),
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("GET /api/products/page failed:", err)
    const notConnected =
      msg.includes("not authorized") || msg.includes("shop_id not found")
    return NextResponse.json(
      { error: msg, notConnected },
      { status: notConnected ? 503 : 500 },
    )
  }
}
```

- [ ] **Step 2: Create `app/api/products/sync-index/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { syncProductIndex, invalidateProductsCache } from "@/lib/products/service"
import { NextResponse } from "next/server"

export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Invalidate in-memory cache so next full load is fresh too
  invalidateProductsCache()

  // Run sync in background — respond immediately
  syncProductIndex()
    .then(({ synced, deleted }) => {
      console.log(`[sync-index] synced=${synced} deleted=${deleted}`)
    })
    .catch((err) => {
      console.error("[sync-index] failed:", err)
    })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add app/api/products/page/route.ts app/api/products/sync-index/route.ts
git commit -m "feat: add /api/products/page and /api/products/sync-index routes"
```

---

### Task 5: Hooks — `useProductsPage` and `useSyncProductIndex`

**Files:**
- Modify: `lib/hooks/use-products.ts`

- [ ] **Step 1: Add imports and types at the top of the file**

After the existing imports (line 4: `import type { ProductsListResult } from ...`), add:

```typescript
import type { ProductsListResult, ProductsPageResult } from "@/lib/products/types"
```

Replace the existing import of `ProductsListResult` with the above (it adds `ProductsPageResult`).

- [ ] **Step 2: Add `useProductsPage` and `useSyncProductIndex` at the end of the file**

Append to `lib/hooks/use-products.ts`:

```typescript
// ── Paginated product index ────────────────────────────────────────────────

interface ProductsPageOpts {
  page: number
  limit: number
  q: string
  status?: string
}

export function useProductsPage(opts: ProductsPageOpts) {
  return useQuery({
    queryKey: ["products-page", opts],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(opts.page),
        limit: String(opts.limit),
        ...(opts.q ? { q: opts.q } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      })
      const res = await fetch(`/api/products/page?${params}`)
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<ProductsPageResult>
    },
    staleTime: 4 * 60 * 1000,
  })
}

export function useSyncProductIndex() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await fetch("/api/products/sync-index", { method: "POST" })
      return qc.invalidateQueries({ queryKey: ["products-page"] })
    },
  })
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/use-products.ts
git commit -m "feat: add useProductsPage and useSyncProductIndex hooks"
```

---

### Task 6: UI — Update Produk Tab with Pagination, Search, and Sync

**Files:**
- Modify: `app/(dashboard)/produk/page.tsx`

- [ ] **Step 1: Update imports at the top of the file**

Replace:
```typescript
import {
  useProducts,
  useRefreshProducts,
  useUploadProductImage,
} from "@/lib/hooks/use-products"
```

With:
```typescript
import {
  useProducts,
  useRefreshProducts,
  useUploadProductImage,
  useProductsPage,
  useSyncProductIndex,
} from "@/lib/hooks/use-products"
```

Also add this import after existing React imports:
```typescript
import { useCallback, useEffect, useRef } from "react"
```

(The file already has `useMemo`, `useState`, `Suspense` — just add `useCallback`, `useEffect`, `useRef`.)

- [ ] **Step 2: Replace the entire produk tab section in `ProdukPageInner`**

The current produk tab section is everything inside `produkTab === "produk"` branch — replace the full `ProdukPageInner` function body. The new function:

```typescript
function ProdukPageInner() {
  const { intervalMs } = useRefreshConfig()
  const { data: kpiData, dataUpdatedAt } = useProducts()
  const refreshProducts = useRefreshProducts()
  const uploadImage = useUploadProductImage()
  const syncIndex = useSyncProductIndex()

  async function handleRefresh() {
    await refreshProducts.mutateAsync()
  }

  const router = useRouter()
  const searchParams = useSearchParams()

  const VALID_TABS: ProdukTab[] = ["katalog", "produk", "kalkulator", "filamen"]
  const rawTab = searchParams.get("tab") ?? "katalog"
  const produkTab: ProdukTab = VALID_TABS.includes(rawTab as ProdukTab)
    ? (rawTab as ProdukTab)
    : "katalog"

  const [sidebarOpen, setSidebarOpen] = useState(false)

  function setProdukTab(tab: ProdukTab) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", tab)
    router.replace(`?${params.toString()}`, { scroll: false })
    setSidebarOpen(false)
  }

  // ── Pagination & search state ────────────────────────────────────────
  const [filter, setFilter] = useState<ProductFilterValue>("all")
  const [searchInput, setSearchInput] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [page, setPage] = useState(1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(val)
      setPage(1) // reset to page 1 on new search
    }, 400)
  }, [])

  // Reset page when filter changes
  useEffect(() => {
    setPage(1)
  }, [filter])

  const statusParam =
    filter === "unlist" ? "UNLIST" :
    filter === "stok_kritis" ? "" :     // stock filter is client-side post-fetch
    filter === "perlu_perhatian" ? "" : // same
    ""

  const { data: pageData, isLoading: pageLoading, isError: pageError, error: pageErr } =
    useProductsPage({
      page,
      limit: 20,
      q: debouncedQ,
      status: statusParam,
    })

  // Additional client-side filter for stok_kritis / perlu_perhatian
  const displayedProducts = useMemo(() => {
    if (!pageData) return []
    if (filter === "stok_kritis") return pageData.products.filter((p) => p.isStockLow)
    if (filter === "perlu_perhatian") return pageData.products.filter((p) => p.perluPerhatian)
    return pageData.products
  }, [pageData, filter])

  // KPI counts from the KPI data (full list) — fall back to page counts
  const counts = useMemo(() => {
    if (!kpiData) {
      if (!pageData) return { all: 0, perlu_perhatian: 0, stok_kritis: 0, unlist: 0 }
      return {
        all: pageData.total,
        perlu_perhatian: pageData.products.filter((p) => p.perluPerhatian).length,
        stok_kritis: pageData.products.filter((p) => p.isStockLow).length,
        unlist: pageData.products.filter((p) => p.status === "UNLIST").length,
      }
    }
    return {
      all: kpiData.products.length,
      perlu_perhatian: kpiData.products.filter((p) => p.perluPerhatian).length,
      stok_kritis: kpiData.products.filter((p) => p.isStockLow).length,
      unlist: kpiData.products.filter((p) => p.status === "UNLIST").length,
    }
  }, [kpiData, pageData])

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
          setToast({ message: `❌ Upload gagal: ${err.message}`, type: "error" })
        },
        onSettled: () => {
          setUploadingImageFor(null)
          setTimeout(() => setToast(null), 6000)
        },
      },
    )
  }

  // ── Empty index state: no products AND not loading AND no search query ──
  const indexEmpty =
    !pageLoading && !pageError && pageData && pageData.total === 0 && !debouncedQ

  return (
    <div className="flex min-h-screen -mx-4 -mt-4 md:-mx-6 md:-mt-6">
      <SidebarDrawerShell
        open={sidebarOpen}
        onOpen={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
      >
        <ProdukSidebar active={produkTab} onChange={setProdukTab} />
      </SidebarDrawerShell>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {produkTab === "katalog" ? (
          <KatalogTab />
        ) : produkTab === "kalkulator" ? (
          <KalkulasiTab />
        ) : produkTab === "filamen" ? (
          <FilamenTab />
        ) : (
          <>
            <GlassPageHeader title="Produk" subtitle="Pantau produk aktif dan HPP">
              <div className="flex items-center gap-2">
                {pageData?.fetchedAt && (
                  <span className="text-[10px] g-t5">
                    Data:{" "}
                    {new Date(pageData.fetchedAt).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncIndex.mutate()}
                  disabled={syncIndex.isPending}
                  className="h-8 text-xs"
                >
                  {syncIndex.isPending ? "Sinkronisasi..." : "Sinkronisasi Index"}
                </Button>
                <RefreshIndicator
                  lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
                  intervalMs={intervalMs}
                  onRefresh={handleRefresh}
                />
              </div>
            </GlassPageHeader>

            <div className="space-y-4 mt-4">
              {kpiData && <ProductsKpiBar kpi={kpiData.kpi} />}

              {/* Search input */}
              <div className="relative">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Cari produk..."
                  className="w-full max-w-sm h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Filter tabs */}
              <ProductFilter value={filter} onChange={setFilter} counts={counts} />

              {/* Empty index state */}
              {indexEmpty && (
                <div className="py-16 flex flex-col items-center gap-4 text-center">
                  <p className="text-slate-400 text-sm">
                    Index produk belum tersedia. Klik tombol di bawah untuk sinkronisasi pertama kali.
                  </p>
                  <Button
                    onClick={() => syncIndex.mutate()}
                    disabled={syncIndex.isPending}
                  >
                    {syncIndex.isPending ? "Sinkronisasi..." : "Sync Sekarang"}
                  </Button>
                </div>
              )}

              {/* Loading skeleton */}
              {pageLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-20 rounded-xl animate-pulse bg-white/5"
                    />
                  ))}
                </div>
              )}

              {/* Error state */}
              {pageError && (() => {
                const msg =
                  pageErr instanceof Error ? pageErr.message : "Unknown error"
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
                  </div>
                )
              })()}

              {/* Product list */}
              {!pageLoading && !pageError && !indexEmpty && (
                <ProductList
                  products={displayedProducts}
                  onUploadImage={handleUploadImage}
                  uploadingImageFor={uploadingImageFor}
                />
              )}

              {/* Pagination controls */}
              {pageData && pageData.totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || pageLoading}
                    className="h-8"
                  >
                    ← Sebelumnya
                  </Button>
                  <span className="text-xs text-slate-400">
                    Halaman {page} / {pageData.totalPages}
                    <span className="ml-2 opacity-60">({pageData.total} produk)</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(pageData.totalPages, p + 1))}
                    disabled={page >= pageData.totalPages || pageLoading}
                    className="h-8"
                  >
                    Berikutnya →
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

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
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | head -60
```

Fix any type errors. The most likely issue is the `useCallback`/`useEffect`/`useRef` import — make sure the import line is:
```typescript
import { useMemo, useState, Suspense, useCallback, useEffect, useRef } from "react"
```

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/produk/page.tsx
git commit -m "feat: replace produk tab with paginated product index UI"
```

---

### Task 7: Final TypeScript Verification

- [ ] **Step 1: Run full TypeScript check**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1
```

Expected: No errors or only pre-existing warnings.

- [ ] **Step 2: If there are errors in service.ts around Prisma `mode: "insensitive"`**

Replace the `where` construction in `getProductsPage` in `lib/products/service.ts`:

```typescript
// Replace explicit type annotation
const where: import("@prisma/client").Prisma.ShopeeProductIndexWhereInput = {}
```

With:
```typescript
// Use inferred type from Prisma's findMany parameter
type WhereInput = NonNullable<Parameters<typeof prisma.shopeeProductIndex.findMany>[0]>["where"]
const where: WhereInput = {}
```

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: resolve TypeScript errors in paginated product index"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| `ShopeeProductIndex` Prisma model | Task 1 |
| `npx prisma migrate dev` | Task 1, Step 3 |
| `syncProductIndex()` — upsert + delete stale | Task 3, Step 1 |
| `getProductsPage()` — paginated, q, status filters | Task 3, Step 2 |
| Keep `getProducts()` as-is | Not touched |
| `GET /api/products` — backward compat | Not touched |
| `GET /api/products/page` | Task 4, Step 1 |
| `POST /api/products/sync-index` | Task 4, Step 2 |
| `useProductsPage` hook | Task 5, Step 2 |
| `useSyncProductIndex` hook | Task 5, Step 2 |
| `ProductsPageResult` type | Task 2 |
| Search input (debounced 400ms) | Task 6, Step 2 |
| Filter tabs | Task 6, Step 2 |
| Pagination controls | Task 6, Step 2 |
| "Sync dulu" empty state | Task 6, Step 2 |
| Loading skeleton | Task 6, Step 2 |
| HPP redaction for non-owner | Task 4, Step 1 |
| KPI bar kept (from `useProducts`) | Task 6, Step 2 |

No gaps found.

**Type consistency check:**
- `ProductsPageResult` defined in Task 2, used in Task 3 (return type of `getProductsPage`), Task 4 (API response), and Task 5 (hook return type) — consistent.
- `ProductsPageOpts` in hook (Task 5) matches `GetProductsPageOpts` in service (Task 3) — the hook passes `page`, `limit`, `q`, `status` which are all defined.
- `syncProductIndex()` returns `{ synced: number, deleted: number }` — used in Task 4, Step 2 `.then(({ synced, deleted })` — consistent.
- `invalidateProductsCache()` — already exported from `service.ts` (line 31), imported in Task 4, Step 2 — consistent.
