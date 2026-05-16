
---
## Katalog & Produk

### Quotation / Invoice dari halaman Katalog
- Pilih produk dari halaman Katalog (multi-select)
- Generate quotation untuk beberapa produk sekaligus
- Bisa jadi Invoice (dengan nomor invoice, tanggal, due date)
- Payment tracking (lunas/belum/DP)
- Buyer dipilih dari daftar kontak atau input baru

### Upload Gambar Katalog
- Field `imageUrl` di ProdukInternal
- Upload dari KatalogCard / KatalogForm (mirip upload foto Shopee)
- Tampil di KatalogCard sebagai thumbnail
- Dipakai untuk katalog digital & landing page

### History Pembuatan (Production History)
- Table `PrintHistory`: produkInternalId, tanggal, qty, catatan, kalkulasiId
- Bisa input manual "cetak sekian pcs tanggal sekian"
- Tampil di detail KatalogCard
- Aggregate: total pcs per produk, last printed date

### Landing Page Produk
- Public page yang menampilkan produk-produk yang sudah pernah dibuat
- Data dari Katalog + production history
- Gambar dari `imageUrl`
- Harga dari linked kalkulasi (shopeeA / offlineA)
- Bisa embed di bio link / Linktree

---
## Image Storage Migration Path

### Phase 1 (sekarang): Local Filesystem
- `/app/data/images/katalog/[id].jpg`
- Serve via `/api/images/katalog/[filename]`
- MVP, cukup untuk puluhan produk

### Phase 2: MinIO (homelab)
- Deploy MinIO container di Proxmox
- Ganti storage backend, API tidak berubah dari frontend
- Bucket: `3pb-katalog`

### Phase 3: Sanity CDN (untuk landing page)
- Sync ProdukInternal ke Sanity Studio (webhook / manual push)
- Gambar di-upload ke Sanity asset pipeline → CDN otomatis
- Landing page di-build dari Sanity data

---
## Shopee Live Push (Webhook)

### Setup
- Callback URL: `https://dashboard.3dprintingbandung.my.id/api/shopee/push`
- Deployment Area: Singapore
- Partner Key: generate dari Shopee portal, simpan di .env.deploy sebagai `SHOPEE_PUSH_PARTNER_KEY`

### Implementasi
- `POST /api/shopee/push` — receive webhook dari Shopee
- Verifikasi signature: `HMAC-SHA256(requestBody, SHOPEE_PUSH_PARTNER_KEY)`
- Handle events:
  - `order_status_push` (code 3): update order status di DB / trigger notifikasi
  - `order_trackingno_push` (code 4): simpan tracking number
- Return 200 OK dalam < 5 detik (Shopee retry kalau timeout)

---
## Shopee Live Push (Webhook)

### Setup
- Callback URL: `https://dashboard.3dprintingbandung.my.id/api/shopee/push`
- Deployment Area: Singapore
- Partner Key: generate dari Shopee portal, simpan di .env.deploy sebagai `SHOPEE_PUSH_PARTNER_KEY`

### Implementasi
- `POST /api/shopee/push` — receive webhook dari Shopee
- Verifikasi signature: `HMAC-SHA256(requestBody, SHOPEE_PUSH_PARTNER_KEY)`
- Handle events:
  - `order_status_push` (code 3): update order status di DB / trigger notifikasi
  - `order_trackingno_push` (code 4): simpan tracking number
- Return 200 OK dalam < 5 detik (Shopee retry kalau timeout)

---
## Analitik & Finance

### Escrow Amount (Pendapatan Bersih Seller)
- Omzet saat ini = total_amount (GMV, belum dikurangi fee Shopee)
- Perlu tambah escrow_amount dari Shopee Finance API
- Ini angka yang benar-benar masuk ke rekening seller
- Butuh sensitive data access approval dari Shopee dulu
- Laba Kotor di Analisa page = Omzet - AdSpend → harusnya = Escrow - AdSpend - HPP

---
## Kalkulator Harga

### Per-Part Filament Selection
- Saat ini HPP FDM = gramasi × fixed rate (300/gram dari Config)
- Rencana: tiap part/plate bisa pilih filamen spesifik dari FilamentHarga catalog
- Kalau filamen dipilih → gunakan hargaPerGram dari FilamentHarga
- Kalau tidak dipilih → fallback ke rate default FDM/SLA dari Config
- DB: tambah `filamentId String?` ke KalkulasiPlate (FK ke FilamentHarga)
- UI: tambah dropdown filamen di PlateTable per row (setelah printer selector)
- Formula: update `hitungKalkulasi()` agar terima `hargaPerGram` per plate

---
## Shopee Product Cache (Local DB)

### Problem
- Setiap load halaman Shopee → fetch ke Shopee API (lambat, heavy)
- Sering timeout, tidak bisa di-load

### Solution
- Cache di SQLite: `ProductCache { productId, name, status, priceMin, priceMax, stockTotal, variants JSON, cachedAt }`
- Serve dari cache dulu, reload manual dari Shopee
- UI di tab Shopee: 3 tombol reload:
  - 🔄 Full Reload — semua metadata dari Shopee
  - 💰 Reload Harga — price_info only
  - 📦 Reload Stok — stock_info only
- Cache invalidation: manual only (untuk hemat quota Shopee API)
- Show "last updated X ago" timestamp

---
## Analisa — Dana Dicairkan (Escrow Released)

### API yang dibutuhkan
- Shopee: `/api/v2/payment/get_escrow_list` atau `/api/v2/order/get_order_income_detail`
- Returns: actual_seller_amount per order (setelah potongan komisi, biaya admin)

### UI
- Di AnalyticsKpiBar: tambah card "Dana Dicairkan" (warna hijau)
- Breakdown: gross omzet - shopee_fee - voucher_subsidi = escrow
- Bisa dibanding periode sebelumnya

### Notes
- Berbeda dengan `total_amount` (pembayaran buyer)
- Escrow = yang benar-benar masuk ke seller
- Mungkin butuh tambahan API permission dari Shopee
