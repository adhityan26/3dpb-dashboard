# Slizebiz — Fase 1a-0 Landing & Teaser Design

**Tanggal:** 2026-07-16
**Status:** Disetujui (brainstorming lanjutan sesi induk)
**Scope:** Situs marketing publik **`www.slizebiz.com`** — landing page + **teaser kalkulator fungsional** + **waitlist**, di **Cloudflare Pages** (statik, gratis). Properti ini **terpisah** dari aplikasi ber-auth (`app.slizebiz.com`, VPS — lihat spec app). **Bukan** implementasi; output = masukan `writing-plans`. **Ini deliverable yang dibangun & deploy DULUAN.**

**Relasi dokumen:**
- Desain permukaan (layout teaser, urutan section landing, copy, tier): [`2026-07-16-fase1a-funnel-ux-design.md`](2026-07-16-fase1a-funnel-ux-design.md) §5 (teaser) & §7 (landing). Spec ini = cara membangun & men-deploy-nya sebagai situs statik.
- App ber-auth: [`2026-07-16-fase1a-fondasi-design.md`](2026-07-16-fase1a-fondasi-design.md) — properti terpisah (`app.slizebiz.com`, VPS), dibangun setelah landing.
- Formula: `@3pb/kalkulator-core` — engine hitung teaser (client-side).

> **Arsitektur dua properti (keputusan 2026-07-16):** `www` (landing, Cloudflare, statik, permanen — tak pernah migrasi) + `app.` (aplikasi, VPS, nanti). Teaser di landing = cicipan client-side; kalkulator penuh + save + login ada di app. Payment/auth/offline **tidak** ada di landing.

---

## 1. Ringkasan keputusan

| # | Keputusan | Ref |
|---|---|---|
| 1 | Dua properti terpisah: `www.slizebiz.com` (landing, Cloudflare statik) + `app.slizebiz.com` (app, VPS). Landing permanen di Cloudflare. | §2 |
| 2 | `apps/landing` = Next.js **static export** (`output: 'export'`) → Cloudflare Pages. Nol SSR, nol server Node. | §3, §7 |
| 3 | Teaser kalkulator **client-side** (`kalkulator-core` + `defaultSettings` konstanta build-time). Sumber angka = core, bukan hitung ulang. | §5 |
| 4 | Blok "lanjutan" (margin A/B/C, status pasar, per-channel) di landing = **preview terkunci "segera hadir di app" + CTA waitlist** (bukan login-reveal; landing tak punya auth). | §5 |
| 5 | Waitlist = form → **Cloudflare Pages Function** → **D1** (SQLite). Satu-satunya data yang disimpan landing. | §6 |
| 6 | Harga & copy = **konstanta build-time** (admin-mini dinamis ada di app, bukan landing statik). | §4 |
| 7 | Legal di landing = **Privasi minimal** (karena kumpul email) + tautan placeholder ToS/Refund ("segera"). Set legal penuh di app/1c. | §4, §8 |
| 8 | Tombol "Masuk"/"Buka app" → `app.slizebiz.com` (status "segera hadir" selama app belum live). | §4 |
| 9 | `packages/ui` (tema Glass) diekstrak di sini, dipakai bersama landing & app. | §3 |

---

## 2. Arsitektur & domain

- **`www.slizebiz.com`** (+ apex `slizebiz.com` → redirect ke `www`): situs statik di **Cloudflare Pages**. Isi: landing marketing + teaser + waitlist. Gratis, global CDN, deploy via `wrangler`/Git integration. **Rumah permanen** — landing tidak pernah migrasi ke VPS.
- **`app.slizebiz.com`**: aplikasi ber-auth di VPS (spec app terpisah), **belum dibangun** di 1a-0. Landing menaut ke sini dengan CTA "segera hadir".
- DNS slizebiz.com dikelola di Cloudflare (nameserver Cloudflare) — memudahkan Pages + nanti subdomain `app` diarahkan ke VPS.

---

## 3. Struktur monorepo (tambahan)

```
apps/
  dashboard/          (existing, tak disentuh)
  landing/            ← BARU: www.slizebiz.com (Next static export → Cloudflare Pages)
packages/
  kalkulator-core/    (existing, dikonsumsi client-side)
  ui/                 ← BARU: token tema Glass + primitives minimal
```

- **`apps/landing`** — Next.js 16 (App Router), `output: 'export'` (statik penuh). `transpilePackages: ['@3pb/kalkulator-core', '@3pb/ui']`. Tidak ada route server/SSR/middleware — semua interaktivitas client-side. Endpoint waitlist = Cloudflare Pages Function di `functions/` (di luar Next, jalan sebagai Worker).
- **`packages/ui`** — ekstrak dari `apps/dashboard/app/globals.css`: CSS variables tema Glass (`--g-*`), util class (`.g-card`, `.glass-input`, `.g-btn-*`), light/dark; plus primitive React minimal yang landing butuh (`GlassCard`, `GlassInput`, `GlassButton`) — **hanya yang dipakai**. Export `./src/index.ts` (pola kalkulator-core). Dashboard tak di-refactor memakainya di 1a-0.
- **`@3pb/kalkulator-core`** — dipakai apa adanya untuk teaser (`hitungKalkulasiV2` jalan di browser).

---

## 4. Konten landing (funnel §7)

Single page, scroll. Section urut:
1. **Navbar** — wordmark `slizebiz`; link "Harga", "FAQ"; tombol **Masuk** → `app.slizebiz.com` (badge "segera hadir" selama app belum live).
2. **Hero** — eyebrow "powered by 3D Printing Bandung"; headline (mis. "Tahu harga jual produk 3D print-mu dalam hitungan detik"); sub-headline; CTA "Coba kalkulator gratis" (scroll ke teaser).
3. **Teaser kalkulator** (§5) — tertanam, "coba langsung, tanpa daftar".
4. **3 value-prop** — Harga akurat (modal/failure/listrik+depresiasi ikut) · Per channel · Simpan & kelola (di app, "segera").
5. **Banding tier** — Free / Beli / Subscribe (+ Add-on ringkas); harga = **konstanta build-time** bertanda "segera hadir"; tiap kartu CTA → **waitlist** ("Beri tahu saya saat rilis").
6. **FAQ singkat** — perlu bayar untuk coba? · data aman? · kapan app rilis?
7. **Footer** — wordmark + "powered by 3D Printing Bandung" + tautan **Privasi** (aktif) · Ketentuan/Refund ("segera") · Kontak.

Tema: Glass UI (`packages/ui`), light/dark otomatis. Harga & copy dari konstanta di `apps/landing/lib/content.ts` (bukan DB — landing statik).

---

## 5. Teaser kalkulator (funnel §5, adaptasi tanpa-login)

**Engine:** konstanta `defaultSettings` (build-time) → `hitungKalkulasiV2(input, defaultSettings)`. Nilai default (= seed produksi):
- FDM hpp 300 / jual 900 / failure 12%; SLA hpp 1750 / jual 3500 / failure 12%.
- Printer default "Bambu P1P" mesinPerJam 4000 (sekaligus acuan harga); margin A/B/C 1.1/1.5/2.0; resellerBulk 1.05; failureSpread 50%; testLayer 5%; channel offline 1.0 / shopee 1.2.

**Layout (dua kolom, wrap responsif):**
- **Kiri (input):** berat (g), durasi (jam), jenis filament (dropdown default FDM/SLA), printer = "Default (P1P)" terkunci (catatan "printer & material custom di app").
- **Kanan (hasil), urut:**
  1. **Biaya modal** + `<details>` rincian (material di harga modal · listrik + depresiasi mesin · buffer gagal porsi owner · test layer/QC).
  2. **Harga jual minimum** (label "minimum"; hint "di bawah ini rugi").
  3. **Rekomendasi harga jual** (angka besar, margin B).
  4. **Preview terkunci** (margin A/B/C berdampingan, status vs harga pasar, breakdown per channel) — ditampilkan ter-blur/redup dengan overlay: "Banding margin A/B/C, cek untung/rugi vs harga pasar & per channel — **segera hadir di app**" + tombol **"Beri tahu saya saat rilis"** (→ waitlist).
  5. Footer tipis: "Simpan, multi-plate, labor & settings custom → **di app, segera** " (→ waitlist).

Istilah: **"Biaya modal"** (bukan HPP/floor), **"Harga jual minimum"** (bukan BEP/floor). Single-plate, single-material, profil default.

> Catatan funnel: di app nanti, blok terkunci #4 dibuka lewat **login** (in-place reveal, funnel §5). Di landing (tanpa auth) mekanismenya jadi **waitlist**, bukan login. Pilihan menampilkan #4 sebagai preview-terkunci (vs menyembunyikannya) = keputusan copy yang boleh diubah saat finalisasi landing.

---

## 6. Waitlist

- Form: email + minat (`beli` | `subscribe`) + checkbox persetujuan Privasi. Dipicu dari CTA tier & overlay teaser.
- Submit → **Cloudflare Pages Function** `functions/api/waitlist.ts` (jalan sebagai Worker) → tulis ke **Cloudflare D1** tabel `waitlist(id, email, interest, created_at)`, unik `(email, interest)` (idempoten; duplikat → 200 "sudah terdaftar").
- Validasi email server-side di Function; rate-limit sederhana (opsional, via Cloudflare). Tanpa PII lain.
- Owner lihat/ekspor via `wrangler d1 execute` (query manual) — cukup untuk pilot; dashboard waitlist ada di admin app nanti.

---

## 7. Deploy (Cloudflare Pages)

- **Build:** `apps/landing` → `next build` dengan `output: 'export'` → folder statik (`out/`). Deploy ke **Cloudflare Pages** (project `slizebiz-landing`), custom domain `www.slizebiz.com` + apex redirect.
- **Pages Function** `functions/api/waitlist.ts` + binding **D1** (`wrangler.toml`/dashboard). D1 database `slizebiz-waitlist` dibuat via `wrangler d1 create`.
- **Toolchain:** `wrangler` (skill `cloudflare:wrangler`), Cloudflare Pages + D1 (tools tersedia sesi ini). Zero cost (free tier).
- Tanpa env rahasia (tak ada auth/Postgres). Hanya binding D1.
- CI: tambahkan `apps/landing` ke `pnpm turbo build`/`test` root (workspace-wide). Deploy Cloudflare via Git integration atau `wrangler pages deploy` manual (diputuskan saat plan).

---

## 8. Legal (minimal, karena kumpul email)

- **Kebijakan Privasi** (halaman aktif): data yang dikumpulkan = **email + minat** untuk notifikasi rilis; tidak dijual; hak hapus (email kontak); disimpan di Cloudflare D1. Template ringkas (funnel §10.2), ditandai "template — review sendiri".
- ToS & Refund = tautan "segera hadir" (belum relevan tanpa transaksi; set penuh di app/1c).

---

## 9. Error handling

- Teaser input invalid (0/negatif) → hasil kosong + hint, `hitungKalkulasiV2` dibungkus try/catch (tak crash).
- Waitlist Function: email invalid → 400 pesan jelas; duplikat → 200 "sudah terdaftar"; error D1 → 500 + pesan "coba lagi" (tak bocorkan detail).
- SW/PWA: **tidak ada** di landing (offline = 1b app).
- Fallback konten: jika konstanta harga kosong → tampil "segera hadir" (jangan render kosong).

---

## 10. Testing

- **Parity teaser** (utama): untuk beberapa input, angka teaser (Biaya modal, Harga jual minimum, rekomendasi B) == `hitungKalkulasiV2(input, defaultSettings)` — teaser hanya memformat.
- **defaultSettings konsistensi:** unit test bentuk `SettingsV2` valid + angka wajar (guard salah-ketik).
- **Waitlist Function:** email valid → tersimpan; invalid → 400; duplikat → idempoten (unit/integration terhadap D1 lokal/miniflare).
- **Build statik:** `next build` (export) sukses, `out/` terbentuk tanpa route server.
- kalkulator-core: test existing tetap hijau (tak disentuh).

---

## 11. Di luar scope

- Aplikasi ber-auth (`app.slizebiz.com`): magic-link, entitlement, kalkulator penuh, save, admin-mini dinamis — **spec app** (`fase1a-fondasi-design.md`), VPS, dibangun setelah landing.
- Payment (QRIS-manual) — 1c. Offline-first/PWA/IndexedDB — 1b. Cloud sync — 1c.
- Set legal penuh (ToS/Refund operasional) — bersama app/payment.
- Migrasi waitlist D1→Postgres — saat app admin butuh (1a-1/1c).
- Implementasi kode — spec berhenti di desain; lanjut `writing-plans`.
