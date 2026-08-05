# Pengiriman Massal (Shopee bulk print resi) — Design

## Problem

Tim harus atur pengiriman & cetak resi order Shopee satu-satu lewat Seller Center Shopee (buka tab lain, keluar dari dashboard internal). Shopee sendiri punya halaman "Pengiriman Massal": centang beberapa order Ready-to-Ship, atur metode kirim (pickup/drop-off ke counter), generate resi, lalu satu PDF gabungan siap print. Kita mau replikasi alur ini di dalam dashboard internal, supaya tim tidak perlu keluar aplikasi.

## Scope

- **Marketplace**: Shopee saja (Tokopedia tidak punya kode logistics/shipping sama sekali di dashboard saat ini — akan jadi effort terpisah kalau dibutuhkan nanti).
- **Metode kirim**: keduanya — pickup (dijemput kurir) dan drop-off ke counter/agen, dipilih user per batch.
- **Output**: PDF resi *asli* dari Shopee (bukan desain ulang) — untuk N order yang dipilih, hasilnya **satu PDF gabungan** (sesuai kapabilitas API `create_shipping_document`/`download_shipping_document` Shopee yang menerima array order dan mengembalikan satu dokumen gabungan).
- **Halaman**: baru & terpisah dari `/order`, di `/order/pengiriman` — mandiri (list order sendiri, bukan bergantung state seleksi dari halaman Order).

## Risiko yang belum divalidasi

Belum dipastikan apakah Shopee Open Platform app ini sudah punya scope akses **Logistics API** (`ship_order`, `create_shipping_document`, dst). App review yang sudah di-approve sebelumnya mencakup produk/order — logistics adalah scope terpisah yang mungkin perlu izin tambahan dari Shopee. **Task pertama implementasi harus memvalidasi ini** (panggil `get_shipping_parameter` untuk satu order nyata) sebelum lanjut membangun UI di atasnya. Kalau ternyata scope belum ada, sisa pekerjaan di plan ini di-pause sampai akses didapat.

## Architecture

### Backend — `lib/shopee/logistics.ts` (baru)

Reuse `shopeeRequest`/`signShopApi` dari `lib/shopee/client.ts` (auth & signing sudah ada, tidak perlu infra baru). Tiga fungsi:

1. **`getShippingParameter(orderSn: string)`** → wraps Shopee `logistics/get_shipping_parameter`. Return kurir/slot pickup yang tersedia (untuk pickup) atau daftar `branch_list` (untuk drop-off), per order.
2. **`shipOrder(orderSn: string, params: ShipOrderParams)`** → wraps `logistics/ship_order`. `params` berisi salah satu dari `{ pickup: { time_slot } }` atau `{ dropoff: { branch_id } }`. Return sukses/gagal + pesan error Shopee kalau gagal (mis. stok berubah, alamat tidak valid).
3. **`createShippingDocument(orderSnList: string[])`** → wraps `logistics/create_shipping_document` (Shopee memprosesnya sebagai job async) → polling `logistics/get_shipping_document_result` sampai status `READY` → **`downloadShippingDocument(orderSnList: string[])`** wraps `logistics/download_shipping_document`, return raw PDF bytes.

### API routes (baru)

- **`POST /api/shopee/logistics/ship`** — body: `{ orders: { orderSn: string, method: 'pickup' | 'dropoff', timeSlot?: string, branchId?: string }[] }`. Panggil `shipOrder` per order secara paralel (`Promise.allSettled` — satu gagal tidak menghentikan yang lain). Return `{ results: { orderSn, success, error? }[] }`.
- **`POST /api/shopee/logistics/document`** — body: `{ orderSnList: string[] }` (hanya order yang sukses di-ship). Jalankan `createShippingDocument` → poll → `downloadShippingDocument`, return PDF sebagai `application/pdf` response.

Keduanya auth-gated sama seperti route Shopee lain di app ini (session-based, lihat `/api/shopee/logistics` yang sudah ada sebagai referensi pola).

### Frontend — `apps/dashboard/app/(dashboard)/order/pengiriman/page.tsx` (baru)

Halaman client-side mandiri, 2 langkah (lihat mockup yang sudah disetujui user):

1. **List order Ready-to-Ship** dengan checkbox (select-all + per-baris) — pakai data order yang sudah ada di `lib/orders/service.ts` (filter `shopeeStatus === 'READY_TO_SHIP'`), tidak perlu fetch/endpoint baru untuk listing.
2. **Panel "Atur Pengiriman"** — muncul setelah minimal 1 order dicentang. User pilih Pickup atau Drop-off:
   - Pickup: panggil `getShippingParameter` untuk tiap order dipilih (paralel), **v1 auto-pilih slot pickup pertama yang valid** dari hasilnya (tanpa UI pemilihan slot manual — bisa ditambah di iterasi berikutnya kalau ada kebutuhan presisi jadwal).
   - Drop-off: user pilih 1 branch/counter dari hasil `getShippingParameter` (dropdown), berlaku untuk semua order dalam batch itu.
   - Tombol "Atur Pengiriman (N order)" → panggil `POST /api/shopee/logistics/ship`.
3. **Panel hasil** — tampil setelah step 2 selesai: ringkasan sukses/gagal per order (✅/❌ + pesan error Shopee kalau gagal). Tombol **"Generate & Cetak Resi (M order)"** aktif kalau M ≥ 1 order sukses.
   - Klik → `POST /api/shopee/logistics/document` dengan order-order yang sukses → response PDF di-`window.open` sebagai blob URL di tab baru, siap `Ctrl+P` (persis kayak Shopee Seller Center — tidak ada halaman print custom, PDF asli langsung ditampilkan browser).

### Error handling

- **Partial failure di step "Atur Pengiriman"** adalah kondisi normal yang diekspektasikan (bukan exception) — desain harus tampilkan status per-order, bukan all-or-nothing/toast generik.
- **`createShippingDocument` gagal/timeout saat polling** → tampilkan pesan retry-able, jangan block seluruh halaman.
- **Shopee API scope belum tersedia** (lihat "Risiko" di atas) → 403/permission error dari Shopee harus ditampilkan jelas ke user beserta rekomendasi ("scope Logistics API belum aktif, hubungi Shopee Partner support"), bukan generic 500.

### Testing

- Unit test `lib/shopee/logistics.ts` — mock `shopeeRequest`, cover: sukses, Shopee error response, network error, polling timeout untuk `createShippingDocument`.
- Unit test 2 API route — auth gate, partial-failure response shape, PDF passthrough.
- Component/state test untuk halaman — seleksi checkbox (select-all, toggle individual), transisi antar 3 step, tombol disabled/enabled sesuai state. Tidak perlu pixel-level UI test.

## Out of scope (v1)

- Tokopedia bulk shipping (tidak ada kode logistics sama sekali saat ini).
- UI pemilihan slot pickup manual (auto-pilih slot pertama untuk v1).
- Cetak label custom/desain ulang (pakai PDF asli Shopee).
- Riwayat/log "siapa cetak resi kapan" (bisa ditambah nanti kalau dibutuhkan audit trail).
