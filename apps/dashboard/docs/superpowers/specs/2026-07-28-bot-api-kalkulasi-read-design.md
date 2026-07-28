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

- `q` **opsional**. Substring `nama`, case-insensitive (Postgres `contains` + `mode: 'insensitive'`). **Di-trim dulu**; kosong setelah trim (termasuk `q="  "`) diperlakukan sama dengan tidak dikirim — klausa `where` dihilangkan sepenuhnya, bukan `contains " "`. Hasilnya: yang terbaru, sehingga bot dapat perintah "kalkulasi terakhir apa saja" secara gratis.
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

Juga tidak dikirim: **`packingType`**. Efek sampingnya harus disadari — untuk row lama yang `packingType`-nya terisi, biaya packing ikut terhitung di `hppKomponen` tapi **tidak** ada barisnya di `komponenKustom` (dashboard merekonstruksinya saat dibutuhkan, `service.ts:193-195`). Jadi `harga.hppKomponen` bisa **lebih besar** dari jumlah `komponen[]`. Wajib ditulis di `bot-api.md` supaya tidak dikira bug.

### Nilai null & row lama

| Field | Aturan |
|---|---|
| `hargaChannel` | `hargaChannelJson` null (row pra-v2) atau gagal parse → **`[]`**, bukan `null`, bukan key hilang |
| entry `hargaChannel` | Di-**re-map eksplisit** ke `{channelId, A, B, C}`, bukan spread hasil `JSON.parse`. `HargaChannelV2` punya field `margin` (`packages/kalkulator-core/src/types.ts:184`) yang tidak boleh ikut bocor |
| `aktual.shopee` / `aktual.offline` | `hargaShopeeAktual` / `hargaOfflineAktual` null → `null` |
| `namaPart`, `printer` | Nullable di DB (schema.prisma:227,229) → bisa `null` di respons; contoh di atas kebetulan terisi |
| `hargaPerGram` | Boleh `null` — lihat §4.4 |
| `brand`, `color`, `colorHex` | Boleh `null` — lihat §4.3 |
| `material` | Boleh `null` pada entry multi-material. `FilamentEntry.material` bertipe `string` non-nullable, tapi nilainya bisa `""` — `slot?.type \|\| f.type` (`build-draft.ts:62`) dengan `f.type` = `attrValue(tag, "type") ?? ""` (`parse-slice-info.ts:53`). Kosong dinormalisasi jadi `null` (§4.3). Entry legacy selalu terisi karena fallback ke `plate.tipe` |

## 4. Normalisasi plate & material

Plate tersimpan dalam **dua bentuk** yang berbeda. API menyatukannya jadi satu bentuk supaya bot cukup paham satu kontrak.

### 4.1 Sumber data

- **Multi-material**: `KalkulasiPlate.materialsJson` = `FilamentEntry[]` → `brand`, `material`, `color`, `gramasi`, `isSupport`, `hargaPerGram`.
- **Single-material (legacy)**: `tipe` + `gramasi` + `color` + `filamentHargaId` (soft FK, tanpa relasi Prisma) + `filamentHargaPerGram`.

### 4.2 Aturan

1. **`materialsJson` ter-parse jadi array tidak kosong** → dipetakan langsung, satu entry per elemen, dengan dua aturan validasi yang **berbeda dan tidak boleh dicampur**:
   - Elemen yang **bukan objek** (mis. angka, string, `null`) → **dibuang**.
   - Elemen objek yang `gramasi`-nya bukan angka berhingga → **dipertahankan** dengan `gramasi = 0`. Field lainnya tetap dipetakan seperti biasa.

   Kalau setelah pembuangan array menjadi kosong (mis. `materialsJson` berisi `[1, "x"]`), plate **jatuh ke aturan 3** — diperlakukan sebagai legacy. Ini yang menjaga invarian "`materials` tidak pernah kosong" di bawah.
2. **Selain itu (legacy)** → jadi **tepat satu entry**:
   - `gramasi` ← `plate.gramasi`
   - `hargaPerGram` ← `plate.filamentHargaPerGram ?? null`
   - `brand` / `material` ← hasil lookup `FilamentHarga` lewat `filamentHargaId`. Kalau `filamentHargaId` kosong **atau** barisnya sudah dihapus (id ada tapi tidak ketemu di map) → `brand: null`, `material` fallback ke `plate.tipe` (default `"FDM"`).
   - `isSupport` ← `false`
   - warna ← `plate.color` lewat aturan 4.3
3. **`materialsJson` gagal di-parse, hasilnya bukan array, array kosong, atau seluruh elemennya dibuang oleh aturan 1** → diperlakukan sebagai legacy (aturan 2), **tidak melempar error**. `JSON.parse` wajib dibungkus try/catch + cek `Array.isArray`, meniru `parseHargaChannel` (`lib/kalkulator/service.ts:27-33`) dan **bukan** `toKalkulasiData` (service.ts:42) yang mem-parse telanjang. Endpoint bot tidak boleh 500 gara-gara satu baris data rusak.
4. `gramasiTotal` per plate = jumlah `gramasi` seluruh entry.

Konsekuensi yang disengaja: **`materials` tidak pernah kosong** — plate legacy selalu menghasilkan tepat satu entry, walau `gramasi`-nya 0. `KalkulasiPlate.gramasi` non-nullable (schema.prisma:230) dan `platesCreate` selalu mengisi `p.gramasi ?? 0` (service.ts:77), jadi tidak ada kondisi "plate tanpa material" yang bisa dibedakan secara andal. Entry gramasi-0 dikirim apa adanya; bot yang memutuskan mau menampilkannya atau tidak.

### 4.3 Warna: `color` vs `colorHex`

DB hanya menyimpan **satu** string warna per entry — `FilamentEntry.color` maupun `KalkulasiPlate.color` sama-sama satu kolom. Isinya bisa nama (`"Red"`, input manual) atau hex (`"#c12026"`, lazim dari import 3MF). Tidak ada baris yang menyimpan keduanya sekaligus.

**Pemisahan:** string diawali `#` → `colorHex`; selain itu → `color`. Kosong/null → dua-duanya `null`.

**Pelengkapan dari `FilamentCatalog`** (dua arah), supaya bot bisa menampilkan nama yang enak dibaca sekaligus hex untuk swatch:

- Punya `colorHex`, `color` kosong → cari `colorName` di katalog.
- Punya `color`, `colorHex` kosong → cari `colorHex` di katalog. Arah ini andal karena `@@unique([brand, material, colorName])`.
- Pencocokan: `brand` **dan** `material` harus sama persis (trim + lowercase), bukan fuzzy substring. Fuzzy sengaja dihindari — ia bisa keliru menyamakan `"PLA"` dengan `"PLA HS"`/`"PLA+"` yang material-nya sungguhan berbeda (alasan yang sama dipakai `findCatalogColorName` di `lib/kalkulator/color-catalog.ts`).
- `brand` atau `material` **null atau kosong setelah trim** → lewati pelengkapan, sisi lain tetap `null`. Kasus ini nyata, bukan teoretis: `FilamentEntry.brand` bertipe `string` non-nullable dan import 3MF mengisinya `slot?.vendor ?? ""` (`lib/kalkulator/import-3mf/build-draft.ts:61`), jadi nilai degeneratnya `""`, bukan `null`.
- `brand`/`material` kosong **dinormalisasi jadi `null`** di respons, supaya bot cukup mengecek satu bentuk kosong.
- Perbandingan hex case-insensitive. Hex 8 digit (`#RRGGBBAA`, dipakai Bambu) tidak akan cocok dengan katalog yang 6 digit — diterima apa adanya, bukan bug.
- **Tie-break arah hex → nama:** `@@unique` katalog hanya `[brand, material, colorName]` (schema.prisma:73), jadi dua `colorName` berbeda boleh punya `colorHex` sama. Kalau kandidatnya lebih dari satu, ambil `colorName` paling kecil secara alfabetis — supaya hasilnya deterministik, tidak bergantung urutan `findMany`.
- Tidak ketemu di katalog → sisi lain tetap `null`, bukan error.

**Catatan konsistensi:** pelengkapan warna memakai katalog **saat ini**, bukan snapshot — `FilamentCatalog` di-sync ulang (`syncedAt`), sehingga respons untuk kalkulasi yang sama bisa berubah antar-panggilan. Ini melanggar prinsip "setia pada snapshot" di §4.4 secara sadar, dan diterima karena warna murni kosmetik: ia tidak ikut menghitung HPP, jadi tidak bisa membuat angka jadi tidak konsisten.

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
toBotPlate(plate, filamentHargaMap, catalog)      → BotPlate
toBotDetail(row, filamentHargaMap, catalog)       → detail
```

`toBotDetail` menerima row hasil `findUnique` + include dan mengembalikan bentuk respons §3 secara utuh — termasuk `harga`, `aktual`, `komponen`, `labor`, `hargaChannel`, dan pemanggilan `toBotPlate`. `getKalkulasiForBot` jadi tipis: jalankan tiga query, panggil `toBotDetail`, selesai.

Pemisahan ini bukan kosmetik — tanpanya, seluruh logika mapping detail hanya hidup di dalam fungsi ber-DB, sementara route test me-mock service. Test mapping apa pun yang ditaruh di route test cuma akan menguji bahwa mock di-echo kembali, dan tidak menjaga apa-apa (lihat §7).

**Path file:**

```
lib/kalkulator/bot-view.ts                    (baru)
app/api/bot/kalkulator/route.ts               (tambah handler GET, POST tetap)
app/api/bot/kalkulator/[id]/route.ts          (baru)
lib/kalkulator/__tests__/bot-view.test.ts     (baru)
app/api/bot/kalkulator/__tests__/route.test.ts (baru)
```

**Rencana query.** `searchKalkulasiRingkas` memakai `select` sempit (9 kolom skalar) — **bukan** `listKalkulasi`, yang menarik `INCLUDE_ALL` (join plates + komponenKustom + labor + produkLinks) untuk tiap baris. Hasil pencarian tidak butuh satu pun join itu.

`getKalkulasiForBot` menjalankan **tiga query batch**, masing-masing satu kali untuk seluruh plate (bukan per plate):

1. `kalkulasiHarga.findUnique` + include plates/komponen/labor.
2. `filamentHarga.findMany({ where: { id: { in: <semua filamentHargaId> } } })` — dilewati kalau tidak ada plate legacy.
3. `filamentCatalog.findMany` untuk brand yang muncul — dilewati kalau tidak ada brand yang diketahui. Pencocokan `material` + warna dilakukan di memori.

   **Filternya wajib case-insensitive**, yaitu `where: { OR: brands.map(b => ({ brand: { equals: b, mode: 'insensitive' } })) }` dengan `brands` sudah di-trim & di-dedup — **bukan** `{ brand: { in: brands } }`. `in` adalah exact match case-sensitive, sedangkan brand di kalkulasi berasal dari vendor slot 3MF / input manual (`build-draft.ts:61`) sementara brand di katalog berasal dari `entry.manufacturer` saat sync (`lib/filamen/catalog-service.ts:28`) — dua sumber berbeda yang casing/spasinya bisa tidak sama. Prefilter yang case-sensitive akan membuang kandidat yang seharusnya lolos pencocokan in-memory §4.3, dan gagalnya **diam** (warna sekadar tidak terisi). Test fungsi pure tidak akan menangkap ini karena bug-nya ada di layer query — maka aturan ini ditulis eksplisit di sini.

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
- Plate legacy dengan `filamentHargaId` yang **barisnya sudah dihapus** (map miss) → sama seperti di atas. Jalur berbeda dari kasus id kosong, jadi dites terpisah.
- Plate multi-material → satu entry per elemen, `isSupport` terbawa.
- `gramasiTotal` = jumlah entry; plate legacy `gramasi: 0` tetap menghasilkan **satu** entry, bukan `[]`.
- `materialsJson` rusak (bukan JSON valid), bukan array, dan array kosong → jatuh ke jalur legacy, **tidak melempar**.
- Pelengkapan katalog dua arah: hex → nama, dan nama → hex.
- Katalog **tidak** dipakai saat `brand`/`material` beda (mis. `"PLA"` vs `"PLA HS"` tidak boleh saling mengisi).
- Pelengkapan dilewati saat `brand` `""` (bukan hanya null), dan `""` dinormalisasi jadi `null` di output.
- Dua entry katalog beda `colorName` dengan `colorHex` sama → tie-break alfabetis, hasil deterministik.
- Perbandingan hex case-insensitive: entry `"#C12026"` cocok dengan katalog `"#c12026"`.
- `splitColor` men-trim dulu: `" #c12026"` tetap terbaca sebagai hex, bukan nama warna.
- Elemen `materialsJson` bukan objek → dibuang; elemen objek ber-`gramasi` invalid → dipertahankan dengan `gramasi: 0` (dua perlakuan berbeda, §4.2 aturan 1).
- `materialsJson` yang seluruh elemennya terbuang (mis. `[1, "x"]`) → jatuh ke legacy, bukan `materials: []`.
- `hargaPerGram` null diteruskan apa adanya, tidak jadi 0.
- Mapping `aktual`: `hargaShopeeAktual`/`hargaOfflineAktual` null → `null`.
- `hargaChannel`: `hargaChannelJson` null → `[]`; entry hanya `{channelId, A, B, C}` walau input punya `margin`.
- Hasil `toBotDetail` **tidak** memuat kunci internal (`printerProfileId`, `filamentHargaId`, `thumbnailKey`, `kalkulasiId`, `packingType`) — assert negatif yang menjaga kurasi tidak diam-diam jadi passthrough.

**`app/api/bot/kalkulator/__tests__/route.test.ts`** — handler dipanggil langsung, service + `requireBotToken` di-mock, mengikuti pola `app/api/cyd-field-presets/__tests__/route.test.ts`:
- 401 tanpa token di `GET` list maupun `GET` detail.
- `POST` yang sudah ada tetap jalan (regresi: menambah `GET` tidak merusaknya).
- `q` diteruskan ke service; `q` kosong tetap memanggil service.
- `limit` clamp: `0` → 1, `999` → 20, `"abc"` → 5.
- Detail 404 saat service mengembalikan null.

**Yang TIDAK ditaruh di route test:** semua assertion soal bentuk/mapping detail (`aktual`, `hargaChannel`, assert negatif kunci internal). Karena service di-mock, test semacam itu di sini hanya menguji bahwa mock di-echo kembali — hampa. Semuanya hidup di `bot-view.test.ts` terhadap `toBotDetail`, yang pure dan tidak butuh mock.

**Tidak tertutup test, sengaja:** `searchKalkulasiRingkas`/`getKalkulasiForBot` sendiri (where insensitive-contains, `select` sempit, `count`, filter katalog case-insensitive) tidak dites — keduanya tinggal fetch + delegasi ke fungsi pure, dan route test me-mock service, mengikuti pola proyek yang sudah ada. Konsekuensinya klaim §5 tidak dijaga apa pun secara otomatis, jadi **dua hal ini masuk checklist review manual di implementation plan**: (a) query pakai `select` sempit, bukan `listKalkulasi`; (b) filter brand katalog case-insensitive, bukan `in`.

## 8. Dokumentasi

`apps/dashboard/docs/bot-api.md` ditambah kedua endpoint, dan bagian `POST /api/bot/kalkulator` diperjelas: `POST` = hitung ad-hoc, `GET` = baca tersimpan. Wajib disertakan:

- Arti `hargaPerGram: null` = tidak di-snapshot, tampilkan `—` bukan `Rp0` (§4.4).
- Arti `color` vs `colorHex`, dan bahwa salah satunya bisa `null` (§4.3).
- Peringatan `harga.hppKomponen` bisa lebih besar dari jumlah `komponen[]` pada row lama ber-`packingType` (§3).
- Field yang bisa `null`: `namaPart`, `printer`, `brand`, `material`, `color`, `colorHex`, `aktual.*`.

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
