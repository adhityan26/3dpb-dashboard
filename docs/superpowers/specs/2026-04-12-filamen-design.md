# Filamen Management — Design Spec
**Toko:** 3D Printing Bandung  
**Tanggal:** 2026-04-12  
**Status:** Approved

---

## 1. Overview

Fitur manajemen filamen untuk dashboard Shopee 3D Printing Bandung. Mencakup dua sub-fitur:
- **Spool** — tracking stok spool fisik per unit, lengkap dengan barcode/NFC, status, dan integrasi katalog SpoolmanDB
- **Urutan AMS** — referensi mapping filamen ke slot AMS per varian produk (Swoosh & Clickers), terintegrasi dengan status spool

Tujuan utama: dari ruang produksi (termasuk Raspberry Pi), operator bisa langsung lihat filamen mana yang perlu direstock dan slot AMS mana yang spool-nya hampir habis — sebelum mulai cetak.

---

## 2. Navigasi

```
Tab utama: [ 📦 Order ] [ 📊 Iklan ] [ 📈 Analisa ] [ 🏷️ Produk ] [ ⚙️ Settings ]
                                                              │
                                              Sub-tab: [ Produk | Filamen ]
                                                                    │
                                              Sub-sub-tab: [ Spool | Urutan AMS ]
```

Fitur filamen masuk sebagai sub-tab di dalam Tab Produk (3 level navigasi), bukan tab terpisah.

---

## 3. Sub-tab: Spool

### 3.1 Layout

**KPI Bar** (selalu terlihat di atas):
- Total spool
- NEW (tersegel, belum dibuka)
- FULL
- MID
- LOW ⚠️ (badge merah)

**Toolbar:**
- Tombol `+ Spool Baru`
- Tombol `📷 Scan Barcode` — buka kamera untuk scan
- Tombol `📡 Tap NFC` — aktifkan Web NFC API
- Filter status (dropdown)
- Search brand/warna

**Grid spool** — dikelompokkan per jenis filamen:
```
Esun Black · PLA  |  3 spool
┌──────────┐ ┌──────────┐ ┌──────────┐
│ #EB-001  │ │ #EB-002  │ │ #EB-003  │
│  [MID]   │ │  [FULL]  │ │  [NEW]   │
│ AKTIF ✓  │ │ backup   │ │ no tag   │
└──────────┘ └──────────┘ └──────────┘
```

### 3.2 Status Spool

| Status | Arti | Warna |
|--------|------|-------|
| NEW | Tersegel, belum dibuka | Indigo `#818cf8` |
| FULL | Sudah dibuka, masih penuh | Hijau `#4ade80` |
| MID | Separuh isi | Kuning `#facc15` |
| LOW | Hampir habis — perlu restock | Oranye `#f97316` |
| EMPTY | Habis | Abu `#6b7280` |

Tidak ada tracking berat dalam gram — status diupdate manual oleh operator.

### 3.3 Tiap Spool Card Menampilkan
- Color swatch (dari SpoolmanDB `color_hex`)
- Brand + material + nama warna
- Spool ID unik (contoh: `#EB-001`)
- Status badge
- Tanggal ditambahkan / dibuka
- Jumlah varian produk yang menggunakan filamen ini
- Badge **AKTIF** jika spool sedang di-assign ke AMS slot
- Tombol `🏷 Print` — print/tampilkan barcode/QR
- Tombol `✏️ Edit` — ubah status, catatan, atau ganti tag

### 3.4 Tambah Spool Baru

Ada dua flow tergantung kondisi spool:

**Flow A — Spool sudah ada NFC tag (scan-first):**
1. Klik `📡 Tap NFC` di toolbar (atau tombol NFC di mana saja)
2. Tap HP ke tag NFC spool
3. App baca tag:
   - Jika UUID **sudah dikenal** → langsung buka spool card yang ada
   - Jika UUID **belum dikenal** → otomatis buka form tambah spool dengan `nfc_tag_id` sudah terisi
4. Lengkapi brand/material/warna dari SpoolmanDB (atau auto-filled jika tag Bambu Lab bisa dibaca)
5. Simpan → spool langsung terdaftar dan ter-link ke tag

**Flow B — Spool tanpa NFC tag (manual):**
1. Klik `+ Spool Baru`
2. Pilih brand → material → warna dari katalog SpoolmanDB
3. Status otomatis = NEW
4. Generate barcode/QR unik otomatis
5. Opsional: klik "✍️ Tulis NFC Tag" untuk assign tag Bambu Lab kosong
6. Simpan ke SQLite

**Bambu Lab filament NFC:**
Tag bawaan Bambu Lab berisi data proprietary (material, warna, berat). App mencoba parse data ini untuk auto-fill form — jika berhasil, user tinggal konfirmasi. Jika format tidak bisa dibaca, form tetap terbuka dengan `nfc_tag_id` terisi dari UID tag.

### 3.5 Cetak Stiker Barcode (Bluetooth Thermal Printer)

Tombol `🏷 Print` pada tiap spool card langsung mencetak stiker ke thermal printer via **Web Bluetooth API** (Chrome/Chromium — termasuk Raspberry Pi dengan Chromium browser).

**Konten stiker:**
```
┌─────────────────────┐
│  ████ ██ ████ ██    │  ← QR code (UUID spool)
│  ██ ████ ██ ████    │
│  ████ ██ ████ ██    │
│                     │
│  Esun Black · PLA   │
│  #EB-001  [FULL]    │
│  ■ #1A1A1A          │  ← color hex
└─────────────────────┘
```

**Flow pairing printer:**
1. Masuk Settings → section "Perangkat"
2. Klik "Sambungkan Thermal Printer" → browser tampilkan dialog Bluetooth
3. Pilih printer → simpan device ID ke SQLite
4. Selanjutnya print langsung tanpa dialog — connect otomatis ke device yang sama

**Protokol:**
- Printer BLE (Bluetooth Low Energy) umum: Phomemo, Peripage, Munbyn, GOOJPRT — pakai ESC/POS over BLE
- QR code di-generate di browser (library `qrcode`), di-render ke canvas, lalu dikirim sebagai raw bytes ke printer
- Ukuran stiker: 40mm × 30mm (default, bisa diubah di Settings)

**Fallback:**
- Jika browser tidak support Web Bluetooth (Firefox, Safari) → tombol Print buka dialog print sistem biasa (bisa ke PDF atau printer biasa)
- Raspberry Pi: gunakan Chromium — Web Bluetooth support penuh

### 3.6 Scan & NFC

Tiga metode identifikasi spool:

| Metode | Cara kerja | Platform |
|--------|-----------|---------|
| 📷 Kamera | Scan QR/barcode via browser camera (ZXing/QuaggaJS) | Semua platform |
| 📡 NFC tap | Tap HP ke tag NFC Bambu Lab (Web NFC API) | Android Chrome |
| ⌨️ Hardware scanner | USB/Bluetooth scanner — input otomatis seperti keyboard | Semua platform |

Setelah scan → langsung buka spool card yang sesuai atau form tambah spool baru jika ID belum dikenal.

### 3.7 NFC Tag (Bambu Lab reuse)

Tag NFC Bambu Lab = NTAG215/216 — bisa di-rewrite via **Web NFC API** langsung dari browser Android Chrome.

**Read NFC (identifikasi spool):**
- Tap HP ke tag → app baca UUID spool → langsung buka spool card yang sesuai
- Jika UUID belum dikenal → form tambah spool baru dengan UUID sudah terisi otomatis

**Write NFC (assign tag ke spool baru):**
- Di form tambah spool atau edit spool → klik "✍️ Tulis NFC Tag"
- App aktifkan NFC write mode → tap HP ke tag Bambu Lab → UUID spool ditulis ke tag
- Konfirmasi sukses → tag siap dipakai
- Data yang ditulis: NDEF record berisi spool UUID (plain text)

**Platform support:**
| Fitur | Android Chrome | iOS Safari | Desktop Chrome |
|-------|---------------|------------|---------------|
| Read NFC | ✅ | ❌ | ❌ |
| Write NFC | ✅ | ❌ | ❌ |

iOS dan desktop: gunakan kamera scan QR/barcode sebagai alternatif.

**Untuk spool tanpa NFC tag** (filamen brand lain): cukup pakai barcode QR yang di-print ke stiker.

### 3.8 Alert

- Spool berubah ke LOW → kirim notifikasi Telegram + Pushover:
  > 📦 "Spool Esun Red (#ER-001) hampir habis — 4 varian Swoosh menggunakannya"
- Threshold LOW diset manual per spool (atau global dari Settings)

---

## 4. Sub-tab: Urutan AMS

### 4.1 Layout

**Section toggle** di atas: `[ Swoosh ]` `[ Clickers ]`

**Accordion per varian** — default collapsed:
```
▶  Electric Fire Red  ● ● ●⚠ ● ● ● ● ●   [⚠️ 1 LOW]
▶  Electric Fire Blue ● ● ● ● ● ● ● ●    [✓ OK]
▼  Fire Red  (expanded)
   ┌────────┬────────┬────────┬────────┐
   │ AMS 1  │ AMS 2  │ AMS 3  │ AMS 4  │
   │ ■Black │ ■FireR │ ■Red⚠  │ ■PETG  │
   │ #EB-01 │ #EF-02 │ #ER-01 │ #EP-03 │
   │  FULL  │  FULL  │  LOW   │  FULL  │
   └────────┴────────┴────────┴────────┘
```

**Collapsed row menampilkan:**
- Nama varian
- Dot warna kecil per slot (max 8 dot), warna = `color_hex` dari SpoolmanDB, border warna = status spool
- Badge ⚠️ jika ada slot dengan spool LOW/EMPTY
- Badge ✓ hijau jika semua slot OK

**Expanded row menampilkan:**
- Grid slot AMS 1–8 (slot kosong tampil dengan garis putus-putus)
- Tiap slot: swatch warna, nama filamen, spool ID, status spool
- Klik slot → modal assign/ganti spool (pilih dari list atau scan)

### 4.2 Data Awal

Data urutan AMS di-import dari file Excel `Urutan Fillament Swoosh.xlsx`:
- Sheet `Swoosh` → 19 varian
- Sheet `Clickers` → 14 varian (pasangan Face + Cup)

Import dilakukan sekali via script migrasi saat setup. Setelah itu data dikelola dari UI.

### 4.3 Assign Spool ke Slot

- Klik slot AMS di expanded view → modal muncul
- Modal menampilkan: nama filamen untuk slot ini (dari data Excel), list spool yang cocok (sama brand/warna), dan opsi scan
- Pilih spool → simpan mapping `spool_id` ke `ams_slot`
- Status slot otomatis mengikuti status spool yang diassign

---

## 5. SpoolmanDB Integration

**Sumber:** `github.com/Donkie/SpoolmanDB` — JSON database filamen open source

**Data yang diambil:**
- Daftar manufacturer/brand
- Per brand: material, nama warna, `color_hex`

**Implementasi:**
- Fetch JSON dari GitHub saat pertama kali setup, simpan ke SQLite lokal sebagai tabel `filament_catalog`
- Refresh manual dari Settings (tombol "Sync Katalog Filamen")
- Tidak ada auto-sync berkala — katalog jarang berubah

**Digunakan saat:** user tambah spool baru → search brand → pilih material → pilih warna dari dropdown yang datanya dari tabel ini.

---

## 6. Data Model

### Tabel: `spool`
```sql
id           TEXT PRIMARY KEY  -- UUID
brand        TEXT NOT NULL
material     TEXT NOT NULL
color_name   TEXT NOT NULL
color_hex    TEXT NOT NULL      -- dari SpoolmanDB
status       TEXT NOT NULL      -- new|full|mid|low|empty
barcode      TEXT UNIQUE        -- generated UUID-based string
nfc_tag_id   TEXT               -- ID tag NFC Bambu Lab, nullable
notes        TEXT
created_at   DATETIME
updated_at   DATETIME
```

### Tabel: `ams_slot`
```sql
id             TEXT PRIMARY KEY  -- UUID
product_type   TEXT NOT NULL     -- swoosh|clickers
variant_name   TEXT NOT NULL
slot_number    INTEGER NOT NULL  -- 1–8
filament_name  TEXT NOT NULL     -- nama display dari Excel
spool_id       TEXT              -- FK ke spool, nullable
UNIQUE(product_type, variant_name, slot_number)
```

### Tabel: `filament_catalog` (cache SpoolmanDB)
```sql
id           TEXT PRIMARY KEY
brand        TEXT NOT NULL
material     TEXT NOT NULL
color_name   TEXT NOT NULL
color_hex    TEXT NOT NULL
synced_at    DATETIME
```

---

## 7. Raspberry Pi Compatibility

- App berjalan sama seperti di laptop/desktop — tidak ada build terpisah
- Tombol NFC dan Scan Camera tetap tersedia (Android Chrome untuk NFC)
- Layar kecil: accordion collapsed view + chip warna cukup terbaca
- Hardware USB barcode scanner langsung berfungsi tanpa konfigurasi tambahan

---

## 8. Notifikasi

| Event | Pesan |
|-------|-------|
| Spool LOW | 📦 "Esun Red (#ER-001) hampir habis — dipakai 4 varian Swoosh" |
| Spool EMPTY + masih ada varian aktif | 🚫 "Spool BL Dark Blue (#BD-002) habis! 3 varian tidak bisa dicetak" |

Notifikasi dikirim via Telegram + Pushover (channel yang sudah ada di Settings).

---

## 9. Settings — Tambahan

### Perangkat
- **Thermal Printer** — sambungkan via Bluetooth, simpan device ID
- Tombol "Test Print" — cetak stiker test
- **Ukuran stiker** — pilihan: 30×20mm / 40×30mm / 50×30mm
- **Tampilan stiker** — toggle: tampilkan/sembunyikan color hex, status, tanggal

---

## 10. Out of Scope

- Auto-deduct stok berdasarkan order yang masuk — stok diupdate manual
- Tracking berat spool dalam gram
- Integrasi langsung dengan Spoolman (self-hosted) — tidak dipakai lagi
- Pembelian/reorder otomatis
- Riwayat penggunaan spool per cetak
