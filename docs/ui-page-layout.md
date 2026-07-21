# Pedoman Layout Halaman — 3PB Monorepo

Berlaku untuk **`apps/saas` (Slizebiz)** dan **`apps/dashboard` (3PB Ops)**. Tujuan: setiap halaman baru seragam tanpa perlu menebak.

Design system: **Glass UI 3DPB** — Deep Space (dark) + Liquid Glass (light), aksen indigo `#6366f1`. Skill: `glass-ui-theme`.

> **Status penegakan (per 2026-07-21)**
> | App | Kerangka halaman | Judul halaman |
> |---|---|---|
> | `apps/saas` | ✅ `PageShell` — `title` prop **wajib** (ditegakkan TypeScript) | ✅ 4/4 halaman |
> | `apps/dashboard` | ⚠️ belum ada — tiap halaman menyusun sendiri | ⚠️ 2/11 halaman (`tagihan` malah placeholder debug) |
>
> Refactor dashboard (bikin `PageShell` + bungkus 11 halaman) **dijadwalkan sesi tersendiri**. Sampai itu terjadi, halaman dashboard baru/diedit **ikuti §5 secara manual**.

---

## 1. Aturan bersama (dua app)

1. **Setiap halaman punya judul.** Halaman tanpa judul terasa menggantung di bawah nav. Tak ada pengecualian selain halaman pra-auth (login).
2. **Lebar container konsisten dalam satu app.** Jangan tulis lebar sendiri per halaman — kalau berbeda-beda, header ikut bergeser saat pindah halaman.
3. **Warna teks pakai token `g-t1`…`g-t5`**, jangan hex. Token ini otomatis mengikuti light/dark.
4. **Nav, background, tema, orbs diurus layout/kerangka** — bukan per halaman.
5. **Selalu dicoba di light DAN dark.** Light mode paling sering meleset kontrasnya.
6. **Fitur terkunci tetap kelihatan** (🔒 + CTA), jangan disembunyikan — prinsip funnel.
7. Halaman pra-auth (mis. `/login`) sengaja di luar kerangka: tanpa nav, kartu sempit terpusat.

### Token & tema (sama di dua app)

- Sumber token: `packages/ui/src/glass.css` (`--g-*`, `.glass-card`, `.glass-input`, `.bg-glass-page`, kelas `.g-t1`–`.g-t5`). Dashboard punya salinan verbatim di `globals.css`.
- Tema: `next-themes` dengan `attribute="class"` + `defaultTheme="system"` → kelas `.dark` di `<html>`. **Dua app sama.**
- Aksen **indigo `#6366f1`** — bukan violet `#7c3aed`, bukan biru `#3b82f6`.

---

## 2. Ringkasan perbedaan antar app (disengaja)

| | `apps/saas` | `apps/dashboard` |
|---|---|---|
| Lebar konten | `max-w-3xl` (form & hasil) | `max-w-6xl` (tabel padat, data ops) |
| Nav | Island atas (`AppHeader`) — 7 tab modul, sebagian `soon` | Island atas (`TabNav`) + **bottom-nav mobile** terpisah |
| Kontrol kanan | ThemeToggle · avatar · ⏻ | ThemeToggle · avatar · ⏻ (`ControlIsland`) |
| Akses tab | `owner` (owner-only Admin) | `role` per tab + badge angka |
| Drawer | — | `SidebarDrawerShell` (2 halaman) |
| Kerangka halaman | `PageShell` (title wajib) | belum ada (lihat §5) |

Perbedaan lebar itu **disengaja** — jangan "diseragamkan" tanpa alasan.

---

## 3. `apps/saas` — cara pakai

> **Setiap halaman ber-auth WAJIB dibungkus `PageShell`. Jangan tulis `<main>`, header, atau `<h1>` sendiri.**

```tsx
import { PageShell } from "@/components/PageShell";

export default async function ContohPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <PageShell
      title="Judul Halaman"                         // WAJIB
      description="Kalimat singkat."                // opsional
      current="kalkulator"                          // tab yang di-highlight
      owner={isOwner(session.user.email)}           // tampilkan tab Admin
      userLabel={session.user.email ?? undefined}   // avatar inisial
      actions={<GlassButton>Aksi</GlassButton>}     // opsional, kanan judul
      narrow                                        // opsional: persempit KONTEN
    >
      {/* isi halaman */}
    </PageShell>
  );
}
```

| Prop | Wajib | Fungsi |
|---|---|---|
| `title` | ✅ | H1 gradient. TypeScript menolak halaman tanpa judul — disengaja. |
| `description` | — | Kalimat pendukung (`g-t4`, 12px). |
| `actions` | — | Tombol/link di kanan judul. |
| `current` | — | `"kalkulator" \| "setting" \| "admin" \| "beli"` → menandai tab aktif (`aria-current="page"`). |
| `owner` | — | `true` → tab **Admin** muncul. Isi dari `isOwner(...)`, jangan hardcode. |
| `userLabel` | — | Sumber inisial avatar (biasanya email). |
| `narrow` | — | Persempit **konten** ke `max-w-md` (mis. checkout). Nav/container tak berubah. |
| `authenticated` | — | Default `true`. `false` → nav tanpa tab & kontrol. |

Sudah diurus kerangka (jangan diulang): nav island sticky, container `max-w-3xl mx-auto px-6 pt-6 pb-16`, blok judul + jarak `mb-5`, animasi `page-enter`, `.bg-glass-page` + `AmbientOrbs` (di `app/layout.tsx`).

---

## 4. `apps/saas` — menambah modul ke nav

Nav = peta produk. Modul yang belum jadi **tampil tapi tidak dilinkkan** (badge `soon`) supaya tak ada nav buntu.

`apps/saas/components/AppHeader.tsx`, array `TABS`:
```ts
{ key: "invoice", icon: "🧾", label: "Invoice", soon: true },          // belum jadi
{ key: "invoice", href: "/invoice", icon: "🧾", label: "Invoice" },    // sudah jadi
```
Saat modul jadi: **tambah `href`, hapus `soon`**, lalu tambahkan `key` ke tipe `NavKey` agar bisa dipakai sebagai `current`. `ownerOnly: true` → hanya muncul untuk owner.

---

## 5. `apps/dashboard` — konvensi (belum ditegakkan kode)

Kerangka global sudah ada di `app/(dashboard)/layout.tsx` — **jangan diduplikasi di halaman**:

```tsx
<div className="relative min-h-screen bg-glass-page">
  <AmbientOrbs />
  <TabNav role={...} badges={...} userName={...} />
  <main className="relative z-10 max-w-6xl mx-auto p-4 pb-24 md:pb-4">{children}</main>
  <MobileBottomNav role={...} badges={...} userName={...} />
</div>
```

Jadi halaman **hanya mengisi `children`**. Yang harus kamu tulis sendiri (sampai `PageShell` dashboard ada):

```tsx
export default async function ContohPage() {
  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold bg-gradient-to-br from-[#1a1a2e] to-indigo-600 dark:from-white dark:to-[#a5b4fc] bg-clip-text text-transparent">
            Judul Halaman
          </h1>
          <p className="text-[12px] g-t4 mt-1">Kalimat singkat.</p>
        </div>
        {/* aksi opsional di kanan */}
      </div>

      {/* isi halaman */}
    </>
  );
}
```

**Jangan** tulis `<main>`, `TabNav`, `AmbientOrbs`, atau `bg-glass-page` di halaman — semuanya sudah di layout.

### Menambah tab nav dashboard

`apps/dashboard/components/layout/TabNav.tsx`, array `TABS`: `{ href, label, icon, roles[] }`. `roles` menyaring tab per peran user. Badge angka dikirim lewat prop `badges` dari layout (key = `href` tanpa `/`). **Tambahkan tab yang sama ke `MobileBottomNav.tsx`** — dua nav ini terpisah dan tidak otomatis sinkron.

### Kapan pakai `SidebarDrawerShell`

Drawer (bukan nav global) — hanya untuk halaman dengan **panel filter/detail samping** yang perlu disembunyikan di layar kecil. Saat ini dipakai `landing` dan `produk`. Props: `open`, `onOpen`, `onClose`, `children`. Jangan pakai untuk navigasi antar halaman — itu tugas `TabNav`.

### Utang yang sudah diketahui

- 9 dari 11 halaman belum punya judul; `tagihan` masih `<h1>TAGIHAN PAGE LOADED OK</h1>` (placeholder debug yang lolos ke produksi).
- Rencana: bikin `PageShell` dashboard (title wajib) + bungkus semua halaman → **sesi tersendiri**.

---

## 6. Isi halaman (dua app)

- Bungkus blok konten dengan `GlassCard` (`@3pb/ui`) atau `.glass-card`, padding `p-4`.
- Grid dua kolom: `grid md:grid-cols-2 gap-5 items-start`.
- Input: `GlassInput`, atau `className="glass-input"` untuk `<select>`.
- Panel solid (dropdown/modal) **jangan** pakai `glass-card` — terlalu transparan untuk dibaca. Pakai `.modal-surface` (saas) atau setara.
- Copy Bahasa Indonesia. Di saas, nama paket = **"Pro"**; "beli/bayar" hanya untuk aksi.

---

## 7. Checklist sebelum selesai

- [ ] Halaman punya judul (saas: prop `title`; dashboard: blok H1 §5)
- [ ] Tak ada `<main>` / nav / background buatan sendiri
- [ ] `current` (saas) atau tab (dashboard) menunjuk halaman yang benar
- [ ] Hak akses diisi dari sumbernya (`isOwner(...)` / `role`), bukan hardcode
- [ ] Warna teks pakai token `g-t*`
- [ ] Dicoba di light **dan** dark
- [ ] Dashboard: tab baru ditambahkan ke `TabNav` **dan** `MobileBottomNav`

---

## 8. File terkait

| App | File | Isi |
|---|---|---|
| saas | `components/PageShell.tsx` | Kerangka halaman (nav + container + judul) |
| saas | `components/AppHeader.tsx` | Nav island + `TABS` |
| saas | `components/ThemeToggle.tsx` · `AmbientOrbs.tsx` | Toggle 3-state · orb latar |
| saas | `app/globals.css` | `.modal-surface`, `.page-enter`, `.locked-blur` |
| dashboard | `app/(dashboard)/layout.tsx` | Kerangka global |
| dashboard | `components/layout/TabNav.tsx` · `MobileBottomNav.tsx` | Nav desktop · nav mobile |
| dashboard | `components/layout/ControlIsland.tsx` · `SidebarDrawerShell.tsx` | Kontrol kanan · drawer |
| dashboard | `components/ThemeToggle.tsx` · `ui/AmbientOrbs.tsx` | Sumber asli yang di-port ke saas |
| bersama | `packages/ui/src/glass.css` | Token `--g-*`, `.glass-card`, `.bg-glass-page` |
