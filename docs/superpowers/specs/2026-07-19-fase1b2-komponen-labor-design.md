# Slizebiz — Fase 1b-2: Komponen + Labor Preset & Input Kalkulator Design

**Tanggal:** 2026-07-19 (rev. packing CRUD + labor bundle + panel rincian, 2026-07-19)
**Status:** Disetujui user (mockup companion) — siap `writing-plans`
**Scope:** Tambah **komponen tambahan**, **labor**, dan **packing** ke `apps/saas` Slizebiz — pustaka **preset CRUD** dua-mode di `/settings` (Free lihat read-only+🔒, Beli edit) **+ input kalkulator** (single-plate) + **panel rincian perhitungan** opsional. Melanjutkan pola 1b-1.

**Konteks fase:** 1b (Beli) dipecah — **1b-1 (SELESAI)** setting parametrik dua-mode + storage lokal · **1b-2 (spec ini)** komponen/labor/packing preset + input kalkulator + rincian (single-plate) · **1b-3** multi-plate · **1b-4** save hasil (IndexedDB) + picker "Dari kalkulasi" · **1b-5** PWA/offline · account-linking = track auth terpisah. `capabilities().paidCore = lifetimeOwned || subActive`.

---

## 1. Keputusan (decision log)

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Komponen = **preset CRUD** (Beli tambah/edit/hapus `{nama, harga}`). Free read-only+🔒. | User. Preset kustom bernama. |
| 2 | **Packing = preset CRUD** juga (`{nama, harga}`), BUKAN toggle ukuran tetap S/M/L/XL. Di kalkulator **pilih satu** (single-select) dari daftar. | **Rev user:** orang menamai packing beda-beda (mis. "Box 20×20×15", "Bubble wrap L"). Ukuran tetap terlalu kaku. |
| 3 | **Labor = preset BUNDLE multi-item.** Satu preset (`{nama, items: LaborItem[]}`) berisi banyak baris; klik preset → semua baris auto-terisi & bisa diedit. | **Rev user:** mis. "Mask Medium" = Assembly 0.5j + Sanding 1j + Painting 2j sekaligus. (Pola `LaborPreset.itemsJson` dashboard.) |
| 4 | **Panel rincian perhitungan** (breakdown biaya) di bawah hasil — **opsional**, di-toggle dari **Setting → Tampilan**. Default **OFF**. | **Rev user:** anchor kepercayaan (angka bukan kotak hitam). Data murni turunan hasil (murah). |
| 5 | Toggle "Tampilan · rincian" **editable semua user termasuk Free** (preferensi tampilan, BUKAN kapabilitas berbayar), persist **localStorage** terpisah dari blob paid. | Free pun boleh lihat rincian angkanya sendiri; hindari wrinkle gating (blob paid tetap terkunci). |
| 6 | Storage preset = **perluas blob `LocalSettings`** (IndexedDB, pola 1b-1). Rincian-pref = **localStorage** (`lib/store/display-prefs.ts`). | Preset = setting; display-pref = universal. |
| 7 | Input komponen/labor/packing di kalkulator **terkunci Free** (🔒 + CTA Beli), hanya `paidCore` bisa isi. Panel rincian TIDAK terkunci (semua user). | User. Prinsip funnel; rincian = trust untuk semua. |
| 8 | **Parity Free INVARIANT:** tanpa add-on / Free → `komponen:[]`+`labor:[]` → angka identik 1b-1. `toSettingsV2` TAK berubah (preset bukan bagian SettingsV2). | Tak boleh regresi Free. |
| 9 | Scope = **single-plate**. Multi-plate/batch = 1b-3. | Pecahan kecil bisa dites/deploy sendiri. |

---

## 2. Data model

**`apps/saas/lib/kalkulator/local-settings.ts`** — tambah tipe & field ke `LocalSettings` (field 1b-1 tetap):

```ts
export interface KomponenPreset { id: string; nama: string; harga: number }
export type PackingPreset = KomponenPreset; // struktur sama {id,nama,harga}
export interface LaborItemInput { nama: string; jam?: number; ratePerJam?: number; flat?: number }
export interface LaborPreset { id: string; nama: string; items: LaborItemInput[] }

export interface LocalSettings {
  // ... field 1b-1 TETAP ...
  komponenPresets: KomponenPreset[];
  packingPresets: PackingPreset[];
  laborPresets: LaborPreset[];   // BUNDLE multi-item
}
```

**`DEFAULT_LOCAL_SETTINGS`** tambahan:
```ts
komponenPresets: [
  { id: "kmp-gantungan-kewkew", nama: "Gantungan kew-kew", harga: 900 },
  { id: "kmp-gantungan-ring", nama: "Gantungan ring", harga: 800 },
  { id: "kmp-gantungan-rantai", nama: "Gantungan rantai", harga: 350 },
  { id: "kmp-gantungan-tali", nama: "Gantungan tali", harga: 400 },
  { id: "kmp-switch", nama: "Switch", harga: 2500 },
  { id: "kmp-label", nama: "Label", harga: 750 },
],
packingPresets: [
  { id: "pack-s", nama: "Packing S", harga: 1500 },
  { id: "pack-m", nama: "Packing M", harga: 2500 },
  { id: "pack-l", nama: "Packing L", harga: 5000 },
  { id: "pack-xl", nama: "Packing XL", harga: 8000 },
],
laborPresets: [
  { id: "lbr-mask-minimal", nama: "Mask Minimal", items: [
    { nama: "Assembly", jam: 0.25, ratePerJam: 35000 },
    { nama: "Sanding", jam: 0.5, ratePerJam: 35000 },
    { nama: "Painting", jam: 0.5, ratePerJam: 75000 },
  ] },
  { id: "lbr-mask-medium", nama: "Mask Medium", items: [
    { nama: "Assembly", jam: 0.5, ratePerJam: 35000 },
    { nama: "Sanding", jam: 1, ratePerJam: 35000 },
    { nama: "Painting", jam: 2, ratePerJam: 75000 },
  ] },
  { id: "lbr-mask-heavy", nama: "Mask Heavy", items: [
    { nama: "Assembly", jam: 1, ratePerJam: 35000 },
    { nama: "Sanding", jam: 4, ratePerJam: 35000 },
    { nama: "Painting", jam: 3.5, ratePerJam: 75000 },
  ] },
],
```
(id preset default = string stabil; preset/item baru buatan user pakai `crypto.randomUUID()`.)

**`toSettingsV2(ls)` TAK BERUBAH** — invariant 1b-1 utuh.

**`validateLocalSettings(ls)`** tambah:
- tiap `komponenPresets[i]` & `packingPresets[i]`: `nama` non-kosong, `harga > 0`.
- tiap `laborPresets[i]`: `nama` non-kosong; `items` tak boleh kosong; tiap item `nama` non-kosong, biaya `(jam??0)*(ratePerJam??0)+(flat??0) > 0`, field yang diisi ≥ 0.

**Migrasi blob 1b-1 lama:** `loadSettings` **shallow-merge** default (field baru terisi default bila absen).

**Display-pref (localStorage, `apps/saas/lib/store/display-prefs.ts`):**
```ts
getRincianPref(): boolean          // key "slizebiz-rincian", default false, SSR-safe (typeof window)
setRincianPref(v: boolean): void
```

---

## 3. Compose helper

**`apps/saas/lib/kalkulator/compose.ts`** (isomorphic):
```ts
export interface KomponenRow { id: string; nama: string; harga: number; qty: number }
export interface LaborRow { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }

// packing = SATU item terpilih (atau undefined). Bukan lagi size+rates.
export function composeKomponen(packing: { nama: string; harga: number } | undefined, rows: KomponenRow[]): KomponenItem[];
export function composeLabor(rows: LaborRow[]): LaborItem[];
```
`composeKomponen`: bila `packing && packing.harga > 0` → push `{ nama: packing.nama, harga: packing.harga, qty: 1 }` (pertama); lalu rows (skip nama kosong / harga ≤ 0, qty floor 1). `composeLabor`: rows → `LaborItem[]` (skip nama kosong / biaya ≤ 0).

---

## 4. Input kalkulator & rincian

**`CalcInput`** (compute.ts) tambah opsional: `komponen?: KomponenRow[]`, `labor?: LaborRow[]`, `packing?: { nama: string; harga: number }`.
`buildInputV2`: `komponen: composeKomponen(c.packing, c.komponen ?? [])`, `labor: composeLabor(c.labor ?? [])`. **Parity:** undefined → `[]`.

**`FullView`** tambah `rincian`:
```ts
rincian: {
  produksi: number;        // h.hppProduksi (material+mesin+failure+testlayer)
  komponen: number;        // h.hppKomponen − packingHarga
  packing: number;         // c.packing?.harga ?? 0
  labor: number;           // h.hppLabor
  biayaModal: number;      // h.hppTotal
  hargaJualMinimum: number;// h.floorPrice
  rekomendasi: number;     // off.B
}
```
(Semua di-`Math.round`.)

**`components/KomponenLaborInput.tsx`** (blok kalkulator, locked Free):
- **Packing:** single-select chip dari `settings.packingPresets` (klik lagi = batal) → set `packing = {nama,harga}`.
- **Komponen:** chip preset → append `KomponenRow`; baris editable nama/harga/qty + hapus; "＋ manual".
- **Labor:** chip preset **bundle** → append SEMUA `items` preset sebagai `LaborRow[]`; baris editable nama/jam/rate/flat + hapus; "＋ manual".
- Subtotal komponen & labor.
- **locked=true (Free):** overlay 🔒 + "Buka di Beli", tanpa kontrol aktif.

**`components/RincianPanel.tsx`** (di bawah hasil, non-gated): tampil hanya bila pref `rincian` ON. Baris: Produksi, Komponen, Packing, Labor, = Biaya modal, Harga jual minimum, Rekomendasi. Read-only.

**`Calculator.tsx`:** state `komponen`/`labor`/`packing` + baca `getRincianPref()` on-mount. `addon = paidCore ? {komponen,labor,packing} : {}`; `fullView({...base, ...addon}, settings)`. Render `<KomponenLaborInput locked={!paidCore} …>` + `<RincianPanel>` (bila pref ON). Free/anon → add-on kosong → angka identik.

---

## 5. Panel `/settings`

Tambah ke `SettingsPanel.tsx` (pola 1b-1; Beli editable + Simpan/Reset, Free disabled+🔒 kecuali Tampilan):
- **Komponen** — list `{nama,harga}` CRUD (tambah/edit/hapus).
- **Packing** — list `{nama,harga}` CRUD (sama).
- **Labor** — list **bundle**: tiap preset = nama + daftar item (nama/jam/rate/flat, tambah/hapus item) + tambah/hapus preset.
- **Tampilan** — toggle "Tampilkan rincian perhitungan" (`getRincianPref`/`setRincianPref`). **Selalu enabled** (Free & Beli); on-change langsung persist localStorage (tak perlu tombol Simpan).
Simpan (preset) → `validateLocalSettings` → `saveSettings`. Reset → default.
`loadSettings` shallow-merge (Task store).

---

## 6. Error handling & gating

- IndexedDB gagal → default (1b-1). Merge tak melempar. localStorage absen → pref default `false`.
- Invalid → `validateLocalSettings` tolak Simpan + hint.
- **Free defense:** kalkulator teruskan add-on ke `fullView` HANYA bila `paidCore`; `KomponenLaborInput locked` tak bisa ubah state. Rincian-pref (localStorage) tak memengaruhi angka.
- **Parity Free:** `fullView(c)` == `fullView(c, DEFAULT_LOCAL_SETTINGS)` == angka 1b-1.

---

## 7. Testing (TDD)

- **local-settings:** `toSettingsV2(DEFAULT)` == `defaultSettings` (invariant); DEFAULT punya 6 komponen + 4 packing + 3 labor bundle (tiap bundle ≥1 item); validate tangkap komponen/packing harga≤0 & nama kosong, labor items kosong / item biaya 0.
- **compose:** `composeKomponen(undefined, [])` == `[]`; packing `{nama:"Box",harga:3000}` → `[{nama:"Box",harga:3000,qty:1}]`; skip invalid; `composeLabor` parity + bundle rows.
- **compute:** parity `fullView(c)` == `fullView(c, DEFAULT)`; add-on naikkan biaya persis; `fullView(...).rincian` = breakdown benar (produksi+komponen+packing+labor == biayaModal).
- **display-prefs:** default false; set→get roundtrip (mock localStorage / jsdom).
- **store:** record lama tanpa field baru → merge default.
- **SettingsPanel:** Free → grup Komponen/Packing/Labor disabled+🔒, Tampilan toggle **tetap enabled**; Beli → tambah komponen/packing/labor-item panggil saveSettings; labor bundle bisa tambah item; invalid → tak save + hint.
- **KomponenLaborInput:** locked → 🔒+CTA; unlocked → chip komponen append 1 row, chip labor bundle append N rows (semua item), packing single-select set/clear.
- **RincianPanel:** pref ON → baris breakdown tampil; pref OFF → tak render.
- **Calculator gating:** `paidCore=false` → add-on kosong (angka default); `paidCore=true` → add-on diteruskan.
- Regresi 1a/1b-1/1c hijau.

---

## 8. Batas scope & deploy

| IN (1b-2) | Ditunda |
|---|---|
| Preset komponen/packing/labor(bundle) CRUD dua-mode, input di kalkulator (single-plate), panel rincian + toggle Tampilan, compose→buildInputV2, parity Free, gating | multi-plate/batch (1b-3); save hasil + history + picker (1b-4); PWA (1b-5); account linking; cloud sync |

- **Tanpa perubahan skema Prisma.** Deploy homelab :3300 — **gated**. Tanpa dep baru (`idb` ada; `crypto.randomUUID` native).
- Lanjut `writing-plans`.
