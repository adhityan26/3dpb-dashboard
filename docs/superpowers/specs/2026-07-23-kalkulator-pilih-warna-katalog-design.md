# Pilih Warna dari Katalog Filament — Design

## Latar belakang

Field warna filament di kalkulator (`PlateTable.tsx`) sekarang cuma text input hex manual. Warna sering sudah keisi otomatis dari hasil import 3MF (fitur sebelumnya), tapi user tidak bisa memilih warna dari katalog spool/AMS yang sebenarnya dipakai — cuma bisa ngetik hex sendiri.

Ada dua katalog terpisah di codebase ini:
- **`FilamentHarga`** (`brand, material, hargaPerGram`) — katalog harga, dipakai `FilamentPicker` buat isi rate kalkulator. **Tidak punya data warna.**
- **`FilamentCatalog`** (`brand, material, colorName, colorHex`) — katalog warna real dari AMS/spool management, sudah ada hook `useCatalog()` (`/api/filamen/catalog`) yang return `Record<brand, Record<material, FilamentCatalogEntry[]>>`.

Fitur ini menyambungkan keduanya: begitu user pilih brand+material via `FilamentPicker`, tawarkan pilihan warna dari `FilamentCatalog` yang cocok.

## Scope

Berlaku untuk **kedua mode**: single-material (field baru, belum ada sekarang) dan multi-material (field `color` per `FilamentEntry`, sudah ada).

### Perubahan tipe data (single-material)

`PlateInput` (`packages/kalkulator-core/src/types.ts`) tambah field baru:
```ts
export interface PlateInput {
  // ...existing fields...
  color?: string   // hex warna filament (single-material mode)
}
```

`KalkulasiPlate` (Prisma) tambah kolom:
```prisma
model KalkulasiPlate {
  // ...existing fields...
  color String?   // hex warna filament, single-material mode
}
```
Nullable, additive migration — aman buat data lama (default `null`, tidak mengubah perhitungan HPP apa pun karena warna murni informational, tidak dipakai `hitungKalkulasiV2`).

## Matching brand+material → warna katalog

Brand/material di `FilamentHarga` kadang beda penulisan dari `FilamentCatalog` (mis. "Bambu Lab" vs "BambuLab"). Matching pakai **fuzzy substring dua arah, case-insensitive** — pola yang sama persis dengan `materialProfileMatchesFilament` yang sudah ada (dipakai buat filter Profil Material):

```ts
function catalogMatchesFilament(catalogField: string, filamentField: string): boolean {
  const a = catalogField.trim().toLowerCase()
  const b = filamentField.trim().toLowerCase()
  if (!a || !b) return true
  return a.includes(b) || b.includes(a)
}
```

Match diterapkan ke **brand DAN material** — kalau brand belum dipilih (FilamentPicker belum di-set), match by material aja.

## Sorting

- Kalau field `color` baris itu sudah punya hex valid (biasa dari hasil import 3MF) → sort katalog by **jarak warna RGB Euclidean** terdekat ke situ dulu.
  ```ts
  function hexDistance(a: string, b: string): number {
    const [r1,g1,b1] = hexToRgb(a), [r2,g2,b2] = hexToRgb(b)
    return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2)
  }
  ```
- Kalau `color` kosong/invalid → sort alfabetis by `colorName`.

## UI — swatch jadi tombol trigger (dikonfirmasi via mockup)

`HexColorSwatch` (`@3pb/ui`) yang sekarang cuma display-only, ditambah varian interaktif: `onClick` opsional yang bikin dia jadi tombol (cursor pointer + hover state), buka popover kecil di bawahnya — visual style mirip `FilamentPicker`'s dropdown (list warna: swatch + colorName + colorHex, scrollable, item terpilih di-highlight).

- Klik salah satu warna → set `color` (single-mode: `plate.color` via `updatePlateFields`; multi-mode: `mat.color` via `updateMaterial`) ke `colorHex` katalog yang dipilih.
- Text input hex manual **tetap ada di sebelahnya**, tidak digantikan — popover cuma shortcut opsional.
- Kalau brand+material tidak match apa pun di `FilamentCatalog` (list kosong setelah fuzzy match) → klik swatch tetap buka popover, tapi isinya pesan "Tidak ada warna terkatalog untuk kombinasi ini" (bukan disable total, biar user tahu itu memang belum ada datanya bukan bug).

## Komponen baru

- `apps/dashboard/lib/kalkulator/color-catalog.ts` — pure functions: `catalogMatchesFilament`, `hexDistance`, `sortCatalogColors(entries, referenceColor)`. Testable tanpa React.
- Komponen baru `HexColorPicker` di `@3pb/ui` — membungkus `HexColorSwatch` yang sudah ada + popover dropdown list warna. Reusable via `@3pb/ui` biar konsisten dengan keputusan sebelumnya soal shared component (siap dipakai `apps/saas` juga kalau nanti butuh).
- Wiring di `PlateTable.tsx`: dua titik pasang (single-mode Gramasi/Durasi section, multi-mode Color column), keduanya pakai `useCatalog()` yang sudah ada.

## Error handling

- `useCatalog()` gagal/loading → popover tetap bisa dibuka tapi nunjukin state loading/kosong, tidak block text input manual.
- Warna dipilih dari katalog vs diketik manual **disimpan sama** (cuma string hex) — tidak ada tracking "sumbernya dari katalog atau manual", sesuai desain field `color` yang sudah ada (single source of truth, simpel).

## Scope non-implementasi

- Tidak menambah UI kelola `FilamentCatalog` baru (sudah ada di halaman Produk → Filamen, di luar scope ini).
- Tidak mengubah kalkulasi HPP — warna tetap murni informational, tidak masuk `hitungKalkulasiV2`.
- Tidak menyimpan histori/preferensi warna terakhir dipakai per brand+material (YAGNI, bisa ditambah nanti kalau perlu).
