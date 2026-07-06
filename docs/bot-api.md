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
Body: `{ "gramasi": 50, "jam": 2, "tipe": "FDM", "tier": "A" }` (tipe FDM|SLA default FDM; tier A|B|C default A)
→ `{ "hppTotal", "floorPrice", "shopeeA", "offlineA", "marginShopeeA" }` · 400 if gramasi/jam ≤ 0.

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
