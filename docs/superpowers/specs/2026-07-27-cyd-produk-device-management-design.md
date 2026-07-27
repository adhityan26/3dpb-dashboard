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

Karena daftar printer (metadata) hidup di Postgres, limit-nya sesederhana: tolak `POST /api/devices` kalau `COUNT(Device WHERE userId=X) >= limit`. Tak perlu mekanisme license/token-baca-slot-count terpisah.

**Race condition — DIKOREKSI setelah review Opus:** spec sebelumnya bilang "count+create dibungkus `prisma.$transaction`" buat cegah 2 request paralel sama-sama lolos di slot terakhir — TAPI ini klaim keamanan palsu. Transaksi interaktif Prisma pakai isolation level default Postgres (READ COMMITTED); 2 transaksi paralel sama-sama jalanin `COUNT` tanpa lihat `INSERT` transaksi lain yang belum commit, jadi DUA-DUANYA lolos cek `COUNT < limit` dan dua-duanya commit — race condition-nya TETAP ADA walau dibungkus `$transaction` biasa.

**Fix (row lock, bukan isolation level tinggi):** di dalam transaksi interaktif, kunci row `Entitlement` user itu dulu sebelum COUNT: `await tx.$queryRaw\`SELECT 1 FROM "Entitlement" WHERE "userId" = ${userId} FOR UPDATE\``, baru `COUNT`, baru `create`. Transaksi kedua yang paralel akan nunggu di baris `FOR UPDATE` sampai transaksi pertama commit, baru lanjut COUNT (yang sekarang sudah include insert pertama). Ini lebih deterministik dibanding naikin isolation level ke Serializable + retry-on-conflict.

**Test race condition WAJIB jalan ke Postgres asli** (pakai DB test/dev yang sudah ada), bukan `prisma` yang di-mock — kalau di-mock, assert-nya lolos vakum tanpa membuktikan apa-apa (mock tidak punya isolasi transaksi sungguhan).

**Resolusi limit — DIKOREKSI setelah review Fable:** spec awal bilang "default diseed dari Config saat Entitlement dibuat", TAPI ada **4 titik kode berbeda** yang bikin row `Entitlement` (`lib/auth.ts`, `lib/wa/session.ts`, `lib/entitlement.ts`, `lib/payment/service.ts`) — seeding di 1 tempat gampang kelewat di 3 tempat lain, nilai Config jadi diam-diam diabaikan. Fix: `Entitlement.printerSlots` jadi **nullable** (`Int?`, TANPA default DB), dan limit di-resolve **saat cek**, bukan saat create: `const limit = entitlement.printerSlots ?? await getConfigInt('printer.defaultSlots', 1)`. Admin bisa override per-akun dengan set `Entitlement.printerSlots` eksplisit (lewat `/admin` tab User — nanti, MVP boleh manual lewat DB), atau ubah default global lewat `Config['printer.defaultSlots']` tanpa redeploy (self-serve "beli slot tambahan" = increment eksplisit terpisah nanti, YAGNI).

**Prasyarat yang belum ada — ditemukan review Opus:** `apps/saas/lib/config.ts` HARI INI cuma expose `getConfig` (return `string`), `parsePrice`, `getAllConfig`, `setConfig` — **`getConfigInt` belum ada, harus dibikin** (parse + reject non-integer/`<1`, jangan return `NaN`). Lebih penting lagi: `app/api/admin/config/route.ts` nolak write buat key yang TAK ADA di `DEFAULT_CONFIG` (allowlist) — jadi kalau `"printer.defaultSlots"` tak didaftarkan ke `DEFAULT_CONFIG` di `lib/config.ts`, admin **tak akan bisa ubah nilainya sama sekali lewat `/admin`** (silently unwritable), padahal itu justru alasan utama milih pendekatan Config. **2 task eksplisit wajib ada di plan:** (a) tambah `"printer.defaultSlots": "1"` ke `DEFAULT_CONFIG`, (b) tambah fungsi `getConfigInt(key, fallback)`.

**Catatan (bukan bug, sengaja):** baca Config terjadi DI LUAR transaksi row-lock di atas — worst case cuma 1 slot ekstra kepakai buat 1 user kalau admin pas ubah Config di detik yang sama. Ini trade-off yang diterima sadar, JANGAN "diperbaiki" nanti dengan masukin baca Config ke dalam lock (nambah kompleksitas buat kasus yang nyaris tak pernah kejadian).

### 1 layar CYD per akun (MVP)

Bukan multi-screen. `CydLayout` adalah relasi 1:1 ke `User` (`userId` sebagai primary key), bukan entitas mandiri dengan banyak baris per akun. Kalau nanti perlu multi-screen, ini perlu migrasi skema — dicatat sebagai keputusan sadar, bukan oversight.

### Reuse skema layout dari `apps/dashboard`

`apps/dashboard/lib/cyd-layout/types.ts` sudah punya kontrak JSON matang buat firmware CYD (`LayoutConfigOut { schemaVersion: 1; pages: LayoutPageOut[] }`, grid col/row+span, 9 `FieldId` tetap sesuai firmware, `LAYOUT_LIMITS` yang sudah divalidasi ke konstanta firmware asli). **Kontrak ini didesain dari awal buat dipakai ulang produk SaaS** (per `docs/superpowers/specs/2026-07-18-cyd-internal-dynamic-layout-design.md`) — spec ini TIDAK merancang skema layout baru, cuma pindahkan definisinya ke package bersama.

**Ekstrak ke `packages/cyd-layout-schema`** (types + `LAYOUT_LIMITS` + fungsi validasi, murni tanpa dependency Next.js/Prisma), dipakai KEDUA `apps/dashboard` (refactor import, TANPA ubah perilaku) dan `apps/saas` (baru) — persis pola `packages/kalkulator-core`. Ini DRY yang dibenarkan (bukan premature abstraction) karena firmware bergantung persis ke bentuk JSON ini; drift antara 2 copy artinya CYD Produk vs CYD internal bisa parse beda.

**1 penyesuaian dari bentuk dashboard — DIKOREKSI setelah review Fable:** sel layout (`LayoutCellPrinterOut.printer`) di dashboard referensi printer pakai `slug`. Di SaaS, field yang sama **TIDAK BOLEH diisi `Device.id` mentah** — `cuid()` = 25 karakter, sementara firmware (`layout_types.h`) punya buffer tetap `char printerId[24]` (kapasitas 23 char sebelum null-terminator). `Device.id` overflow, dan karena cuid berbagi prefix timestamp antar-record, truncation bisa collision antar-device di firmware.

**Fix:** tambah field `Device.shortCode` (string pendek, di-generate app-side saat create, unik GLOBAL — bukan `@default(cuid())` Prisma), dan sel layout referensi `Device.shortCode`, BUKAN `Device.id`. `packages/cyd-layout-schema` juga harus menambah validasi **panjang maksimum string** ke `LAYOUT_LIMITS` (cocokkan ke buffer firmware: `printerId`≤23, `label`≤15, `labelText`≤31, page `id`≤15 — ini gap yang sudah ada hari ini juga di `apps/dashboard`, jadi perbaikan ini otomatis menguatkan validasi internal juga, bukan cuma buat SaaS).

**`shortCode` — koreksi detail implementasi setelah review Opus:** JANGAN tambah dependency `nanoid` baru (bukan direct dependency di monorepo ini hari ini, cuma transitive via postcss; alfabet default-nya juga pakai uppercase+dash, kontradiksi sama "lowercase alnum"). Cukup bikin helper kecil ~6 baris pakai `crypto.randomInt`/`randomBytes` (pola sama seperti `lib/wa/otp.ts` yang sudah ada), alfabet `0123456789abcdefghijklmnopqrstuvwxyz`, panjang 10 (36^10 ≈ 3.7×10^15, aman dari collision buat skala ini). Karena `@unique`, collision saat create surface sebagai Prisma error `P2002` → **wajib retry maks 3x** dengan generate ulang, bukan langsung 500. `shortCode` **immutable** setelah dibuat (layout & Agent nanti keying ke nilai ini, jangan pernah di-regenerate pada device yang sama).

**Migrasi/dampak ke `apps/dashboard` — temuan Opus, WAJIB task terpisah SEBELUM validasi panjang string di atas dipasang bersama:** batas panjang baru ini genuinely perlu (firmware `strlcpy` men-truncate diam-diam kalau kelewat), TAPI `Printer.slug` di dashboard hari ini **unbounded** (`slugify(nama)`, tanpa cap panjang) — printer dengan nama panjang (mis. "Bambu Lab X1 Carbon Rack 2" → slug 26 karakter) akan mulai gagal 400 pas simpan layout begitu validasi ini aktif, padahal sebelumnya jalan normal (regresi tersembunyi, test existing lolos cuma karena fixture-nya pendek semua: `mars`, `saturn`, dll). **Task pre-flight wajib:** audit `SELECT slug, length(slug) FROM "Printer" WHERE length(slug) > 23` di DB dashboard, pendekkan yang kepanjangan, DAN batasi panjang di titik generate slug (`scripts/backfill-printer-slug.ts` atau tempat slug di-set) biar tak kejadian lagi ke depan.

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
  shortCode   String   @unique   // generate app-side, 10 char base36 lowercase, unik GLOBAL (bukan per-user) — dipakai di sel layout, BUKAN id, biar muat buffer firmware char[24]
  userId      String
  label       String
  printerType String        // ENUM di level aplikasi: "bambu" | "moonraker" — divalidasi di POST/PATCH, request dengan nilai lain ditolak 400
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model CydLayout {
  userId    String   @id
  config    Json             // shape LayoutConfigOut dari packages/cyd-layout-schema; cell.printer = Device.shortCode
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model AgentToken {
  id         String    @id @default(cuid())
  userId     String
  tokenHash  String    @unique   // SHA-256 dari token mentah; token mentah cuma ditampilkan sekali saat generate
  createdAt  DateTime  @default(now())
  revokedAt  DateTime?
  lastUsedAt DateTime?
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

`Entitlement` (modifikasi, tambah 1 field — **nullable**, lihat "Resolusi limit" di atas soal kenapa bukan `@default`):
```prisma
model Entitlement {
  // ...field existing tak berubah...
  printerSlots Int?
}
```

**Relasi balik di `User` — ditemukan Opus, WAJIB ada biar schema valid:** `model User` (existing) perlu ditambah 3 baris field relasi balik, kalau tidak Prisma nolak validasi schema:
```prisma
model User {
  // ...field existing tak berubah...
  devices      Device[]
  cydLayout    CydLayout?
  agentTokens  AgentToken[]
}
```

**Format token** (`AgentToken`): `crypto.randomBytes(32)` → base64url, diberi prefix `slz_` biar gampang dikenali kalau bocor ke log (mis. `slz_xxxxxxxx...`). Disimpan cuma hash SHA-256-nya; token mentah tak pernah persist plaintext di server. Rate-limit endpoint `/api/agent/*` & throttle write `lastUsedAt` (mis. update paling sering 1x/menit per token, bukan tiap request) dicatat sebagai item pre-go-public, konsisten pola checklist rate-limit WA OTP yang sudah ada — TIDAK blocking buat MVP internal/pilot.

## Package Baru: `packages/cyd-layout-schema`

Ekstrak dari `apps/dashboard/lib/cyd-layout/types.ts`:
- Tipe: `FieldId`, `FieldEntry`, `FieldRow`, `LayoutCellPrinterOut`, `LayoutCellLabelOut`, `LayoutCellOut`, `LayoutPageOut`, `LayoutConfigOut`.
- Konstanta: `LAYOUT_LIMITS` (maxPages, maxCellsPerPage, maxGridRows, maxFieldsPerRow, dll — nilai PERSIS sama seperti sekarang, tak berubah) **+ BARU: batas panjang string** (`maxPrinterIdLength: 23`, `maxLabelLength: 15`, `maxLabelTextLength: 31`, `maxPageIdLength: 15` — dicocokkan ke buffer firmware `layout_types.h`, gap yang ditemukan review Fable dan belum ada hari ini).
- Fungsi validasi murni — dikonfirmasi (review Fable) `build-config.ts` **sudah 100% pure** (nol dependency Prisma/Next), jadi seluruh isinya bisa pindah utuh, tidak perlu dipecah.

`apps/dashboard` di-refactor importnya ke package baru ini (TANPA mengubah perilaku — test existing di `__tests__/build-config.test.ts` harus tetap hijau persis, plus test BARU buat validasi panjang string yang baru ditambah). `apps/saas` import langsung dari awal.

## API Surface

**Session-auth (cookie, pola `auth()` existing):**
- `GET /api/devices` — list device milik user.
- `POST /api/devices` — create; cek `paidCore` (403 kalau Free) + `COUNT(Device) < limit` (409 kalau penuh, pesan upsell), lihat mekanisme row-lock di "Race condition" atas. `printerType` divalidasi terhadap allowlist `["bambu", "moonraker"]`, nilai lain ditolak 400.
- `PATCH /api/devices/[id]` — update label/printerType (validasi allowlist sama seperti create).
- `DELETE /api/devices/[id]` — hapus device + bersihkan referensi di `CydLayout.config` (cell yang nunjuk device terhapus di-drop) dalam **transaksi yang sama** (ditemukan Opus: read-modify-write ke JSON `CydLayout.config` bisa race kalau tak digabung transaksi dengan `PUT /api/cyd-layout` yang jalan bersamaan).
- `GET /api/cyd-layout` — baca layout akun. `validateLayoutConfig` menolak `pages: []` (grid kosong bukan config valid), jadi kalau belum pernah disimpan, endpoint ini balikin **default config eksplisit** — TAPI bukan copy verbatim `defaultConfig()` dashboard (itu grid 10×8, didesain buat rak internal ~20 printer, ketuaan buat customer dengan 1-3 printer di layar 320×240). Default SaaS: grid kecil (mis. 2×2), 1 page, tanpa cells.
- `PUT /api/cyd-layout` — simpan, validasi via `packages/cyd-layout-schema` sebelum persist (tolak 400 kalau melanggar `LAYOUT_LIMITS`, termasuk batas panjang string baru, atau referensi `Device.shortCode` yang tak ada/bukan milik user).
- `POST /api/agent-tokens` — generate token baru, response BERISI token mentah (satu-satunya kesempatan lihat), simpan cuma hash-nya.
- `GET /api/agent-tokens` — list token milik user (tanpa nilai mentah, cuma id+createdAt+lastUsedAt+revoked).
- `DELETE /api/agent-tokens/[id]` — revoke (set `revokedAt`, bukan hard-delete, buat audit).

**Token-auth (BARU, header `Authorization: Bearer <token>`, dipakai sub-proyek Agent #2):**

**Koreksi penting setelah review Opus — ini BUKAN Next.js middleware.** Spec sebelumnya nyebut "middleware token-auth", tapi itu gak feasible: `apps/saas` belum punya `middleware.ts` sama sekali, dan Next middleware jalan di Edge runtime — resolusi token→userId butuh baca Postgres lewat `@prisma/adapter-pg` (koneksi `pg` biasa), yang TIDAK bisa jalan di Edge. Next juga cuma boleh 1 file `middleware.ts` per app, yang berpotensi bentrok sama NextAuth nanti kalau app ini pasang middleware auth session juga.

**Fix — helper per-route, bukan middleware:** `lib/agent-auth.ts` export `requireAgentToken(req): Promise<{ userId: string } | NextResponse>` — dipanggil manual di baris pertama tiap handler `/api/agent/*` (pola biasa function call, BUKAN Next middleware config).

- `GET /api/agent/devices` — `requireAgentToken` (cek `tokenHash` match + `revokedAt IS NULL`, update `lastUsedAt`), **DITAMBAH cek `paidCore` ulang** (lihat di bawah), lalu return device list akun itu. 401 kalau token invalid/revoked.
- `GET /api/agent/layout` — sama, `requireAgentToken` + cek `paidCore`. Beda dari `/api/cyd-layout`: kalau belum ada `CydLayout` row buat akun itu, balikin **404** (bukan default config) — Agent tak perlu publish apa pun ke CYD kalau user belum sempat atur layout sama sekali, daripada publish 1-page-kosong yang tak berguna.

**Semantik downgrade — gap ditemukan Opus, sebelumnya tak dibahas sama sekali:** route session-auth ngecek `paidCore`, tapi spec awal cuma nyuruh route `/api/agent/*` ngecek validitas token, TANPA ngecek `paidCore` lagi. Akibatnya: kalau akun Subscribe berhenti bayar (sub berakhir, `paidCore` jadi false), UI web-nya langsung ke-lock, TAPI Agent yang jalan di komputer customer tetap bisa terus narik device+layout tanpa batas waktu, karena cuma modal token yang gak pernah dicabut. **Fix eksplisit:** `/api/agent/*` WAJIB cek `paidCore` juga (bukan cuma token valid), balas 403 dengan kode error yang bisa dibaca Agent (mis. `{"error": "entitlement_expired"}`) kalau `paidCore` false — Agent bisa tampilkan status itu di CYD. Kalau akun downgrade dan `COUNT(Device) > limit` baru (mis. slot dikurangi admin): **device yang sudah ada TETAP disimpan** (tidak dihapus otomatis), cuma `POST /api/devices` baru diblokir sampai count turun di bawah limit lagi.

## UI (`apps/saas`)

- **Promote tab "🖨️ Printer" yang sudah ada** di `AppHeader.tsx` (saat ini `soon: true`) — hapus `soon`, tambah `href` ke halaman device list baru, gated `paidCore` (Free lihat locked+upsell, konsisten pola fitur Pro lain). BUKAN tab baru terpisah — pakai entry yang sudah ada di `TABS`.
- **Halaman device list** — tambah/rename/hapus device, tampilkan `X/Y slot terpakai`, tombol tambah disabled+pesan upsell kalau penuh.
- **Layout editor — koreksi cakupan setelah review Opus.** Spec sebelumnya nulis "reuse pola komponen" seolah ini kerjaan kecil — padahal package baru (`packages/cyd-layout-schema`) cuma ekstrak TIPE+VALIDASI, bukan komponen editornya. `apps/saas` **belum punya 1 pun** dari 4 dependency yang dipakai editor dashboard: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `framer-motion` — ini WAJIB dideklarasikan eksplisit di `apps/saas/package.json` (aturan pnpm-strict monorepo). Komponen `PrinterPalette`, `GridCanvas`, `PageTabs`, `CellSettingsPanel` (dari `apps/dashboard/components/cyd-layout/`) juga **harus ditulis ulang** buat SaaS (sumber data `Device` SaaS, bukan `Printer.slug` dashboard) — ini **task terbesar di plan**, bukan satu baris. Preset field 2 opsi hardcode ("Ringkas"/"Detail"). Karena `apps/saas` adalah PWA yang juga dipakai di HP, editor drag-drop di canvas 320×240 perlu dipikirkan interaksi touch-nya (bukan cuma mouse) — dicatat sebagai requirement, detail interaksi diputuskan pas task ini digarap.
- **Section baru di `/settings`** — generate/lihat/revoke Agent token, dengan peringatan jelas "token cuma tampil sekali, simpan baik-baik" saat generate.

## Testing

TDD per konvensi proyek: unit test enforcement slot-count (`POST /api/devices` nolak saat penuh), **test race condition WAJIB ke Postgres asli** (bukan mock — 2 create paralel di slot terakhir via row-lock `FOR UPDATE`, cuma 1 yang boleh sukses), resolusi limit (`printerSlots` null→fallback `getConfigInt`, non-null→override dipakai), validasi layout (`packages/cyd-layout-schema` — reuse test case existing dari dashboard buat mastiin extract tak mengubah perilaku, tambah test baru: batas panjang string, referensi `Device.shortCode` tak valid, `shortCode` collision-retry), `requireAgentToken` helper (valid/invalid/revoked/paidCore-false→403 `entitlement_expired` — tanpa expiry token by design, dicatat eksplisit bukan lupa), `shortCode` generator (uniqueness, retry on `P2002`), audit-fix panjang `Printer.slug` existing di `apps/dashboard` (pre-flight sebelum validasi panjang string aktif), regresi penuh `apps/dashboard` pasca-extract (harus tetap 100% hijau, ini refactor bukan rewrite).

## Out of Scope (eksplisit, dicatat biar tak terlewat di plan)

- Agent (sub-proyek #2, termasuk auto-discovery).
- Firmware LVGL (sub-proyek #3).
- Halaman Monitor live-status (butuh Fase 3 Supabase, di luar scope).
- Purchase flow self-serve buat nambah slot.
- Multi-screen CYD per akun.
- `CydFieldPreset` manager penuh di SaaS.
