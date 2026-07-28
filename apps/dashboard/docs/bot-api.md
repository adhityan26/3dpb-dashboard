# Bot Data API

Token-authenticated JSON endpoints for the external Discord bot. Base: `https://dashboard.3dprintingbandung.my.id`.
All requests require header `Authorization: Bearer $BOT_API_TOKEN`. Missing/invalid → 401.

## Endpoints

### POST /api/bot/invoice
Body: `{ "buyer": "Budi", "items": [{ "namaProduk": "Keychain", "qty": 2, "hargaPerUnit": 15000 }], "ongkir": 5000 }`
→ `{ "nomor": "INV-...", "total": 35000, "url": ".../tagihan" }`
```bash
curl -X POST .../api/bot/invoice -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"buyer":"Budi","items":[{"namaProduk":"Keychain","qty":2,"hargaPerUnit":15000}],"ongkir":5000}'
```

### GET /api/bot/invoice/{nomor}
→ `{ "nomor", "status", "total", "totalPaid", "sisaBayar" }` · 404 if not found.

### GET /api/bot/shopee/order/{sn}
→
```json
{
  "orderSn": "...", "status": "READY_TO_SHIP", "total": 100000, "currency": "IDR",
  "createTime": 1700000000, "updateTime": 1700001000,
  "shipByDate": 1700100000, "daysToShip": 2,
  "shippingCarrier": "SPX Standard", "paymentMethod": "COD", "cod": true,
  "messageToSeller": "Tolong bungkus rapi",
  "buyer": { "username": "...", "name": "...", "phone": "...", "city": "...", "district": "...", "state": "...", "zip": "...", "fullAddress": "..." },
  "items": [{ "name": "...", "qty": 2, "sku": "...", "variant": "...", "variantSku": "...", "priceOriginal": 20000, "priceDiscounted": 18000, "imageUrl": "..." }],
  "money": { "buyerPaid": 110000, "received": 90000, "commissionFee": 5000, "serviceFee": 2000, "transactionFee": 1000, "actualShippingFee": 8000 },
  "url": "https://seller.shopee.co.id/portal/sale/order/..."
}
```
All fields under `buyer`/`money` are `null` when the underlying data isn't available yet (e.g. `money.*` before escrow settles). 404 if the order doesn't exist.

### GET /api/bot/shopee/order/{sn}/tracking
→ `{ "trackingNumber": "SPXTRK123" }` or `{ "trackingNumber": null }` when not yet assigned (e.g. not shipped). Never errors for the not-yet-available case.

### POST /api/bot/kalkulator
Hitung **ad-hoc**, tidak menyentuh data tersimpan. Untuk membaca kalkulasi yang sudah disimpan, pakai `GET` di path yang sama (di bawah).

Body: `{ "gramasi": 50, "jam": 2, "tipe": "FDM" }` (tipe FDM|SLA default FDM; field lain diabaikan — `tier` lama sudah tidak dipakai, respons selalu berisi semua tier via `shopeeA`/`offlineA`)
→ `{ "hppTotal", "floorPrice", "shopeeA", "offlineA", "marginShopeeA" }` · 400 if gramasi/jam ≤ 0.

### GET /api/bot/kalkulator?q={kata}&limit={n}
Cari kalkulasi **tersimpan** by nama. `q` opsional — kosong/spasi saja → kembalikan yang terbaru. `limit` default 5, di-clamp 1–20 (nilai aneh tidak menghasilkan 400). Urut terbaru dulu.
→
```json
{ "items": [{ "id": "clx...", "nama": "Naga Artikulasi", "createdAt": "2026-07-20T04:11:02.000Z",
              "batch": 1, "status": "AMAN", "hppTotal": 24500, "floorPrice": 30000,
              "shopeeA": 52000, "offlineA": 45000 }],
  "total": 23 }
```
`total` = jumlah seluruh baris yang cocok, bukan panjang `items` — dipakai untuk "menampilkan 5 dari 23".

### GET /api/bot/kalkulator/{id}
Detail satu kalkulasi tersimpan. 404 `{ "error": "not found" }` kalau id tidak ada.
→
```json
{
  "id": "clx...", "nama": "Naga Artikulasi",
  "createdAt": "...", "updatedAt": "...",
  "batch": 1, "marginTier": "A", "status": "AMAN", "testLayerEnabled": true,
  "harga": { "hppProduksi", "hppKomponen", "hppFinishing", "hppTotal", "floorPrice",
             "shopeeA", "shopeeB", "shopeeC", "offlineA", "offlineB", "offlineC",
             "resellerStd", "resellerBulk", "marginShopeeA", "marginOfflineA" },
  "aktual": { "shopee": 55000, "offline": null },
  "plates": [{ "namaPart": "Badan", "tipe": "FDM", "printer": "P1S",
               "durasiJam": 3.5, "gramasiTotal": 62,
               "materials": [{ "brand": "Bambu", "material": "PLA Basic", "color": "Red",
                               "colorHex": "#c12026", "gramasi": 40, "isSupport": false,
                               "hargaPerGram": 320 }] }],
  "komponen": [{ "nama": "Gantungan", "harga": 1500, "qty": 2 }],
  "labor": [{ "nama": "Amplas", "jam": 0.5, "ratePerJam": 20000, "flat": null }],
  "hargaChannel": [{ "channelId": "shopee", "A": 52000, "B": 48000, "C": 44000 }]
}
```

**Yang wajib diketahui bot:**
- **`hargaPerGram: null` berarti "tidak di-snapshot", BUKAN gratis** — tampilkan `—`, jangan `Rp0`. Plate yang memakai material profile menghitung HPP dari profil/tarif global, dan angka itu tidak disimpan per plate.
- **`color` vs `colorHex`** — DB hanya menyimpan satu string warna per entry (nama kalau diinput manual, hex kalau dari import 3MF). Sisi yang kosong dilengkapi dari katalog filament kalau brand+material-nya cocok persis; kalau tidak, sisi itu `null`. Baca `color ?? colorHex`.
- **`harga.hppKomponen` bisa lebih besar dari jumlah `komponen[]`** pada kalkulasi lama yang punya packing — biaya packing ikut terhitung tapi tidak muncul sebagai baris komponen.
- **Bisa `null`**: `namaPart`, `printer`, `brand`, `material`, `color`, `colorHex`, `hargaPerGram`, `aktual.shopee`, `aktual.offline`. `hargaChannel` bisa `[]` untuk kalkulasi lama.

### GET /api/bot/produk?q={kata}
→ `{ "products":[{"name","priceMin","priceMax","hpp","margin","stock"}], "total" }` (top 5; hpp/margin may be null).

### GET /api/bot/order/perlu-cetak
→ `{ "orders":[{"orderSn","status","buyer"}], "count" }` (orders not yet label-printed).

### GET /api/bot/stok/filament?brand={brand}
→ `{ "groups":[{"key","count"}] }` (non-empty spools grouped by "brand material"; brand filter optional).

### GET /api/bot/tokopedia/orders?tab={perlu-dikirim|semua}
→ `{ "ok": true, "data": { "total_count": N, "main_orders": [ ...raw Tokopedia orders... ] } }`
Raw Tokopedia response — the bot maps fields itself. Session errors: `{ "ok": false, "error": "SESSION_INVALID" | "SESSION_MISSING" }` (fix by re-pasting cookies in the dashboard Settings).

### GET /api/bot/tokopedia/orders/{id}
→ `{ "ok": true, "data": { ...raw order... } }` · `{ "ok": false, "error": "not_found" }` when the id matches nothing · session errors as above.

Note: the Tokopedia session is managed only from the dashboard (Settings → Tokopedia Session). The bot cannot save or refresh it.
