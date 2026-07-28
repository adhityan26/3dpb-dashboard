# Bot API — Baca Hasil Kalkulasi Tersimpan

Tanggal: 2026-07-28 · Status: disetujui, siap masuk plan

## 1. Masalah

Bot Discord sudah punya `POST /api/bot/kalkulator`, tapi endpoint itu **stateless**: kirim `gramasi` + `jam` + `tipe`, dapat 5 angka hasil hitung ad-hoc. Ia tidak bisa melihat satu pun kalkulasi yang tersimpan.

Kalkulasi tersimpan ada di `KalkulasiHarga` (+ `KalkulasiPlate`, `KomponenKustom`, `KalkulasiLabor`) dan hanya terekspos lewat `/api/kalkulator`, yang dijaga `auth()` berbasis session. Token bot dapat 401 di sana.

Jadi bot tidak bisa menjawab pertanyaan sesederhana "harga jual Naga Artikulasi berapa?" walau datanya sudah ada di DB.

## 2. Lingkup

**Masuk lingkup:** dua endpoint GET ber-token bot untuk mencari dan membaca kalkulasi tersimpan.

**Di luar lingkup:**
- Menulis/mengubah/menghapus kalkulasi lewat bot (baca saja).
- Mengubah `POST /api/bot/kalkulator` yang sudah ada — tetap apa adanya.
- Mengubah `/api/kalkulator` (jalur session) dan UI dashboard.
- Menambah kolom/migrasi Prisma — semua data yang dibutuhkan sudah tersimpan.

## 3. Endpoint

Keduanya dijaga `requireBotToken` dari `lib/bot/auth.ts`. Token tidak ada / salah → `401 {"error":"Unauthorized"}`.

### `GET /api/bot/kalkulator?q=<kata>&limit=<n>`

Cari kalkulasi tersimpan berdasarkan nama. Ditempatkan sebagai handler `GET` di file route yang sama dengan `POST` yang sudah ada (`app/api/bot/kalkulator/route.ts`) — beda method, path sama. `POST` = hitung ad-hoc, `GET` = baca tersimpan.

- `q` **opsional**. Substring `nama`, case-insensitive (Postgres `contains` + `mode: 'insensitive'`). Kosong/tidak dikirim → kembalikan yang terbaru, sehingga bot dapat perintah "kalkulasi terakhir apa saja" secara gratis.
- `limit` opsional, default 5, di-**clamp** ke 1–20. Nilai di luar rentang atau bukan angka tidak menghasilkan 400 — bot tidak pantas kena error karena minta 100.
- Urutan: `createdAt desc`.

Respons:

```json
{
  "items": [
    { "id": "clx...", "nama": "Naga Artikulasi", "createdAt": "2026-07-20T04:11:02.000Z",
      "batch": 1, "status": "AMAN", "hppTotal": 24500, "floorPrice": 30000,
      "shopeeA": 52000, "offlineA": 45000 }
  ],
  "total": 23
}
```

`total` = jumlah seluruh baris yang cocok (bukan panjang `items`), supaya bot bisa bilang "menampilkan 5 dari 23".

### `GET /api/bot/kalkulator/{id}`

Detail satu kalkulasi. Tidak ketemu → `404 {"error":"not found"}`.

```json
{
  "id": "clx...", "nama": "Naga Artikulasi",
  "createdAt": "2026-07-20T04:11:02.000Z", "updatedAt": "2026-07-21T09:02:11.000Z",
  "batch": 1, "marginTier": "A", "status": "AMAN", "testLayerEnabled": true,
  "harga": {
    "hppProduksi": 18000, "hppKomponen": 4000, "hppFinishing": 2500, "hppTotal": 24500,
    "floorPrice": 30000,
    "shopeeA": 52000, "shopeeB": 48000, "shopeeC": 44000,
    "offlineA": 45000, "offlineB": 41000, "offlineC": 37000,
    "resellerStd": 45000, "resellerBulk": 36000,
    "marginShopeeA": 45.6, "marginOfflineA": 45.6
  },
  "aktual": { "shopee": 55000, "offline": null },
  "plates": [
    { "namaPart": "Badan", "tipe": "FDM", "printer": "P1S",
      "durasiJam": 3.5, "gramasiTotal": 62,
      "materials": [
        { "brand": "Bambu", "material": "PLA Basic", "color": "Red", "colorHex": "#c12026",
          "gramasi": 40, "isSupport": false, "hargaPerGram": 320 },
        { "brand": null, "material": "FDM", "color": null, "colorHex": "#1f1f1f",
          "gramasi": 22, "isSupport": true, "hargaPerGram": null }
      ] }
  ],
  "komponen": [{ "nama": "Gantungan", "harga": 1500, "qty": 2 }],
  "labor": [{ "nama": "Amplas", "jam": 0.5, "ratePerJam": 20000, "flat": null }],
  "hargaChannel": [{ "channelId": "shopee", "A": 52000, "B": 48000, "C": 44000 }]
}
```

### Field yang sengaja TIDAK dikirim

`printerProfileId`, `materialProfileId`, `filamentHargaId`, `thumbnailKey`, `mesinPerJam`, `kalkulasiId` di tiap anak, dan `id` tiap plate/komponen/labor. Bot tidak bisa memakainya, dan mengirimnya membuat tiap perubahan skema jadi perubahan yang merusak bot.

## 4. Normalisasi plate & material

Plate tersimpan dalam **dua bentuk** yang berbeda. API menyatukannya jadi satu bentuk supaya bot cukup paham satu kontrak.

### 4.1 Sumber data

- **Multi-material**: `KalkulasiPlate.materialsJson` = `FilamentEntry[]` → `brand`, `material`, `color`, `gramasi`, `isSupport`, `hargaPerGram`.
- **Single-material (legacy)**: `tipe` + `gramasi` + `color` + `filamentHargaId` (soft FK, tanpa relasi Prisma) + `filamentHargaPerGram`.

### 4.2 Aturan

1. **`materialsJson` ada dan tidak kosong** → dipetakan langsung, satu entry per elemen.
2. **Selain itu (legacy)** → jadi tepat satu entry:
   - `gramasi` ← `plate.gramasi`
   - `hargaPerGram` ← `plate.filamentHargaPerGram ?? null`
   - `brand` / `material` ← hasil lookup `FilamentHarga` lewat `filamentHargaId`. Kalau `filamentHargaId` kosong atau barisnya sudah dihapus → `brand: null`, `material` fallback ke `plate.tipe` (default `"FDM"`).
   - `isSupport` ← `false`
   - warna ← `plate.color` lewat aturan 4.3
3. `gramasiTotal` per plate = jumlah `gramasi` seluruh entry, supaya bot tidak menjumlah sendiri.
4. Plate tanpa material sama sekali → `materials: []`, `gramasiTotal: 0`.

### 4.3 Warna: `color` vs `colorHex`

DB hanya menyimpan **satu** string warna per entry — `FilamentEntry.color` maupun `KalkulasiPlate.color` sama-sama satu kolom. Isinya bisa nama (`"Red"`, input manual) atau hex (`"#c12026"`, lazim dari import 3MF). Tidak ada baris yang menyimpan keduanya sekaligus.

**Pemisahan:** string diawali `#` → `colorHex`; selain itu → `color`. Kosong/null → dua-duanya `null`.

**Pelengkapan dari `FilamentCatalog`** (dua arah), supaya bot bisa menampilkan nama yang enak dibaca sekaligus hex untuk swatch:

- Punya `colorHex`, `color` kosong → cari `colorName` di katalog.
- Punya `color`, `colorHex` kosong → cari `colorHex` di katalog. Arah ini andal karena `@@unique([brand, material, colorName])`.
- Pencocokan: `brand` **dan** `material` harus sama persis (trim + lowercase), bukan fuzzy substring. Fuzzy sengaja dihindari — ia bisa keliru menyamakan `"PLA"` dengan `"PLA HS"`/`"PLA+"` yang material-nya sungguhan berbeda (alasan yang sama dipakai `findCatalogColorName` di `lib/kalkulator/color-catalog.ts`).
- `brand` atau `material` null → lewati pelengkapan, sisi lain tetap `null`.
- Tidak ketemu di katalog → sisi lain tetap `null`, bukan error.

### 4.4 `hargaPerGram` — apa adanya, boleh null

Dikirim **mentah dari yang tersimpan**: `FilamentEntry.hargaPerGram` untuk multi-material, `KalkulasiPlate.filamentHargaPerGram` untuk legacy. Tidak di-resolve ulang.

Konsekuensi yang diterima secara sadar: HPP sesungguhnya dihitung `resolveMaterial()` di `lib/kalkulator/resolve-v2.ts` dengan urutan `entry.hargaPerGram ?? profile?.hppPerGram ?? baseHpp`, dan dua sumber terakhir (`KalkMaterialProfile.hppPerGram`, `rates.fdmHppPerGram`/`slaHppPerGram`) **tidak di-snapshot** per plate. Jadi plate yang memakai material profile akan mengirim `hargaPerGram: null` walau HPP-nya jelas terhitung.

Ini dipilih di atas resolusi live karena tarif dan profil bisa berubah sejak kalkulasi disimpan; angka hasil resolusi sekarang bisa tidak konsisten dengan `hppTotal` tersimpan di baris yang sama (persoalan yang justru ditangani fitur `refresh-tarif`). Setia pada snapshot lebih baik daripada angka yang diam-diam meleset.

**`null` berarti "tidak di-snapshot", bukan "gratis".** Wajib ditulis di `bot-api.md` supaya bot menampilkan `—`, bukan `Rp0`.

## 5. Lapisan kode

Modul baru `lib/kalkulator/bot-view.ts` — bukan menambah isi `service.ts` yang sudah ~14K dan mengurusi CRUD.

```
searchKalkulasiRingkas({ q, limit }) → { items, total }
getKalkulasiForBot(id)              → detail | null
```

Plus fungsi pure yang bisa dites langsung tanpa DB:

```
splitColor(raw)                                   → { color, colorHex }
toBotMaterials(plate, filamentHargaMap, catalog)  → BotMaterial[]
toBotPlate(plate, ...)                            → BotPlate
```

**Rencana query.** `searchKalkulasiRingkas` memakai `select` sempit (9 kolom skalar) — **bukan** `listKalkulasi`, yang menarik `INCLUDE_ALL` (join plates + komponenKustom + labor + produkLinks) untuk tiap baris. Hasil pencarian tidak butuh satu pun join itu.

`getKalkulasiForBot` menjalankan **tiga query batch**, masing-masing satu kali untuk seluruh plate (bukan per plate):

1. `kalkulasiHarga.findUnique` + include plates/komponen/labor.
2. `filamentHarga.findMany({ where: { id: { in: <semua filamentHargaId> } } })` — dilewati kalau tidak ada plate legacy.
3. `filamentCatalog.findMany({ where: { brand: { in: <brand yang muncul> } } })` — dilewati kalau tidak ada brand yang diketahui. Pencocokan `material` + warna dilakukan di memori.

## 6. Error

| Kondisi | Respons |
|---|---|
| Token hilang/salah (kedua endpoint) | `401 {"error":"Unauthorized"}` |
| `id` tidak ada | `404 {"error":"not found"}` |
| `limit` aneh / `q` kosong | Tidak error — clamp, atau jatuh ke "terbaru" |

Tidak ada jalur 400 di kedua endpoint. Bot tidak perlu menebak format input yang benar.

## 7. Testing

**`lib/kalkulator/__tests__/bot-view.test.ts`** — fungsi pure, tanpa DB:
- `splitColor`: hex → `colorHex`; nama → `color`; null/string kosong → dua-duanya null.
- Plate legacy → tepat satu entry, `brand`/`material` dari `FilamentHarga`.
- Plate legacy tanpa `filamentHargaId` → `brand: null`, `material` fallback ke `tipe`.
- Plate multi-material → satu entry per elemen, `isSupport` terbawa.
- `gramasiTotal` = jumlah entry; plate tanpa material → `[]` dan `0`.
- Pelengkapan katalog dua arah: hex → nama, dan nama → hex.
- Katalog **tidak** dipakai saat `brand`/`material` beda (mis. `"PLA"` vs `"PLA HS"` tidak boleh saling mengisi).
- `hargaPerGram` null diteruskan apa adanya, tidak jadi 0.

**`app/api/bot/kalkulator/__tests__/route.test.ts`** — handler dipanggil langsung, service + `requireBotToken` di-mock, mengikuti pola `app/api/cyd-field-presets/__tests__/route.test.ts`:
- 401 tanpa token di `GET` list maupun `GET` detail.
- `POST` yang sudah ada tetap jalan (regresi: menambah `GET` tidak merusaknya).
- `q` diteruskan ke service; `q` kosong tetap memanggil service.
- `limit` clamp: `0` → 1, `999` → 20, `"abc"` → 5.
- Detail 404 saat service mengembalikan null.
- Bentuk respons detail **tidak** memuat kunci internal (`printerProfileId`, `filamentHargaId`, `thumbnailKey`, `kalkulasiId`) — assert negatif ini yang menjaga kurasi tidak diam-diam berubah jadi passthrough.

## 8. Dokumentasi

`apps/dashboard/docs/bot-api.md` ditambah kedua endpoint, dan bagian `POST /api/bot/kalkulator` diperjelas: `POST` = hitung ad-hoc, `GET` = baca tersimpan. Sertakan arti `hargaPerGram: null` (§4.4) dan `color`/`colorHex` (§4.3).

## 9. Keputusan yang sudah ditutup

| Pertanyaan | Keputusan |
|---|---|
| Baca tersimpan vs hitung ad-hoc lebih kaya | Baca tersimpan |
| Bentuk lookup | Cari + detail, dua endpoint |
| Bentuk payload | Kurasi khusus bot, bukan passthrough |
| Path pencarian | `GET` di path yang sama dengan `POST`, bukan `/list` |
| Rincian filament per plate | `materials[]` dinormalisasi |
| Warna | Dilengkapi dua arah dari `FilamentCatalog` |
| `hargaPerGram` | Snapshot mentah, boleh null |
| `hargaChannel` | Ikut dikirim di detail |
