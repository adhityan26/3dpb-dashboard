# Katalog Pekerjaan Labor — Autocomplete + Auto-isi Tarif (apps/saas)

**Tanggal:** 2026-07-23
**Status:** Design disetujui, siap plan
**Worktree:** `feat/saas-labor-catalog`

## Ringkasan

Di section Finishing & tenaga kerja, user mengetik ulang tarif tiap pekerjaan (Painting 75rb/jam, Assembly 35rb/jam, …) padahal dipakai berulang. Fitur ini menambah **katalog pekerjaan** yang bisa dipakai ulang: field nama pekerjaan jadi autocomplete; memilih pekerjaan yang dikenal **mengisi tarif otomatis**; pekerjaan baru dibuat lewat popup tarif dan **tersimpan ke katalog** untuk dipakai lagi. Katalog dikelola di halaman Setting.

**Batasan keras:** **formula bisnis tak berubah** — katalog hanya sumber tarif untuk mengisi baris labor; perhitungan tetap `jam × ratePerJam` atau `flat` seperti sekarang (`composeLabor`).

## Keputusan brainstorming

| Keputusan | Pilihan |
|---|---|
| Pekerjaan baru | **Popup isi tarif** (metode per-jam/flat + tarif) → **auto masuk katalog** + baris terisi |
| Kelola katalog | **Section "Daftar pekerjaan" di Setting** (edit/hapus) + auto-tumbuh dari pemakaian |
| Autocomplete | `<datalist>` native di field nama; pilih dikenal → tarif+metode auto-isi (tak menimpa isian manual) |
| Gating | Labor tetap Pro. Katalog Free = default read-only (auto-isi jalan; tambah/simpan pekerjaan baru khusus Pro yang persist) |

## Model data

Tambah field **`laborJobs`** ke `LocalSettings` (`apps/saas/lib/kalkulator/local-settings.ts`):

```ts
export interface LaborJob { id: string; nama: string; ratePerJam?: number; flat?: number }
// LocalSettings tambah: laborJobs: LaborJob[];
```

- Satu job = **per-jam** (`ratePerJam` diisi, `flat` kosong) ATAU **flat** (`flat` diisi, `ratePerJam` kosong).
- **Seed `DEFAULT_LOCAL_SETTINGS.laborJobs`** (dari pekerjaan yang sudah ada di preset):
  - `{ id: "job-assembly", nama: "Assembly", ratePerJam: 35000 }`
  - `{ id: "job-sanding", nama: "Sanding", ratePerJam: 35000 }`
  - `{ id: "job-painting", nama: "Painting", ratePerJam: 75000 }`
- `toSettingsV2(ls)` **tidak berubah** (katalog murni UI, bukan input formula).
- `validateLocalSettings`: tiap job `nama` non-kosong & (`ratePerJam ?? 0) >= 0` & `(flat ?? 0) >= 0`.
- Backward-compat load: `loadSettings` mengembalikan `LocalSettings` dari IndexedDB; settings lama (tanpa `laborJobs`) → **isi default** (`laborJobs: stored.laborJobs ?? DEFAULT_LOCAL_SETTINGS.laborJobs`) supaya user lama tak error.

## Komponen & alur

### `LaborInput.tsx` (ubah)
Props tambahan: `jobs: LaborJob[]`, `onAddJob: (job: { nama: string; ratePerJam?: number; flat?: number }) => void`.

1. **Datalist**: render `<datalist id="labor-jobs">` berisi `<option value={job.nama}>` untuk tiap job. Field nama pekerjaan `list="labor-jobs"` → dropdown saran native saat mengetik.
2. **Auto-isi saat cocok**: pada perubahan nama, kalau nilai barunya **sama persis** (case-insensitive, trim) dengan salah satu `jobs[].nama` **DAN** baris itu belum punya tarif (`jam == null && ratePerJam == null && flat == null`), isi otomatis: kalau job punya `ratePerJam` → set `ratePerJam` (metode per-jam), kalau `flat` → set `flat` (metode flat). **Jangan menimpa** kalau baris sudah ada nilai (user sedang edit manual).
3. **Popup pekerjaan baru**: pada `onBlur` field nama, kalau nama non-kosong **DAN** tak ada di katalog **DAN** baris belum punya tarif **DAN** belum pernah di-dismiss untuk baris itu → buka `NewJobDialog`.
   - Dialog: judul "Pekerjaan baru: **{nama}**", pilih metode [⏱ Per jam] [Rp Tetap], input tarif, tombol **Simpan & pakai** / **Nanti**.
   - **Simpan**: `onAddJob({ nama, ratePerJam? / flat? })` (menambah ke katalog + persist untuk Pro) lalu set tarif baris itu.
   - **Nanti**: tutup dialog, tandai baris ini "dismissed" (state lokal `Set<rowId>`) supaya tak nge-pop lagi; user isi manual.
4. Sisanya (chip metode, helper menit, subtotal — dari Arah A) tetap.

### `NewJobDialog` (baru, bisa inline di LaborInput atau file sendiri)
Modal overlay bertema Glass (`modal-surface`), `role="dialog" aria-modal`, tutup via backdrop/Esc/Nanti. Validasi tarif ≥ 0.

### `Calculator.tsx` (ubah)
- Teruskan `jobs={settings.laborJobs}` + `onAddJob` ke `LaborInput`.
- `onAddJob(job)`: buat `LaborJob` baru (`id: newId()`), `const next = { ...settings, laborJobs: [...settings.laborJobs, newJob] }`, `setSettings(next)`, dan untuk **Pro** (`paidCore && userId`) `saveSettings(userId, next)` (persist IndexedDB). Kalau nama sudah ada di katalog, jangan dobel (update/skip).

### `SettingsPanel.tsx` (ubah)
Section baru **"Daftar pekerjaan"** (di grup Tambahan): daftar `laborJobs` dengan baris `[nama][metode per-jam/flat][tarif][hapus]` + tombol "＋ Tambah pekerjaan". Pola sama seperti manajemen `komponenPresets`/`laborPresets` yang sudah ada (add/set/del + Simpan meneruskan ke `saveSettings`). Read-only untuk non-editable (Free view).

## Persistensi

- Pro: perubahan katalog (dari popup di kalkulator ATAU dari Setting) → `saveSettings(userId, settings)` (IndexedDB, store `slizebiz-local`).
- Free: `laborJobs` = default (read-only); popup pekerjaan baru **tetap mengisi baris** tapi tak persist (atau: sembunyikan tombol simpan-ke-katalog untuk Free — labor sendiri Pro-gated jadi Free tak sampai ke sini). Karena section labor sudah `locked` untuk Free, alur popup praktis hanya Pro.

## Testing (TDD)

- **`local-settings.test.ts`**: `DEFAULT_LOCAL_SETTINGS.laborJobs` berisi Assembly/Sanding/Painting dgn tarif benar; `validateLocalSettings` menolak job tarif negatif; load settings lama tanpa `laborJobs` → terisi default.
- **`LaborInput.test.tsx`** (tambah):
  - datalist berisi nama job dari `jobs`.
  - ketik nama yang cocok katalog (baris kosong) → auto-isi `ratePerJam` sesuai katalog; TIDAK menimpa kalau baris sudah ada tarif.
  - blur nama baru (tak di katalog, baris kosong) → `NewJobDialog` muncul; Simpan → `onAddJob` dipanggil dgn nama+tarif + baris terisi; Nanti → dialog tutup, tak memanggil onAddJob, tak nge-pop lagi.
- **`Calculator` / integrasi**: `onAddJob` menambah ke `settings.laborJobs`; Pro → `saveSettings` dipanggil (mock).
- **`SettingsPanel.test.tsx`** (tambah): section "Daftar pekerjaan" render job; tambah/hapus/edit; Simpan meneruskan `laborJobs` baru.
- Semua test existing (275) tetap hijau; formula core tak tersentuh.

## Global Constraints

- **Bahasa Indonesia** semua copy/komentar.
- **Formula bisnis tak berubah**; `laborJobs` katalog UI, bukan input `composeLabor`/core.
- **`newId()`** untuk id job/baris — jangan `crypto.randomUUID()`.
- `LocalSettings` diperluas **additive**; load backward-compat (settings lama → default `laborJobs`).
- Popup pakai `modal-surface`, `role="dialog"`, aksesibilitas keyboard (Esc tutup, focus).
- Border-radius kontrol 5px (konsisten pass terakhir). Tema Glass dark/light.
- Kerja hanya di worktree `feat/saas-labor-catalog`; commit path spesifik, jangan `git add -A`.
- Deploy homelab :3300 gated.

## Di luar scope (follow-up)

- Impor/preset katalog masal, kategori pekerjaan.
- Sinkron katalog ke cloud (sekarang lokal IndexedDB per user).
- Fuzzy match / ranking autocomplete (cukup datalist native + exact-match autofill).
