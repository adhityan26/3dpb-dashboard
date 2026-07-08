# Katalog → Shopee Variant Link

**Goal:** Saat menambah link Shopee di katalog, user bisa pilih variant spesifik (shopeeModelId) atau link ke seluruh produk.

**Architecture:** Tambah satu API endpoint untuk fetch variant list on-demand, update UI `ShopeeLinksSection` dengan inline variant picker setelah produk dipilih. Tidak ada perubahan schema — `shopeeModelId` sudah nullable di `ProdukInternalShopeeLink`.

**Tech Stack:** Next.js App Router, React, Prisma, Shopee API (`getModelList`)

---

## Data Flow

1. User klik produk di search results
2. Jika `hasVariants: false` → langsung `addLink({ shopeeItemId })` (existing)
3. Jika `hasVariants: true` → fetch `GET /api/products/[itemId]/variants` → tampil picker
4. User pilih "Seluruh produk" → `addLink({ shopeeItemId, shopeeModelId: null })`
5. User pilih variant → `addLink({ shopeeItemId, shopeeModelId: "123456" })`

## API

`GET /api/products/[itemId]/variants`
- Auth required
- Calls `getModelList(itemId)` from Shopee API
- Returns `{ variants: [{ modelId: string, name: string, price: number, stock: number }] }`

## Hook

`useProductVariants(itemId: string | null)` — enabled only when itemId is set, staleTime 5 min.

## UI Changes (`ShopeeLinksSection.tsx`)

- New state: `pendingProductId: string | null` — product selected but variant not yet chosen
- When user clicks a product with `hasVariants: true`: set `pendingProductId`, fetch variants
- Inline expand below that product row showing:
  - "🔗 Seluruh produk" option
  - Each variant: name · price · stock
- Clicking any option calls `handleAdd(shopeeItemId, modelId | null)` and clears `pendingProductId`
- Products without variants: existing direct-link behavior unchanged

## `addLink` mutation update

`useAddShopeeLink` hook: add optional `shopeeModelId?: string` to payload.
API route `POST /api/katalog/[id]/shopee-links`: pass `shopeeModelId` to service.
Service `addShopeeLink`: already passes through to Prisma (verify).

## Display

Existing link rows already show `shopeeModelId` if set — no change needed there.
