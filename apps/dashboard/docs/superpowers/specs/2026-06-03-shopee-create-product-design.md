# Shopee Create Product Design

## Goal

Dari halaman katalog (KatalogCard expanded), operator bisa membuat produk baru di Shopee langsung dari dashboard — tanpa buka Shopee Seller Center — menggunakan wizard 5-step dengan data pre-fill dari katalog dan kalkulasi. Setelah berhasil, ditampilkan link untuk edit/lengkapi product di Shopee Seller Center.

## Architecture

Wizard dibuka dari tombol baru "Buat di Shopee" di `ShopeeLinksSection`. Wizard berjalan sebagai modal fullscreen. Data dikirim ke route baru `POST /api/shopee/products` yang memanggil Shopee `add_item` lalu menyimpan `item_id` ke `shopeeLinks` katalog (via `addShopeeLink` yang sudah ada).

Backend menambahkan empat proxy routes: categories, attributes, logistics, dan create produk. Semua Shopee API signing menggunakan helpers yang sudah ada di `lib/shopee/media.ts`.

**Catatan penting:** Shopee `add_item` hanya menerima **leaf category** (has_children: false). CategoryPicker hanya mengizinkan pemilihan leaf category. Parent category bisa diklik untuk drill-down tapi tidak bisa dipilih sebagai kategori final.

## Tech Stack

Next.js App Router (API routes), React (useState, wizard state), lucide-react, existing Shopee auth helpers (`lib/shopee/media.ts`), Prisma (melalui existing `addShopeeLink` service).

---

## File Structure

| File | Action | Keterangan |
|---|---|---|
| `lib/shopee/create-product.ts` | CREATE | Helpers: `shopeeAddItem`, `shopeeGetCategories`, `shopeeGetAttributes`, `shopeeGetLogistics` |
| `lib/shopee/types.ts` | MODIFY | Tambah types: `ShopeeCategory`, `ShopeeCategoryAttribute`, `ShopeeLogistic`, `ShopeeAddItemPayload`, `ShopeeAddItemResponse` |
| `app/api/shopee/categories/route.ts` | CREATE | `GET ?parent_category_id=0` — proxy ke Shopee get_category |
| `app/api/shopee/attributes/route.ts` | CREATE | `GET ?category_id=xxx` — proxy ke Shopee get_attributes |
| `app/api/shopee/logistics/route.ts` | CREATE | `GET` — proxy ke Shopee get_channel_list |
| `app/api/shopee/products/route.ts` | CREATE | `POST` — add_item + save item_id ke shopeeLinks |
| `lib/hooks/use-shopee-create.ts` | CREATE | React Query hooks: `useShopeeCategories`, `useShopeeAttributes`, `useShopeeLogistics`, `useCreateShopeeProduct` |
| `components/katalog/shopee-create/CategoryPicker.tsx` | CREATE | Drill-down category browser, hanya leaf yang bisa dipilih |
| `components/katalog/shopee-create/AttributeFields.tsx` | CREATE | Dynamic form fields per-attribute (text, dropdown, multi-select) |
| `components/katalog/shopee-create/ShopeeCreateWizard.tsx` | CREATE | Main wizard container + step state |
| `components/katalog/shopee-create/StepInfo.tsx` | CREATE | Step 1: nama, kategori (leaf only), attributes, kondisi, deskripsi |
| `components/katalog/shopee-create/StepMedia.tsx` | CREATE | Step 2: upload/pilih gambar |
| `components/katalog/shopee-create/StepPricing.tsx` | CREATE | Step 3: harga, stok (jika tidak ada variasi) |
| `components/katalog/shopee-create/StepShipping.tsx` | CREATE | Step 4: berat, dimensi, jasa kirim |
| `components/katalog/shopee-create/StepVariants.tsx` | CREATE | Step 5 (opsional): tier variation + harga & stok per model |
| `components/katalog/ShopeeLinksSection.tsx` | MODIFY | Tambah tombol "Buat di Shopee" yang membuka `ShopeeCreateWizard` |

---

## Backend

### `lib/shopee/create-product.ts`

Empat fungsi menggunakan pattern yang sama dengan `uploadImageToShopee` di `lib/shopee/media.ts`:

**`shopeeGetCategories(parentCategoryId: number): Promise<ShopeeCategory[]>`**
- Calls `GET /api/v2/product/get_category` dengan `{ language: "id", parent_category_id }`
- Returns array kategori dengan `category_id`, `category_name`, `has_children`

**`shopeeGetAttributes(categoryId: number): Promise<ShopeeCategoryAttribute[]>`**
- Calls `GET /api/v2/product/get_attributes` dengan `{ language: "id", category_id }`
- Returns array attribute dengan `attribute_id`, `attribute_name`, `is_mandatory`, `input_type` (`TEXT_FILED` | `DROP_DOWN` | `MULTIPLE_SELECT`), `attribute_value_list` (options untuk dropdown/multiselect)

**`shopeeGetLogistics(): Promise<ShopeeLogistic[]>`**
- Calls `GET /api/v2/logistics/get_channel_list`
- Returns array `{ logistic_id, logistic_name, enabled }`

**`shopeeAddItem(payload: ShopeeAddItemPayload): Promise<{ item_id: number }>`**
- Calls `POST /api/v2/product/add_item` dengan JSON body
- Returns `item_id` dari Shopee response

### New Types (`lib/shopee/types.ts`)

```ts
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

export interface ShopeeLogistic {
  logistic_id: number
  logistic_name: string
  enabled: boolean
}

export interface ShopeeAddItemPayload {
  item_name: string
  description: string
  original_price?: number              // tidak ada jika pakai model/variasi
  category_id: number
  image: { image_id_list: string[] }
  weight: number
  condition: "NEW" | "USED"
  item_status: "UNLIST"                // selalu UNLIST saat create (draft)
  logistic_info: Array<{
    logistic_id: number
    enabled: boolean
    is_free: boolean
  }>
  stock_info_v2?: {                    // tidak ada jika pakai model/variasi
    seller_stock: [{ stock: number }]
  }
  package_length?: number
  package_width?: number
  package_height?: number
  attribute_list?: Array<{
    attribute_id: number
    attribute_value_list: Array<{
      value_id?: number               // untuk dropdown/multiselect
      original_value_name?: string    // untuk text input
    }>
  }>
  tier_variation?: Array<{            // hanya jika ada variasi
    name: string
    option_list: Array<{ option: string }>
  }>
  model?: Array<{                     // hanya jika ada variasi
    tier_index: number[]
    original_price: number
    stock_info_v2: { seller_stock: [{ stock: number }] }
  }>
}
```

### `app/api/shopee/categories/route.ts`

```
GET /api/shopee/categories?parent_category_id=0
```
- Auth check (session)
- Proxy ke `shopeeGetCategories(parentCategoryId)`
- Returns `ShopeeCategory[]`

### `app/api/shopee/attributes/route.ts`

```
GET /api/shopee/attributes?category_id=xxx
```
- Auth check
- Proxy ke `shopeeGetAttributes(categoryId)`
- Returns `ShopeeCategoryAttribute[]`

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
    value_id?: number           // untuk dropdown/multiselect
    value_text?: string         // untuk text input
  }>
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
2. Build `ShopeeAddItemPayload` dari input (termasuk `attribute_list`)
3. Call `shopeeAddItem(payload)` → dapat `item_id`
4. Call `addShopeeLink(katalogId, String(item_id), null, ...)` — existing service
5. Return `{ item_id, shopeeEditUrl: "https://seller.shopee.co.id/portal/product/edit/{item_id}" }`

---

## Frontend

### Wizard State (`ShopeeCreateWizard.tsx`)

```ts
{
  step: 1 | 2 | 3 | 4 | 5
  // Step 1
  itemName: string              // pre-fill: katalog.nama
  description: string           // pre-fill: katalog.deskripsi ?? ""
  categoryId: number | null
  categoryPath: string[]        // breadcrumb display
  condition: "NEW" | "USED"     // default: "NEW"
  attributeValues: Record<number, {   // key = attribute_id
    value_id?: number
    value_text?: string
  }>
  // Step 2
  images: UploadedImage[]       // { imageId, imageUrl } — dari lib/shopee/media.ts
  // Step 3
  price: number                 // pre-fill: katalog.shopeeA ?? 0
  stock: number                 // default: 1
  // Step 4
  weight: number
  packageLength: number
  packageWidth: number
  packageHeight: number
  selectedLogistics: number[]   // logistic_id[]
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
- `images` ← jika `katalog.imageUrl` ada, upload ke Shopee media space saat step 2 dibuka

### `CategoryPicker.tsx`

- Mulai dengan `useShopeeCategories(0)` — root categories
- List categories: klik parent (has_children=true) → drill-down ke children
- Breadcrumb di atas untuk navigasi balik
- **Hanya leaf (has_children=false) yang bisa dipilih** — parent tidak bisa dijadikan kategori final
- Saat leaf dipilih → trigger `useShopeeAttributes(categoryId)` → render `AttributeFields`

### `AttributeFields.tsx`

Render dynamic form per attribute berdasarkan `input_type`:
- `TEXT_FILED` → `<input type="text">`
- `DROP_DOWN` → `<select>` dengan options dari `attribute_value_list`
- `MULTIPLE_SELECT` / `COMBO_BOX` → multi-select checkboxes
- Mandatory fields ditandai dengan `*` merah
- Nilai disimpan ke `attributeValues[attribute_id]` di wizard state

### `StepInfo.tsx` (Step 1)

Layout:
1. Field nama produk
2. CategoryPicker (drill-down)
3. Setelah leaf dipilih: `AttributeFields` muncul di bawah
4. Kondisi (NEW/USED toggle)
5. Deskripsi textarea (opsional)

### `StepMedia.tsx` (Step 2)

- Grid gambar (maks 9)
- Auto-import `katalog.imageUrl` saat step dibuka (upload ke Shopee, tambah ke array)
- Upload baru via `<input type="file" accept="image/*">` → `uploadImageToShopee()` (existing)
- Tombol hapus per gambar

### Step Navigation

- "Lanjut" → validate required fields sebelum advance
- Step 3 (Harga): field harga & stok di-disable jika `variantsEnabled = true`
- Step 4 ada toggle "Aktifkan Variasi" → jika aktif, step 5 unlock
- Step terakhir aktif: tombol "Buat Produk di Shopee" → submit

### Success State

Setelah `useCreateShopeeProduct` berhasil:
- Wizard tutup
- `ShopeeLinksSection` refresh (React Query invalidate)
- Banner sukses: `"Produk berhasil dibuat! item_id: xxx"` + link `seller.shopee.co.id/portal/product/edit/{item_id}`

---

## Validasi per Step

| Step | Required |
|---|---|
| 1 — Info | itemName (non-empty), categoryId (leaf, non-null), semua mandatory attributes terisi |
| 2 — Media | images.length ≥ 1 |
| 3 — Harga | price > 0, stock > 0 (skip jika variantsEnabled) |
| 4 — Kirim | weight > 0, selectedLogistics.length ≥ 1 |
| 5 — Variasi | tierVariation.options ≥ 2, semua model price > 0 dan stock > 0 |

---

## Out of Scope

- Multiple tier variations (lebih dari 1 dimensi) — hanya 1 tier di MVP
- Gambar per variasi (variation image)
- Pre-fill kategori dari existing Shopee products
- Draft saving ke local DB sebelum submit ke Shopee
