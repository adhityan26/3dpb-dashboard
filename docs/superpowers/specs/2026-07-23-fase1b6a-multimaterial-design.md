# Fase 1b-6a — Multi-material per plate + katalog filament (apps/saas)

**Tanggal:** 2026-07-23
**App:** `apps/saas` (Slizebiz, kalkulator HPP 3D-print)
**Status:** Design (disetujui — menunggu review spec sebelum plan)

## Tujuan

Satu plate bisa memakai lebih dari satu filament (mis. body PLA putih + aksen PETG merah). Tiap material mengambil tarif (harga modal/jual/failure) dari **katalog filament** yang dikelola user di Setting. Ini juga menyiapkan fondasi untuk **1b-6b** (import `.gcode`/`.3mf` — fase berikutnya, di luar scope dokumen ini).

**Formula core (`@3pb/kalkulator-core`) tidak berubah** — `PlateInputV2.materials: MaterialUsageV2[]` sudah native sejak Fase 0. Semua perubahan di sisi `apps/saas`.

## Keputusan yang dikunci (brainstorm 2026-07-23)

1. **Tarif material = katalog harga filament di saas** (bukan flat per-tipe). Dikelola user di Setting, pola persis `laborJobs`.
2. **Urutan fase:** 1b-6a (multi-material + katalog) **dulu**, lalu 1b-6b (import 3MF).
3. **UX multi-material = toggle per-plate.** Default tiap plate 1 material (tampilan sesederhana sekarang). Tombol "🎨 Multi-material" per plate membuka daftar material. Single-material user tak terganggu.
4. **Identitas filament dipisah brand + material + warna** (bukan satu label bebas) — meniru struktur dashboard agar fuzzy-match 3MF di 1b-6b mudah.

## Yang diwarisi gratis dari master (sesi paralel, sudah merge)

- `packages/ui` → **`HexColorPicker`** (popover swatch pilih warna dari `options: {id, colorName, colorHex}[]`) + `HexColorSwatch` (`isValidHexColor`). Dipakai apa adanya di saas.
- `packages/kalkulator-core/src/types.ts` → `PlateInput.color?: string` (informational, **tidak** dipakai kalkulasi HPP).
- Catatan: `color-catalog.ts` + `FilamentCatalog` (fuzzy-match brand+material, nearest-color sort) hidup di **`apps/dashboard`** (DB/AMS-bound) — **referensi pola, bukan reuse**. Saas pakai versi ringan sendiri.

## Arsitektur

Tiga lapis, aditif — tak ada breaking change ke perilaku sekarang:

1. **Data model** (`local-settings.ts` + `PlateInput.tsx` state): tambah `LocalSettings.filaments` dan ubah `PlateRow` agar punya `materials: PlateMaterial[]`.
2. **UI** — dua tempat: (a) Setting → section "Daftar filament"; (b) Produksi → toggle multi-material + baris material per plate.
3. **Wiring compute** — `buildInputV2` map tiap plate → `materials[]`, tiap material resolve tarif dari katalog dengan fallback `material[tipe]`.

### Backward-compat & gating

- **Free tetap single-plate, single-material, tanpa katalog.** Multi-material & katalog filament = fitur **Pro** (konsisten dengan multi-plate yang sudah Pro-gated). Locked branch `PlateInput` tak berubah selain migrasi internal `tipe/gramasi` → `materials[0]`.
- `loadSettings` melakukan `{...DEFAULT_LOCAL_SETTINGS, ...stored}` → field `filaments` baru otomatis backward-compat untuk settings tersimpan lama.
- Material tanpa `filamentId` (kosong) → fallback ke `LocalSettings.material[tipe]` = **perilaku persis sekarang**. Jadi user yang tak menyentuh katalog dapat hasil identik.

## Data model

### `LocalSettings.filaments`

```ts
export interface FilamentEntry {
  id: string;
  brand: string;            // "eSUN", "Bambu"
  material: string;         // polimer: "PLA+", "PETG", "Resin"
  tipe: "FDM" | "SLA";      // menentukan fallback + semantik; default FDM
  warna: string;            // nama warna: "Putih", "Merah"
  warnaHex?: string;        // "#ffffff" — opsional, untuk swatch
  hppPerGram: number;
  jualPerGram: number;
  failureRatePct?: number;  // opsional; kalau kosong pakai material[tipe].failureRatePct
}
```

`LocalSettings.filaments: FilamentEntry[]` — seed 3 contoh:

```ts
filaments: [
  { id: "fil-pla-putih",  brand: "eSUN",  material: "PLA+", tipe: "FDM", warna: "Putih", warnaHex: "#f5f5f5", hppPerGram: 300, jualPerGram: 500 },
  { id: "fil-petg-hitam", brand: "eSUN",  material: "PETG", tipe: "FDM", warna: "Hitam", warnaHex: "#1a1a1a", hppPerGram: 350, jualPerGram: 550 },
  { id: "fil-resin-abu",  brand: "Anycubic", material: "Resin", tipe: "SLA", warna: "Abu", warnaHex: "#9ca3af", hppPerGram: 500, jualPerGram: 800 },
]
```

> Angka seed di atas adalah **placeholder desain**; nilai final diambil dari `DEFAULT_MATERIAL` yang ada (FDM/SLA hpp & jual per gram) agar konsisten dengan default kalkulator. Task plan akan memakai nilai `DEFAULT_MATERIAL.FDM`/`.SLA` yang sebenarnya.

Label tampilan filament (dropdown & katalog) = `` `${brand} ${material} ${warna}` `` (mis. "eSUN PLA+ Putih").

### `PlateRow` → materials

```ts
export interface PlateMaterial {
  id: string;
  filamentId?: string;      // kalau diisi → tarif dari katalog
  tipe: "FDM" | "SLA";      // dipakai untuk fallback tarif kalau filamentId kosong
  gramasi: string;          // string (input mentah), seperti field lain
  warnaHex?: string;        // untuk swatch; ikut filament kalau dipilih
}

export interface PlateRow {
  id: string;
  nama: string;             // nama part (utk slicer) — TETAP dipertahankan
  materials: PlateMaterial[]; // default 1 entri
}
```

`newPlateRow()` → `{ id, nama: "", materials: [{ id, tipe: "FDM", gramasi: "", filamentId: undefined }] }`.

**Migrasi:** field lama `PlateRow.tipe`/`PlateRow.gramasi` dihapus, dipindah ke `materials[0]`. Semua pembaca (`Calculator`, `compute`, test) ikut diubah. `durasiJam` **tetap di level plate** (durasi milik proses cetak plate, bukan per-material).

Catatan: `warnaHex` **tidak** diteruskan ke core (`MaterialUsageV2` tak punya field warna; core mengabaikan warna untuk HPP). Warna murni untuk label/preview saas + dipakai 1b-6b.

## UI — Setting: section "Daftar filament"

Pola persis "Daftar pekerjaan" (`laborJobs`) di SettingsPanel. Section Pro. Tiap baris:

```
[brand] [material] [tipe FDM/SLA ▾] [warna + 🎨 swatch] [hpp/g] [jual/g] [✕]
```

- Swatch memakai `HexColorPicker`? **Tidak** — `HexColorPicker` untuk memilih dari daftar warna terkatalog, sedangkan di sini user **mendefinisikan** warna. Katalog filament pakai `<input>` teks hex sederhana + preview swatch (`isValidHexColor` dari `@3pb/ui` untuk validasi). `HexColorPicker` dipakai di sisi plate (memilih dari katalog).
- Tombol "＋ Tambah filament" menambah baris kosong (`newFilamentEntry()`).
- Validasi (`validateLocalSettings`): brand+material+warna tidak semua kosong; `hppPerGram > 0`; `jualPerGram > 0`; `warnaHex` kalau diisi harus valid; nama gabungan (`brand|material|warna` lowercase) **unik** (cegah dobel, pola sama seperti cek dup `laborJobs`).
- Persist Pro ke IndexedDB via `saveSettings` (sudah ada).

## UI — Produksi: multi-material per plate

Extend `PlateInput.tsx` (branch tak-locked). Setiap plate (baik single-plate maupun baris tabel multi-plate) mendapat:

- **Default (1 material, toggle off):** tampilan seperti sekarang — `[tipe ▾] [berat g] [durasi jam]`, kecuali `tipe`/`berat` sekarang berasal dari `materials[0]`. Ditambah tombol kecil "🎨 Multi-material" untuk plate itu.
- **Toggle on (multi-material):** baris `[filament ▾ (katalog)] [berat g] [🎨 swatch]` per material + tombol "＋ material". `tipe` plate mengikuti material (dropdown filament membawa tipe). Menghapus material terakhir mengembalikan ke single (toggle off).
  - Dropdown filament: opsi dari `settings.filaments` (label `brand material warna`), plus opsi "— tarif default (tanpa katalog) —" yang mengosongkan `filamentId` (fallback `material[tipe]`, butuh pilih tipe FDM/SLA manual).
  - Memilih filament → set `filamentId`, `tipe` (dari entry), `warnaHex` (dari entry).
  - `HexColorPicker` swatch: `options` = warna-warna di katalog untuk brand+material yang cocok dengan filament terpilih (kalau ada), memungkinkan ganti warna cepat. Kalau tak ada, swatch hanya menampilkan warna aktif.

Total plate (berat) = jumlah `gramasi` seluruh material. Total durasi tetap dari `durasiJam` plate. Baris TOTAL di tabel multi-plate menjumlahkan lintas plate seperti sekarang.

State toggle multi-material per plate: diturunkan dari `materials.length > 1`. Tak perlu flag terpisah — plate dianggap multi kalau punya >1 material; tombol "🎨 Multi-material" saat single menambah material ke-2 (membuka mode). Ini menjaga state minimal & idempoten.

## Wiring — `buildInputV2` (choke point)

`compute.ts`:

```ts
const rateOf = (m: PlateMaterial, ls: LocalSettings) => {
  const fil = m.filamentId ? ls.filaments.find((f) => f.id === m.filamentId) : undefined;
  const base = ls.material[m.tipe];
  return {
    gramasi: Number(m.gramasi) || 0,
    hppPerGram: fil?.hppPerGram ?? base.hppPerGram,
    jualPerGram: fil?.jualPerGram ?? base.jualPerGram,
    failureRatePct: fil?.failureRatePct ?? base.failureRatePct,
  };
};
```

`CalcPlate` menjadi `{ id; nama?; durasiJam; materials: {filamentId?; tipe; gramasi}[] }` (menggantikan `tipe/gramasi` tunggal). `toPlate` map `materials.map(rateOf)` → `MaterialUsageV2[]`. Fallback single-plate legacy (`c.tipe`/`c.gramasi`) tetap didukung sebagai `materials: [{ tipe, gramasi }]` demi test lama.

`strategi`/`fullView` lainnya **tidak berubah** — hanya jumlah material per plate yang bertambah; core sudah menjumlahkan `plateCost` lintas material.

## Testing

- **local-settings.test:** `DEFAULT_LOCAL_SETTINGS.filaments` ada & valid; `validateLocalSettings` menolak filament harga ≤ 0, hex invalid, dan nama duplikat; menerima katalog kosong.
- **compute.test:** (a) plate 1 material tanpa `filamentId` = hasil identik dengan sebelum 1b-6a (paritas); (b) plate 2 material dengan filament katalog berbeda → `biayaModal` = jumlah tarif katalog × gram masing-masing; (c) material dengan `filamentId` tak dikenal → fallback `material[tipe]`.
- **PlateInput test:** toggle multi-material menambah baris material; menghapus material ke-2 kembali single; total berat = jumlah material.
- **SettingsPanel test:** section "Daftar filament" render; tambah/hapus filament; edit hex swatch preview.
- Seluruh suite saas + core harus hijau; build lolos.

## Di luar scope (ditunda)

- **1b-6b:** import `.gcode`/`.3mf` (ekstrak parser dashboard → `packages/import-3mf`, `jszip`, auto-isi plates).
- Fuzzy-match brand+material & nearest-color sort ala dashboard (`color-catalog.ts`) — saas pilih manual.
- Simpan hasil + riwayat (1b-4), format angka live (deferred).

## File yang tersentuh (perkiraan)

- `apps/saas/lib/kalkulator/local-settings.ts` — `FilamentEntry`, `LocalSettings.filaments`, seed, `validateLocalSettings`, `newFilamentEntry()`.
- `apps/saas/lib/kalkulator/compute.ts` — `CalcPlate.materials`, `rateOf`, `toPlate`.
- `apps/saas/components/PlateInput.tsx` — `PlateMaterial`, `PlateRow.materials`, UI toggle + baris material.
- `apps/saas/components/Calculator.tsx` — plumbing `settings.filaments` ke PlateInput; migrasi state.
- `apps/saas/components/SettingsPanel.tsx` — section "Daftar filament".
- Test terkait di atas.
