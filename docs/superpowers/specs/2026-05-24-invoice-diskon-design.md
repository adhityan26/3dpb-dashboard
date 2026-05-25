# Invoice Diskon Feature — Design Spec

**Goal:** Tambah fitur diskon pada invoice — per item dan global, bisa input nominal (Rp) atau persen (%).

**Architecture:** Diskon disimpan di DB (Quotation + QuotationItem), dihitung server-side di service layer. UI menampilkan toggle Rp/% per input dan summary breakdown diskon.

**Tech Stack:** Prisma (SQLite), Next.js App Router, TypeScript, React

---

## 1. Database Schema

### Tabel `Quotation` — tambah 2 kolom
```
diskonGlobal    Float   @default(0)   -- nominal diskon (hasil konversi jika input %)
diskonGlobalPct Float?                -- persen diskon asli jika input %; null jika input nominal
```

### Tabel `QuotationItem` — tambah 2 kolom
```
diskon    Float   @default(0)   -- nominal diskon per item
diskonPct Float?                -- persen diskon asli jika input %; null jika input nominal
```

### Formula kalkulasi
```
subtotalItem   = qty × hargaPerUnit - diskon        (per item, setelah diskon item)
subtotalProduk = Σ subtotalItem                     (sum semua item setelah diskon item)
total          = subtotalProduk - diskonGlobal + ongkir
sisaBayar      = total - totalPaid
```

Diskon global dihitung dari `subtotalProduk` (post-item-diskon), bukan dari harga mentah.

---

## 2. Types (`lib/invoice/types.ts`)

### `QuotationItemData` & `QuotationItemInput`
Tambah field:
```ts
diskon: number       // nominal
diskonPct: number | null
```

### `QuotationData`
Tambah field:
```ts
diskonGlobal: number
diskonGlobalPct: number | null
```
Update `subtotal` di `QuotationItemData` — sudah net setelah diskon item.

### `QuotationListItem`
`total` tetap computed server-side, tidak perlu perubahan.

---

## 3. Service Layer (`lib/invoice/service.ts`)

- `createQuotation`: terima `diskonGlobal`, `diskonGlobalPct`, dan per-item `diskon`/`diskonPct`
- `updateQuotation`: sama, update field diskon
- Kalkulasi `subtotalItem`, `subtotalProduk`, `total`, `sisaBayar` pakai formula baru
- `toQuotationData` mapper: include field diskon baru

---

## 4. UI

### InvoiceForm — per-item row
Tiap baris item tambah:
- Toggle `Rp` / `%` (local state, tidak disimpan — hanya mode input)
- Input angka diskon (0 = tidak ada diskon)
- Kolom subtotal item update live = `qty × hargaPerUnit - diskon`

### InvoiceForm — summary section
Urutan di bawah item list:
```
Subtotal produk      Rp xxx
- Diskon item        Rp xxx   (hanya tampil jika total diskon item > 0)
- Diskon global      Rp xxx   (hanya tampil jika diskonGlobal > 0)
  [Toggle Rp/%] [Input]
+ Ongkir             Rp xxx
─────────────────────────────
Total                Rp xxx
```

### InvoiceDetail & Print
Tampilkan baris diskon item dan diskon global di breakdown yang sama, konsisten dengan form.

---

## 5. Prisma Migration

1 file migrasi baru:
- `ALTER TABLE Quotation ADD COLUMN diskonGlobal REAL NOT NULL DEFAULT 0`
- `ALTER TABLE Quotation ADD COLUMN diskonGlobalPct REAL`
- `ALTER TABLE QuotationItem ADD COLUMN diskon REAL NOT NULL DEFAULT 0`
- `ALTER TABLE QuotationItem ADD COLUMN diskonPct REAL`

---

## Out of Scope
- Diskon di Shopee order sync (Shopee sudah handle di platform-nya)
- Laporan khusus diskon
- Diskon template / voucher
