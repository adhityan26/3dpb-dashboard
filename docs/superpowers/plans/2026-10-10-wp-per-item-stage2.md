# WP per unit — Tahap 2 (backfill, invoice per order, dokumentasi bot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WP lama mendapat induk `MarketplaceOrder` (dari data WP saja), dan satu invoice menaut ke satu order (mencakup semua WP-nya).

**Architecture:** `planOrderBackfill` (fungsi pure) memutuskan `MarketplaceOrder` mana yang dibuat, WP mana yang diisi `orderId`, dan `quotationId` mana yang dipindah; skrip tipis membungkusnya (dry-run default). Invoice: `buildOrderInvoiceInput` (pure) membentuk baris invoice dari WP-WP order; tautan disimpan di `MarketplaceOrder.quotationId` lewat endpoint `PATCH /api/working-projects/orders/[id]`.

**Spec:** `docs/superpowers/specs/2026-10-07-wp-per-item-orders-design.md` (rev 3 + backfill-from-WP-only). Tahap 1 sudah ada di branch ini (skema `MarketplaceOrder`, `WorkingProject.orderId/sourceItemKey/itemPrice`, GET `/api/working-projects` sudah mengembalikan `order` {…, quotationId} dan `siblings`).

## Global Constraints

- Komentar kode & commit: Bahasa Inggris; commit `git add <path spesifik>`; akhiri `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. JANGAN deploy, JANGAN menyentuh DB/API produksi dari tes atau saat implementasi (skrip hanya ditulis & diuji dengan mock; menjalankannya ke produksi dilakukan pemilik).
- Backfill hanya membaca/menulis tabel Postgres (tanpa marketplace, tanpa Discord). Idempoten. Hanya WP marketplace (`source` shopee/tokopedia) dengan `sourceOrderNo` terisi. WP manual tidak disentuh.
- `quotationId` WP-WP satu order yang **berbeda** → jangan menebak: tidak ada yang dipindah untuk order itu, dilaporkan.
- Client bundle tidak boleh meng-import `@/lib/db`.
- Invoice: WP manual (tanpa order) tetap per WP via `WorkingProject.quotationId` (perilaku sekarang tidak berubah).

## File Structure

- Create `apps/dashboard/lib/working-projects/order-backfill.ts` — pure `planOrderBackfill`.
- Create `apps/dashboard/scripts/backfill-marketplace-orders.ts` — skrip (dry-run default, `--apply`).
- Create `apps/dashboard/lib/working-projects/order-invoice.ts` — pure `buildOrderInvoiceInput`.
- Create `apps/dashboard/app/api/working-projects/orders/[id]/route.ts` — `PATCH {quotationId}`.
- Modify `apps/dashboard/lib/hooks/use-working-projects.ts` (hook `useUpdateMarketplaceOrder`), `components/order/WorkingProjectInvoiceButton.tsx`.
- Create `docs/bot-working-projects-units.md` — cuplikan dokumentasi untuk bot AI (diterapkan pemilik di VM .92).
- Tests di `lib/working-projects/__tests__/`, `app/api/working-projects/orders/[id]/__tests__/`, `components/order/__tests__/`.

---

### Task 1: planOrderBackfill (pure) + skrip

**Interfaces:** Produces

```ts
export interface BackfillWp { id: string; source: string; sourceOrderNo: string | null; orderId: string | null; quotationId: string | null }
export interface BackfillPlan {
  newOrders: { source: 'shopee' | 'tokopedia'; sourceOrderNo: string; quotationId: string | null }[]
  links: { wpId: string; source: 'shopee' | 'tokopedia'; sourceOrderNo: string }[]   // WPs that need orderId
  quotationConflicts: { source: string; sourceOrderNo: string; quotationIds: string[] }[]
  skipped: number                                                                   // manual / no order number / already linked
}
export function planOrderBackfill(wps: BackfillWp[], existingOrders: { source: string; sourceOrderNo: string; quotationId: string | null }[]): BackfillPlan
```

Aturan: hanya `source` shopee/tokopedia dengan `sourceOrderNo`; WP yang sudah punya `orderId` dilewati (`skipped`); satu `newOrders` per (source, sourceOrderNo) yang belum ada di `existingOrders`; `links` untuk semua WP tanpa `orderId` di grup itu; `quotationId` order = satu-satunya nilai non-null di antara WP grup (tidak ada → null); >1 nilai berbeda → `quotationConflicts` dan order dibuat dengan `quotationId: null`; bila order sudah ada dan `quotationId`-nya null sementara WP grup punya satu nilai tunggal, tautan itu muncul di `quotationUpdates` (tambahkan field `quotationUpdates: { source; sourceOrderNo; quotationId }[]` ke `BackfillPlan`).

- [ ] **Step 1: Tes yang gagal** (`__tests__/order-backfill.test.ts`): (a) dua WP satu order tanpa orderId → 1 `newOrders`, 2 `links`; (b) WP manual dan WP tanpa nomor order → `skipped`; (c) WP yang sudah punya `orderId` → `skipped`, tidak masuk links; (d) satu WP punya `quotationId` 'q1', WP lain null → order `quotationId: 'q1'`; (e) dua WP quotationId 'q1' dan 'q2' → `quotationConflicts` berisi ['q1','q2'], order dibuat dengan null; (f) order sudah ada (tanpa quotationId) + WP baru-ditautkan punya 'q1' → `quotationUpdates` berisi q1, tidak ada `newOrders`; (g) idempoten: plan kedua dari state hasil plan pertama kosong.
- [ ] **Step 2:** run (`pnpm exec vitest run lib/working-projects/__tests__/order-backfill.test.ts`) — FAIL. **Step 3:** implementasi `order-backfill.ts`. **Step 4:** PASS.
- [ ] **Step 5: Skrip** `scripts/backfill-marketplace-orders.ts` (mengikuti pola `scripts/correct-wp-2026-10-04.ts`: `import { prisma } from "@/lib/db"`, `main().finally(disconnect)`): muat WP marketplace (select id, source, sourceOrderNo, orderId, quotationId) dan `marketplaceOrder`; `planOrderBackfill`; cetak ringkasan (jumlah order baru, links, updates, konflik dengan daftar lengkapnya, skipped). Hanya dengan flag `--apply`: `createMany({ skipDuplicates: true })` untuk order baru, lalu `updateMany`/`update` tiap WP `orderId` (dikelompokkan per order, dalam batch kecil), lalu `quotationUpdates`. Tanpa flag = dry-run, tidak menulis apa pun. Cetak di akhir "DRY-RUN — tidak ada yang ditulis" atau jumlah yang ditulis. Skrip tidak ikut tes unit (logika ada di planner), tapi harus lolos typecheck.
- [ ] **Step 6:** `pnpm exec tsc --noEmit -p . | grep -v __tests__ | grep error` kosong; **Commit.**

---

### Task 2: Invoice per order (pure builder + endpoint + UI)

**Interfaces:** Produces

```ts
export function buildOrderInvoiceInput(wps: { customer: string; contact: string | null; dueDate: string | null; source: string; sourceOrderNo: string | null; platform: string | null; product: string; variant: string | null; itemPrice: number | null; invoiceAmount: number; status: string }[]): QuotationInput
```

- [ ] **Step 1: Tes yang gagal** (`__tests__/order-invoice.test.ts`): (a) dua WP unit ('GL Ring', '7', 136500) dan ('GL Ring', '13', 136500) → dua baris `qty 1`, `hargaPerUnit 136500`, nama `GL Ring (7)` dan `GL Ring (13)`; (b) dua unit identik produk+variant → satu baris `qty 2`; (c) WP Canceled tidak masuk; (d) WP lama tanpa `itemPrice` → satu baris `qty 1`, `hargaPerUnit = invoiceAmount` (perilaku invoice lama); (e) `buyerNama/contact/dueDate` dari WP pertama aktif, `shopeeOrderSn` terisi hanya untuk `source==='shopee'`, `catatan: "Order <no>"`, `channelHarga` 'marketplace' bila platform bukan manual.
- [ ] **Step 2:** FAIL → implementasi `order-invoice.ts` (pure, tanpa import db; tipe `QuotationInput` dari `@/lib/invoice/types`; format nama baris sama dengan `buildInvoiceInput` lama: `variant ? product (variant) : product`) → PASS.
- [ ] **Step 3: Endpoint** `PATCH /api/working-projects/orders/[id]` body `{ quotationId: string | null }`: 401 tanpa sesi; 400 bila `quotationId` bukan string non-kosong/null; 404 bila order tak ada; `prisma.marketplaceOrder.update({ where: { id }, data: { quotationId } })`; kembalikan order. Tes route (mock `@/lib/auth`, `@/lib/db`) untuk 401/400/404/200.
- [ ] **Step 4: Hook** `useUpdateMarketplaceOrder()` di `use-working-projects.ts` (PATCH ke endpoint di atas, invalidate `WORKING_PROJECTS_KEY`).
- [ ] **Step 5: UI** `WorkingProjectInvoiceButton.tsx`: bila `wp.orderId`/`wp.order` ada → mode order: tautan efektif = `wp.order.quotationId`; "Buat Invoice Baru" membuat invoice dari `buildOrderInvoiceInput` atas WP-WP order (WP sendiri + `siblings` — butuh data WP lengkap; ambil dari daftar `useWorkingProjects()` yang sudah ada dengan `orderId` sama) lalu `useUpdateMarketplaceOrder` `{ quotationId: created.id }`; tautkan/lepas ke order; **bila order sudah punya invoice, tombol "Buat" tidak ditampilkan**; teks modal menyebut "order <no> (N WP)". WP tanpa order (manual) → perilaku lama persis (per WP via `useUpdateWorkingProject`). Perbarui tes komponen yang ada (`components/order/__tests__/`, cari tes invoice button) dan tambah: mode order membuat invoice dengan 2 baris & menyimpan ke order; tombol Buat hilang saat order sudah berinvoice; manual tetap per WP.
- [ ] **Step 6:** `pnpm exec vitest run lib/working-projects components/order app/api` + typecheck bersih. **Commit.**

---

### Task 3: Dokumentasi bot

- [ ] **Step 1:** Buat `docs/bot-working-projects-units.md` (Bahasa Indonesia) berisi cuplikan yang bisa ditempel ke `/app/CLAUDE.md` bot: (1) `GET /api/bot/working-projects?q=<nomor order>` kini bisa mengembalikan **beberapa WP** untuk satu order (satu per unit/ukuran) — jangan PATCH hanya baris pertama, tampilkan semuanya dan tanya WP/ukuran mana; (2) `POST /api/bot/working-projects` untuk order marketplace sebaiknya mengirim `units` (`[{ itemKey, productName, variantName, unitPrice, productId }]`); tanpa `units` WP gabungan lama dibuat dan respons memuat `warning`; (3) satu invoice per order; (4) status & due date WP-WP satu order disinkronkan marketplace secara terpisah per WP. Sertakan catatan cara menerapkannya (scp + PM2 botuser, rujuk memori `reference_ai_assistant_bot`). **Commit.**

## Self-Review

Spec: backfill dari data WP saja + konflik quotation dilaporkan (Task 1), invoice per order dengan cegah ganda & WP manual tetap (Task 2), dokumentasi bot (Task 3). Menjalankan skrip backfill ke produksi, push skema, dan deploy dilakukan pemilik setelah review — bukan bagian plan ini.
