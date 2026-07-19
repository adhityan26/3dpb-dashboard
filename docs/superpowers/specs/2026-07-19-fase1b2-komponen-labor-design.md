# Slizebiz — Fase 1b-2: Komponen + Labor Preset & Input Kalkulator Design

**Tanggal:** 2026-07-19
**Status:** Draft (brainstorming, menunggu review user)
**Scope:** Tambah **komponen tambahan**, **labor**, dan **packing** ke `apps/saas` Slizebiz — pustaka **preset CRUD** dua-mode di `/settings` (Free lihat read-only+🔒, Beli edit) **+ menyambungkannya ke input kalkulator** (chip preset + baris manual, single-plate). Melanjutkan pola 1b-1. **Bukan** implementasi; output = masukan `writing-plans`.

**Konteks fase:** 1b (Beli) dipecah — **1b-1 (SELESAI)** setting parametrik dua-mode + storage lokal · **1b-2 (spec ini)** komponen/labor preset + input kalkulator (single-plate) · **1b-3** multi-plate · **1b-4** save hasil (IndexedDB) + picker "Dari kalkulasi" · **1b-5** PWA/offline · account-linking = track auth terpisah. Payment (1c) sudah flip `lifetimeOwned`; `capabilities().paidCore = lifetimeOwned || subActive`.

---

## 1. Keputusan (decision log)

| # | Keputusan | Alasan |
|---|---|---|
| 1 | Komponen = **preset CRUD penuh** (Beli tambah/edit/hapus preset bernama sendiri). Free lihat read-only+🔒. | Keputusan user 2026-07-19. Dekat dashboard; user butuh preset kustom. |
| 2 | Labor = **preset CRUD penuh** juga, tapi **single-item** (`{nama, jam?, ratePerJam?, flat?}`) — BUKAN bundle multi-item seperti `LaborPreset.itemsJson` dashboard. | Keputusan user (sama spt komponen). Single-item konsisten dg komponen `{nama, harga}`; bundle tier = kompleksitas dashboard yang tak perlu (YAGNI). |
| 3 | Packing = **toggle terpisah** S/M/L/XL di kalkulator; rate-nya 4 angka di setting (`packingRates`). Persis dashboard. | Keputusan user. Packing punya UX khusus (pilih satu ukuran), beda dari komponen bebas. |
| 4 | Storage = **perluas blob `LocalSettings`** yang sama (IndexedDB `slizebiz-local`/store `settings`/keyPath `userId`). Tak ada store/tabel baru. | Pola 1b-1: satu blob per user, `loadSettings/saveSettings` wholesale. Preset = bagian setting. |
| 5 | Input komponen/labor/packing di kalkulator **terkunci untuk Free** (🔒 + CTA "Buka di Beli"), hanya `paidCore` bisa isi. | Keputusan user ("tampil terkunci"). Prinsip funnel "fitur terkunci tetap kelihatan". |
| 6 | **Parity Free INVARIANT dipertahankan:** tanpa add-on / Free → `komponen:[]`+`labor:[]` → angka identik 1b-1/sekarang. Preset hanya pustaka; tak ubah output sampai user menambah baris. | Tak boleh regresi kalkulator Free. Preset di `LocalSettings` tak menyentuh `toSettingsV2` → invariant 1b-1 utuh. |
| 7 | Scope 1b-2 = **single-plate** (satu material, seperti 1b-1). Multi-plate/batch = 1b-3. | Pecahan kecil bisa dites/deploy sendiri. |

---

## 2. Data model — perluas `LocalSettings`

**`apps/saas/lib/kalkulator/local-settings.ts`** — tambah 3 field ke interface `LocalSettings` (field 1b-1 tetap):

```ts
export interface KomponenPreset { id: string; nama: string; harga: number }
export interface LaborPreset { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }
export type PackingSize = "S" | "M" | "L" | "XL";

export interface LocalSettings {
  // ... field 1b-1 (material, mesinPerJam, failureSpreadPct, testLayerPct, margin, resellerBulkMultiplier, channels) TETAP ...
  komponenPresets: KomponenPreset[];
  laborPresets: LaborPreset[];
  packingRates: Record<PackingSize, number>;
}
```

**`DEFAULT_LOCAL_SETTINGS`** — tambahkan:
```ts
komponenPresets: [
  { id: "kmp-gantungan-kewkew", nama: "Gantungan kew-kew", harga: 900 },
  { id: "kmp-gantungan-ring",   nama: "Gantungan ring",    harga: 800 },
  { id: "kmp-gantungan-rantai", nama: "Gantungan rantai",  harga: 350 },
  { id: "kmp-gantungan-tali",   nama: "Gantungan tali",    harga: 400 },
  { id: "kmp-switch",           nama: "Switch",             harga: 2500 },
  { id: "kmp-label",            nama: "Label",              harga: 750 },
],
laborPresets: [
  { id: "lbr-preparer",    nama: "Preparer (sanding + assembly)", jam: 2, ratePerJam: 35000 },
  { id: "lbr-finisher",    nama: "Finisher (painting)",           jam: 2, ratePerJam: 75000 },
  { id: "lbr-consumables", nama: "Consumables finishing",         flat: 55000 },
],
packingRates: { S: 1500, M: 2500, L: 5000, XL: 8000 },
```
(id preset default = string stabil; preset baru buatan user pakai `crypto.randomUUID()`.)

**KRUSIAL — `toSettingsV2(ls)` TIDAK BERUBAH.** Komponen/labor/packing bukan bagian `SettingsV2` (mereka input per-kalkulasi, bukan rates). Jadi `toSettingsV2(DEFAULT_LOCAL_SETTINGS)` tetap deep-equal `defaultSettings` lama — invariant 1b-1 utuh, tak perlu ubah test paritas `toSettingsV2`.

**`validateLocalSettings(ls)`** — tambah aturan (kumpulkan error, kosong = valid):
- tiap `komponenPresets[i]`: `nama` non-kosong (trim), `harga > 0`.
- tiap `laborPresets[i]`: `nama` non-kosong; minimal satu dari (`jam & ratePerJam`) atau `flat` menghasilkan biaya > 0; `jam/ratePerJam/flat` bila diisi ≥ 0.
- tiap `packingRates[size]`: ≥ 0.

**Migrasi blob lama (backward-compat):** user 1b-1 punya record IndexedDB TANPA 3 field ini. `loadSettings` harus **merge dengan default** — field yang hilang diisi dari `DEFAULT_LOCAL_SETTINGS` (lihat §5). Tak ada versioning DB; cukup shallow-merge saat baca.

---

## 3. Compose helper (formula bridge)

**`apps/saas/lib/kalkulator/compose.ts`** (baru, isomorphic, mirror `apps/dashboard/lib/kalkulator/form-v2.ts`):

```ts
import type { KomponenItem, LaborItem } from "@3pb/kalkulator-core";
import type { LocalSettings, PackingSize } from "./local-settings";

export interface KomponenRow { id: string; nama: string; harga: number; qty: number }
export interface LaborRow { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }

export function composeKomponen(
  packing: PackingSize | undefined,
  packingRates: Record<PackingSize, number>,
  rows: KomponenRow[],
): KomponenItem[] {
  const items: KomponenItem[] = [];
  if (packing) items.push({ nama: `Packing ${packing}`, harga: packingRates[packing] ?? 0, qty: 1 });
  for (const r of rows) {
    if (!r.nama.trim() || r.harga <= 0) continue;
    items.push({ nama: r.nama.trim(), harga: r.harga, qty: Math.max(1, r.qty) });
  }
  return items;
}

export function composeLabor(rows: LaborRow[]): LaborItem[] {
  const items: LaborItem[] = [];
  for (const r of rows) {
    const biaya = (r.jam ?? 0) * (r.ratePerJam ?? 0) + (r.flat ?? 0);
    if (!r.nama.trim() || biaya <= 0) continue;
    items.push({ nama: r.nama.trim(), jam: r.jam, ratePerJam: r.ratePerJam, flat: r.flat });
  }
  return items;
}
```
Baris kosong/invalid disaring di sini (packing tanpa pilihan → tak ada row; rows harga≤0 di-skip) — persis pola dashboard, hasil = array `KomponenItem`/`LaborItem` bersih untuk core.

---

## 4. Input kalkulator

**`apps/saas/lib/kalkulator/compute.ts` — perluas `CalcInput` + `buildInputV2`:**
```ts
export interface CalcInput {
  gramasi: number; durasiJam: number; tipe: "FDM" | "SLA";
  hargaAktual?: { channelId: string; harga: number };
  komponen?: KomponenRow[];      // default []
  labor?: LaborRow[];            // default []
  packing?: PackingSize;         // default undefined
}
```
`buildInputV2(c, ls)`: ganti `komponen: []`/`labor: []` hardcoded jadi:
```ts
komponen: composeKomponen(c.packing, ls.packingRates, c.komponen ?? []),
labor: composeLabor(c.labor ?? []),
```
**Parity:** `CalcInput` tanpa komponen/labor/packing (undefined) → `composeKomponen(undefined, _, [])` = `[]`, `composeLabor([])` = `[]` → identik `buildInputV2` 1b-1. Test paritas `fullView(c)` == `fullView(c, DEFAULT_LOCAL_SETTINGS)` tetap hijau.

**`apps/saas/components/Calculator.tsx`:**
- State baru: `komponenRows: KomponenRow[]` (`[]`), `laborRows: LaborRow[]` (`[]`), `packing: PackingSize | undefined`.
- `fullView({ gramasi, durasiJam, tipe, komponen: komponenRows, labor: laborRows, packing }, settings)`.
- Blok baru **"Komponen & Labor"** (komponen `KomponenLaborInput`, lihat bawah). **Hanya `paidCore` yang bisa isi** — Free lihat blok ter-🔒 (§4 gating).
- Free/anon: `komponenRows`/`laborRows`/`packing` tetap kosong (blok terkunci, tak bisa ubah state) → angka Free identik.

**`apps/saas/components/KomponenLaborInput.tsx`** (baru, client):
- Props: `{ locked: boolean; settings: LocalSettings; komponen: KomponenRow[]; labor: LaborRow[]; packing?: PackingSize; onChange: (patch: {komponen?, labor?, packing?}) => void }`.
- **locked (Free):** render ringkas dg overlay 🔒 + teks "Komponen, labor & packing — buka di Beli" + tombol/link ke `/beli`. Tak ada kontrol aktif.
- **unlocked (Beli):**
  - **Packing:** baris tombol toggle S/M/L/XL (klik lagi = batal/none), tampil rate tiap ukuran dari `settings.packingRates`.
  - **Komponen:** chip preset (`+ {nama} ({harga})`) dari `settings.komponenPresets` → klik append `KomponenRow {id: uuid, nama, harga, qty:1}`; tiap row = input nama/harga/qty + hapus (✕); tombol "＋ manual" (row kosong).
  - **Labor:** chip preset dari `settings.laborPresets` → append `LaborRow`; tiap row = nama + jam + ratePerJam + flat + hapus; "＋ manual".
  - Subtotal komponen & labor tampil (Σ) untuk transparansi.

**Hasil kalkulator:** biaya modal/harga jual sudah otomatis termasuk komponen+labor (masuk `hppTotal` & `floorPrice` di formula-v2). Opsional: tampilkan baris "Komponen: RpX · Labor: RpY" di panel hasil (nice-to-have, boleh ditunda).

---

## 5. Panel `/settings` — 3 grup baru

**`apps/saas/components/SettingsPanel.tsx`** — tambah 3 grup (pola `Group`/`NumField` 1b-1; Free `editable=false` → disabled+🔒+CTA, Beli editable+Simpan/Reset):
- **Komponen (preset):** list `komponenPresets` — tiap baris nama+harga+hapus; "＋ Tambah preset". (Beli). Free: baris disabled + 🔒 grup.
- **Labor (preset):** list `laborPresets` — nama+jam+ratePerJam+flat+hapus; "＋ Tambah preset".
- **Packing:** 4 `NumField` S/M/L/XL dari `packingRates`.
Simpan → `validateLocalSettings` (termasuk aturan baru §2) → `saveSettings`. Reset → default (kini termasuk 3 field baru).

**`loadSettings` merge (store):** `apps/saas/lib/store/local-settings.ts` — saat baca record lama, **shallow-merge** field yang hilang dari `DEFAULT_LOCAL_SETTINGS`:
```ts
const rec = await d.get(STORE, userId);
if (!rec?.settings) return DEFAULT_LOCAL_SETTINGS;
return { ...DEFAULT_LOCAL_SETTINGS, ...rec.settings };  // field baru (komponenPresets dll) terisi default bila absen
```
(Jaga urutan: `DEFAULT` dulu, record menimpa — user yg pernah simpan 1b-1 tetap dapat preset default tanpa error.)

---

## 6. Error handling & gating

- **IndexedDB absen/gagal:** `loadSettings` → default (sudah 1b-1). Merge di §5 tak melempar.
- **Nilai invalid:** `validateLocalSettings` tolak Simpan + hint (grup mana).
- **Free defense (dua lapis):** (a) kalkulator hanya kirim komponen/labor/packing ke `buildInputV2` bila `paidCore` — `KomponenLaborInput locked` tak bisa ubah state; (b) meski Free mengakali IndexedDB isi preset & entah bagaimana isi rows, `Calculator` hanya meneruskan rows saat `paidCore` (guard di komponen: kalau `!paidCore`, paksa `komponen:[] labor:[] packing:undefined` ke `fullView`). Angka Free selalu default.
- **Parity Free:** `fullView(c)` == `fullView(c, DEFAULT_LOCAL_SETTINGS)` == angka 1b-1.

---

## 7. Testing (TDD)

- **`local-settings.test.ts`:** `toSettingsV2(DEFAULT_LOCAL_SETTINGS)` **masih** == `defaultSettings` (invariant 1b-1 tak putus walau field baru); `validateLocalSettings` tangkap preset harga≤0/nama kosong, labor biaya≤0, packing<0; DEFAULT punya 6 komponen + 3 labor + packing 4 angka.
- **`compose.test.ts`:** `composeKomponen(undefined, rates, [])` == `[]` (parity); packing "M" → `[{nama:"Packing M", harga:2500, qty:1}]`; rows harga≤0 di-skip; qty di-floor ke 1. `composeLabor([])` == `[]`; row jam×rate+flat>0 lolos, biaya 0 di-skip.
- **`compute.test.ts`:** parity `fullView(c)` == `fullView(c, DEFAULT_LOCAL_SETTINGS)` (tanpa komponen/labor); `fullView({...c, packing:"M", komponen:[{...}], labor:[{...}]}, ls)` → biayaModal & floor **naik** persis Σ komponen+labor (banding vs tanpa add-on); FDM vs SLA tetap dari material.
- **`store/local-settings.test.ts`** (fake-indexeddb): record lama tanpa `komponenPresets` → `loadSettings` merge → punya preset default (tak throw); roundtrip preset baru; reset → default (dg field baru).
- **`SettingsPanel`** (jsdom): Free → grup Komponen/Labor/Packing disabled + 🔒 + CTA; Beli → tambah preset panggil `saveSettings` dg preset baru; invalid (harga 0) → tak save + hint.
- **`KomponenLaborInput`** (jsdom): locked → 🔒 + CTA, tak ada input aktif; unlocked → klik chip preset menambah row; toggle packing set/clear.
- **`Calculator` gating:** `paidCore=false` → walau state di-set, `fullView` dipanggil dg komponen/labor kosong (angka default); `paidCore=true` → rows diteruskan, angka berubah.
- Regresi 1a/1b-1/1c existing tetap hijau.

---

## 8. Batas scope & deploy

| IN (1b-2) | Ditunda |
|---|---|
| Preset komponen & labor CRUD (dua-mode `/settings`), packing toggle+rates, input komponen/labor/packing di kalkulator (single-plate), compose→buildInputV2, parity Free, gating Free terkunci | **multi-plate/batch** (1b-3); **save hasil + history + picker "Dari kalkulasi"** (1b-4); **PWA/offline** (1b-5); account linking; cloud sync (Subscribe); baris rincian komponen/labor di RincianPanel (SaaS belum punya RincianPanel) |

- **Tanpa perubahan skema Prisma** (murni client IndexedDB). Deploy homelab :3300 (`bash apps/saas/deploy.sh`) — **gated** (izin user). Tak ada dep baru (idb sudah ada dari 1b-1; `crypto.randomUUID` native browser).
- **Di luar scope:** implementasi kode — spec berhenti di desain; lanjut `writing-plans`.
