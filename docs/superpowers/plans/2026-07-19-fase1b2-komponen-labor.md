# Fase 1b-2: Komponen + Labor Preset & Input Kalkulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah komponen/packing/labor (preset CRUD dua-mode + input kalkulator single-plate) dan panel rincian perhitungan opsional ke `apps/saas` Slizebiz, tanpa meregresi angka Free.

**Architecture:** Perluas blob `LocalSettings` (IndexedDB) dengan `komponenPresets`/`packingPresets`/`laborPresets` (labor = bundle multi-item). Helper `compose.ts` ubah baris input jadi `KomponenItem[]`/`LaborItem[]` untuk `hitungKalkulasiV2`. Packing = pilih-satu preset. Rincian breakdown dari field hasil core, di-toggle lewat pref localStorage (universal, non-gated). Kalkulator teruskan add-on hanya bila `paidCore`; Free/tanpa add-on → array kosong → angka identik 1b-1.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@3pb/kalkulator-core`, `idb`, vitest + jsdom + `@testing-library/react`.

## Global Constraints

- **Node 22 wajib** — prefix tiap shell command: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.
- **Parity Free INVARIANT:** `fullView(c)` === `fullView(c, DEFAULT_LOCAL_SETTINGS)` === angka 1b-1. `toSettingsV2(DEFAULT_LOCAL_SETTINGS)` tetap deep-equal `defaultSettings` (JANGAN ubah `toSettingsV2`). Tanpa add-on → `komponen:[]`+`labor:[]`.
- **Free defense:** kalkulator teruskan komponen/labor/packing ke `fullView` HANYA bila `paidCore` (prop server-auth). `!paidCore` → paksa kosong. Toggle rincian TIDAK memengaruhi angka.
- **Item shape core (verbatim):** `KomponenItem = { nama: string; harga: number; qty: number }`; `LaborItem = { nama: string; jam?: number; ratePerJam?: number; flat?: number }`. Biaya komponen `Σ harga×qty`; labor `Σ (jam??0)×(ratePerJam??0)+(flat??0)`.
- **`HasilKalkulasiV2` breakdown tersedia:** `hppProduksi`, `hppKomponen`, `hppLabor`, `hppTotal`, `floorPrice` (dipakai panel rincian).
- **Packing = pilih-SATU** preset di kalkulator (bukan multi). **Labor preset = BUNDLE**: klik → append semua item.
- **Tanpa perubahan Prisma. Tanpa dep baru** (`idb` ada; id baru `crypto.randomUUID()`).
- **Bahasa Indonesia** semua copy UI.
- Deploy homelab :3300 = **GATED** (jangan deploy tanpa perintah user).

---

### Task 1: LocalSettings — preset komponen/packing + labor bundle

**Files:**
- Modify: `apps/saas/lib/kalkulator/local-settings.ts`
- Test: `apps/saas/lib/kalkulator/local-settings.test.ts`

**Interfaces:**
- Produces: `KomponenPreset {id,nama,harga}`, `PackingPreset = KomponenPreset`, `LaborItemInput {nama,jam?,ratePerJam?,flat?}`, `LaborPreset {id,nama,items:LaborItemInput[]}`; `LocalSettings` gains `komponenPresets`, `packingPresets`, `laborPresets`; `DEFAULT_LOCAL_SETTINGS` seeded; `validateLocalSettings` extended.

- [ ] **Step 1: Write failing tests** — append to `apps/saas/lib/kalkulator/local-settings.test.ts`:

```ts
describe("1b-2 preset komponen/packing/labor-bundle", () => {
  it("toSettingsV2 tetap paritas (invariant 1b-1)", () => {
    expect(toSettingsV2(DEFAULT_LOCAL_SETTINGS)).toEqual(defaultSettings);
  });
  it("DEFAULT: 6 komponen, 4 packing, 3 labor bundle (tiap bundle punya item)", () => {
    expect(DEFAULT_LOCAL_SETTINGS.komponenPresets).toHaveLength(6);
    expect(DEFAULT_LOCAL_SETTINGS.packingPresets).toHaveLength(4);
    expect(DEFAULT_LOCAL_SETTINGS.laborPresets).toHaveLength(3);
    expect(DEFAULT_LOCAL_SETTINGS.laborPresets[1]).toMatchObject({ nama: "Mask Medium" });
    expect(DEFAULT_LOCAL_SETTINGS.laborPresets[1].items).toHaveLength(3);
    expect(DEFAULT_LOCAL_SETTINGS.packingPresets[0]).toMatchObject({ nama: "Packing S", harga: 1500 });
  });
  it("DEFAULT valid", () => { expect(validateLocalSettings(DEFAULT_LOCAL_SETTINGS)).toEqual([]); });
  it("validate tangkap komponen/packing invalid", () => {
    const bad = structuredClone(DEFAULT_LOCAL_SETTINGS);
    bad.komponenPresets[0].harga = 0;
    bad.packingPresets[0].nama = "  ";
    const e = validateLocalSettings(bad);
    expect(e.some((x) => /komponen/i.test(x))).toBe(true);
    expect(e.some((x) => /packing/i.test(x))).toBe(true);
  });
  it("validate tangkap labor bundle kosong item & item biaya 0", () => {
    const bad = structuredClone(DEFAULT_LOCAL_SETTINGS);
    bad.laborPresets[0].items = [];
    bad.laborPresets[1].items[0] = { nama: "Nol", jam: 0, ratePerJam: 0, flat: 0 };
    const e = validateLocalSettings(bad);
    expect(e.filter((x) => /labor/i.test(x)).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/local-settings.test.ts`
Expected: FAIL (`komponenPresets` undefined).

- [ ] **Step 3: Implement** — edit `apps/saas/lib/kalkulator/local-settings.ts`.

Add after imports:
```ts
export interface KomponenPreset { id: string; nama: string; harga: number }
export type PackingPreset = KomponenPreset;
export interface LaborItemInput { nama: string; jam?: number; ratePerJam?: number; flat?: number }
export interface LaborPreset { id: string; nama: string; items: LaborItemInput[] }
```

Add to `LocalSettings` interface (after `channels`):
```ts
  komponenPresets: KomponenPreset[];
  packingPresets: PackingPreset[];
  laborPresets: LaborPreset[];
```

Add to `DEFAULT_LOCAL_SETTINGS` (after `channels: {...}`):
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

Extend `validateLocalSettings` — insert before `return errs;`:
```ts
  const checkPresetList = (list: KomponenPreset[], label: string) =>
    list.forEach((k, i) => {
      if (!k.nama.trim()) errs.push(`${label} #${i + 1} nama kosong`);
      if (!(k.harga > 0)) errs.push(`${label} "${k.nama || i + 1}" harga harus > 0`);
    });
  checkPresetList(ls.komponenPresets, "Komponen");
  checkPresetList(ls.packingPresets, "Packing");
  ls.laborPresets.forEach((p, i) => {
    if (!p.nama.trim()) errs.push(`Labor #${i + 1} nama kosong`);
    if (p.items.length === 0) errs.push(`Labor "${p.nama || i + 1}" harus punya item`);
    p.items.forEach((it, j) => {
      if (!it.nama.trim()) errs.push(`Labor "${p.nama}" item #${j + 1} nama kosong`);
      for (const [f, v] of [["jam", it.jam], ["rate", it.ratePerJam], ["flat", it.flat]] as const) {
        if (v != null && v < 0) errs.push(`Labor "${p.nama}" ${f} negatif`);
      }
      const biaya = (it.jam ?? 0) * (it.ratePerJam ?? 0) + (it.flat ?? 0);
      if (!(biaya > 0)) errs.push(`Labor "${p.nama}" item "${it.nama || j + 1}" biaya harus > 0`);
    });
  });
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/local-settings.test.ts`
Expected: PASS (incl. 1b-1 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/local-settings.ts apps/saas/lib/kalkulator/local-settings.test.ts
git commit -m "feat(saas): preset komponen/packing + labor bundle di LocalSettings (invariant, TDD)"
```

---

### Task 2: compose.ts — rows → KomponenItem[]/LaborItem[]

**Files:**
- Create: `apps/saas/lib/kalkulator/compose.ts`
- Test: `apps/saas/lib/kalkulator/compose.test.ts`

**Interfaces:**
- Produces: `KomponenRow {id,nama,harga,qty}`, `LaborRow {id,nama,jam?,ratePerJam?,flat?}`; `composeKomponen(packing: {nama,harga}|undefined, rows): KomponenItem[]`; `composeLabor(rows): LaborItem[]`.

- [ ] **Step 1: Write failing test** — create `apps/saas/lib/kalkulator/compose.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeKomponen, composeLabor, type KomponenRow, type LaborRow } from "./compose";

const krow = (o: Partial<KomponenRow>): KomponenRow => ({ id: "1", nama: "X", harga: 100, qty: 1, ...o });
const lrow = (o: Partial<LaborRow>): LaborRow => ({ id: "1", nama: "L", ...o });

describe("composeKomponen", () => {
  it("tanpa packing & rows → [] (parity)", () => expect(composeKomponen(undefined, [])).toEqual([]));
  it("packing terpilih → satu row pertama", () => {
    expect(composeKomponen({ nama: "Box 20x20", harga: 3000 }, [])).toEqual([{ nama: "Box 20x20", harga: 3000, qty: 1 }]);
  });
  it("packing harga 0 diabaikan", () => expect(composeKomponen({ nama: "Gratis", harga: 0 }, [])).toEqual([]));
  it("skip nama kosong / harga<=0, floor qty, trim, packing dulu", () => {
    const out = composeKomponen({ nama: "Box", harga: 3000 }, [
      krow({ nama: "  ", harga: 100 }), krow({ nama: "Baut", harga: 0 }), krow({ nama: " Mur ", harga: 300, qty: 0 }),
    ]);
    expect(out).toEqual([{ nama: "Box", harga: 3000, qty: 1 }, { nama: "Mur", harga: 300, qty: 1 }]);
  });
});
describe("composeLabor", () => {
  it("[] → [] (parity)", () => expect(composeLabor([])).toEqual([]));
  it("jam×rate lolos; biaya 0 & nama kosong skip", () => {
    expect(composeLabor([lrow({ nama: "Cat", jam: 2, ratePerJam: 75000 }), lrow({ nama: "Nol" }), lrow({ nama: " ", flat: 5000 })]))
      .toEqual([{ nama: "Cat", jam: 2, ratePerJam: 75000, flat: undefined }]);
  });
  it("flat-only lolos", () => expect(composeLabor([lrow({ nama: "C", flat: 55000 })])).toEqual([{ nama: "C", jam: undefined, ratePerJam: undefined, flat: 55000 }]));
});
```

- [ ] **Step 2: Run to verify fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compose.test.ts`
Expected: FAIL (`./compose` not found).

- [ ] **Step 3: Implement** — create `apps/saas/lib/kalkulator/compose.ts`:

```ts
import type { KomponenItem, LaborItem } from "@3pb/kalkulator-core";

export interface KomponenRow { id: string; nama: string; harga: number; qty: number }
export interface LaborRow { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }

export function composeKomponen(packing: { nama: string; harga: number } | undefined, rows: KomponenRow[]): KomponenItem[] {
  const items: KomponenItem[] = [];
  if (packing && packing.harga > 0) items.push({ nama: packing.nama.trim() || "Packing", harga: packing.harga, qty: 1 });
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

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/compose.ts apps/saas/lib/kalkulator/compose.test.ts
git commit -m "feat(saas): compose komponen(packing single)/labor rows → items (TDD)"
```

---

### Task 3: compute.ts — CalcInput add-on + fullView.rincian

**Files:**
- Modify: `apps/saas/lib/kalkulator/compute.ts`
- Test: `apps/saas/lib/kalkulator/compute.test.ts` (append)

**Interfaces:**
- Consumes: `composeKomponen`/`composeLabor`/`KomponenRow`/`LaborRow` (Task 2).
- Produces: `CalcInput` gains `komponen?`, `labor?`, `packing?: {nama,harga}`. `FullView` gains `rincian: {produksi,komponen,packing,labor,biayaModal,hargaJualMinimum,rekomendasi}`. Signatures otherwise unchanged.

- [ ] **Step 1: Write failing test** — append to `apps/saas/lib/kalkulator/compute.test.ts` (add `import { DEFAULT_LOCAL_SETTINGS } from "./local-settings";` at top if absent):

```ts
describe("1b-2 add-on + rincian", () => {
  const base = { gramasi: 50, durasiJam: 3, tipe: "FDM" as const };
  it("tanpa add-on → parity (invariant)", () => {
    expect(fullView(base)).toEqual(fullView({ ...base }, DEFAULT_LOCAL_SETTINGS));
  });
  it("komponen naikkan biaya modal & floor persis", () => {
    const a = fullView(base);
    const b = fullView({ ...base, komponen: [{ id: "1", nama: "Baut", harga: 1000, qty: 2 }] }, DEFAULT_LOCAL_SETTINGS);
    expect(b.biayaModal - a.biayaModal).toBe(2000);
    expect(b.hargaJualMinimum - a.hargaJualMinimum).toBe(2000);
  });
  it("labor + packing naikkan biaya modal", () => {
    const a = fullView(base);
    const b = fullView({ ...base, labor: [{ id: "1", nama: "Cat", jam: 1, ratePerJam: 10000 }], packing: { nama: "Box", harga: 2500 } }, DEFAULT_LOCAL_SETTINGS);
    expect(b.biayaModal - a.biayaModal).toBe(12500);
  });
  it("rincian: produksi+komponen+packing+labor == biayaModal", () => {
    const v = fullView({ ...base, komponen: [{ id: "1", nama: "Baut", harga: 1000, qty: 1 }], labor: [{ id: "2", nama: "Cat", flat: 5000 }], packing: { nama: "Box", harga: 2500 } }, DEFAULT_LOCAL_SETTINGS);
    expect(v.rincian.packing).toBe(2500);
    expect(v.rincian.komponen).toBe(1000);
    expect(v.rincian.labor).toBe(5000);
    expect(v.rincian.produksi + v.rincian.komponen + v.rincian.packing + v.rincian.labor).toBe(v.rincian.biayaModal);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compute.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — edit `apps/saas/lib/kalkulator/compute.ts`.

Add imports:
```ts
import { composeKomponen, composeLabor, type KomponenRow, type LaborRow } from "./compose";
```

Extend `CalcInput`:
```ts
export interface CalcInput {
  gramasi: number;
  durasiJam: number;
  tipe: "FDM" | "SLA";
  hargaAktual?: { channelId: string; harga: number };
  komponen?: KomponenRow[];
  labor?: LaborRow[];
  packing?: { nama: string; harga: number };
}
```

In `buildInputV2`, replace `komponen: [],` and `labor: [],` with:
```ts
    komponen: composeKomponen(c.packing, c.komponen ?? []),
    labor: composeLabor(c.labor ?? []),
```

Add `rincian` to the `FullView` interface:
```ts
  rincian: {
    produksi: number; komponen: number; packing: number; labor: number;
    biayaModal: number; hargaJualMinimum: number; rekomendasi: number;
  };
```

In `fullView`, before `return {`, add:
```ts
  const packingHarga = c.packing?.harga ?? 0;
```
Add to the returned object (after `status: h.status,`):
```ts
    rincian: {
      produksi: r(h.hppProduksi),
      komponen: r(h.hppKomponen - packingHarga),
      packing: r(packingHarga),
      labor: r(h.hppLabor),
      biayaModal: r(h.hppTotal),
      hargaJualMinimum: r(h.floorPrice),
      rekomendasi: r(off.B),
    },
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compute.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/compute.ts apps/saas/lib/kalkulator/compute.test.ts
git commit -m "feat(saas): buildInputV2 add-on + fullView.rincian breakdown (parity, TDD)"
```

---

### Task 4: store loadSettings — shallow-merge default (migrasi blob 1b-1)

**Files:**
- Modify: `apps/saas/lib/store/local-settings.ts`
- Test: `apps/saas/lib/store/local-settings.test.ts` (append)

- [ ] **Step 1: Write failing test** — append:

```ts
it("record lama tanpa preset baru → merge default (tak throw)", async () => {
  const legacy = { ...DEFAULT_LOCAL_SETTINGS } as Record<string, unknown>;
  delete legacy.komponenPresets; delete legacy.packingPresets; delete legacy.laborPresets;
  await saveSettings("u-legacy", legacy as unknown as import("@/lib/kalkulator/local-settings").LocalSettings);
  const loaded = await loadSettings("u-legacy");
  expect(loaded.komponenPresets).toHaveLength(6);
  expect(loaded.packingPresets).toHaveLength(4);
  expect(loaded.laborPresets).toHaveLength(3);
  expect(loaded.mesinPerJam).toBe(DEFAULT_LOCAL_SETTINGS.mesinPerJam);
});
```

(Add `import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";` if absent.)

- [ ] **Step 2: Run to verify fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/store/local-settings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `loadSettings`, replace `return rec?.settings ?? DEFAULT_LOCAL_SETTINGS;` with:
```ts
    if (!rec?.settings) return DEFAULT_LOCAL_SETTINGS;
    return { ...DEFAULT_LOCAL_SETTINGS, ...rec.settings };
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/store/local-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/store/local-settings.ts apps/saas/lib/store/local-settings.test.ts
git commit -m "feat(saas): loadSettings shallow-merge default (migrasi blob 1b-1, TDD)"
```

---

### Task 5: display-prefs.ts — toggle rincian (localStorage)

**Files:**
- Create: `apps/saas/lib/store/display-prefs.ts`
- Test: `apps/saas/lib/store/display-prefs.test.ts`

**Interfaces:**
- Produces: `getRincianPref(): boolean` (default false, SSR-safe), `setRincianPref(v: boolean): void`.

- [ ] **Step 1: Write failing test** — create `apps/saas/lib/store/display-prefs.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { getRincianPref, setRincianPref } from "./display-prefs";

beforeEach(() => window.localStorage.clear());

describe("display-prefs rincian", () => {
  it("default false", () => expect(getRincianPref()).toBe(false));
  it("set true → get true", () => { setRincianPref(true); expect(getRincianPref()).toBe(true); });
  it("set false → get false", () => { setRincianPref(true); setRincianPref(false); expect(getRincianPref()).toBe(false); });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/store/display-prefs.test.ts`
Expected: FAIL (`./display-prefs` not found).

- [ ] **Step 3: Implement** — create `apps/saas/lib/store/display-prefs.ts`:

```ts
const KEY = "slizebiz-rincian";

export function getRincianPref(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function setRincianPref(v: boolean): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* noop */ }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/store/display-prefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/store/display-prefs.ts apps/saas/lib/store/display-prefs.test.ts
git commit -m "feat(saas): display-prefs rincian toggle (localStorage, TDD)"
```

---

### Task 6: SettingsPanel — grup Komponen + Packing (CRUD) + Tampilan

**Files:**
- Modify: `apps/saas/components/SettingsPanel.tsx`
- Test: `apps/saas/components/settings-panel.test.tsx` (append; create if absent)

**Interfaces:**
- Consumes: `KomponenPreset` (Task 1), `getRincianPref`/`setRincianPref` (Task 5), existing `NumField`/`Group`/`saveSettings`.
- Produces: Komponen & Packing CRUD groups; Tampilan toggle (always enabled). (Labor group = Task 7.)

- [ ] **Step 1: Write failing test** — append to (or create) `apps/saas/components/settings-panel.test.tsx`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsPanel } from "./SettingsPanel";

const saveMock = vi.fn();
vi.mock("@/lib/store/local-settings", () => ({
  loadSettings: vi.fn(async () => (await import("@/lib/kalkulator/local-settings")).DEFAULT_LOCAL_SETTINGS),
  saveSettings: (...a: unknown[]) => saveMock(...a),
  resetSettings: vi.fn(),
}));

beforeEach(() => { saveMock.mockReset(); saveMock.mockResolvedValue(undefined); window.localStorage.clear(); });

describe("SettingsPanel 1b-2 komponen/packing/tampilan", () => {
  it("Free → grup Komponen & Packing terkunci; Tampilan toggle TETAP enabled", () => {
    render(<SettingsPanel editable={false} userId={null} />);
    expect((screen.getByDisplayValue("Gantungan kew-kew") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByDisplayValue("Packing S") as HTMLInputElement).disabled).toBe(true);
    const toggle = screen.getByLabelText(/rincian perhitungan/i) as HTMLInputElement;
    expect(toggle.disabled).toBe(false);
  });
  it("Tampilan toggle persist ke localStorage segera", () => {
    render(<SettingsPanel editable={false} userId={null} />);
    fireEvent.click(screen.getByLabelText(/rincian perhitungan/i));
    expect(window.localStorage.getItem("slizebiz-rincian")).toBe("1");
  });
  it("Beli → tambah packing lalu Simpan meneruskan packing baru", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    await waitFor(() => expect(screen.getByDisplayValue("Packing XL")).toBeTruthy());
    fireEvent.click(screen.getByText(/Tambah packing/i));
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(saveMock.mock.calls[0][1].packingPresets.length).toBe(5);
  });
  it("Beli → komponen harga 0 → tak Simpan + hint", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    await waitFor(() => expect(screen.getByDisplayValue("900")).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue("900"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(screen.getByText(/harga harus > 0/i)).toBeTruthy());
    expect(saveMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/settings-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** — edit `apps/saas/components/SettingsPanel.tsx`.

Update local-settings import to include types:
```ts
import { DEFAULT_LOCAL_SETTINGS, validateLocalSettings, type LocalSettings, type KomponenPreset } from "@/lib/kalkulator/local-settings";
```
Add imports:
```ts
import { useEffect, useState } from "react";
import { getRincianPref, setRincianPref } from "@/lib/store/display-prefs";
```
(Keep existing imports; `useEffect`/`useState` already imported — don't duplicate.)

Add a text-field helper below `NumField`:
```tsx
function TxtField({ value, disabled, onChange, ph }: { value: string; disabled: boolean; onChange: (s: string) => void; ph?: string }) {
  return <GlassInput value={value} disabled={disabled} placeholder={ph} onChange={(e) => onChange(e.target.value)} className="w-full" />;
}
```

Inside `SettingsPanel`, add Tampilan pref state (after existing `const disabled = !editable;`):
```tsx
  const [rincian, setRincian] = useState(false);
  useEffect(() => { setRincian(getRincianPref()); }, []);
  const toggleRincian = () => { const v = !rincian; setRincian(v); setRincianPref(v); };
```

Add komponen & packing mutation helpers (after `setChan`):
```tsx
  const mutList = (key: "komponenPresets" | "packingPresets") => ({
    set: (i: number, patch: Partial<KomponenPreset>) => setS((p) => ({ ...p, [key]: p[key].map((k, j) => (j === i ? { ...k, ...patch } : k)) })),
    add: () => setS((p) => ({ ...p, [key]: [...p[key], { id: crypto.randomUUID(), nama: "", harga: 0 }] })),
    del: (i: number) => setS((p) => ({ ...p, [key]: p[key].filter((_, j) => j !== i) })),
  });
  const komp = mutList("komponenPresets");
  const pack = mutList("packingPresets");
```

Add a reusable CRUD-list renderer (module-scope function, place beside `Group`):
```tsx
function PresetList({ title, disabled, list, onSet, onAdd, onDel, addLabel }: {
  title: string; disabled: boolean; list: KomponenPreset[];
  onSet: (i: number, patch: Partial<KomponenPreset>) => void; onAdd: () => void; onDel: (i: number) => void; addLabel: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[12px] font-medium g-t2 flex items-center gap-2">{title} {disabled && <span className="text-[10px] g-t5">🔒 Edit di Beli</span>}</h2>
      {list.map((k, i) => (
        <div key={k.id} className="flex items-center gap-2">
          <GlassInput value={k.nama} disabled={disabled} placeholder="Nama" className="flex-1" onChange={(e) => onSet(i, { nama: e.target.value })} />
          <GlassInput type="number" inputMode="decimal" value={String(k.harga)} disabled={disabled} className="w-28" onChange={(e) => onSet(i, { harga: Number(e.target.value) })} />
          {!disabled && <button type="button" onClick={() => onDel(i)} className="g-t4 text-sm px-1" aria-label={`Hapus ${title}`}>✕</button>}
        </div>
      ))}
      {!disabled && <button type="button" onClick={onAdd} className="text-[12px] g-t4 underline self-start">＋ {addLabel}</button>}
    </section>
  );
}
```
(Add `import type { KomponenPreset }` reference is already in the file's import; `PresetList` uses it.)

Insert into the JSX after the "Fee channel" `Group` (before the Simpan/CTA row):
```tsx
      <PresetList title="Komponen tambahan" disabled={disabled} list={s.komponenPresets} onSet={komp.set} onAdd={komp.add} onDel={komp.del} addLabel="Tambah komponen" />
      <PresetList title="Packing" disabled={disabled} list={s.packingPresets} onSet={pack.set} onAdd={pack.add} onDel={pack.del} addLabel="Tambah packing" />
      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-medium g-t2">Tampilan</h2>
        <label className="text-[12px] g-t3 flex items-center gap-2">
          <input type="checkbox" checked={rincian} onChange={toggleRincian} aria-label="Tampilkan rincian perhitungan" />
          Tampilkan rincian perhitungan di kalkulator
        </label>
      </section>
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/settings-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/SettingsPanel.tsx apps/saas/components/settings-panel.test.tsx
git commit -m "feat(saas): SettingsPanel grup Komponen/Packing CRUD + toggle Tampilan rincian (TDD)"
```

---

### Task 7: SettingsPanel — grup Labor bundle (nested items)

**Files:**
- Modify: `apps/saas/components/SettingsPanel.tsx`
- Test: `apps/saas/components/settings-panel.test.tsx` (append)

**Interfaces:**
- Consumes: `LaborPreset`, `LaborItemInput` (Task 1).
- Produces: Labor bundle group (add/del preset, add/del item, edit item fields).

- [ ] **Step 1: Write failing test** — append:

```ts
describe("SettingsPanel labor bundle", () => {
  it("Free → labor preset & item disabled", async () => {
    render(<SettingsPanel editable={false} userId={null} />);
    expect((screen.getByDisplayValue("Mask Medium") as HTMLInputElement).disabled).toBe(true);
  });
  it("Beli → tambah item ke bundle lalu Simpan", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    await waitFor(() => expect(screen.getByDisplayValue("Mask Minimal")).toBeTruthy());
    fireEvent.click(screen.getAllByText(/Tambah item/i)[0]);
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const lp = saveMock.mock.calls[0][1].laborPresets[0];
    expect(lp.items.length).toBe(4);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/settings-panel.test.tsx`
Expected: FAIL (no "Mask Medium" field / no "Tambah item").

- [ ] **Step 3: Implement** — edit `apps/saas/components/SettingsPanel.tsx`.

Add to the local-settings import: `type LaborPreset, type LaborItemInput`.

Add labor mutation helpers inside `SettingsPanel` (after `pack`):
```tsx
  const setLaborNama = (i: number, nama: string) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.map((l, j) => (j === i ? { ...l, nama } : l)) }));
  const addLaborPreset = () =>
    setS((p) => ({ ...p, laborPresets: [...p.laborPresets, { id: crypto.randomUUID(), nama: "", items: [{ nama: "", flat: 0 }] }] }));
  const delLaborPreset = (i: number) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.filter((_, j) => j !== i) }));
  const setItem = (pi: number, ii: number, patch: Partial<LaborItemInput>) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.map((l, j) => (j === pi ? { ...l, items: l.items.map((it, k) => (k === ii ? { ...it, ...patch } : it)) } : l)) }));
  const addItem = (pi: number) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.map((l, j) => (j === pi ? { ...l, items: [...l.items, { nama: "", flat: 0 }] } : l)) }));
  const delItem = (pi: number, ii: number) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.map((l, j) => (j === pi ? { ...l, items: l.items.filter((_, k) => k !== ii) } : l)) }));
  const numOrUndef = (v: string) => (v === "" ? undefined : Number(v));
```

Insert the Labor section into JSX after the Packing `PresetList` (before Tampilan section):
```tsx
      <section className="flex flex-col gap-3">
        <h2 className="text-[12px] font-medium g-t2 flex items-center gap-2">Labor (preset bundle) {disabled && <span className="text-[10px] g-t5">🔒 Edit di Beli</span>}</h2>
        {s.laborPresets.map((lp, pi) => (
          <div key={lp.id} className="flex flex-col gap-1 border-l-2 border-[color:var(--g-row-border)] pl-2">
            <div className="flex items-center gap-2">
              <GlassInput value={lp.nama} disabled={disabled} placeholder="Nama preset" className="flex-1" onChange={(e) => setLaborNama(pi, e.target.value)} />
              {!disabled && <button type="button" onClick={() => delLaborPreset(pi)} className="g-t4 text-sm px-1" aria-label="Hapus preset labor">✕ preset</button>}
            </div>
            {lp.items.map((it, ii) => (
              <div key={ii} className="flex items-center gap-2 flex-wrap pl-2">
                <GlassInput value={it.nama} disabled={disabled} placeholder="Item" className="flex-1 min-w-[100px]" onChange={(e) => setItem(pi, ii, { nama: e.target.value })} />
                <GlassInput type="number" inputMode="decimal" placeholder="jam" value={it.jam ?? ""} disabled={disabled} className="w-16" onChange={(e) => setItem(pi, ii, { jam: numOrUndef(e.target.value) })} />
                <GlassInput type="number" inputMode="decimal" placeholder="rate/jam" value={it.ratePerJam ?? ""} disabled={disabled} className="w-24" onChange={(e) => setItem(pi, ii, { ratePerJam: numOrUndef(e.target.value) })} />
                <GlassInput type="number" inputMode="decimal" placeholder="flat" value={it.flat ?? ""} disabled={disabled} className="w-20" onChange={(e) => setItem(pi, ii, { flat: numOrUndef(e.target.value) })} />
                {!disabled && <button type="button" onClick={() => delItem(pi, ii)} className="g-t4 text-sm px-1" aria-label="Hapus item">✕</button>}
              </div>
            ))}
            {!disabled && <button type="button" onClick={() => addItem(pi)} className="text-[11px] g-t4 underline self-start pl-2">＋ Tambah item</button>}
          </div>
        ))}
        {!disabled && <button type="button" onClick={addLaborPreset} className="text-[12px] g-t4 underline self-start">＋ Tambah preset labor</button>}
      </section>
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/settings-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/SettingsPanel.tsx apps/saas/components/settings-panel.test.tsx
git commit -m "feat(saas): SettingsPanel grup Labor bundle nested items (CRUD, TDD)"
```

---

### Task 8: KomponenLaborInput — blok kalkulator (packing single-select, labor bundle)

**Files:**
- Create: `apps/saas/components/KomponenLaborInput.tsx`
- Test: `apps/saas/components/komponen-labor-input.test.tsx`

**Interfaces:**
- Consumes: `LocalSettings` (Task 1), `KomponenRow`/`LaborRow` (Task 2).
- Produces: `KomponenLaborInput` props:
  ```ts
  { locked: boolean; settings: LocalSettings;
    komponen: KomponenRow[]; labor: LaborRow[]; packing: { nama: string; harga: number } | undefined;
    onKomponenChange: (r: KomponenRow[]) => void; onLaborChange: (r: LaborRow[]) => void;
    onPackingChange: (p: { nama: string; harga: number } | undefined) => void; }
  ```

- [ ] **Step 1: Write failing test** — create `apps/saas/components/komponen-labor-input.test.tsx`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KomponenLaborInput } from "./KomponenLaborInput";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

const base = {
  settings: DEFAULT_LOCAL_SETTINGS, komponen: [], labor: [], packing: undefined,
  onKomponenChange: vi.fn(), onLaborChange: vi.fn(), onPackingChange: vi.fn(),
};

describe("KomponenLaborInput", () => {
  it("locked → 🔒 + CTA, tak ada chip preset", () => {
    render(<KomponenLaborInput {...base} locked={true} />);
    expect(screen.getByText(/Beli/)).toBeTruthy();
    expect(screen.queryByText(/Gantungan kew-kew/)).toBeNull();
  });
  it("unlocked → chip komponen append 1 row", () => {
    const onK = vi.fn();
    render(<KomponenLaborInput {...base} locked={false} onKomponenChange={onK} />);
    fireEvent.click(screen.getByText(/Gantungan kew-kew/));
    expect(onK.mock.calls[0][0][0]).toMatchObject({ nama: "Gantungan kew-kew", harga: 900, qty: 1 });
  });
  it("unlocked → chip labor bundle append SEMUA item (Mask Medium = 3)", () => {
    const onL = vi.fn();
    render(<KomponenLaborInput {...base} locked={false} onLaborChange={onL} />);
    fireEvent.click(screen.getByText(/Mask Medium/));
    expect(onL.mock.calls[0][0]).toHaveLength(3);
    expect(onL.mock.calls[0][0][0]).toMatchObject({ nama: "Assembly", jam: 0.5, ratePerJam: 35000 });
  });
  it("unlocked → packing single-select set lalu clear", () => {
    const onP = vi.fn();
    const { rerender } = render(<KomponenLaborInput {...base} locked={false} onPackingChange={onP} />);
    fireEvent.click(screen.getByRole("button", { name: /Packing S/ }));
    expect(onP).toHaveBeenCalledWith({ nama: "Packing S", harga: 1500 });
    rerender(<KomponenLaborInput {...base} locked={false} packing={{ nama: "Packing S", harga: 1500 }} onPackingChange={onP} />);
    fireEvent.click(screen.getByRole("button", { name: /Packing S/ }));
    expect(onP).toHaveBeenLastCalledWith(undefined);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/komponen-labor-input.test.tsx`
Expected: FAIL (`./KomponenLaborInput` not found).

- [ ] **Step 3: Implement** — create `apps/saas/components/KomponenLaborInput.tsx`:

```tsx
"use client";
import { GlassInput } from "@3pb/ui";
import type { LocalSettings } from "@/lib/kalkulator/local-settings";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

export function KomponenLaborInput({
  locked, settings, komponen, labor, packing, onKomponenChange, onLaborChange, onPackingChange,
}: {
  locked: boolean; settings: LocalSettings;
  komponen: KomponenRow[]; labor: LaborRow[]; packing: { nama: string; harga: number } | undefined;
  onKomponenChange: (r: KomponenRow[]) => void; onLaborChange: (r: LaborRow[]) => void;
  onPackingChange: (p: { nama: string; harga: number } | undefined) => void;
}) {
  if (locked) {
    return (
      <div className="border-t border-[color:var(--g-row-border)] pt-3 mt-1">
        <div className="text-[12px] g-t3 font-medium">🔒 Komponen, labor &amp; packing</div>
        <p className="text-[11px] g-t4 mt-1">Tambah komponen, biaya labor &amp; packing ke perhitungan.
          <a href="/beli" className="underline ml-1">Buka di Beli →</a></p>
      </div>
    );
  }
  const subKomp = komponen.reduce((s, r) => s + (r.harga > 0 ? r.harga * Math.max(1, r.qty) : 0), 0) + (packing?.harga ?? 0);
  const subLab = labor.reduce((s, r) => s + ((r.jam ?? 0) * (r.ratePerJam ?? 0) + (r.flat ?? 0)), 0);

  return (
    <div className="border-t border-[color:var(--g-row-border)] pt-3 mt-1 flex flex-col gap-3">
      <div>
        <div className="text-[11px] g-t3 mb-1">Packing (pilih satu)</div>
        <div className="flex gap-2 flex-wrap">
          {settings.packingPresets.map((p) => {
            const on = packing?.nama === p.nama && packing?.harga === p.harga;
            return (
              <button key={p.id} type="button" aria-label={`Packing ${p.nama}`}
                onClick={() => onPackingChange(on ? undefined : { nama: p.nama, harga: p.harga })}
                className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px]"
                style={on ? { outline: "2px solid var(--g-accent)" } : undefined}>
                {p.nama} · {rupiah(p.harga)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[11px] g-t3 mb-1">Komponen tambahan</div>
        <div className="flex gap-2 flex-wrap mb-2">
          {settings.komponenPresets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onKomponenChange([...komponen, { id: crypto.randomUUID(), nama: p.nama, harga: p.harga, qty: 1 }])}
              className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px]">＋ {p.nama} ({rupiah(p.harga)})</button>
          ))}
          <button type="button" onClick={() => onKomponenChange([...komponen, { id: crypto.randomUUID(), nama: "", harga: 0, qty: 1 }])} className="text-[12px] g-t4 underline">＋ manual</button>
        </div>
        {komponen.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 mb-1">
            <GlassInput value={r.nama} placeholder="Nama" className="flex-1" onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
            <GlassInput type="number" inputMode="decimal" value={String(r.harga)} className="w-24" onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, harga: Number(e.target.value) } : x)))} />
            <GlassInput type="number" inputMode="numeric" value={String(r.qty)} className="w-16" onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
            <button type="button" aria-label="Hapus komponen" className="g-t4 text-sm px-1" onClick={() => onKomponenChange(komponen.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {subKomp > 0 && <div className="text-[11px] g-t4">Subtotal komponen + packing: {rupiah(subKomp)}</div>}
      </div>

      <div>
        <div className="text-[11px] g-t3 mb-1">Labor</div>
        <div className="flex gap-2 flex-wrap mb-2">
          {settings.laborPresets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onLaborChange([...labor, ...p.items.map((it) => ({ id: crypto.randomUUID(), nama: it.nama, jam: it.jam, ratePerJam: it.ratePerJam, flat: it.flat }))])}
              className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px]">＋ {p.nama}</button>
          ))}
          <button type="button" onClick={() => onLaborChange([...labor, { id: crypto.randomUUID(), nama: "" }])} className="text-[12px] g-t4 underline">＋ manual</button>
        </div>
        {labor.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 mb-1 flex-wrap">
            <GlassInput value={r.nama} placeholder="Nama" className="flex-1" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
            <GlassInput type="number" inputMode="decimal" placeholder="jam" value={r.jam ?? ""} className="w-16" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, jam: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
            <GlassInput type="number" inputMode="decimal" placeholder="rate" value={r.ratePerJam ?? ""} className="w-24" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, ratePerJam: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
            <GlassInput type="number" inputMode="decimal" placeholder="flat" value={r.flat ?? ""} className="w-20" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, flat: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
            <button type="button" aria-label="Hapus labor" className="g-t4 text-sm px-1" onClick={() => onLaborChange(labor.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {subLab > 0 && <div className="text-[11px] g-t4">Subtotal labor: {rupiah(subLab)}</div>}
      </div>
    </div>
  );
}
```

Note: grep `packages/ui/src/glass.css` for `g-btn-ghost` and `--g-accent`; both are used in existing 1b-1 code (SettingsPanel CTA + Calculator), so they exist. The active packing outline uses inline `--g-accent` (present).

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/komponen-labor-input.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/KomponenLaborInput.tsx apps/saas/components/komponen-labor-input.test.tsx
git commit -m "feat(saas): KomponenLaborInput (packing single-select, labor bundle expand, TDD)"
```

---

### Task 9: RincianPanel + Calculator wiring + gating

**Files:**
- Create: `apps/saas/components/RincianPanel.tsx`
- Modify: `apps/saas/components/Calculator.tsx`
- Test: `apps/saas/components/rincian-panel.test.tsx`, `apps/saas/components/calculator.test.tsx` (append)

**Interfaces:**
- Consumes: `FullView["rincian"]` (Task 3), `KomponenLaborInput` (Task 8), `getRincianPref` (Task 5), `KomponenRow`/`LaborRow` (Task 2).
- Produces: `RincianPanel({ rincian }: { rincian: FullView["rincian"] })`; Calculator passes add-on only when `paidCore`, renders rincian when pref on.

- [ ] **Step 1: Write failing tests**

Create `apps/saas/components/rincian-panel.test.tsx`:
```ts
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RincianPanel } from "./RincianPanel";

it("render baris breakdown", () => {
  render(<RincianPanel rincian={{ produksi: 40000, komponen: 900, packing: 2500, labor: 202500, biayaModal: 245900, hargaJualMinimum: 260000, rekomendasi: 312000 }} />);
  expect(screen.getByText(/Produksi/)).toBeTruthy();
  expect(screen.getByText(/Biaya modal/)).toBeTruthy();
  expect(screen.getByText("Rp202.500")).toBeTruthy();
});
```

Append to `apps/saas/components/calculator.test.tsx`:
```ts
it("paidCore=false → blok add-on terkunci", () => {
  render(<Calculator authenticated={true} paidCore={false} userId="u1" />);
  expect(screen.getByText(/🔒 Komponen/)).toBeTruthy();
  expect(screen.queryByText(/Gantungan kew-kew/)).toBeNull();
});
it("paidCore=true → chip preset komponen muncul", async () => {
  render(<Calculator authenticated={true} paidCore={true} userId="u1" />);
  await waitFor(() => expect(screen.getByText(/Gantungan kew-kew/)).toBeTruthy());
});
```
(If `calculator.test.tsx` mocks `@/lib/store/local-settings`, ensure `loadSettings` resolves to `DEFAULT_LOCAL_SETTINGS`.)

- [ ] **Step 2: Run to verify fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/rincian-panel.test.tsx components/calculator.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/saas/components/RincianPanel.tsx`:
```tsx
"use client";
import type { FullView } from "@/lib/kalkulator/compute";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
const Row = ({ label, val, strong }: { label: string; val: number; strong?: boolean }) => (
  <div className={`flex justify-between text-[12px] py-[3px] ${strong ? "g-t1 font-medium" : "g-t3"}`} style={{ borderBottom: "1px dashed var(--g-row-border)" }}>
    <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(val)}</span>
  </div>
);

export function RincianPanel({ rincian }: { rincian: FullView["rincian"] }) {
  return (
    <div className="mt-3 rounded-[10px] p-3" style={{ background: "color-mix(in srgb, var(--g-t5) 8%, transparent)" }}>
      <div className="text-[11px] g-t4 mb-1">Rincian perhitungan</div>
      <Row label="Produksi (material + mesin + failure)" val={rincian.produksi} />
      {rincian.komponen > 0 && <Row label="Komponen" val={rincian.komponen} />}
      {rincian.packing > 0 && <Row label="Packing" val={rincian.packing} />}
      {rincian.labor > 0 && <Row label="Labor" val={rincian.labor} />}
      <Row label="= Biaya modal" val={rincian.biayaModal} strong />
      <Row label="Harga jual minimum" val={rincian.hargaJualMinimum} />
      <Row label="Rekomendasi (Standard)" val={rincian.rekomendasi} />
    </div>
  );
}
```

Edit `apps/saas/components/Calculator.tsx`:

Add imports:
```ts
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";
import { KomponenLaborInput } from "./KomponenLaborInput";
import { RincianPanel } from "./RincianPanel";
import { getRincianPref } from "@/lib/store/display-prefs";
```

Add state (near existing `useState`):
```ts
  const [komponen, setKomponen] = useState<KomponenRow[]>([]);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [packing, setPacking] = useState<{ nama: string; harga: number } | undefined>(undefined);
  const [showRincian, setShowRincian] = useState(false);
  useEffect(() => { setShowRincian(getRincianPref()); }, []);
```

Change the `view` computation to gate add-ons on `paidCore`:
```ts
  const addon = paidCore ? { komponen, labor, packing } : {};
  const view = valid ? fullView({ gramasi: g, durasiJam: d, tipe, ...addon }, settings) : null;
```

Inside the Hasil `GlassCard`, as the LAST children of the inner `<div className="flex flex-col gap-3">` (after the existing "Simpan hasil…" button), insert:
```tsx
              <KomponenLaborInput
                locked={!paidCore}
                settings={settings}
                komponen={komponen}
                labor={labor}
                packing={packing}
                onKomponenChange={setKomponen}
                onLaborChange={setLabor}
                onPackingChange={setPacking}
              />
              {showRincian && <RincianPanel rincian={view.rincian} />}
```

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/rincian-panel.test.tsx components/calculator.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/RincianPanel.tsx apps/saas/components/Calculator.tsx apps/saas/components/calculator.test.tsx apps/saas/components/rincian-panel.test.tsx
git commit -m "feat(saas): RincianPanel + kalkulator wiring komponen/labor/packing + gating paidCore (TDD)"
```

---

### Task 10: Verifikasi akhir + docs (deploy GATED)

**Files:**
- Modify: `apps/saas/README.md`

- [ ] **Step 1: Update README** — add under the 1b-1 settings bullet:
```markdown
- Komponen/Labor/Packing (Beli, 1b-2): preset komponen & packing (CRUD `{nama,harga}`) + labor preset bundle (multi-item) di `/settings`; di kalkulator blok "Komponen & Labor" (chip preset, packing pilih-satu, labor bundle auto-fill) terkunci untuk Free. Panel rincian perhitungan opsional (toggle Setting→Tampilan, localStorage, semua user). `lib/kalkulator/compose.ts` → `buildInputV2`. Parity Free dijaga. Multi-plate=1b-3, save hasil=1b-4.
```

- [ ] **Step 2: Prisma generate + full test**
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter @3pb/saas exec prisma generate
pnpm turbo test
```
Expected: 6/6 packages pass (saas count naik).

- [ ] **Step 3: Regenerate dashboard client + full build** (gotcha monorepo shared `@prisma/client`)
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx prisma generate && cd ../..
pnpm turbo build
```
Expected: 3/3 build tasks successful.

- [ ] **Step 4: Guard — no leaked secret**

Run: `git diff --stat apps/saas/.env.deploy.example`
Expected: EMPTY. If diff shows, `git checkout -- apps/saas/.env.deploy.example` before committing.

- [ ] **Step 5: Commit**
```bash
git add apps/saas/README.md
git commit -m "docs(saas): catat komponen/labor/packing + rincian 1b-2 di README"
```

- [ ] **Step 6: Deploy — GATED**

Do NOT run `bash apps/saas/deploy.sh`. Await explicit user go-ahead.

---

## Self-Review (penulis plan)

**Spec coverage:** §1 keputusan → T1 (types+validate), T6/T7 (CRUD UI packing+komponen+labor bundle), T8 (input locked, packing single-select, labor bundle expand), T3 (rincian + parity), T5 (display-pref), T9 (RincianPanel + toggle wiring + gating). §2 data → T1 + T4 (merge). §3 compose → T2. §4 input/rincian → T8 + T9. §5 settings → T6 + T7. §6 gating/parity → T3 + T9. §7 testing → tiap task; regresi T10. §8 deploy gated → T10 Step 6. Semua tercakup.

**Placeholder scan:** tak ada TBD/TODO; kode lengkap tiap step. Grep-guidance (`g-btn-ghost`/`--g-accent`) konkret (dipakai kode 1b-1 existing).

**Type consistency:** `KomponenPreset {id,nama,harga}` / `PackingPreset` / `LaborItemInput` / `LaborPreset {id,nama,items}` (T1) dipakai T6/T7/T8. `KomponenRow`/`LaborRow` (T2) dipakai T3/T8/T9. `composeKomponen(packing:{nama,harga}|undefined, rows)` / `composeLabor(rows)` (T2) dipanggil T3. `CalcInput.komponen?/labor?/packing?:{nama,harga}` (T3) di-set T9. `FullView.rincian` (T3) dipakai T9 RincianPanel. `KomponenLaborInput` props (T8) dipanggil T9 dg callback identik. `getRincianPref/setRincianPref` (T5) dipakai T6 (set) + T9 (get). Konsisten.
