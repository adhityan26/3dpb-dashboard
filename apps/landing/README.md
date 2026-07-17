# Slizebiz Landing — deploy Cloudflare Pages

Prasyarat: akun Cloudflare, domain `slizebiz.com` memakai nameserver Cloudflare, `npx wrangler login`.

1. Buat D1 + tabel:
   ```
   npx wrangler d1 create slizebiz-waitlist        # salin database_id → wrangler.toml
   npx wrangler d1 execute slizebiz-waitlist --remote --file apps/landing/schema.sql
   ```
2. Build: `pnpm --filter @3pb/landing build` (hasil `apps/landing/out`).
3. Deploy: `npx wrangler pages deploy apps/landing/out --project-name slizebiz-landing`
   (atau hubungkan repo via Cloudflare Pages Git integration: build command `pnpm --filter @3pb/landing build`, output dir `apps/landing/out`, root `/`).
4. Custom domain: tambah `www.slizebiz.com` di Pages project; apex `slizebiz.com` → redirect ke `www`.
5. Cek waitlist: `npx wrangler d1 execute slizebiz-waitlist --remote --command "SELECT * FROM waitlist"`.

Uji lokal fungsi + D1: `npx wrangler pages dev apps/landing/out --d1 DB=slizebiz-waitlist`.
