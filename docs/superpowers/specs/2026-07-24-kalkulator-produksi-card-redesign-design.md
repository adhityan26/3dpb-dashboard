# Redesign Card "Produksi (Cetak 3D)" — Dashboard Kalkulator (Part/Plate)

## Latar belakang

Fitur Import 3MF di saas dan `PlateInput.tsx` sudah di-redesign lebih rapi (card wrapper `CalcSection`: avatar icon + judul + subtitle + badge subtotal, per `apps/saas/components/CalcSection.tsx` & `Calculator.tsx`). Dashboard belum punya pola visual ini — form kalkulasi (`KalkulasiForm.tsx` + `PlateTable.tsx`) masih flat, dan mode multi-material sempat dilaporkan "bertumpuk, susah dibaca" (sudah di-fix sebagian sesi sebelumnya, redesign ini melanjutkan/menyempurnakan).

Didesain interaktif via visual companion (9 iterasi mockup, http localhost companion server) — keputusan final di bawah sudah divalidasi user secara visual.

## Scope

**Fase ini**: redesign card "Produksi (Cetak 3D)" di dashboard SAJA — mencakup Nama Kalkulasi, Batch, Margin, dan seluruh area Part/Plate (`PlateTable.tsx`). **Tidak** menyentuh `apps/saas` (worktree ini scoped dashboard + shared package saja, saas dikerjakan sesi terpisah).

**Prinsip kunci (instruksi eksplisit user)**: tidak ada field yang dihapus atau ditambah dari yang sudah ada — murni reposisi & restyle. Satu-satunya elemen visual baru: card wrapper (avatar/judul/subtotal) dan footer ringkasan 3-kolom.

## 1. Shared component baru — `CalcSection` di `@3pb/ui`

Extract dari `apps/saas/components/CalcSection.tsx` (dibaca sebagai referensi, TIDAK diubah — file saas di luar scope worktree ini) ke `packages/ui/src/CalcSection.tsx`.

Perbedaan dari versi saas: `subtotal` diterima sebagai **string sudah terformat** (bukan `number` + import `rupiah` internal — `rupiah` adalah util saas-lokal, `@3pb/ui` tidak boleh coupling ke situ). Props:

```ts
interface CalcSectionProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  subtotalLabel?: string   // default "Subtotal"
  subtotal?: string        // sudah diformat caller, mis. "Rp29.370"
  headerExtra?: ReactNode  // slot kanan-atas tambahan (dashboard pakai ini utk tombol Import 3MF)
  children: ReactNode
}
```

Tidak ada `n` (nomor section) dan `summary`/collapsible state — dashboard cuma punya SATU section (beda dari saas yang punya 4 section collapsible: Produksi/Komponen/Labor/Packing). Selalu expanded, tidak ada toggle collapse.

Styling: `GlassCard` (`@3pb/ui`, sudah ada) + avatar 36×36 `rounded-[5px]` background `color-mix(in srgb, var(--g-accent) 15%, transparent)`, title uppercase 13px bold, subtitle 11px `g-t3`, subtotal badge kanan (border `g-row-border`, label 9px uppercase `g-t4`, value 15px bold tabular-nums).

## 2. Wiring `KalkulasiForm.tsx`

Bungkus **seluruh kolom kiri** (Nama Kalkulasi, Batch+Margin, tombol Import 3MF, area Part/Plate) dalam satu `<CalcSection>`:

```tsx
<CalcSection
  icon="🖨️"
  title="Produksi (Cetak 3D)"
  subtitle="Biaya material dan waktu cetak"
  subtotalLabel="Subtotal per produk"
  subtotal={hasil ? `Rp ${Math.round(hasil.hppProduksi).toLocaleString("id-ID")}` : undefined}
  headerExtra={!isEditing ? <ImportButton /> : undefined}
>
  {/* Nama Kalkulasi, Batch, Margin, PlateTable, error/warning banner import3mf — isi form yang sudah ada, TIDAK berubah */}
</CalcSection>
```

Tombol "📥 Import dari 3MF" pindah ke `headerExtra` (slot kanan-atas card, sejajar badge subtotal) — posisi tombolnya berubah, tapi fungsi/kondisi render (`!isEditing`, disabled saat pending) tidak berubah.

Custom Risk % dan Test Layer toggle (block terpisah, sudah ada) **tetap di luar** `CalcSection` ini — dua toggle itu bukan bagian "Produksi (Cetak 3D)" secara konsep (Custom Risk memengaruhi semua plate+komponen+labor; Test Layer juga bukan plate-spesifik). RincianPanel juga tetap di luar.

## 3. Footer ringkasan 3-kolom (baru)

Ditambah di dalam `CalcSection`, di bawah `PlateTable`:

```
[Biaya per proses cetak]   [Hasil per proses]   [Biaya per produk]
   hppProduksi × batch          batch pcs           hppProduksi
```

Sama persis pola saas (`Calculator.tsx` baris 82-97: `r.produksi * hasil`, `hasil`, `r.produksi`). Grid 3 kolom border `g-row-border`, muncul cuma kalau `computed`/`hasil` tersedia (sama gate seperti elemen hasil lain di form).

## 4. Redesign `PlateTable.tsx`

### 4a. Nama Part — selalu tampil

Saat ini digate `{multiPlate && (...)}` (`PlateTable.tsx:308`) — cuma muncul kalau ada >1 part. **Ubah jadi selalu render**, baik 1 part maupun banyak part. Placeholder tetap "Nama part (opsional)", behavior `updatePlate(plate.key, "namaPart", ...)` tidak berubah.

### 4b. Durasi — posisi disatukan, di ATAS, sebelum material

Saat ini: mode single punya Durasi di dalam grid 4-kolom (Tipe|Gramasi|Durasi|Warna) di atas; mode multi punya Durasi field TERPISAH di BAWAH (setelah list material, komentar kode "Durasi row — still needed in multi mode"). **Unifikasi**: Durasi jadi SATU field mandiri, posisinya SAMA di kedua mode — di atas, sebelum material card, setelah topbar (Nama Part + toggle Multi + tombol hapus plate). Field & handler (`durasiRaw`, `handleDurasiChange`, `formatDurasiDisplay`) tidak berubah, cuma dipindah posisi render + dipakai di kedua mode (bukan duplikasi kode terpisah).

### 4c. Material card — struktur SERAGAM untuk single & multi mode

Baik mode single (1 material, toggle Multi OFF) maupun multi (≥1 material via toggle Multi ON — di kode yang sudah ada, "single" secara teknis = `materials` kosong/`undefined`, pakai field `tipe`/`gramasi`/`hargaPerGram`/`filamentHargaId`/`color` langsung di level plate; "multi" = field `materials: FilamentEntry[]`), tampilan card material dibuat **identik strukturnya**:

**Baris 1**: `FilamentPicker` full-width (`w-full`, bukan `max-w`/`inline-flex` seperti sekarang) — komponen sama, cuma lebar diubah.

**Baris 2, satu baris, 3-4 kolom sejajar** (`flex`):
1. **Profil** — `MaterialProfilePicker` (select), lebar flexible (`flex-1`)
2. **Warna** — `HexColorPicker` swatch + input hex TETAP tampil (bukan disembunyikan — user eksplisit minta hex tetap ada), lebar tetap ~108-120px
3. **Gramasi** — input angka, **lebar 200px** (eksplisit diminta user, muat hingga 10 digit), label "Gramasi" di atasnya (bukan cuma placeholder)
4. **Support + hapus** (checkbox "Sup" + tombol ✕) — **HANYA muncul di mode multi-material** (per-material remove tidak masuk akal di mode single karena cuma ada 1 material, dihapus lewat toggle Multi/hapus plate, bukan tombol per-baris)

**Tipe (FDM/SLA) fallback**: kode sekarang punya 2 pola beda (single = pills selalu tampil di grid4; multi = `<select>` yang cuma render kalau `!m.filamentId`). **Unifikasi**: pola multi yang dipakai — Tipe select HANYA render kalau filament belum dipilih dari katalog (baik mode single maupun multi), diletakkan di baris 1 (sejajar/setelah FilamentPicker) saat kondisi itu terpenuhi. Field `tipe` di data model TIDAK berubah (masih ada, masih dikirim ke `hitungKalkulasiV2` via `resolveInputV2`) — cuma kondisi & posisi elemen UI-nya yang disatukan.

Mode multi tetap: multi material dalam 1 plate = multiple card seperti ini di-render berurutan, ditutup baris "+ Tambah Material" / "Total: Xg" (tidak berubah).

### 4d. Printer — tetap di bawah plate-box, restyle minor

Posisi tidak berubah (di bawah card material, per-plate — dashboard support multi-plate, tiap plate punya printer sendiri). Restyle: label ditambah icon "🖨️ Printer" (konsisten bahasa visual baru), pill button style tidak berubah (functional/logic sama persis).

## Non-scope

- `apps/saas` — tidak disentuh sama sekali (worktree scoped dashboard).
- Tidak ada field baru di data model (`PlateInputApp`, `FilamentEntry`) — murni reposisi UI.
- Tidak ada perubahan formula/kalkulasi HPP.
- Redesign section LAIN di kalkulator (Komponen, Labor, Packing kalau nanti ada; RincianPanel; halaman lain di luar tab Kalkulator) — di luar scope, menyusul kalau diminta ("Fase 2: seluruh app").
