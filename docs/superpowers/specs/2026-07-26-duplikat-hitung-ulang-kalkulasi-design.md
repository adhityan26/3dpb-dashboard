# Duplikat kalkulasi + Hitung ulang tarif (apps/saas)

**Tanggal:** 2026-07-26
**Status:** Design (disetujui via brainstorm — siap ditulis plan)
**Prasyarat:** Fase 1b-4 (Simpan hasil kalkulasi + Riwayat) MERGED & DEPLOYED. Ini melengkapi item yang eksplisit dikeluarkan dari scope 1b-4 ("Duplikat kalkulasi TIDAK masuk scope ini").

## Tujuan

User Pro bisa **menduplikasi** kalkulasi tersimpan (dari Riwayat atau dari halaman edit) jadi record baru, dan **menghitung ulang** harga sebuah record tersimpan pakai tarif katalog terkini tanpa harus membuka halaman edit — dengan melihat dulu perbandingan harga lama vs baru sebelum menimpa.

## Keputusan terkunci (brainstorm 2026-07-26)

1. **Tombol duplikat ada di DUA tempat**: baris `RiwayatList` (ikon 📋, di samping 🗑️ Hapus) DAN di `ResultPanel` saat membuka `/kalkulator/[id]` untuk edit (tombol "📋 Duplikat", cuma muncul saat `isEditing`).
2. **Nama hasil duplikat = nama asli + " (salinan)"** otomatis (bukan prompt, bukan sama persis tanpa suffix).
3. **Duplikat dari halaman edit → pindah ke halaman edit record baru** (`router.push` ke `/kalkulator/[id-baru]`), konsisten dengan perilaku "simpan pertama kali".
4. **Duplikat dari RiwayatList → tetap di halaman Riwayat** (list refresh, salinan baru muncul di baris atas karena `updatedAt` terbaru).
5. **Snapshot duplikat SELALU dihitung ulang** pakai tarif katalog terkini saat itu (bukan copy snapshot lama apa adanya):
   - Dari halaman edit: pakai `view` yang sudah live-computed di layar (termasuk perubahan form yang belum disimpan).
   - Dari RiwayatList: dihitung via fungsi murni baru `computeKalkulasiSnapshot(input, settings)` (RiwayatList sebelumnya tidak pernah memuat `settings`/menghitung apa pun — sekarang perlu, sama seperti Calculator).
6. **Fitur terpisah: tombol "🧮 Hitung ulang" per-baris di RiwayatList** — menimpa `snapshot` record YANG SAMA (bukan duplikat, bukan buka halaman edit) pakai tarif katalog terkini.
   - **Sebelum menimpa, tampilkan perbandingan harga lama → baru + selisih via `window.confirm`** (pola sama seperti konfirmasi Hapus yang sudah ada) — mis. `Perbarui harga "Vas bunga"?\nRp180.000 → Rp210.000 (+Rp30.000)`. Klik OK → timpa. Klik Cancel → record tak berubah sama sekali.
   - **Kalau harga baru SAMA PERSIS dengan harga lama** (tarif belum berubah) → tampilkan pesan info singkat "Tidak ada perubahan — harga masih sama", **tanpa dialog konfirmasi, tanpa menulis apa pun** ke record (termasuk `updatedAt` tidak ikut berubah).
   - Kalau `computeKalkulasiSnapshot` mengembalikan `null` (data plate rusak/tak valid) → pesan error singkat, tak ada yang disimpan.
7. **Delete/Refresh-list yang sudah ada TIDAK berubah.**

## Arsitektur

### `apps/saas/lib/kalkulator/snapshot.ts` (baru) — fungsi murni

Ekstraksi logic yang sudah ada di `Calculator.tsx` (`toCalcPlate`/`valid`/`fullView`), supaya bisa dipakai ulang oleh `RiwayatList` yang tidak (dan tidak akan) menyimpan state form. **`Calculator.tsx`'s `handleSave` TIDAK direfactor** untuk memakai fungsi ini — `handleSave` sudah punya `view` ter-computed sekali, memanggil fungsi ini lagi di sana cuma bikin `fullView` dipanggil dua kali untuk hasil yang sama (boros, bukan DRY yang berguna). Fungsi ini murni dipakai oleh alur yang TIDAK punya `view` siap pakai (RiwayatList).

```ts
export function computeKalkulasiSnapshot(
  input: KalkulasiInput,
  settings: LocalSettings
): KalkulasiSnapshot | null;
```

- `null` kalau `input.plates` kosong, atau ada plate dengan `durasiJam<=0`, atau material dengan `gramasi<=0` (persis validasi `valid` yang sudah ada di `Calculator.tsx`).
- Selain itu: convert `PlateRow[]` → `CalcPlate[]` (logic `toCalcPlate` yang sama persis), panggil `fullView({ plates, batch: Number(input.batch), komponen: input.komponen, labor: input.labor, packing: input.packing }, settings)`, map ke `KalkulasiSnapshot` (5 field yang sama seperti `handleSave` sudah lakukan).

### `apps/saas/components/ResultPanel.tsx` — tombol Duplikat baru

Prop baru `onDuplicate?: () => void`. Render tombol "📋 Duplikat" HANYA kalau `onDuplicate` di-pass (pola identik `onSave` — tak dirender sama sekali kalau tak ada, bukan cuma disembunyikan). Ditaruh di antara "Reset" dan "Simpan/Update" (posisi: Salin harga jual | Reset | Duplikat | Simpan/Update).

### `apps/saas/components/Calculator.tsx` — `handleDuplicate`

- Prop `onDuplicate` di-pass ke `ResultPanel` HANYA kalau `paidCore && savedId !== undefined` (duplikat cuma masuk akal untuk record yang sudah tersimpan — kalkulasi baru yang belum pernah disimpan tak punya apa pun buat diduplikasi selain di-Simpan biasa).
- `handleDuplicate`: guard `saving` yang SAMA dengan `handleSave` (dipakai bersama — cegah klik ganda Duplikat maupun Simpan/Update saling tumpang tindih saat salah satu sedang berjalan). Bikin `id = newId()` (SELALU baru, tak pernah reuse `savedId`), `nama = (nama.trim() || fallback tanggal) + " (salinan)"`, `createdAt = updatedAt = new Date().toISOString()` (record baru, bukan turunan waktu record asli), `input` = state form SAAT INI (`plates/batch/komponen/labor/packing/channel/tier` — termasuk perubahan yang belum di-"Update"), `snapshot` dari `view` yang sedang tampil. `putKalkulasi(record)` lalu `router.push('/kalkulator/' + id)` — record ASLI (`savedId`) sama sekali tak disentuh/ditimpa.

### `apps/saas/components/RiwayatList.tsx` — 2 aksi baru per baris

- State baru `settings` (dimuat via `loadSettings(userId)` sekali saat mount, mirip pola `Calculator.tsx` — `RiwayatList` sudah pasti Pro-only lewat gating di level route, jadi tak perlu ulang cek `paidCore`).
- State baru `actionMsg` (pesan info/error singkat, tampil di atas list, pola sama seperti `saveMsg` di `Calculator.tsx`).
- **`onDuplicate(record)`**: `computeKalkulasiSnapshot(record.input, settings)` → kalau `null`, `setActionMsg("Gagal duplikat — data plate tidak valid")` & stop. Kalau berhasil: `id = newId()`, `nama = record.nama + " (salinan)"`, `createdAt = updatedAt = now`, `input` = klon `record.input` apa adanya, `snapshot` = hasil hitung baru. `putKalkulasi(copy)` → `load()` (refresh list, TIDAK pindah halaman).
- **`onRecalculate(record)`**: `computeKalkulasiSnapshot(record.input, settings)` → kalau `null`, pesan error & stop. Kalau `newSnapshot.rekomendasi === record.snapshot.rekomendasi` → `setActionMsg("Tidak ada perubahan — harga masih sama")`, **tak ada `window.confirm`, tak ada `putKalkulasi`**. Kalau beda: `delta = newSnapshot.rekomendasi - record.snapshot.rekomendasi`, `sign = delta >= 0 ? "+" : "-"`, selisih ditampilkan pakai `rupiah(Math.abs(delta))` (BUKAN `rupiah(delta)` langsung — `rupiah` cuma `Math.round(n).toLocaleString("id-ID")`, delta negatif akan tampil ganda-minus/aneh kalau tak di-`Math.abs` dulu). Pesan: `` `Perbarui harga "${record.nama}"?\n${rupiah(record.snapshot.rekomendasi)} → ${rupiah(newSnapshot.rekomendasi)} (${sign}${rupiah(Math.abs(delta))})` ``. `window.confirm(pesan)` → kalau `false`, stop tanpa perubahan apa pun; kalau `true`, `putKalkulasi({ ...record, updatedAt: now, snapshot: newSnapshot })` → `load()`.
- UI baris: `[Link nama+tanggal+harga] [📋 Duplikat] [🧮 Hitung ulang] [🗑️ Hapus]` — `aria-label` masing-masing ("Duplikat"/"Hitung ulang"/"Hapus") untuk konsistensi pola test yang sudah ada.

## Backward-compat & paritas

- `ResultPanel` tanpa `onDuplicate` (default, semua caller lain yang belum di-update) berperilaku identik seperti sekarang — tombol tak dirender.
- `Calculator.tsx` untuk kalkulasi yang BELUM pernah disimpan (`savedId===undefined`) tak menampilkan tombol Duplikat sama sekali — tak ada perubahan perilaku di jalur ini.
- Formula core (`packages/kalkulator-core`) TIDAK berubah — `computeKalkulasiSnapshot` cuma membungkus ulang `fullView` yang sudah ada, sama seperti `handleSave` sudah lakukan sebelumnya.
- Free tier: nol perubahan — `RiwayatList` maupun tombol Duplikat/Hitung-ulang sama sekali tak pernah tampil (halaman `/` Free tetap Calculator langsung, `/kalkulator/[id]` Pro-only).

## Di luar scope

- **Riwayat versi harga** (menyimpan array snapshot lama dari waktu ke waktu) — cuma diff sekali-tampil saat "Hitung ulang", bukan history harga penuh.
- **Undo** setelah "Timpa" dikonfirmasi — kalau user klik OK lalu menyesal, harus "Hitung ulang" lagi manual atau re-edit manual (tak ada snapshot lama tersimpan setelah ditimpa).
- **Recalculate massal** (semua baris sekaligus) — satu per satu saja.
- **Refactor `handleSave` untuk memakai `computeKalkulasiSnapshot`** — sengaja tidak, `view` yang sudah ada sudah cukup & lebih efisien untuk `handleSave`.

## Testing

- `snapshot.test.ts` (baru): input valid → field-field snapshot sesuai `fullView` fixture yang sudah ada di `compute.test.ts`; plate durasi 0 → `null`; material gramasi 0 → `null`; plates kosong → `null`.
- `ResultPanel.test.tsx` (tambahan): tombol Duplikat muncul cuma kalau `onDuplicate` di-pass; klik memanggilnya.
- `Calculator.test.tsx` (tambahan): tombol Duplikat TIDAK muncul saat `savedId===undefined` (kalkulasi baru); muncul saat `kalkulasiId` di-set (editing); klik → `putKalkulasi` dipanggil dengan id BEDA dari `kalkulasiId` awal, `nama` berakhiran " (salinan)", `router.push` ke `/kalkulator/[id-baru]` (bukan id lama).
- `RiwayatList.test.tsx` (tambahan): Duplikat → `putKalkulasi` dipanggil dgn id baru + nama+"(salinan)", list reload, TIDAK ada navigasi; Duplikat dengan input tak valid → pesan error, `putKalkulasi` TIDAK dipanggil; Hitung ulang harga beda → `window.confirm` dipanggil dgn pesan mengandung kedua harga, confirm `true` → `putKalkulasi` dgn id SAMA; confirm `false` → `putKalkulasi` TIDAK dipanggil; Hitung ulang harga SAMA → tak ada `window.confirm` sama sekali, pesan "Tidak ada perubahan", `putKalkulasi` TIDAK dipanggil.
- Regresi crypto (`newId()`, bukan `crypto.randomUUID()`) — konsisten pola yang sudah ada.

## File tersentuh (perkiraan)

**Baru:** `apps/saas/lib/kalkulator/snapshot.ts` (+ `.test.ts`).
**Diubah:** `apps/saas/components/ResultPanel.tsx` (+ `.test.tsx`), `apps/saas/components/Calculator.tsx` (+ `.test.tsx`), `apps/saas/components/RiwayatList.tsx` (+ `.test.tsx`).
