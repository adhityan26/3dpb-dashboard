# Fase 1b-5 — PWA & offline (apps/saas)

**Tanggal:** 2026-07-26
**Status:** Design (disetujui via brainstorm — siap ditulis plan)
**Prasyarat:** Fase 1b-4 + Duplikat/Hitung-ulang MERGED. `apps/saas` sekarang belum punya infra PWA sama sekali (tak ada manifest, tak ada service worker, tak ada dependency Serwist/next-pwa).

## Tujuan

Slizebiz bisa di-install ke homescreen (installable PWA) dan halaman yang **sudah pernah dibuka** bisa dibuka ulang tanpa koneksi internet — tanpa mengubah cara autentikasi bekerja sekarang.

## Temuan arsitektur penting (brainstorm 2026-07-26)

`apps/saas/lib/auth.ts:8` pakai `session: { strategy: "database" }` (NextAuth v5 + `PrismaAdapter`) — **bukan** JWT seperti rencana lama 2026-07-17 yang ternyata tak jadi diimplementasikan persis begitu. Konsekuensi: **semua** halaman ber-auth (`/`, `/kalkulator`, `/kalkulator/[id]`, `/settings`, `/admin`, `/beli` — semuanya Server Component yang panggil `auth()`) butuh koneksi ke database tiap request untuk validasi sesi. Halaman yang **belum pernah dibuka sebelumnya** akan selalu gagal saat offline (cache miss + tak bisa validasi sesi).

Namun: `RiwayatList.tsx` dan `Calculator.tsx` (dan turunannya) **tidak** menerima data kalkulasi/harga sebagai prop server-rendered — keduanya baca IndexedDB sendiri lewat `useEffect` tiap kali mount, di sisi klien. Jadi begitu shell halaman (HTML/RSC payload) yang di-cache service worker itu hydrate di browser, ia langsung baca IndexedDB **yang sekarang**, bukan snapshot lama — isi kalkulasi/harga tak pernah "usang" walau shell-nya dari cache. Yang benar-benar server-rendered dan ikut ke-cache adalah `userId`/`paidCore`/`owner` — untuk satu sesi login, nilai-nilai ini nyaris tak pernah berubah (paidCore cuma berubah sekali saat beli Pro), jadi risiko stale di situ diabaikan.

**Keputusan:** scope Fase 1b-5 ke cache app-shell + asset via service worker SAJA. **Tidak** mengubah strategi auth `database` — itu keputusan arsitektur terpisah yang jauh lebih besar & berisiko, di luar scope ini.

## Keputusan terkunci

1. **Library: Serwist** (`@serwist/next`) — kompatibel Next.js 16 App Router (next-pwa versi lama kurang terawat untuk App Router).
2. **Halaman yang bisa dibuka ulang offline** (asal pernah dibuka sekali saat online): **semua halaman ber-auth** — `/`, `/kalkulator`, `/kalkulator/[id]`, `/settings`. **Dikecualikan total** dari caching: `/login`, `/login/verify`, `/admin`, `/beli`, dan semua `/api/*` — selalu butuh network (login jelas tak bisa offline; admin/beli/API adalah aksi bermutasi yang tak boleh pernah disajikan dari cache basi).
3. **Fallback offline custom** — kalau navigasi ke rute yang belum pernah di-cache saat offline (cache miss), tampil halaman tema Glass sederhana ("Kamu sedang offline, halaman ini belum pernah dibuka sebelumnya" + tombol coba lagi), bukan error browser bawaan.
4. **Ikon PWA di-generate otomatis dari `logo.svg`** yang sudah ada di `public/` (192×192, 512×512, + varian maskable) via script build-time — tak perlu aset baru.
5. **Update versi**: service worker baru di-download diam-diam di background begitu terdeteksi; begitu siap, tampil **banner "Update tersedia — refresh?"** (komponen baru) — bukan auto-reload paksa, bukan silent-swap tanpa pemberitahuan.
6. **Di luar scope eksplisit:**
   - Indikator status online/offline di UI — itu bagian **Fase Subscribe/cloud** nanti (lihat catatan backlog di bawah), BUKAN bagian 1b-5. Jangan bikin badge "📴 Offline" generik sekarang.
   - Mengubah strategi sesi NextAuth (`database` → `jwt` atau lainnya) — di luar scope, risiko tinggi (invalidasi semua sesi aktif), butuh brainstorm terpisah kalau nanti benar-benar diperlukan.
   - Sinkronisasi cloud (belum ada backend-nya sama sekali).

## Arsitektur

### Dependency & konfigurasi dasar (diverifikasi terhadap dokumentasi resmi Serwist, bukan tebakan)

- **`@serwist/next`** — `dependency` (dipakai `next.config.ts`, bagian build).
- **`serwist`** — `devDependency` (dipakai tipe/APIs di `app/sw.ts` saat build; sesuai konvensi resmi Serwist).
- **`@serwist/window`** — `dependency` (BUKAN dev — ini yang jalan di browser, dipakai `UpdateBanner.tsx` buat registrasi + deteksi service worker "waiting").
- `apps/saas/next.config.ts` dibungkus **`withSerwistInit`** (bukan `withSerwist`) dari `@serwist/next`, opsi `swSrc: "app/sw.ts"`, `swDest: "public/sw.js"`.
- `apps/saas/tsconfig.json` — tambah `"@serwist/next/typings"` ke `compilerOptions.types`, tambah `"webworker"` ke `compilerOptions.lib` (dibutuhkan supaya `app/sw.ts` type-check, karena jalan di worker global scope beda dari DOM).
- `.gitignore` (root atau `apps/saas/.gitignore`) — tambah `public/sw.js` & file turunannya (`public/sw*.js`, `public/swe-worker*`) — file HASIL BUILD, jangan di-commit (sama pola seperti `.next/` yang sudah di-gitignore).
- `apps/saas/app/sw.ts` (baru) — pakai `Serwist` class dari `serwist`, `defaultCache` dari `"@serwist/next/worker"` (sudah berisi strategi caching wajar utk halaman/asset Next.js, tak perlu diracik dari nol). Config: `precacheEntries: self.__SW_MANIFEST`, `skipWaiting: false` (**wajib false** — kalau `true`, update langsung aktif tanpa nunggu user klik banner, bertentangan dengan Keputusan #5), `clientsClaim: true`, `navigationPreload: true`, `fallbacks: { entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }] }`.
- **Route exclusion** — array `runtimeCaching` dimulai dengan entry `NetworkOnly` untuk tiap rute yang dikecualikan, matcher pakai bentuk `({ sameOrigin, url }) => sameOrigin && (url.pathname.startsWith("/login") || url.pathname === "/admin" || url.pathname.startsWith("/beli") || url.pathname.startsWith("/api/"))`, **DITARUH SEBELUM** `...defaultCache` di-spread ke array yang sama (Serwist mencocokkan array secara first-match-wins — kalau entry exclusion ditaruh SESUDAH `defaultCache`, entry default utk `/api/` dkk yang menang duluan, bukan pengecualian kita).

### Manifest & ikon

- `apps/saas/app/manifest.json` (baru, **file statis** — ini pola yang didokumentasikan resmi Serwist untuk Next.js, bukan `manifest.ts` dinamis) — `name: "Slizebiz"`, `short_name: "Slizebiz"`, `theme_color`/`background_color` mengikuti aksen indigo tema Glass (`#6366f1`), `display: "standalone"`, `start_url: "/"`, `icons` menunjuk ke PNG yang di-generate. Ditautkan dari `<head>` via `app/layout.tsx`'s metadata (`manifest: "/manifest.json"`) + tag `<meta name="theme-color">`.
- Script build-time (mis. `apps/saas/scripts/generate-pwa-icons.mjs`, dijalankan sekali manual atau sebagai prebuild step) — pakai `sharp` untuk convert `public/logo.svg` → `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png` (dengan padding aman untuk area maskable). **`sharp` BELUM ada di `apps/saas/package.json` sama sekali** (sempat muncul di log build Docker cuma sebagai transitive dependency Next.js sendiri, bukan dependency eksplisit `apps/saas`) — harus ditambah eksplisit sebagai `devDependency` (script build-time, bukan kode yang dikirim ke browser) sebelum dipakai, sesuai aturan pnpm strict monorepo ini (no phantom dependency, kasus nyata sebelumnya: `dotenv`, `jszip`).

### Halaman offline fallback

- `apps/saas/app/offline/page.tsx` (baru, route `/offline`) — halaman statis sederhana bertema Glass, TANPA `auth()`/session check (harus bisa dirender murni dari cache tanpa network), pesan "Kamu sedang offline" + tombol "Coba lagi" (`window.location.reload()`).
- Didaftarkan di `sw.ts`'s `fallbacks.entries` dengan `url: "/offline"` + `matcher: ({ request }) => request.destination === "document"` — dipakai Serwist saat navigasi dokumen gagal total (offline + tak ada cache match).

### Banner update versi

- `apps/saas/components/UpdateBanner.tsx` (baru, client component) — pakai `Serwist` class dari **`@serwist/window`** (bukan `@serwist/next/browser`, itu untuk sisi build/worker — `@serwist/window` yang jalan di browser): `new Serwist("/sw.js")`, lalu `serwist.addEventListener("waiting", () => setShowBanner(true))`, `serwist.register()`. Begitu event "waiting" ke-trigger (ada service worker baru siap tapi belum aktif — karena `skipWaiting: false` di atas), tampilkan banner kecil tema Glass di bagian atas (mirip pola `saveMsg`/`actionMsg` yang sudah ada di komponen lain) — "Update tersedia — refresh?" dengan tombol yang memanggil `serwist.messageSkipWaiting()` lalu `window.location.reload()` sesudah event `controllerchange` ter-trigger (bukan reload langsung — beri jeda supaya SW baru benar-benar sudah take over).
- Dipasang di root layout (`apps/saas/app/layout.tsx`) supaya aktif di semua halaman, tak terikat satu route tertentu.
- **Catatan untuk plan-writing:** apakah `Serwist`'s `skipWaiting:false` di `app/sw.ts` sudah otomatis menyertakan message-listener utk `messageSkipWaiting()` dari sisi worker (dokumentasi kurang eksplisit di titik ini) — perlu dicek langsung ke source/tipe `serwist` package saat menulis kode task, JANGAN ditebak; kalau ternyata tidak otomatis, tambah manual `self.addEventListener("message", (e) => { if (e.data?.type === "SKIP_WAITING") self.skipWaiting(); })` di `sw.ts`.

## Backward-compat & paritas

- Tak ada perubahan pada `lib/auth.ts`, tak ada perubahan pada model data Prisma, tak ada perubahan pada `packages/kalkulator-core`.
- Free tier: tak ada perubahan perilaku selain sama-sama dapat manfaat installable+offline-shell (PWA ini berlaku untuk SEMUA user login, Free maupun Pro — bukan fitur berbayar).
- Halaman yang belum pernah dibuka tetap sepenuhnya butuh network — ini bukan regresi, memang begitu desainnya (dijelaskan lewat halaman offline fallback, bukan disembunyikan).

## Di luar scope

- Indikator online/offline UI (ditunda ke Subscribe/cloud — lihat memory project).
- Migrasi strategi sesi ke JWT.
- Sinkronisasi data cloud.
- Push notification (tak diminta, tak dibahas).
- Background sync API (kalkulasi sudah 100% lokal/IndexedDB, tak ada yang perlu di-sync ke server).

## Testing

- Test murni untuk script generate-icon: verifikasi file PNG dengan dimensi yang benar dihasilkan dari fixture SVG (atau, kalau script terlalu terikat filesystem/build-time untuk unit test praktis, cukup dijalankan manual sekali + commit hasil PNG-nya sebagai artefak statis — keputusan implementer, dicatat di plan).
- `UpdateBanner.test.tsx` — render tanpa service worker terdaftar (jsdom, tak ada `navigator.serviceWorker`) → tak crash, banner tak tampil; simulasi event "waiting" → banner tampil; klik "Refresh" → `postMessage`/`skipWaiting` dipanggil.
- `app/offline/page.tsx` — smoke test render sederhana (tak butuh mock auth karena halaman ini sengaja tanpa auth check).
- Verifikasi manual (bukan otomatis, dicatat sebagai langkah manual di plan): build produksi (`next build` + `next start`, BUKAN `next dev` karena Serwist umumnya nonaktif di dev mode) → buka di Chrome DevTools → Application → Service Workers → cek registrasi sukses, Application → Manifest cek installable, lalu simulasi offline (Network → Offline) → reload halaman yang sudah pernah dibuka → pastikan tetap render.

## File tersentuh (perkiraan)

**Baru:** `apps/saas/app/sw.ts`, `apps/saas/app/manifest.json`, `apps/saas/app/offline/page.tsx`, `apps/saas/components/UpdateBanner.tsx` (+ test), `apps/saas/scripts/generate-pwa-icons.mjs`, `apps/saas/public/icon-192.png`, `apps/saas/public/icon-512.png`, `apps/saas/public/icon-maskable-512.png`.
**Diubah:** `apps/saas/next.config.ts` (wrap `withSerwistInit`), `apps/saas/tsconfig.json` (+`@serwist/next/typings`, +`webworker` lib), `apps/saas/app/layout.tsx` (pasang `<UpdateBanner />` + metadata manifest/theme-color), `apps/saas/package.json` (+`@serwist/next` dependency, +`serwist` devDependency, +`@serwist/window` dependency, +`sharp` devDependency), `.gitignore` (+`public/sw*.js`, `public/swe-worker*`).
