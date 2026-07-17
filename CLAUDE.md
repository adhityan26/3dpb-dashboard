# 3PB Monorepo

Monorepo pnpm + Turborepo (sejak 2026-07-08, merge `d74affb`). Sebelumnya repo ini = `shopee-dashboard` tunggal; sekarang:

```
apps/dashboard/        → dashboard ops internal 3DPB (Next.js 16, punya CLAUDE.md/AGENTS.md sendiri — BACA itu sebelum menyentuh kode Next)
apps/saas/             → (belum ada — Fase 1 SaaS, lihat docs/superpowers/specs/2026-07-08-saas-3pb-design.md)
apps/landing/          → situs marketing statik Slizebiz (www.slizebiz.com, Next static export → Cloudflare Pages; teaser kalkulator + waitlist D1)
packages/kalkulator-core/ → formula HPP: hitungKalkulasi (legacy wrapper) + hitungKalkulasiV2 + hitungMesinPerJam
packages/ui/           → tema Glass (glass.css) + primitives, dipakai landing (dan bisa dashboard)
docs/                  → spec & plan level project; docs/kalkulator-formula.md = before/after formula + catatan paritas
```

## Peta modul dashboard (semua di bawah `apps/dashboard/`)

Pola per fitur: logika di `lib/<fitur>/` → API routes di `app/api/<fitur>/` → halaman di `app/(dashboard)/` → hooks di `lib/hooks/` → endpoint bot Telegram di `app/api/bot/<fitur>/`. Contoh: **Tokopedia** = `lib/tokopedia/` (orders.ts, client, session; test di `lib/tokopedia/__tests__/`) + `app/api/tokopedia/` + `app/api/bot/tokopedia/` + hook `lib/hooks/use-tokopedia.ts` + UI `app/(dashboard)/order/page.tsx`. Path lama pra-monorepo (`lib/...`, `app/...` di root) kini semuanya berawalan `apps/dashboard/`.

## Perintah

```bash
# Node 22 wajib — default shell di mesin ini Node v10 (rusak):
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"

pnpm install                      # workspace root
pnpm turbo test                   # semua package (135 test)
pnpm turbo build
pnpm --filter shopee-dashboard dev|test|build
pnpm --filter @3pb/kalkulator-core test
pnpm --filter shopee-dashboard db:seed-kalk-v2   # seed profiles/presets kalkulator v2 (idempoten)
```

## Aturan penting

- **14 golden test** di `packages/kalkulator-core/src/formula.test.ts` = kontrak paritas formula legacy. Jangan diedit untuk meloloskan perubahan — perbaiki adapter/wrapper-nya. Detail paritas: `docs/kalkulator-formula.md` §4.
- Perubahan formula dibuat SEKALI di `packages/kalkulator-core` — dashboard internal dan SaaS dua-duanya konsumen.
- `apps/dashboard` deploy ke homelab via `./apps/dashboard/deploy.sh` (build context = root repo, `-f apps/dashboard/Dockerfile`). JANGAN deploy tanpa diminta user. Rollback: image tag `shopee-dashboard:pre-monorepo-20260706` di Docker host + git tag `pre-monorepo` (jangan `docker image prune -af` selama tag masih dibutuhkan).
- Dependency harus dideklarasikan eksplisit — pnpm strict, phantom dependency ala npm tidak resolve (kasus nyata: `dotenv` untuk `prisma.config.ts`, fix di `3437e20`).
- CI: `.github/workflows/ci.yml` (lint + `pnpm turbo test`), `deploy.yml` (push master → build image GHCR).

## Roadmap

Fase 0 (monorepo + kalkulator-core) ✅ merged & deployed. Berikutnya: **Fase 0b** — adopsi v2 di dashboard internal (settings printer/material profile, migrasi HELM→labor, gantungan/switch/label→komponen preset). Lalu **Fase 1** — app SaaS (spec di docs/superpowers/specs/).
