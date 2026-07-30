# Field `type` payload CYD: kirim model printer, bukan jenis connector

Tanggal: 2026-07-30
Status: disetujui, siap dibuat plan implementasi

## 1. Masalah

Payload MQTT `3dpb/printers` yang dikirim Agent mengisi kolom `type` dengan jenis connector, bukan
model printer.

- `apps/agent/src/main/engine-manager.ts:36` mengisi `type: p.printerType` — nilainya `"bambu"` atau
  `"moonraker"`.
- `packages/printer-monitor-core/src/payload.ts:17` meneruskan `type: d.type` apa adanya ke payload.
- Service internal `services/printer-monitor/config.example.json` mengisi field yang sama dengan
  MODEL printer: `"X1C"`, `"P1S"`, `"A1Mini"`, `"U1"`. Itulah arti yang dimaksud — komentar
  `DeviceConfig.type` di `packages/printer-monitor-core/src/types.ts:6` sudah menyatakan
  `// model, mis. 'P1P'`.
- `type` adalah satu dari 9 `FieldId` yang boleh dipilih customer di editor layout CYD
  (`packages/cyd-layout-schema/src/types.ts:1`). Akibatnya, sel yang menampilkan "Tipe" di layar CYD
  customer tertulis `"bambu"`, bukan model mesinnya.

Akar masalah: model `Device` di `apps/saas/prisma/schema.prisma:112` tidak punya kolom model/varian
printer sama sekali, jadi Agent memang tak punya data yang benar untuk dikirim. Perbaikan harus di
hulu (SaaS + Agent) — firmware hanya menggambar apa yang datang dari MQTT.

Ditemukan saat brainstorm firmware CYD produk (sub-proyek 3).

## 2. Batas keras dari firmware

Firmware internal menyimpan field ini sebagai `char type[12]`
(`~/Documents/Project/3pb-monitoring-display/apps/internal/src/screens/printers.h:9`) — kapasitas
efektif **11 byte** sebelum null-terminator, sisanya terpotong diam-diam. Semua model nyata jauh di
bawah itu (`"X1C"` 3, `"A1Mini"` 6). Batas ini divalidasi di hulu (SaaS) supaya pemotongan senyap di
firmware tak pernah terjadi.

Angka 11 tinggal sebagai `LAYOUT_LIMITS.maxPrinterModelLength` di `packages/cyd-layout-schema` —
tempat batas-batas buffer firmware lain sudah berkumpul (`maxPrinterIdLength`, `maxLabelLength`,
dst.), dan bisa diimpor SaaS maupun Agent sebagai satu sumber kebenaran.

## 3. Sumber kebenaran & aliran data

SaaS adalah satu-satunya sumber kebenaran untuk model. Agent membaca, dan boleh mengusulkan tulisan
balik atas konfirmasi user (§6).

```
Device.model (Postgres, SaaS)
  → listDevices()                        (lib/devices/service.ts, mengembalikan row Device utuh)
  → GET /api/agent/devices               (bentuk response TIDAK berubah)
  → SaasDevice.model                     (apps/agent/src/main/saas-client.ts)
  → CachedDevice.model                   (device-cache.ts — ikut disimpan untuk rekonstruksi offline)
  → PairedDevice.model                   (startup.ts reconcileDevices)
  → DeviceConfig.type                    (engine-manager.ts, dengan fallback)
  → PrinterRow.type                      (payload.ts, tak disentuh)
```

## 4. Perubahan di SaaS

### 4.1 Skema

`apps/saas/prisma/schema.prisma`, model `Device`: tambah `model String?` (nullable, opsional).

Repo tidak punya `prisma/migrations/` — penerapan lewat `pnpm --filter @3pb/saas db:push`. Kolom
nullable bersifat aditif, aman terhadap DB yang sudah berjalan dan terhadap versi app lama.

### 4.2 Validasi (`lib/devices/service.ts`)

Satu helper `normalizeDeviceModel(value: string): string | null`, dipakai semua jalur tulis:

1. `trim()`.
2. String kosong setelah trim → `null` (mengosongkan model itu sah, bukan error).
3. `Buffer.byteLength(value, "utf8") > LAYOUT_LIMITS.maxPrinterModelLength` → lempar
   `InvalidDeviceModel`. Pakai byte length, BUKAN `.length`: buffer firmware dihitung dalam byte,
   jadi string multibyte harus dinilai per byte.

`InvalidDeviceModel` ditambahkan di `lib/devices/errors.ts` mengikuti pola `InvalidPrinterType`
(punya `status = 400`), dipetakan route ke `{ error: "invalid_device_model" }` HTTP 400.

Jalur tulis yang menerima `model`:

- `createDevice(userId, { label, printerType, model? })`
- `updateDevice(userId, id, { label?, printerType?, model? })` — `model` absen berarti tidak diubah;
  `model: ""` berarti dikosongkan jadi `null`.
- `updateDeviceModelByShortCode(userId, shortCode, model)` — baru, untuk endpoint Agent (§4.4).
  Lookup by `shortCode`, tolak `DeviceNotFound` kalau baris tak ada ATAU `userId` tak cocok (jangan
  bocorkan keberadaan device milik user lain).

Transaksi row-lock di `createDevice` tidak diubah sama sekali — `model` cuma ikut sebagai kolom data
di `tx.device.create`.

### 4.3 Route yang sudah ada

- `POST /api/devices`: terima `model` opsional. Tipe salah (bukan string) → abaikan, sama seperti
  perlakuan `label`/`printerType` yang sudah ada di route ini; `model` valid → diteruskan.
- `PATCH /api/devices/[id]`: terima `model` dengan pola spread yang sama seperti `label`.
- `GET /api/devices` dan `GET /api/agent/devices` tidak diubah (keduanya mengembalikan row utuh).

### 4.4 Endpoint baru untuk Agent

`apps/saas/app/api/agent/devices/[shortCode]/route.ts`, method `PATCH`:

- `requireAgentToken(req)` seperti route `/api/agent/*` lain (bukan middleware).
- Body hanya menerima `{ model }`. Field lain diabaikan — Agent tidak boleh mengubah
  `label`/`printerType`/kepemilikan.
- `updateDeviceModelByShortCode(userId, shortCode, model)`.
- Balasan: device terupdate (200), `{ error: "not_found" }` 404, `{ error: "invalid_device_model" }`
  400, `{ error: "server_error" }` 500. 401/403 datang dari `requireAgentToken`.

### 4.5 UI (`components/printer/DeviceList.tsx`)

Form tambah: di samping dropdown printerType yang sudah ada, input teks **Model** dengan
`<datalist>` sebagai saran (bukan pembatas — varian baru tetap bisa diketik). Isi saran mengikuti
printerType terpilih:

- `bambu`: X1C, X1E, X1, P1S, P1P, A1, A1Mini, H2D
- `moonraker`: U1, Voron, Ender3

Ejaan kanonik mengikuti `services/printer-monitor/config.example.json` (mis. `A1Mini`, bukan
"A1 mini"), supaya nilai di SaaS dan service internal konsisten.

Baris device:

- `model` terisi → tampilkan modelnya.
- `model` null → penanda **"Model belum diisi"** yang bisa diklik untuk edit inline. Ini nudge untuk
  device yang sudah terdaftar sebelum kolomnya ada (§7).
- Edit inline model memakai pola yang sama dengan rename label yang sudah ada (state draft +
  `onBlur`/Enter/Escape → `PATCH /api/devices/:id` dengan `{ model }`), termasuk optimisasi
  "tak berubah → jangan buang request".
- Chip `printerType` tetap ditampilkan: itu informasi connector, bukan model, dan tetap berguna.

Daftar saran per printerType tinggal di `lib/devices/printer-types.ts` (file yang sengaja bebas
Prisma agar bisa diimpor komponen client) sebagai `PRINTER_MODEL_SUGGESTIONS: Record<PrinterType,
readonly string[]>`.

## 5. Perubahan di Agent — jalur payload

- `SaasDevice` (`saas-client.ts`): tambah `model?: string | null`.
- `CachedDevice` (`device-cache.ts`): tambah `model?: string | null`. Cache lama tanpa field ini
  meng-parse jadi `undefined` → jatuh ke fallback, jadi kompatibel mundur tanpa migrasi file.
- `reconcileDevices` (`startup.ts`): ikut memetakan `model` ke metadata cache DAN ke `PairedDevice`.
  Jalur fallback "SaaS unreachable" memetakan `model` dari cache seperti `label`/`printerType`.
- `PairedDevice` (`engine-manager.ts`): tambah `model?: string | null`.
- `engine-manager.ts` mengisi:

  ```ts
  type: p.model?.trim() || CYD_TYPE_FALLBACK[p.printerType]
  ```

  dengan `CYD_TYPE_FALLBACK = { bambu: "Bambu Lab", moonraker: "Klipper" }`. `"Bambu Lab"` (9 byte)
  dan `"Klipper"` (7 byte) dua-duanya masuk batas 11. Pakai `|| ` (bukan `??`) supaya string kosong
  dan whitespace-only juga jatuh ke fallback.

  Konstanta ini tinggal di `apps/agent/src/main/printer-model.ts` (§6) — Agent satu-satunya produsen
  payload ini; `packages/printer-monitor-core` tetap agnostik.

`packages/printer-monitor-core` (types.ts, payload.ts) TIDAK diubah: `DeviceConfig.type` memang sudah
berarti model, Agent-lah yang mengisinya salah.

## 6. Agent — saran model dari hasil scan (rekomendasi, keputusan tetap di user)

File baru `apps/agent/src/main/printer-model.ts`:

- `CYD_TYPE_FALLBACK` (§5).
- `suggestModelFromSsdp(devModel: string): string | null` — tabel pemetaan nilai header
  `DevModel.bambu.com` (sudah diparse `discovery/bambu-ssdp.ts` ke field `model`) → model kanonik.
  Nilai yang **tidak dikenal → `null`**, disertai `console.warn` berisi nilai mentahnya supaya
  tabelnya bisa ditumbuhkan dari lapangan. Sengaja tidak menebak: menormalkan string mentah asal-asalan
  bisa mengirim nilai seperti `"3DPrinter-X"` ke layar customer, lebih buruk daripada tak menyarankan.
- `matchDeviceByName(devName, devices)` — normalisasi (lowercase, buang non-alfanumerik) nama hasil
  scan vs `label` device SaaS, kembalikan `shortCode` yang paling cocok atau `null`. Dipakai HANYA
  untuk menandai tombol "Pasangkan ke …" mana yang direkomendasikan; urutan dan pilihan tetap di
  tangan user.

`PairingScreen.tsx`:

- Form pairing dapat input **Model**, ter-prefill `suggestModelFromSsdp(p.model)` bila pairing
  berasal dari hasil scan Bambu. Kosong untuk pairing manual dan untuk Moonraker (mDNS tak membawa
  model — `DiscoveredMoonrakerPrinter` cuma punya `ip` + `name`). User bebas mengedit atau
  mengosongkan.
- Tombol "Pasangkan ke …" milik device hasil `matchDeviceByName` diberi penanda rekomendasi.
- Saat "Simpan Pairing": secret disimpan lokal seperti sekarang (`agent:pair-device`), LALU bila
  model terisi dan berbeda dari nilai `model` device itu di SaaS → `patchDeviceModel(token,
  shortCode, model)` (baru di `saas-client.ts`, pola `FetchResult` + timeout yang sama).
- Gagal PATCH (offline/401/403) = peringatan non-blocking: "Model belum tersimpan ke akun — bisa
  diisi lewat web". Pairing tetap dihitung selesai; secret lokal sudah tersimpan dan tak boleh
  hilang cuma karena jaringan.
- Setelah semua device ter-pairing, Agent menjalankan `reconcileDevices` (fetch segar) sebelum
  `startEngine`, jadi model yang baru tersimpan langsung terpakai tanpa restart app.

Agent TIDAK menyimpan model versi lokalnya sendiri sebagai sumber kebenaran — satu-satunya jalan
model masuk ke Engine tetap "fetch dari SaaS (atau cache hasil fetch terakhir)". Ini yang mencegah
dua sumber kebenaran yang bisa saling menyimpang.

## 7. Device yang sudah terdaftar

Tanpa backfill: model asli tidak bisa diturunkan dari data yang ada (`printerType` hanya
"bambu"/"moonraker", `label` nama bebas buatan user). Kolom nullable + nudge di DeviceList adalah
jalur pengisiannya. Device yang sudah ter-pairing tidak akan lewat PairingScreen lagi, jadi form web
memang jalur utama untuk mereka; sampai diisi, layar CYD menampilkan "Bambu Lab"/"Klipper" —
tidak ideal tapi tidak salah, dan tidak pernah kosong.

## 8. Kompatibilitas rilis

- Agent lama + SaaS baru → Agent tetap mengirim `printerType`; kolom baru diabaikan. Tak ada yang
  pecah.
- Agent baru + SaaS lama → `model` `undefined` → fallback. Tak ada yang pecah.

Urutan deploy karenanya bebas. `db:push` dijalankan bersama deploy SaaS. Firmware dan
`services/printer-monitor` tidak disentuh.

## 9. Rencana tes (TDD)

SaaS:

- `lib/devices/service.test.ts`: `model` tersimpan saat create; trim; kosong/whitespace → `null`;
  >11 byte → `InvalidDeviceModel` (termasuk kasus multibyte yang lolos kalau salah pakai `.length`);
  `updateDevice` tanpa `model` tidak mengubah kolomnya; `updateDeviceModelByShortCode` menolak
  shortCode milik user lain dengan `DeviceNotFound`.
- `app/api/devices/route.test.ts` + `[id]/route.test.ts`: `model` diteruskan; 400
  `invalid_device_model`.
- `app/api/agent/devices/[shortCode]/route.test.ts` (baru): 401 tanpa token, 403 entitlement habis,
  404 bukan milik user, 200 sukses, 400 model kepanjangan, dan field selain `model` diabaikan.
- `components/printer/DeviceList.test.tsx`: input model + datalist ada; `model` terkirim di POST;
  badge "Model belum diisi" muncul saat null; edit inline mengirim PATCH `{ model }`.

Agent:

- `engine-manager.test.ts`: `model` terisi → `DeviceConfig.type` = model; `null`/`""`/whitespace →
  `"Bambu Lab"` untuk bambu dan `"Klipper"` untuk moonraker.
- `printer-model.test.ts` (baru): kode `DevModel` dikenal → model kanonik; tak dikenal → `null`;
  `matchDeviceByName` cocok walau beda kapitalisasi/spasi, dan `null` kalau tak ada yang mirip.
- `startup.test.ts`: `model` ikut dari response SaaS ke `PairedDevice`; ikut tersimpan & terbaca dari
  device-cache; cache lama tanpa field `model` tetap terbaca (tak melempar).
- `saas-client.test.ts`: `patchDeviceModel` memetakan 401/403/network ke `FetchResult` yang benar.
- `PairingScreen.test.tsx`: saran ter-prefill dari hasil scan; bisa diedit & dikosongkan; PATCH
  terpanggil saat simpan; PATCH gagal → peringatan tampil TAPI device tetap ditandai terpasang.

## 10. Di luar cakupan

- Firmware CYD (sub-proyek 3) — sengaja tidak disentuh; ini perbaikan hulu untuknya.
- `services/printer-monitor` (config internal sudah mengisi model dengan benar).
- Menambah field baru ke kontrak payload `3dpb/printers` — hanya ISI `type` yang diperbaiki,
  bentuknya tidak berubah.
- Menampilkan nudge model yang sama di Dashboard Agent (YAGNI; form web sudah cukup).
- Menyarankan model untuk Moonraker (mDNS tak membawa informasinya).
