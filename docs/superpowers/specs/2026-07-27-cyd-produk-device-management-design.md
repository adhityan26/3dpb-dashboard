# CYD Produk — Sub-proyek 1: SaaS Backend & Device Management — Design

## Konteks

"CYD Produk" (real-time printer monitoring buat customer Slizebiz, lewat Agent yang jalan di komputer customer + layar CYD fisik) dipecah jadi beberapa sub-proyek independen karena beda toolchain/skillset:

1. **SaaS backend & device management** (`apps/saas`, Next.js/Prisma) — **spec ini.**
2. **Agent core** (Node/TS, reuse `packages/printer-monitor-core`) — jembatan lokal antara daftar printer di SaaS dan CYD, koneksi LAN ke printer, embed broker sendiri. Spec terpisah.
3. **Firmware CYD → LVGL** — rewrite dari raw-draw (`TFT_eSPI`) ke LVGL biar tampilan lebih visual. Toolchain beda total (PlatformIO/C++), spec/repo terpisah (`3pb-monitoring-display`).

Spec ini **hanya** mencakup #1. Sub-proyek #2 dan #3 dibangun setelah ini, masing-masing brainstorm sendiri.

## Goal

Sediakan fondasi di `apps/saas` supaya customer Pro/Subscribe bisa: (a) daftarkan printer yang mau dimonitor (metadata saja, TANPA kredensial), (b) atur layout tampilan CYD lewat editor drag-drop, (c) generate token buat Agent-nya autentikasi ke server. Backend ini jadi fondasi buat sub-proyek Agent (#2) yang menariknya lewat API.

## Keputusan Kunci

### Kenapa data di server cuma "metadata", bukan kredensial

Tujuan awalnya menjaga biaya resource server (storage/compute) supaya sebanding sama pendapatan — bukan soal "boleh/tidak boleh kontak server sama sekali". Yang mahal itu **telemetri live** (status update tiap printer tiap beberapa detik, terus-menerus, dikali banyak user) — itu SENGAJA cuma disimpan buat tier **Subscribe** (lewat `SupabaseReporter`, sub-proyek Agent, di luar scope spec ini). Membaca/nulis **metadata kecil** (nama printer, tipe, layout) itu murah dan boleh lewat server buat SEMUA tier berbayar.

**Data yang boleh di server (Postgres `apps/saas`):** nama/label printer, tipe printer, layout tampilan CYD (JSON kecil, jarang berubah).
**Data yang HARUS tetap di Agent (lokal, tak pernah dikirim ke server):** IP address, access code, serial number fisik printer. Ini semua kredensial/identitas fisik — dikorelasikan ke record server pakai `Device.id`, bukan disimpan di sana.

### Batas tier: `paidCore` vs `cloud`

Reuse capability model yang sudah ada di `lib/entitlement.ts` (`paidCore = lifetimeOwned||subActive`, `cloud = subActive`):

- **Free**: fitur terkunci total (🔒 + upsell), konsisten pola fitur Pro lain.
- **Pro (`paidCore`)**: CRUD device (dibatasi `printerSlots`), layout editor, generate Agent token — SEMUA aktif. **TIDAK ADA** halaman "Monitor" (live status) karena tak ada data live tersimpan buat tier ini. Monitoring cuma tampil di layar CYD fisik (via Agent, lokal).
- **Subscribe (`cloud`)**: sama seperti Pro + (nanti, di luar scope spec ini) halaman Monitor live-status yang baca dari Supabase, begitu `SupabaseReporter` di sub-proyek Agent selesai dibangun.

Ini value-prop yang jujur ke customer: **"pantau di layar CYD sendiri" (Pro) vs "pantau dari HP/browser di mana saja" (Subscribe)**.

### Limit jumlah printer = COUNT query, bukan license

Karena daftar printer (metadata) hidup di Postgres, limit-nya sesederhana: tolak `POST /api/devices` kalau `COUNT(Device WHERE userId=X) >= Entitlement.printerSlots`. Tak perlu mekanisme license/token-baca-slot-count terpisah.

`Entitlement.printerSlots` (Int, default diseed dari `Config['printer.defaultSlots']`, saran nilai awal **1**) — field baru per-akun, bisa dinaikkan admin manual buat MVP (self-serve "beli slot tambahan" = increment terpisah nanti, YAGNI).

### 1 layar CYD per akun (MVP)

Bukan multi-screen. `CydLayout` adalah relasi 1:1 ke `User` (`userId` sebagai primary key), bukan entitas mandiri dengan banyak baris per akun. Kalau nanti perlu multi-screen, ini perlu migrasi skema — dicatat sebagai keputusan sadar, bukan oversight.

### Reuse skema layout dari `apps/dashboard`

`apps/dashboard/lib/cyd-layout/types.ts` sudah punya kontrak JSON matang buat firmware CYD (`LayoutConfigOut { schemaVersion: 1; pages: LayoutPageOut[] }`, grid col/row+span, 9 `FieldId` tetap sesuai firmware, `LAYOUT_LIMITS` yang sudah divalidasi ke konstanta firmware asli). **Kontrak ini didesain dari awal buat dipakai ulang produk SaaS** (per `docs/superpowers/specs/2026-07-18-cyd-internal-dynamic-layout-design.md`) — spec ini TIDAK merancang skema layout baru, cuma pindahkan definisinya ke package bersama.

**Ekstrak ke `packages/cyd-layout-schema`** (types + `LAYOUT_LIMITS` + fungsi validasi, murni tanpa dependency Next.js/Prisma), dipakai KEDUA `apps/dashboard` (refactor import, TANPA ubah perilaku) dan `apps/saas` (baru) — persis pola `packages/kalkulator-core`. Ini DRY yang dibenarkan (bukan premature abstraction) karena firmware bergantung persis ke bentuk JSON ini; drift antara 2 copy artinya CYD Produk vs CYD internal bisa parse beda.

**1 penyesuaian dari bentuk dashboard:** sel layout (`LayoutCellPrinterOut.printer`) di dashboard referensi printer pakai `slug` (identitas MQTT internal). Di SaaS, field yang sama diisi `Device.id` — bentuk tipe TypeScript-nya identik (`string`), cuma semantik sumbernya beda per app; tidak perlu percabangan tipe.

**Field-preset (Ringkas/Detail) di-skip dulu buat MVP** — bukan bikin `CydFieldPreset` CRUD penuh kayak dashboard, cukup 2 preset di-hardcode client-side di editor SaaS. Kenyamanan authoring, bukan esensial versi pertama.

### Auto-discovery printer (divalidasi, tapi bukan bagian spec ini)

POC (lihat riwayat brainstorm) mengonfirmasi Bambu Lab broadcast SSDP non-standar di UDP port 2021 (destinasi, source 1900) berisi IP+serial+model+nama, tertangkap nyata 8/10 printer produksi dalam <20 detik tanpa input manual. Moonraker/Klipper pakai mDNS standar (`_moonraker._tcp.local`). **Ini requirement buat sub-proyek Agent (#2)**, dicatat di sini cuma sebagai konteks — tidak ada kode discovery di spec ini.

**Temuan risiko buat dicatat di spec Agent nanti:** BambuStudio (aplikasi slicer resmi) bisa pegang port 2021 duluan kalau jalan di komputer yang sama dengan Agent — perlu strategi retry/fallback.

## Scope

**Masuk:**
- Model Prisma `Device`, `CydLayout`, `AgentToken` + field `Entitlement.printerSlots`.
- Package baru `packages/cyd-layout-schema` (extract dari `apps/dashboard`, reuse di `apps/saas`).
- API device CRUD (session-auth) + layout get/save (session-auth) + agent-token generate/revoke (session-auth).
- API `/api/agent/*` (token-auth BARU, dipakai Agent sub-proyek #2 nanti) — device list + layout read-only.
- UI: tab nav baru (real, gated `paidCore`), halaman device list, layout editor (drag-drop, reuse pola `apps/dashboard/app/(dashboard)/cyd-layout`), section Agent-token di `/settings`.

**Sengaja TIDAK masuk:**
- Agent itu sendiri (sub-proyek #2).
- Firmware LVGL (sub-proyek #3).
- Halaman Monitor live-status (butuh `SupabaseReporter`, Fase 3 — belum ada).
- Flow pembelian self-serve slot tambahan (admin manual dulu).
- Multi-screen CYD per akun.
- `CydFieldPreset` CRUD manager di SaaS (hardcode 2 preset client-side).
- Auto-discovery printer (dicatat sebagai requirement Agent, tidak diimplementasi di sini).

## Data Model

`apps/saas/prisma/schema.prisma` (aditif, `db push` seperti biasa):

```prisma
model Device {
  id          String   @id @default(cuid())
  userId      String
  label       String
  printerType String        // "bambu" | "moonraker"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id])

  @@index([userId])
}

model CydLayout {
  userId    String   @id
  config    Json             // shape LayoutConfigOut dari packages/cyd-layout-schema
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id])
}

model AgentToken {
  id         String    @id @default(cuid())
  userId     String
  tokenHash  String    @unique   // SHA-256 token asli; token mentah cuma ditampilkan sekali saat generate
  createdAt  DateTime  @default(now())
  revokedAt  DateTime?
  lastUsedAt DateTime?
  user       User      @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

`Entitlement` (modifikasi, tambah 1 field):
```prisma
model Entitlement {
  // ...field existing tak berubah...
  printerSlots Int @default(1)
}
```

Default `printerSlots` diseed dari `Config['printer.defaultSlots']` saat entitlement dibuat (pola sama seperti default kalkulator lain) — bukan hardcode di schema, admin bisa ubah nilai default buat akun BARU lewat `/admin` tanpa redeploy.

## Package Baru: `packages/cyd-layout-schema`

Ekstrak dari `apps/dashboard/lib/cyd-layout/types.ts`:
- Tipe: `FieldId`, `FieldEntry`, `FieldRow`, `LayoutCellPrinterOut`, `LayoutCellLabelOut`, `LayoutCellOut`, `LayoutPageOut`, `LayoutConfigOut`.
- Konstanta: `LAYOUT_LIMITS` (maxPages, maxCellsPerPage, maxGridRows, maxFieldsPerRow, dll — nilai PERSIS sama seperti sekarang, tak berubah).
- Fungsi validasi murni (dipindah dari `build-config.ts` bagian yang tak bergantung Prisma/Next — kalau ada bagian yang couple ke DB, tetap di app masing-masing, cuma validasi struktural JSON yang pindah).

`apps/dashboard` di-refactor importnya ke package baru ini (TANPA mengubah perilaku — test existing harus tetap hijau persis). `apps/saas` import langsung dari awal.

## API Surface

**Session-auth (cookie, pola `auth()` existing):**
- `GET /api/devices` — list device milik user.
- `POST /api/devices` — create; cek `paidCore` (403 kalau Free) + `COUNT(Device) < Entitlement.printerSlots` (409 kalau penuh, pesan upsell).
- `PATCH /api/devices/[id]` — update label/printerType.
- `DELETE /api/devices/[id]` — hapus (juga bersihkan referensi ke device ini di `CydLayout.config` kalau ada — cell yang nunjuk device terhapus di-drop, bukan biarin dangling reference).
- `GET /api/cyd-layout` — baca layout akun (kosong/default kalau belum pernah disimpan).
- `PUT /api/cyd-layout` — simpan, validasi via `packages/cyd-layout-schema` sebelum persist (tolak 400 kalau melanggar `LAYOUT_LIMITS` atau referensi `Device.id` yang tak ada/bukan milik user).
- `POST /api/agent-tokens` — generate token baru, response BERISI token mentah (satu-satunya kesempatan lihat), simpan cuma hash-nya.
- `GET /api/agent-tokens` — list token milik user (tanpa nilai mentah, cuma id+createdAt+lastUsedAt+revoked).
- `DELETE /api/agent-tokens/[id]` — revoke (set `revokedAt`, bukan hard-delete, buat audit).

**Token-auth (BARU, header `Authorization: Bearer <token>`, dipakai sub-proyek Agent #2):**
- `GET /api/agent/devices` — resolve token→userId (cek `tokenHash` match + `revokedAt IS NULL`, update `lastUsedAt`), lalu return device list akun itu. 401 kalau token invalid/revoked.
- `GET /api/agent/layout` — layout akun itu (buat Agent republish retained ke broker lokalnya sendiri).

Middleware token-auth ini KHUSUS route `/api/agent/*` — TIDAK menyentuh/mengubah mekanisme `auth()` session existing sama sekali.

## UI (`apps/saas`)

- **Nav tab baru** di `AppHeader.tsx` — real (bukan `soon: true`), gated `paidCore` (Free lihat locked+upsell, konsisten pola fitur Pro lain).
- **Halaman device list** — tambah/rename/hapus device, tampilkan `X/Y slot terpakai`, tombol tambah disabled+pesan upsell kalau penuh.
- **Layout editor** — reuse pola komponen `apps/dashboard/app/(dashboard)/cyd-layout` (`@dnd-kit/core` drag-drop + `framer-motion`, canvas grid 320:240, panel pengaturan sel) tapi sumber datanya `Device` milik SaaS (bukan `Printer.slug` dashboard), preset field 2 opsi hardcode ("Ringkas"/"Detail").
- **Section baru di `/settings`** — generate/lihat/revoke Agent token, dengan peringatan jelas "token cuma tampil sekali, simpan baik-baik" saat generate.

## Testing

TDD per konvensi proyek: unit test enforcement slot-count (`POST /api/devices` nolak saat penuh), validasi layout (`packages/cyd-layout-schema` — reuse test case existing dari dashboard buat mastiin extract tak mengubah perilaku, tambah test baru buat kasus SaaS-spesifik seperti referensi `Device.id` tak valid), token-auth middleware (valid/invalid/revoked/expired-belum-ada-expiry-jadi-skip), regresi penuh `apps/dashboard` pasca-extract (harus tetap 100% hijau, ini refactor bukan rewrite).

## Out of Scope (eksplisit, dicatat biar tak terlewat di plan)

- Agent (sub-proyek #2, termasuk auto-discovery).
- Firmware LVGL (sub-proyek #3).
- Halaman Monitor live-status (butuh Fase 3 Supabase, di luar scope).
- Purchase flow self-serve buat nambah slot.
- Multi-screen CYD per akun.
- `CydFieldPreset` manager penuh di SaaS.
