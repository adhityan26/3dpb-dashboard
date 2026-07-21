# Pedoman Layout Halaman — `apps/saas` (Slizebiz)

Tujuan: **setiap halaman baru seragam tanpa perlu menebak.** Semua keputusan layout sudah dibungkus komponen; tugasmu cuma mengisi prop yang benar.

Design system: **Glass UI 3DPB** (Deep Space dark + Liquid Glass light, aksen indigo `#6366f1`). Skill: `glass-ui-theme`.

---

## 1. Aturan pokok

> **Setiap halaman ber-auth WAJIB dibungkus `PageShell`. Jangan pernah menulis `<main>`, header, atau `<h1>` sendiri.**

Kenapa: sebelum ini tiap halaman menulis containernya sendiri dengan lebar berbeda (`max-w-3xl` / `max-w-xl` / `max-w-md`) sehingga header ikut bergeser saat pindah halaman, dan sebagian halaman lupa judul sehingga terasa menggantung. Sekarang kerangkanya satu sumber.

**Pengecualian:** halaman pra-auth (`/login`) sengaja di luar `PageShell` — tak punya nav, kartu sempit terpusat.

---

## 2. Pemakaian

```tsx
import { PageShell } from "@/components/PageShell";

export default async function ContohPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <PageShell
      title="Judul Halaman"                    // WAJIB
      description="Kalimat singkat."           // opsional
      current="kalkulator"                     // tab yang di-highlight
      owner={isOwner(session.user.email)}      // tampilkan tab Admin
      userLabel={session.user.email ?? undefined}  // avatar inisial
      actions={<GlassButton>Aksi</GlassButton>}    // opsional, kanan judul
      narrow                                    // opsional: persempit KONTEN
    >
      {/* isi halaman */}
    </PageShell>
  );
}
```

### Prop

| Prop | Wajib | Fungsi |
|---|---|---|
| `title` | ✅ | H1 gradient. TypeScript menolak halaman tanpa judul — itu disengaja. |
| `description` | — | Kalimat pendukung di bawah judul (`g-t4`, 12px). |
| `actions` | — | Tombol/link di kanan judul. |
| `current` | — | `"kalkulator" \| "setting" \| "admin" \| "beli"` — menandai tab aktif (`aria-current="page"`). |
| `owner` | — | `true` → tab **Admin** muncul. Selalu isi dari `isOwner(session.user.email)`, jangan hardcode kecuali halaman itu memang owner-only. |
| `userLabel` | — | Sumber inisial avatar. Biasanya email user. |
| `narrow` | — | Mempersempit **konten** ke `max-w-md` (mis. checkout). **Tidak** mengubah lebar nav/container. |
| `authenticated` | — | Default `true`. `false` → nav tanpa tab & kontrol. |

---

## 3. Yang sudah diurus kerangka (jangan diulang)

- **Nav island** melebar penuh & sticky: logo → pill tab → control island (theme toggle, avatar, ⏻ keluar).
- **Container konten** `max-w-3xl mx-auto px-6 pt-6 pb-16` — **sama di semua halaman**.
- **Blok judul**: H1 gradient + description + actions, jarak `mb-5`.
- **Animasi masuk** `page-enter` (fadeSlide 0.3s).
- **Background** `.bg-glass-page` + `AmbientOrbs` (dark-only) — dipasang di `app/layout.tsx`, bukan per halaman.
- **Tema** light/system/dark via `next-themes` (`attribute="class"`, default `system`).

---

## 4. Menambah modul baru ke nav

Nav adalah peta produk. Modul yang belum jadi **tampil tapi tidak dilinkkan** (badge `soon`) — supaya tak ada nav buntu.

Di `apps/saas/components/AppHeader.tsx`, array `TABS`:

```ts
{ key: "invoice", icon: "🧾", label: "Invoice", soon: true },   // belum jadi
{ key: "invoice", href: "/invoice", icon: "🧾", label: "Invoice" },  // sudah jadi
```

Saat modulnya jadi: **tambahkan `href`, hapus `soon`**, lalu tambahkan `key`-nya ke tipe `NavKey` supaya bisa dipakai sebagai `current`.

`ownerOnly: true` → tab hanya muncul kalau `owner`.

---

## 5. Isi halaman

- Bungkus blok konten dengan `GlassCard` (dari `@3pb/ui`), padding `p-4`.
- Grid dua kolom: `className="grid md:grid-cols-2 gap-5 items-start"`.
- Teks: `g-t1` (utama) → `g-t5` (paling redup). Jangan hardcode warna teks — token ini otomatis ikut light/dark.
- Input: `GlassInput`, atau `className="glass-input"` untuk `<select>`.
- Fitur terkunci: tampilkan dengan 🔒 + CTA ke `/beli` — **jangan disembunyikan** (prinsip funnel: fitur terkunci tetap kelihatan). Nama paket di copy = **"Pro"**; "beli/bayar" hanya untuk aksi.

---

## 6. Cek sebelum selesai

- [ ] Halaman dibungkus `PageShell` dengan `title` terisi
- [ ] `current` menunjuk tab yang benar
- [ ] `owner` diisi dari `isOwner(...)`, bukan hardcode
- [ ] Tak ada `<main>` / `<h1>` / header buatan sendiri
- [ ] Warna teks pakai token `g-t*`, bukan hex
- [ ] Dicoba di light **dan** dark

---

## 7. File terkait

| File | Isi |
|---|---|
| `apps/saas/components/PageShell.tsx` | Kerangka halaman (nav + container + blok judul) |
| `apps/saas/components/AppHeader.tsx` | Nav island + daftar `TABS` |
| `apps/saas/components/ThemeToggle.tsx` | Toggle 3-state light/system/dark |
| `apps/saas/components/AmbientOrbs.tsx` | Orb latar (dark-only) |
| `packages/ui/src/glass.css` | Token `--g-*`, `.glass-card`, `.bg-glass-page` |
| `apps/saas/app/globals.css` | `.modal-surface`, `.page-enter`, `.locked-blur` |
