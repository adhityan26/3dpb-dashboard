# Katalog → Shopee Variant Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saat menambah Shopee link di katalog, user bisa pilih variant spesifik atau link ke seluruh produk.

**Architecture:** Tambah `GET /api/products/[itemId]/variants` yang call Shopee `getModelList`, expose `useProductVariants` hook, update `useAddShopeeLink` untuk pass `shopeeModelId`, update API route POST shopee-links, update `ShopeeLinksSection` UI dengan inline variant picker.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query, TypeScript, Shopee Partner API

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `app/api/products/[itemId]/variants/route.ts` | Create | GET endpoint → call getModelList → return variant list |
| `lib/hooks/use-products.ts` | Modify | Add `useProductVariants` hook |
| `lib/hooks/use-katalog.ts` | Modify | Add `shopeeModelId` to `useAddShopeeLink` payload |
| `app/api/katalog/[id]/shopee-links/route.ts` | Modify | Pass `shopeeModelId` from body to service |
| `components/katalog/ShopeeLinksSection.tsx` | Modify | Inline variant picker flow |

---

### Task 1: API endpoint GET /api/products/[itemId]/variants

**Files:**
- Create: `app/api/products/[itemId]/variants/route.ts`

Context: `getModelList(itemId)` is already in `lib/shopee/products.ts`. It returns `{ model: [...] }` where each model has `model_id`, `model_name`, `price_info[0].current_price`, `stock_info_v2.summary_info.total_available_stock`.

- [ ] **Step 1: Create the route file**

```typescript
import { auth } from "@/lib/auth"
import { getModelList } from "@/lib/shopee/products"
import { NextResponse } from "next/server"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { itemId } = await params

  try {
    const res = await getModelList(Number(itemId))
    const variants = (res.model ?? []).map((m) => ({
      modelId: String(m.model_id),
      name: m.model_name ?? `Model ${m.model_id}`,
      price: m.price_info?.[0]?.current_price ?? 0,
      stock: m.stock_info_v2?.summary_info?.total_available_stock ?? 0,
    }))
    return NextResponse.json({ variants })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
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
git add app/api/products/[itemId]/variants/route.ts
git commit -m "feat(api): GET /api/products/[itemId]/variants"
```

---

### Task 2: useProductVariants hook

**Files:**
- Modify: `lib/hooks/use-products.ts`

Context: Add after `useSyncProductIndex`. TanStack Query hook, enabled only when `itemId` is non-null.

- [ ] **Step 1: Add the hook**

At the end of `lib/hooks/use-products.ts`, add:

```typescript
export interface ProductVariant {
  modelId: string
  name: string
  price: number
  stock: number
}

export function useProductVariants(itemId: string | null) {
  return useQuery({
    queryKey: ["product-variants", itemId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${itemId}/variants`)
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { variants: ProductVariant[] }
      return data.variants
    },
    enabled: itemId !== null,
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-products.ts
git commit -m "feat(hook): useProductVariants"
```

---

### Task 3: Pass shopeeModelId through hook + API route

**Files:**
- Modify: `lib/hooks/use-katalog.ts` (line ~55-66)
- Modify: `app/api/katalog/[id]/shopee-links/route.ts`

Context: Service `addShopeeLink(produkInternalId, shopeeItemId, shopeeModelId?)` already accepts `shopeeModelId` — only hook and API route need updating.

- [ ] **Step 1: Update useAddShopeeLink hook**

In `lib/hooks/use-katalog.ts`, replace the `useAddShopeeLink` function:

```typescript
export function useAddShopeeLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ katalogId, shopeeItemId, shopeeModelId }: {
      katalogId: string
      shopeeItemId: string
      shopeeModelId?: string | null
    }) =>
      apiFetch<void>(`/api/katalog/${katalogId}/shopee-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopeeItemId, shopeeModelId: shopeeModelId ?? null }),
      }),
    onSuccess: (_, { katalogId }) => {
      qc.invalidateQueries({ queryKey: KATALOG_KEY })
      qc.invalidateQueries({ queryKey: [...KATALOG_KEY, katalogId] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
```

- [ ] **Step 2: Update API route**

In `app/api/katalog/[id]/shopee-links/route.ts`, read the full current file first then update the POST handler body to pass `shopeeModelId`:

```typescript
// Replace the line:
//   await addShopeeLink(id, body.shopeeItemId.trim())
// with:
await addShopeeLink(id, body.shopeeItemId.trim(), body.shopeeModelId ?? null)
```

Read the file first to see exact line, then make the targeted edit.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 4: Commit**

```bash
git add lib/hooks/use-katalog.ts "app/api/katalog/[id]/shopee-links/route.ts"
git commit -m "feat: pass shopeeModelId through hook and API route"
```

---

### Task 4: UI — inline variant picker in ShopeeLinksSection

**Files:**
- Modify: `components/katalog/ShopeeLinksSection.tsx`

Context: Full file is ~233 lines. Key areas:
- Line 7: `import { useProducts } from "@/lib/hooks/use-products"` — add `useProductVariants, ProductVariant`
- Line 30-58: state + handlers — add `pendingProductId` state
- Line 55-58: `handleAdd` — update signature to accept `shopeeModelId`
- Line 192-230: search results UI — add variant picker expansion

**Important:** `allProducts` comes from `useProducts()` which still makes a full Shopee API call. The `p.hasVariants` field exists on `ProductSummary`. Use it to decide whether to show picker.

- [ ] **Step 1: Read the full current file**

```bash
cat -n components/katalog/ShopeeLinksSection.tsx
```

- [ ] **Step 2: Update imports**

Replace:
```typescript
import { useProducts } from "@/lib/hooks/use-products"
```
With:
```typescript
import { useProducts, useProductVariants, type ProductVariant } from "@/lib/hooks/use-products"
```

- [ ] **Step 3: Add pendingProductId state + update handleAdd**

After the existing state declarations (after line ~33), add:
```typescript
const [pendingProductId, setPendingProductId] = useState<string | null>(null)
```

Replace `handleAdd`:
```typescript
async function handleAdd(shopeeItemId: string, shopeeModelId?: string | null) {
  if (linkedIds.has(shopeeItemId) && shopeeModelId == null) return
  await addLink.mutateAsync({ katalogId: produkId, shopeeItemId, shopeeModelId })
  setSearch("")
  setPendingProductId(null)
}
```

- [ ] **Step 4: Add useProductVariants hook call**

After the `searchResults` useMemo (line ~53), add:
```typescript
const { data: pendingVariants, isLoading: variantsLoading } = useProductVariants(pendingProductId)
```

- [ ] **Step 5: Update search result click handler**

Replace the search result `onClick` in the JSX from:
```typescript
onClick={() => !linked && handleAdd(p.productId)}
```
With:
```typescript
onClick={() => {
  if (linked) return
  if (p.hasVariants) {
    setPendingProductId(pendingProductId === p.productId ? null : p.productId)
  } else {
    handleAdd(p.productId)
  }
}}
```

- [ ] **Step 6: Add variant picker expansion in search results**

After the product row `</div>` (the one with `onClick`), add inline expansion. The full updated search results block should look like:

```tsx
{searchResults.map(p => {
  const linked = linkedIds.has(p.productId)
  const isPending = pendingProductId === p.productId
  return (
    <div key={p.productId}>
      <div
        className="flex items-center gap-2 px-2.5 py-2 rounded-[8px] transition-all"
        style={{
          background: linked ? "rgba(99,102,241,0.1)" : isPending ? "rgba(99,102,241,0.08)" : "var(--g-card)",
          border: `1px solid ${linked || isPending ? "rgba(99,102,241,0.25)" : "var(--g-card-border)"}`,
          cursor: linked ? "default" : "pointer",
        }}
        onClick={() => {
          if (linked) return
          if (p.hasVariants) {
            setPendingProductId(isPending ? null : p.productId)
          } else {
            handleAdd(p.productId)
          }
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium truncate g-t1">{p.name}</div>
          <div className="text-[9px] g-t4">
            {p.productId}
            {p.hasVariants && <span className="ml-1 g-accent">· punya variant</span>}
          </div>
        </div>
        {linked
          ? <span className="text-[10px]" style={{ color: "#a5b4fc" }}>✓</span>
          : p.hasVariants
          ? <span className="text-[10px]" style={{ color: "rgba(99,102,241,0.6)" }}>{isPending ? "▲" : "▼"}</span>
          : <span className="text-[10px]" style={{ color: "rgba(99,102,241,0.6)" }}>+ Link</span>
        }
      </div>

      {/* Variant picker */}
      {isPending && (
        <div className="ml-2 mt-1 mb-1 rounded-[8px] overflow-hidden"
             style={{ border: "1px solid rgba(99,102,241,0.2)", background: "rgba(0,0,0,0.15)" }}>
          {variantsLoading && (
            <div className="text-[10px] g-t5 px-3 py-2">Memuat variant...</div>
          )}
          {!variantsLoading && (
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
              {/* Option: link ke seluruh produk */}
              <div
                className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-all hover:bg-white/5"
                onClick={(e) => { e.stopPropagation(); handleAdd(p.productId, null) }}
              >
                <span className="text-[10px]">🔗</span>
                <span className="text-[10px] g-t2">Seluruh produk</span>
              </div>
              {/* Each variant */}
              {(pendingVariants ?? []).map((v: ProductVariant) => (
                <div
                  key={v.modelId}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-all hover:bg-white/5"
                  onClick={(e) => { e.stopPropagation(); handleAdd(p.productId, v.modelId) }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium truncate g-t1">{v.name}</div>
                    <div className="text-[9px] g-t4">
                      Rp {v.price.toLocaleString("id-ID")} · stok {v.stock}
                    </div>
                  </div>
                  <span className="text-[10px]" style={{ color: "rgba(99,102,241,0.6)" }}>+ Link</span>
                </div>
              ))}
              {!variantsLoading && (pendingVariants ?? []).length === 0 && (
                <div className="text-[10px] g-t5 px-3 py-2">Tidak ada variant ditemukan.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})}
```

- [ ] **Step 7: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```
Expected: `TypeScript compilation completed`

- [ ] **Step 8: Commit**

```bash
git add components/katalog/ShopeeLinksSection.tsx
git commit -m "feat(ui): inline variant picker when linking katalog to Shopee"
```

---

### Task 5: Deploy

- [ ] **Step 1: Run deploy script**

```bash
./deploy.sh
```

Expected: container `shopee-dashboard` restarts, logs show `✓ Ready`

- [ ] **Step 2: Verify in browser**

1. Buka katalog → pilih produk internal → section "Link Shopee"
2. Klik "+ Link Shopee"
3. Cari produk Shopee yang punya variant
4. Klik produk → expand dengan pilihan variant
5. Klik salah satu variant → link tersimpan dengan `shopeeModelId` tampil di row
6. Cari produk tanpa variant → klik → langsung link tanpa picker
