# apps/saas — Slizebiz App (Free live, 1a-1)

App SaaS Slizebiz: kalkulator harga jual 3D print untuk user Free + admin-mini.

## Jalankan lokal
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter @3pb/saas dev   # http://localhost:3300
```
Butuh `.env` (lihat `.env.deploy.example`): `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAILS`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.

## Arsitektur
- **Layout halaman: ikuti `docs/ui-page-layout.md`** — semua halaman ber-auth dibungkus `PageShell` (`title` wajib); nav island + tema light/system/dark + background sudah di kerangka.
- Auth: dual-channel — email magic-link (NextAuth v5 + Resend) + nomor WhatsApp OTP (via WA Omni, `lib/wa/*` + `/api/auth/wa/*`). Sesi database. Login satu-input auto-detect (@ = email, 08…/+62… = WA). Env WA opsional (`WA_OMNI_URL/TOKEN/ACCOUNT_ID`); absen = WA nonaktif, email tetap jalan.
- Data: Prisma/Postgres — NextAuth tables + `Entitlement` komposit + `Config`. **Tanpa** tabel Waitlist.
- Waitlist: dibaca read-only dari **Cloudflare D1** milik landing (`lib/waitlist/cloudflare.ts`).
- Kalkulator: `@3pb/kalkulator-core` `hitungKalkulasiV2` + `defaultSettings`; UI memformat, tak menghitung ulang (`lib/kalkulator/compute.ts`).
- Setting (Beli, 1b-1): panel `/settings` dua-mode — Free lihat default read-only+🔒, Beli edit + simpan **lokal (IndexedDB, `lib/store/local-settings.ts`)**. Kalkulator pakai setting custom hanya bila `paidCore` (`compute.ts` terima `LocalSettings`; parity Free dijaga). Scope: material FDM/SLA, mesin/jam, failure/test, margin, reseller, fee channel.
- Komponen/Labor/Packing (Beli, 1b-2): preset komponen & packing (CRUD `{nama,harga}`) + labor preset **bundle** (multi-item) di `/settings`; di kalkulator blok "Komponen & Labor" (chip preset komponen, packing pilih-satu, labor bundle auto-fill semua item) terkunci untuk Free (`components/KomponenLaborInput.tsx`). Panel **rincian perhitungan** opsional (`RincianPanel`, toggle Setting→Tampilan, persist `lib/store/display-prefs.ts` localStorage, non-gated — semua user). Baris → item via `lib/kalkulator/compose.ts` → `buildInputV2`. Parity Free dijaga (tanpa add-on = angka lama). Multi-plate=1b-3, save hasil=1b-4.
- Gating: `lib/entitlement.ts` (`getEntitlement`/`can`/`requirePlan`) + `lib/hooks/use-entitlement.ts`. Di 1a-1 semua Free; fitur Beli 🔒 modal segera-hadir.
- Admin-mini: `/admin` owner-only (`OWNER_EMAILS`) — edit Config + lihat/ekspor waitlist.
- Payment (Beli, 1c): dynamic QRIS manual (`lib/qris/dynamic.ts` + `lib/payment/*`), checkout `/beli` → QR nominal-unik → user "sudah bayar" → admin verifikasi (`/admin` tab Pembayaran) → flip `lifetimeOwned` + notif (WA/email). Owner set `qris.static` + `price.beli` di `/admin`. Fitur Pro-nya (save/multi-plate) = 1b; Subscribe = 1c-lanjut.
- Bukti bayar (1c-2): "Saya sudah bayar" **wajib upload foto** bukti transfer. Foto dikompres di browser (`lib/image/compress.ts`, maks 1280px JPEG) → `POST /api/beli/[id]/mark-paid` (multipart, field `bukti`) → **Cloudflare R2** (`lib/storage/r2.ts` via `aws4fetch`, key `proofs/<id>.jpg`), object key di `Payment.proofKey`. Urutan dijaga: **validasi id → cek kepemilikan (`findClaimablePayment`) → upload → `markPaid`** (tak pernah "diklaim bayar" tanpa bukti, dan tak pernah nulis storage untuk payment bukan miliknya). Ditampilkan lewat `GET /api/beli/[id]/proof` (auth: owner ATAU pemilik; semua penolakan 404) di antrian aktivasi admin & halaman status user. **Bucket punya lifecycle auto-hapus 60 hari.** Env: `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`; absen → upload balas 503 (fitur lain tetap jalan).

## Deploy (homelab, GATED)
`./deploy.sh` → container `slizebiz` port 3300 di Docker host homelab. Butuh `.env.deploy`. Jangan deploy tanpa diminta user.

## Batas fase
Payment/subscription = 1c. Save/IndexedDB/PWA data = 1b.
