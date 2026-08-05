# QRIS Dinamis per Invoice — Design

## Problem

Dashboard sudah punya fitur upload QRIS (satu gambar statis global, disimpan di `Config` dengan key `invoice.qrisImage`), ditampilkan sama persis di semua invoice tanpa memandang jumlah tagihan. Customer harus ketik manual jumlah transfer saat scan — rawan salah input. Tim mau QRIS yang menyematkan jumlah transaksi (QRIS dinamis, sesuai spesifikasi EMVCo yang jadi dasar QRIS Indonesia), supaya begitu di-scan langsung terisi otomatis.

## Scope & keputusan yang sudah disepakati

- **Jumlah yang di-embed**: default `sisaBayar` (sisa tagihan invoice setelah dikurangi pembayaran yang sudah tercatat), tapi **bisa diedit manual** oleh staff — dipakai buat skenario DP/pembayaran sebagian, bukan cuma pelunasan penuh.
- **Kalau input dikosongkan**: tampilkan QRIS statis asli (tanpa jumlah), perilaku sama seperti sekarang.
- **Tidak disimpan**: jumlah yang diisi manual itu state sementara di browser saat invoice dibuka/diprint — tidak ditulis ke database, tidak ada kolom baru di model invoice (`Quotation`).
- **Decode dilakukan sekali**: saat admin upload gambar QRIS baru di Settings (bukan tiap kali invoice dibuka) — hasil decode (string payload EMVCo) disimpan berdampingan dengan gambar, supaya generate ulang per-invoice bisa murni manipulasi teks di browser tanpa perlu decode gambar berulang kali.

## Architecture

### 1. Upload QRIS (Settings) — decode sekali, simpan payload

`apps/dashboard/app/api/settings/invoice-qris/route.ts` (route yang sudah ada) di-extend:

- Saat `PUT` menerima gambar baru, server decode gambar itu jadi string EMVCo mentah menggunakan library QR-decoder baru (`jsqr` — cuma bisa baca dari raw pixel data, jadi gambar PNG/JPG perlu di-decode ke pixel dulu; cek dependency yang sudah ada di `package.json` untuk image-decoding, kalau belum ada tambahkan yang ringan, mis. `pngjs`+`jpeg-js` atau `jimp`).
- **Decode sukses** → simpan **dua** value di `Config`: `invoice.qrisImage` (base64 gambar asli, seperti sekarang, dipakai untuk tampilan statis) dan **`invoice.qrisPayload`** (string EMVCo hasil decode, baru).
- **Decode gagal** (gambar rusak/bukan QRIS valid/format tidak dikenali) → gambar tetap disimpan ke `invoice.qrisImage` seperti biasa (fitur statis tidak boleh rusak gara-gara ini), tapi `invoice.qrisPayload` di-set `null`/dihapus, dan API response menyertakan warning (mis. `{ ..., decodeWarning: "QR tidak terbaca otomatis — fitur jumlah dinamis tidak tersedia untuk gambar ini" }`) yang ditampilkan di `InvoiceMethodsCard.tsx` sebagai pesan non-blocking (upload tetap sukses).

### 2. Manipulasi payload EMVCo — fungsi murni, reusable

File baru `apps/dashboard/lib/invoice/qris.ts` (atau lokasi serupa, ikuti pola `lib/invoice/`), berisi fungsi murni tanpa I/O:

```ts
export function buildDynamicQris(staticPayload: string, amountRupiah: number): string
```

Langkah di dalamnya (standar EMVCo/QRIS):
1. Parse `staticPayload` sebagai urutan TLV (tag 2 digit, length 2 digit, value).
2. Ubah tag `01` (Point of Initiation Method) dari `"11"` (statis) jadi `"12"` (dinamis).
3. Sisipkan/replace tag `54` (Transaction Amount) dengan `amountRupiah` diformat sesuai spec (angka desimal, tanpa simbol mata uang) — posisinya setelah tag `53` (Transaction Currency), sebelum tag `58` (Country Code), sesuai urutan field EMVCo.
4. Buang tag `63` (CRC) yang lama dari payload.
5. Hitung ulang CRC16-CCITT atas seluruh payload (termasuk tag `63` placeholder `"6304"` di akhir sebelum checksum-nya sendiri, sesuai algoritma standar QRIS), lalu append tag `63` yang baru.
6. Return payload akhir siap di-generate jadi QR image.

Fungsi ini murni (input string+angka, output string) — bisa dipanggil dari client (browser) maupun server tanpa duplikasi logic, cukup di-import di kedua sisi.

### 3. Invoice detail — input jumlah + regenerasi client-side

`apps/dashboard/components/invoice/InvoiceDetail.tsx` (area render QRIS, baris ~663-680 saat ini):

- Tambah input angka kecil di sebelah gambar QRIS, default value = `invoice.sisaBayar`, editable.
- State lokal (komponen), **tidak** dikirim ke server, tidak disimpan.
- Setiap kali nilai berubah (debounce ringan, mis. 150-300ms biar gak generate ulang tiap ketikan huruf demi huruf):
  - Kalau kosong/0 → tampilkan `invoice.qrisImage` (gambar statis asli) seperti sekarang.
  - Kalau ada angka valid **dan** `invoice.qrisPayload` tersedia → panggil `buildDynamicQris(qrisPayload, amount)`, lalu generate gambar QR baru di browser pakai library `qrcode` yang sudah ada (`QRCode.toDataURL(payload)`), render sebagai `<img>` menggantikan gambar statis.
  - Kalau ada angka tapi `invoice.qrisPayload` **tidak tersedia** (upload lama gagal decode) → input jumlah disabled/disembunyikan, tetap tampilkan gambar statis, tanpa error yang mengganggu alur print invoice.

### Error handling

- Upload gagal decode → non-blocking warning saat upload, upload tetap sukses (lihat di atas).
- Payload tidak ada saat invoice dibuka → input dinamis disabled, fallback statis, tidak ada error yang tampil ke customer.
- Input jumlah tidak valid (negatif, bukan angka, atau nol) → treated sama seperti kosong → tampilkan statis, tanpa validasi rumit.
- `buildDynamicQris` gagal (payload korup/tidak sesuai TLV) → tangkap error, fallback ke gambar statis, tidak boleh membuat halaman invoice gagal render.

### Testing

- Unit test `buildDynamicQris` — kasus paling rawan salah (parsing TLV, posisi tag 54, recalculasi CRC16). Verifikasi terhadap contoh string QRIS statis publik yang umum dipakai untuk testing EMVCo, bandingkan hasil CRC dengan nilai yang sudah diketahui benar.
- Unit test route upload — kasus decode sukses (payload tersimpan) vs decode gagal (payload null + warning, gambar tetap tersimpan).
- Component test `InvoiceDetail` — isi input jumlah → gambar QR berubah (mock `buildDynamicQris`/`qrcode`); kosongkan input → balik ke gambar statis; kasus `qrisPayload` null → input disabled.

## Out of scope

- Tidak ada perubahan skema Prisma (masih pakai pola `Config` key-value yang sama, cuma nambah satu key baru).
- Tidak ada penyimpanan riwayat jumlah QRIS per invoice.
- Tidak ada validasi bahwa jumlah yang diisi staff "masuk akal" dibanding `sisaBayar` (staff dipercaya untuk skenario DP, dsb).
- Tidak menyentuh flow input pembayaran manual (`InvoicePayment.metode = 'QRIS'`) yang sudah ada — itu cuma label, tidak berkaitan dengan gambar QRIS ini.
