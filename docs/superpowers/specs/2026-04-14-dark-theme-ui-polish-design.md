# Dark Theme + UI Polish — Design Spec
**Date:** 2026-04-14  
**Scope:** Filament dashboard (SpoolTab, AmsTab, PrinterTab, FilamenTab, modals)

---

## 1. Dark Theme Palette

**Slate Blue-Gray** — konsisten dengan nuansa industrial/teknikal yang cocok untuk app manajemen filament.

| Token | Light | Dark |
|---|---|---|
| Background page | `white` | `slate-900` (#0f172a) |
| Surface / card | `white` / `gray-50` | `slate-800` (#1e293b) |
| Surface elevated | `gray-100` | `slate-700` (#334155) |
| Border | `gray-200` | `slate-700` (#334155) |
| Text primary | `gray-900` | `slate-100` (#f1f5f9) |
| Text secondary | `gray-600` | `slate-400` (#94a3b8) |
| Text muted | `gray-400` | `slate-500` (#64748b) |
| Accent active | `[#EE4D2D]` (Shopee orange) | `indigo-500` (#6366f1) |
| Accent hover | `[#d44226]` | `indigo-400` (#818cf8) |

Status colors tidak berubah — sudah cukup kontras di kedua mode:
- FULL `#4ade80`, MID `#facc15`, LOW `#f97316`, EMPTY `#6b7280`, NEW `#818cf8`

---

## 2. Theme Toggle

**Library:** `next-themes` — handles SSR hydration, system detection, localStorage.

**Behavior:** 3 mode:
- `light` — selalu light
- `system` (default) — ikut OS preference
- `dark` — selalu dark

**Komponen `ThemeToggle`:** 3-button pill di pojok kanan atas header/navbar. Highlight aktif dengan `indigo-500` background. Tersimpan di `localStorage` via next-themes.

**Provider:** Wrap `app/layout.tsx` dengan `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`.

---

## 3. SpoolCard Redesign

**Layout:** Compact horizontal dengan left color strip.

```
┌──┬────────────────────────────────┐
│  │ Jade Green          [🖨] [✏️] │  ← top: nama + icon actions
│6px│ Bambu · PLA Matte              │  ← subtitle
│  │ ████████████████░░░░  950g     │  ← progress bar + berat
│  │                         [FULL] │  ← status badge kanan bawah
└──┴────────────────────────────────┘
```

- Left border 6px = warna filament (inline style)
- Progress bar: tinggi 4px, warna sama dengan filament color, background `slate-700`
- Berat: tampil `{usedWeight}g / {initialWeight}g` kalau data Spoolman ada, atau hanya status badge kalau tidak ada
- Action icons 🖨 ✏️ tetap di pojok kanan atas (kecil, icon only), **tidak** dihapus
- Tap anywhere on card (selain icon buttons) → membuka `SpoolActionSheet`

**`SpoolActionSheet` (bottom sheet modal baru):**
- Muncul dari bawah, overlay `bg-black/60`
- Header: color swatch + nama spool
- Actions:
  - ✏️ Edit info spool → buka SpoolEditModal (existing)
  - 🏷 Print stiker barcode
  - 📡 Link NFC tag → buka NfcLinkModal (existing)
  - ✕ Tutup

---

## 4. Komponen yang Diubah

| Komponen | Perubahan |
|---|---|
| `app/layout.tsx` | Tambah `ThemeProvider` dari next-themes |
| `components/ThemeToggle.tsx` | Komponen baru — 3-way pill toggle |
| `components/filamen/SpoolCard.tsx` | Redesign layout compact + color strip + tap handler |
| `components/filamen/SpoolActionSheet.tsx` | Komponen baru — bottom sheet aksi spool |
| `components/filamen/SpoolTab.tsx` | Pass `onTap` ke SpoolCard, render SpoolActionSheet |
| `components/filamen/FilamenTab.tsx` | Tambah `dark:` classes, render ThemeToggle di header tab |
| `components/filamen/AmsTab.tsx` | Tambah `dark:` classes |
| `components/filamen/AmsVariantRow.tsx` | Tambah `dark:` classes |
| `components/filamen/PrinterTab.tsx` | Tambah `dark:` classes |
| `components/filamen/ScanModal.tsx` | Tambah `dark:` classes |
| `components/filamen/BatchPrintModal.tsx` | Tambah `dark:` classes |
| `components/filamen/NfcLinkModal.tsx` | Tambah `dark:` classes |
| `app/globals.css` | Pastikan `.dark` class dari next-themes compatible |

---

## 5. Data: Progress Bar Berat

Progress bar mengambil data dari `spoolmanSpool` yang sudah ada via join:
- Spool yang punya `SpoolmanSpool` record: tampil `usedWeight` / `initialWeight`
- Spool tanpa record Spoolman: tampil hanya status badge (tidak ada progress bar)

API `GET /api/filamen/spools` perlu include `usedWeight` dan `initialWeight` dari relasi `spoolmanSpool`. Jika belum ada, tambahkan ke response shape.

---

## 6. Out of Scope

- Redesign halaman lain (Shopee analytics, notifikasi, dll) — hanya filament section
- Animasi transisi dark/light mode
- Custom color picker untuk accent color
