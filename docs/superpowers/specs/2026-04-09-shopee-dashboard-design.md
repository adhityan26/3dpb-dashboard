# Shopee Dashboard — Design Spec
**Toko:** 3D Printing Bandung  
**Tanggal:** 2026-04-09  
**Status:** Approved

---

## 1. Overview

Web app monitoring toko Shopee untuk 2 pengguna (pemilik & co-owner). Menampilkan data order, performa iklan, analisa penjualan, dan manajemen produk secara near real-time. Dilengkapi notifikasi via Telegram dan Pushover.

**Tujuan utama:**
- Monitor order masuk dan status cetak label dari ruang produksi
- Pantau performa iklan (ROAS, spend, rekomendasi)
- Analisa tren penjualan dan profitabilitas (dengan HPP)
- Kelola stok dan performa produk dalam satu tempat

---

## 2. Pengguna & Perangkat

- **Pengguna:** 2 orang (pemilik + istri/co-owner)
- **Perangkat utama:** Laptop/desktop
- **Perangkat sekunder:** HP (untuk monitoring di ruang produksi)
- **Requirement:** Responsive — tampilan bersih di kedua perangkat

---

## 3. Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend & Backend | Next.js (App Router) |
| Styling | Tailwind CSS |
| Data fetching | React Query (polling interval ~3 menit) |
| Charts | Recharts |
| Database lokal | SQLite via Prisma (HPP, status cetak label, config) |
| Notifikasi | Telegram Bot API + Pushover API |
| Data source | Shopee Open Platform API (OAuth 2.0) |

---

## 4. Arsitektur

```
┌─────────────────────────────────────┐
│          Next.js App                │
│                                     │
│  ┌──────────┐    ┌────────────────┐ │
│  │ Frontend │    │  API Routes    │ │
│  │ (React)  │◄──►│  /api/*        │ │
│  └──────────┘    └───────┬────────┘ │
│                          │          │
│              ┌───────────┴──────┐   │
│              │                  │   │
│        ┌─────▼─────┐    ┌───────▼─┐│
│        │ Shopee API│    │  SQLite ││
│        │ (polling) │    │ (Prisma)││
│        └───────────┘    └─────────┘│
│                                     │
│  ┌─────────────────────────────┐   │
│  │     Notification Service    │   │
│  │   Telegram Bot + Pushover   │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Data flow:**
- API Routes poll Shopee API tiap ~3 menit via background job (Next.js Route Handler + cron-like setInterval)
- Data di-cache di memory / SQLite untuk mengurangi API call
- Frontend polling API Routes internal via React Query
- Notification Service dipanggil saat trigger condition terpenuhi

---

## 5. Layout & Navigasi

**Tab navigation** di bagian atas (sticky), 5 tab:

```
[ 📦 Order ] [ 📊 Iklan ] [ 📈 Analisa ] [ 🏷️ Produk ] [ ⚙️ Settings ]
```

- Tab aktif ditandai dengan warna oranye Shopee (`#EE4D2D`)
- **Badge merah** muncul di tab jika ada item yang butuh perhatian:
  - Order: jumlah order belum cetak label
  - Iklan: jumlah iklan dengan ROAS merah
  - Produk: jumlah produk stok kritis atau perlu perhatian
- Di HP, tab tetap di atas (sticky) dengan ikon + label singkat

---

## 6. Tab Order

### KPI Bar (selalu terlihat di atas)
- Total order hari ini
- Belum cetak label (highlight kuning/oranye)
- Sudah cetak label (hijau)

### Order List
- Filter: **Semua / Belum Cetak / Sudah Cetak**
- Tiap item menampilkan: nomor order, nama produk + varian, qty, waktu masuk, status label
- Tap/klik untuk expand detail lengkap order
- Urutan default: terbaru di atas

### Aksi
- **Tandai Cetak** per order (toggle)
- **Tandai Semua Belum Cetak** — batch action untuk cetak sekaligus
- Status cetak disimpan di SQLite (bukan Shopee), sinkron antar pengguna via shared app

### Auto-refresh
- Data order di-refresh otomatis tiap ~3 menit
- Indikator "last updated" ditampilkan di sudut kanan atas

### Alert Trigger
- Kirim notifikasi jika terdapat **5+ order belum cetak selama lebih dari 1 jam**

---

## 7. Tab Iklan

### KPI Bar
- Total ROAS keseluruhan
- Total spend periode berjalan
- Total omzet dari iklan
- Jumlah iklan "merah" (ROAS di bawah threshold)

### Tabel Iklan
- Kolom: Nama iklan, Status, Mode (ROAS/Auto), Spend, Omzet, ROAS, ACOS, Tren
- **Warna baris:**
  - Hijau: ROAS ≥ 5x
  - Kuning: ROAS 2x–5x
  - Merah: ROAS < 2x
- Sortable by semua kolom
- Kolom "Tren": indikator naik/turun/stabil vs 7 hari lalu

### Rekomendasi Otomatis
- Berdasarkan data historis, tampilkan saran:
  - "Pause" jika ROAS < 1x selama 3+ hari berturut-turut
  - "Naikkan budget" jika ROAS > 7x dan budget belum maksimal
  - "Aktifkan kembali" jika iklan di-pause tapi historis ROAS bagus

### Alert Trigger
- Kirim notifikasi jika iklan yang sebelumnya ROAS ≥ 5x tiba-tiba turun ke < 2x

---

## 8. Tab Analisa

### Grafik Tren (line chart)
- Metrik: Omzet, Jumlah Pesanan, Pengunjung — bisa toggle per metrik
- Range: **7 hari / 30 hari / custom date range**

### Breakdown Sumber Traffic (bar/pie chart)
- Pencarian Organik, Affiliate, Iklan Shopee, Rekomendasi, Live, Video, Lainnya

### Top Produk
- Ranking by omzet dan qty terjual
- Indikator naik/turun vs periode sebelumnya

### Profitabilitas
- **Laba kotor** = Omzet - HPP
- **Laba bersih** = Omzet - HPP - Biaya Iklan
- Ditampilkan per periode yang dipilih

### Metrik Lain
- Tingkat konversi harian
- Persentase repeat buyer
- Average order value

---

## 9. Tab Produk

### Daftar Produk
- Tampil semua produk aktif dengan stok, harga, status, rating
- Filter: Semua / Stok Kritis / Perlu Perhatian / Non-aktif

### Stok
- **Stok global** per produk (total semua varian)
- **Stok per varian** — expand untuk lihat detail tiap varian
- Highlight merah jika di bawah threshold minimum (bisa diset per produk)

### HPP (Harga Pokok Penjualan)
- Input HPP **per produk** (default, berlaku untuk semua varian)
- Bisa **override per varian** jika biaya material/cetak berbeda
- Dari HPP → kalkulasi margin kotor & bersih otomatis

### Performa per Produk
- Views, klik, konversi, omzet (7/30 hari terakhir)
- Margin kotor dan bersih berdasarkan HPP yang diinput

### Fitur Lain
- **Status produk:** aktif / non-aktif / delist — alert jika tiba-tiba delist
- **Review terbaru:** tampil 5 review terakhir per produk
- **Monitor harga:** harga jual per varian, deteksi anomali harga
- **Reorder Suggestion:** estimasi hari stok habis berdasarkan rata-rata penjualan harian
- **Produk Perlu Perhatian:** auto-list produk dengan stok kritis, konversi rendah, tidak ada penjualan 7+ hari, atau rating turun

### Alert Trigger
- Kirim notifikasi jika stok varian di bawah threshold
- Kirim notifikasi jika ada review bintang 1–2 masuk
- Kirim notifikasi jika produk tiba-tiba ter-delist

---

## 10. Tab Settings

### Shopee API
- Partner ID, Partner Key, Shop ID
- Status koneksi (connected / error)
- Tombol re-authorize OAuth

### Telegram
- Bot Token
- Chat ID / Group ID (untuk notif ke grup kamu + istri)
- Tombol "Test Notifikasi"

### Pushover
- API Key (User Key)
- App Token
- Tombol "Test Notifikasi"

### Alert Threshold
- Minimum stok sebelum alert (default: 5 pcs)
- Minimum ROAS sebelum alert iklan (default: 2x)
- Jumlah order numpuk sebelum alert (default: 5 order, > 1 jam)

### Auto Refresh
- Interval polling data Shopee API (default: 3 menit)
- Pilihan: 1 menit / 3 menit / 5 menit / 10 menit / Manual saja
- Indikator "last updated" + countdown ke refresh berikutnya ditampilkan di semua tab
- Tombol refresh manual tetap tersedia di tiap tab meski auto-refresh aktif

### Data
- Tombol "Sync Manual" — force refresh semua data dari Shopee API
- Log koneksi terakhir

---

## 11. Notifikasi

### Channel
| Channel | Kegunaan |
|---------|---------|
| Browser badge | Indikator visual di tab, selalu update |
| Telegram Bot | Notif ke grup (kamu + istri terima bersamaan) |
| Pushover | Backup notif, semua platform |

### Trigger & Pesan

| Event | Pesan |
|-------|-------|
| Order numpuk | 🟡 "12 order belum cetak label lebih dari 1 jam!" |
| Stok kritis | 📦 "Crocs Charm Merah tinggal 3 pcs — segera restock!" |
| ROAS iklan turun | ⚠️ "Iklan Jibbitz Swoosh ROAS turun dari 8,9x ke 1,2x" |
| Review bintang 1-2 | ⭐ "Review bintang 2 masuk untuk Aksesoris Fire Wave — cek segera" |
| Produk delist | 🚫 "Produk Dudukan Samping ter-delist oleh Shopee!" |

---

## 12. Penyimpanan Data

| Data | Sumber | Disimpan di |
|------|--------|-------------|
| Order, iklan, produk, traffic | Shopee API | Memory cache (di-refresh tiap ~3 menit) |
| HPP per produk/varian | Input manual | SQLite via Prisma |
| Status cetak label | Aksi user | SQLite via Prisma |
| Konfigurasi (API keys, threshold) | Input di Settings | SQLite via Prisma |
| User accounts & roles | Input di Settings | SQLite via Prisma |

---

## 13. Autentikasi & Otorisasi

### Login
- Email + password (hashed dengan bcrypt)
- Session via **NextAuth.js** — session token disimpan di cookie httpOnly
- Redirect ke halaman login jika belum login
- Shopee OAuth token disimpan di SQLite, di-refresh otomatis saat expired

### Role & Akses

| Fitur | Owner | Admin |
|-------|-------|-------|
| Tab Order (lihat & tandai cetak) | ✅ | ✅ |
| Tab Produk — stok & status | ✅ | ✅ |
| Tab Produk — HPP & margin | ✅ | ❌ |
| Tab Iklan | ✅ | ❌ |
| Tab Analisa | ✅ | ❌ |
| Tab Settings | ✅ | ❌ |

**Owner** — akses penuh ke semua fitur termasuk Settings dan data finansial (HPP, margin, biaya iklan).  
**Admin** — hanya bisa lihat dan operasikan Order dan stok Produk. Cocok untuk staff produksi/packing.

### Manajemen User (di Tab Settings)
- Buat user baru (email, password, role)
- Edit role atau reset password user
- Hapus user
- Tidak ada self-registration — hanya Owner yang bisa tambah user baru

### Test User untuk Shopee Review
- Owner bisa buat akun dengan role **Test User** — akses read-only ke semua tab tanpa data sensitif (HPP, API keys tersembunyi)
- Digunakan khusus untuk proses review app oleh tim Shopee

---

## 14. Out of Scope

- Multi-toko (hanya untuk 1 toko: 3dprintingbandung)
- Deploy ke cloud / domain publik
- Mobile app native (cukup responsive web)
- Fitur reply review dari dalam dashboard
- Manajemen iklan (pause/aktifkan) dari dalam dashboard — hanya monitoring
- Social login (Google, dll) — cukup email + password
