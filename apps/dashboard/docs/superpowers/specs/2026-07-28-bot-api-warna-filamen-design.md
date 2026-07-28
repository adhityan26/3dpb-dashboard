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

**Tanpa `q` maupun `hex` → `400 {"error":"butuh minimal salah satu: q atau hex"}`.** Disengaja: tanpa keduanya tidak ada default yang masuk akal — mengembalikan seluruh katalog bukan jawaban, hanya dump.

Endpoint ini punya **tepat dua** jalur 400: input kosong (di atas) dan `hex` tidak bisa di-parse (§7). Keduanya kesalahan pemanggilan yang bot bisa perbaiki sendiri. Selain itu tidak ada 400 — `limit` aneh di-clamp, hasil kosong tetap `200`.

### Respons

```json
{
  "mode": "hex",
  "total": 412,
  "katalogTotal": 3505,
  "items": [
    { "brand": "Bambu Lab", "colorName": "Purple", "colorHex": "#A06EEA",
      "materials": ["PLA Basic", "PETG HF"], "deltaE": 2.4, "exact": false }
  ]
}
```

- `mode` — `"hex"` kalau `hex` dikirim, selain itu `"nama"`.
- `total` — **jumlah grup hasil dedup (§6)** yang lolos filter `brand`/`material`/`q` **dan**, khusus mode `hex`, yang `colorHex`-nya berhasil di-parse; dihitung **sebelum** dipotong `limit`. Bukan jumlah baris katalog, bukan jumlah yang "mirip". Tiga hal itu disebut satu per satu karena masing-masing menghasilkan angka berbeda.
- `katalogTotal` — jumlah seluruh baris katalog, tanpa filter apa pun. Ada khusus supaya bot bisa membedakan **katalog belum di-sync** (`katalogTotal: 0`) dari **tidak ada yang cocok** (`total: 0`, `katalogTotal > 0`) — dua kondisi yang tanpa field ini menghasilkan respons identik.
- `deltaE` — `null` pada mode `nama`.
- `exact` — `true` hanya di mode `hex` saat hex identik; **`null` pada mode `nama`** (bukan `false` — tidak ada hex acuan untuk dibandingkan). "Identik" = enam digit RGB hasil normalisasi §5 (alpha dibuang) sama, case-insensitive. Ini yang membedakan "itu **namanya** X" dari "yang **mendekati** X"; bot tidak boleh menyimpulkannya sendiri dari `deltaE` kecil.

### Pengurutan

- Mode `hex`: `deltaE` menaik, lalu `brand`, `colorName`, **`colorHex`** alfabetis.
- Mode `nama`: `brand`, `colorName`, **`colorHex`** alfabetis.

`colorHex` wajib jadi kunci terakhir: §6 sengaja menghasilkan dua item dengan `brand` **dan** `colorName` identik saat hex-nya berbeda, dan itu bukan kasus langka — ada **147 grup** semacam itu di data SpoolmanDB saat ini (mis. 3DJAKE "Black": ASA `#414040` vs PLA `#000000`). Tanpa kunci ketiga, urutannya bergantung urutan baris dari DB.

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
| Tidak ada yang cocok | `200`, `items: []`, `total: 0`, `katalogTotal > 0` — bukan 404 |
| Katalog kosong (belum pernah sync) | `200`, `items: []`, `total: 0`, **`katalogTotal: 0`**. Hanya inilah yang membedakannya dari baris di atas |
| `limit` aneh | Clamp, tidak 400 |
| `q`/`brand`/`material` dikirim tapi kosong/spasi saja | Di-trim dulu; kosong setelah trim = **dianggap tidak dikirim**. Jadi `?q=` tanpa `hex` tetap kena 400, dan `brand=` kosong tidak memfilter apa pun. Konvensi yang sama dengan spec kalkulasi |
| Filament multi-warna (gradient/dual) | **Tidak akan pernah ketemu** — 101 entri SpoolmanDB memakai `color_hexes[]` dengan `color_hex` null, dan `syncCatalogFromSpoolmanDB` melewati baris tanpa `color_hex`, jadi mereka tidak pernah masuk katalog. Batasan data hulu, bukan bug endpoint ini. Memperluas sync = di luar lingkup |

**Endpoint bot tidak melakukan auto-seed.** `/api/filamen/catalog` versi session memicu sync saat katalog kosong (`app/api/filamen/catalog/route.ts:11-18`); jalur bot sengaja **tidak** meniru itu — endpoint bot tidak pantas memicu fetch ke internet luar (`donkie.github.io`) yang lambat dan bisa gagal. Katalog kosong dijawab apa adanya lewat `katalogTotal: 0`, dan sync tetap dipicu dari dashboard.

## 8. Lapisan kode

```
lib/filamen/color-distance.ts        (baru) — parseHex, rgbToLab, deltaE2000. Pure.
lib/filamen/color-lookup.ts          (baru) — cariWarna(): filter, dedup, urut. Pure + satu fungsi ber-DB.
app/api/bot/filamen/warna/route.ts   (baru)
lib/filamen/__tests__/color-distance.test.ts (baru)
lib/filamen/__tests__/color-lookup.test.ts   (baru)
app/api/bot/filamen/warna/__tests__/route.test.ts (baru)
```

Dipisah dua modul karena tanggung jawabnya beda: `color-distance.ts` matematika warna murni (tidak tahu apa-apa soal filament), `color-lookup.ts` aturan pencarian katalog.

### Hubungan dengan kode warna yang sudah ada

`lib/kalkulator/color-catalog.ts:61-88` **sudah** punya `hexToRgb` (3/6 digit, privat) dan `hexDistance` (Euclidean RGB), dipakai `sortCatalogColors` untuk mengurutkan pilihan warna di picker UI. Jadi setelah spec ini ada dua parser hex dan dua metrik jarak di repo. Itu disengaja, dengan batas yang tegas:

- **`sortCatalogColors` UI dibiarkan apa adanya.** Fungsinya mengurutkan daftar yang tetap dilihat dan dipilih manusia — urutan yang kurang perseptual di situ paling banter sedikit mengganggu, tidak menghasilkan data salah. Memigrasikannya ke ΔE2000 adalah follow-up opsional, **bukan** bagian pekerjaan ini, dan tidak boleh dikerjakan sambil lalu.
- **`enrichColor` di `lib/kalkulator/bot-view.ts` TIDAK boleh memakai `color-distance`.** Ini penting dan berlawanan dengan naluri "pakai ulang yang lebih akurat": semantik `enrichColor` adalah **pengisian data** dengan kecocokan persis. Mengganti kecocokan persis dengan nearest-match membuatnya mengisi nama warna yang **salah** dengan penuh percaya diri — mis. filament ber-hex tak terdaftar diberi nama warna lain yang kebetulan terdekat, lalu nama itu tampil di bot seolah fakta. Yang sekarang sudah benar; jangan "diperbaiki".

Bedanya satu kalimat: **jarak dipakai saat manusia bertanya "yang mirip apa"; kecocokan persis dipakai saat sistem mengisi field.**

**Query — satu sumber kebenaran, semua filter di memori.** Satu `findMany` ke `filamentCatalog` **tanpa `where`**, lalu **seluruh** filter (`brand`/`material`/`q`), perhitungan ΔE, dedup, pengurutan, dan pemotongan `limit` dilakukan di `cariWarna` yang pure.

Sengaja **tidak** memfilter di SQL, walau `contains` + `mode: 'insensitive'` tersedia. Kalau SQL yang memfilter, filter di fungsi pure jadi tidak terpakai di produksi — dan test §9 yang mengujinya berubah jadi test hampa, persis cacat yang sudah kita perbaiki di spec kalkulasi (test mapping di route test yang cuma menguji mock). Kalau difilter di dua tempat, dua semantik substring (`ILIKE` Postgres vs `toLowerCase().includes` JS) harus dijaga setara selamanya — biaya tanpa imbalan.

Ini terjangkau karena katalognya kecil: **±3.505 baris** (6.957 entri SpoolmanDB → 6.856 syncable → collapse oleh upsert `[brand, material, name]`), masing-masing 5 kolom pendek. Kalau suatu saat tabel ini tumbuh ordo besaran, barulah prefilter SQL layak ditinjau ulang.

**Catatan pencocokan brand — sengaja berbeda dari `bot-view.ts`.** Di lookup kalkulasi, brand dicocokkan **ketat** karena dipakai mengisi data (salah cocok = data salah). Di sini brand adalah **kata pencarian yang diketik manusia** ("bambu" untuk "Bambu Lab"), jadi substring adalah perilaku yang benar. Perbedaan ini disebut eksplisit supaya tidak "diseragamkan" belakangan.

## 9. Testing

**`color-distance.test.ts`** — pure:
- `parseHex`: 6 digit, 3 digit, 8 digit (alpha diabaikan), dengan/tanpa `#`, huruf besar/kecil, input sampah → `null`.
- `deltaE2000`: **seluruh 34 pasang** test vector Sharma et al., toleransi 1e-4. Bukan sebagian — datanya kecil, dan pasangan 10–17 justru yang menguji pembungkusan sudut hue, bagian yang paling mudah salah dan paling mungkin terlewat kalau cuma diambil beberapa.
- Warna identik → ΔE tepat 0.
- **`rgbToLab` wajib punya anchor mid-tone**, bukan cuma putih/hitam:
  - `#808080` → L≈53.59, a≈0, b≈0
  - `#FF0000` → L≈53.23, a≈80.11, b≈67.22
  - toleransi ±0.1

  Alasannya penting: **vektor Sharma berpasangan Lab, bukan RGB** — ia membuktikan rumus ΔE2000 saja dan sama sekali tidak menyentuh pipeline sRGB→linear→XYZ→Lab. Implementasi yang **lupa linearisasi gamma** (jebakan paling umum di konversi ini) tetap memetakan putih→100 dan hitam→0, dan besar kemungkinan tetap lolos regresi ungu-vs-abu di bawah. Semua test hijau, semua mid-tone melenceng. Anchor inilah satu-satunya yang menangkapnya.
- **Regresi yang membenarkan Lab** — fixture konkret, jangan dicari sendiri saat implementasi: acuan `#aa67eb`, kandidat abu `#999999` (jarak RGB ≈ 97,5) vs ungu tua `#6a0dad` (≈ 127,6). Jarak RGB memilih **abu**; ΔE2000 harus memilih **ungu**. Angka ΔE hasilnya di-pin di test. Test ini gagal seketika kalau ada yang mengganti implementasinya jadi jarak RGB.

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
| Tempat filtering | Semuanya di memori; SQL tanpa `where` — satu sumber kebenaran, test tidak hampa |
| `enrichColor` bot-view | **Tidak** ikut memakai `color-distance` — semantiknya kecocokan persis |
| `sortCatalogColors` UI | Dibiarkan pakai jarak RGB; migrasi = follow-up opsional |
| Stok/berat spool | Di luar lingkup, spec sendiri kalau dibutuhkan |
| Browse per brand tanpa `q`/`hex` | **Belum diputuskan** — lihat §12 |

## 12. Pertanyaan terbuka

**Boleh tidak `?brand=bambu` saja, tanpa `q` maupun `hex`?** Sekarang kena 400. Rasional "dump bukan jawaban" (§4) melemah ketika `brand` diberikan: hasilnya toh terpotong `limit` maks 20, dan "warna Bambu Lab apa saja?" adalah pertanyaan yang wajar diajukan ke bot — pertanyaan keempat yang tidak ada di daftar awal.

Ini keputusan produk, bukan teknis, dan menunggu jawaban user. Sampai dijawab, perilaku yang berlaku adalah **400** seperti tertulis di §4.
