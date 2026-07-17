# Slizebiz — Fase 1a Fondasi Design

**Tanggal:** 2026-07-16
**Status:** Disetujui (brainstorming lanjutan sesi induk)
**Scope:** Lapisan teknis di bawah produk SaaS **Slizebiz** untuk milestone **Free live** — scaffold `apps/saas`, `packages/ui`, auth magic-link, data model (auth + entitlement komposit + Config + Waitlist), primitif gating, engine + **teaser kalkulator yang fungsional**, PWA shell, dan deploy ke homelab. **Bukan** implementasi; output = spec yang jadi masukan `writing-plans`.

**Relasi dokumen:**
- **Pasangan wajib:** [`2026-07-16-fase1a-funnel-ux-design.md`](2026-07-16-fase1a-funnel-ux-design.md) — mendesain permukaan produk (teaser, landing, gating, modal, legal). Spec ini mengimplementasikan **5 input wajib** di §11 funnel (entitlement komposit, Config+admin-mini, offline-first PWA, magic-link reveal in-place, waitlist). Gabungan kedua spec = build "Free live".
- Induk: [`2026-07-08-saas-3pb-design.md`](2026-07-08-saas-3pb-design.md) — §3 struktur monorepo, §5 auth/entitlement, §6 storage, §8 infra. Funnel spec sudah merevisi §2/§5/§7 induk; spec ini mengikuti bentuk terrevisi.
- Formula: [`../../kalkulator-formula.md`](../../kalkulator-formula.md) + `@3pb/kalkulator-core` — engine hitung dipakai apa adanya.

> **Pembagian Fase 1:** 1a (Free live) → 1b (Beli, IndexedDB) → 1c (Subscribe + payment). Spec ini = **1a-Fondasi**; permukaan/funnel = spec pasangannya. Payment BELUM ada di 1a (hanya waitlist).

> **Perubahan payment (2026-07-16):** Tripay/gateway **DIBATALKAN**. Payment nanti = **dynamic QRIS sendiri + verifikasi manual** (user konfirmasi bayar → admin cek & flip entitlement). Ini urusan **1c**; di 1a hanya berdampak: (a) admin-mini nanti dapat antrian konfirmasi bayar, (b) skema entitlement sudah dirancang bisa di-flip manual. Referensi "Tripay" di spec funnel & induk kini usang — perlu **doc-sync terpisah** (di luar scope build ini).

---

## 1. Ringkasan keputusan (decision log)

| # | Keputusan | Ref |
|---|---|---|
| 1 | 1a-Fondasi = lapisan teknis **+ teaser kalkulator fungsional** (termasuk mekanik login-reveal in-place). Landing lengkap/tier-lock/modal/legal = track funnel. | §2, §9 |
| 2 | Deploy target 1a = **homelab Docker host** (container `slizebiz` port 3200, DB `slizebiz` di Postgres homelab). SumoPod = migrasi "go public" terpisah, di luar 1a. | §3, §11 |
| 3 | `apps/saas` Next.js 16 (stack sama dashboard) + `packages/ui` = **ekstrak token tema Glass + primitives minimal** (YAGNI, bukan full lib). | §4 |
| 4 | Auth = **magic-link** NextAuth v5 + Resend, sesi database (Prisma adapter), **reveal in-place** pasca-login (state input tak hilang). | §5 |
| 5 | Data model: NextAuth tables + **`Entitlement` komposit** + **`Config`** (harga/copy) + **`Waitlist`**. **Tanpa tabel data kalkulasi** (Free stateless; save = 1b). | §6 |
| 6 | Gating **dua sumbu**: terautentikasi? (login) & kapabilitas berbayar? Primitif `useEntitlement()` (UI) + `requirePlan()`/`can()` (server). Di 1a semua = Free. | §7 |
| 7 | `/admin` owner-only via allowlist `OWNER_EMAILS`: CRUD `Config` + lihat `Waitlist`. | §8 |
| 8 | Konstanta `defaultSettings` di `apps/saas` (rate FDM/SLA, 1 printer default, margin A/B/C, material default) → `hitungKalkulasiV2`. | §9 |
| 9 | PWA = manifest + **service-worker app-shell** (teaser jalan offline setelah load). **IndexedDB data layer = 1b.** | §10 |
| 10 | Test: parity teaser (angka teaser == core), unit gating, smoke auth, konsistensi `defaultSettings`. | §13 |

---

## 2. Scope & deploy target

**Yang dibangun (1a-Fondasi):** monorepo scaffold `apps/saas` + `packages/ui`; auth magic-link; Prisma/Postgres (auth + entitlement + Config + waitlist); primitif gating; halaman **teaser kalkulator fungsional** dengan mekanik login-reveal; admin-mini; PWA shell; Dockerfile + deploy ke homelab.

**Yang di track funnel (spec pasangan, build terpisah):** landing page lengkap (hero/value-prop/banding tier/FAQ/footer), badge 🔒 di kontrol Beli/Sub + modal upgrade, halaman legal (ToS/Privasi/Refund), copy final. Teaser fondasi hidup di halaman minimal; funnel "mendandani" jadi landing utuh.

**Di luar 1a sepenuhnya:** payment (waitlist only), tabel data kalkulasi & save, IndexedDB data, SumoPod/Caddy/backup publik, sync cloud.

**Deploy homelab** (bukan SumoPod): reuse pola `apps/dashboard`. Container `slizebiz` port **3200** di Docker host `192.168.88.113`, network `homelab`. DB = database baru **`slizebiz`** di container Postgres homelab `light-generator-postgres-1` (isolasi per-database; produksi SumoPod nanti dapat Postgres sendiri — pemisahan logis "2 deployment" tetap terjaga). Akses awal via IP:3200 / hostname homelab; DNS publik slizebiz.com menyusul saat migrasi SumoPod.

---

## 3. Struktur monorepo (tambahan)

```
apps/
  dashboard/          (existing, tak disentuh)
  saas/               ← BARU: Next.js 16 app SaaS
packages/
  kalkulator-core/    (existing, dikonsumsi apa adanya)
  ui/                 ← BARU: token tema Glass + primitives minimal
```

- **`apps/saas`** — Next.js 16 (App Router), stack & konvensi sama `apps/dashboard` (baca `apps/dashboard/AGENTS.md` — versi Next punya breaking change; cek `node_modules/next/dist/docs/`). Prisma 7 + Postgres, NextAuth v5, TanStack Query, Tailwind. `transpilePackages: ['@3pb/kalkulator-core', '@3pb/ui']`.
- **`packages/ui`** — ekstrak dari `apps/dashboard/app/globals.css`: CSS variables tema Glass (`--g-*`), util class (`.g-card`, `.glass-input`, `.g-btn-*`), light/dark. Plus segelintir primitive React yang teaser butuh (mis. `GlassInput`, `GlassButton`, `GlassCard`) — **hanya yang dipakai**, bukan porting semua komponen dashboard. Export via `./src/index.ts` (source-TS, pola sama kalkulator-core). Dashboard TIDAK di-refactor untuk memakainya di 1a (opsional kemudian).
- **`@3pb/kalkulator-core`** — dikonsumsi apa adanya (`hitungKalkulasiV2`, tipe `SettingsV2`/`KalkulasiInputV2`/`HasilKalkulasiV2`). Tidak diubah.

---

## 4. Auth (magic-link)

- **NextAuth v5** dengan **Email provider (magic-link)** dikirim via **Resend**. Tanpa password, tanpa Google OAuth di 1a (bisa ditambah kemudian).
- **Prisma adapter**, **sesi database** (bukan JWT) — konsisten dengan lookup entitlement server-side.
- **Reveal in-place (funnel §5):** login TIDAK memindah halaman. Alur: user di teaser klik "Login gratis" → input email (inline atau modal ringan) → Resend kirim link → user klik link → callback memverifikasi & set sesi → user kembali ke halaman teaser dengan **state input tetap** dan blok terkunci-login terbuka. Implementasi: simpan draft input teaser (mis. `sessionStorage`/URL state) sebelum navigasi verifikasi, pulihkan setelah kembali; halaman teaser membaca sesi → render blok yang tadinya blur.
- Env: `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` (domain terverifikasi Resend — homework user).
- `auth()` helper (pola sama dashboard `lib/auth.ts`) dipakai route/server component untuk ambil sesi + userId.

---

## 5. Data model (Prisma schema `apps/saas`, terpisah total)

Schema SaaS berdiri sendiri (bukan schema dashboard). Tabel:

**NextAuth (adapter standard):** `User`, `Account`, `Session`, `VerificationToken`. `User.email` unik; tanpa `password`.

**Entitlement (komposit — funnel §3.6):**
```prisma
model Entitlement {
  id                  String    @id @default(cuid())
  userId              String    @unique
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  lifetimeOwned       Boolean   @default(false)
  lifetimePurchasedAt DateTime?
  subStatus           String    @default("NONE")   // NONE | ACTIVE | EXPIRED
  subStartedAt        DateTime?
  subExpiresAt        DateTime?
  firstCloudMonthUsed Boolean   @default(false)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
}
```
Dibuat otomatis (default aman `false`/`NONE`) saat User pertama kali dibuat (adapter event / upsert saat login). Di 1a tak pernah di-flip; siap untuk 1b/1c (flip manual oleh admin saat payment QRIS dikonfirmasi).

**Config (key-value harga & copy — funnel §9):**
```prisma
model Config {
  key       String   @id            // mis. "price.beli", "copy.hero.headline", "feature.pos.status"
  value     String
  updatedAt DateTime @updatedAt
}
```
Landing/teaser/modal membaca dari sini (dengan default konstanta jika key absen). Editable via `/admin` tanpa redeploy.

**Waitlist (funnel §6 — minat tier berbayar):**
```prisma
model Waitlist {
  id        String   @id @default(cuid())
  email     String
  interest  String                    // "beli" | "subscribe"
  userId    String?                   // jika sudah login
  createdAt DateTime @default(now())
  @@unique([email, interest])
}
```

**Tidak ada** tabel Kalkulasi/Plate/Komponen/dst di 1a — Free stateless, save = fitur Beli (1b).

---

## 6. Entitlement & primitif gating

Gating **dua sumbu**: (1) terautentikasi (login) dan (2) kapabilitas berbayar. Fitur teaser-plus (margin A/B/C, status pasar, per-channel, ingat sesi, copy/share) butuh **login** saja (Free); fitur inti berbayar (save, multi-plate, labor, settings custom, master harga) butuh **kapabilitas**.

**Kapabilitas (turunan Entitlement):**
- `paidCore = lifetimeOwned || subStatus === 'ACTIVE'`
- `cloud = subStatus === 'ACTIVE'`

**Server** — `lib/entitlement.ts`:
- `getEntitlement(userId): Entitlement` (+ auto-create default bila belum ada).
- `can(ent, capability): boolean` untuk `'paidCore' | 'cloud'`.
- `requirePlan(capability)` — guard untuk API route berbayar: tolak `403` bila tak punya kapabilitas. **Belum dipakai fitur apa pun di 1a** (tak ada API berbayar), tapi disediakan + di-unit-test agar 1b/1c tinggal pakai.

**Client** — `lib/hooks/use-entitlement.ts`:
- `useEntitlement()` → `{ authenticated, lifetimeOwned, subActive, can: { paidCore, cloud } }` (fetch `/api/entitlement`, atau dari sesi). Dipakai UI untuk memutuskan render blok login-gated vs badge 🔒.
- Di 1a: user anonim → `authenticated:false`; user login → `authenticated:true, can.paidCore:false`.

Detail badge 🔒 + modal upgrade = track funnel; fondasi menyediakan primitifnya + memakainya untuk **login-reveal** teaser.

---

## 7. Admin-mini

- Route `/admin` di `apps/saas`, **owner-only**: guard server membandingkan email sesi dengan allowlist env **`OWNER_EMAILS`** (comma-separated). Non-owner → 404/redirect.
- Fungsi 1a: **CRUD `Config`** (form key-value untuk harga & copy landing/teaser) + **tabel `Waitlist`** (lihat/ekspor minat). 
- Tanpa koneksi ke DB dashboard internal (jaga pemisahan 2-deployment).
- *(1c nanti: tab antrian konfirmasi pembayaran QRIS → tombol aktifkan yang mem-flip `Entitlement`. Skema sudah siap; tidak dibangun di 1a.)*

---

## 8. Engine + teaser kalkulator

**Default settings** — konstanta `lib/kalkulator/default-settings.ts` di `apps/saas` (nilai = seed produksi aktual):
- FDM: hpp 300 / jual 900 / failure 12%; SLA: hpp 1750 / jual 3500 / failure 12%.
- Printer default "Bambu P1P" mesinPerJam 4000 (sekaligus acuan harga).
- Margin A/B/C = 1.1 / 1.5 / 2.0; resellerBulk 1.05; failureSpread 50%; testLayer 5%.
- Channel: offline 1.0, shopee 1.2.

Bentuk = `SettingsV2` + `KalkulasiInputV2` dari kalkulator-core; teaser memanggil `hitungKalkulasiV2(input, defaultSettings)`. **Sumber angka teaser = core**, bukan hitung ulang di UI (hindari drift; sama disiplin RincianPanel dashboard).

**Halaman teaser** (route publik, mis. `/`; funnel akan bungkus jadi landing). Layout & istilah persis funnel §5:
- **Input:** berat (g), durasi (jam), jenis filament (dropdown default), printer = "Default (P1P)" terkunci.
- **Hasil terurut:** (1) **Biaya modal** + `<details>` rincian; (2) **Harga jual minimum**; (3) **Rekomendasi harga jual** (margin B, angka besar).
- **Blok login-gated (in-place blur):** margin A/B/C, status vs harga pasar, breakdown per channel, ingat sesi, copy/share — ter-blur dengan overlay "Login gratis untuk buka · tanpa password · link via email". Pasca-login: terbuka in-place.
- Istilah: "Biaya modal" (bukan HPP/floor), "Harga jual minimum" (bukan BEP/floor). "BEP" tak dipakai.

Single-plate, single-material, profil default saja (multi-plate/material/labor/settings = Beli, tampil sebagai teaser footer 🔒 → picu modal upgrade [track funnel]).

---

## 9. Offline-first / PWA

- **1a:** `manifest.webmanifest` (installable) + **service worker app-shell** (cache shell + asset statis → teaser jalan offline setelah load pertama). Tanpa persistensi data (Free tak simpan apa-apa).
- **1b:** IndexedDB data layer (repo lokal untuk fitur Beli) — di luar 1a.
- Prinsip funnel §8.3 (offline-first) dipatuhi sejak fondasi: UI teaser tak boleh mengasumsikan koneksi setelah load; SW disiapkan agar 1b tinggal menambah data layer.

---

## 10. Deploy (homelab)

- **Dockerfile** `apps/saas` (multi-stage, pola sama `apps/dashboard/Dockerfile`; build context = root repo, standalone output Next). Entrypoint: `prisma db push` lalu start server.
- **Skrip deploy** (mirror `apps/dashboard/deploy.sh` disederhanakan, tanpa stl-service): build image `slizebiz:latest` di Docker host homelab → `docker run` container `slizebiz`, `--network homelab -p 3200:3000`, env dari `.env.deploy` saas.
- **DB:** buat database `slizebiz` di Postgres homelab (pola `shopee_dashboard_dev`). `DATABASE_URL` → `postgresql://…@light-generator-postgres-1:5432/slizebiz` (runtime) / host `192.168.88.113:5432` (migrasi/seed dari lokal).
- **Env:** `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAILS`, `NEXTAUTH_URL` (homelab origin), `NEXT_PUBLIC_BUILD_*`.
- **CI:** tambah `apps/saas` ke `pnpm turbo test`/`build` (workflow root existing sudah workspace-wide).
- SumoPod/Caddy/DNS/backup publik = task migrasi terpisah, **bukan** 1a.

---

## 11. Error handling

- **Auth:** gagal kirim email Resend → pesan actionable ("gagal kirim link, coba lagi"); link kadaluarsa/terpakai → halaman jelas + kirim ulang. `AUTH_SECRET`/`RESEND_API_KEY` absen → fail-fast saat start (jangan diam).
- **Entitlement:** `getEntitlement` auto-create bila baris hilang (tak pernah 500 karena entitlement absen).
- **Config:** key absen → fallback konstanta default (landing/teaser tetap render). Parse harga non-numerik → default + log.
- **Teaser:** input invalid (0/negatif) → hasil kosong dengan hint, bukan crash; `hitungKalkulasiV2` dibungkus try/catch.
- **Admin:** non-owner tak pernah lihat `/admin` (guard server sebelum render).
- **PWA/SW:** kegagalan registrasi SW non-fatal (app tetap jalan online).

---

## 12. Testing

- **Parity teaser** (utama): untuk beberapa input, angka yang teaser tampilkan (Biaya modal, Harga jual minimum, rekomendasi B) == `hitungKalkulasiV2(input, defaultSettings)` — teaser hanya memformat, tak menghitung ulang.
- **defaultSettings konsistensi:** unit test bahwa konstanta cocok bentuk `SettingsV2` dan menghasilkan angka wajar (guard salah-ketik rate).
- **Gating unit:** `can()`/`requirePlan()` untuk kombinasi entitlement (Free/Beli/Sub) → matriks kapabilitas benar; `requirePlan` tolak 403 tanpa kapabilitas.
- **Entitlement auto-create:** user baru → baris default aman terbentuk.
- **Admin guard:** owner vs non-owner (allowlist) → akses/tolak.
- **Auth smoke:** magic-link happy path (kirim → verifikasi → sesi) di test/dev.
- kalkulator-core: test existing tetap hijau (tak disentuh).

---

## 13. Boundary ringkas

| Area | 1a-Fondasi (spec ini) | Track funnel (spec pasangan) | Ditunda (1b/1c/SumoPod) |
|---|---|---|---|
| Teaser kalkulator | ✅ fungsional + login-reveal | copy/polish landing | — |
| Landing lengkap, modal upgrade, badge 🔒 kontrol Beli, legal | primitif gating saja | ✅ | — |
| Auth magic-link, entitlement, Config, waitlist, admin-mini | ✅ | pakai | flip payment (1c) |
| PWA | ✅ shell offline | — | IndexedDB data (1b) |
| Deploy | ✅ homelab | — | SumoPod publik |
| Save/data kalkulasi, cloud sync | — | — | 1b/1c |
| Payment | waitlist only | — | QRIS-manual (1c) |

---

## 14. Di luar scope spec ini

- Landing page lengkap, tier-lock UI, modal upgrade, halaman legal — **track funnel**.
- Payment (QRIS-manual + admin activation) — **1c**.
- IndexedDB data layer / fitur Beli / save — **1b**.
- Migrasi SumoPod publik (Caddy/DNS/backup/restore drill) — **task terpisah** sebelum go-public.
- Doc-sync referensi Tripay→QRIS di spec funnel & induk — follow-up docs terpisah.
- Angka harga tier (TBA), Google OAuth (bisa ditambah kemudian), mini-POS.
- Implementasi kode — spec berhenti di desain; lanjut `writing-plans`.
