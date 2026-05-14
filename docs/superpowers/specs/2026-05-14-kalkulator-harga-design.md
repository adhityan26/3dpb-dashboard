# Kalkulator Harga Jual — Design Spec

**Date:** 2026-05-14
**Status:** Approved

---

## Goal

Fitur kalkulator harga jual untuk produk 3D print (FDM & SLA). User bisa hitung HPP, Floor Price, rekomendasi harga offline/Shopee/reseller, lalu simpan hasilnya dan link ke produk. Satu kalkulasi mendukung multi-part (plate-based input) dan campuran FDM + SLA.

**Relasi kalkulasi ↔ produk:**
- **1 produk → banyak kalkulasi**: e.g., Hammerhead Shark punya kalkulasi batch-1 dan batch-10 terpisah
- **1 kalkulasi → banyak produk**: e.g., varian warna berbeda dengan konfigurasi cetak sama
- **Primary kalkulasi**: per produk, 1 kalkulasi ditandai `isPrimary` sebagai referensi harga utama

---

## Lokasi di App

Sub-tab ketiga di halaman **Produk**: `Produk · Filamen · 🧮 Kalkulator`

**Flow utama:**
```
Hitung → Simpan → (opsional) Link ke produk Shopee atau buat nama produk manual
```
Produk tidak harus ada di Shopee dulu — bisa kalkulasi untuk produk yang belum listing.

---

## Layout

**Desktop (≥768px):** Split horizontal
- Kiri: Form input
- Kanan: Hasil real-time
- Bawah: Riwayat tersimpan

**Mobile (<768px):** Stack vertical — Input → Hitung → Hasil → Riwayat

---

## Data Model (Prisma)

### Tabel Baru

```prisma
model KalkulasiHarga {
  id            String   @id @default(cuid())
  nama          String   // nama kalkulasi, bisa include batch info e.g. "Hammerhead 10pcs"
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  batch         Int      @default(1)  // jumlah unit yang dicetak — penting untuk referensi next print
  marginTier    String   // "A" | "B" | "C"
  hargaShopeeAktual Float?

  // Aksesori standar
  packingType   String?  // "S"|"M"|"L"|"XL"|null
  gantunganType String?  // "kew_kew"|"ring"|"rantai"|"tali"|null
  switchQty     Int      @default(0)
  hasLabel      Boolean  @default(false)

  // Hasil kalkulasi (tersimpan snapshot)
  hppProduksi   Float    @default(0)
  hppKomponen   Float    @default(0)
  hppTotal      Float    @default(0)
  floorPrice    Float    @default(0)
  offlineA      Float    @default(0)
  offlineB      Float    @default(0)
  offlineC      Float    @default(0)
  shopeeA       Float    @default(0)
  shopeeB       Float    @default(0)
  shopeeC       Float    @default(0)
  resellerStd   Float    @default(0)
  resellerBulk  Float    @default(0)
  status        String   @default("TIDAK_DISET")
  marginOfflineA Float   @default(0)
  marginShopeeA  Float   @default(0)

  // Relations
  plates        KalkulasiPlate[]
  komponenKustom KomponenKustom[]
  produkLinks   KalkulasiProduk[]
}

model KalkulasiPlate {
  id           String   @id @default(cuid())
  kalkulasiId  String
  kalkulasi    KalkulasiHarga @relation(fields: [kalkulasiId], references: [id], onDelete: Cascade)
  urutan       Int      // 1, 2, 3... untuk ordering
  namaPart     String?  // "Face", "Body", "Eye Insert" — opsional
  tipe         String   // "FDM" | "SLA"
  gramasi      Float    // total gramasi untuk plate ini (output slicer)
  durasiJam    Float    // total durasi untuk plate ini (output slicer)
}

model KomponenKustom {
  id           String   @id @default(cuid())
  kalkulasiId  String
  kalkulasi    KalkulasiHarga @relation(fields: [kalkulasiId], references: [id], onDelete: Cascade)
  nama         String   // "LED Strip", "Microcontroller", etc.
  harga        Float    // harga per unit (HPP)
  qty          Int      @default(1)
}

// Junction table: 1 kalkulasi bisa link ke banyak produk/varian
// 1 produk bisa punya banyak kalkulasi, tapi hanya 1 yang isPrimary
model KalkulasiProduk {
  id           String   @id @default(cuid())
  kalkulasiId  String
  kalkulasi    KalkulasiHarga @relation(fields: [kalkulasiId], references: [id], onDelete: Cascade)
  shopeeItemId String?  // link ke produk Shopee (nullable)
  namaManual   String?  // nama manual kalau belum ada di Shopee
  isPrimary    Boolean  @default(false)  // kalkulasi referensi utama untuk produk ini
}

// Harga filamen FDM per brand+material (untuk mode Per Filamen)
model FilamentHarga {
  id       String @id @default(cuid())
  brand    String
  material String
  hargaPerGram Float
  @@unique([brand, material])
}

// Harga resin SLA per brand+grade (untuk mode Per Material)
model ResinHarga {
  id       String @id @default(cuid())
  brand    String
  grade    String
  hargaPerGram Float
  @@unique([brand, grade])
}
```

### Tabel Settings (Key-Value di Config atau tabel dedicated)

Harga komponen standar disimpan di tabel `Config` yang sudah ada, dengan keys:
```
kalk.packing.S       = 1500
kalk.packing.M       = 2500
kalk.packing.L       = 5000
kalk.packing.XL      = 8000
kalk.gantungan.kew_kew = 900
kalk.gantungan.ring    = 800
kalk.gantungan.rantai  = 350
kalk.gantungan.tali    = 400
kalk.switch.perPcs   = 2500
kalk.label.perLembar = 750
kalk.fdm.hppPerGram  = 300
kalk.fdm.jualPerGram = 900
kalk.sla.hppPerGram  = 1750  (configurable, range 1500-2000)
kalk.sla.jualPerGram = 3500
kalk.mesin.perJam    = 4000
kalk.adminEcommerce  = 1.2   (20% fee Shopee)
```

---

## Formula Lengkap

```
BATCH = jumlah unit yang diproduksi (input 1×)

Per plate (FDM):
  hpp_plate_fdm   = gramasi × kalk.fdm.hppPerGram + durasiJam × kalk.mesin.perJam
  jual_plate_fdm  = gramasi × kalk.fdm.jualPerGram + durasiJam × kalk.mesin.perJam

Per plate (SLA):
  hpp_plate_sla   = gramasi × kalk.sla.hppPerGram + durasiJam × kalk.mesin.perJam
  jual_plate_sla  = gramasi × kalk.sla.jualPerGram + durasiJam × kalk.mesin.perJam

Aggregate (semua plates):
  hpp_produksi_total = Σ(hpp_plate) ÷ batch       // per unit
  jual_base_total    = Σ(jual_plate) ÷ batch      // per unit (filamen profit embedded)

Komponen (per unit, HPP = harga beli efektif):
  hpp_komponen = packing + gantungan
               + (switchQty × kalk.switch.perPcs)
               + (hasLabel ? kalk.label.perLembar : 0)
               + Σ(komponen_kustom.harga × komponen_kustom.qty)

HPP Breakdown:
  hppProduksi = hpp_produksi_total
  hppKomponen = hpp_komponen
  hppTotal    = hppProduksi + hppKomponen

Floor Price (batas diskon — masih cover filamen profit):
  floorPrice = jual_base_total + hppKomponen

Harga Offline:
  offlineA = floorPrice × 1.1
  offlineB = floorPrice × 1.5
  offlineC = floorPrice × 2.0

Harga Shopee (+ marketplace fee 20%):
  shopeeA = offlineA × kalk.adminEcommerce   // = offlineA × 1.2
  shopeeB = offlineB × 1.2
  shopeeC = offlineC × 1.2

Net yang diterima dari Shopee (setelah dipotong 20%):
  netShopeeA = shopeeA × 0.8  // = offlineA (sama dengan offline A)

Margin:
  marginOfflineA = (offlineA - hppTotal) ÷ offlineA × 100   // %
  marginShopeeA  = (netShopeeA - hppTotal) ÷ netShopeeA × 100 // %

Harga Reseller:
  resellerStd  = offlineA           // dapat fee Shopee sebagai margin mereka
  resellerBulk = floorPrice × 1.05  // untuk order volume besar

Break-even murni (tanpa filamen profit):
  breakEven = hppTotal × kalk.adminEcommerce

Status:
  hargaShopeeAktual >= shopeeA    → AMAN     🟢
  hargaShopeeAktual >= floorPrice → BAWAH_REKM  🟡
  hargaShopeeAktual <  floorPrice → RUGI    🔴
  (null)                          → TIDAK_DISET  ⬜
```

---

## Input Form — Field Detail

### Header
- **Nama produk** — text input (free-form, atau pilih dari produk Shopee)
- **Batch (jumlah unit)** — number input, default 1

### Plate Table (multi-row)
| Field | Tipe | Detail |
|---|---|---|
| Nama part | text (opsional) | "Face", "Body", "Eye Insert" |
| Gramasi | float (gram) | Output langsung dari slicer |
| Durasi | time input | Auto-detect HH:MM atau decimal (1:30 = 1.5j) |
| Tipe | select | FDM / SLA |

- "+ Tambah Part" untuk tambah baris
- Baris pertama tidak bisa dihapus
- Row Total: auto-sum gramasi & durasi, readonly
- Bila hanya 1 plate → tampil simpel tanpa kolom "Nama Part"

### Mode Filamen (toggle)
- **Simpel** (default): pakai rate default dari Settings (FDM 300/gram, SLA 1750/gram)
- **Per Filamen/Resin**: pilih brand+material/grade per plate, ambil harga dari `FilamentHarga`/`ResinHarga`

### Packing
Grid selector: `— · S · M · L · XL`
Satu pilihan, harga tampil di bawah chip yang dipilih.

### Gantungan
Grid selector: `— · Kew Kew · Ring · Rantai · Tali`
Tipe dan harga configurable di Settings.

### Aksesori Lain
- **Label/Sticker**: checkbox, harga Rp 750 (configurable)
- **Switch (clicker)**: checkbox → bila dicentang, muncul input qty `− N +`

### Komponen Elektronik (free-form)
Tabel dinamis: Nama | Harga | Qty | [hapus]
"+ Tambah komponen" untuk tambah baris.

### Harga Shopee Saat Ini
- Number input, opsional
- Bila diisi → tampilkan analisa vs rekomendasi + status flag

### Margin Tier
Toggle: `A (1.1×) · B (1.5×) · C (2.0×)`

---

## Output Panel (Kanan)

### Hero Cards
```
┌─────────────────────┬──────────────────────┐
│ FLOOR PRICE         │ REKM. SHOPEE A        │
│ Rp XX.XXX           │ Rp XX.XXX             │
│ batas diskon minimum│ target ideal          │
└─────────────────────┴──────────────────────┘
```

### HPP Breakdown
```
HPP Produksi         Rp X.XXX   (cetak saja)
HPP Komponen         Rp X.XXX   (aksesori)
──────────────────────────────
HPP Total            Rp X.XXX
```

### Tabel Harga
```
Floor Price          Rp XX.XXX

Offline A · B · C    Rp XX · XX · XX
Shopee  A · B · C    Rp XX · XX · XX

Margin Offline A     XX%
Margin Shopee A      XX%    ← net setelah fee 20%

Reseller standard    Rp XX.XXX
Reseller bulk        Rp XX.XXX
Break-even murni     Rp XX.XXX   (info saja)
```

### Analisa vs Harga Shopee Aktual (bila diisi)
```
Harga Shopee saat ini    Rp XX.XXX
vs Floor Price           +/− Rp X.XXX
vs Rekm. Shopee A        +/− Rp X.XXX

Status: 🟢 AMAN / 🟡 DI BAWAH REKM / 🔴 RUGI

Catatan: "Di bawah rekm. tapi tidak rugi — 
  naikkan ke Rp XX.XXX untuk margin optimal"
```

### Tombol Aksi
```
[💾 Simpan Kalkulasi]   [🔗 Link ke Produk]
```

---

## Riwayat Tersimpan (Bawah)

- Search bar + filter status (Semua / 🟢 / 🟡 / 🔴)
- Setiap row: nama, batch info, summary (gramasi, durasi, plates), floor price, status, tanggal
- Klik row → load ulang form dengan data tersimpan
- "Link produk" badge bila sudah terhubung ke produk, "🔑 Primary" badge bila isPrimary

**Actions per row:**
- **Edit** → load ke form, update record yang sama (tidak membuat history baru)
- **Duplicate / Save As** → buat record baru dari data ini, nama bisa diubah, batch bisa diubah
- **Compare** → pilih 2+ kalkulasi untuk ditampilkan side-by-side (misal: batch-1 vs batch-10)

**Compare view:**
- Tampilkan tabel perbandingan: HPP, Floor Price, Offline A/B/C, Shopee A/B/C per kalkulasi
- Berguna untuk keputusan: "lebih untung cetak 1 atau 10 sekaligus?"

---

## Settings — Harga Komponen

Sub-section di halaman **Settings**:

### FDM Print
| Parameter | Default |
|---|---|
| HPP rate / gram | 300 |
| Base jual / gram | 900 |
| Tarif mesin / jam | 4.000 |

### SLA Print
| Parameter | Default |
|---|---|
| HPP rate / gram | 1.750 |
| Base jual / gram | 3.500 |
| Tarif mesin / jam | 4.000 |

### Komponen Standar
Packing: S=1500, M=2500, L=5000, XL=8000
Label: 750
Switch: 2500/pcs

### Gantungan (configurable list)
| Tipe | Harga |
|---|---|
| Kew Kew | 900 |
| Ring | 800 |
| Rantai | 350 |
| Tali | 400 |
Bisa tambah tipe baru, edit harga, hapus.

### Admin Ecommerce
Default: 1.2 (20%)

---

## Halaman Filamen — Tambahan

Sub-section **"Harga per Tipe"** di tab Filamen:

**FDM Filament:**
Auto-populate dari brand+material spool yang ada.
User isi harga per gram untuk setiap kombinasi.
Dipakai di mode "Per Filamen".

**Resin SLA:**
Tambah manual (tidak auto-populate dari spool).
Brand + Grade + Harga/gram.
Dipakai di mode "Per Material" untuk plate SLA.

---

## Input Form — Tambahan Field Batch

Field **Batch** ada di atas plate table:
```
Batch (jumlah unit): [10]  ← user input jumlah unit yang akan diproduksi
```
Gramasi dan durasi di tiap plate = total untuk seluruh batch (output slicer).
Formula otomatis bagi batch untuk dapat harga per unit.

Nama kalkulasi bisa include batch info: "Hammerhead 10pcs" vs "Hammerhead 1pcs" untuk mudah dibedakan di riwayat.

---

## Scope Phase 1 (ini)

- ✅ Kalkulator FDM + SLA
- ✅ Multi-plate (part) per kalkulasi
- ✅ Field `batch` disimpan ke DB (referensi next print)
- ✅ Save kalkulasi + riwayat
- ✅ Duplicate / Save As kalkulasi
- ✅ Link ke produk Shopee atau nama manual
- ✅ 1 kalkulasi → multiple produk/varian (many-to-many)
- ✅ 1 produk → multiple kalkulasi (batch berbeda)
- ✅ `isPrimary` flag per kalkulasi-produk link (referensi harga utama)
- ✅ Compare 2+ kalkulasi side-by-side
- ✅ Buat/link produk langsung dari kalkulasi (+ set primary)
- ✅ Margin offline vs Shopee (terpisah, dengan fee sebagai cost)
- ✅ Semua tipe aksesori (packing, gantungan multi-tipe, switch+qty, label, elektronik)
- ✅ Settings harga komponen + gantungan configurable
- ✅ Harga filamen FDM + resin SLA per brand di halaman Filamen

## Out of Scope (Phase 2)

- ⏭ Mode Topeng/Costume (perhitungan berbeda)
- ⏭ Auto-fetch harga Shopee aktual
- ⏭ Analisa trend margin historis
- ⏭ Labor/overhead packing (treated as operating expense)
