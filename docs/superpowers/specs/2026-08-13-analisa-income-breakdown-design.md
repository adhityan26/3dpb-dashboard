# Analisa Income Breakdown — Design Spec

**Date:** 2026-08-13
**Scope:** `apps/dashboard` — halaman `/analisa`

## Problem

1. **Bug:** filter tanggal di halaman Analisa tidak berfungsi. `parseRange()` di
   `app/api/analytics/route.ts` hanya menerima string `"7d"` / `"30d"` dan
   mengabaikan `this_week`, `this_month`, dan custom range — apa pun yang
   dipilih di `DateRangeSelector` selalu jatuh ke default 7 hari.
2. **Fitur baru:** user butuh breakdown penghasilan riil — bukan cuma omzet
   dari `total_amount`, tapi apa yang buyer benar-benar bayar, harga di
   Shopee, biaya admin (komisi + service fee + transaction fee Shopee), dan
   berapa yang benar-benar diterima seller (escrow) — baik per produk maupun
   summary, dalam rentang waktu yang dipilih.

## Architecture

### 1. Fix filter tanggal

`app/api/analytics/route.ts` saat ini:
```ts
function parseRange(raw: string | null): AnalyticsRange {
  if (raw === "30d") return "30d"
  return "7d"
}
```

Diganti untuk menerima seluruh `FlexRange` (`lib/dateRange.ts`), termasuk
custom range. Kontrak query param baru:
- `?range=this_week` / `?range=this_month` / `?range=7d` / `?range=30d`
- `?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`

`lib/hooks/use-analytics.ts` (client hook yang manggil endpoint ini) perlu
disesuaikan supaya mengirim query param yang benar sesuai `FlexRange` yang
dipilih user — cek isi hook ini saat implementasi karena mungkin saat ini
cuma kirim `range` sebagai string literal.

Invalid/missing param tetap fallback ke `"7d"` (perilaku lama untuk default).

### 2. Skema database baru

`prisma/schema.prisma`:
```prisma
model OrderEscrow {
  orderSn             String   @id
  buyerPaymentAmount  Float
  escrowAmount        Float
  commissionFee       Float
  serviceFee          Float
  transactionFee      Float
  actualShippingFee   Float
  hasReturnFlag       Boolean  @default(false)
  orderCompleteTime   Int      // unix seconds, dari ShopeeOrderDetail.update_time saat status COMPLETED
  fetchedAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

- `orderSn` sebagai primary key — satu baris per order, di-upsert (bukan
  insert-only) supaya refund/dispute bisa menimpa data lama dengan key yang
  sama.
- `orderCompleteTime` dipakai untuk menentukan "window mutable" (lihat §4).
- `hasReturnFlag` dipakai UI untuk menandai order yang datanya pernah
  direvisi karena return/refund.

Field lain (fee breakdown per item, quantity, dsb.) TIDAK disimpan di tabel
ini — dihitung ulang saat baca dengan menggabungkan `OrderEscrow` (fee
level-order) dengan `item_list` dari `getOrdersInRange()` (data produk),
supaya tidak ada duplikasi data produk yang sudah di-fetch live.

Migration: `pnpm --filter shopee-dashboard prisma migrate dev --name add_order_escrow`.

### 3. Modul Shopee Returns API baru

`lib/shopee/returns.ts` (baru, mengikuti pola `lib/shopee/escrow.ts`):
```ts
export interface ShopeeReturnEntry {
  return_sn: string
  order_sn: string
  status: string // e.g. "REQUESTED" | "PROCESSING" | "ACCEPTED" | "JUDGING" | "CLOSED"
  refund_amount: number
}

export async function getReturnListForOrders(orderSns: string[]): Promise<ShopeeReturnEntry[]>
```

Panggil `/api/v2/returns/get_return_list` dengan filter `create_time_from` /
`create_time_to` yang mencakup window mutable order-order yang dicek (bukan
per order_sn satu-satu — API ini mendukung filter waktu, lebih efisien),
lalu hasilnya di-filter di sisi kita untuk `order_sn` yang match dengan
batch order yang sedang direfresh. **Implementer: cek dokumentasi resmi
Shopee Open API v2 Returns module untuk nama field/status pasti** — nama di
atas adalah asumsi berdasar konvensi Shopee API lain di project ini
(`escrow.ts`, `orders.ts`) dan perlu diverifikasi terhadap respons API
sungguhan sebelum dianggap final.

Status yang dianggap "sudah final, escrow kemungkinan berubah" (perlu
re-fetch escrow): status yang menunjukkan return SELESAI diproses (refund
approved/completed) — bukan `REQUESTED`/`PROCESSING` yang masih berjalan.
Implementer memverifikasi nilai status pasti dari dokumentasi resmi.

### 4. Service layer — `lib/analytics/income.ts` (baru)

Fungsi utama `syncAndGetEscrowForOrders(orders: ShopeeOrderDetail[]): Promise<Map<string, OrderEscrow>>`:

1. Filter `orders` yang `order_status === "COMPLETED"`.
2. **Tahap 1 — isi cache yang kosong:** dari order COMPLETED tadi, cari yang
   `orderSn`-nya belum ada di tabel `OrderEscrow` → panggil
   `getEscrowDetail()` satu per satu (existing function, sudah ada retry/error
   handling internal) → upsert ke DB.
3. **Tahap 2 — cek refund pada order dalam window mutable:** dari order
   COMPLETED yang *sudah* ada di cache, filter yang `orderCompleteTime` masih
   dalam **30 hari terakhir** dari waktu sekarang (konstanta
   `RETURN_MUTABLE_WINDOW_DAYS = 30`, ditaruh di file ini biar gampang
   di-tune) → panggil `getReturnListForOrders()` untuk batch order_sn
   tersebut → untuk `order_sn` yang match dengan return berstatus final →
   `getEscrowDetail()` ulang → upsert (overwrite) baris lama, set
   `hasReturnFlag = true`.
4. Return semua baris `OrderEscrow` (habis di-refresh) untuk `orderSn` yang
   diminta, sebagai `Map<orderSn, OrderEscrow>`.
5. Order yang **bukan** `COMPLETED` (masih diproses/dikirim/dibatalkan) tidak
   masuk map ini sama sekali — dianggap "belum final".

**Alokasi fee per produk** — fungsi `allocateFeePerProduct()`:
untuk tiap order yang punya entry di map escrow, hitung porsi tiap item
berdasarkan `(item.model_discounted_price * item.model_quantity_purchased) /
order.total_amount`, lalu kalikan porsi itu ke
`commissionFee + serviceFee + transactionFee` order tersebut → dapat
estimasi admin fee per item. Ini estimasi proporsional (Shopee tidak
mengekspos fee per-item asli), jelaskan ini di UI (lihat §6).

### 5. Perubahan `lib/analytics/service.ts` dan `lib/analytics/types.ts`

`AnalyticsData` (types.ts) ditambah field baru:
```ts
export interface IncomeBreakdownSummary {
  totalBuyerPayment: number
  totalShopeePrice: number   // = totalOmzet yang sudah ada
  totalAdminFee: number      // commission+service+transaction, order COMPLETED saja
  totalReceived: number      // escrowAmount
  completedOrderCount: number
  totalOrderCount: number    // untuk tampilkan coverage: "X dari Y order sudah final"
}

export interface ProductIncomeBreakdown {
  productName: string
  qty: number
  buyerPayment: number
  shopeePrice: number
  adminFee: number
  received: number
  hasReturn: boolean // true kalau minimal 1 order produk ini kena refund/dispute
}
```

`AnalyticsData` tambah field:
```ts
incomeSummary: IncomeBreakdownSummary
incomeByProduct: ProductIncomeBreakdown[] // semua produk dalam rentang, bukan cuma top 10
```

`getAnalytics()` di `service.ts` memanggil `syncAndGetEscrowForOrders(orders)`
setelah fetch `orders`, lalu agregasi ke dua struktur di atas sambil
mempertahankan loop agregasi produk yang sudah ada (untuk `topProducts`).
Order yang belum COMPLETED tetap dihitung ke `totalOmzet`/`topProducts`
seperti sekarang (tidak berubah), tapi tidak menyumbang ke
`incomeSummary`/`incomeByProduct` selain qty & shopeePrice-nya sendiri —
field `adminFee`/`received` untuk baris produk yang order-nya belum
COMPLETED ditampilkan sebagai `null` dan UI menampilkan "belum final".

Untuk itu ubah tipe:
```ts
adminFee: number | null
received: number | null
```

### 6. UI — `apps/dashboard/app/(dashboard)/analisa/page.tsx` + komponen baru

Komponen baru `components/analytics/IncomeBreakdownSection.tsx`, ditaruh di
bawah `TopProductsChart`/`ProfitCard` yang sudah ada:

- **Summary card** (baris angka, mirip `AnalyticsKpiBar`): Buyer Bayar,
  Harga Shopee, Biaya Admin, Diterima Bersih — plus baris kecil
  "X dari Y order sudah final (COMPLETED)" untuk coverage.
- **Tabel per produk**: kolom Produk, Qty, Buyer Bayar, Harga Shopee, Biaya
  Admin, Diterima, dengan badge kecil di baris yang `hasReturn=true` ("Ada
  refund") dan baris yang `adminFee=null` ditampilkan italic/abu-abu
  "Belum final" pada kolom Biaya Admin & Diterima.
- Footnote kecil di bawah tabel: "Biaya admin per produk adalah estimasi
  proporsional dari total biaya per order, karena Shopee tidak menyediakan
  rincian biaya per item."

### 7. Error handling

- `getEscrowDetail()` sudah `try/catch` dan return `null` di error (lihat
  existing `lib/shopee/escrow.ts`) — kalau gagal, order itu di-skip dari
  sinkronisasi (tidak upsert), akan dicoba lagi di load berikutnya.
- `getReturnListForOrders()` gagal (network/rate-limit) → tidak menghalangi
  render halaman; window mutable check itu best-effort, order yang gagal
  dicek tetap tampil pakai data escrow lama (tidak kena refund flag),
  dicoba lagi di load berikutnya.
- Kalau seluruh sinkronisasi escrow gagal total (mis. Shopee API down),
  halaman tetap render dengan `incomeSummary`/`incomeByProduct` kosong/nol
  dan pesan "Data biaya admin tidak tersedia saat ini" — tidak boleh bikin
  seluruh halaman Analisa error (bagian `daily`/`topProducts`/`kpi` yang
  sudah ada harus tetap jalan).

### 8. Testing

- `lib/analytics/income.test.ts`: unit test `allocateFeePerProduct()` (pure
  function, mudah ditest dengan fixture order) dan
  `syncAndGetEscrowForOrders()` dengan Prisma di-mock — assert: (a) order
  yang sudah di cache tidak dipanggil ulang escrow API kalau di luar window
  mutable, (b) order dalam window mutable dengan return status final
  memicu re-fetch & overwrite, (c) order non-COMPLETED tidak masuk map.
- `lib/shopee/returns.test.ts`: mock `shopeeRequest`, test parsing response
  ke `ShopeeReturnEntry[]`.
- `app/api/analytics/route.test.ts` (baru/extend kalau sudah ada): test
  `parseRange`/query parsing menerima `this_week`, `this_month`, dan
  `custom&from&to`, fallback ke `7d` untuk input invalid.
- Komponen `IncomeBreakdownSection`: snapshot/render test seperti komponen
  analytics lain di repo, cek baris "belum final" dan badge return muncul
  sesuai props.

## Out of scope

- Tidak ada UI untuk melihat detail return/dispute per order (cuma flag
  boolean) — kalau user butuh detail ini, jadi fitur terpisah.
- Tidak menyimpan riwayat perubahan escrow (cuma overwrite ke nilai
  terbaru) — tidak ada audit trail "sebelum vs sesudah refund".
- Backfill data escrow untuk order lama yang sudah `COMPLETED` sebelum
  fitur ini deploy TIDAK dilakukan otomatis — cache akan terisi organik
  begitu user membuka rentang tanggal yang mencakup order-order lama itu.
