# Runbook — memecah WP aktif gabungan menjadi satu WP per unit

Skrip: `apps/dashboard/scripts/split-combined-wps.ts` (logika: `lib/working-projects/order-split-runner.ts`, aturan: `order-split.ts`).
Spec: `docs/superpowers/specs/2026-10-07-wp-per-item-orders-design.md` · Rencana: `docs/superpowers/plans/2026-10-13-wp-per-item-stage3.md`.

## Prasyarat (urutan wajib)

1. Kode Tahap 1–3 sudah di-merge dan **di-deploy**; log container menunjukkan `prisma db push` sukses (baca LOG entrypoint — server tetap hidup walau push gagal).
2. **Backfill `MarketplaceOrder`** sudah dijalankan (`scripts/backfill-marketplace-orders.ts`, dry-run lalu `--apply`), jadi semua WP lama punya `orderId` (skrip pemecah menolak WP tanpa order: `no-order`).
3. Backup tabel `WorkingProject` (`pg_dump -t '"WorkingProject"'`) — **ambil dump baru sebelum SETIAP sesi apply**, bukan sekali di awal.
4. Waktu eksekusi: **di luar 22:30–02:00 WIB** (auto-create ≥23:00 dan status-sync ≥01:00 bisa menyentuh baris yang sama).

## Tempat menjalankan

Di **dalam container produksi** `shopee-dashboard` (IP/UA/sesi sama dengan server → tidak memicu captcha Tokopedia dan tidak berebut refresh token Shopee dari IP lain). Image produksi tidak memuat `lib/*.ts`/`tsconfig.json`; ikuti "Jalur B" di memori `reference_prod_db_access` (docker cp file yang dibutuhkan, lalu `npx tsx scripts/split-combined-wps.ts ...`). Hapus file yang di-copy setelah selesai. Snapshot (`.split-snapshots/`, berisi PII) hilang saat container dibuat ulang — **salin keluar** (`docker cp`) segera setelah tiap run dan jangan di-commit.

## Langkah

1. **Dry-run** (default, tidak menulis apa pun):
   `npx tsx scripts/split-combined-wps.ts`
   Baca keluaran: berapa order dipecah, **berapa thread Discord baru** (total), dan daftar skip per alasan **beserta contoh** (nomor order, potongan notes, label checklist). Alasan yang sering muncul (mis. `checklist-unmappable`, `notes-residual`, `cross-category`) menunjukkan order yang harus ditangani manual — atau aturan yang perlu dilonggarkan (diskusikan dulu, jangan ubah diam-diam). Perhatikan juga peringatan selisih `subTotal` Tokopedia (kemungkinan pembatalan parsial).
2. **Satu order uji:**
   `npx tsx scripts/split-combined-wps.ts --apply --only 586311573917172770`
   Cek manual: (a) dua WP muncul (ukuran 7 dan 13) di tab GL Ring dan Jadwal Kirim, masing-masing dengan thread Discord sendiri; (b) judul & isi post kedua thread benar (status, due date, kurir, payment); (c) label/centang checklist unit 1 tidak tercampur; (d) tidak ada ping berlebih; (e) kolom Harga Jual/Biaya/Pendapatan terbagi proporsional dan jumlahnya = pendapatan order; (f) tombol 🧾 di kedua WP menampilkan invoice order yang sama.
3. **Bertahap:** `npx tsx scripts/split-combined-wps.ts --apply --limit 10` — ulangi sambil memantau. Skrip berhenti sendiri setelah 3 kegagalan Discord beruntun. Run ulang aman (idempoten): hanya melengkapi unit yang kurang.
4. **Tuntaskan yang parsial:** daftar "perlu resync" / order yang konversinya gagal dilaporkan di akhir tiap run; selesaikan sebelum jendela 22:30 WIB.

## Order dalam "setengah jalan" (half state) — WAJIB dibaca

Selama unit tambahan sudah ada tetapi WP lama **belum** dikonversi, order itu tampil **ganda** di pendapatan, invoice, GL Ring, dan Jadwal Kirim (WP lama masih mewakili seluruh order, unit baru mewakili sebagian lagi). Karena itu:

- Setiap order berstatus **INCOMPLETE** atau **CHANGED-SINCE-SNAPSHOT** di keluaran run harus **diselesaikan (run ulang) atau di-rollback pada hari yang sama**. Jangan dibiarkan menginap.
- **Simpan semua file snapshot satu sesi bersama-sama** (salin keluar dari container dengan `docker cp` setelah tiap run). Rollback satu order yang diproses beberapa run harus diberi **semua** file-nya sekaligus: skrip menggabungkan unit dari semua file, memakai salinan WP lama dari file **tertua**, dan membandingkan edit dengan waktu apply **terbaru**.
- Rollback memutuskan "sudah dikonversi?" dari baris WP lama yang ada **sekarang** (bukan dari flag di snapshot), memulihkan WP lama dulu baru menghapus unit, dan menolak **seluruh order** (tidak menghapus sebagian) bila ada yang diedit sejak apply. Unit yang bukan bagian dari kunci rencana order tidak pernah dihapus.
- Skrip yang mati di tengah (crash/kill) aman di-rollback: kunci rencana disimpan di snapshot sebelum unit pertama dibuat, jadi unit yang belum sempat tercatat tetap ditemukan lewat kunci.
- Rollback melaporkan `DISCORD-NOT-DELETED` bila baris DB sudah terhapus tetapi thread Discord gagal dihapus — hapus thread itu manual.

### Alasan skip baru di dry-run

- `marketplace-cancelled` — Shopee `CANCELLED`/`IN_CANCEL` atau Tokopedia `sku_display_status` 140.
- `marketplace-completed` — Shopee `COMPLETED` atau Tokopedia 130 (status-sync akan menandainya Done; memecahnya percuma).
- `forum-mismatch` — forum unit berbeda dari forum thread WP lama (detail memuat kedua id forum). `cross-category` tetap berlaku untuk unit yang forumnya berbeda satu sama lain.

### Cek manual sebelum & sesudah apply

1. Pastikan relay Discord di VM .92 menghormati header `Idempotency-Key`, **termasuk untuk request yang masih berjalan (in-flight)** — bila tidak, retry bisa membuat thread ganda.
2. Baca keluaran dry-run: order yang sudah dibatalkan/selesai/dikirim (lihat skip `marketplace-*`) dan semua `forum-mismatch`. Putuskan manual sebelum apply.
3. Pada order uji `--only 586311573917172770` pastikan: **tidak ada ping** setelah post di-refresh (mention hanya di data, bukan di post), dan pendapatan/invoice order itu **terhitung sekali** (bukan dua kali) setelah konversi.
4. Backfill (`backfill-marketplace-orders.ts`) mencetak `Quotation mismatches`: `quotationId` order yang sudah ada tidak ditimpa bila berbeda dari milik WP — periksa satu per satu.

## Rollback

`npx tsx scripts/split-combined-wps.ts --rollback .split-snapshots/split-<timestamp>.json` (dry-run) lalu tambahkan `--apply` (beri **semua** file snapshot sesi itu sekaligus). Menghapus **hanya** unit berkunci-rencana yang dibuat/ditemukan run itu dan memulihkan baris WP lama dari snapshot. Menolak entri yang diedit setelah apply (`--force-edited` untuk memaksa).
**Tidak bisa dipulihkan:** isi & riwayat thread baru (ikut terhapus), perubahan checklist/status/catatan/resi yang dibuat setelah pemecahan, reminder/ping yang sudah terkirim.

## Diketahui / batasan

- Pembatalan parsial sesudah pemecahan tidak dipropagasi (status-sync mengikuti status order utuh).
- Tokopedia tidak memberi qty batal per baris → pembatalan parsial Tokopedia tidak terdeteksi (hanya peringatan selisih `subTotal`).
- Reminder due-date tetap per WP (tiap unit mengingatkan sendiri); `remindersSent` disalin agar tidak terkirim ulang.
- `quotationId`/`invoiceAmount` WP-level tidak disalin ke unit lain (invoice sebenarnya per order).
- Setelah semua selesai: perbarui dokumentasi bot (`docs/bot-working-projects-units.md`) di VM .92.
