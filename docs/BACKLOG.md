# Shopee Dashboard — Backlog

## 🔒 Security / Production Ready
- [ ] Regenerate `NEXTAUTH_SECRET` dengan random value (48+ char)
- [ ] Switch dari sandbox ke production Shopee keys (PARTNER_ID, PARTNER_KEY, BASE_URL, hapus MOCK flags)
- [ ] Re-authorize Shopee OAuth setelah ganti ke production keys

## 🛍 Shopee App Review Submission
- [ ] Buat Test User account di tab Settings untuk tim Shopee reviewer
- [ ] Siapkan dokumentasi app + screenshots untuk submit review

## ✨ Feature Ideas (user-requested)
- [ ] **Harga jual rekomendasi** berdasarkan HPP — logic sudah ada di Google Sheet pribadi, perlu di-translate jadi app. Harusnya jadi tab/section baru di Produk atau popup saat edit HPP.
- [ ] **Konfigurasi AMS per produk** — material/slicer settings untuk tiap produk yang dicetak (filament type, infill, waktu, dsb). Integrasi ke HPP calc.
- [ ] **Import manual data** sementara nunggu production API key — upload CSV/Excel untuk orders/products. _Keputusan: TBD (mungkin tidak perlu kalau switch ke production Shopee cepat)._
- [ ] **POS (Point of Sale)** — sistem kasir untuk penjualan offline/walk-in, terintegrasi ke stock Shopee produk yang sama.

## ✨ Feature Ideas (other)
- [ ] HPP Calculator (bahan + waktu cetak + tenaga → HPP otomatis) — cocok dengan AMS config
- [ ] Multi-image gallery management (Shopee support 9 image slot per produk)
- [ ] Bulk HPP import via CSV
- [ ] Activity log / audit trail (siapa edit HPP kapan)
- [ ] Custom date range di tab Analisa (sekarang cuma 7d/30d)

## 🧪 Verification / Testing
- [ ] Test notifikasi end-to-end dengan production data (order pile-up, stock low, ROAS drop, product delist)
- [ ] Test OAuth token auto-refresh (saat access_token expired)

## 🐛 Known Issues
- [ ] Indexer nzbgeek/nzb.su API keys kemungkinan expired — verify kalau pakai real Shopee ads di tab Iklan Plan 3
- [ ] Thumbnail produk tidak langsung update setelah upload foto — Shopee CDN cache delay, user harus manual refresh

---

_Last updated: 2026-04-11_
