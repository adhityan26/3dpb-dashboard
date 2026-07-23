# Thumbnail Plate dari 3MF — Design

## Latar belakang

File `.gcode.3mf` (hasil slice Bambu Studio/OrcaSlicer) menyimpan preview render tiap plate di `Metadata/plate_N.png` — gambar hasil render 3D dari plate itu, biasa muncul di UI Bambu Studio sendiri. Fitur import-3mf yang sudah ada (client-side, JSZip) belum mengekstrak/memakai gambar ini sama sekali — cuma metadata teks. Fitur ini menambahkan: ekstrak gambar itu saat import, tampilkan sebagai thumbnail per Part/Plate di form kalkulator, dan simpan permanen supaya tetap muncul saat kalkulasi dibuka lagi nanti.

## Yang disimpan: thumbnail PNG, bukan file 3MF

Cuma gambar `plate_N.png` (~50-200KB) yang diekstrak & diupload — file `.gcode.3mf` aslinya (bisa puluhan MB, berisi G-code) tetap sepenuhnya diproses client-side dan tidak pernah dikirim ke server, konsisten dengan desain fitur import-3mf sebelumnya.

## Storage: MinIO, reuse infra existing

Reuse `lib/minio.ts`/`lib/lg-storage.ts` (bucket `LG_BUCKET`, sudah dipakai foto order light-generator & strava) — prefix key baru `kalkulator-thumbnails/{plateId}.png`. Tidak perlu bucket/env var baru.

## Alur upload — dua fase

Plate belum punya `id` asli sebelum Kalkulasi disimpan (id di-generate DB saat create), jadi upload thumbnail terjadi **setelah** save, bukan bersamaan dengan import:

1. **Saat import 3MF**: browser ekstrak `Metadata/plate_N.png` per plate (JSZip, sudah dipakai fitur import-3mf — baca sebagai `blob`, bukan `string`). Blob disimpan di state klien (bukan dikirim ke mana-mana dulu), langsung ditampilkan via `URL.createObjectURL(blob)` sebagai preview instan di header Part/Plate.
2. **Saat klik Simpan** (`handleSave` di `KalkulasiForm.tsx`): setelah `createKalkulasi`/`updateKalkulasi` sukses dan mengembalikan `KalkulasiData` (plate-plate-nya sudah punya `id` asli, urutannya sama dengan `platesForSave` yang dikirim), untuk tiap plate yang punya thumbnail blob pending, browser `PUT` ke `/api/kalkulator/plates/[plateId]/thumbnail` (multipart, field `file`) — pola identik dengan `app/api/light-generator/orders/[id]/additional/route.ts` yang sudah ada. Server upload ke MinIO, update kolom `KalkulasiPlate.thumbnailKey` ke key yang barusan dipakai.
3. Upload berjalan **best-effort, tidak memblokir**: kalau upload gagal (network error dll.), Kalkulasi tetap tersimpan normal (data plate/HPP tidak bergantung ke thumbnail) — cuma thumbnail-nya yang tidak muncul, tanpa error blocking ke user.

## Perubahan data model

```prisma
model KalkulasiPlate {
  // ...existing fields...
  thumbnailKey String?   // MinIO object key, informational — bukan dipakai kalkulasi HPP
}
```

Nullable, additive — `db push` otomatis (bukan migration file manual, sama seperti field `color` sebelumnya).

`PlateData` (app-level type, `apps/dashboard/lib/kalkulator/types.ts`) tambah `thumbnailKey?: string | null`. **`PlateInput`/`PlateInputApp` (kalkulator-core) TIDAK berubah** — `thumbnailKey` bukan bagian dari payload create/update biasa (di-set lewat endpoint upload terpisah setelah plate punya id), jadi tidak masuk tipe input.

## Endpoint baru

- `PUT /api/kalkulator/plates/[plateId]/thumbnail` — terima `multipart/form-data` field `file` (image/png), upload ke MinIO key `kalkulator-thumbnails/{plateId}.png`, update `KalkulasiPlate.thumbnailKey`, return `{ thumbnailKey: string }`. Auth-gated sama seperti endpoint kalkulator lain.
- `GET /api/kalkulator/plates/[plateId]/thumbnail` — proxy: load `KalkulasiPlate.thumbnailKey`, generate presigned URL fresh (`getPresignedUrl`), fetch dari MinIO, stream balik ke browser dengan `Content-Type: image/png`. 404 kalau plate atau `thumbnailKey`-nya tidak ada. Browser tidak pernah bicara langsung ke MinIO.

## UI

- Header Part/Plate (baris "Part N" + nama part + tombol Multi + tombol hapus, di `PlateTable.tsx`) dapat elemen thumbnail kecil (mis. 40×40px, rounded) di paling kiri.
  - Sebelum save (baru import, blob lokal): `src` dari `URL.createObjectURL(blob)`.
  - Setelah save (reload/edit kalkulasi lama): `src="/api/kalkulator/plates/{plateId}/thumbnail"` kalau `plate.thumbnailKey` ada.
  - Tidak ada thumbnail sama sekali (kalkulasi dibuat manual, bukan dari import) → elemen tidak dirender (bukan placeholder kosong).

## Cleanup

- **Hapus Kalkulasi** (`deleteKalkulasi` di `service.ts`): sebelum `prisma.kalkulasiHarga.delete(...)`, loop semua plate yang punya `thumbnailKey`, `deleteFromMinio(key)` best-effort (tidak throw kalau gagal — objek storage orphan lebih baik daripada gagal hapus data).
- **Hapus 1 part saat edit** (di UI, sebelum/sesudah save): **tidak** dibersihkan otomatis di fase ini — object MinIO yang orphan itu murah & harmless, tidak sepadan nambah kompleksitas tracking per-part delete sekarang. Bisa ditambah cleanup job terpisah nanti kalau storage jadi masalah nyata (YAGNI).

## Error handling

| Kondisi | Behavior |
|---|---|
| Upload thumbnail gagal setelah save | Kalkulasi tetap tersimpan normal, thumbnail cuma tidak muncul (tidak ada error blocking) |
| `GET` thumbnail tapi `thumbnailKey` tidak ada di DB | 404, form/list tidak render `<img>` |
| `GET` thumbnail tapi object-nya sudah tidak ada di MinIO (kehapus manual dll.) | 404 dari MinIO diteruskan sebagai 404, tidak crash |

## Scope non-implementasi

- Tidak menyimpan/upload file `.gcode.3mf` itu sendiri — cuma thumbnail PNG-nya.
- Tidak ada cleanup otomatis untuk thumbnail plate yang dihapus individual saat edit (lihat bagian Cleanup).
- Tidak menambah UI untuk re-generate/re-upload thumbnail secara manual di luar alur import 3MF.
- Tidak mengubah kalkulasi HPP — `thumbnailKey` murni informational, sama seperti `color`.
