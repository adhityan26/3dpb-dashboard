# Order sebagai induk WP — satu WP per item/unit + income per order

Tanggal: 2026-10-07 · Branch: `feat/wp-escrow` · Status: menunggu review

## Masalah

1. `auto-create` menggabungkan semua baris item satu order menjadi **satu WP** (`buildMultiItemProduct`),
   contoh order Tokopedia `586311573917172770` (GL Ring 2026 ukuran 7 + ukuran 13 → satu WP, `variant` kosong).
   Tim packing beberapa kali melapor cincin kurang. Tab GL Ring / ringkasan progress tidak bisa menghitung
   ukuran per item karena `variant` kosong, dan `qty` per baris diabaikan sama sekali.
2. Income (harga jual / biaya / pendapatan) milik **order**, bukan item. Kalau satu order punya beberapa WP,
   menaruh income order di tiap WP akan terhitung dobel.

Data saat ini (2026-10-07): WP gabungan marketplace = 40 (aktif 21: Open 19 + Waiting Customer 2, Done 17, Canceled 2).
Dari 21 yang aktif, tidak ada satu pun yang checklist-nya sudah dicentang.

## Keputusan (sudah disetujui)

- Satu WP per **unit**: baris item dengan `qty = 2` menjadi **2 WP** (bukan satu WP "×2").
- WP gabungan yang sudah **Done/Canceled dibiarkan** (tidak dipecah, tidak ada thread Discord baru).
- WP gabungan **aktif** dipecah.
- Income dihitung di level order; tiap WP menampilkan bagian proporsional.

## Model data

Model baru `MarketplaceOrder` (bukan `Order` — sudah ada `OrderEscrow` untuk analytics Shopee dan beberapa model
`*Order`; `OrderEscrow` tidak disentuh):

```
MarketplaceOrder
  id              cuid
  source          'shopee' | 'tokopedia'
  sourceOrderNo   String            @@unique([source, sourceOrderNo])
  salePrice, feesTotal, netIncome   Int?     // seluruh order
  incomeStatus    'estimated' | 'settled' | 'unavailable' | null
  incomeSettledAt, incomeSyncedAt   DateTime?
```

`WorkingProject` mendapat:

- `orderId String?` → `MarketplaceOrder` (null untuk WP manual).
- `sourceItemKey String?` — kunci stabil satu unit: `<itemId>:<modelId>#<n>` (Shopee) /
  `<skuId>#<n>` (Tokopedia), `n` = 1..qty. Nama field mentah diverifikasi saat implementasi.
- `itemPrice Int?` — harga satu unit dari baris order (harga jual per unit).
- Kolom income yang sebelumnya ditambahkan ke WP (`salePrice/feesTotal/netIncome/incomeStatus/incomeSettledAt/incomeSyncedAt`)
  **dipindah** ke `MarketplaceOrder` (branch belum pernah di-deploy, jadi tidak ada migrasi data).

Penjaga duplikat `createWorkingProject`: dari `(source, sourceOrderNo)` menjadi
`(source, sourceOrderNo, sourceItemKey)`. WP lama tanpa `sourceItemKey` tetap dianggap mewakili seluruh order
(tidak dibuatkan WP per item untuk order yang sudah punya WP gabungan).

## Income per WP (turunan, tidak disimpan)

Untuk WP dengan order: `harga jual = itemPrice`; `biaya = feesTotal_order × itemPrice / Σ itemPrice semua WP order`
(dibulatkan, selisih pembulatan ke WP terakhir supaya jumlahnya pas); `pendapatan = harga jual − biaya`.
Jumlah semua WP = pendapatan order. WP gabungan lama / satu-WP-satu-order memakai angka order apa adanya.
WP manual: harga jual = pendapatan = Nominal (tetap).

## Alur

1. **auto-create** — per order: buat/ambil `MarketplaceOrder`, lalu satu WP per unit (judul/variant per item,
   `variant` terisi). Order dengan `qty` n memberi n WP. Dedupe lewat kunci item. Order lama yang sudah punya WP
   (gabungan) dilewati seperti sekarang.
2. **status-sync** — tetap per `(source, sourceOrderNo)`; semua WP milik order mengikuti status yang sama
   (sudah berlaku: iterasi per baris WP).
3. **income-sync** — target = `MarketplaceOrder` yang punya ≥1 WP Done dan income belum final; satu fetch per order
   (bukan per WP). Aturan estimasi/12 jam/unavailable 3 hari tetap. Menggantikan `income-sync.ts` yang sekarang.
4. **Pemecahan WP gabungan aktif** — skrip sekali jalan, default dry-run, `--apply` untuk menjalankan, dipacu:
   - ambil item order dari marketplace (bukan parsing string produk);
   - WP lama dipakai ulang untuk unit pertama (thread Discord, status, due date, kurir, catatan tetap; judul,
     product, variant, `sourceItemKey`, `itemPrice` diperbarui);
   - unit lainnya dibuatkan WP + thread Discord baru dengan status, due date, kurir, order date yang sama;
   - lewati bila WP punya progres checklist atau jumlah item di marketplace ≠ yang diparse (lapor, jangan tebak);
   - idempoten (kunci item mencegah duplikat bila dijalankan ulang).
5. **UI** — kolom Harga Jual/Biaya/Pendapatan membaca income turunan; WP satu-order-banyak-WP diberi penanda kecil
   ("1 dari 2 item order ini"). Tab GL Ring tidak berubah selain sekarang menerima `variant` yang terisi.

## Di luar cakupan

- Memecah WP Done/Canceled; `OrderEscrow`/analytics; perubahan format post Discord selain judul/variant.
- Pembagian ulang bila sebagian item order di-retur/dibatalkan (income tetap level order).

## Risiko & mitigasi

- Thread Discord baru ≈ jumlah unit tambahan dari 21 WP aktif (±20–40): skrip dry-run dulu dengan daftar pasti, pacing, hentikan bila error beruntun.
- Order dengan variant sama berulang (qty>1): kunci `#n` membuat deterministik; urutan `n` mengikuti urutan item order.
- Kunci item Tokopedia/Shopee harus stabil antar fetch; diverifikasi pada order nyata sebelum `--apply`.

## Pengujian

Unit: pembagian income proporsional (jumlah pas, pembulatan), penurunan kunci item (qty>1), dedupe 3 kolom,
income-sync per order. Skrip pemecah: dry-run terhadap data produksi (read-only) menampilkan rencana per order.
Verifikasi manual: order `586311573917172770` → 2 WP (ukuran 7 dan 13) setelah `--apply`.
