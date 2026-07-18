# apps/saas — Slizebiz App (Free live, 1a-1)

App SaaS Slizebiz: kalkulator harga jual 3D print untuk user Free + admin-mini.

## Jalankan lokal
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter @3pb/saas dev   # http://localhost:3300
```
Butuh `.env` (lihat `.env.deploy.example`): `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAILS`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.

## Arsitektur
- Auth: dual-channel — email magic-link (NextAuth v5 + Resend) + nomor WhatsApp OTP (via WA Omni, `lib/wa/*` + `/api/auth/wa/*`). Sesi database. Login satu-input auto-detect (@ = email, 08…/+62… = WA). Env WA opsional (`WA_OMNI_URL/TOKEN/ACCOUNT_ID`); absen = WA nonaktif, email tetap jalan.
- Data: Prisma/Postgres — NextAuth tables + `Entitlement` komposit + `Config`. **Tanpa** tabel Waitlist.
- Waitlist: dibaca read-only dari **Cloudflare D1** milik landing (`lib/waitlist/cloudflare.ts`).
- Kalkulator: `@3pb/kalkulator-core` `hitungKalkulasiV2` + `defaultSettings`; UI memformat, tak menghitung ulang (`lib/kalkulator/compute.ts`).
- Gating: `lib/entitlement.ts` (`getEntitlement`/`can`/`requirePlan`) + `lib/hooks/use-entitlement.ts`. Di 1a-1 semua Free; fitur Beli 🔒 modal segera-hadir.
- Admin-mini: `/admin` owner-only (`OWNER_EMAILS`) — edit Config + lihat/ekspor waitlist.
- Payment (Beli, 1c): dynamic QRIS manual (`lib/qris/dynamic.ts` + `lib/payment/*`), checkout `/beli` → QR nominal-unik → user "sudah bayar" → admin verifikasi (`/admin` tab Pembayaran) → flip `lifetimeOwned` + notif (WA/email). Owner set `qris.static` + `price.beli` di `/admin`. Fitur Beli-nya (save/multi-plate) = 1b; Subscribe = 1c-lanjut.

## Deploy (homelab, GATED)
`./deploy.sh` → container `slizebiz` port 3300 di Docker host homelab. Butuh `.env.deploy`. Jangan deploy tanpa diminta user.

## Batas fase
Payment/subscription = 1c. Save/IndexedDB/PWA data = 1b.
