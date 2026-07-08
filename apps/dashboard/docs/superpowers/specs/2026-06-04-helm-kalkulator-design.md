# Helm/Topeng Kalkulator Design

## Goal

Extend kalkulator existing untuk mendukung kalkulasi produk helm/topeng 3D printing dengan dua varian: RAW (as-is) dan FINISHING (sanding + painting). Model labor baru memisahkan "buruh" (sanding + assembly) dari "craftsman" (painting) dengan rate berbeda, menggantikan formula lama yang terbukti undervalue effort hingga 6×.

## Architecture

Extend `KalkulasiHarga` existing — tidak ada tabel kalkulasi baru. Formula inti (material + mesin + margin tier + risk buffer + output A/B/C + status) 100% reusable. Tambah 5 field nullable/default ke schema sehingga existing records tidak terpengaruh. `produktType` menjadi switch utama UI untuk progressive disclosure.

## Tech Stack

Prisma (schema extension), TypeScript (formula + types), React (form UI), existing kalkulator infrastructure.

---

## Domain Model

### Dua Jenis Produk

**SIMPLE** — mainan/keychain:
- Alur: cetak → komponen → jual
- Tidak ada perubahan dari kalkulator existing

**HELM** — helm/topeng dengan dua varian:
- **RAW** (as-is): PLA, pasang magnet, tidak ada finishing, customer terima fresh
- **FINISHING**: sanding + painting + assembly, material ABS (gramasi input dari slice PLA intentionally — delta 10–20% berat lebih ringan dianggap sebagai buffer margin)

---

## Labor Model (3 Komponen)

### Sanding (Buruh — Rp35.000/jam)
Repetitif, bisa dioutsource. Scope:
1. Support removal & cleanup
2. Magnet installation
3. Rough sanding 80–120 grit
4. Seam work + putty (area magnet included) + tunggu kering
5. Putty sanding
6. Fine sanding 240–400 grit
7. Primer coat
8. Wet sanding primer 1000+ grit
9. Quality check: guide coat / base coat test reveal

**End:** surface lolos QC, siap diserahkan ke craftsman

### Painting (Craftsman — Rp75.000/jam)
Artistic, owner yang kerjakan. Scope:
1. Base coat
2. Masking / taping
3. Color coats (multi-layer)
4. Detail painting (mata, logo, marking)
5. Clear coat 1–2 lapis

**End:** cat selesai, siap assembly

### Assembly (Buruh — Rp35.000/jam)
Mechanical, dapat dioutsource. Scope:
1. Pasang strap / hardware
2. Foam liner fitting
3. Final QC & inspeksi

**End:** produk jadi, siap kirim

---

## Tier System

4 tier dengan preset jam yang dapat di-override. UI: tombol preset (Minimal / Light / Medium / Heavy) auto-fill jam, angka tetap editable bebas.

| Tier | Sanding default | Painting default | Assembly default |
|---|---|---|---|
| Minimal | 0.5 jam | 0.5 jam | 0.25 jam |
| Light | 1.5 jam | 1.0 jam | 0.5 jam |
| Medium | 2.5 jam | 2.0 jam | 0.75 jam |
| Heavy | 4.0 jam | 3.5 jam | 1.0 jam |

Tier kriteria — berdasarkan karakteristik yang bisa diamati:

**Sanding complexity:**
- Minimal: partial coverage, ≤4 part, permukaan konveks/flat
- Light: full mask/helmet, shape simpel, tidak ada undercut signifikan
- Medium: full helmet, 5–10 part, ada undercut tapi terjangkau
- Heavy: 10+ part, ATAU undercut dalam/texture yang sulit di-sand

**Painting complexity:**
- Minimal: 1 warna, tidak ada masking, tidak ada detail
- Light: 1 warna dengan sedikit detail ATAU 2 warna masking simpel
- Medium: 2 warna masking geometris sederhana ATAU ada detail (logo simpel)
- Heavy: 3+ warna, masking kompleks, ATAU significant detail work

---

## Formula

```typescript
// Labor
const hppLabor = (jamSanding + jamAssembly) * SANDING_RATE    // Rp35.000/jam
               + jamPainting * PAINTING_RATE                    // Rp75.000/jam

// Consumables (dengan UI warning kalau finishType=FINISHING dan nilai = 0)
const hppFinishing = hppLabor + flatFinishingCost

// Total (failure/risk buffer dihitung di atas hppTotal termasuk finishing)
const hppTotal = hppProduksi + hppKomponen + hppFinishing
// floorPrice & output A/B/C dihitung dari hppTotal seperti biasa
```

Rate global dikonfigurasi di `KalkulatorRates`:
```typescript
sandingRatePerJam: number   // default: 35000
paintingRatePerJam: number  // default: 75000
```

### ABS Material
Tidak ada perubahan formula density. User input gramasi dari slice PLA, pilih material ABS di FilamentHarga catalog. Delta berat 10–20% = implicit buffer, disengaja. Perlu entry ABS di `FilamentHarga` table.

### Failure Rate
Sama dengan PLA. Tidak ada perubahan. Risk buffer dihitung di atas `hppTotal` (termasuk finishing) — ini penting agar labor-loss saat rework ter-capture.

---

## Schema Changes (Prisma)

Semua field baru nullable/default — backward-compatible, existing records tidak terpengaruh.

```prisma
// Di model KalkulasiHarga — tambah 5 field:
produktType       String  @default("SIMPLE")   // "SIMPLE" | "HELM"
finishType        String  @default("RAW")       // "RAW" | "FINISHING"
jamSanding        Float   @default(0)
jamPainting       Float   @default(0)
jamAssembly       Float   @default(0)
flatFinishingCost Float   @default(0)           // UI warning kalau FINISHING + 0

// Di KalkulatorRates config — tambah 2 rate:
sandingRatePerJam   Float  @default(35000)
paintingRatePerJam  Float  @default(75000)
```

**Data baru yang perlu diisi:**
- Entry `FilamentHarga` untuk ABS: brand, material="ABS", hargaPerGram

---

## TypeScript Changes

### types.ts
```typescript
export type ProduktType = 'SIMPLE' | 'HELM'
export type FinishType = 'RAW' | 'FINISHING'
export type HelmTier = 'MINIMAL' | 'LIGHT' | 'MEDIUM' | 'HEAVY'

// Extend KalkulasiInput:
produktType?: ProduktType         // default: 'SIMPLE'
finishType?: FinishType           // hanya relevan untuk HELM
jamSanding?: number               // jam sanding + magnet install
jamPainting?: number              // jam painting
jamAssembly?: number              // jam assembly (non-magnet)
flatFinishingCost?: number        // harga cat/primer/consumables flat

// Extend KalkulatorRates:
sandingRatePerJam: number         // default: 35000
paintingRatePerJam: number        // default: 75000
```

### formula.ts
Tambah parameter opsional `helmOptions` ke `hitungKalkulasi`. Kalau null/undefined → perilaku lama, tidak ada breaking change.

---

## UI Changes

### Form Kalkulator

1. **`produktType` selector** di header form (SIMPLE | HELM) — switch utama.

2. **Jika HELM, tampilkan `finishType` toggle** (RAW | FINISHING).

3. **Jika FINISHING, tampilkan 3 section labor** dengan tier preset + editable hours:
   - Section Sanding: tombol [Minimal] [Light] [Medium] [Heavy] + input jam + breakdown Rp real-time
   - Section Painting: sama
   - Section Assembly: sama

4. **`flatFinishingCost` field** dengan warning kalau FINISHING + nilai 0:
   ```
   ⚠️ Produk FINISHING tanpa biaya consumable — apakah sudah di-include?
   ```

5. **Breakdown real-time** saat jam diubah:
   ```
   Sanding  1.5j × Rp35.000 = Rp 52.500
   Painting 2.0j × Rp75.000 = Rp150.000
   Assembly 0.75j × Rp35.000 = Rp 26.250
   Consumables               = Rp 45.000
   ─────────────────────────────────────
   Total Labor & Finishing   = Rp273.750
   ```

6. **Progressive disclosure**: section finishing/labor collapsed ketika produktType=SIMPLE atau finishType=RAW.

---

## Out of Scope

- STL/3MF auto-complexity detection (surface area + part count → suggest tier) — **Backlog**
- Multiple labor rate profiles (misal rate outsource beda per vendor)
- Per-stage finishing breakdown (sanding stage 1, 2, 3 terpisah)
- Rework/repair tracking per kalkulasi
- Partial consumable consumption tracking (ml cat per job)
