# Fase 1b-3 — Multi-plate + Batch (apps/saas Slizebiz)

**Tanggal:** 2026-07-22
**Status:** Design disetujui, siap plan
**Worktree:** `feat/saas-1b3-multiplate`

## Ringkasan

Kalkulator Slizebiz saat ini single-plate: satu produk = satu berat + satu durasi + satu tipe (FDM/SLA). Fase 1b-3 membuka **multi-plate** (satu produk terdiri dari beberapa bagian cetak, tiap bagian punya berat & durasi sendiri, total dijumlahkan) dan **batch** (jumlah unit identik yang dihasilkan dari sekali gabungan cetak; biaya produksi dibagi angka ini). Keduanya **gate Pro** — tier Free tetap single-plate, single-unit, identik seperti sekarang.

`packages/kalkulator-core` **tidak diubah**: `hitungKalkulasiV2` sudah plate-array-native (loop `plates[]`, sum HPP/jual antar-plate, `batch` membagi total gabungan). Perubahan hanya di lapisan saas.

## Keputusan brainstorming

| Keputusan | Pilihan |
|---|---|
| Scope | Multi-plate **+ batch** |
| Gating | Free = 1 plate, batch=1 (persis sekarang). Pro = banyak plate + field batch |
| Batch untuk Free? | **Tidak** — batch ikut Pro |
| Bentuk UI | **Baris ringkas per plate** `[nama \| FDM/SLA \| gram \| durasi \| ✕]`, baris TOTAL saat >1 plate |
| Rincian per-plate (subtotal Rp) | **Di luar scope** (butuh core expose per-plate cost) — follow-up |

## Arsitektur

### Choke point tunggal
`buildInputV2` di `apps/saas/lib/kalkulator/compute.ts` saat ini hardcode `plates: [{...}]` + `batch: 1`. Inilah satu-satunya titik yang menerjemahkan input flat saas → `KalkulasiInputV2` core. Multi-plate = generalisasi titik ini dari 1 plate ke N plate + batch dinamis.

### Backward-compatible, additive
`CalcInput` diperluas **tanpa membuang** field lama, supaya seluruh test 1a/1b existing tetap hijau tanpa disentuh:

```ts
export interface CalcPlate {
  id: string;
  nama?: string;
  tipe: "FDM" | "SLA";
  gramasi: number;
  durasiJam: number;
}

export interface CalcInput {
  // legacy single-plate — TETAP didukung
  gramasi?: number;
  durasiJam?: number;
  tipe?: "FDM" | "SLA";
  // baru — kalau plates?.length ada, dipakai; kalau tidak, fallback ke 3 field legacy
  plates?: CalcPlate[];
  batch?: number;
  hargaAktual?: { channelId: string; harga: number };
  komponen?: KomponenRow[];
  labor?: LaborRow[];
  packing?: { nama: string; harga: number };
}
```

**Normalisasi di `buildInputV2`:**
1. Kalau `c.plates` ada dan panjang ≥ 1 → map tiap `CalcPlate` ke `PlateInputV2` (`durasiJam`, `mesinPerJam: ls.mesinPerJam`, `mesinPerJamJual: ls.mesinPerJam`, `materials: [{ gramasi, hppPerGram: ls.material[tipe].hppPerGram, jualPerGram, failureRatePct }]`, `namaPart: nama`).
2. Kalau tidak → bangun 1 plate dari `c.gramasi/c.durasiJam/c.tipe` (perilaku sekarang, verbatim).
3. `batch: Math.max(1, c.batch ?? 1)` diteruskan ke core.
4. `komponen`/`labor`/`packing` **tetap top-level** — di-compose sekali via `composeKomponen`/`composeLabor`, tak per-plate (sesuai core: add-on ditambah flat, tak dibagi batch).

`fullView(c, ls)` tak berubah signature; hanya meneruskan `CalcInput` yang kini bisa membawa plates+batch. `rincian.produksi` tetap angka agregat (core sudah sum).

### Semantik batch (dari core, tak diubah)
`safeBatch = max(1, batch)`. `hppProduksi = hppBatch / safeBatch`, `jualBase = jualBatch / safeBatch`. Artinya: gabungan semua plate menghasilkan `batch` unit identik → biaya produksi per unit = total ÷ batch. Komponen & labor **tidak** dibagi batch (ditambah flat setelahnya). Ini perilaku core existing; saas hanya meneruskan angka `batch`.

## Komponen

### `apps/saas/components/PlateInput.tsx` (BARU)
Pola mengikuti `KomponenLaborInput.tsx` (locked block untuk Free, baris ringkas untuk Pro).

**Props:**
```ts
{
  locked: boolean;            // !paidCore
  plates: PlateRow[];         // PlateRow = { id; nama: string; tipe: "FDM"|"SLA"; gramasi: string; durasiJam: string }
  batch: string;
  onPlatesChange: (p: PlateRow[]) => void;
  onBatchChange: (b: string) => void;
}
```
`PlateRow` memakai input **string** (konsisten dgn field kalkulator lain), tipe sudah di-parse saat ke `fullView`.

**Perilaku Free (`locked=true`):**
- Field plate tunggal (`plates[0]`) tetap tampil inline: gram, durasi, toggle FDM/SLA — persis kalkulator sekarang, angka identik.
- Blok terkunci `🔒 Multi-plate & batch` + teks + `<Link href="/beli">Buka dengan Pro →</Link>`. Tak ada tombol tambah plate, tak ada field batch.

**Perilaku Pro (`locked=false`):**
- Tiap plate = 1 baris: `GlassInput` nama (placeholder "Nama part", opsional) | toggle FDM/SLA | `GlassInput` gram | `GlassInput` durasi | tombol `✕` hapus.
- Tombol `＋ tambah plate` menambah `PlateRow` baru (`id: newId()`, seed `tipe:"FDM", gramasi:"", durasiJam:""`).
- Plate terakhir **tak bisa dihapus** (tombol ✕ hilang/disabled saat `plates.length === 1`).
- Field **Batch** (`GlassInput` numeric, default "1") dengan `InfoTip`: "Jumlah unit identik dari sekali gabungan cetak. Biaya produksi dibagi angka ini."
- Baris **TOTAL** muncul hanya saat `plates.length > 1`: jumlah gram + jumlah durasi antar-plate. Kalau `Number(batch) > 1`, tambah baris kecil "per pcs (÷ batch)".

**ID:** WAJIB pakai `newId()` dari `@/lib/id` — **jangan** `crypto.randomUUID()` (regresi bug produksi 2026-07-21: undefined di `http://<IP>` non-secure-context → TypeError diam).

### `apps/saas/components/Calculator.tsx` (EDIT)
- Ganti state `gramasi/durasi/tipe` (3 `useState` string) → `plates: PlateRow[]` (seed 1 plate `{ id: "plate-1", nama:"", tipe:"FDM", gramasi:"50", durasiJam:"3" }` — id awal **literal stabil**, bukan `newId()`, agar tak ada mismatch hidrasi SSR/klien; baris tambahan pakai `newId()`) + `batch: string` (seed "1").
- Valid = **semua** plate punya `Number(gramasi) > 0` dan `Number(durasiJam) > 0`.
- Feed: `fullView({ plates: plates.map(toCalcPlate), batch: Number(batch), ...addon }, settings)` untuk Pro; untuk Free `addon` kosong dan `plates` = 1 plate saja (batch di-abaikan / dipaksa 1).
- Render `<PlateInput locked={!paidCore} plates={plates} batch={batch} ... />` menggantikan blok input gram/durasi/tipe lama.
- `toCalcPlate(r: PlateRow): CalcPlate` = `{ id: r.id, nama: r.nama || undefined, tipe: r.tipe, gramasi: Number(r.gramasi), durasiJam: Number(r.durasiJam) }`.

### `RincianPanel` — tak berubah
`rincian.produksi` tetap agregat. TOTAL gram/durasi ada di area input. Subtotal Rp per-plate = follow-up (butuh core expose per-plate breakdown).

## Testing (TDD)

### `packages/kalkulator-core/src/formula-v2.test.ts` (EDIT — tambah)
Explore menemukan loop sum antar-plate (`for (const p of input.plates)`) **belum ada test**-nya. Tambah:
- `plates.length > 1 menjumlahkan hpp & jual antar-plate`: 2 plate → HPP/jual = jumlah dua plate single (dalam toleransi).
- `batch membagi total gabungan multi-plate`: 2 plate, batch 2 → produksi = (plate1+plate2)/2.

### `apps/saas/lib/kalkulator/compute.test.ts` (EDIT — tambah, tak ubah yang lama)
- `buildInputV2 dengan plates[] menghasilkan N plate`: input 3 plate → `out.plates.length === 3`, tiap plate materials benar dari `ls.material[tipe]`.
- `buildInputV2 meneruskan batch`: `batch: 4` → `out.batch === 4`; `batch: 0` → `out.batch === 1` (clamp).
- `buildInputV2 jalur legacy tetap parity`: input flat `{gramasi, durasiJam, tipe}` → hasil identik dgn sebelum perubahan (1 plate, batch 1).
- `fullView multi-plate menjumlahkan produksi`: 2 plate identik vs 1 plate → produksi 2 plate = 2× (dalam toleransi, add-on nol).

### `apps/saas/components/PlateInput.test.tsx` (BARU)
- `locked → 🔒 + CTA, tak ada tombol tambah plate, tak ada field batch`.
- `unlocked → ＋ tambah plate menambah baris`.
- `unlocked → hapus plate mengurangi baris; plate terakhir tak bisa dihapus`.
- `unlocked → baris TOTAL muncul saat >1 plate, jumlah gram & durasi benar`.
- `unlocked → field batch memanggil onBatchChange`.
- Regresi tanpa `crypto.randomUUID` (pola sama `komponen-labor-input.test.tsx`): tambah plate tetap jalan, id truthy.

### `apps/saas/components/calculator.test.tsx` (EDIT — tambah)
- `Free single-plate: angka identik dgn sebelumnya` (parity — biaya modal & harga jual tak berubah untuk input default).
- `Pro multi-plate: menambah plate mengubah total` (produksi naik saat plate kedua ditambah).

## Global Constraints

- **Bahasa Indonesia** untuk semua copy/komentar user-facing.
- **`newId()`** untuk semua id baris klien — jangan `crypto.randomUUID()`.
- Package tier disebut **"Pro"** di copy (bukan "Beli" sebagai nama tier; "beli/bayar" hanya kata kerja aksi).
- **Nol perubahan `packages/kalkulator-core`** selain menambah test.
- Semua test 1a/1b existing **tetap hijau tanpa diedit** (perluasan `CalcInput` bersifat additive/opsional).
- Halaman wajib pakai `PageShell` (`docs/ui-page-layout.md`) — tak relevan di sini (Calculator komponen, bukan page baru), tapi tetap dihormati.
- Deploy homelab :3300 **gated** — tunggu diminta user.
- Kerja **hanya** di worktree `feat/saas-1b3-multiplate`; commit path spesifik, **jangan `git add -A`**.

## Di luar scope 1b-3 (follow-up)

- Subtotal Rp per-plate di RincianPanel (butuh core expose per-plate cost).
- Per-plate material profile / printer profile (saas belum punya katalog profil; plate hanya pilih FDM/SLA).
- Multi-material AMS per plate (dashboard punya; saas tak butuh sekarang).
- Simpan hasil kalkulasi (IndexedDB) = 1b-4.
