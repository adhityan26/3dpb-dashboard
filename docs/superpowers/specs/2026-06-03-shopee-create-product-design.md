# Shopee Create Product Design

## Goal

Dari halaman katalog (KatalogCard expanded), operator bisa membuat produk baru di Shopee langsung dari dashboard — tanpa buka Shopee Seller Center — menggunakan wizard 4-step dengan data pre-fill dari katalog dan kalkulasi. Setelah berhasil, ditampilkan link untuk melengkapi product di Shopee Seller Center.

## Architecture

Wizard dibuka dari tombol baru "Buat di Shopee" di `ShopeeLinksSection`. Wizard berjalan sebagai modal fullscreen. Data dikirim ke route baru `POST /api/shopee/products` yang memanggil Shopee `add_item` lalu menyimpan `item_id` ke `shopeeLinks` katalog (via `addShopeeLink` yang sudah ada).

Backend menambahkan tiga proxy routes untuk browsing kategori, logistik, dan create produk. Semua Shopee API signing menggunakan helpers yang sudah ada di `lib/shopee/media.ts`.

## Tech Stack

Next.js App Router (API routes), React (useState, wizard state), lucide-react, existing Shopee auth helpers (`lib/shopee/media.ts`), Prisma (melalui existing `addShopeeLink` service).

---

## File Structure

| File | Action | Keterangan |
|---|---|---|
| `lib/shopee/create-product.ts` | CREATE | Helpers: `shopeeAddItem`, `shopeeGetCategories`, `shopeeGetLogistics` |
| `lib/shopee/types.ts` | MODIFY | Tambah types: `ShopeeCategory`, `ShopeeLogistic`, `ShopeeAddItemPayload`, `ShopeeAddItemResponse` |
| `app/api/shopee/categories/route.ts` | CREATE | `GET ?parent_category_id=0` — proxy ke Shopee get_category |
| `app/api/shopee/logistics/route.ts` | CREATE | `GET` — proxy ke Shopee get_channel_list |
| `app/api/shopee/products/route.ts` | CREATE | `POST` — add_item + save item_id ke shopeeLinks |
| `lib/hooks/use-shopee-create.ts` | CREATE | React Query hooks: `useShopeeCategories`, `useShopeeLogistics`, `useCreateShopeeProduct` |
| `components/katalog/shopee-create/CategoryPicker.tsx` | CREATE | Drill-down category browser |
| `components/katalog/shopee-create/ShopeeCreateWizard.tsx` | CREATE | Main wizard container + step state |
| `components/katalog/shopee-create/StepInfo.tsx` | CREATE | Step 1: nama, kategori, kondisi, deskripsi |
| `components/katalog/shopee-create/StepMedia.tsx` | CREATE | Step 2: upload/pilih gambar |
| `components/katalog/shopee-create/StepPricing.tsx` | CREATE | Step 3: harga, stok (jika tidak ada variasi) |
| `components/katalog/shopee-create/StepShipping.tsx` | CREATE | Step 4: berat, dimensi, jasa kirim |
| `components/katalog/shopee-create/StepVariants.tsx` | CREATE | Step 5 (opsional): tier variation + harga & stok per model |
| `components/katalog/ShopeeLinksSection.tsx` | MODIFY | Tambah tombol "Buat di Shopee" yang membuka `ShopeeCreateWizard` |

---

## Backend

### `lib/shopee/create-product.ts`

Tiga fungsi menggunakan pattern yang sama dengan `uploadImageToShopee` di `lib/shopee/media.ts`:

**`shopeeGetCategories(parentCategoryId: number): Promise<ShopeeCategory[]>`**
- Calls `GET /api/v2/product/get_category` dengan `{ language: "id", parent_category_id }`
- Returns array kategori dengan `category_id`, `category_name`, `has_children`

**`shopeeGetLogistics(): Promise<ShopeeLogistic[]>`**
- Calls `GET /api/v2/logistics/get_channel_list`
- Returns array `{ logistic_id, logistic_name, enabled }`

**`shopeeAddItem(payload: ShopeeAddItemPayload): Promise<{ item_id: number }>`**
- Calls `POST /api/v2/product/add_item` dengan JSON body
- Returns `item_id` dari Shopee response

### `app/api/shopee/categories/route.ts`

```
GET /api/shopee/categories?parent_category_id=0
```
- Auth check (session)
- Proxy ke `shopeeGetCategories(parentCategoryId)`
- Returns `ShopeeCategory[]`

### `app/api/shopee/logistics/route.ts`

```
GET /api/shopee/logistics
```
- Auth check
- Proxy ke `shopeeGetLogistics()`
- Returns `ShopeeLogistic[]`

### `app/api/shopee/products/route.ts`

```
POST /api/shopee/products
Body: ShopeeCreateProductInput
```

`ShopeeCreateProductInput`:
```ts
{
  katalogId: string          // untuk link ke shopeeLinks
  itemName: string
  description: string
  categoryId: number
  condition: "NEW" | "USED"
  imageIds: string[]         // sudah di-upload ke Shopee media space
  weight: number             // kg
  packageLength?: number     // cm
  packageWidth?: number
  packageHeight?: number
  logistics: Array<{ logistic_id: number; enabled: boolean; is_free: boolean }>
  // Tanpa variasi:
  price?: number
  stock?: number
  // Dengan variasi:
  tierVariation?: { name: string; options: string[] }
  models?: Array<{ optionIndex: number; price: number; stock: number }>
}
```

Flow:
1. Validate required fields
2. Call `shopeeAddItem(payload)` → dapat `item_id`
3. Call `addShopeeLink(katalogId, String(item_id), null, ...)` — existing service function
4. Return `{ item_id, shopeeEditUrl: "https://seller.shopee.co.id/portal/product/edit/{item_id}" }`

---

## Frontend

### Wizard State (`ShopeeCreateWizard.tsx`)

State yang di-manage wizard:
```ts
{
  step: 1 | 2 | 3 | 4 | 5   // 5 = variants (opsional)
  // Step 1
  itemName: string            // pre-fill: katalog.nama
  description: string         // pre-fill: katalog.deskripsi ?? ""
  categoryId: number | null
  categoryPath: string[]      // breadcrumb: ["Hobi & Koleksi", "3D Print"]
  condition: "NEW" | "USED"   // default: NEW
  // Step 2
  images: UploadedImage[]     // UploadedImage = { imageId, imageUrl }
  // Step 3
  price: number               // pre-fill: katalog.shopeeA ?? 0
  stock: number               // default: 1
  // Step 4
  weight: number              // default: 0
  packageLength: number
  packageWidth: number
  packageHeight: number
  selectedLogistics: number[] // logistic_id[]
  // Step 5 (opsional)
  variantsEnabled: boolean
  tierVariation: { name: string; options: string[] }
  models: Array<{ optionIndex: number; price: number; stock: number }>
}
```

Pre-fill saat wizard dibuka:
- `itemName` ← `katalog.nama`
- `description` ← `katalog.deskripsi ?? ""`
- `price` ← `katalog.shopeeA ?? 0`
- `images` ← jika `katalog.imageUrl` ada, upload ke Shopee media space dulu saat step 2 dibuka, lalu masuk ke array

### `CategoryPicker.tsx`

- Mulai dengan `useShopeeCategories(0)` — root categories
- Tampilkan sebagai list. Kalau `has_children: true` → klik untuk drill-down (fetch children)
- Breadcrumb di atas untuk navigasi balik
- Leaf category (has_children: false) → bisa dipilih
- State: `path: number[]` (array of selected category_ids untuk breadcrumb)

### `StepMedia.tsx`

- Tampilkan grid gambar yang sudah di-upload (maks 9)
- Tombol "Upload gambar baru" → `<input type="file" accept="image/*">` → call `uploadImageToShopee` (existing) → tambah ke array
- Gambar dari katalog otomatis di-upload saat step dibuka (jika belum)
- Reorder dengan drag (opsional, skip untuk MVP — cukup hapus dan re-upload)

### Step Navigation

- "Lanjut" button di tiap step: validate required fields sebelum lanjut
- Step 3 (Harga): jika `variantsEnabled = true`, field harga & stok di-disable dan user diarahkan ke Step 5
- Step 4 ada toggle "Aktifkan Variasi" → jika diaktifkan, `variantsEnabled = true`, step 5 unlock
- Step terakhir: tombol "Buat Produk di Shopee" → submit

### Success State

Setelah `useCreateShopeeProduct` berhasil:
- Tutup wizard
- `ShopeeLinksSection` refresh (React Query invalidate)
- Tampilkan banner sukses dengan link: `https://seller.shopee.co.id/portal/product/edit/{item_id}`

---

## Validasi per Step

| Step | Required |
|---|---|
| 1 | itemName (non-empty), categoryId (non-null) |
| 2 | images.length >= 1 |
| 3 | price > 0 dan stock > 0 (kecuali variantsEnabled) |
| 4 | weight > 0, selectedLogistics.length >= 1 |
| 5 | tierVariation.name non-empty, tierVariation.options.length >= 2, semua models punya price > 0 dan stock > 0 |

---

## Out of Scope

- Category attributes (dynamic fields per category) — user lengkapi di Shopee
- Multiple tier variations (lebih dari 1 dimensi variasi) — hanya 1 tier untuk MVP
- Gambar per variasi (variation image)
- Pre-fill kategori dari produk Shopee lain yang sudah ada
- Draft saving ke local DB sebelum submit ke Shopee
