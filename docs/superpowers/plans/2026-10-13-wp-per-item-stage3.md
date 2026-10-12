# WP per unit — Tahap 3 (pemecah WP aktif) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WP marketplace **aktif** yang mewakili order dengan >1 unit (multi-baris dan/atau qty > 1) dipecah menjadi satu WP per unit, dengan thread Discord per unit, tanpa kehilangan status/due date/kurir/reminder/catatan.

**Architecture:** `planOrderSplit` (pure) memutuskan apakah satu WP aman dipecah dan unit mana mendapat produk/variant/catatan apa. `scripts/split-combined-wps.ts` membungkusnya: memuat WP aktif ber-`sourceItemKey` kosong, mengambil baris order dari marketplace (batch, berjeda), membuat snapshot JSON, lalu — hanya dengan `--apply` — membuat WP/thread unit tambahan, dan terakhir mengonversi WP lama menjadi unit pertama. `--rollback <snapshot>` membatalkannya. Default dry-run.

**Spec:** `docs/superpowers/specs/2026-10-07-wp-per-item-orders-design.md` (Alur §5). Tahap 1–2 sudah ada di branch ini.

## Global Constraints

- Komentar kode & commit: Bahasa Inggris; commit `git add <path spesifik>`; akhiri `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. JANGAN deploy; JANGAN menjalankan skrip ke produksi (juga dry-run — ia memanggil marketplace & DB) saat implementasi; tes memakai mock. Pemilik menjalankannya setelah review.
- **Cakupan sebenarnya** bukan hanya "21 WP gabungan": setiap WP aktif marketplace dengan `sourceItemKey` kosong yang order-nya punya >1 unit — termasuk order satu baris dengan `qty ≥ 2` (yang tidak terlihat dari string produk). Skrip menemukannya dari data marketplace, bukan dari parsing string.
- WP dengan satu unit di marketplace dibiarkan (tetap WP lama = seluruh order).
- WP Done/Canceled tidak pernah disentuh. WP yang sudah punya `sourceItemKey` tidak disentuh.
- **Jangan menebak**: WP dilewati dan dilaporkan bila: ada item checklist tercentang; jumlah baris marketplace ≠ jumlah entri `splitProductVariants(product)`; entri tidak cocok dengan baris (nama/variant); `notes` multi-varian tidak bisa dipetakan; status berubah sejak snapshot; ada >1 WP aktif legacy untuk satu order (pakai yang punya thread, lapor sisanya); WP tak punya thread Discord.
- Semua WP unit satu order mewarisi: status, `dueDate/dueDateRaw`, `orderDate`, `shipping`, `trackingNo`, `customer`, `contact`, `platform`, `payment`, `mentions`, `appliedTags`, `remindersSent`, `source`, `sourceOrderNo`, `orderId`. Forum Discord dirutekan per unit (sama dengan auto-create).
- Pacing: ≥1,5 dtk antar pembuatan thread Discord; Shopee detail batch 50 berjeda 1,5 dtk; Tokopedia hanya lewat tab list (pola `status-sync.ts`, jeda ≥600 ms), abort pada `VERIFICATION_REQUIRED/SESSION_*`; berhenti setelah 3 kegagalan Discord beruntun.
- Idempoten: unit dibuat lewat `createWorkingProject` berkunci (`sourceItemKey`), jadi menjalankan ulang tidak membuat duplikat.
- Client bundle tidak boleh meng-import `@/lib/db`; `order-split.ts` pure.

## File Structure

- Create `apps/dashboard/lib/working-projects/order-split.ts` — pure `planOrderSplit`, tipe.
- Modify `apps/dashboard/lib/working-projects/service.ts` — `createWorkingProject` menerima `initial?: { status, payment, remindersSent, appliedTags, trackingNo }`.
- Create `apps/dashboard/scripts/split-combined-wps.ts` — skrip (dry-run/`--apply`/`--rollback`).
- Tests: `lib/working-projects/__tests__/order-split.test.ts`, `create-for-order.test.ts` (tambah), `service` test untuk `initial`.

---

### Task 1: planOrderSplit (pure)

**Interfaces:** Produces

```ts
export interface SplitWp { id: string; product: string; variant: string | null; notes: string | null; status: string; checklist: { done: boolean; deleted?: boolean }[]; sourceItemKey: string | null; orderId: string | null; discordThreadId: string | null }
export interface SplitAssignment { unit: OrderUnit; reuse: boolean; product: string; variant: string | null; notes: string | null }
export type SplitPlan = { ok: true; assignments: SplitAssignment[] } | { ok: false; reason: string }
export const SPLITTABLE_STATUSES: readonly string[]  // ['Open','Proses','Siap Kirim','Waiting Customer']
export function planOrderSplit(wp: SplitWp, lines: OrderLine[]): SplitPlan
```

Aturan: units = `expandOrderUnits(lines)`; `units.length <= 1` → `{ok:false, reason:'single-unit'}`. Urutan pengecekan alasan penolakan: `not-active` (status ∉ SPLITTABLE), `already-split` (sourceItemKey ≠ null), `no-thread`, `no-order` (orderId null), `checklist-progress` (ada item `!deleted && done`), `entry-count` (`splitProductVariants(wp.product).length` ≠ `lines.length`), `entry-mismatch` (entri ke-i ≠ `variant ? "${name} (${variant})" : name` untuk baris i — bandingkan setelah trim, case-insensitive; **kecuali** order satu baris: entri harus sama dengan `name` saja bila WP punya `variant` terpisah), `notes-unmappable` (WP punya notes non-kosong, baris >1, dan `notesSegmentForKey(notes, entry_i, lines.length)` mengembalikan seluruh notes untuk salah satu baris sementara ada baris lain yang juga mengembalikan seluruh notes — yakni tidak ada pemisahan; satu baris saja yang cocok sedangkan lainnya mengembalikan seluruh notes juga dianggap tak terpetakan). Untuk order satu baris qty>1: notes dipakai apa adanya untuk semua unit. Hasil: `assignments` berurutan sesuai `units`; unit pertama `reuse: true`; `product` = `line.productName`, `variant` = `line.variantName`, `notes` = segmen baris itu (atau notes utuh untuk satu baris).

- [ ] **Step 1: Tes yang gagal** — fixture nyata: (a) order `586311573917172770` (GL Ring 2026 ukuran 7 + 13, product `Green Lantern Ring 2026 3D Print (7), Green Lantern Ring 2026 3D Print (13)`, notes null) → 2 assignment, unit 1 `reuse`, variant '7' dan '13'; (b) satu baris qty 2 (product 'GL Ring', variant '8') → 2 assignment, notes sama; (c) notes shape (a) `"A|size US 8 / B|size US 6"` untuk entri 'A','B' → tiap unit mendapat segmennya; (d) notes flat shape (b) `"B|size US 6|catatan B|A|size US 8|catatan A"` → terpetakan benar tanpa tergantung urutan; (e) notes tidak bisa dipetakan ('catatan umum', dua baris) → `notes-unmappable`; (f) checklist berisi item `done` → `checklist-progress`; (g) status Done → `not-active`; (h) `sourceItemKey` terisi → `already-split`; (i) jumlah entri ≠ baris → `entry-count`; (j) satu unit → `single-unit`; (k) tanpa thread → `no-thread`.
- [ ] **Step 2:** run `pnpm exec vitest run lib/working-projects/__tests__/order-split.test.ts` — FAIL. **Step 3:** implementasi (impor `splitProductVariants`, `notesSegmentForKey` dari `./format`, `expandOrderUnits` dari `./order-units`). **Step 4:** PASS. **Step 5: Commit.**

---

### Task 2: createWorkingProject `initial`

**Interfaces:** Produces `createWorkingProject({ ..., initial?: { status?: string; payment?: string; remindersSent?: number[]; appliedTags?: string[]; trackingNo?: string } })` — nilai disimpan pada baris yang dibuat; bila `status` bukan 'Open', setelah thread dibuat panggil `updateWorkingProject(threadId, { status })` agar post Discord ikut (jika gagal, hasil tetap sukses tetapi `syncState` mencerminkan error seperti pola yang ada).

- [ ] **Step 1: Tes yang gagal** (pola `service.test.ts`): create dengan `initial` → `workingProject.create` menerima `status`, `payment`, `remindersSent`, `appliedTags`, `trackingNo`; tanpa `initial` perilaku tak berubah; `status:'Waiting Customer'` memicu satu edit post. **Step 2–4:** FAIL → implementasi → PASS. **Step 5: Commit.**

---

### Task 3: Skrip pemecah (dry-run / apply / rollback)

**File:** Create `apps/dashboard/scripts/split-combined-wps.ts` (pola `scripts/correct-wp-2026-10-04.ts`: `import { prisma } from "@/lib/db"`, `main().finally(disconnect)`).

Opsi CLI: tanpa flag = dry-run; `--apply`; `--rollback <file>`; `--limit <n>` (maks order yang diproses, default 10 untuk `--apply`); `--only <sourceOrderNo>`; `--snapshot-dir <dir>` (default `./.split-snapshots`, tambahkan ke `.gitignore`).

- [ ] **Step 1: Kumpulkan kandidat.** `prisma.workingProject.findMany` dengan `source in (shopee,tokopedia)`, `status in SPLITTABLE_STATUSES`, `sourceItemKey: null`, `sourceOrderNo not null`; kelompokkan per `(source, sourceOrderNo)`; order dengan >1 WP aktif legacy → pilih yang punya `discordThreadId` (lapor sisanya `duplicate-legacy`).
- [ ] **Step 2: Ambil baris order.** Shopee: `getOrderDetail` batch 50 berjeda 1,5 dtk → `orderLinesFromShopee` (mapping field seperti `lib/orders/service.ts`; ekstrak helper bersama bila perlu). Tokopedia: baca tab `perlu-dikirim`, `menunggu-pengambilan`, `dikirim` (jeda ≥600 ms, `?? []`, halaman 50, pola `loadTokopediaLiveByTabs` di `status-sync.ts`) → `parseOrder(...).products` → `orderLinesFromTokopedia`; order yang tidak ada di tab → dilaporkan `not-in-tabs` (tidak ditebak). Abort pada `TOKOPEDIA_FATAL_CODES`.
- [ ] **Step 3: Rencana.** `planOrderSplit(wp, lines)` per order; cetak tabel dry-run: jumlah order dipindai, dipecah (dengan jumlah unit/thread baru per order dan total), dilewati per alasan (daftar nomor order per alasan). Dry-run berhenti di sini ("DRY-RUN — tidak ada yang ditulis").
- [ ] **Step 4: Snapshot.** Sebelum menulis apa pun (`--apply`): tulis `<snapshot-dir>/split-<timestamp>.json` berisi, per order yang akan diproses, salinan lengkap baris WP lama (semua kolom) dan rencana; flush ke disk.
- [ ] **Step 5: Apply per order** (urut, berjeda): (1) verifikasi ulang dari DB: WP masih aktif, checklist tanpa progres, `sourceItemKey` masih null — kalau tidak, lewati & lapor; (2) untuk setiap assignment **bukan reuse**: `createWorkingProject({ source, sourceOrderNo, orderId, sourceItemKey: unit.itemKey, itemPrice: unit.unitPrice, sourceProductId: unit.productId, forumChannelId: forumChannelIdForCategory(detectProductCategory(...)) /* sama dengan auto-create */, customer, contact, platform, product: assignment.product, variant: assignment.variant, shipping, dueDateRaw (dueDateRaw atau ISO dari dueDate), orderDateRaw, notes: assignment.notes, mentions, initial: { status, payment, remindersSent, appliedTags, trackingNo } })`; catat `id`/hasil ke snapshot (field `created`); (3) setelah semua unit tambahan sukses: konversi WP lama — `prisma.workingProject.update` untuk `sourceItemKey`, `itemPrice`, `sourceProductId`, `notes` (segmen unit 1), lalu `updateWorkingProject(threadId, { product, variant })` agar judul/post Discord ikut (verifikasi bahwa patch `product`/`variant` membangun ulang title; jika tidak, gunakan `editRelayThread` dengan `buildTitle`); (4) jika ada unit tambahan gagal: **jangan konversi** WP lama (tetap legacy), catat kegagalan, lanjut order berikut; menjalankan ulang melengkapi yang kurang (idempoten lewat kunci unit). Berhenti total setelah 3 kegagalan Discord beruntun.
- [ ] **Step 6: Rollback** `--rollback <file>` (dry-run default, `--apply` untuk menjalankan): untuk tiap entri snapshot, hapus WP `created` (lewat `deleteWorkingProject(threadId)` dan baris DB), lalu pulihkan kolom WP lama dari salinan snapshot (`product`, `variant`, `title`, `notes`, `sourceItemKey: null`, `itemPrice: null`, `sourceProductId`) dan perbarui post Discord (`updateWorkingProject`). Lapor hasil per order.
- [ ] **Step 7:** `pnpm exec tsc --noEmit -p . | grep -v __tests__ | grep error` kosong; tambahkan `.split-snapshots/` ke `apps/dashboard/.gitignore`. Skrip tidak ikut tes unit (logika ada di Task 1–2) — **tetapi** ekstrak bagian murni yang bisa diuji (pengelompokan kandidat & pemilihan WP duplikat legacy) ke `order-split.ts` (`pickLegacyWp(wps)`), dengan tes. **Commit.**

---

### Task 4: Verifikasi dan serah-terima

- [ ] **Step 1:** `pnpm exec vitest run` (suite penuh) dan typecheck non-test bersih.
- [ ] **Step 2:** Tulis `docs/runbook-split-combined-wps.md` (Bahasa Indonesia): urutan eksekusi pemilik — dry-run, tinjau daftar (jumlah thread baru, alasan skip), `--apply --only <satu order uji>` pada `586311573917172770`, cek di Discord & tab GL Ring, lalu `--apply --limit 10` berulang; cara rollback; apa yang dilewati dan harus ditangani manual.
- [ ] **Step 3: Commit.** Jangan menjalankan skrip.

## Self-Review

Spec Alur §5: sumber item dari marketplace (Task 3.2), cek ulang saat apply (3.5), >1 WP legacy (Task 3.1 + `pickLegacyWp`), notes per varian (Task 1), field warisan termasuk `remindersSent` (Task 2 + 3.5), forum per unit (3.5), snapshot & rollback (3.4, 3.6), idempoten & berhenti saat error beruntun (3.5), pembanding jumlah baris bukan unit (Task 1 `entry-count`). Invariant #9 (WP lama yang dipakai ulang mendapat `sourceItemKey` + `itemPrice`): 3.5 langkah 3.
