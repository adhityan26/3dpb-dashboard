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
→ `{ "orderSn", "status", "items":[{"name","qty"}], "total", "buyerPaid", "received", "url" }` · `buyerPaid`/`received` null if escrow unavailable · 404 if not found.

### POST /api/bot/kalkulator
Body: `{ "gramasi": 50, "jam": 2, "tipe": "FDM", "tier": "A" }` (tipe FDM|SLA default FDM; tier A|B|C default A)
→ `{ "hppTotal", "floorPrice", "shopeeA", "offlineA", "marginShopeeA" }` · 400 if gramasi/jam ≤ 0.

### GET /api/bot/produk?q={kata}
→ `{ "products":[{"name","priceMin","priceMax","hpp","margin","stock"}], "total" }` (top 5; hpp/margin may be null).

### GET /api/bot/order/perlu-cetak
→ `{ "orders":[{"orderSn","status","buyer"}], "count" }` (orders not yet label-printed).

### GET /api/bot/stok/filament?brand={brand}
→ `{ "groups":[{"key","count"}] }` (non-empty spools grouped by "brand material"; brand filter optional).
