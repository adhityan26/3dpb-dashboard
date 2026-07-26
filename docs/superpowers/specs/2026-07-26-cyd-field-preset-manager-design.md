# CYD Field Preset Manager — Design

## Goal

Saat ini "Field preset" di editor layout CYD (`/cyd-layout`) cuma 2 pilihan tetap (`Ringkas`, `Detail`), hardcoded di `FIELD_PRESETS` (`lib/cyd-layout/types.ts`). User tidak bisa nambah/edit kombinasi field sendiri tanpa ubah kode + deploy. Fitur ini bikin preset field bisa di-manage lewat UI (tambah/edit/hapus), disimpan di DB, dipakai bareng oleh siapa saja yang login.

## Non-goals

- Tidak menambah jenis informasi baru di luar 9 `FieldId` yang sudah dikenal firmware CYD (`name, type, state, progress, progressBar, timeLeft, eta, filename, error`) — itu butuh ubah firmware, di luar scope ini.
- Tidak ada preset per-user atau per-device — satu daftar global.
- Tidak ada referensi tersimpan dari layout ke preset by-ID. Sama seperti sekarang: pilih preset = copy field rows-nya ke `cell.fields`/`page.fields` saat itu juga. Preset murni alat bantu authoring.

## Data Model

Tambah model Prisma baru:

```prisma
model CydFieldPreset {
  id        String   @id @default(cuid())
  name      String
  fields    Json     // FieldRow[] — shape sama dengan FIELD_PRESETS sekarang (lib/cyd-layout/types.ts)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Seed migration mengisi 2 baris awal — "Ringkas" dan "Detail" — persis nilai `FIELD_PRESETS` yang ada sekarang, supaya tidak ada perubahan perilaku untuk layout yang sudah dibuat.

## Validasi

Batas firmware (`layout_types.h`, sudah ada di `LAYOUT_LIMITS`):
- Maks 3 field per baris (`maxFieldsPerRow`)
- Maks 8 baris untuk default halaman (`maxRowsPerFieldsPageDefault`)
- Maks 3 baris untuk override per-sel (`maxRowsPerFieldsCellOverride`) — preset dengan >3 baris tetap bisa dibuat/disimpan (untuk dipakai sebagai default halaman), tapi difilter dari daftar pilihan saat konteksnya override sel (persis logika `CELL_OVERRIDE_PRESETS` yang sudah ada di `CellSettingsPanel.tsx`).

Fungsi `validateFieldRows` di `lib/cyd-layout/build-config.ts` di-extract jadi reusable (dipindah ke `lib/cyd-layout/validate-fields.ts` atau tetap di `build-config.ts` tapi di-export), dipakai baik oleh full-config validation yang sudah ada MAUPUN validasi API preset baru (dengan `maxRows = LAYOUT_LIMITS.maxRowsPerFieldsPageDefault`, batas paling longgar — pembatasan konteks-sel dilakukan di client saat filter daftar pilihan, bukan saat create/edit preset).

## API

- `app/api/cyd-field-presets/route.ts`
  - `GET` — list semua preset, urut `createdAt asc`.
  - `POST` — buat baru. Body `{name: string, fields: FieldRow[]}`. Validasi: `name` non-kosong, `fields` lolos `validateFieldRows` (maks 8 baris, maks 3 field/baris). 400 kalau gagal.
- `app/api/cyd-field-presets/[id]/route.ts`
  - `PATCH` — edit `name` dan/atau `fields`. Validasi sama seperti POST.
  - `DELETE` — hapus. Tidak ada guard referential — preset boleh dihapus kapan saja karena tidak direferensikan by-ID di manapun.

## Komponen UI

### `components/settings/CydFieldPresetCard.tsx` (baru)
Card baru di halaman Settings, mengikuti pola visual card settings yang sudah ada (mis. `CydDeviceCard.tsx`).
- List preset: nama + preview ringkas field rows (mis. `[name] · [state, progress] · [progressBar]`, join label field-nya).
- Tombol edit (buka form) dan hapus (konfirmasi inline) per baris.
- Tombol "+ Preset baru" di atas list, buka form kosong.

### `components/settings/CydFieldPresetForm.tsx` (baru)
Dipakai untuk create maupun edit (mode ditentukan dari prop `preset?: CydFieldPreset`). Modal atau inline (ikuti pola form settings lain yang ada di codebase).
- Input nama (text, required).
- Builder baris field:
  - Tiap baris: 1-3 dropdown pilih `FieldId` (dari 9 field yang dikenal) + input label opsional (dipakai kalau field butuh label kustom, contoh nyata: `timeLeft`→"Sisa", `eta`→"ETA" di preset Detail sekarang).
  - Tombol "+ field" per baris (disable kalau baris sudah 3 field).
  - Tombol hapus baris.
  - Tombol "+ baris" di bawah list baris (disable kalau sudah 8 baris).
- Tombol Simpan disable kalau: nama kosong, ada baris tanpa field sama sekali, atau field rows kosong total.
- Simpan → POST (create) atau PATCH (edit) → invalidate query → tutup form.

### Perubahan ke komponen existing
- `CellSettingsPanel.tsx`: dropdown "Field preset" pindah sumber dari `Object.keys(FIELD_PRESETS)` (const) ke hasil `useCydFieldPresets()` (React Query), tetap filter preset yang field rows-nya ≤ `maxRowsPerFieldsCellOverride` (logika `CELL_OVERRIDE_PRESETS` dipertahankan, cuma sumber datanya ganti).
- `app/(dashboard)/cyd-layout/page.tsx`: **tidak ada dropdown pilihan** saat ini — halaman baru (`DEFAULT_CONFIG` dan tombol tambah halaman) langsung hardcode `fields: FIELD_PRESETS.ringkas`. Setelah migrasi, dua titik ini pakai fields dari preset pertama hasil `useCydFieldPresets()` (fallback array kosong `[]` kalau daftar preset kosong, supaya tidak crash saat DB belum ke-seed) — bukan dropdown baru, cukup ganti sumber datanya. Preset "Ringkas" hasil seed migration akan selalu jadi entry pertama (`createdAt asc`), jadi perilaku defaultnya sama persis dengan sekarang.
- `FIELD_PRESETS` const di `lib/cyd-layout/types.ts` **dihapus** setelah migrasi — semua pemakai pindah ke DB via hook. `LAYOUT_LIMITS` dan tipe (`FieldId`, `FieldRow`, dst) tetap.

## Data Flow

Hook baru `lib/hooks/use-cyd-field-presets.ts`:
- `useCydFieldPresets()` — `useQuery(['cyd-field-presets'], ...)`, dipakai di 3 tempat (Settings card, CellSettingsPanel, cyd-layout page).
- `useCreateCydFieldPreset()`, `useUpdateCydFieldPreset()`, `useDeleteCydFieldPreset()` — `useMutation`, tiap sukses invalidate `['cyd-field-presets']`.

## Error Handling

- API: 400 dengan pesan error dari `validateFieldRows` kalau field rows invalid (format sama dengan error message full-config validation yang sudah ada, konsisten bahasa Indonesia).
- UI: pesan error dari API ditampilkan di form (bukan hilang diam-diam); tombol simpan tetap disable duluan untuk validasi yang bisa dicek di client (nama kosong, field kosong) supaya user jarang kena 400.
- Hapus preset: tidak ada dependency check (lihat Non-goals) — konfirmasi inline cukup ("Yakin hapus preset ini?").

## Testing

- `lib/cyd-layout/__tests__/validate-fields.test.ts` (extract dari `build-config.test.ts` yang sudah ada, ditambah test baru untuk konteks preset).
- `app/api/cyd-field-presets/__tests__/route.test.ts` — create/edit/delete + validasi gagal (>8 baris, >3 field/baris, nama kosong).
- `lib/hooks/__tests__/use-cyd-field-presets.test.ts` — mengikuti pola test hook lain yang sudah ada (mock fetch, assert query key & invalidation).
- Tidak menyentuh 14 golden test kalkulator (`packages/kalkulator-core/src/formula.test.ts`) — di luar scope.

## Global Constraints

- Node 22 wajib untuk build/test (`export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`).
- Kerja di worktree terpisah (`.claude/worktrees/dashboard-work`, branch `dashboard-work`) sesuai aturan repo — jangan commit langsung ke `master`.
- Dependency baru (kalau ada, misal library form) harus dideklarasikan eksplisit di `package.json` — pnpm strict, tidak ada phantom dependency.
- Ikuti `docs/ui-page-layout.md` — halaman/section baru di Settings tetap dibungkus `PageShell`/pola card settings yang sudah ada, jangan bikin wrapper sendiri.
