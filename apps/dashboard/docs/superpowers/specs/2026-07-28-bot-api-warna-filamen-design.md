# Bot API — Lookup Warna Filament (SpoolmanDB)

Tanggal: 2026-07-28 · Status: disetujui, siap masuk plan

## 1. Masalah

Bot harus bisa menjawab tiga pertanyaan warna filament:

1. **Nama → hex:** "eSUN red hex code-nya apa?"
2. **Hex → nama:** "hex 000000 itu namanya apa?"
3. **Hex → warna terdekat:** "yang mendekati hex aa67eb warna apa di Bambu Lab?"

Datanya sudah ada, tapi tidak terjangkau bot: tabel `FilamentCatalog` hanya dibaca UI dashboard (`/api/filamen/catalog`, session auth) dan dipakai internal oleh import 3MF.

## 2. Sumber data

`FilamentCatalog` **adalah** database Spoolman — di-sync dari `https://donkie.github.io/SpoolmanDB/filaments.json` oleh `syncCatalogFromSpoolmanDB` (`lib/filamen/catalog-service.ts:4`). Kolomnya: `brand` (dari `manufacturer`), `material`, `colorName` (dari `name`), `colorHex`. Baris tanpa `color_hex` tidak ikut ter-sync.

Bukan `SpoolmanSpool`/`Spool` — itu inventaris fisik dan berat, tidak relevan untuk pertanyaan warna.

## 3. Lingkup

**Masuk:** satu endpoint GET ber-token untuk lookup warna.

**Di luar:**
- Stok, sisa berat, status spool, slot AMS (`Spool`/`SpoolmanSpool`) — diputuskan terpisah.
- Menulis/menyunting katalog. Sync tetap dari dashboard.
- Mengubah `/api/v1/*` maupun `/api/bot/stok/filament` yang sudah ada.

## 4. Endpoint

`GET /api/bot/filamen/warna` — dijaga `requireBotToken`. Token hilang/salah → `401 {"error":"Unauthorized"}`.

| Param | Wajib | Arti |
|---|---|---|
| `q` | salah satu dari `q`/`hex` | Substring `colorName`, case-insensitive |
| `hex` | salah satu dari `q`/`hex` | Warna acuan; hasil diurutkan dari termirip |
| `brand` | tidak | Substring `brand`, case-insensitive |
| `material` | tidak | Substring `material`, case-insensitive |
| `limit` | tidak | Default 5, clamp 1–20 |

`q` dan `hex` boleh dipakai bersamaan (mis. "merah yang mendekati aa67eb").

**Tanpa `q` maupun `hex` → `400 {"error":"butuh minimal salah satu: q atau hex"}`.** Ini satu-satunya jalur 400, dan disengaja: tanpa keduanya tidak ada default yang masuk akal — mengembalikan seluruh katalog bukan jawaban, hanya dump.

### Respons

```json
{
  "mode": "hex",
  "total": 412,
  "items": [
    { "brand": "Bambu Lab", "colorName": "Purple", "colorHex": "#A06EEA",
      "materials": ["PLA Basic", "PETG HF"], "deltaE": 2.4, "exact": false }
  ]
}
```

- `mode` — `"hex"` kalau `hex` dikirim, selain itu `"nama"`.
- `total` — **jumlah kandidat setelah filter `brand`/`material`/`q`, sebelum dipotong `limit`**. Definisi ini ditulis eksplisit supaya tidak ditafsirkan sebagai "jumlah yang mirip".
- `deltaE` — `null` pada mode `nama`.
- `exact` — `true` hanya kalau hex-nya identik setelah normalisasi. Ini yang membedakan "itu **namanya** X" dari "yang **mendekati** X"; bot tidak boleh menyimpulkannya sendiri dari `deltaE` kecil.

### Pengurutan

- Mode `hex`: `deltaE` menaik; seri diputus `brand` lalu `colorName` alfabetis (deterministik).
- Mode `nama`: `brand` lalu `colorName` alfabetis.

## 5. Kemiripan warna: CIE ΔE2000

Konversi sRGB → linear RGB → XYZ (D65) → CIELab, lalu **CIEDE2000**.

**Kenapa bukan jarak RGB.** Jarak Euclidean di RGB menganggap selisih di hijau sama pentingnya dengan di biru, sedangkan mata tidak. Contoh dari kebutuhan nyata: `#aa67eb` ungu bisa dinilai "lebih dekat" ke abu-abu daripada ke ungu lain yang jelas lebih mirip. Fitur yang menjawab "warna apa yang mendekati" kehilangan seluruh gunanya kalau jawabannya terasa salah.

**Kenapa ΔE2000, bukan ΔE76.** ΔE76 (Euclidean di Lab) sudah jauh lebih baik dari RGB, tapi kelemahan terbesarnya justru di wilayah biru–ungu — persis wilayah contoh di atas. ΔE2000 mengoreksi itu.

Implementasi matematika murni, **tanpa dependency baru** (pnpm di repo ini strict; menambah paket untuk ~60 baris rumus tidak sepadan). Ditempatkan di `lib/filamen/color-distance.ts`, pure, tanpa DB.

**Diuji terhadap data referensi Sharma et al.** — test vector CIEDE2000 yang dipublikasikan. Rumusnya penuh jebakan (pembungkusan sudut hue, suku rotasi), jadi implementasi yang "kelihatan benar" mudah meleset; nilai referensi adalah satu-satunya cara membuktikannya.

### Normalisasi hex

- Terima dengan/tanpa `#`, case bebas.
- 6 digit (`RRGGBB`) dan 3 digit (`RGB`, diekspansi).
- 8 digit (`RRGGBBAA`): alpha **diabaikan**, bukan ditolak — hex 8 digit lazim datang dari Bambu.
- Tidak bisa di-parse → lihat §7.

## 6. Dedup lintas material

Unique katalog `[brand, material, colorName]`, jadi "eSUN Red" bisa muncul untuk PLA, PLA+, dan PETG sekaligus. Baris dengan **`brand` + `colorName` + `colorHex` sama** digabung jadi satu hasil, `materials` berisi daftar material terurut alfabetis.

Hex ikut jadi kunci dedup karena nama sama bisa punya hex berbeda antar material — kalau itu terjadi, keduanya memang hasil yang berbeda dan harus tampil terpisah.

Tanpa dedup, jawaban bot untuk "eSUN Red" jadi tiga baris identik.

## 7. Kasus tepi

| Kondisi | Perilaku |
|---|---|
| `hex` tidak bisa di-parse (mis. `?hex=merah`) | `400 {"error":"hex tidak valid"}` — beda dari §4, ini input rusak yang eksplisit, bukan input kosong |
| `colorHex` di katalog tidak bisa di-parse | Baris **dikeluarkan dari mode hex** (ΔE tak terhitung), tapi tetap bisa ditemukan mode `nama`. Tidak melempar |
| Tidak ada yang cocok | `200` dengan `items: []`, `total: 0` — bukan 404 |
| Katalog kosong (belum pernah sync) | Sama: `items: []`. Bot menampilkan "katalog belum di-sync" berdasarkan `total: 0` |
| `limit` aneh | Clamp, tidak 400 |

## 8. Lapisan kode

```
lib/filamen/color-distance.ts        (baru) — parseHex, rgbToLab, deltaE2000. Pure.
lib/filamen/color-lookup.ts          (baru) — cariWarna(): filter, dedup, urut. Pure + satu fungsi ber-DB.
app/api/bot/filamen/warna/route.ts   (baru)
lib/filamen/__tests__/color-distance.test.ts (baru)
lib/filamen/__tests__/color-lookup.test.ts   (baru)
app/api/bot/filamen/warna/__tests__/route.test.ts (baru)
```

Dipisah dua modul karena tanggung jawabnya beda: `color-distance.ts` matematika warna murni (tidak tahu apa-apa soal filament), `color-lookup.ts` aturan pencarian katalog. Yang pertama bisa dipakai ulang di tempat lain (mis. pencocokan warna import 3MF) tanpa membawa logika katalog.

**Query.** Satu `findMany` ke `filamentCatalog`. Filter `brand`/`material`/`q` pakai `contains` + `mode: 'insensitive'` di SQL; perhitungan ΔE dan dedup di memori — ΔE tidak bisa diekspresikan sebagai query SQL yang wajar, dan katalog ini berukuran ribuan baris, bukan jutaan.

**Catatan pencocokan brand — sengaja berbeda dari `bot-view.ts`.** Di lookup kalkulasi, brand dicocokkan **ketat** karena dipakai mengisi data (salah cocok = data salah). Di sini brand adalah **kata pencarian yang diketik manusia** ("bambu" untuk "Bambu Lab"), jadi substring adalah perilaku yang benar. Perbedaan ini disebut eksplisit supaya tidak "diseragamkan" belakangan.

## 9. Testing

**`color-distance.test.ts`** — pure:
- `parseHex`: 6 digit, 3 digit, 8 digit (alpha diabaikan), dengan/tanpa `#`, huruf besar/kecil, input sampah → `null`.
- `rgbToLab`: putih → L≈100/a≈0/b≈0; hitam → L≈0.
- `deltaE2000`: minimal 4 pasang dari test vector Sharma et al., toleransi 1e-4.
- Warna identik → ΔE tepat 0.
- **Regresi yang membenarkan Lab:** untuk `#aa67eb`, ungu harus menang atas abu-abu. Test ini akan gagal kalau ada yang mengganti implementasinya jadi jarak RGB.

**`color-lookup.test.ts`** — pure, katalog sebagai fixture:
- Mode nama: substring case-insensitive; `brand` mempersempit.
- Mode hex: urut ΔE menaik; `exact: true` hanya saat hex identik; `deltaE: null` di mode nama.
- Dedup: nama+hex sama lintas material → satu hasil, `materials` terurut.
- Nama sama tapi hex beda → **dua** hasil terpisah.
- Entry ber-`colorHex` rusak: hilang di mode hex, tetap muncul di mode nama.
- Seri ΔE identik → urutan deterministik (brand, lalu colorName).
- Limit memotong hasil, `total` tetap jumlah sebelum dipotong.

**`route.test.ts`** — service di-mock:
- 401 tanpa token, DB tidak disentuh.
- 400 tanpa `q` dan `hex`; 400 untuk `hex` tidak valid.
- `q`/`hex`/`brand`/`material` diteruskan ke service.
- `limit` clamp: `0`→1, `999`→20, `abc`→5.
- `mode` benar untuk tiap kombinasi.

## 10. Dokumentasi

`apps/dashboard/docs/bot-api.md` ditambah endpoint ini, dengan contoh untuk **ketiga** pertanyaan asli, dan penegasan: baca `exact` untuk membedakan jawaban pasti dari perkiraan; `deltaE` kecil bukan berarti persis.

## 11. Keputusan yang sudah ditutup

| Pertanyaan | Keputusan |
|---|---|
| Sumber data | `FilamentCatalog` (sync SpoolmanDB), bukan `SpoolmanSpool`/`Spool` |
| Bentuk endpoint | Satu endpoint, tiga mode via query param |
| Jumlah hasil terdekat | 5 teratas (clamp 1–20) + flag `exact` |
| Metrik jarak | CIEDE2000 di Lab, bukan jarak RGB, bukan ΔE76 |
| Dedup material | Digabung, `materials[]`; hex ikut jadi kunci |
| Pencocokan brand | Substring (beda dari `bot-view.ts` yang ketat — disengaja) |
| Stok/berat spool | Di luar lingkup, spec sendiri kalau dibutuhkan |
