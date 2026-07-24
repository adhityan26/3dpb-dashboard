# Fase 1b-6b Stage 2 — Konsumen saas + UI import 3MF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User Pro bisa import file `.3mf`/`.gcode.3mf` di kalkulator saas → plates/materials/batch terisi otomatis dari data slicer, dengan tarif filament dicocokkan ke katalog (1b-6a).

**Architecture:** Fungsi murni `buildImportDraft` (map hasil parse 3MF → draft internal) → orkestrator async `importSlicerFile` (baca ZIP + parse + build draft, semua di browser) → UI di `PlateInput.tsx` (tombol upload, gated Pro, konversi draft ke `PlateRow[]` lalu panggil `onPlatesChange`/`onBatchChange`).

**Tech Stack:** TypeScript, Next.js 16 client component, vitest + @testing-library/react, `jszip` (lewat `@3pb/kalkulator-core/import-3mf`, sudah merged di master `604f900`).

## Global Constraints

- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum tiap command shell.
- **JANGAN** `crypto.randomUUID()` langsung — selalu `newId()` dari `@/lib/id` (lihat `apps/saas/lib/id.ts`) untuk semua id baru (plate, material).
- **JANGAN** ubah `packages/kalkulator-core` — parser 3MF di sana sudah final, dipakai apa adanya lewat `@3pb/kalkulator-core/import-3mf`.
- `lib/` tetap independen dari `components/` — tipe draft (`ImportedPlate`/`ImportedMaterial`/`ImportDraft`) murni milik `lib/kalkulator/import-3mf/`, TIDAK import `PlateRow` dari `components/PlateInput.tsx`. Konversi ke `PlateRow` terjadi di `PlateInput.tsx`.
- Matching filament katalog = **brand+material exact, case-insensitive**. Warna TIDAK dipakai untuk matching, hanya ditampilkan.
- Tombol import hanya tampil saat `!locked` (Pro) — konsisten dengan gating multi-plate/multi-material yang sudah ada.
- Dependency baru harus dideklarasikan eksplisit di `package.json` (pnpm strict, tidak ada phantom dependency).
- Setiap task diakhiri: jalankan `pnpm --filter @3pb/saas test` (semua test project harus hijau) sebelum commit.

---

### Task 1: `buildImportDraft` — mapping murni hasil parse 3MF ke draft saas

**Files:**
- Create: `apps/saas/lib/kalkulator/import-3mf/build-draft.ts`
- Create: `apps/saas/lib/kalkulator/import-3mf/build-draft.test.ts`

**Interfaces:**
- Consumes: `SliceInfoPlate`, `ModelSettingsPlate`, `ProjectFilamentSlot` dari `@3pb/kalkulator-core/import-3mf` (sudah ada di master); `FilamentEntry` dari `apps/saas/lib/kalkulator/local-settings.ts` (fields: `id, brand, material, tipe: "FDM"|"SLA", warna, warnaHex?, hppPerGram, jualPerGram, failureRatePct?`).
- Produces: `ImportedMaterial { filamentId?: string; tipe: "FDM"|"SLA"; gramasi: number; warnaHex?: string }`, `ImportedPlate { nama: string; durasiJam: number; materials: ImportedMaterial[] }`, `ImportDraft { nama: string; plates: ImportedPlate[]; batch: number; isSliced: boolean; warnings: string[] }`, `BuildImportDraftInput { fileName: string; slicePlates: SliceInfoPlate[]; modelPlates: ModelSettingsPlate[]; filamentSlots: ProjectFilamentSlot[]; filamentCatalog: FilamentEntry[] }`, fungsi `buildImportDraft(input: BuildImportDraftInput): ImportDraft`. Task 2 (`index.ts`) memanggil `buildImportDraft` langsung.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/saas/lib/kalkulator/import-3mf/build-draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildImportDraft, type BuildImportDraftInput } from "./build-draft";
import type { FilamentEntry } from "../local-settings";

const fil = (over: Partial<FilamentEntry> = {}): FilamentEntry => ({
  id: "fil-a", brand: "eSUN", material: "PLA+", tipe: "FDM", warna: "Putih", warnaHex: "#f5f5f5",
  hppPerGram: 300, jualPerGram: 900, ...over,
});

describe("buildImportDraft", () => {
  it("plate 2 filament: satu match katalog, satu tak match → fallback + warning", () => {
    const input: BuildImportDraftInput = {
      fileName: "Print.gcode.3mf",
      slicePlates: [{
        index: 1, weightG: 30, predictionSec: 3600, printerModelId: "C12", objectCount: 1,
        filaments: [
          { id: 1, type: "PLA", color: "#ffffff", usedG: 10 },
          { id: 2, type: "PETG", color: "#000000", usedG: 20 },
        ],
      }],
      modelPlates: [{ platerId: 1, platerName: "Bagian A", objectCount: 1 }],
      filamentSlots: [{ vendor: "eSUN", type: "PLA+" }, { vendor: "Unknown Brand", type: "PETG" }],
      filamentCatalog: [fil()],
    };
    const draft = buildImportDraft(input);
    expect(draft.nama).toBe("Print");
    expect(draft.isSliced).toBe(true);
    expect(draft.plates).toHaveLength(1);
    expect(draft.plates[0].nama).toBe("Bagian A");
    expect(draft.plates[0].durasiJam).toBe(1);
    expect(draft.plates[0].materials[0]).toMatchObject({ filamentId: "fil-a", tipe: "FDM", gramasi: 10, warnaHex: "#ffffff" });
    expect(draft.plates[0].materials[1]).toMatchObject({ filamentId: undefined, tipe: "FDM", gramasi: 20, warnaHex: "#000000" });
    expect(draft.warnings).toEqual([`Filament "Unknown Brand PETG" belum ada di katalog — pakai tarif default`]);
  });

  it("multi-plate → nama tiap plate dari model-settings, batch dari objectCount plate pertama", () => {
    const input: BuildImportDraftInput = {
      fileName: "Multi.3mf",
      slicePlates: [
        { index: 1, weightG: 10, predictionSec: 1800, printerModelId: null, objectCount: 2, filaments: [{ id: 1, type: "PLA", color: "#111111", usedG: 5 }] },
        { index: 2, weightG: 10, predictionSec: 1800, printerModelId: null, objectCount: 2, filaments: [{ id: 1, type: "PLA", color: "#111111", usedG: 5 }] },
      ],
      modelPlates: [
        { platerId: 1, platerName: "Bawah", objectCount: 2 },
        { platerId: 2, platerName: "Atas", objectCount: 2 },
      ],
      filamentSlots: [{ vendor: "eSUN", type: "PLA+" }],
      filamentCatalog: [fil()],
    };
    const draft = buildImportDraft(input);
    expect(draft.plates.map((p) => p.nama)).toEqual(["Bawah", "Atas"]);
    expect(draft.batch).toBe(2);
  });

  it("plate tanpa nama dari model-settings & tanpa filament → fallback 'Plate N' + material default", () => {
    const input: BuildImportDraftInput = {
      fileName: "NoName.3mf",
      slicePlates: [{ index: 1, weightG: 10, predictionSec: 1800, printerModelId: null, objectCount: 1, filaments: [] }],
      modelPlates: [],
      filamentSlots: [],
      filamentCatalog: [],
    };
    const draft = buildImportDraft(input);
    expect(draft.plates[0].nama).toBe("Plate 1");
    expect(draft.plates[0].materials).toEqual([{ tipe: "FDM", gramasi: 0 }]);
  });

  it("belum di-slice → isSliced false, gram/durasi 0, warning", () => {
    const input: BuildImportDraftInput = {
      fileName: "Unsliced.3mf",
      slicePlates: [],
      modelPlates: [{ platerId: 1, platerName: "Bagian A", objectCount: 3 }],
      filamentSlots: [],
      filamentCatalog: [],
    };
    const draft = buildImportDraft(input);
    expect(draft.isSliced).toBe(false);
    expect(draft.plates).toEqual([{ nama: "Bagian A", durasiJam: 0, materials: [{ tipe: "FDM", gramasi: 0 }] }]);
    expect(draft.batch).toBe(3);
    expect(draft.warnings).toEqual(["File belum di-slice — isi berat & durasi manual."]);
  });

  it("tipeFromMaterial: resin/UV → SLA (filament tak match katalog)", () => {
    const input: BuildImportDraftInput = {
      fileName: "Resin.3mf",
      slicePlates: [{ index: 1, weightG: 10, predictionSec: 3600, printerModelId: null, objectCount: 1, filaments: [{ id: 1, type: "Resin", color: "#ababab", usedG: 15 }] }],
      modelPlates: [],
      filamentSlots: [{ vendor: "Anycubic", type: "Resin" }],
      filamentCatalog: [],
    };
    const draft = buildImportDraft(input);
    expect(draft.plates[0].materials[0].tipe).toBe("SLA");
  });

  it("batch fallback 1 kalau objectCount plate pertama 0", () => {
    const input: BuildImportDraftInput = {
      fileName: "Zero.3mf",
      slicePlates: [{ index: 1, weightG: 10, predictionSec: 3600, printerModelId: null, objectCount: 0, filaments: [] }],
      modelPlates: [],
      filamentSlots: [],
      filamentCatalog: [],
    };
    const draft = buildImportDraft(input);
    expect(draft.batch).toBe(1);
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal (build-draft.ts belum ada)**

Run: `cd apps/saas && pnpm exec vitest run lib/kalkulator/import-3mf/build-draft.test.ts`
Expected: FAIL — `Cannot find module './build-draft'`.

- [ ] **Step 3: Implementasi `build-draft.ts`**

```ts
import type { SliceInfoPlate, ModelSettingsPlate, ProjectFilamentSlot } from "@3pb/kalkulator-core/import-3mf";
import type { FilamentEntry } from "../local-settings";

export interface ImportedMaterial {
  filamentId?: string;
  tipe: "FDM" | "SLA";
  gramasi: number;
  warnaHex?: string;
}

export interface ImportedPlate {
  nama: string;
  durasiJam: number;
  materials: ImportedMaterial[];
}

export interface ImportDraft {
  nama: string;
  plates: ImportedPlate[];
  batch: number;
  isSliced: boolean;
  warnings: string[];
}

export interface BuildImportDraftInput {
  fileName: string;
  slicePlates: SliceInfoPlate[];
  modelPlates: ModelSettingsPlate[];
  filamentSlots: ProjectFilamentSlot[];
  filamentCatalog: FilamentEntry[];
}

const UNSLICED_WARNING = "File belum di-slice — isi berat & durasi manual.";
const FALLBACK_MATERIAL: ImportedMaterial = { tipe: "FDM", gramasi: 0 };

function deriveNama(fileName: string): string {
  return fileName.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, "");
}

function tipeFromMaterial(material: string): "FDM" | "SLA" {
  return /resin|uv/i.test(material) ? "SLA" : "FDM";
}

function findFilamentMatch(brand: string, material: string, catalog: FilamentEntry[]): FilamentEntry | undefined {
  return catalog.find(
    (f) => f.brand.toLowerCase() === brand.toLowerCase() && f.material.toLowerCase() === material.toLowerCase(),
  );
}

function buildMaterial(
  filament: { id: number; type: string; color: string; usedG: number },
  filamentSlots: ProjectFilamentSlot[],
  catalog: FilamentEntry[],
  warnings: string[],
): ImportedMaterial {
  const slot = filamentSlots[filament.id - 1];
  const brand = slot?.vendor ?? "";
  const material = slot?.type || filament.type;
  const match = findFilamentMatch(brand, material, catalog);
  if (!match) {
    warnings.push(`Filament "${brand} ${material}" belum ada di katalog — pakai tarif default`);
  }
  return {
    filamentId: match?.id,
    tipe: match?.tipe ?? tipeFromMaterial(material),
    gramasi: filament.usedG,
    warnaHex: filament.color,
  };
}

function namaPlate(modelPlate: ModelSettingsPlate | undefined, index: number): string {
  return modelPlate?.platerName?.trim() || `Plate ${index + 1}`;
}

function buildSlicedPlate(
  slicePlate: SliceInfoPlate,
  modelPlate: ModelSettingsPlate | undefined,
  index: number,
  filamentSlots: ProjectFilamentSlot[],
  catalog: FilamentEntry[],
  warnings: string[],
): ImportedPlate {
  const durasiJam = Math.round((slicePlate.predictionSec / 3600) * 100) / 100;
  const materials = slicePlate.filaments.map((f) => buildMaterial(f, filamentSlots, catalog, warnings));
  return {
    nama: namaPlate(modelPlate, index),
    durasiJam,
    materials: materials.length > 0 ? materials : [{ ...FALLBACK_MATERIAL }],
  };
}

function buildUnslicedPlate(modelPlate: ModelSettingsPlate | undefined, index: number): ImportedPlate {
  return { nama: namaPlate(modelPlate, index), durasiJam: 0, materials: [{ ...FALLBACK_MATERIAL }] };
}

export function buildImportDraft(input: BuildImportDraftInput): ImportDraft {
  const { fileName, slicePlates, modelPlates, filamentSlots, filamentCatalog } = input;
  const isSliced = slicePlates.length > 0;
  const warnings: string[] = [];

  const plates: ImportedPlate[] = isSliced
    ? slicePlates.map((sp, i) => buildSlicedPlate(sp, modelPlates[i], i, filamentSlots, filamentCatalog, warnings))
    : modelPlates.length > 0
      ? modelPlates.map((mp, i) => buildUnslicedPlate(mp, i))
      : [buildUnslicedPlate(undefined, 0)];

  if (!isSliced) warnings.push(UNSLICED_WARNING);

  const firstCount = (isSliced ? slicePlates[0] : modelPlates[0])?.objectCount;
  const batch = firstCount && firstCount > 0 ? firstCount : 1;

  return { nama: deriveNama(fileName), plates, batch, isSliced, warnings };
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/saas && pnpm exec vitest run lib/kalkulator/import-3mf/build-draft.test.ts`
Expected: PASS, 6/6 test hijau.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/import-3mf/build-draft.ts apps/saas/lib/kalkulator/import-3mf/build-draft.test.ts
git commit -m "feat(saas): buildImportDraft — mapping murni hasil parse 3MF ke draft (1b-6b)"
```

---

### Task 2: `importSlicerFile` — orkestrator baca ZIP + parse + build draft

**Files:**
- Create: `apps/saas/lib/kalkulator/import-3mf/index.ts`
- Create: `apps/saas/lib/kalkulator/import-3mf/index.test.ts`
- Modify: `apps/saas/package.json` (tambah `jszip` devDependency, dipakai `index.test.ts` untuk bikin fixture ZIP)

**Interfaces:**
- Consumes: `buildImportDraft` dari Task 1 (`./build-draft`); `readGcode3mfEntries`, `parseSliceInfo`, `parseModelSettingsPlates`, `parseProjectSettingsFilamentSlots` dari `@3pb/kalkulator-core/import-3mf` (sudah ada, jangan diubah); `FilamentEntry` dari `../local-settings`.
- Produces: `importSlicerFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null>`. Task 3 (UI di `PlateInput.tsx`) memanggil fungsi ini langsung dengan `File` dari `<input type="file">` dan `filaments` (prop `filaments` yang sudah diterima `PlateInput`).

- [ ] **Step 1: Tambah `jszip` sebagai devDependency**

Di `apps/saas/package.json`, tambahkan baris `"jszip": "^3.10.1",` di objek `devDependencies`, urutan alfabetis (setelah `"jsdom": "^25.0.1",`, sebelum `"prisma": "^7.7.0",`):

```json
    "jsdom": "^25.0.1",
    "jszip": "^3.10.1",
    "prisma": "^7.7.0",
```

Lalu jalankan:

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm install --filter @3pb/saas`
Expected: install sukses, `jszip` muncul di `apps/saas/node_modules/jszip` (atau ter-resolve via pnpm workspace store).

- [ ] **Step 2: Tulis test yang gagal**

Buat `apps/saas/lib/kalkulator/import-3mf/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { importSlicerFile } from "./index";

async function makeFile(name: string, files: Record<string, string>): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const buf = await zip.generateAsync({ type: "arraybuffer" });
  return new File([buf], name);
}

const SLICE_INFO_XML = `<config><plate>
  <metadata key="index" value="1"/>
  <metadata key="printer_model_id" value="C12"/>
  <metadata key="prediction" value="3600"/>
  <metadata key="weight" value="10"/>
  <object identify_id="1" name="A" skipped="false" />
  <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="1" used_g="10"/>
</plate></config>`;

const MODEL_SETTINGS_XML = `<config><plate>
  <metadata key="plater_id" value="1"/>
  <metadata key="plater_name" value="plate-1"/>
  <model_instance><metadata key="object_id" value="1"/><metadata key="identify_id" value="1"/></model_instance>
</plate></config>`;

const PROJECT_SETTINGS_JSON = JSON.stringify({ filament_vendor: ["Bambu Lab"], filament_type: ["PLA"] });

describe("importSlicerFile", () => {
  it("parses a full .gcode.3mf end-to-end into ImportDraft", async () => {
    const file = await makeFile("My Print.gcode.3mf", {
      "Metadata/model_settings.config": MODEL_SETTINGS_XML,
      "Metadata/project_settings.config": PROJECT_SETTINGS_JSON,
      "Metadata/slice_info.config": SLICE_INFO_XML,
    });
    const draft = await importSlicerFile(file, []);
    expect(draft).not.toBeNull();
    expect(draft!.nama).toBe("My Print");
    expect(draft!.isSliced).toBe(true);
    expect(draft!.plates).toHaveLength(1);
    expect(draft!.plates[0].materials[0]).toMatchObject({ gramasi: 10, warnaHex: "#000000" });
  });

  it("returns null for a non-3MF ZIP", async () => {
    const file = await makeFile("random.zip", { "readme.txt": "hi" });
    const draft = await importSlicerFile(file, []);
    expect(draft).toBeNull();
  });

  it("returns null for a corrupt file", async () => {
    const file = new File([new TextEncoder().encode("garbage")], "broken.3mf");
    const draft = await importSlicerFile(file, []);
    expect(draft).toBeNull();
  });
});
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `cd apps/saas && pnpm exec vitest run lib/kalkulator/import-3mf/index.test.ts`
Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 4: Implementasi `index.ts`**

```ts
import {
  readGcode3mfEntries,
  parseSliceInfo,
  parseModelSettingsPlates,
  parseProjectSettingsFilamentSlots,
} from "@3pb/kalkulator-core/import-3mf";
import type { FilamentEntry } from "../local-settings";
import { buildImportDraft, type ImportDraft } from "./build-draft";

/** Parse file .3mf/.gcode.3mf jadi draft siap pakai untuk PlateInput.
 *  Semua parsing terjadi di browser — file tidak pernah di-upload ke server. */
export async function importSlicerFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null> {
  const buf = await file.arrayBuffer();
  const entries = await readGcode3mfEntries(buf);
  if (!entries) return null;

  const slicePlates = entries.sliceInfoXml ? parseSliceInfo(entries.sliceInfoXml) : [];
  const modelPlates = entries.modelSettingsXml ? parseModelSettingsPlates(entries.modelSettingsXml) : [];
  const filamentSlots = entries.projectSettingsJson ? parseProjectSettingsFilamentSlots(entries.projectSettingsJson) : [];

  return buildImportDraft({ fileName: file.name, slicePlates, modelPlates, filamentSlots, filamentCatalog: filaments });
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `cd apps/saas && pnpm exec vitest run lib/kalkulator/import-3mf/index.test.ts`
Expected: PASS, 3/3 test hijau.

- [ ] **Step 6: Commit**

```bash
git add apps/saas/lib/kalkulator/import-3mf/index.ts apps/saas/lib/kalkulator/import-3mf/index.test.ts apps/saas/package.json pnpm-lock.yaml
git commit -m "feat(saas): importSlicerFile — orkestrator baca ZIP 3MF + parse + build draft (1b-6b)"
```

---

### Task 3: UI import di `PlateInput.tsx` — tombol, gating Pro, konversi ke `PlateRow`

**Files:**
- Modify: `apps/saas/components/PlateInput.tsx`
- Modify: `apps/saas/components/PlateInput.test.tsx`

**Interfaces:**
- Consumes: `importSlicerFile` dari Task 2 (`@/lib/kalkulator/import-3mf`); `PlateRow`, `PlateMaterial`, `newId` — semua sudah ada di file ini.
- Produces: tidak ada interface baru untuk task lain — ini task terakhir dari Stage 2.

- [ ] **Step 1: Tulis test yang gagal**

`apps/saas/components/PlateInput.test.tsx` — ubah baris import paling atas (baris 1-6 saat ini):

Ganti:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PlateInput, newPlateRow, type PlateRow } from "./PlateInput";
```

Jadi:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PlateInput, newPlateRow, type PlateRow } from "./PlateInput";
import { importSlicerFile } from "@/lib/kalkulator/import-3mf";

vi.mock("@/lib/kalkulator/import-3mf", () => ({ importSlicerFile: vi.fn() }));
```

Lalu tambahkan blok `describe` baru di AKHIR file (setelah `describe("1b-6a multi-material di plate", ...)` yang sudah ada, sebelum baris terakhir file):

```tsx
describe("1b-6b import file slicer", () => {
  const mockImport = importSlicerFile as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => { mockImport.mockReset(); });

  it("tombol import muncul untuk Pro, tidak untuk Free", () => {
    const { rerender } = render(<PlateInput {...base} locked={false} />);
    expect(screen.getByText(/Import file slicer/)).toBeTruthy();
    rerender(<PlateInput {...base} locked={true} />);
    expect(screen.queryByText(/Import file slicer/)).toBeNull();
  });

  it("pilih file valid → onPlatesChange/onBatchChange terpanggil + warning tampil", async () => {
    mockImport.mockResolvedValue({
      nama: "Print", batch: 2, isSliced: true, warnings: ["Filament X belum ada di katalog — pakai tarif default"],
      plates: [{ nama: "Plate 1", durasiJam: 1, materials: [{ tipe: "FDM", gramasi: 10 }] }],
    });
    const onP = vi.fn();
    const onB = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} onBatchChange={onB} />);
    const file = new File(["dummy"], "print.3mf");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onP).toHaveBeenCalled());
    expect(onP.mock.calls[0][0]).toHaveLength(1);
    expect(onP.mock.calls[0][0][0]).toMatchObject({ nama: "Plate 1", durasiJam: "1" });
    expect(onP.mock.calls[0][0][0].materials[0]).toMatchObject({ tipe: "FDM", gramasi: "10" });
    expect(onB).toHaveBeenCalledWith("2");
    expect(await screen.findByText(/Filament X belum ada di katalog/)).toBeTruthy();
  });

  it("file tidak dikenali → error inline tampil, plates tak berubah", async () => {
    mockImport.mockResolvedValue(null);
    const onP = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} />);
    const file = new File(["dummy"], "bad.zip");
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(/tidak dikenali/)).toBeTruthy();
    expect(onP).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd apps/saas && pnpm exec vitest run components/PlateInput.test.tsx`
Expected: FAIL — modul `@/lib/kalkulator/import-3mf` belum diimport di `PlateInput.tsx`, tombol "Import file slicer" belum ada di DOM.

- [ ] **Step 3: Implementasi di `PlateInput.tsx`**

Ganti baris 1-6 (import):
```tsx
"use client";
import Link from "next/link";
import { GlassInput, HexColorPicker, type HexColorPickerOption } from "@3pb/ui";
import { InfoTip } from "./InfoTip";
import { newId } from "@/lib/id";
import type { FilamentEntry } from "@/lib/kalkulator/local-settings";
```
Jadi:
```tsx
"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { GlassInput, HexColorPicker, type HexColorPickerOption } from "@3pb/ui";
import { InfoTip } from "./InfoTip";
import { newId } from "@/lib/id";
import { importSlicerFile } from "@/lib/kalkulator/import-3mf";
import type { FilamentEntry } from "@/lib/kalkulator/local-settings";
```

Sisipkan setelah `swatchOptions` (setelah baris `.map((x) => ({ id: x.id, colorName: x.warna, colorHex: x.warnaHex! }));` — baris 68 saat ini) dan SEBELUM komentar `// Fungsi render (bukan komponen ber-JSX-tag)...` (baris 70 saat ini):

```tsx
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (file: File) => {
    setImportError(null);
    setImportWarnings([]);
    const draft = await importSlicerFile(file, filaments);
    if (!draft) {
      setImportError("File tidak dikenali — pastikan file .3mf/.gcode.3mf dari Bambu Studio/OrcaSlicer.");
      return;
    }
    onPlatesChange(draft.plates.map((p) => ({
      id: newId(),
      nama: p.nama,
      durasiJam: String(p.durasiJam),
      materials: p.materials.map((m) => ({
        id: newId(),
        filamentId: m.filamentId,
        tipe: m.tipe,
        gramasi: String(m.gramasi),
        warnaHex: m.warnaHex,
      })),
    })));
    onBatchChange(String(draft.batch));
    setImportWarnings(draft.warnings);
  };

```

Ganti baris pembuka return unlocked (baris 151-155 saat ini):
```tsx
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] g-t3 flex items-center gap-1">Bagian cetak (plate)
        <InfoTip text="Satu produk bisa terdiri dari beberapa bagian cetak. Tiap plate punya berat & durasi sendiri; totalnya dijumlahkan jadi biaya produksi." /></div>

      {!multi ? (
```
Jadi:
```tsx
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] g-t3 flex items-center gap-1">Bagian cetak (plate)
        <InfoTip text="Satu produk bisa terdiri dari beberapa bagian cetak. Tiap plate punya berat & durasi sendiri; totalnya dijumlahkan jadi biaya produksi." /></div>

      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".3mf,.gcode.3mf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleImportFile(file);
          }}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="text-[11px] underline self-start" style={{ color: "var(--g-accent)" }}>⬆ Import file slicer</button>
      </div>
      {importError && <div className="text-[11px]" style={{ color: "#ef4444" }}>{importError}</div>}
      {importWarnings.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {importWarnings.map((w, i) => (
            <div key={i} className="text-[11px] g-t4">⚠ {w}</div>
          ))}
        </div>
      )}

      {!multi ? (
```

Sisa file (dari `/* ── Single plate (tak diubah) ── */` sampai akhir) TIDAK berubah.

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `cd apps/saas && pnpm exec vitest run components/PlateInput.test.tsx`
Expected: PASS, semua test hijau (test lama + 3 test baru).

- [ ] **Step 5: Jalankan seluruh suite saas**

Run: `cd apps/saas && pnpm test`
Expected: semua test project hijau, tidak ada regresi di file lain (khususnya `Calculator.test.tsx` kalau ada — props `PlateInput` tidak berubah signature-nya).

- [ ] **Step 6: Commit**

```bash
git add apps/saas/components/PlateInput.tsx apps/saas/components/PlateInput.test.tsx
git commit -m "feat(saas): tombol Import file slicer di PlateInput — Pro-only, isi plates/batch otomatis (1b-6b)"
```

---

## Verifikasi akhir (setelah Task 3)

- [ ] `cd /Users/adhityatangahu/Documents/shopee-analysis && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm turbo test` — seluruh monorepo (saas + dashboard + core) hijau, nol regresi.
- [ ] `pnpm --filter @3pb/saas build` — build Next.js lolos (memverifikasi tidak ada type error dari `@3pb/kalkulator-core/import-3mf` subpath import).
- [ ] Verifikasi manual di browser (dev server saas): login sebagai user Pro, buka kalkulator, klik "⬆ Import file slicer", upload file `.3mf`/`.gcode.3mf` asli dari Bambu Studio/OrcaSlicer kalau ada sample — plates terisi, warning tampil kalau filament tak match katalog. Cek juga user Free (`locked=true`) tidak melihat tombol.
