# Shopee Escrow Analytics

**Goal:** Tampilkan data keuangan real dari Shopee (buyer paid, escrow/diterima, fee rate) di Settings dan per-produk di halaman Produk.

**Architecture:** Tambah Shopee `get_escrow_detail` API wrapper, cache escrow per order_sn (30-min TTL), distribusikan escrow ke per-item secara proporsional, expose di Settings analytics + per-produk di ProductRow.

**Tech Stack:** Next.js App Router, Shopee Partner API v2, TypeScript, React

---

## Data Source

`GET /api/v2/payment/get_escrow_detail?order_sn=xxx`

Key fields returned:
- `buyer_payment_amount` — total yang buyer bayar (termasuk ongkir buyer)
- `escrow_amount` — total yang seller terima setelah semua potongan
- `commission_fee` — komisi Shopee
- `service_fee` — biaya layanan  
- `transaction_fee` — biaya payment gateway
- `actual_shipping_fee` — ongkir yang dicharge ke seller
- `order_income.items[]` — per-item price × qty detail

## Fee Distribution per Item

Karena escrow di level order, distribusi proporsional:
```
item_ratio = (item_discounted_price × item_qty) / sum(all_items_discounted_price × qty)
item_buyer_paid = buyer_payment_amount × item_ratio
item_received   = escrow_amount × item_ratio
```

## Caching

In-memory cache keyed by `order_sn`, TTL 30 menit. Escrow data tidak berubah setelah order selesai.

---

## SoldStats (Updated)

```typescript
interface SoldStats {
  qty: number
  omzet: number      // price × qty (existing)
  buyerPaid: number  // distributed buyer_payment_amount
  received: number   // distributed escrow_amount
}
```

## New Files

| File | Responsibility |
|------|---------------|
| `lib/shopee/escrow.ts` | `getEscrowDetail(orderSn)` — Shopee API call + response type |
| `lib/shopee/types.ts` | Add `ShopeeEscrowDetail` type |

## Modified Files

| File | Change |
|------|--------|
| `lib/products/service.ts` | `getSoldStatsPerItem` → fetch escrow per order, distribute to items |
| `app/api/settings/shopee-fee/route.ts` | New GET — aggregate escrow analytics for Settings |
| `lib/hooks/use-settings.ts` (or new) | `useShopeeeFeeAnalytics` hook |
| `components/settings/ShopeeFeeAnalyticsCard.tsx` | New card for Settings page |
| `components/products/ProductRow.tsx` | Show buyerPaid, received, margin columns when data available |

---

## Settings Fee Analytics Card

Menampilkan (untuk 30 hari terakhir):
- Real fee rate % = `1 - (total_escrow / total_buyer_paid)` 
- Compare vs `adminEcommerce` setting (selisihnya berapa)
- Total omzet, total buyer paid, total diterima
- Breakdown: komisi, service fee, transaction fee, ongkir seller

Letaknya: di halaman Settings, section baru setelah KalkulatorSettingsCard.

---

## ProductRow Stats

Tambah baris stats di bawah info utama produk (hanya kalau ada HPP):
```
Omzet: Rp X | Buyer paid: Rp Y | Diterima: Rp Z | Margin: Rp W
```

Jika escrow data belum tersedia (cache miss / belum difetch): tampilkan estimasi dengan label "(est.)" menggunakan adminEcommerce rate sebagai fallback.

---

## Performance

- `getSoldStatsPerItem` sudah panggil `getOrdersInRange` (fetch semua orders) — kita piggyback: untuk tiap order_sn yang didapat, fetch escrow detail dengan concurrency limit 10
- Escrow cache in-memory TTL 30 min — request kedua dalam 30 menit tidak hit Shopee API
- Total overhead: N escrow calls (N = jumlah order unik 30 hari), tapi di-cache sehingga repeat calls gratis
