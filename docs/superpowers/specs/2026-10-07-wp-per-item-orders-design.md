# Order sebagai induk WP — satu WP per unit + income per order

Tanggal: 2026-10-07 · Branch: `feat/wp-escrow` · Status: revisi 2 (setelah review Fable), menunggu review

## Masalah

1. `auto-create` menggabungkan semua baris item satu order menjadi **satu WP** (`buildMultiItemProduct`, `auto-create.ts:78,107`)
   dan tidak pernah membaca `qty`. Contoh: order Tokopedia `586311573917172770` (GL Ring 2026 ukuran 7 + 13 → satu WP,
   `variant` kosong). Tim packing beberapa kali melapor cincin kurang; tab GL Ring tidak bisa menghitung ukuran per item.
2. Income (harga jual / biaya / pendapatan) milik **order**; menaruh angka order di tiap WP akan terhitung dobel.

Data 2026-10-07: WP gabungan marketplace = 40 (aktif 21 = Open 19 + Waiting Customer 2; Done 17; Canceled 2).
Dari 21 aktif, nol yang checklist-nya sudah dicentang; tidak ada order dengan >1 WP gabungan kecuali duplikat Canceled `585151280521119278`.
Kolom income dari commit `08b58b18` belum ada di DB produksi (dicek) → memindahkannya aman.

## Keputusan (disetujui)

- Satu WP per **unit**: baris `qty = 2` → **2 WP**.
- WP gabungan **Done/Canceled dibiarkan**; yang **aktif dipecah**.
- Income dihitung di level order; tiap WP menampilkan bagian proporsional.

## Kunci item (diverifikasi pada payload nyata 2026-10-07)

- **Shopee** (`get_order_detail` → `item_list[]`): `line_item_id` (unik per baris, stabil), `item_id`, `model_id`,
  `model_quantity_purchased`, `model_discounted_price` (harga per unit), `cancelled_qty`/`active_qty`.
  Kunci baris = `line_item_id`. Hari ini `OrderItemSummary` (`lib/orders/types.ts`) hanya meneruskan `itemId`;
  `lib/orders/service.ts` harus meneruskan `lineItemId`, `modelId`, `qty`, `unitPrice`.
- **Tokopedia** (`sku_module[]`): `sku_id` (unik per varian), `product_id`, `quantity`, `sku_name`. Harga baris dari
  `sku_total_price` (di `parseOrder`); harga unit = total ÷ qty (dibulatkan). Kunci baris = `sku_id`.
- Kunci unit = `<kunciBaris>#<n>`, `n` berjalan **per kunci baris di seluruh order** (bukan per baris), jadi dua baris
  dengan kunci sama tidak bertabrakan.
- Hanya unit aktif yang dibuat WP (`qty − cancelled_qty` untuk Shopee).

## Model data

`MarketplaceOrder` (nama sengaja bukan `Order`; `OrderEscrow` untuk analytics tidak disentuh):

```
MarketplaceOrder
  id, source ('shopee'|'tokopedia'), sourceOrderNo        @@unique([source, sourceOrderNo])
  salePrice, feesTotal, netIncome   Int?                  // seluruh order
  incomeStatus ('estimated'|'settled'|'unavailable'|null), incomeSettledAt, incomeSyncedAt
```

`WorkingProject` += `orderId String?` (FK, null untuk WP manual), `sourceItemKey String?`, `itemPrice Int?` (harga satu unit);
`@@unique([source, sourceOrderNo, sourceItemKey])` (NULL distinct di Postgres → WP manual/legacy aman) dan `@@index([orderId])`.
Kolom income di WP yang ditambahkan commit `08b58b18` dipindah ke `MarketplaceOrder`.

## Income per WP (turunan, tidak disimpan)

Bobot = `itemPrice` WP. Untuk order dengan WP-WP aktif `w₁…wₙ`:
`harga jual_i = salePrice_order × bobot_i / Σ bobot`, `biaya_i = feesTotal_order × bobot_i / Σ bobot`,
`pendapatan_i = harga jual_i − biaya_i` — **salePrice dan feesTotal order sama-sama dialokasikan**, jadi jumlahnya selalu
sama dengan order walau Σ harga baris ≠ salePrice (voucher/subsidi/pembulatan). Selisih pembulatan ke WP terakhir.
`Σ bobot = 0` → bagi rata. WP Canceled tidak ikut penyebut. WP gabungan lama / 1 order 1 WP: angka order apa adanya.
WP manual: harga jual = pendapatan = Nominal.

## Alur

1. **Satu fungsi server `createWorkingProjectsForOrder(order)`** dipakai oleh auto-create, route POST dashboard
   (`OrderRow`/`TokopediaOrderRow` "Buat WP") dan bot (`app/api/bot/working-projects`). Mencegah jalur manual
   melahirkan WP gabungan baru. Dedupe dua query eksplisit: (a) sudah ada WP **tanpa** `sourceItemKey` untuk order ini →
   lewati seluruh order (WP lama mewakili semua); (b) sudah ada WP dengan kunci unit ini → lewati unit. Membuat
   `MarketplaceOrder` (upsert) bila belum ada. `forumChannelId` & `sourceProductId` ditentukan **per unit** dari item-nya.
2. **status-sync** — tetap per `(source, sourceOrderNo)`; semua WP milik order mengikuti status sama (sudah per-baris WP).
   Perbaikan kecil: dedupe `sns` Shopee sebelum dibatch 50.
3. **Backfill `MarketplaceOrder`** — skrip sekali jalan membuat `MarketplaceOrder` untuk setiap `(source, sourceOrderNo)` WP
   marketplace yang ada dan mengisi `WorkingProject.orderId` (tanpa menyentuh Discord). Wajib sebelum income-sync baru aktif,
   supaya ±1.000 WP lama (termasuk gabungan Done) ikut terisi income.
4. **income-sync** — target = `MarketplaceOrder` yang punya ≥1 WP Done dan income belum final; satu fetch per order.
   Aturan estimasi/12 jam/`unavailable` 3 hari tetap; menggantikan `income-sync.ts` sekarang (tes ditulis ulang).
5. **Pemecahan 21 WP aktif** — skrip sekali jalan, default dry-run (keluaran + snapshot JSON untuk rollback), `--apply` dengan pacing:
   - Item diambil dari marketplace (bukan parsing string produk). Bandingkan jumlah **baris** marketplace dengan
     `splitProductVariants(product).length`; tidak sama → lewati & lapor.
   - **Cek ulang saat `--apply`**: status masih aktif, checklist tanpa item tercentang, WP belum punya `sourceItemKey`.
   - Order dengan >1 WP gabungan: pakai yang punya thread, lapor sisanya.
   - WP lama dipakai ulang untuk unit pertama (thread, status, due date, kurir, order date tetap); `product`, `variant`,
     `title`, `sourceItemKey`, `itemPrice`, `sourceProductId` diperbarui. **`notes` multi-varian dipecah per varian**
     (`notesSegmentForKey` dengan jumlah varian lama) supaya unit 1 tidak membaca ukuran varian lain
     (`format.ts` `parseSize` mengambil token terakhir); bila notes tidak bisa dipetakan → lewati & lapor.
   - Unit lain: WP + thread baru memakai status, due date, kurir, order date, `payment`, `mentions`, `remindersSent`
     yang sama (agar reminder H-3/H-1 yang sudah terkirim tidak terkirim ulang); forum dirutekan **per unit**.
   - Idempoten (kunci unit), berhenti pada error beruntun, hasil tiap order dicatat.
6. **UI** — kolom Harga Jual/Biaya/Pendapatan memakai income turunan; WP dari order multi-WP diberi penanda kecil
   ("1 dari 2 unit order ini"). Tab GL Ring tidak berubah selain `variant` kini terisi.
7. **Efek samping yang ditangani**
   - Reminder due-date: tetap per WP (tiap unit punya reminder sendiri); `remindersSent` disalin saat pemecahan.
   - Invoice: tetap per WP (`catatan: Order <no>`); satu order bisa punya N invoice — diterima untuk sekarang.
   - Bot AI (`/app/CLAUDE.md` di VM .92): `GET ?q=<no order>` kini bisa mengembalikan N baris — dokumentasi bot diperbarui
     agar tidak mem-PATCH hanya baris pertama (langkah rollout).

## Di luar cakupan

Memecah WP Done/Canceled; `OrderEscrow`/analytics; format post Discord selain judul/variant; pembagian ulang income
bila sebagian unit diretur setelah Done (income tetap level order).

## Rollout (urutan)

1. Pastikan kolom income belum ada di prod (sudah dicek) dan backup tabel `WorkingProject` (`pg_dump -t`).
2. Deploy; baca **log entrypoint** untuk `prisma db push` (script entrypoint lanjut start walau push gagal — jangan percaya curl).
3. Backfill `MarketplaceOrder` + `orderId`.
4. Dry-run pemecahan, tinjau daftar (jumlah thread baru) bersama pemilik; `--apply`.
5. Verifikasi order `586311573917172770` → 2 WP (ukuran 7 dan 13); perbarui dokumentasi bot.
Rollback: WP baru dihapus berdasarkan `sourceItemKey`; WP lama dipulihkan dari snapshot dry-run.

## Pengujian

Unit: alokasi income (Σ pas, Σ bobot = 0, WP Canceled, salePrice ≠ Σ harga baris), penurunan kunci unit (qty>1, dua baris kunci
sama, `cancelled_qty`), dedupe dua query, `createWorkingProjectsForOrder` (qty>1, multi-baris, jalur manual/bot),
income-sync per order, status-sync dengan 2 WP satu order, skrip pemecah terhadap fixture (notes multi-varian, label checklist,
`remindersSent`, >1 WP gabungan, baris tidak cocok). Dry-run produksi read-only sebelum `--apply`.
