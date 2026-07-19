# Fase 1b-2: Komponen + Labor Preset & Input Kalkulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah komponen tambahan, labor, dan packing ke kalkulator `apps/saas` Slizebiz — pustaka preset CRUD dua-mode di `/settings` + input di kalkulator (single-plate), tanpa meregresi angka Free.

**Architecture:** Perluas blob `LocalSettings` (IndexedDB) dengan `komponenPresets`/`laborPresets`/`packingRates`. Helper `compose.ts` mengubah baris input jadi `KomponenItem[]`/`LaborItem[]` yang dikonsumsi `hitungKalkulasiV2`. Kalkulator meneruskan add-on hanya bila `paidCore`; Free/tanpa add-on → array kosong → angka identik 1b-1. Preset tak menyentuh `toSettingsV2` → invariant paritas 1b-1 utuh.

**Tech Stack:** Next.js 16, React 19, TypeScript, `@3pb/kalkulator-core` (formula), `idb` (IndexedDB), vitest + jsdom + `@testing-library/react`.

## Global Constraints

- **Node 22 wajib** — prefix tiap shell command: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.
- **Parity Free INVARIANT:** `fullView(c)` === `fullView(c, DEFAULT_LOCAL_SETTINGS)` === angka 1b-1. `toSettingsV2(DEFAULT_LOCAL_SETTINGS)` tetap deep-equal `defaultSettings` (JANGAN ubah `toSettingsV2`). Tanpa add-on → `komponen:[]`+`labor:[]`.
- **Free defense:** kalkulator meneruskan komponen/labor/packing ke `fullView` HANYA bila `paidCore` (server-auth prop). `!paidCore` → paksa kosong.
- **Item shape kalkulator-core (verbatim):** `KomponenItem = { nama: string; harga: number; qty: number }`; `LaborItem = { nama: string; jam?: number; ratePerJam?: number; flat?: number }`. Biaya komponen = `Σ harga×qty`; biaya labor = `Σ (jam??0)×(ratePerJam??0) + (flat??0)`.
- **Tanpa perubahan skema Prisma** (murni client IndexedDB). **Tanpa dep baru** (`idb` sudah ada; id preset baru pakai `crypto.randomUUID()` native).
- **Bahasa Indonesia** untuk semua copy UI.
- **Storage:** DB `slizebiz-local`, store `settings`, keyPath `userId`, satu blob `LocalSettings` per user (wholesale load/save).
- Deploy homelab :3300 (`bash apps/saas/deploy.sh`) = **GATED** (jangan deploy tanpa perintah user eksplisit).

---

### Task 1: Perluas LocalSettings — preset komponen/labor + packing rates

**Files:**
- Modify: `apps/saas/lib/kalkulator/local-settings.ts`
- Test: `apps/saas/lib/kalkulator/local-settings.test.ts`

**Interfaces:**
- Consumes: existing `LocalSettings`, `DEFAULT_LOCAL_SETTINGS`, `toSettingsV2`, `validateLocalSettings`, `defaultSettings`.
- Produces:
  - `interface KomponenPreset { id: string; nama: string; harga: number }`
  - `interface LaborPreset { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }`
  - `type PackingSize = "S" | "M" | "L" | "XL"`
  - `LocalSettings` gains `komponenPresets: KomponenPreset[]`, `laborPresets: LaborPreset[]`, `packingRates: Record<PackingSize, number>`
  - `DEFAULT_LOCAL_SETTINGS` seeded (values below)
  - `validateLocalSettings` extended (preset/packing rules)

- [ ] **Step 1: Write the failing tests**

Append to `apps/saas/lib/kalkulator/local-settings.test.ts`:

```ts
import { PACKING_SIZES } from "./local-settings"; // NEW export used below

describe("1b-2 preset komponen/labor/packing", () => {
  it("toSettingsV2 tetap paritas walau ada field preset baru (invariant 1b-1)", () => {
    // KRUSIAL: field preset TIDAK boleh masuk SettingsV2
    expect(toSettingsV2(DEFAULT_LOCAL_SETTINGS)).toEqual(defaultSettings);
  });

  it("DEFAULT punya 6 komponen, 3 labor, 4 packing rate", () => {
    expect(DEFAULT_LOCAL_SETTINGS.komponenPresets).toHaveLength(6);
    expect(DEFAULT_LOCAL_SETTINGS.laborPresets).toHaveLength(3);
    expect(Object.keys(DEFAULT_LOCAL_SETTINGS.packingRates).sort()).toEqual(["L", "M", "S", "XL"]);
    expect(DEFAULT_LOCAL_SETTINGS.packingRates.M).toBe(2500);
    expect(DEFAULT_LOCAL_SETTINGS.komponenPresets[0]).toMatchObject({ nama: "Gantungan kew-kew", harga: 900 });
    expect(PACKING_SIZES).toEqual(["S", "M", "L", "XL"]);
  });

  it("validate menangkap preset komponen invalid", () => {
    const bad = structuredClone(DEFAULT_LOCAL_SETTINGS);
    bad.komponenPresets[0].harga = 0;
    bad.komponenPresets[1].nama = "  ";
    const errs = validateLocalSettings(bad);
    expect(errs.some((e) => /komponen/i.test(e))).toBe(true);
    expect(errs.length).toBeGreaterThanOrEqual(2);
  });

  it("validate menangkap labor biaya 0 dan packing negatif", () => {
    const bad = structuredClone(DEFAULT_LOCAL_SETTINGS);
    bad.laborPresets[0] = { id: "x", nama: "Kosong", jam: 0, ratePerJam: 0, flat: 0 };
    bad.packingRates.S = -1;
    const errs = validateLocalSettings(bad);
    expect(errs.some((e) => /labor/i.test(e))).toBe(true);
    expect(errs.some((e) => /packing/i.test(e))).toBe(true);
  });

  it("DEFAULT valid (nol error)", () => {
    expect(validateLocalSettings(DEFAULT_LOCAL_SETTINGS)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/local-settings.test.ts`
Expected: FAIL (`komponenPresets` undefined / `PACKING_SIZES` not exported).

- [ ] **Step 3: Implement**

Edit `apps/saas/lib/kalkulator/local-settings.ts`. Add types + export `PACKING_SIZES` after the imports:

```ts
export interface KomponenPreset { id: string; nama: string; harga: number }
export interface LaborPreset { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }
export type PackingSize = "S" | "M" | "L" | "XL";
export const PACKING_SIZES: PackingSize[] = ["S", "M", "L", "XL"];
```

Add the 3 fields to the `LocalSettings` interface (after `channels`):
```ts
  komponenPresets: KomponenPreset[];
  laborPresets: LaborPreset[];
  packingRates: Record<PackingSize, number>;
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
  laborPresets: [
    { id: "lbr-preparer", nama: "Preparer (sanding + assembly)", jam: 2, ratePerJam: 35000 },
    { id: "lbr-finisher", nama: "Finisher (painting)", jam: 2, ratePerJam: 75000 },
    { id: "lbr-consumables", nama: "Consumables finishing", flat: 55000 },
  ],
  packingRates: { S: 1500, M: 2500, L: 5000, XL: 8000 },
```

Extend `validateLocalSettings` — insert before `return errs;`:
```ts
  ls.komponenPresets.forEach((k, i) => {
    if (!k.nama.trim()) errs.push(`Komponen #${i + 1} nama kosong`);
    if (!(k.harga > 0)) errs.push(`Komponen "${k.nama || i + 1}" harga harus > 0`);
  });
  ls.laborPresets.forEach((l, i) => {
    if (!l.nama.trim()) errs.push(`Labor #${i + 1} nama kosong`);
    for (const [f, v] of [["jam", l.jam], ["rate", l.ratePerJam], ["flat", l.flat]] as const) {
      if (v != null && v < 0) errs.push(`Labor "${l.nama || i + 1}" ${f} tak boleh negatif`);
    }
    const biaya = (l.jam ?? 0) * (l.ratePerJam ?? 0) + (l.flat ?? 0);
    if (!(biaya > 0)) errs.push(`Labor "${l.nama || i + 1}" biaya harus > 0`);
  });
  for (const sz of PACKING_SIZES) {
    if (ls.packingRates[sz] < 0) errs.push(`Packing ${sz} tak boleh negatif`);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/local-settings.test.ts`
Expected: PASS (all, including the pre-existing 1b-1 tests in the file).

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/local-settings.ts apps/saas/lib/kalkulator/local-settings.test.ts
git commit -m "feat(saas): LocalSettings + preset komponen/labor + packing rates (invariant toSettingsV2, TDD)"
```

---

### Task 2: compose.ts — baris input → KomponenItem[]/LaborItem[]

**Files:**
- Create: `apps/saas/lib/kalkulator/compose.ts`
- Test: `apps/saas/lib/kalkulator/compose.test.ts`

**Interfaces:**
- Consumes: `KomponenItem`, `LaborItem` from `@3pb/kalkulator-core`; `PackingSize` from `./local-settings`.
- Produces:
  - `interface KomponenRow { id: string; nama: string; harga: number; qty: number }`
  - `interface LaborRow { id: string; nama: string; jam?: number; ratePerJam?: number; flat?: number }`
  - `composeKomponen(packing: PackingSize | undefined, packingRates: Record<PackingSize, number>, rows: KomponenRow[]): KomponenItem[]`
  - `composeLabor(rows: LaborRow[]): LaborItem[]`

- [ ] **Step 1: Write the failing test**

Create `apps/saas/lib/kalkulator/compose.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeKomponen, composeLabor, type KomponenRow, type LaborRow } from "./compose";

const rates = { S: 1500, M: 2500, L: 5000, XL: 8000 };
const krow = (o: Partial<KomponenRow>): KomponenRow => ({ id: "1", nama: "X", harga: 100, qty: 1, ...o });
const lrow = (o: Partial<LaborRow>): LaborRow => ({ id: "1", nama: "L", ...o });

describe("composeKomponen", () => {
  it("tanpa packing & tanpa row → [] (parity)", () => {
    expect(composeKomponen(undefined, rates, [])).toEqual([]);
  });
  it("packing M → satu row Packing M dg rate", () => {
    expect(composeKomponen("M", rates, [])).toEqual([{ nama: "Packing M", harga: 2500, qty: 1 }]);
  });
  it("skip row nama kosong / harga <= 0, floor qty ke 1, trim nama", () => {
    const out = composeKomponen(undefined, rates, [
      krow({ nama: "  ", harga: 100 }),
      krow({ nama: "Baut", harga: 0 }),
      krow({ nama: "  Mur ", harga: 300, qty: 0 }),
    ]);
    expect(out).toEqual([{ nama: "Mur", harga: 300, qty: 1 }]);
  });
  it("packing + rows digabung, packing pertama", () => {
    const out = composeKomponen("S", rates, [krow({ nama: "Baut", harga: 200, qty: 3 })]);
    expect(out).toEqual([
      { nama: "Packing S", harga: 1500, qty: 1 },
      { nama: "Baut", harga: 200, qty: 3 },
    ]);
  });
});

describe("composeLabor", () => {
  it("[] → [] (parity)", () => {
    expect(composeLabor([])).toEqual([]);
  });
  it("row jam×rate lolos, biaya 0 & nama kosong di-skip", () => {
    const out = composeLabor([
      lrow({ nama: "Cat", jam: 2, ratePerJam: 75000 }),
      lrow({ nama: "Nol", jam: 0, ratePerJam: 0, flat: 0 }),
      lrow({ nama: "  ", flat: 5000 }),
    ]);
    expect(out).toEqual([{ nama: "Cat", jam: 2, ratePerJam: 75000, flat: undefined }]);
  });
  it("row flat-only lolos", () => {
    expect(composeLabor([lrow({ nama: "Consumable", flat: 55000 })])).toEqual([
      { nama: "Consumable", jam: undefined, ratePerJam: undefined, flat: 55000 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compose.test.ts`
Expected: FAIL (`./compose` not found).

- [ ] **Step 3: Implement**

Create `apps/saas/lib/kalkulator/compose.ts`:

```ts
import type { KomponenItem, LaborItem } from "@3pb/kalkulator-core";
import type { PackingSize } from "./local-settings";

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

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compose.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/compose.ts apps/saas/lib/kalkulator/compose.test.ts
git commit -m "feat(saas): compose komponen/labor rows → KalkulasiInputV2 items (TDD)"
```

---

### Task 3: compute.ts — CalcInput + buildInputV2 pakai add-on

**Files:**
- Modify: `apps/saas/lib/kalkulator/compute.ts`
- Test: `apps/saas/lib/kalkulator/compute.test.ts` (append)

**Interfaces:**
- Consumes: `composeKomponen`, `composeLabor`, `KomponenRow`, `LaborRow` (Task 2); `PackingSize` (Task 1).
- Produces: `CalcInput` gains optional `komponen?: KomponenRow[]`, `labor?: LaborRow[]`, `packing?: PackingSize`. `buildInputV2`/`compute`/`fullView` signatures UNCHANGED.

- [ ] **Step 1: Write the failing test**

Append to `apps/saas/lib/kalkulator/compute.test.ts`:

```ts
describe("1b-2 add-on komponen/labor/packing", () => {
  const base = { gramasi: 50, durasiJam: 3, tipe: "FDM" as const };

  it("tanpa add-on → identik parity (invariant)", () => {
    expect(fullView(base)).toEqual(fullView({ ...base }, DEFAULT_LOCAL_SETTINGS));
  });

  it("komponen menaikkan biaya modal & floor persis Σ harga×qty", () => {
    const tanpa = fullView(base);
    const dengan = fullView(
      { ...base, komponen: [{ id: "1", nama: "Baut", harga: 1000, qty: 2 }] },
      DEFAULT_LOCAL_SETTINGS,
    );
    expect(dengan.biayaModal - tanpa.biayaModal).toBe(2000);
    expect(dengan.hargaJualMinimum - tanpa.hargaJualMinimum).toBe(2000);
  });

  it("labor + packing menaikkan biaya modal", () => {
    const tanpa = fullView(base);
    const dengan = fullView(
      { ...base, labor: [{ id: "1", nama: "Cat", jam: 1, ratePerJam: 10000 }], packing: "M" },
      DEFAULT_LOCAL_SETTINGS,
    );
    // labor 10000 + packing M 2500 = 12500
    expect(dengan.biayaModal - tanpa.biayaModal).toBe(12500);
  });
});
```

(File already imports `fullView` and `DEFAULT_LOCAL_SETTINGS` from Task 1's suite; if not present in this file's imports, add `import { DEFAULT_LOCAL_SETTINGS } from "./local-settings";` at top.)

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compute.test.ts`
Expected: FAIL (`komponen`/`packing` not accepted on `CalcInput`, or add-on ignored → diff 0).

- [ ] **Step 3: Implement**

Edit `apps/saas/lib/kalkulator/compute.ts`:

Add imports:
```ts
import { composeKomponen, composeLabor, type KomponenRow, type LaborRow } from "./compose";
import { DEFAULT_LOCAL_SETTINGS, toSettingsV2, type LocalSettings, type PackingSize } from "./local-settings";
```
(replace the existing `local-settings` import line to include `PackingSize`.)

Extend `CalcInput`:
```ts
export interface CalcInput {
  gramasi: number;
  durasiJam: number;
  tipe: "FDM" | "SLA";
  hargaAktual?: { channelId: string; harga: number };
  komponen?: KomponenRow[];
  labor?: LaborRow[];
  packing?: PackingSize;
}
```

In `buildInputV2`, replace the two hardcoded lines `komponen: [],` and `labor: [],` with:
```ts
    komponen: composeKomponen(c.packing, ls.packingRates, c.komponen ?? []),
    labor: composeLabor(c.labor ?? []),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compute.test.ts`
Expected: PASS (including pre-existing parity tests).

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/compute.ts apps/saas/lib/kalkulator/compute.test.ts
git commit -m "feat(saas): buildInputV2 pakai komponen/labor/packing (parity tanpa add-on, TDD)"
```

---

### Task 4: store loadSettings — shallow-merge default (migrasi blob 1b-1)

**Files:**
- Modify: `apps/saas/lib/store/local-settings.ts`
- Test: `apps/saas/lib/store/local-settings.test.ts` (append)

**Interfaces:**
- Consumes: `DEFAULT_LOCAL_SETTINGS`, `LocalSettings` (Task 1).
- Produces: `loadSettings` returns record merged over `DEFAULT_LOCAL_SETTINGS` (field baru terisi default bila absen). Signature unchanged.

- [ ] **Step 1: Write the failing test**

Append to `apps/saas/lib/store/local-settings.test.ts`:

```ts
it("record lama tanpa field preset → merge default (tak throw, punya preset default)", async () => {
  // simulasikan blob 1b-1: buka DB & tulis settings TANPA komponenPresets
  const legacy = { ...DEFAULT_LOCAL_SETTINGS } as Record<string, unknown>;
  delete legacy.komponenPresets;
  delete legacy.laborPresets;
  delete legacy.packingRates;
  await saveSettings("u-legacy", legacy as unknown as import("@/lib/kalkulator/local-settings").LocalSettings);

  const loaded = await loadSettings("u-legacy");
  expect(loaded.komponenPresets).toHaveLength(6);
  expect(loaded.packingRates.M).toBe(2500);
  // field 1b-1 tetap dari record (bukan hilang)
  expect(loaded.mesinPerJam).toBe(DEFAULT_LOCAL_SETTINGS.mesinPerJam);
});
```

(File already imports `loadSettings`, `saveSettings`, `DEFAULT_LOCAL_SETTINGS`. If `DEFAULT_LOCAL_SETTINGS` not imported, add it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/store/local-settings.test.ts`
Expected: FAIL (`loaded.komponenPresets` undefined → `toHaveLength` throws).

- [ ] **Step 3: Implement**

Edit `apps/saas/lib/store/local-settings.ts` — in `loadSettings`, replace `return rec?.settings ?? DEFAULT_LOCAL_SETTINGS;` with:
```ts
    if (!rec?.settings) return DEFAULT_LOCAL_SETTINGS;
    return { ...DEFAULT_LOCAL_SETTINGS, ...rec.settings };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/store/local-settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/store/local-settings.ts apps/saas/lib/store/local-settings.test.ts
git commit -m "feat(saas): loadSettings shallow-merge default (migrasi blob 1b-1, TDD)"
```

---

### Task 5: SettingsPanel — grup Komponen/Labor (preset CRUD) + Packing

**Files:**
- Modify: `apps/saas/components/SettingsPanel.tsx`
- Test: `apps/saas/components/settings-panel.test.tsx` (append; create if absent)

**Interfaces:**
- Consumes: `KomponenPreset`, `LaborPreset`, `PACKING_SIZES`, `PackingSize` (Task 1); existing `NumField`/`Group`, `saveSettings`.
- Produces: 3 new groups rendered; Beli can add/edit/delete presets & edit packing; Free disabled+🔒.

- [ ] **Step 1: Write the failing test**

Append to (or create) `apps/saas/components/settings-panel.test.tsx`:

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

beforeEach(() => { saveMock.mockReset(); saveMock.mockResolvedValue(undefined); });

describe("SettingsPanel 1b-2", () => {
  it("Free (editable=false) → grup Komponen & Labor & Packing tampil terkunci", () => {
    render(<SettingsPanel editable={false} userId={null} />);
    expect(screen.getByText(/Komponen/)).toBeTruthy();
    expect(screen.getByText(/Labor/)).toBeTruthy();
    expect(screen.getByText(/Packing/)).toBeTruthy();
    // input harga preset pertama disabled
    const inp = screen.getByDisplayValue("Gantungan kew-kew") as HTMLInputElement;
    expect(inp.disabled).toBe(true);
    // tak ada tombol tambah preset di Free
    expect(screen.queryByText(/Tambah komponen/i)).toBeNull();
  });

  it("Beli → tambah preset komponen lalu Simpan meneruskan preset baru", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    await waitFor(() => expect(screen.getByDisplayValue("Switch")).toBeTruthy());
    fireEvent.click(screen.getByText(/Tambah komponen/i));
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const saved = saveMock.mock.calls[0][1];
    expect(saved.komponenPresets.length).toBe(7);
  });

  it("Beli → preset harga 0 → tak Simpan + hint", async () => {
    render(<SettingsPanel editable={true} userId="u1" />);
    await waitFor(() => expect(screen.getByDisplayValue("900")).toBeTruthy());
    fireEvent.change(screen.getByDisplayValue("900"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Simpan"));
    await waitFor(() => expect(screen.getByText(/harga harus > 0/i)).toBeTruthy());
    expect(saveMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/settings-panel.test.tsx`
Expected: FAIL (no Komponen/Labor/Packing group, no "Tambah komponen" button).

- [ ] **Step 3: Implement**

Edit `apps/saas/components/SettingsPanel.tsx`:

Update import from local-settings to include the new types + `PACKING_SIZES`:
```ts
import { DEFAULT_LOCAL_SETTINGS, validateLocalSettings, PACKING_SIZES, type LocalSettings, type KomponenPreset, type LaborPreset } from "@/lib/kalkulator/local-settings";
```

Add a small text-input helper below `NumField`:
```tsx
function TxtField({ value, disabled, onChange, ph }: { value: string; disabled: boolean; onChange: (s: string) => void; ph?: string }) {
  return (
    <GlassInput value={value} disabled={disabled} placeholder={ph}
      onChange={(e) => onChange(e.target.value)} className="w-full" />
  );
}
```

Add preset mutation helpers inside `SettingsPanel` (after `setChan`):
```tsx
  const setKomp = (i: number, patch: Partial<KomponenPreset>) =>
    setS((p) => ({ ...p, komponenPresets: p.komponenPresets.map((k, j) => (j === i ? { ...k, ...patch } : k)) }));
  const addKomp = () =>
    setS((p) => ({ ...p, komponenPresets: [...p.komponenPresets, { id: crypto.randomUUID(), nama: "", harga: 0 }] }));
  const delKomp = (i: number) =>
    setS((p) => ({ ...p, komponenPresets: p.komponenPresets.filter((_, j) => j !== i) }));

  const setLab = (i: number, patch: Partial<LaborPreset>) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const addLab = () =>
    setS((p) => ({ ...p, laborPresets: [...p.laborPresets, { id: crypto.randomUUID(), nama: "", flat: 0 }] }));
  const delLab = (i: number) =>
    setS((p) => ({ ...p, laborPresets: p.laborPresets.filter((_, j) => j !== i) }));

  const setPack = (sz: (typeof PACKING_SIZES)[number], n: number) =>
    setS((p) => ({ ...p, packingRates: { ...p.packingRates, [sz]: n } }));
```

Insert three new `<section>` blocks after the "Fee channel" `Group` (before the Simpan/CTA row). These use custom rows (not the 2-col `Group`), so write plain sections:

```tsx
      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-medium g-t2 flex items-center gap-2">
          Komponen tambahan {disabled && <span className="text-[10px] g-t5">🔒 Edit di Beli</span>}
        </h2>
        {s.komponenPresets.map((k, i) => (
          <div key={k.id} className="flex items-center gap-2">
            <TxtField value={k.nama} disabled={disabled} ph="Nama" onChange={(v) => setKomp(i, { nama: v })} />
            <GlassInput type="number" inputMode="decimal" value={String(k.harga)} disabled={disabled}
              onChange={(e) => setKomp(i, { harga: Number(e.target.value) })} className="w-28" />
            {!disabled && <button type="button" onClick={() => delKomp(i)} className="g-t4 text-sm px-1" aria-label="Hapus komponen">✕</button>}
          </div>
        ))}
        {!disabled && <button type="button" onClick={addKomp} className="text-[12px] g-t4 underline self-start">＋ Tambah komponen</button>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[12px] font-medium g-t2 flex items-center gap-2">
          Labor {disabled && <span className="text-[10px] g-t5">🔒 Edit di Beli</span>}
        </h2>
        {s.laborPresets.map((l, i) => (
          <div key={l.id} className="flex items-center gap-2 flex-wrap">
            <TxtField value={l.nama} disabled={disabled} ph="Nama" onChange={(v) => setLab(i, { nama: v })} />
            <GlassInput type="number" inputMode="decimal" placeholder="jam" value={l.jam ?? ""} disabled={disabled}
              onChange={(e) => setLab(i, { jam: e.target.value === "" ? undefined : Number(e.target.value) })} className="w-20" />
            <GlassInput type="number" inputMode="decimal" placeholder="rate/jam" value={l.ratePerJam ?? ""} disabled={disabled}
              onChange={(e) => setLab(i, { ratePerJam: e.target.value === "" ? undefined : Number(e.target.value) })} className="w-28" />
            <GlassInput type="number" inputMode="decimal" placeholder="flat" value={l.flat ?? ""} disabled={disabled}
              onChange={(e) => setLab(i, { flat: e.target.value === "" ? undefined : Number(e.target.value) })} className="w-24" />
            {!disabled && <button type="button" onClick={() => delLab(i)} className="g-t4 text-sm px-1" aria-label="Hapus labor">✕</button>}
          </div>
        ))}
        {!disabled && <button type="button" onClick={addLab} className="text-[12px] g-t4 underline self-start">＋ Tambah labor</button>}
      </section>

      <Group title="Packing" locked={disabled}>
        {PACKING_SIZES.map((sz) => (
          <NumField key={sz} label={`Packing ${sz}`} value={s.packingRates[sz]} disabled={disabled} onChange={(n) => setPack(sz, n)} />
        ))}
      </Group>
```

(`GlassInput` accepts `value={l.jam ?? ""}` — number|string; if TS complains, coerce with `String(l.jam ?? "")`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/settings-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/SettingsPanel.tsx apps/saas/components/settings-panel.test.tsx
git commit -m "feat(saas): SettingsPanel grup Komponen/Labor preset CRUD + Packing (dua-mode, TDD)"
```

---

### Task 6: KomponenLaborInput — blok input kalkulator (locked/unlocked)

**Files:**
- Create: `apps/saas/components/KomponenLaborInput.tsx`
- Test: `apps/saas/components/komponen-labor-input.test.tsx`

**Interfaces:**
- Consumes: `LocalSettings`, `PACKING_SIZES`, `PackingSize` (Task 1); `KomponenRow`, `LaborRow` (Task 2).
- Produces: `KomponenLaborInput` component with props:
  ```ts
  {
    locked: boolean;
    settings: LocalSettings;
    komponen: KomponenRow[];
    labor: LaborRow[];
    packing: PackingSize | undefined;
    onKomponenChange: (rows: KomponenRow[]) => void;
    onLaborChange: (rows: LaborRow[]) => void;
    onPackingChange: (p: PackingSize | undefined) => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/saas/components/komponen-labor-input.test.tsx`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KomponenLaborInput } from "./KomponenLaborInput";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

const baseProps = {
  settings: DEFAULT_LOCAL_SETTINGS,
  komponen: [], labor: [], packing: undefined as undefined,
  onKomponenChange: vi.fn(), onLaborChange: vi.fn(), onPackingChange: vi.fn(),
};

describe("KomponenLaborInput", () => {
  it("locked → 🔒 + CTA Beli, tak ada chip preset aktif", () => {
    render(<KomponenLaborInput {...baseProps} locked={true} />);
    expect(screen.getByText(/Buka di Beli|Beli/)).toBeTruthy();
    expect(screen.queryByText(/Gantungan kew-kew/)).toBeNull();
  });

  it("unlocked → klik chip preset komponen memanggil onKomponenChange dg row baru", () => {
    const onK = vi.fn();
    render(<KomponenLaborInput {...baseProps} locked={false} onKomponenChange={onK} />);
    fireEvent.click(screen.getByText(/Gantungan kew-kew/));
    expect(onK).toHaveBeenCalledTimes(1);
    const rows = onK.mock.calls[0][0];
    expect(rows[0]).toMatchObject({ nama: "Gantungan kew-kew", harga: 900, qty: 1 });
  });

  it("unlocked → toggle packing set lalu clear", () => {
    const onP = vi.fn();
    const { rerender } = render(<KomponenLaborInput {...baseProps} locked={false} onPackingChange={onP} />);
    fireEvent.click(screen.getByRole("button", { name: "Packing S" }));
    expect(onP).toHaveBeenCalledWith("S");
    rerender(<KomponenLaborInput {...baseProps} locked={false} packing="S" onPackingChange={onP} />);
    fireEvent.click(screen.getByRole("button", { name: "Packing S" }));
    expect(onP).toHaveBeenLastCalledWith(undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/komponen-labor-input.test.tsx`
Expected: FAIL (`./KomponenLaborInput` not found).

- [ ] **Step 3: Implement**

Create `apps/saas/components/KomponenLaborInput.tsx`:

```tsx
"use client";
import { GlassInput } from "@3pb/ui";
import { PACKING_SIZES, type LocalSettings, type PackingSize } from "@/lib/kalkulator/local-settings";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

export function KomponenLaborInput({
  locked, settings, komponen, labor, packing,
  onKomponenChange, onLaborChange, onPackingChange,
}: {
  locked: boolean;
  settings: LocalSettings;
  komponen: KomponenRow[];
  labor: LaborRow[];
  packing: PackingSize | undefined;
  onKomponenChange: (rows: KomponenRow[]) => void;
  onLaborChange: (rows: LaborRow[]) => void;
  onPackingChange: (p: PackingSize | undefined) => void;
}) {
  if (locked) {
    return (
      <div className="border-t border-[color:var(--g-row-border)] pt-3 mt-1">
        <div className="text-[12px] g-t3 font-medium flex items-center gap-2">🔒 Komponen, labor & packing</div>
        <p className="text-[11px] g-t4 mt-1">Tambah komponen, biaya labor & packing ke perhitungan.
          <a href="/beli" className="underline ml-1">Buka di Beli →</a></p>
      </div>
    );
  }

  const subKomp = komponen.reduce((s, r) => s + (r.harga > 0 ? r.harga * Math.max(1, r.qty) : 0), 0);
  const subLab = labor.reduce((s, r) => s + ((r.jam ?? 0) * (r.ratePerJam ?? 0) + (r.flat ?? 0)), 0);

  return (
    <div className="border-t border-[color:var(--g-row-border)] pt-3 mt-1 flex flex-col gap-3">
      {/* Packing */}
      <div>
        <div className="text-[11px] g-t3 mb-1">Packing</div>
        <div className="flex gap-2 flex-wrap">
          {PACKING_SIZES.map((sz) => (
            <button key={sz} type="button" aria-label={`Packing ${sz}`}
              onClick={() => onPackingChange(packing === sz ? undefined : sz)}
              className={`g-btn-ghost rounded-[10px] px-3 h-8 text-[12px] ${packing === sz ? "g-btn-active" : ""}`}>
              {sz} · {rupiah(settings.packingRates[sz])}
            </button>
          ))}
        </div>
      </div>

      {/* Komponen */}
      <div>
        <div className="text-[11px] g-t3 mb-1">Komponen tambahan</div>
        <div className="flex gap-2 flex-wrap mb-2">
          {settings.komponenPresets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onKomponenChange([...komponen, { id: crypto.randomUUID(), nama: p.nama, harga: p.harga, qty: 1 }])}
              className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px]">＋ {p.nama} ({rupiah(p.harga)})</button>
          ))}
          <button type="button"
            onClick={() => onKomponenChange([...komponen, { id: crypto.randomUUID(), nama: "", harga: 0, qty: 1 }])}
            className="text-[12px] g-t4 underline">＋ manual</button>
        </div>
        {komponen.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 mb-1">
            <GlassInput value={r.nama} placeholder="Nama" className="flex-1"
              onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
            <GlassInput type="number" inputMode="decimal" value={String(r.harga)} className="w-24"
              onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, harga: Number(e.target.value) } : x)))} />
            <GlassInput type="number" inputMode="numeric" value={String(r.qty)} className="w-16"
              onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
            <button type="button" aria-label="Hapus komponen" className="g-t4 text-sm px-1"
              onClick={() => onKomponenChange(komponen.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {subKomp > 0 && <div className="text-[11px] g-t4">Subtotal komponen: {rupiah(subKomp)}</div>}
      </div>

      {/* Labor */}
      <div>
        <div className="text-[11px] g-t3 mb-1">Labor</div>
        <div className="flex gap-2 flex-wrap mb-2">
          {settings.laborPresets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onLaborChange([...labor, { id: crypto.randomUUID(), nama: p.nama, jam: p.jam, ratePerJam: p.ratePerJam, flat: p.flat }])}
              className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px]">＋ {p.nama}</button>
          ))}
          <button type="button"
            onClick={() => onLaborChange([...labor, { id: crypto.randomUUID(), nama: "" }])}
            className="text-[12px] g-t4 underline">＋ manual</button>
        </div>
        {labor.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 mb-1 flex-wrap">
            <GlassInput value={r.nama} placeholder="Nama" className="flex-1"
              onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
            <GlassInput type="number" inputMode="decimal" placeholder="jam" value={r.jam ?? ""} className="w-16"
              onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, jam: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
            <GlassInput type="number" inputMode="decimal" placeholder="rate" value={r.ratePerJam ?? ""} className="w-24"
              onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, ratePerJam: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
            <GlassInput type="number" inputMode="decimal" placeholder="flat" value={r.flat ?? ""} className="w-20"
              onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, flat: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
            <button type="button" aria-label="Hapus labor" className="g-t4 text-sm px-1"
              onClick={() => onLaborChange(labor.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {subLab > 0 && <div className="text-[11px] g-t4">Subtotal labor: {rupiah(subLab)}</div>}
      </div>
    </div>
  );
}
```

Note: `g-btn-active` may not exist as a utility. If it isn't defined in `@3pb/ui` glass.css, replace with an inline style on the active toggle: `style={packing === sz ? { outline: "2px solid var(--g-accent)" } : undefined}` and drop the `g-btn-active` class. The implementer should grep `packages/ui/src/glass.css` for `g-btn-active`; if absent, use the inline style.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/komponen-labor-input.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/KomponenLaborInput.tsx apps/saas/components/komponen-labor-input.test.tsx
git commit -m "feat(saas): KomponenLaborInput blok kalkulator (locked Free / editable Beli, TDD)"
```

---

### Task 7: Calculator wiring — state add-on + gating paidCore

**Files:**
- Modify: `apps/saas/components/Calculator.tsx`
- Test: `apps/saas/components/calculator.test.tsx` (append)

**Interfaces:**
- Consumes: `KomponenLaborInput` (Task 6); `fullView` accepting `komponen/labor/packing` (Task 3); `KomponenRow`/`LaborRow` (Task 2); `PackingSize` (Task 1). Existing props `{ authenticated, paidCore=false, userId=null }`.
- Produces: kalkulator meneruskan add-on ke `fullView` HANYA bila `paidCore`.

- [ ] **Step 1: Write the failing test**

Append to `apps/saas/components/calculator.test.tsx`:

```ts
it("paidCore=false → blok add-on terkunci (🔒), tak ada chip preset", () => {
  render(<Calculator authenticated={true} paidCore={false} userId="u1" />);
  expect(screen.getByText(/🔒 Komponen/)).toBeTruthy();
  expect(screen.queryByText(/Gantungan kew-kew/)).toBeNull();
});

it("paidCore=true → chip preset komponen muncul (blok editable)", async () => {
  render(<Calculator authenticated={true} paidCore={true} userId="u1" />);
  // settings default dipakai walau loadSettings async; chip dari DEFAULT
  await waitFor(() => expect(screen.getByText(/Gantungan kew-kew/)).toBeTruthy());
});
```

(If `calculator.test.tsx` mocks `@/lib/store/local-settings`, ensure `loadSettings` resolves to `DEFAULT_LOCAL_SETTINGS` so chips render. Reuse the existing mock in that file; if it returns `{}`, change it to return `DEFAULT_LOCAL_SETTINGS`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/calculator.test.tsx`
Expected: FAIL (no add-on block rendered yet).

- [ ] **Step 3: Implement**

Edit `apps/saas/components/Calculator.tsx`:

Add imports:
```ts
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";
import type { PackingSize } from "@/lib/kalkulator/local-settings";
import { KomponenLaborInput } from "./KomponenLaborInput";
```

Add state (near existing `useState` calls):
```ts
  const [komponen, setKomponen] = useState<KomponenRow[]>([]);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [packing, setPacking] = useState<PackingSize | undefined>(undefined);
```

Change the `view` computation to pass add-ons ONLY when `paidCore` (Free defense):
```ts
  const addon = paidCore ? { komponen, labor, packing } : {};
  const view = valid ? fullView({ gramasi: g, durasiJam: d, tipe, ...addon }, settings) : null;
```

Render `<KomponenLaborInput>` inside the Hasil `GlassCard`, right before the closing of the results `div` (after the `<button>` "Simpan hasil..." block, still inside `!view ? ... : (<div>...)`). Insert:
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
```

(Place it just before the closing `</div>` that wraps the results column, so it appears under the numbers. It must be within the `view` branch so it renders alongside results; if you prefer it always visible, place it after the `GlassCard` grid — but keep it inside the `authenticated` area. Simplest: put it as the last child of the Hasil `GlassCard`'s inner `<div className="flex flex-col gap-3">`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/calculator.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/Calculator.tsx apps/saas/components/calculator.test.tsx
git commit -m "feat(saas): kalkulator blok komponen/labor/packing + gating paidCore (Free terkunci, TDD)"
```

---

### Task 8: Verifikasi akhir + docs (deploy GATED)

**Files:**
- Modify: `apps/saas/README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: whole-workspace green; README note; NO deploy.

- [ ] **Step 1: Update README**

Edit `apps/saas/README.md` — add under the settings bullet (after the 1b-1 line):
```markdown
- Komponen & Labor (Beli, 1b-2): preset komponen/labor CRUD + packing rate di `/settings` (dua-mode); di kalkulator blok "Komponen & Labor" (chip preset + baris manual + toggle packing) terkunci untuk Free. `lib/kalkulator/compose.ts` → `buildInputV2`. Parity Free dijaga (tanpa add-on = angka lama). Multi-plate = 1b-3, save hasil = 1b-4.
```

- [ ] **Step 2: Regenerate Prisma client (hindari gotcha monorepo) + full test**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter @3pb/saas exec prisma generate
pnpm turbo test
```
Expected: 6/6 packages pass (saas test count naik dari 132 dengan test 1b-2 baru).

- [ ] **Step 3: Regenerate dashboard client + full build**

The saas `prisma generate` clobbers the shared `@prisma/client` store entry (documented gotcha). Regenerate the dashboard client so `pnpm turbo build` is green:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx prisma generate && cd ../..
pnpm turbo build
```
Expected: 3/3 build tasks successful.

- [ ] **Step 4: Guard — no leaked secret**

Run: `git diff --stat apps/saas/.env.deploy.example`
Expected: EMPTY (no change). If it shows a diff, run `git checkout -- apps/saas/.env.deploy.example` before committing (never commit a real token into the tracked example).

- [ ] **Step 5: Commit**

```bash
git add apps/saas/README.md
git commit -m "docs(saas): catat komponen/labor/packing 1b-2 di README"
```

- [ ] **Step 6: Deploy — GATED**

Do NOT run `bash apps/saas/deploy.sh`. Deploy is gated on explicit user go-ahead. Report completion and await instruction.

---

## Self-Review (penulis plan)

**Spec coverage:** §1 keputusan → Task 1 (preset CRUD types + validate), Task 5 (CRUD UI), Task 6 (input locked Free), Task 3 (compose→buildInputV2 parity). §2 data model → Task 1 + Task 4 (merge migrasi). §3 compose → Task 2. §4 input kalkulator → Task 6 + Task 7. §5 settings 3 grup → Task 5. §6 gating/parity → Task 3 (parity) + Task 7 (paidCore guard). §7 testing → tiap task punya test; regresi via Task 8 `turbo test`. §8 deploy gated → Task 8 Step 6. Semua tercakup.

**Placeholder scan:** tak ada TBD/TODO; tiap step kode lengkap. Satu conditional guidance (`g-btn-active` grep → fallback inline style) diberi instruksi konkret, bukan placeholder.

**Type consistency:** `KomponenPreset {id,nama,harga}` / `LaborPreset {id,nama,jam?,ratePerJam?,flat?}` / `PackingSize` / `PACKING_SIZES` (Task 1) dipakai konsisten di Task 5/6. `KomponenRow`/`LaborRow` (Task 2) dipakai Task 3/6/7. `composeKomponen(packing, packingRates, rows)` / `composeLabor(rows)` (Task 2) dipanggil Task 3 dg urutan arg sama. `CalcInput.komponen?/labor?/packing?` (Task 3) di-set Task 7. `KomponenLaborInput` props (Task 6) dipanggil Task 7 dg nama callback identik (`onKomponenChange`/`onLaborChange`/`onPackingChange`). Konsisten.
