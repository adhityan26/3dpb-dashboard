# Header strip CYD: teks custom user (marquee) -- sisi SaaS

Tanggal: 2026-08-05
Status: disetujui, siap dibuat plan implementasi
Sub-proyek: A dari 2 (A = SaaS/schema/Agent-passthrough, B = firmware -- lihat
`~/Documents/Project/3pb-monitoring-display/apps/produk/docs/superpowers/specs/2026-08-05-cyd-header-marquee-firmware-design.md`)

## 1. Masalah

Strip notifikasi di layar CYD (`notif_strip.cpp`) saat state netral (tak ada error/finish aktif)
menampilkan judul hardcoded `"Slizebiz"` + jam. User ingin bisa mengisi teks bebas sendiri (mis.
kata motivasi harian) yang tampil di situ, dan otomatis marquee/scroll kalau teksnya kepanjangan
buat muat di strip.

Layar boot ("Connecting", logo besar) SENGAJA TIDAK ikut berubah -- itu trademark tetap.

Ditemukan saat brainstorm lanjutan setelah fitur boot-screen CYD selesai (2026-08-05).

## 2. Batas keras dari firmware

Field baru disimpan firmware sebagai `char headerText[125]` (lihat spec sub-proyek B) -- kapasitas
efektif **120 byte** sebelum null-terminator + margin kecil. Batas ini divalidasi di SaaS (bukan di
Agent atau firmware) supaya pemotongan senyap tak pernah terjadi di titik yang jauh dari input user.

Angka 120 tinggal sebagai `LAYOUT_LIMITS.headerTextMaxLength` di `packages/cyd-layout-schema` --
tempat batas buffer firmware lain sudah berkumpul (`maxPrinterModelLength`, `maxLabelLength`, dst.).

## 3. Sumber kebenaran & aliran data

SaaS adalah satu-satunya sumber kebenaran untuk `headerText`. Field ini menumpang pipeline
`LayoutConfigOut` yang sudah ada (bukan endpoint/topic MQTT baru):

```
CydLayout.config.headerText (bagian blob JSON, kolom Json, Postgres, SaaS)
  -> saveLayoutForUser() / getLayout()      (lib/cyd-layout/service.ts)
  -> PUT/GET /api/cyd-layout                (editor web /printer)
  -> GET /api/agent/layout                  (dibaca Agent)
  -> JSON.stringify(result.data) apa adanya (layout-publisher.ts -- TIDAK BERUBAH)
  -> MQTT retained 3dpb/cyd/<id>/layout
  -> firmware layout_parser.cpp (sub-proyek B)
```

Karena Agent men-serialize seluruh objek `LayoutConfigOut` tanpa memilih field satu-satu
(`layout-publisher.ts:10`, `JSON.stringify(result.data)`), menambah field baru ke tipe dan ke
response API SaaS otomatis mengalir ke MQTT **tanpa perubahan kode Agent sama sekali**.

## 4. Perubahan skema

**Koreksi dari draf awal** (ditemukan saat self-review, sebelum implementasi): `CydLayout` di
Postgres BUKAN punya kolom per-field. Skemanya (`apps/saas/prisma/schema.prisma:126-131`):

```prisma
model CydLayout {
  userId    String   @id
  config    Json
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Seluruh `LayoutConfigOut` (termasuk `pages`) disimpan sebagai SATU blob `Json`. Konsekuensinya:

- **Tidak perlu migration Prisma sama sekali.** `headerText` otomatis jadi bagian blob begitu masuk
  ke tipe `LayoutConfigOut` dan lolos `validateLayoutConfig()`.
- Validasi bukan di `lib/cyd-layout/service.ts` seperti draf awal, tapi di validator SHARED yang
  sudah ada: `packages/cyd-layout-schema/src/validate.ts`, fungsi `validateLayoutConfig()`
  (`validate.ts:112-126`) -- pemeriksa top-level yang sudah mengecek `schemaVersion`/`pages` dengan
  pola `return { valid: false, error: "..." }` (bukan throw custom exception class).

### 4.1 `packages/cyd-layout-schema/src/types.ts`

- `LayoutConfigOut`: tambah `headerText?: string` (opsional, top-level -- sejajar `schemaVersion`,
  `pages`, bukan di dalam salah satu page/cell).
- `LAYOUT_LIMITS`: tambah `headerTextMaxLength = 120`.

### 4.2 `packages/cyd-layout-schema/src/validate.ts`

Di `validateLayoutConfig()`, tambah satu pemeriksaan top-level (pola sama persis
`schemaVersion`/`pages`, sebelum atau sesudah loop `pages`):

```ts
if (input.headerText !== undefined) {
  if (typeof input.headerText !== 'string') return { valid: false, error: 'headerText wajib string' }
  if (Buffer.byteLength(input.headerText, 'utf8') > LAYOUT_LIMITS.headerTextMaxLength) {
    return { valid: false, error: `headerText melebihi batas ${LAYOUT_LIMITS.headerTextMaxLength} byte` }
  }
}
```

Pakai byte length (`Buffer.byteLength`, BUKAN `.length`) -- buffer firmware dihitung per byte,
string multibyte (emoji, aksen) harus dinilai per byte supaya batas validasi match persis batas
buffer firmware. Trim di sisi UI (§6) sebelum dikirim; validator tidak perlu trim sendiri (pola
existing di file ini juga tidak trim field string lain seperti `page.id`).

String kosong (`""`) valid dan lolos batas ini -- berarti "belum diisi", firmware sudah
menganggap string kosong sama dengan field absen (fallback ke "Slizebiz", lihat spec sub-proyek B).
Tidak perlu konversi ke `null` seperti draf awal -- JSON blob ini tidak lewat kolom Postgres
bertipe, jadi `""` valid apa adanya.

`saveLayout()`/`saveLayoutForUser()`/`getLayout()`/`getLayoutOrNull()` di
`lib/cyd-layout/service.ts` TIDAK BERUBAH -- semuanya sudah generic terhadap `LayoutConfigOut`
lewat `validateLayoutConfig()` yang sudah ada di jalur `saveLayout()` (`service.ts:43`).

## 5. Route yang sudah ada

**Tidak ada perubahan route sama sekali.** `PUT /api/cyd-layout` (`app/api/cyd-layout/route.ts`)
sudah generic: `saveLayoutForUser` melempar `InvalidLayoutConfig(result.error)` untuk SEMUA
kegagalan validasi (termasuk `headerText` kepanjangan setelah §4.2), route sudah menangkapnya dan
membalas `{ error: "invalid_layout", reason: e.message }` HTTP 400 -- pesan errornya otomatis jadi
teks dari §4.2 tanpa kode tambahan. `GET /api/cyd-layout` dan `GET /api/agent/layout` juga tak
berubah, keduanya sudah generic terhadap `LayoutConfigOut`.

## 6. UI (`components/printer/LayoutEditor.tsx`)

Field baru **di luar grid canvas** -- ini bukan properti sel/halaman, tapi pengaturan global strip
header. Diletakkan sebagai satu input teks kecil di bagian atas editor (dekat kontrol
page/tabs-level, bukan di `CellSettingsPanel.tsx` yang lingkupnya per-sel):

- Label: "Teks header (opsional)".
- `<textarea>` atau `<input>` single-line, counter karakter `x/120` (hitung byte UTF-8 di client
  juga, konsisten dengan validasi server -- `new TextEncoder().encode(value).length`).
- Placeholder: contoh singkat (mis. "Semangat pagi! Cetak lancar hari ini 🚀").
- Trim di client sebelum kirim ke `PUT /api/cyd-layout`. Kosongkan input -> terkirim `headerText: ""`
  -> firmware pakai fallback "Slizebiz" (§4.2 -- string kosong valid, tak perlu jadi `null`).
- Perubahan tersimpan lewat jalur save yang sama dengan perubahan layout lain di editor ini (tidak
  perlu tombol simpan terpisah, ikut pola auto-save/save-button existing) -- field ini ikut terkirim
  sebagai bagian body `PUT` yang sudah membawa `schemaVersion`+`pages`, karena satu objek
  `LayoutConfigOut` yang sama.

## 7. Kompatibilitas rilis

- Agent lama (belum tahu field baru) + SaaS baru: Agent tetap `JSON.stringify(result.data)` apa
  adanya -- field baru otomatis ikut terkirim tanpa perlu redeploy Agent. Tak ada yang pecah.
- Firmware lama (sub-proyek B belum di-deploy, `apps/produk`) menerima JSON dengan `headerText` di
  dalamnya: `layout_parser.cpp` lama hanya membaca key yang dikenalinya, field asing diabaikan
  begitu saja (lihat pola existing di parser, tak ada whitelist/reject unknown-key). Tak ada yang
  pecah.
- Firmware `apps/internal` (app terpisah, punya `layout_parser.cpp` sendiri, pola parsing sama --
  `doc["key"] | default`, tak reject unknown-key): otomatis mengabaikan `headerText` selamanya --
  app itu tidak punya `notif_strip.cpp`/strip header sama sekali, jadi field ini memang tak relevan
  di sana. Tidak perlu perubahan apa pun di `apps/internal`.
- Urutan deploy bebas antara sub-proyek A dan B.

## 8. Rencana tes (TDD)

- `packages/cyd-layout-schema/src/validate.test.ts` (atau file test yang sudah ada untuk
  `validateLayoutConfig`): `headerText` absen -> valid (opsional); `headerText: ""` -> valid;
  `headerText` non-string -> invalid; `headerText` di bawah batas -> valid; >120 byte -> invalid
  (termasuk kasus string multibyte/emoji yang PANJANGNYA `.length`-nya di bawah 120 tapi byte-nya di
  atas -- ini skenario yang justru harus tertangkap, bukan lolos).
- `app/api/cyd-layout/route.test.ts` (kalau sudah ada test existing untuk route ini, tambah kasus
  baru; kalau belum ada, tidak perlu dibuat khusus untuk fitur ini -- validasi intinya ada di level
  `validateLayoutConfig` yang sudah tertest): `headerText` valid diteruskan lewat PUT dan balik di
  response; `headerText` kepanjangan -> 400 `{ error: "invalid_layout", reason: "..." }`.
- `components/printer/LayoutEditor.test.tsx`: input `headerText` ada, ter-render dari data existing,
  counter karakter update saat mengetik (byte-based, bukan `.length`), perubahan terkirim di payload
  save (trimmed).

## 9. Di luar cakupan

- Firmware CYD (parsing + render marquee) -- sub-proyek B, spec terpisah, target `apps/produk` saja.
- `apps/internal` (firmware terpisah) -- tidak disentuh, lihat §7.
- Layar boot/Connecting -- tetap "Slizebiz" hardcoded, tidak disentuh sama sekali.
- Multi-teks/rotasi beberapa quote -- YAGNI, satu field teks statis per user untuk sekarang.
- Field per-halaman (teks beda per page CYD) -- YAGNI, satu `headerText` global per user/device.
