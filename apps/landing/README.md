# Slizebiz Landing — deploy Cloudflare Pages

Prasyarat: akun Cloudflare, domain `slizebiz.com` memakai nameserver Cloudflare, `npx wrangler login`.

> Penting: wrangler resolve `wrangler.toml` + folder `functions/` dari CWD saat ini. Semua perintah `wrangler` di bawah harus dijalankan dari `apps/landing`, bukan root repo — kalau dari root, `/api/waitlist` + binding D1 tidak ikut ke-deploy (situs statis tetap jalan, tapi submit waitlist selalu 404).

1. Buat D1 + tabel (dari `apps/landing`):
   ```
   cd apps/landing
   npx wrangler d1 create slizebiz-waitlist        # salin database_id → wrangler.toml
   npx wrangler d1 execute slizebiz-waitlist --remote --file schema.sql
   ```
2. Build (dari root repo): `pnpm --filter @3pb/landing build` (hasil `apps/landing/out`).
3. Deploy (dari `apps/landing`, tanpa argumen output-dir — `pages_build_output_dir = "out"` di `wrangler.toml` sudah menghandle ini):
   ```
   cd apps/landing && npx wrangler pages deploy --branch=main
   ```
   > `--branch=main` wajib: production branch project Pages = `main`, sedangkan branch git repo ini `master`. Tanpa flag itu wrangler memakai nama branch git → deploy nyasar ke environment preview (custom domain tetap serve versi lama).
   Alternatif Git integration: di Cloudflare Pages project, set **Root directory = `apps/landing`**, build command `pnpm --filter @3pb/landing build`, build output directory `out`.
4. Custom domain: tambah `www.slizebiz.com` di Pages project; apex `slizebiz.com` → redirect ke `www`.
5. Cek waitlist: `cd apps/landing && npx wrangler d1 execute slizebiz-waitlist --remote --command "SELECT * FROM waitlist"`.

Uji lokal fungsi + D1 (dari `apps/landing`): `cd apps/landing && npx wrangler pages dev`.

## Pre-go-live checklist

1. Isi `database_id` di `wrangler.toml` setelah `d1 create` (masih `PLACEHOLDER-isi-setelah-d1-create`).
2. Konfirmasi mailbox `halo@slizebiz.com` benar-benar menerima email (via Cloudflare Email Routing) — halaman Privasi menjanjikan hak hapus data lewat kontak ini.
3. Tambah custom domain `www.slizebiz.com` + redirect apex.
4. TODO: OG/social metadata (`og:image`, `metadataBase`) sebelum sebar link.
