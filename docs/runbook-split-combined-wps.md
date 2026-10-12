# Runbook — memecah WP aktif gabungan menjadi satu WP per unit

Skrip: `apps/dashboard/scripts/split-combined-wps.ts` (logika: `lib/working-projects/order-split-runner.ts`, aturan: `order-split.ts`).
Spec: `docs/superpowers/specs/2026-10-07-wp-per-item-orders-design.md` · Rencana: `docs/superpowers/plans/2026-10-13-wp-per-item-stage3.md`.

## Prasyarat (urutan wajib)

1. Kode Tahap 1–3 sudah di-merge dan **di-deploy**; log container menunjukkan `prisma db push` sukses (baca LOG entrypoint — server tetap hidup walau push gagal).
2. **Backfill `MarketplaceOrder`** sudah dijalankan (`scripts/backfill-marketplace-orders.ts`, dry-run lalu `--apply`), jadi semua WP lama punya `orderId` (skrip pemecah menolak WP tanpa order: `no-order`).
3. Backup tabel `WorkingProject` (`pg_dump -t '"WorkingProject"'`).
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

## Rollback

`npx tsx scripts/split-combined-wps.ts --rollback .split-snapshots/split-<timestamp>.json` (dry-run) lalu tambahkan `--apply`. Menghapus **hanya** WP yang dibuat run itu dan memulihkan baris WP lama dari snapshot. Menolak entri yang diedit setelah apply (`--force-edited` untuk memaksa).
**Tidak bisa dipulihkan:** isi & riwayat thread baru (ikut terhapus), perubahan checklist/status/catatan/resi yang dibuat setelah pemecahan, reminder/ping yang sudah terkirim.

## Diketahui / batasan

- Pembatalan parsial sesudah pemecahan tidak dipropagasi (status-sync mengikuti status order utuh).
- Tokopedia tidak memberi qty batal per baris → pembatalan parsial Tokopedia tidak terdeteksi (hanya peringatan selisih `subTotal`).
- Reminder due-date tetap per WP (tiap unit mengingatkan sendiri); `remindersSent` disalin agar tidak terkirim ulang.
- `quotationId`/`invoiceAmount` WP-level tidak disalin ke unit lain (invoice sebenarnya per order).
- Setelah semua selesai: perbarui dokumentasi bot (`docs/bot-working-projects-units.md`) di VM .92.
