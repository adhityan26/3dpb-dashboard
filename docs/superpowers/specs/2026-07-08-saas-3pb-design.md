# SaaS 3D Print Business Tools — Design

**Tanggal:** 2026-07-08
**Status:** Disetujui (brainstorming via companion, 2 form + review desain)
**Scope:** Produk SaaS baru berisi subset fitur shopee-dashboard: kalkulator HPP, manajemen filamen, import PO, invoice. Nama produk & domain: TBD (keputusan bisnis, tidak memblokir implementasi).

## 1. Latar belakang & keputusan kunci

Dashboard internal 3DPB (`shopee-dashboard`) punya 4 modul yang layak dijual sebagai SaaS untuk pelaku usaha 3D printing Indonesia. Keputusan yang sudah diambil bersama user:

- **Monorepo, bukan project terpisah** — supaya bug fix di satu fitur tidak perlu di-maintain di 2 codebase.
- **2 deployment terpisah total** — internal tetap di homelab, SaaS di VPS publik. Sharing hanya saat build via packages; tidak ada koneksi runtime (no shared DB/Redis/API).
- **3 tier**: Free (login wajib, kalkulator saja, tanpa save, setting terbatas), **Pro Lifetime** (one-time payment, data tersimpan **lokal di device**), **Subscription** (data di cloud + fitur server-side).
- **Aturan emas tier**: fitur yang bisa jalan sepenuhnya di client → Lifetime; fitur yang butuh server → Subscription. Beban server dari user Lifetime ≈ nol.
- **Satu paket Pro Lifetime** (bukan unlock per modul).
- **Fitur terkunci tetap terlihat** di semua tier dengan badge 🔒 + modal upgrade (pola upsell).
- **Storage Lifetime = IndexedDB murni** + export/import file backup. Bukan local-first sync engine.
- **User Lifetime boleh beli kredit OCR** (pay-as-you-go) tanpa langganan.
- Hosting: **SumoPod VPS Jakarta**, Docker Compose (tanpa Kubernetes).
- Payment: **Tripay** (daftar cukup KTP; QRIS dinamis untuk lifetime, top-up, dan sub).

## 2. Matriks fitur per tier

| Fitur | FREE | PRO LIFETIME | SUBSCRIPTION |
|---|---|---|---|
| Kalkulator HPP FDM & SLA, komponen kustom, margin tier A/B/C + status harga | ✅ setting default | ✅ | ✅ |
| Multi-plate & multi-filament per plate | 🔒 | ✅ | ✅ |
| Labor cost (pengganti mode HELM — lihat §4) | 🔒 | ✅ | ✅ |
| Settings rates lengkap (printer profile multi, material profile custom, komponen preset, channel fee, margin multiplier, failure/test rate) | 🔒 default only | ✅ | ✅ |
| Master harga filament & resin + recompute | 🔒 | ✅ | ✅ |
| Save & duplicate kalkulasi | 🔒 | ✅ lokal | ✅ cloud |
| Filamen: inventory spool, barcode & NFC, katalog, print label (Web Bluetooth/NFC) | 🔒 | ✅ lokal | ✅ cloud |
| PO manual (CRUD + status flow) + auto-link item filament → spool | 🔒 | ✅ lokal | ✅ cloud |
| Invoice: quotation→invoice, multi-payment/cicilan, channel harga, settings pembayaran | 🔒 | ✅ lokal | ✅ cloud |
| Export invoice PDF **dan image (PNG/JPEG)** — client-side | 🔒 | ✅ | ✅ |
| Cloud sync antar device | — | — | ✅ |
| Import PO via OCR | — | 💳 kredit pay-as-you-go | ✅ kuota bulanan + top-up |
| Share invoice via link publik | — | — | ✅ |

**Di-drop dari SaaS** (tetap di dashboard internal): link kalkulasi→katalog/Shopee, Spoolman weight tracking, endpoint bot.
**Fase 2 / add-on terpisah**: printer bridge agent — AMS sync Bambu Lab (MQTT LAN mode) + printer Klipper via Moonraker API. Butuh agent yang di-install di jaringan lokal customer; di luar scope v1.

## 3. Struktur monorepo

Root `shopee-analysis/` diubah jadi monorepo pnpm workspaces + Turborepo (root di-git-init; repo git existing `shopee-dashboard` dipindah ke `apps/dashboard` dengan history dipertahankan):

```
apps/
  dashboard/        → shopee-dashboard existing (internal, homelab)
  saas/             → Next.js app baru (SaaS publik)
packages/
  kalkulator-core/  → formula HPP murni: FDM/SLA, multi-plate, material profile,
                      labor cost, margin tier. Zero dependency ke DB/framework.
  domain/           → types + logika bisnis filamen/PO/invoice yang dipakai dua app
  ui/               → komponen UI shared (Glass UI theme)
  storage/          → interface repository + adapter IndexedDB (Dexie) & Prisma
```

Migrasi bertahap — Fase 0 hanya: setup workspace, pindahkan `apps/dashboard`, extract `lib/kalkulator` → `packages/kalkulator-core` (unit test `formula.test.ts` ikut), dashboard konsumsi dari package. Modul lain diekstrak saat dibutuhkan SaaS, bukan sekaligus.

**Dua Prisma schema terpisah.** `apps/dashboard` memakai schema internal existing; `apps/saas` punya schema sendiri (User, Entitlement, CreditLedger, Payment, + tabel data subscriber). `packages/domain` berisi types/logika, bukan schema DB.

## 4. Perubahan formula kalkulator (berlaku juga untuk internal)

Dokumentasi formula existing + detail perubahan: `docs/kalkulator-formula.md`.

- **Material profile**: tiap jenis filament (PLA, PETG, ABS, ASA, TPU, dst.) punya profil — harga modal & jual default per gram, failure rate per jenis (failure efektif plate = weighted average berdasarkan gramasi). Free: preset bawaan, bisa diubah per kalkulasi tapi tidak tersimpan. Pro: profil custom tersimpan.
- **Printer profile**: `mesinPerJam` per printer (bukan satu angka global), dengan kalkulator bantu `(watt/1000 × tarif listrik) + (harga printer ÷ umur pakai jam) + maintenance`. Tiap plate memilih printernya. Free: 1 profil default; Pro: multi-profil.
- **Komponen tambahan generik**: gantungan/switch/label dihapus dari formula — semua biaya non-print jadi `komponen {nama, harga, qty}` dengan preset tersimpan (Pro). Di SaaS tidak ada field gantungan/switch/label sama sekali; di internal, nilai existing dimigrasi jadi preset. Packing tetap preset bawaan.
- **Labor cost generik menggantikan mode HELM**: komponen labor (nama + jam × rate, atau flat). Tier HELM existing (MINIMAL/LIGHT/MEDIUM/HEAVY: sanding/painting/assembly) menjadi preset bawaan. Data kalkulasi helm internal dimigrasi otomatis.
- **Channel fee menggantikan `adminEcommerce`**: daftar channel `{nama, fee}` — harga rekomendasi dihitung per channel (Shopee, Tokopedia, TikTok Shop, offline, …).
- **Margin multiplier A/B/C & reseller bulk jadi setting** (sekarang hardcoded 1,1/1,5/2,0 dan 1,05).
- **Perbaikan teknis saat extract**: bug SLA multi-material (fallback rate FDM), hapus dead param `marginTier`, single-pass `plateCost`. Formula inti (failure spread, test layer, batch, dua jalur harga material, status) tidak berubah.

## 5. Auth, entitlement & feature gating

- **NextAuth**: Google OAuth + magic link email. Login wajib di semua tier.
- **Entitlement** (tabel di DB SaaS): `userId, plan (FREE|LIFETIME|SUB), subExpiresAt`. Sub = prepaid, tidak auto-renew.
- **CreditLedger**: mutasi kredit OCR per user (top-up +, pemakaian −, kuota bulanan sub sebagai grant berkala). Saldo = SUM(mutasi); kuota bulanan di-grant dengan expiry.
- **Gating dua lapis**: hook client `useEntitlement()` untuk render UI (badge 🔒, modal upgrade berisi perbandingan tier) + middleware server yang menolak request API berbayar. Client gating adalah UX; server gating adalah keamanan.

## 6. Storage

Interface repository per domain (`KalkulasiRepo`, `SpoolRepo`, `PORepo`, `InvoiceRepo`) dengan dua adapter:

- **LocalRepo** (Pro Lifetime): IndexedDB via Dexie. Semua data di device user.
- **CloudRepo** (Subscription): Next.js API routes + Prisma/Postgres.

Pemilihan adapter ditentukan entitlement saat runtime. Fitur pendukung:

- **Export/import backup file** (JSON dengan version field untuk migrasi schema) — mitigasi utama risiko clear browser data pada user Lifetime; sekaligus jembatan pindah device manual.
- **Wizard upgrade Lifetime → Sub**: import data lokal ke cloud sekali jalan.
- Free tier stateless — tidak menyentuh repository sama sekali.

## 7. Pembayaran (Tripay)

- Satu integrasi untuk 3 jenis transaksi: Pro Lifetime (one-time), top-up kredit OCR (one-time), Subscription (prepaid manual renewal 1/3/12 bulan + reminder email menjelang expiry).
- Flow: create transaction → user bayar QRIS/VA/e-wallet → **webhook callback** (verifikasi signature) → update Entitlement/CreditLedger. Halaman status polling sebagai fallback webhook.
- Idempotensi webhook wajib (Tripay bisa retry callback).
- Prasyarat merchant: landing page live + halaman ToS, Privacy Policy, kebijakan refund; daftar cukup KTP (selfie + KTP), tanpa NPWP/dokumen usaha.

## 8. Infra & deploy

- **Internal (tidak berubah)**: `apps/dashboard` → build image → homelab Docker host `192.168.88.113` via `deploy.sh` existing, container `shopee-dashboard:3100`, DB `light-generator-postgres-1`.
- **SaaS**: SumoPod VPS Jakarta (mulai paket ~2C/4GB). Docker Compose: `saas` (Next.js) + `postgres` (volume) + `caddy` (SSL otomatis, reverse proxy).
- **Backup harian Postgres SaaS ke object storage eksternal** (S3-compatible di provider lain) — wajib, karena track record SumoPod masih pendek. Restore drill minimal sekali sebelum launch.
- 12-factor: config via env vars; tidak ada state di container → pindah provider = restore backup + ganti DNS.
- Redis/queue belum dipakai di v1; ditambah jika volume OCR menuntut antrian.
- Deploy kedua app independen: perubahan `packages/*` baru berdampak saat masing-masing app di-build ulang. Turborepo cache menjaga build tetap cepat.

## 9. Error handling

- **OCR**: hasil parse selalu masuk mode draft-koreksi manual sebelum disimpan; gagal total → kredit tidak dipotong (refund otomatis di ledger).
- **Webhook payment**: verifikasi signature, idempotent, log mentah callback untuk audit; transaksi expired → status jelas di UI.
- **IndexedDB**: deteksi private mode/storage penuh → banner peringatan + dorong export backup; operasi tulis dibungkus error boundary dengan pesan actionable.
- **Sub expired**: data cloud tetap tersimpan (grace, read-only) — user bisa export atau perpanjang; tidak langsung dihapus. Masa retensi: 90 hari (dicantumkan di ToS).

## 10. Testing

- Unit test formula di `kalkulator-core` (existing + material profile + labor cost + migrasi helm→labor).
- **Contract test repository**: satu suite dijalankan terhadap LocalRepo (fake-indexeddb) dan CloudRepo (test DB) — menjamin perilaku lokal & cloud identik.
- Integration test webhook Tripay (signature, idempotensi, ledger).
- E2E happy path: free hitung HPP → beli Lifetime (sandbox Tripay) → save lokal → export/import backup → upgrade Sub → data termigrasi ke cloud.

## 11. Fase pengerjaan

| Fase | Isi | Output |
|---|---|---|
| 0 | Monorepo setup, pindah dashboard, extract `kalkulator-core`, refactor labor cost + material profile (internal ikut migrasi) | Dashboard internal jalan normal dari monorepo |
| 1 | App SaaS: auth, entitlement, kalkulator Free + Lifetime (IndexedDB), payment Tripay lifetime, landing page (ToS/Privacy/refund) | **MVP yang bisa dijual** |
| 2 | Filamen + PO manual + invoice + export PDF/PNG (semua lokal) | Paket Lifetime lengkap |
| 3 | Subscription: cloud storage + wizard import, OCR + credit ledger + top-up, share invoice link, renewal reminder | Tier Sub live |
| 4 | Add-on printer bridge (Bambu MQTT, Klipper/Moonraker) | Terpisah, dijual sebagai add-on |

## 12. Di luar scope desain ini

Nama produk & domain, angka harga per tier, konten marketing/landing copy, program early-adopter (mis. LTD terbatas) — keputusan bisnis yang bisa diambil paralel tanpa memblokir Fase 0–1.
