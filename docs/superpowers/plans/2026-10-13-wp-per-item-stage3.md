# WP per unit — Tahap 3 (pemecah WP aktif) Implementation Plan — rev 2 (setelah review Opus)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WP marketplace **aktif** yang mewakili order dengan >1 unit (multi-baris dan/atau qty > 1) dipecah menjadi satu WP per unit, dengan thread Discord per unit, tanpa kehilangan status/due date/kurir/reminder/catatan.

**Architecture:** `planOrderSplit` (pure) memutuskan apakah satu WP aman dipecah dan unit mana mendapat produk/variant/catatan apa. `scripts/split-combined-wps.ts` membungkusnya: memuat WP aktif ber-`sourceItemKey` kosong, mengambil baris order dari marketplace (batch, berjeda), membuat snapshot JSON, lalu — hanya dengan `--apply` — membuat WP/thread unit tambahan, dan terakhir mengonversi WP lama menjadi unit pertama. `--rollback <snapshot>` membatalkannya. Default dry-run.

**Spec:** `docs/superpowers/specs/2026-10-07-wp-per-item-orders-design.md` (Alur §5). Tahap 1–2 sudah ada di branch ini.

## Global Constraints

- Komentar kode & commit: Bahasa Inggris; commit `git add <path spesifik>`; akhiri `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. JANGAN deploy; JANGAN menjalankan skrip ke produksi (juga dry-run — ia memanggil marketplace & DB) saat implementasi; tes memakai mock. Pemilik menjalankannya setelah review.
- **Cakupan sebenarnya** bukan hanya "21 WP gabungan": setiap WP aktif marketplace dengan `sourceItemKey` kosong yang order-nya punya >1 unit — termasuk order satu baris `qty ≥ 2`. Status yang dipecah: `Open`, `Proses`, `Siap Kirim`, `Waiting Customer`. Skrip menemukannya dari data marketplace, bukan dari parsing string.
- WP satu unit di marketplace dibiarkan. WP Done/Canceled dan WP ber-`sourceItemKey` tidak disentuh.
- **Jangan menebak** — WP/order dilewati dan dilaporkan (dengan contoh notes/checklist-nya di dry-run) bila: `not-active`, `already-split`, `no-thread`, `no-order`, `single-unit`, `mixed-order` (order sudah punya WP ber-`sourceItemKey` apa pun), `duplicate-legacy` (>1 WP aktif legacy untuk satu order — **seluruh order dilewati**, tangani manual), `checklist-unmappable` (lihat Task 1), `entry-count`, `entry-mismatch`, `notes-unmappable`, `notes-residual`, `notes-multi-size` (qty≥2 dengan notes memuat >1 ukuran berbeda), `cross-category` (unit-unit order dirutekan ke forum berbeda), `not-in-tabs` (Tokopedia).
- Unit WP mewarisi: status, `dueDate/dueDateRaw`, `orderDate`, `shipping`, `trackingNo`, `customer`, `contact`, `platform`, `payment`, `mentions` (kolom DB), `remindersSent`, `source`, `sourceOrderNo`, `orderId`, forum (sama untuk semua unit karena `cross-category` ditolak). `appliedTags` disalin **hanya** bila forum unit == forum legacy (selalu benar setelah `cross-category` ditolak). Tidak diwariskan (dinyatakan eksplisit): `quotationId`, `invoiceAmount`, `paidAmount` WP-level tetap di unit 1 (invoice sebenarnya per order).
- **Kriteria sukses pembuatan unit = baris punya `discordThreadId` dan `syncState === 'ok'`**, bukan "tidak throw" (`createThreadFor` mengembalikan `syncState:'error'` tanpa melempar). Baris `syncState:'pending'` tanpa thread (sisa crash) dianggap harus diulang (dijembatani di skrip).
- Pembuatan thread unit baru memakai `mentions: []` pada pesan awal (hindari N−1 ping per order); `mentions` tetap disalin ke kolom DB. Pesan/post sesudah dibuat disinkronkan lewat `resyncWorkingProject(id)` (membawa status, payment, resi, tag dari baris DB).
- Pacing: ≥1,5 dtk antar pembuatan thread; Shopee detail batch 50 berjeda 1,5 dtk; Tokopedia lewat tab list (≥600 ms) + fallback `getOrderById` berjeda ≥600 ms untuk order yang tertinggal (pola `status-sync.ts`), abort pada `VERIFICATION_REQUIRED/SESSION_*`; berhenti setelah 3 kegagalan Discord beruntun; budget request dicetak di dry-run.
- Idempoten: unit dibuat lewat `createWorkingProject` berkunci (`sourceItemKey`); run ulang melengkapi yang kurang. Konversi WP lama atomik (Task 3 langkah 5).
- Client bundle tidak boleh meng-import `@/lib/db`; `order-split.ts` pure.
- **Lokasi & waktu eksekusi (runbook):** jalankan **di dalam container produksi** (IP/UA/sesi sama dengan server; hindari race refresh token Shopee & tantangan captcha Tokopedia dari IP Mac) — bukan paralel dengan poller: **jangan** jalankan sekitar 22:30–02:00 WIB (auto-create ≥23:00, status-sync ≥01:00). Snapshot berisi PII: tulis ke volume persisten/`docker cp` keluar setelah selesai, jangan di-commit.
- Keterbatasan yang diakui: Tokopedia tidak mengekspos qty batal per baris — pembatalan parsial Tokopedia tidak terdeteksi (bandingkan `subTotal` order dengan Σ harga unit di dry-run dan laporkan selisih sebagai peringatan); unit yang dibatalkan sesudah pemecahan tidak dipropagasi (status-sync mengikuti status order utuh).

## File Structure

- Create `apps/dashboard/lib/working-projects/order-split.ts` — pure `planOrderSplit`, tipe.
- Modify `apps/dashboard/lib/working-projects/service.ts` — `createWorkingProject` menerima `initial?: { status, payment, remindersSent, appliedTags, trackingNo }`.
- Create `apps/dashboard/scripts/split-combined-wps.ts` — skrip (dry-run/`--apply`/`--rollback`).
- Tests: `lib/working-projects/__tests__/order-split.test.ts`, `create-for-order.test.ts` (tambah), `service` test untuk `initial`.

---

### Task 1: planOrderSplit (pure)

**Interfaces:** Produces

```ts
export interface SplitWp { id: string; product: string; variant: string | null; notes: string | null; status: string; checklist: { text: string; done: boolean; deleted?: boolean }[]; sourceItemKey: string | null; orderId: string | null; discordThreadId: string | null; forumChannelId: string | null }
export interface SplitAssignment { unit: OrderUnit; reuse: boolean; product: string; variant: string | null; notes: string | null; checklist: SplitWp['checklist'] }  // checklist: items to keep on this WP (prefix stripped)
export type SplitPlan = { ok: true; assignments: SplitAssignment[] } | { ok: false; reason: string }
export const SPLITTABLE_STATUSES: readonly string[]
export function planOrderSplit(wp: SplitWp, lines: OrderLine[], forumForUnit: (u: OrderUnit) => string): SplitPlan
export function pickLegacyWp<T extends { id: string; discordThreadId: string | null }>(wps: T[]): { ok: true; wp: T } | { ok: false; reason: 'duplicate-legacy' | 'empty' }
```

Urutan pengecekan (alasan penolakan pertama yang kena): `not-active` → `already-split` → `no-thread` → `no-order` → `single-unit` (`expandOrderUnits(lines).length <= 1`) → `cross-category` (set `forumForUnit(u)` untuk semua unit berukuran >1) → `entry-count` (`splitProductVariants(product).length` ≠ `lines.length`) → `entry-mismatch` (entri ke-i ≠ `variant ? "name (variant)" : name` untuk baris i, trim + case-insensitive; untuk order satu baris dengan `variant` terpisah, entri harus = `name`) → `checklist-unmappable` → `notes-*`.

**Checklist (rev 2):** label checklist GL Ring dibuat lazily; pada WP multi-entri berbentuk `"<variantShort(entry)> — <step>"`, pada WP satu-entri hanya `<step>` dan dicocokkan **substring** — item berprefix milik unit lain yang tertinggal di unit 1 akan salah dicentang. Aturan: item `deleted` diabaikan; item tanpa prefix (tidak mengandung " — ") dan `done` → `checklist-unmappable`; item tanpa prefix & belum done → disalin ke semua unit; item berprefix: prefix-nya dicocokkan ke `variantShort(entry_i)` (case-insensitive, bandingkan sama persis setelah trim) → item itu (prefix dibuang, `done` dipertahankan) milik baris i saja; prefix yang tak cocok dengan entri mana pun → `checklist-unmappable`. Untuk order satu baris qty≥2 tanpa prefix: item belum-done disalin ke semua unit; ada `done` → `checklist-unmappable`. Unit lain dari baris yang sama (qty>1) mendapat salinan item itu dengan `done: false`.

**Notes (rev 2):** pemetaan memakai dua key per baris — `entry_i` dan `variantShort(entry_i)` — dan mencoba yang pertama dulu. Aturan konkret: untuk order dengan >1 baris & notes non-kosong, hitung `seg_i = notesSegmentForKey(notes, key, lines.length)`. `notes-unmappable` bila ada `seg_i === notes` (tidak terpisah) atau dua segmen identik. Sisa teks = notes setelah membuang semua `seg_i` (dan pemisah ` / ` / `|` yang tersisa): bila sisa non-kosong → `notes-residual` (dry-run mencetak sisa itu). Untuk order satu baris qty≥2: notes disalin apa adanya; bila `parseSize`-style token ukuran dalam notes (`/\bus\s*\d|size|ukuran/i` dengan angka berbeda) lebih dari satu nilai berbeda → `notes-multi-size`. Catatan: `fieldIdentifiesKey` mencocokkan field pendek yang terkandung di key — tes wajib mencakup ukuran saling-substring (7 vs 17, 1 vs 11, 8 vs 8.5).

**Reuse (rev 2):** unit yang dipakai ulang oleh WP lama adalah unit pertama (`units[0]`) — kategori sudah dipastikan sama oleh `cross-category`.

- [ ] **Step 1: Tes yang gagal** — fixture dengan **nama produk nyata** ("Green Lantern Ring 2026 3D Print", "3D Print Green Lantern Ring Cosplay"), bukan 'A'/'B': (a) order `586311573917172770` (ukuran 7 + 13, notes null, checklist kosong) → 2 assignment, `reuse` pada unit 1; (b) satu baris qty 2 (variant 8) → 2 assignment; (c) notes shape " / " dengan nama produk nyata → tiap unit mendapat segmennya; (d) notes flat '|' tanpa tergantung urutan; (e) notes dengan key `variantShort` ("GL Ring … (7)") tetap terpetakan; (f) ukuran saling-substring 7 vs 17 tidak tertukar; (g) notes umum tanpa pemisahan, 2 baris → `notes-unmappable`; (h) notes dengan baris `[timestamp] …` tambahan → `notes-residual`; (i) qty 2 + notes "US 7 … US 9" → `notes-multi-size`; (j) checklist berprefix belum-done milik entri 1 dan 2 → masing-masing hanya di unitnya, prefix dibuang; (k) item done tanpa prefix → `checklist-unmappable`; (l) item done berprefix → ikut unit pemiliknya dengan `done: true`; (m) prefix tak dikenal → `checklist-unmappable`; (n) status Done → `not-active`; `sourceItemKey` terisi → `already-split`; tanpa thread → `no-thread`; jumlah entri ≠ baris → `entry-count`; satu unit → `single-unit`; `forumForUnit` berbeda → `cross-category`; (o) `pickLegacyWp` dengan 2 WP → `duplicate-legacy`, dengan 1 → ok, kosong → `empty`.
- [ ] **Step 2:** run `pnpm exec vitest run lib/working-projects/__tests__/order-split.test.ts` — FAIL. **Step 3:** implementasi (`splitProductVariants`, `notesSegmentForKey`, `variantShort` dari `./format`; `expandOrderUnits` dari `./order-units`). **Step 4:** PASS. **Step 5: Commit.**

---

### Task 2: createWorkingProject `initial`

**Interfaces:** Produces `createWorkingProject({ ..., initial?: { status?: string; payment?: string; remindersSent?: number[]; appliedTags?: string[]; trackingNo?: string; mentionsInPost?: boolean } })` — nilai disimpan pada baris yang dibuat. Setelah thread berhasil dibuat dan `initial` ada, panggil `resyncWorkingProject(id)` (service.ts) supaya post/nama/tag Discord memakai status, payment, resi dari baris DB; kegagalan resync tidak membatalkan hasil tetapi tercermin di `syncState`/`syncError`. `mentionsInPost: false` membuat pesan awal tanpa ping (`mentions: []` ke relay) sementara kolom `mentions` DB tetap terisi. Tambahan: guard idempoten — baris dengan `syncState:'pending'` dan tanpa `discordThreadId` (sisa crash) diperlakukan seperti `syncState:'error'` (thread dicoba ulang).

- [ ] **Step 1: Tes yang gagal** (pola `service.test.ts`): create dengan `initial` → `workingProject.create` menerima `status`, `payment`, `remindersSent`, `appliedTags`, `trackingNo`; tanpa `initial` perilaku tak berubah; ``initial` memicu `resyncWorkingProject` tepat sekali; `mentionsInPost:false` mengirim `mentions: []` ke relay namun menyimpan `mentions` di DB; baris `pending` tanpa thread di-retry (bukan dilewati). **Step 2–4:** FAIL → implementasi → PASS. **Step 5: Commit.**

---

### Task 3: Skrip pemecah (dry-run / apply / rollback)

**File:** Create `apps/dashboard/scripts/split-combined-wps.ts`; logika orkestrasi dipisah ke `apps/dashboard/lib/working-projects/order-split-runner.ts` (fungsi dengan dependensi diinjeksi: `fetchLines`, `createUnit`, `convertLegacy`, `now`, `sleep`) supaya bisa diuji dengan mock; skrip hanya merangkai dependensi nyata (pola `scripts/correct-wp-2026-10-04.ts`).

Opsi CLI: tanpa flag = dry-run; `--apply`; `--rollback <file>` (dry-run default, `--apply` untuk menjalankan); `--limit <n>` (default 10 untuk `--apply`); `--only <sourceOrderNo>`; `--snapshot-dir <dir>` (default `./.split-snapshots`; tambahkan ke `apps/dashboard/.gitignore`).

- [ ] **Step 1: Kandidat.** WP `source in (shopee,tokopedia)`, `status in SPLITTABLE_STATUSES`, `sourceItemKey: null`, `sourceOrderNo` terisi; kelompokkan per (source, nomor order); `pickLegacyWp` — `duplicate-legacy` melewati **seluruh order**. Order yang sudah punya WP ber-`sourceItemKey` apa pun (query terpisah) → `mixed-order`.
- [ ] **Step 2: Baris order.** Shopee: `getOrderDetail` batch 50 berjeda 1,5 dtk → `orderLinesFromShopee` (ekstrak mapper bersama dengan `lib/orders/service.ts` bila perlu). Tokopedia: tab `perlu-dikirim`, `menunggu-pengambilan`, `dikirim` (jeda ≥600 ms, `?? []`, 50/halaman, pola `loadTokopediaLiveByTabs`) → `parseOrder(...).products` → `orderLinesFromTokopedia`; order yang tertinggal → `getOrderById` berjeda (maks 1 per 600 ms) → bila tetap tak ada → `not-in-tabs`. Abort pada `TOKOPEDIA_FATAL_CODES`. Peringatan Tokopedia: bandingkan `subTotal` dengan Σ harga unit; selisih dicetak (pembatalan parsial tak terdeteksi).
- [ ] **Step 3: Rencana & dry-run.** `planOrderSplit(wp, lines, forumForUnit)` per order. Dry-run mencetak: order dipindai; order dipecah dengan jumlah unit/thread baru per order dan total; per alasan skip: jumlah + **contoh** (nomor order, potongan notes, label checklist) agar aturan bisa dievaluasi; budget request (Shopee batch, Tokopedia halaman/lookup). Berhenti: "DRY-RUN — tidak ada yang ditulis".
- [ ] **Step 4: Snapshot** (`--apply`): sebelum menulis apa pun, tulis `<snapshot-dir>/split-<timestamp>.json` — per order: salinan lengkap baris WP lama (semua kolom termasuk `checklist`, `forumChannelId`, `updatedAt`), rencana, dan daftar `created` (kosong dulu). Setiap perubahan `created` di-flush ke disk. Run kedua menulis snapshot baru; rollback menerima beberapa file.
- [ ] **Step 5: Apply per order** (urut, berjeda, `--limit`): (1) verifikasi ulang dari DB (status aktif, `sourceItemKey` null, `updatedAt` sama dengan snapshot, checklist/notes tak berubah) — beda → lewati & lapor `changed-since-snapshot`; (2) untuk tiap assignment non-reuse: `createWorkingProject` dengan field warisan (lihat constraints), `initial: { status, payment, remindersSent, appliedTags (forum sama), trackingNo, mentionsInPost: false }`, `checklist`/`notes`/`product`/`variant` dari assignment; **sukses hanya bila hasil `skipped === false`-atau-baris-ada-dengan `discordThreadId` dan `syncState === 'ok'`**; catat ke snapshot `created` **hanya** yang `skipped === false` (id + threadId); unit yang sudah ada dari run sebelumnya (`skipped: true`, memiliki thread) dihitung sukses tetapi tidak masuk `created`; (3) hanya bila **semua** unit tambahan sukses: konversi WP lama dengan **satu** `updateMany({ where: { id, sourceItemKey: null, status: snap.status, updatedAt: snap.updatedAt }, data: { product, variant, title: buildTitle(...), notes, checklist, sourceItemKey, itemPrice, sourceProductId } })`, cek `count === 1` (bukan 1 → lapor `changed-since-snapshot`, JANGAN dipaksa), lalu `resyncWorkingProject(id)`; kegagalan resync dicatat ke daftar "perlu resync" (WP tetap konsisten di DB); (4) bila ada unit tambahan gagal: WP lama **tidak** dikonversi (tetap legacy), kegagalan dicatat, lanjut order berikut; run ulang melengkapi. Berhenti total setelah 3 kegagalan Discord beruntun.
- [ ] **Step 6: Rollback** `--rollback <file>...` (dry-run default): per order — tolak bila WP lama atau unit `created` punya `updatedAt` lebih baru dari waktu apply (peringatkan, butuh `--force-edited`); hapus hanya WP di `created` (berdasarkan `id`; hapus thread bila ada via `deleteRelayThread`, baris tanpa thread dihapus langsung dari DB); pulihkan kolom WP lama dari salinan snapshot (`product`, `variant`, `title`, `notes`, `checklist`, `forumChannelId`, `sourceItemKey: null`, `itemPrice: null`, `sourceProductId`) lalu `resyncWorkingProject`. Cetak apa yang **tidak** bisa dipulihkan: pesan/riwayat thread baru (ikut terhapus), edit sesudah pemecahan, reminder/ping yang sudah terkirim.
- [ ] **Step 7:** tes runner dengan mock: urutan langkah (extras dulu, konversi terakhir), tidak konversi bila satu extras gagal (`syncState:'error'` tanpa throw, atau baris `pending` tanpa thread), `created` hanya yang `skipped:false`, berhenti setelah 3 kegagalan Discord, `changed-since-snapshot` bila `updateMany.count !== 1`, run ulang setelah kegagalan parsial tidak membuat duplikat, rollback menolak entri yang diedit setelah apply. `pnpm exec tsc --noEmit -p . | grep -v __tests__ | grep error` kosong. **Commit.**

---

### Task 4: Verifikasi dan serah-terima

- [ ] **Step 1:** `pnpm exec vitest run` (suite penuh) dan typecheck non-test bersih.
- [ ] **Step 2:** Tulis `docs/runbook-split-combined-wps.md` (Bahasa Indonesia): jalankan **di container produksi** di luar jendela poller 22:30–02:00 WIB; dry-run → tinjau daftar (jumlah thread baru, contoh notes/checklist per alasan skip) dan putuskan apakah aturan dilonggarkan; `--apply --only 586311573917172770` lalu cek manual: tab GL Ring & Jadwal Kirim sebelum/sesudah, judul & post Discord, label checklist unit 1, jumlah ping; baru `--apply --limit 10` berulang; salin snapshot keluar container; cara rollback dan batasannya; order yang dilewati dan harus ditangani manual (`duplicate-legacy`, `notes-residual`, `cross-category`, …).
- [ ] **Step 3: Commit.** Jangan menjalankan skrip.

## Keputusan default (dapat diubah pemilik)

`Siap Kirim` ikut dipecah; order lintas kategori ditolak; reminder tetap per WP (tiap unit mengingatkan sendiri; `remindersSent` disalin); thread unit baru tanpa ping, `mentions` disimpan di DB; skrip dijalankan di container produksi.

## Self-Review

Spec Alur §5: sumber item dari marketplace (Task 3.2), cek ulang saat apply (3.5), >1 WP legacy (Task 3.1 + `pickLegacyWp`), notes per varian (Task 1), field warisan termasuk `remindersSent` (Task 2 + 3.5), forum per unit (3.5), snapshot & rollback (3.4, 3.6), idempoten & berhenti saat error beruntun (3.5), pembanding jumlah baris bukan unit (Task 1 `entry-count`). Invariant #9 (WP lama yang dipakai ulang mendapat `sourceItemKey` + `itemPrice`): 3.5 langkah 3.
