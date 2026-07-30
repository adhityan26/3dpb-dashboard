# Agent Glass UI — Design

## Konteks

`apps/agent` (Electron desktop, CYD Produk sub-proyek 2) sudah selesai secara fungsional — 3 layar (`ActivationScreen`, `PairingScreen`, `DashboardScreen`) semuanya pakai inline `style={{}}` polos tanpa styling, karena scope sebelumnya fokus ke fungsionalitas (aktivasi token, pairing, live dashboard), bukan visual. Ini sub-proyek terpisah yang cuma mengganti tampilan — tidak ada perubahan logic/behavior sama sekali.

3DPB punya design system standar ("Glass UI") yang sudah dipakai di `apps/dashboard` dan `apps/saas`, diekstrak sebagai `packages/ui` (`GlassCard`, `GlassButton`, `GlassInput`, `glass.css`) dan dipakai juga oleh `apps/landing`. Tujuan sub-proyek ini: terapkan tema yang sama ke `apps/agent` biar konsisten se-ekosistem.

## Goal

Restyle 3 layar `apps/agent` pakai `@3pb/ui` (Glass UI), tema dark tetap (tanpa toggle — window utility, bukan web app harian), tanpa mengubah behavior/test yang sudah ada.

## Keputusan Kunci

- **Reuse `@3pb/ui` langsung** (bukan CSS lokal terpisah). Komponennya (`GlassCard`/`GlassButton`/`GlassInput`) function component polos tanpa fitur React-19-spesifik — aman dipakai di React 18.3.1 (`apps/agent`'s versi saat ini) meski `peerDependencies` package itu menyebut `^19`.
- **Perlu tambah Tailwind v4 ke `apps/agent`** — komponen `@3pb/ui` pakai utility class Tailwind (`rounded-[14px]`, `px-4 h-10 text-sm`, dll) yang butuh build pipeline Tailwind buat di-generate; `glass.css`-nya sendiri plain CSS (aman tanpa Tailwind), tapi utility class di komponennya tidak. Solusi: `@tailwindcss/vite` plugin (resmi didukung Vite) ditambahkan ke `electron.vite.config.ts`'s renderer config — setup ringan, 1 plugin.
- **Dark tetap, tanpa toggle** — `apps/agent` adalah window utility yang selalu nyala background (bukan web app harian dgn preferensi light/dark user-facing). Cukup taruh class `dark` permanen di root elemen. Tidak ada `next-themes` (tidak relevan, bukan Next.js).
- **`AgentShell.tsx` baru** — komponen pembungkus bersama (background gradient `bg-glass-page dark`, logo Slizebiz kecil di atas — reuse `apps/saas/public/logo.svg`, container `GlassCard` terpusat) dipakai oleh ketiga layar, hindari duplikasi kode 3×.
- **Murni styling, tidak ada perubahan logic** — semua test yang sudah ada (query by role/text via `@testing-library/react`) harus tetap lulus tanpa modifikasi assertion, karena struktur elemen (button, label, teks) tidak berubah, cuma `className`.

## Detail Per Layar

**ActivationScreen** — `AgentShell` + judul "Aktivasi Agent" (`g-t1`), label + `GlassInput` untuk token, `GlassButton` "Aktifkan" (state disabled saat submitting tidak berubah). Pesan error (3 kondisi: `invalid_token`/`entitlement_expired`/`network_error`, sudah ada dari Task 11) diberi warna `g-error` — teks pesannya sendiri tidak berubah.

**PairingScreen** — `AgentShell` + judul "Pairing Device". Tombol "Lanjut ke Dashboard" jadi `GlassButton` gaya ghost/sekunder (bukan aksi utama — escape hatch). Device terdaftar & 2 kolom hasil scan (Bambu + Moonraker) masing-masing jadi baris `GlassCard`; device yang sudah terpasang tampil "Terpasang ✓" warna `g-success`, form hilang untuk device itu. Pesan `port_in_use` (Bambu SSDP gagal bind) diberi warna `g-warning`.

**DashboardScreen** — `AgentShell` + judul "Dashboard". Info broker IP:port jadi teks `g-t2` di dalam `GlassCard` kecil. Tombol Sync (`GlassButton`) dengan warna status: `g-success` saat berhasil, `g-error` saat gagal/`broker_unavailable`. Tiap printer jadi baris `GlassCard`, warna status: `running`→`g-success`, `idle`/`paused`→`g-info`, `error`→`g-error`, `offline`/stale→`g-t4` (redup).

## Testing

Tidak ada test baru untuk styling itu sendiri (tidak ada cara bermakna menguji visual/CSS lewat unit test tanpa screenshot-diffing, yang di luar scope). Verifikasi:
- Full test suite `apps/agent` (yang sudah ada) tetap 100% lulus tanpa modifikasi assertion — hanya `className` yang berubah, elemen (role/text) tetap sama.
- `npx tsc --noEmit -p tsconfig.json` tetap bersih.
- Verifikasi visual manual oleh user via `pnpm --filter @3pb/agent dev` — Claude tidak bisa melihat hasil render sungguhan di window Electron.

## Scope

**In scope:** styling 3 layar existing + `AgentShell` + setup Tailwind v4 + `@3pb/ui` dependency.

**Out of scope:** perubahan behavior/logic apa pun di ketiga layar; ikon window/taskbar Electron (belum ada, terpisah dari scope ini); animasi/transisi antar layar; light-mode/theme toggle.
