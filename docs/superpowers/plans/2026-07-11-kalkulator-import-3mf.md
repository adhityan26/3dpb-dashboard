# Import 3MF ke Kalkulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah tombol "Import dari 3MF" di form Kalkulasi Baru yang, dari file `.gcode.3mf` (hasil slice Bambu Studio/OrcaSlicer), otomatis mengisi Nama Kalkulasi, Batch, dan semua Part/Plate (tipe, gramasi, durasi, filament single/multi-material, printer) — sehingga user tidak perlu input manual ulang data yang sudah ada di file slice-nya.

**Architecture:** Parsing 100% client-side pakai `jszip` — file `.gcode.3mf` (bisa 20-30MB karena embed G-code) tidak pernah diupload ke server; browser buka ZIP-nya, ambil 3 file metadata kecil (`Metadata/slice_info.config`, `Metadata/project_settings.config`, `Metadata/model_settings.config`), parse pakai regex/`JSON.parse` murni (bukan `DOMParser`, supaya testable di Node/vitest tanpa jsdom), lalu hasil parse di-mapping ke bentuk `PlateInputApp[]` yang sudah dipakai `KalkulasiForm`/`PlateTable` — cocok langsung ke-`setPlates()`, tidak perlu adapter tambahan di form.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `jszip` (baru), Vitest (unit test parser murni di Node environment).

## Global Constraints

- Node 22 wajib untuk build/test lokal: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.
- 14 golden test di `packages/kalkulator-core/src/formula.test.ts` = kontrak paritas formula legacy — TIDAK boleh disentuh oleh plan ini (plan ini tidak menyentuh `kalkulator-core` sama sekali, hanya `apps/dashboard`).
- Semua parsing logic harus pure function (string/JSON in → object out), tidak boleh pakai `DOMParser`/browser-only API di layer parsing — supaya bisa di-unit-test di Vitest `environment: 'node'` (lihat `apps/dashboard/vitest.config.ts`) tanpa perlu jsdom.
- JSZip API dipakai di layer paling luar (`read-zip.ts`) saja — layer parsing di bawahnya cuma terima `string` mentah, tidak tahu soal ZIP/File sama sekali (unit-testable independen dari JSZip).
- Ikuti pola error-state existing di codebase: `useState<string|null>` + render inline (lihat `POForm.tsx`), BUKAN toast library (tidak ada toast lib di project ini).

---

## File Structure

```
apps/dashboard/lib/kalkulator/import-3mf/
  types.ts                 # shared types: SliceInfoPlate, ModelSettingsPlate, ProjectFilamentSlot, Kalkulasi3mfDraft
  parse-slice-info.ts       # parseSliceInfo(xml) — Metadata/slice_info.config
  parse-model-settings.ts   # parseModelSettingsPlates(xml) — Metadata/model_settings.config
  parse-project-settings.ts # parseProjectSettingsFilamentSlots(json) — Metadata/project_settings.config
  printer-mapping.ts        # PRINTER_MODEL_ID_TOKEN map + matchPrinterProfile()
  read-zip.ts               # readGcode3mfEntries(buf) — JSZip glue, satu-satunya file yang import jszip
  build-draft.ts            # buildKalkulasi3mfDraft(...) — gabungkan semua parser jadi Kalkulasi3mfDraft
  index.ts                  # import3mfFile(file, deps) — orchestrator dipanggil dari UI
  __tests__/
    parse-slice-info.test.ts
    parse-model-settings.test.ts
    parse-project-settings.test.ts
    printer-mapping.test.ts
    read-zip.test.ts
    build-draft.test.ts

apps/dashboard/components/kalkulator/KalkulasiForm.tsx   # MODIFY — tombol import + wiring
apps/dashboard/package.json                                # MODIFY — tambah dependency jszip
```

Alasan pemisahan file: tiap parser py murni satu file = satu tanggung jawab (satu format metadata), gampang di-test isolated. `build-draft.ts` adalah satu-satunya tempat "kebijakan bisnis" (fallback naming, matching katalog, keputusan single/multi mode) supaya gampang direview/diubah tanpa nyentuh parser. `read-zip.ts` mengisolasi JSZip supaya parser di bawahnya reusable & testable tanpa dependency itu.

---

### Task 1: Tambah dependency `jszip` + shared types

**Files:**
- Modify: `apps/dashboard/package.json`
- Create: `apps/dashboard/lib/kalkulator/import-3mf/types.ts`

**Interfaces:**
- Produces: `SliceInfoFilament`, `SliceInfoPlate`, `ModelSettingsPlate`, `ProjectFilamentSlot`, `Raw3mfEntries`, `Kalkulasi3mfDraft` — dipakai oleh semua task berikutnya.

- [ ] **Step 1: Tambah dependency**

Edit `apps/dashboard/package.json`, tambahkan di blok `"dependencies"` (urutan alfabetis, setelah `"ioredis"`):

```json
    "ioredis": "^5.11.1",
    "jszip": "^3.10.1",
    "lucide-react": "^1.7.0",
```

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm install
```
Expected: `jszip` ter-install di `apps/dashboard/node_modules` (atau hoisted ke root), tidak ada error. JSZip sudah bundle TypeScript types sendiri (tidak perlu `@types/jszip`).

- [ ] **Step 2: Tulis shared types**

Create `apps/dashboard/lib/kalkulator/import-3mf/types.ts`:

```ts
import type { PlateInputApp } from "@/lib/kalkulator/types"

/** Satu <filament> di dalam satu <plate> — Metadata/slice_info.config */
export interface SliceInfoFilament {
  id: number
  type: string
  color: string
  usedG: number
}

/** Satu <plate> — Metadata/slice_info.config */
export interface SliceInfoPlate {
  index: number
  weightG: number
  predictionSec: number
  printerModelId: string | null
  objectCount: number
  filaments: SliceInfoFilament[]
}

/** Satu <plate> — Metadata/model_settings.config */
export interface ModelSettingsPlate {
  platerId: number
  platerName: string
  objectCount: number
}

/** Satu slot filament (AMS) — Metadata/project_settings.config, index 0-based selaras filament id-1 */
export interface ProjectFilamentSlot {
  vendor: string
  type: string
}

/** 3 file metadata mentah yang diekstrak dari ZIP .3mf */
export interface Raw3mfEntries {
  sliceInfoXml: string | null
  projectSettingsJson: string | null
  modelSettingsXml: string | null
}

/** Hasil akhir siap di-apply ke state form KalkulasiForm */
export interface Kalkulasi3mfDraft {
  nama: string
  batch: number
  plates: PlateInputApp[]
  isSliced: boolean
  warnings: string[]
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/package.json apps/dashboard/lib/kalkulator/import-3mf/types.ts pnpm-lock.yaml
git commit -m "feat(kalkulator): setup import-3mf module — jszip dep + shared types"
```

---

### Task 2: `parseSliceInfo` — parser `Metadata/slice_info.config`

**Files:**
- Create: `apps/dashboard/lib/kalkulator/import-3mf/parse-slice-info.ts`
- Test: `apps/dashboard/lib/kalkulator/import-3mf/__tests__/parse-slice-info.test.ts`

**Interfaces:**
- Consumes: `SliceInfoPlate`, `SliceInfoFilament` dari `./types` (Task 1)
- Produces: `parseSliceInfo(xml: string): SliceInfoPlate[]` — array kosong `[]` berarti file belum di-slice (tidak ada `<plate>` block). Dipakai oleh `build-draft.ts` (Task 7).

- [ ] **Step 1: Tulis failing test**

Create `apps/dashboard/lib/kalkulator/import-3mf/__tests__/parse-slice-info.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseSliceInfo } from "../parse-slice-info"

const SLICED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Version" value="02.07.01.62"/>
  </header>
  <plate>
    <metadata key="index" value="1"/>
    <metadata key="printer_model_id" value="C12"/>
    <metadata key="prediction" value="19939"/>
    <metadata key="weight" value="114.44"/>
    <object identify_id="7038" name="Assembly" skipped="false" />
    <object identify_id="7329" name="Assembly" skipped="false" />
    <object identify_id="9999" name="Assembly" skipped="true" />
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="31.76" used_g="96.26" group_id="0"/>
    <filament id="2" tray_info_idx="GFA00" type="PLA" color="#FE7E62" used_m="0.42" used_g="1.28" group_id="0"/>
  </plate>
  <plate>
    <metadata key="index" value="2"/>
    <metadata key="printer_model_id" value="C12"/>
    <metadata key="prediction" value="30867"/>
    <metadata key="weight" value="245.82"/>
    <object identify_id="7198" name="Assembly" skipped="false" />
    <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="80.15" used_g="242.90" group_id="0"/>
  </plate>
</config>`

const UNSLICED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Version" value="02.07.01.62"/>
  </header>
</config>`

describe("parseSliceInfo", () => {
  it("parses each <plate> block with metadata, object count (excluding skipped), and filaments", () => {
    const plates = parseSliceInfo(SLICED_XML)
    expect(plates).toHaveLength(2)

    expect(plates[0]).toEqual({
      index: 1,
      weightG: 114.44,
      predictionSec: 19939,
      printerModelId: "C12",
      objectCount: 2, // 3 objects total, 1 skipped="true" excluded
      filaments: [
        { id: 1, type: "PLA", color: "#000000", usedG: 96.26 },
        { id: 2, type: "PLA", color: "#FE7E62", usedG: 1.28 },
      ],
    })
    expect(plates[1].index).toBe(2)
    expect(plates[1].objectCount).toBe(1)
    expect(plates[1].filaments).toHaveLength(1)
  })

  it("returns empty array for a file with no <plate> blocks (unsliced)", () => {
    expect(parseSliceInfo(UNSLICED_XML)).toEqual([])
  })

  it("returns empty array for empty/garbage input", () => {
    expect(parseSliceInfo("")).toEqual([])
    expect(parseSliceInfo("not xml at all")).toEqual([])
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/parse-slice-info.test.ts
```
Expected: FAIL — `Cannot find module '../parse-slice-info'`.

- [ ] **Step 3: Implementasi minimal**

Create `apps/dashboard/lib/kalkulator/import-3mf/parse-slice-info.ts`:

```ts
import type { SliceInfoPlate, SliceInfoFilament } from "./types"

function metaValue(block: string, key: string): string | null {
  const m = block.match(new RegExp(`<metadata key="${key}" value="([^"]*)"`))
  return m ? m[1] : null
}

function metaNumber(block: string, key: string): number {
  const v = metaValue(block, key)
  return v != null ? parseFloat(v) || 0 : 0
}

function parseObjects(block: string): { skipped: boolean }[] {
  const matches = block.matchAll(/<object\s+identify_id="[^"]*"[^>]*skipped="([^"]*)"/g)
  return Array.from(matches, m => ({ skipped: m[1] === "true" }))
}

function parseFilaments(block: string): SliceInfoFilament[] {
  const matches = block.matchAll(
    /<filament\s+id="(\d+)"[^>]*type="([^"]*)"[^>]*color="([^"]*)"[^>]*used_g="([^"]*)"/g
  )
  return Array.from(matches, m => ({
    id: parseInt(m[1], 10),
    type: m[2],
    color: m[3],
    usedG: parseFloat(m[4]) || 0,
  }))
}

/** Parse Metadata/slice_info.config. Returns [] if the file has no <plate> block
 *  (i.e. the 3MF is a plain arrange, not sliced yet). */
export function parseSliceInfo(xml: string): SliceInfoPlate[] {
  const plateBlocks = xml.match(/<plate>[\s\S]*?<\/plate>/g)
  if (!plateBlocks) return []

  return plateBlocks.map(block => {
    const objects = parseObjects(block)
    return {
      index: metaNumber(block, "index"),
      weightG: metaNumber(block, "weight"),
      predictionSec: metaNumber(block, "prediction"),
      printerModelId: metaValue(block, "printer_model_id"),
      objectCount: objects.filter(o => !o.skipped).length,
      filaments: parseFilaments(block),
    }
  })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/parse-slice-info.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator/import-3mf/parse-slice-info.ts apps/dashboard/lib/kalkulator/import-3mf/__tests__/parse-slice-info.test.ts
git commit -m "feat(kalkulator): parser slice_info.config (plate weight/durasi/filament/object count)"
```

---

### Task 3: `parseModelSettingsPlates` — parser `Metadata/model_settings.config`

**Files:**
- Create: `apps/dashboard/lib/kalkulator/import-3mf/parse-model-settings.ts`
- Test: `apps/dashboard/lib/kalkulator/import-3mf/__tests__/parse-model-settings.test.ts`

**Interfaces:**
- Consumes: `ModelSettingsPlate` dari `./types` (Task 1)
- Produces: `parseModelSettingsPlates(xml: string): ModelSettingsPlate[]` — dipakai `build-draft.ts` (Task 7) untuk nama part & fallback batch (file belum di-slice).

- [ ] **Step 1: Tulis failing test**

Create `apps/dashboard/lib/kalkulator/import-3mf/__tests__/parse-model-settings.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseModelSettingsPlates } from "../parse-model-settings"

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="100">
    <metadata key="name" value="Assembly"/>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="plate-1"/>
    <metadata key="locked" value="false"/>
    <model_instance>
      <metadata key="object_id" value="100"/>
      <metadata key="identify_id" value="7038"/>
    </model_instance>
    <model_instance>
      <metadata key="object_id" value="101"/>
      <metadata key="identify_id" value="7329"/>
    </model_instance>
  </plate>
  <plate>
    <metadata key="plater_id" value="2"/>
    <metadata key="plater_name" value=""/>
    <model_instance>
      <metadata key="object_id" value="102"/>
      <metadata key="identify_id" value="7198"/>
    </model_instance>
  </plate>
</config>`

describe("parseModelSettingsPlates", () => {
  it("parses plater_id, plater_name, and counts <model_instance> per plate", () => {
    const plates = parseModelSettingsPlates(XML)
    expect(plates).toEqual([
      { platerId: 1, platerName: "plate-1", objectCount: 2 },
      { platerId: 2, platerName: "", objectCount: 1 },
    ])
  })

  it("returns [] for garbage input", () => {
    expect(parseModelSettingsPlates("not xml")).toEqual([])
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/parse-model-settings.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implementasi minimal**

Create `apps/dashboard/lib/kalkulator/import-3mf/parse-model-settings.ts`:

```ts
import type { ModelSettingsPlate } from "./types"

function metaValue(block: string, key: string): string {
  const m = block.match(new RegExp(`<metadata key="${key}" value="([^"]*)"`))
  return m ? m[1] : ""
}

/** Parse Metadata/model_settings.config — nama plate + jumlah objek per plate.
 *  Dipakai baik untuk file sliced maupun belum-sliced (struktur ini selalu ada). */
export function parseModelSettingsPlates(xml: string): ModelSettingsPlate[] {
  const plateBlocks = xml.match(/<plate>[\s\S]*?<\/plate>/g)
  if (!plateBlocks) return []

  return plateBlocks.map(block => {
    const instanceCount = (block.match(/<model_instance>/g) ?? []).length
    return {
      platerId: parseInt(metaValue(block, "plater_id"), 10) || 0,
      platerName: metaValue(block, "plater_name"),
      objectCount: instanceCount,
    }
  })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/parse-model-settings.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator/import-3mf/parse-model-settings.ts apps/dashboard/lib/kalkulator/import-3mf/__tests__/parse-model-settings.test.ts
git commit -m "feat(kalkulator): parser model_settings.config (nama plate + object count)"
```

---

### Task 4: `parseProjectSettingsFilamentSlots` — parser `Metadata/project_settings.config`

**Files:**
- Create: `apps/dashboard/lib/kalkulator/import-3mf/parse-project-settings.ts`
- Test: `apps/dashboard/lib/kalkulator/import-3mf/__tests__/parse-project-settings.test.ts`

**Interfaces:**
- Consumes: `ProjectFilamentSlot` dari `./types` (Task 1)
- Produces: `parseProjectSettingsFilamentSlots(json: string): ProjectFilamentSlot[]` — array 0-based, index `i` berarti `filament id = i+1` di `SliceInfoFilament`. Dipakai `build-draft.ts` (Task 7) untuk resolve `brand` (vendor) tiap filament id.

- [ ] **Step 1: Tulis failing test**

Create `apps/dashboard/lib/kalkulator/import-3mf/__tests__/parse-project-settings.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseProjectSettingsFilamentSlots } from "../parse-project-settings"

const JSON_TEXT = JSON.stringify({
  filament_vendor: ["Bambu Lab", "Bambu Lab", "eSUN"],
  filament_type: ["PLA", "PLA", "PETG"],
  printer_model: "Bambu Lab P1S",
})

describe("parseProjectSettingsFilamentSlots", () => {
  it("zips filament_vendor[] and filament_type[] into slot objects by index", () => {
    expect(parseProjectSettingsFilamentSlots(JSON_TEXT)).toEqual([
      { vendor: "Bambu Lab", type: "PLA" },
      { vendor: "Bambu Lab", type: "PLA" },
      { vendor: "eSUN", type: "PETG" },
    ])
  })

  it("returns [] when arrays are missing or JSON is invalid", () => {
    expect(parseProjectSettingsFilamentSlots("{}")).toEqual([])
    expect(parseProjectSettingsFilamentSlots("not json")).toEqual([])
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/parse-project-settings.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implementasi minimal**

Create `apps/dashboard/lib/kalkulator/import-3mf/parse-project-settings.ts`:

```ts
import type { ProjectFilamentSlot } from "./types"

/** Parse Metadata/project_settings.config — array filament_vendor[]/filament_type[]
 *  selaras index dengan `filament id` (1-based) di slice_info.config. */
export function parseProjectSettingsFilamentSlots(json: string): ProjectFilamentSlot[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (typeof parsed !== "object" || parsed === null) return []
  const obj = parsed as Record<string, unknown>
  const vendors = Array.isArray(obj.filament_vendor) ? obj.filament_vendor : []
  const types = Array.isArray(obj.filament_type) ? obj.filament_type : []
  const len = Math.max(vendors.length, types.length)
  if (len === 0) return []

  return Array.from({ length: len }, (_, i) => ({
    vendor: typeof vendors[i] === "string" ? vendors[i] : "",
    type: typeof types[i] === "string" ? types[i] : "",
  }))
}
```

- [ ] **Step 4: Run test, verify it passes**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/parse-project-settings.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator/import-3mf/parse-project-settings.ts apps/dashboard/lib/kalkulator/import-3mf/__tests__/parse-project-settings.test.ts
git commit -m "feat(kalkulator): parser project_settings.config (filament vendor/type per slot)"
```

---

### Task 5: `printer-mapping.ts` — mapping `printer_model_id` → `PrinterProfileData`

**Files:**
- Create: `apps/dashboard/lib/kalkulator/import-3mf/printer-mapping.ts`
- Test: `apps/dashboard/lib/kalkulator/import-3mf/__tests__/printer-mapping.test.ts`

**Interfaces:**
- Consumes: `PrinterProfileData` dari `@/lib/kalkulator/profiles-service` (sudah ada — `{ id, nama, ... }`)
- Produces: `matchPrinterProfile(printerModelId: string | null, profiles: PrinterProfileData[]): PrinterProfileData | undefined` — dipakai `build-draft.ts` (Task 7).

- [ ] **Step 1: Tulis failing test**

Create `apps/dashboard/lib/kalkulator/import-3mf/__tests__/printer-mapping.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { matchPrinterProfile } from "../printer-mapping"
import type { PrinterProfileData } from "@/lib/kalkulator/profiles-service"

function profile(id: string, nama: string): PrinterProfileData {
  return {
    id, nama, mesinPerJam: 5000, watt: null, tarifPerKwh: null,
    hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null,
    isDefault: false, isPricingReference: false,
  }
}

describe("matchPrinterProfile", () => {
  it("maps a known printer_model_id (C12=P1S) to a profile whose nama contains the model token", () => {
    const profiles = [profile("pp1", "Bambu Lab P1S"), profile("pp2", "Bambu Lab A1")]
    expect(matchPrinterProfile("C12", profiles)?.id).toBe("pp1")
  })

  it("matches case-insensitively against custom profile names", () => {
    const profiles = [profile("pp1", "Default (p1s)")]
    expect(matchPrinterProfile("C12", profiles)?.id).toBe("pp1")
  })

  it("returns undefined when printer_model_id is unknown", () => {
    const profiles = [profile("pp1", "Bambu Lab P1S")]
    expect(matchPrinterProfile("UNKNOWN_ID", profiles)).toBeUndefined()
  })

  it("returns undefined when no profile matches the token", () => {
    const profiles = [profile("pp1", "Bambu Lab A1")]
    expect(matchPrinterProfile("C12", profiles)).toBeUndefined()
  })

  it("returns undefined when printer_model_id is null", () => {
    expect(matchPrinterProfile(null, [profile("pp1", "Bambu Lab P1S")])).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/printer-mapping.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implementasi minimal**

Create `apps/dashboard/lib/kalkulator/import-3mf/printer-mapping.ts`:

```ts
import type { PrinterProfileData } from "@/lib/kalkulator/profiles-service"

/** printer_model_id (dari slice_info.config) → model token pendek yang dicari
 *  sebagai substring di nama printer profile milik user.
 *  Hanya berisi ID yang SUDAH terverifikasi dari sample file nyata — jangan
 *  tebak ID lain, tambahkan di sini kalau sudah ketemu dari file sample baru. */
const PRINTER_MODEL_ID_TOKEN: Record<string, string> = {
  C12: "P1S",
}

/** Cari PrinterProfileData yang nama-nya mengandung model token hasil mapping
 *  printer_model_id. Substring match case-insensitive (nama profile bisa custom,
 *  bukan nama resmi Bambu). Tidak ketemu mapping atau tidak ketemu profile → undefined. */
export function matchPrinterProfile(
  printerModelId: string | null,
  profiles: PrinterProfileData[],
): PrinterProfileData | undefined {
  if (!printerModelId) return undefined
  const token = PRINTER_MODEL_ID_TOKEN[printerModelId]
  if (!token) return undefined
  const needle = token.toLowerCase()
  return profiles.find(p => p.nama.toLowerCase().includes(needle))
}
```

- [ ] **Step 4: Run test, verify it passes**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/printer-mapping.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator/import-3mf/printer-mapping.ts apps/dashboard/lib/kalkulator/import-3mf/__tests__/printer-mapping.test.ts
git commit -m "feat(kalkulator): mapping printer_model_id 3MF ke PrinterProfileData user"
```

---

### Task 6: `read-zip.ts` — ekstrak 3 file metadata dari ZIP `.3mf`

**Files:**
- Create: `apps/dashboard/lib/kalkulator/import-3mf/read-zip.ts`
- Test: `apps/dashboard/lib/kalkulator/import-3mf/__tests__/read-zip.test.ts`

**Interfaces:**
- Consumes: `Raw3mfEntries` dari `./types` (Task 1)
- Produces: `readGcode3mfEntries(buf: ArrayBuffer): Promise<Raw3mfEntries | null>` — `null` kalau ZIP tidak valid / bukan 3MF Bambu Studio sama sekali (tidak ada `Metadata/model_settings.config`). Dipakai `index.ts` (Task 8).

Ini satu-satunya file yang import `jszip` — sengaja diisolasi supaya parser lain (Task 2-5) tidak bergantung ke library ZIP sama sekali.

- [ ] **Step 1: Tulis failing test**

Test-nya bikin ZIP asli in-memory pakai JSZip sendiri (bukan file fixture biner) — supaya deterministik dan tidak perlu commit file binary ke repo.

Create `apps/dashboard/lib/kalkulator/import-3mf/__tests__/read-zip.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { readGcode3mfEntries } from "../read-zip"

async function makeZip(files: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return zip.generateAsync({ type: "arraybuffer" })
}

describe("readGcode3mfEntries", () => {
  it("extracts the 3 metadata files and skips large .gcode entries", async () => {
    const buf = await makeZip({
      "Metadata/model_settings.config": "<config>model</config>",
      "Metadata/project_settings.config": "{}",
      "Metadata/slice_info.config": "<config>slice</config>",
      "Metadata/plate_1.gcode": "G1 X10\nG1 Y10\n", // shouldn't be read/needed
    })
    const result = await readGcode3mfEntries(buf)
    expect(result).toEqual({
      modelSettingsXml: "<config>model</config>",
      projectSettingsJson: "{}",
      sliceInfoXml: "<config>slice</config>",
    })
  })

  it("returns null-valued fields when a specific metadata file is missing (e.g. unsliced 3mf has no slice_info)", async () => {
    const buf = await makeZip({
      "Metadata/model_settings.config": "<config>model</config>",
      "Metadata/project_settings.config": "{}",
    })
    const result = await readGcode3mfEntries(buf)
    expect(result).toEqual({
      modelSettingsXml: "<config>model</config>",
      projectSettingsJson: "{}",
      sliceInfoXml: null,
    })
  })

  it("returns null when the archive has none of the expected Bambu Studio metadata files", async () => {
    const buf = await makeZip({ "readme.txt": "hello" })
    expect(await readGcode3mfEntries(buf)).toBeNull()
  })

  it("returns null for a corrupt/non-ZIP buffer", async () => {
    const buf = new TextEncoder().encode("not a zip file at all").buffer
    expect(await readGcode3mfEntries(buf)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/read-zip.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implementasi minimal**

Create `apps/dashboard/lib/kalkulator/import-3mf/read-zip.ts`:

```ts
import JSZip from "jszip"
import type { Raw3mfEntries } from "./types"

const METADATA_PATHS = {
  modelSettingsXml: "Metadata/model_settings.config",
  projectSettingsJson: "Metadata/project_settings.config",
  sliceInfoXml: "Metadata/slice_info.config",
} as const

/** Buka ZIP .3mf dan ambil 3 file metadata kecil — G-code besar (Metadata/plate_N.gcode)
 *  sama sekali tidak disentuh. Return null kalau ZIP invalid atau bukan 3MF Bambu Studio
 *  sama sekali (model_settings.config tidak ada — struktur ini selalu ada baik file
 *  sudah/belum di-slice). */
export async function readGcode3mfEntries(buf: ArrayBuffer): Promise<Raw3mfEntries | null> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buf)
  } catch {
    return null
  }

  if (!zip.file(METADATA_PATHS.modelSettingsXml)) return null

  const entries: Record<string, string | null> = {}
  for (const [key, path] of Object.entries(METADATA_PATHS)) {
    const file = zip.file(path)
    entries[key] = file ? await file.async("string") : null
  }

  return entries as unknown as Raw3mfEntries
}
```

- [ ] **Step 4: Run test, verify it passes**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/read-zip.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator/import-3mf/read-zip.ts apps/dashboard/lib/kalkulator/import-3mf/__tests__/read-zip.test.ts
git commit -m "feat(kalkulator): ekstrak metadata dari ZIP .3mf via JSZip (skip gcode besar)"
```

---

### Task 7: `build-draft.ts` — gabungkan semua parser jadi `Kalkulasi3mfDraft`

Ini task inti — semua keputusan bisnis (fallback nama, batch = objek terkecil, single/multi mode, matching katalog filament, matching printer, warning unsliced) ada di sini.

**Files:**
- Create: `apps/dashboard/lib/kalkulator/import-3mf/build-draft.ts`
- Test: `apps/dashboard/lib/kalkulator/import-3mf/__tests__/build-draft.test.ts`

**Interfaces:**
- Consumes: `SliceInfoPlate[]` (Task 2), `ModelSettingsPlate[]` (Task 3), `ProjectFilamentSlot[]` (Task 4), `matchPrinterProfile` (Task 5), `FilamentHargaData[]` dari `@/lib/kalkulator/types` (`{ id, brand, material, hargaPerGram }` — sudah ada), `PrinterProfileData[]` dari `@/lib/kalkulator/profiles-service` (sudah ada), `PlateInputApp`/`FilamentEntry` dari `@/lib/kalkulator/types` (sudah ada)
- Produces: `buildKalkulasi3mfDraft(input: BuildDraftInput): Kalkulasi3mfDraft` — dipakai `index.ts` (Task 8).

- [ ] **Step 1: Tulis failing test**

Create `apps/dashboard/lib/kalkulator/import-3mf/__tests__/build-draft.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildKalkulasi3mfDraft } from "../build-draft"
import type { SliceInfoPlate, ModelSettingsPlate, ProjectFilamentSlot } from "../types"
import type { FilamentHargaData } from "@/lib/kalkulator/types"
import type { PrinterProfileData } from "@/lib/kalkulator/profiles-service"

function printerProfile(id: string, nama: string): PrinterProfileData {
  return {
    id, nama, mesinPerJam: 5000, watt: null, tarifPerKwh: null,
    hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null,
    isDefault: false, isPricingReference: false,
  }
}

const SLICE_PLATES: SliceInfoPlate[] = [
  {
    index: 1, weightG: 114.44, predictionSec: 19939, printerModelId: "C12",
    objectCount: 28,
    filaments: [
      { id: 1, type: "PLA", color: "#000000", usedG: 96.26 },
      { id: 2, type: "PLA", color: "#FE7E62", usedG: 1.28 },
    ],
  },
  {
    index: 2, weightG: 245.82, predictionSec: 30867, printerModelId: "C12",
    objectCount: 5, // sengaja lebih kecil dari plate 1 → batch harus ambil ini
    filaments: [
      { id: 1, type: "PLA", color: "#000000", usedG: 242.90 },
    ],
  },
]

const MODEL_PLATES: ModelSettingsPlate[] = [
  { platerId: 1, platerName: "plate-1", objectCount: 28 },
  { platerId: 2, platerName: "", objectCount: 5 },
]

const FILAMENT_SLOTS: ProjectFilamentSlot[] = [
  { vendor: "Bambu Lab", type: "PLA" },
  { vendor: "Bambu Lab", type: "PLA" },
]

const FILAMENT_CATALOG: FilamentHargaData[] = [
  { id: "fh1", brand: "Bambu Lab", material: "PLA", hargaPerGram: 300, spoolCount: 2 },
]

const PRINTER_PROFILES: PrinterProfileData[] = [printerProfile("pp1", "Bambu Lab P1S")]

describe("buildKalkulasi3mfDraft — sliced file", () => {
  const draft = buildKalkulasi3mfDraft({
    fileName: "Asset 4-sushitei.gcode.3mf",
    slicePlates: SLICE_PLATES,
    modelPlates: MODEL_PLATES,
    filamentSlots: FILAMENT_SLOTS,
    filamentCatalog: FILAMENT_CATALOG,
    printerProfiles: PRINTER_PROFILES,
  })

  it("derives nama kalkulasi from the file name, stripping .gcode.3mf", () => {
    expect(draft.nama).toBe("Asset 4-sushitei")
  })

  it("takes the SMALLEST non-skipped object count across plates as batch", () => {
    expect(draft.batch).toBe(5)
  })

  it("marks the draft as sliced with no warnings", () => {
    expect(draft.isSliced).toBe(true)
    expect(draft.warnings).toEqual([])
  })

  it("creates one PlateInputApp per plate, named from plater_name with 'Plate N' fallback", () => {
    expect(draft.plates).toHaveLength(2)
    expect(draft.plates[0].namaPart).toBe("plate-1")
    expect(draft.plates[1].namaPart).toBe("Plate 2") // plater_name kosong di MODEL_PLATES
  })

  it("uses single-material mode + matched filament catalog entry when a plate has exactly 1 filament", () => {
    const plate2 = draft.plates[1]
    expect(plate2.tipe).toBe("FDM")
    expect(plate2.gramasi).toBe(242.90)
    expect(plate2.durasiJam).toBeCloseTo(30867 / 3600, 5)
    expect(plate2.materials).toBeUndefined()
    expect(plate2.filamentHargaId).toBe("fh1")
    expect(plate2.hargaPerGram).toBe(300)
  })

  it("switches to multi-material mode when a plate has >1 filament, one FilamentEntry per filament", () => {
    const plate1 = draft.plates[0]
    expect(plate1.materials).toHaveLength(2)
    expect(plate1.materials?.[0]).toEqual({
      brand: "Bambu Lab", material: "PLA", color: "#000000", gramasi: 96.26,
      filamentId: "fh1", hargaPerGram: 300,
    })
    // filament id=2 (vendor Bambu Lab/PLA juga di FILAMENT_SLOTS index 1) tapi TIDAK ada
    // di FILAMENT_CATALOG (cuma 1 entry di situ) → harus tetap masuk tanpa match
    expect(plate1.materials?.[1]).toEqual({
      brand: "Bambu Lab", material: "PLA", color: "#FE7E62", gramasi: 1.28,
    })
  })

  it("maps printer_model_id to a matching PrinterProfileData on every plate", () => {
    expect(draft.plates[0].printer).toBe("Bambu Lab P1S")
    expect(draft.plates[0].printerProfileId).toBe("pp1")
  })
})

describe("buildKalkulasi3mfDraft — unsliced file (no slicePlates)", () => {
  it("still creates parts from modelPlates, but leaves gramasi/durasi empty and adds a warning", () => {
    const draft = buildKalkulasi3mfDraft({
      fileName: "Asset 4-sushitei.3mf",
      slicePlates: [],
      modelPlates: MODEL_PLATES,
      filamentSlots: [],
      filamentCatalog: [],
      printerProfiles: [],
    })
    expect(draft.isSliced).toBe(false)
    expect(draft.plates).toHaveLength(2)
    expect(draft.plates[0].gramasi).toBe(0)
    expect(draft.plates[0].durasiJam).toBe(0)
    expect(draft.batch).toBe(5) // masih bisa dari modelPlates.objectCount
    expect(draft.warnings).toContain(
      "File ini belum di-slice — gramasi & durasi tidak tersedia. Isi manual, atau export ulang project setelah 'Slice all' di Bambu Studio/OrcaSlicer."
    )
  })
})

describe("buildKalkulasi3mfDraft — filament katalog match summary", () => {
  it("adds a warning listing how many filaments didn't match the katalog", () => {
    const draft = buildKalkulasi3mfDraft({
      fileName: "test.gcode.3mf",
      slicePlates: SLICE_PLATES,
      modelPlates: MODEL_PLATES,
      filamentSlots: FILAMENT_SLOTS,
      filamentCatalog: [], // katalog kosong → semua filament unmatched
      printerProfiles: [],
    })
    expect(draft.warnings).toContain("3 dari 3 filament belum ke-match katalog, isi manual di part-nya.")
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/build-draft.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implementasi minimal**

Create `apps/dashboard/lib/kalkulator/import-3mf/build-draft.ts`:

```ts
import type { PlateInputApp, FilamentEntry, FilamentHargaData } from "@/lib/kalkulator/types"
import type { PrinterProfileData } from "@/lib/kalkulator/profiles-service"
import type { SliceInfoPlate, ModelSettingsPlate, ProjectFilamentSlot, Kalkulasi3mfDraft } from "./types"
import { matchPrinterProfile } from "./printer-mapping"

export interface BuildDraftInput {
  fileName: string
  slicePlates: SliceInfoPlate[]
  modelPlates: ModelSettingsPlate[]
  filamentSlots: ProjectFilamentSlot[]
  filamentCatalog: FilamentHargaData[]
  printerProfiles: PrinterProfileData[]
}

const UNSLICED_WARNING =
  "File ini belum di-slice — gramasi & durasi tidak tersedia. Isi manual, atau export ulang project setelah 'Slice all' di Bambu Studio/OrcaSlicer."

function deriveNama(fileName: string): string {
  return fileName.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, "")
}

function findFilamentCatalogMatch(
  brand: string,
  material: string,
  catalog: FilamentHargaData[],
): FilamentHargaData | undefined {
  return catalog.find(
    f => f.brand.toLowerCase() === brand.toLowerCase() && f.material.toLowerCase() === material.toLowerCase(),
  )
}

function buildPlate(
  slicePlate: SliceInfoPlate | undefined,
  modelPlate: ModelSettingsPlate | undefined,
  index: number,
  filamentSlots: ProjectFilamentSlot[],
  filamentCatalog: FilamentHargaData[],
  printerProfiles: PrinterProfileData[],
  unmatchedFilamentCounter: { total: number; unmatched: number },
): PlateInputApp {
  const namaPart = modelPlate?.platerName?.trim() || `Plate ${index + 1}`
  const durasiJam = slicePlate ? slicePlate.predictionSec / 3600 : 0

  const printerMatch = slicePlate ? matchPrinterProfile(slicePlate.printerModelId, printerProfiles) : undefined

  const base: PlateInputApp = {
    namaPart,
    tipe: "FDM",
    gramasi: 0,
    durasiJam,
    printer: printerMatch?.nama,
    printerProfileId: printerMatch?.id,
  }

  const filaments = slicePlate?.filaments ?? []
  if (filaments.length === 0) return base

  const resolved = filaments.map(f => {
    const slot = filamentSlots[f.id - 1]
    const brand = slot?.vendor ?? ""
    const material = slot?.type || f.type
    unmatchedFilamentCounter.total += 1
    const match = findFilamentCatalogMatch(brand, material, filamentCatalog)
    if (!match) unmatchedFilamentCounter.unmatched += 1
    return { brand, material, color: f.color, gramasi: f.usedG, filamentId: match?.id, hargaPerGram: match?.hargaPerGram }
  })

  if (resolved.length === 1) {
    const only = resolved[0]
    return { ...base, gramasi: only.gramasi, filamentHargaId: only.filamentId, hargaPerGram: only.hargaPerGram }
  }

  const materials: FilamentEntry[] = resolved.map(r => ({
    brand: r.brand,
    material: r.material,
    color: r.color,
    gramasi: r.gramasi,
    ...(r.filamentId ? { filamentId: r.filamentId, hargaPerGram: r.hargaPerGram } : {}),
  }))
  return { ...base, materials }
}

export function buildKalkulasi3mfDraft(input: BuildDraftInput): Kalkulasi3mfDraft {
  const { fileName, slicePlates, modelPlates, filamentSlots, filamentCatalog, printerProfiles } = input
  const isSliced = slicePlates.length > 0
  const plateCount = Math.max(slicePlates.length, modelPlates.length)

  const unmatchedFilamentCounter = { total: 0, unmatched: 0 }
  const plates: PlateInputApp[] = Array.from({ length: plateCount }, (_, i) =>
    buildPlate(slicePlates[i], modelPlates[i], i, filamentSlots, filamentCatalog, printerProfiles, unmatchedFilamentCounter),
  )

  const objectCounts = (isSliced ? slicePlates.map(p => p.objectCount) : modelPlates.map(p => p.objectCount))
    .filter(c => c > 0)
  const batch = objectCounts.length > 0 ? Math.min(...objectCounts) : 1

  const warnings: string[] = []
  if (!isSliced) warnings.push(UNSLICED_WARNING)
  if (unmatchedFilamentCounter.unmatched > 0) {
    warnings.push(
      `${unmatchedFilamentCounter.unmatched} dari ${unmatchedFilamentCounter.total} filament belum ke-match katalog, isi manual di part-nya.`,
    )
  }

  return { nama: deriveNama(fileName), batch, plates, isSliced, warnings }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/build-draft.test.ts
```
Expected: PASS (9 tests). Kalau ada assertion `materials` yang gagal karena urutan key object (`toEqual` cukup toleran ke urutan key, cuma bukan urutan array) — pastikan tidak ada field ekstra yang tidak diharapkan (mis. `hargaPerGram: undefined` masih muncul di object literal walau optional; kalau test gagal karena ini, sesuaikan spread di implementasi supaya field yang `undefined` tidak nongol di object — Vitest `toEqual` menganggap `{a: undefined}` != `{}` secara default kecuali pakai `toStrictEqual`/`toMatchObject` — gunakan `expect.objectContaining` di test kalau perlu, tapi implementasi di atas sudah pakai conditional spread `...(r.filamentId ? {...} : {})` khusus supaya field itu tidak ada sama sekali saat unmatched).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator/import-3mf/build-draft.ts apps/dashboard/lib/kalkulator/import-3mf/__tests__/build-draft.test.ts
git commit -m "feat(kalkulator): build-draft — gabungkan parser 3mf jadi PlateInputApp[] siap pakai"
```

---

### Task 8: `index.ts` — orchestrator `import3mfFile()`

**Files:**
- Create: `apps/dashboard/lib/kalkulator/import-3mf/index.ts`
- Test: `apps/dashboard/lib/kalkulator/import-3mf/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `readGcode3mfEntries` (Task 6), `parseSliceInfo` (Task 2), `parseModelSettingsPlates` (Task 3), `parseProjectSettingsFilamentSlots` (Task 4), `buildKalkulasi3mfDraft` (Task 7)
- Produces: `import3mfFile(file: File, deps: Import3mfDeps): Promise<Kalkulasi3mfDraft>` — throw `Error` dengan pesan user-facing kalau ZIP invalid/bukan 3MF Bambu Studio. Dipakai `KalkulasiForm.tsx` (Task 9).

- [ ] **Step 1: Tulis failing test**

Create `apps/dashboard/lib/kalkulator/import-3mf/__tests__/index.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import JSZip from "jszip"
import { import3mfFile } from "../index"

async function makeFile(name: string, files: Record<string, string>): Promise<File> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  const buf = await zip.generateAsync({ type: "arraybuffer" })
  return new File([buf], name)
}

const SLICE_INFO_XML = `<config><plate>
  <metadata key="index" value="1"/>
  <metadata key="printer_model_id" value="C12"/>
  <metadata key="prediction" value="3600"/>
  <metadata key="weight" value="10"/>
  <object identify_id="1" name="A" skipped="false" />
  <filament id="1" tray_info_idx="GFA00" type="PLA" color="#000000" used_m="1" used_g="10"/>
</plate></config>`

const MODEL_SETTINGS_XML = `<config><plate>
  <metadata key="plater_id" value="1"/>
  <metadata key="plater_name" value="plate-1"/>
  <model_instance><metadata key="object_id" value="1"/><metadata key="identify_id" value="1"/></model_instance>
</plate></config>`

const PROJECT_SETTINGS_JSON = JSON.stringify({ filament_vendor: ["Bambu Lab"], filament_type: ["PLA"] })

describe("import3mfFile", () => {
  it("parses a full .gcode.3mf file end-to-end into a Kalkulasi3mfDraft", async () => {
    const file = await makeFile("My Print.gcode.3mf", {
      "Metadata/model_settings.config": MODEL_SETTINGS_XML,
      "Metadata/project_settings.config": PROJECT_SETTINGS_JSON,
      "Metadata/slice_info.config": SLICE_INFO_XML,
    })
    const draft = await import3mfFile(file, { filamentCatalog: [], printerProfiles: [] })
    expect(draft.nama).toBe("My Print")
    expect(draft.isSliced).toBe(true)
    expect(draft.plates).toHaveLength(1)
    expect(draft.plates[0].gramasi).toBe(10)
  })

  it("throws a user-facing error for a non-3MF ZIP", async () => {
    const file = await makeFile("random.zip", { "readme.txt": "hi" })
    await expect(import3mfFile(file, { filamentCatalog: [], printerProfiles: [] })).rejects.toThrow(
      /bukan file 3MF|tidak dikenali/i,
    )
  })

  it("throws a user-facing error for a corrupt file", async () => {
    const file = new File([new TextEncoder().encode("garbage")], "broken.3mf")
    await expect(import3mfFile(file, { filamentCatalog: [], printerProfiles: [] })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/index.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implementasi minimal**

Create `apps/dashboard/lib/kalkulator/import-3mf/index.ts`:

```ts
import type { FilamentHargaData } from "@/lib/kalkulator/types"
import type { PrinterProfileData } from "@/lib/kalkulator/profiles-service"
import type { Kalkulasi3mfDraft } from "./types"
import { readGcode3mfEntries } from "./read-zip"
import { parseSliceInfo } from "./parse-slice-info"
import { parseModelSettingsPlates } from "./parse-model-settings"
import { parseProjectSettingsFilamentSlots } from "./parse-project-settings"
import { buildKalkulasi3mfDraft } from "./build-draft"

export interface Import3mfDeps {
  filamentCatalog: FilamentHargaData[]
  printerProfiles: PrinterProfileData[]
}

/** Parse file .3mf/.gcode.3mf jadi draft siap pakai untuk KalkulasiForm.
 *  Semua parsing terjadi di browser — file tidak pernah di-upload ke server. */
export async function import3mfFile(file: File, deps: Import3mfDeps): Promise<Kalkulasi3mfDraft> {
  const buf = await file.arrayBuffer()
  const entries = await readGcode3mfEntries(buf)
  if (!entries) {
    throw new Error("Format 3MF tidak dikenali — bukan file 3MF dari Bambu Studio/OrcaSlicer, atau file rusak.")
  }

  const slicePlates = entries.sliceInfoXml ? parseSliceInfo(entries.sliceInfoXml) : []
  const modelPlates = entries.modelSettingsXml ? parseModelSettingsPlates(entries.modelSettingsXml) : []
  const filamentSlots = entries.projectSettingsJson ? parseProjectSettingsFilamentSlots(entries.projectSettingsJson) : []

  return buildKalkulasi3mfDraft({
    fileName: file.name,
    slicePlates,
    modelPlates,
    filamentSlots,
    filamentCatalog: deps.filamentCatalog,
    printerProfiles: deps.printerProfiles,
  })
}
```

- [ ] **Step 4: Run test, verify it passes**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf/__tests__/index.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Run seluruh test suite import-3mf sekaligus + full dashboard suite (regression check)**

Run:
```bash
pnpm --filter shopee-dashboard test -- --run lib/kalkulator/import-3mf
pnpm --filter shopee-dashboard test
```
Expected: semua test import-3mf PASS (total ~26 test dari Task 2-8), dan seluruh test suite dashboard tetap hijau (tidak ada regresi ke test lain).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/kalkulator/import-3mf/index.ts apps/dashboard/lib/kalkulator/import-3mf/__tests__/index.test.ts
git commit -m "feat(kalkulator): import3mfFile — orchestrator end-to-end File → Kalkulasi3mfDraft"
```

---

### Task 9: Wiring UI — tombol "Import dari 3MF" di `KalkulasiForm.tsx`

**Files:**
- Modify: `apps/dashboard/components/kalkulator/KalkulasiForm.tsx`

**Interfaces:**
- Consumes: `import3mfFile` (Task 8), `useFilamentHarga()` (sudah ada, dipakai `PlateTable.tsx`), `usePrinterProfiles()` (sudah ada)

Tidak ada unit test baru di task ini (murni UI wiring, sudah full-covered oleh unit test module `import-3mf`) — verifikasi dilakukan manual di browser (Step 4).

- [ ] **Step 1: Tambah import & state**

Di `apps/dashboard/components/kalkulator/KalkulasiForm.tsx`, tambahkan import baru setelah baris 19 (`import { RincianPanel } from "./RincianPanel"`):

```ts
import { useRef, useState as useReactState } from "react"
import { import3mfFile } from "@/lib/kalkulator/import-3mf"
import { useFilamentHarga } from "@/lib/hooks/use-kalkulator"
```

(Catatan: `useState` sudah di-import di baris 3 sebagai `{ useState, useMemo }` — TIDAK perlu `useReactState` alias, itu cuma buat menghindari bentrok penamaan kalau ternyata sudah ada; kalau `useRef` belum ada di import baris 3, tambahkan `useRef` di situ langsung: `import { useState, useMemo, useRef } from "react"` dan hapus baris alias `useReactState` di atas — pakai bentuk ini yang final.)

Final bentuk baris 3 & blok import baru:

```ts
import { useState, useMemo, useRef } from "react"
```

dan tambahkan setelah baris import `RincianPanel`:

```ts
import { import3mfFile } from "@/lib/kalkulator/import-3mf"
import { useFilamentHarga } from "@/lib/hooks/use-kalkulator"
```

Di dalam komponen `KalkulasiForm`, setelah baris `const { data: materialProfiles } = useMaterialProfiles()` (baris 57), tambahkan:

```ts
  const { data: filamentCatalog } = useFilamentHarga()
  const fileRef = useRef<HTMLInputElement>(null)
  const [import3mfPending, setImport3mfPending] = useState(false)
  const [import3mfError, setImport3mfError] = useState<string | null>(null)
  const [import3mfWarnings, setImport3mfWarnings] = useState<string[]>([])

  async function handleImport3mf(file: File) {
    setImport3mfError(null)
    setImport3mfWarnings([])
    setImport3mfPending(true)
    try {
      const draft = await import3mfFile(file, {
        filamentCatalog: filamentCatalog ?? [],
        printerProfiles: printerProfiles ?? [],
      })
      setNama(draft.nama)
      setBatch(draft.batch)
      setPlates(draft.plates.map((p, i) => ({ ...p, key: `p-3mf-${i}` })))
      setImport3mfWarnings(draft.warnings)
    } catch (e) {
      setImport3mfError(e instanceof Error ? e.message : "Gagal membaca file 3MF")
    } finally {
      setImport3mfPending(false)
    }
  }
```

- [ ] **Step 2: Tambah tombol + file input di JSX**

Di `KalkulasiForm.tsx`, cari blok (sekitar baris 204-217, sebelum diedit oleh Step 1 line-shift):

```tsx
        {/* Nama + Batch + Margin */}
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1.5 g-accent">
              Nama Kalkulasi
            </div>
```

Ubah jadi (tombol import hanya muncul saat bikin kalkulasi baru, bukan saat edit — pakai `isEditing` yang sudah ada di komponen):

```tsx
        {/* Nama + Batch + Margin */}
        <div className="space-y-3">
          {!isEditing && (
            <div className="flex items-center justify-end">
              <input
                ref={fileRef}
                type="file"
                accept=".3mf"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleImport3mf(f)
                  e.target.value = ""
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={import3mfPending}
                className="h-8 px-3 rounded-[8px] text-xs font-semibold transition-all g-btn-ghost"
                title="Auto-fill dari file .gcode.3mf hasil slice Bambu Studio/OrcaSlicer"
              >
                {import3mfPending ? "⏳ Membaca..." : "📥 Import dari 3MF"}
              </button>
            </div>
          )}
          {import3mfError && (
            <div className="text-xs px-3 py-2 rounded-[8px]" style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}>
              ⚠️ {import3mfError}
            </div>
          )}
          {import3mfWarnings.map((w, i) => (
            <div key={i} className="text-xs px-3 py-2 rounded-[8px]" style={{ background: "rgba(245,158,11,0.08)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.2)" }}>
              ⚠️ {w}
            </div>
          ))}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1.5 g-accent">
              Nama Kalkulasi
            </div>
```

(Baris-baris setelahnya — input Nama Kalkulasi dst — tetap sama persis, tidak diubah.)

- [ ] **Step 3: Type-check**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis/apps/dashboard
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "KalkulasiForm\|import-3mf"
```
Expected: tidak ada output (no errors) — kalau ada error `useReactState` sisa dari draft awal, pastikan sudah dihapus (final import cuma `useState, useMemo, useRef` dari "react", bukan alias apapun).

- [ ] **Step 4: Verifikasi manual di browser**

Start dev server dan buka halaman kalkulator (form buat kalkulasi baru — BUKAN mode edit), lalu:

1. Klik "📥 Import dari 3MF", pilih file sample nyata (kalau tersedia — mis. `Asset 4-sushitei.gcode.3mf`).
2. Cek: field Nama Kalkulasi terisi nama file (tanpa `.gcode.3mf`), Batch terisi angka objek terkecil across plate, section Part/Plate bertambah sesuai jumlah plate, tiap part punya Gramasi/Durasi terisi, part dengan >1 filament otomatis masuk mode "🎨 Multi" dengan baris filament sejumlah filament di plate itu.
3. Kalau ada warning (filament tak ke-match / printer tak dikenal), banner kuning muncul di atas form, form tetap bisa diedit & disimpan.
4. Coba upload file `.3mf` biasa (belum di-slice, kalau ada sample-nya) → banner "belum di-slice" muncul, gramasi/durasi kosong, tapi part/nama tetap terisi.
5. Coba upload file random bukan 3MF (mis. `.txt` di-rename `.3mf`) → banner error merah muncul, form tidak berubah.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/kalkulator/KalkulasiForm.tsx
git commit -m "feat(kalkulator): tombol Import dari 3MF di form Kalkulasi Baru — wiring ke import3mfFile"
```

---

## Self-Review (dilakukan penulis plan, bukan sub-agent)

**1. Spec coverage** (`docs/superpowers/specs/2026-07-11-kalkulator-import-3mf-design.md`):
- Client-side parsing via JSZip → Task 6, 8 ✅
- Nama Kalkulasi dari nama file → Task 7 (`deriveNama`) ✅
- Batch = objek terkecil, exclude skipped → Task 2 (`objectCount` exclude skipped) + Task 7 (`Math.min`) ✅
- 1 Part = 1 plate, nama fallback "Plate N" → Task 7 (`buildPlate`) ✅
- Tipe selalu FDM → Task 7 (`tipe: "FDM"` hardcoded) ✅
- Gramasi/Durasi dari slice_info → Task 2 + Task 7 ✅
- Mode Multi otomatis kalau >1 filament → Task 7 (`resolved.length === 1` branch) ✅
- Filament katalog match by brand+material, unmatched → dibiarkan kosong → Task 7 (`findFilamentCatalogMatch`) ✅
- Printer match ke `KalkPrinterProfile` (koreksi V2) → Task 5 + Task 7 ✅
- File belum di-slice → tetap isi Part/Plate, gramasi/durasi kosong, warning banner → Task 7 (`isSliced` branch) + Task 9 (render warning) ✅
- Error handling (ZIP invalid, bukan 3MF) → Task 6 (`null` return) + Task 8 (`throw`) + Task 9 (render error) ✅
- Warning non-blocking filament unmatched → Task 7 (`warnings` array) + Task 9 (render) ✅

**2. Placeholder scan**: tidak ada "TBD"/"implement later" — semua step punya kode lengkap.

**3. Type consistency**: `Kalkulasi3mfDraft.plates: PlateInputApp[]` (Task 1) dipakai identik di Task 7 return value dan Task 9 (`draft.plates.map(p => ({ ...p, key }))` — cocok dengan `PlateRow = PlateInputApp & { key: string }` yang sudah ada di `KalkulasiForm.tsx:21`). `FilamentEntry` dari Task 7 pakai field yang sama persis dengan definisi di `packages/kalkulator-core/src/types.ts:28-37` (`brand, material, color, gramasi, filamentId?, hargaPerGram?, materialProfileId?` — plan tidak set `materialProfileId`/`isSupport`, itu OK karena optional dan memang di luar scope 3MF).

---

## Execution Handoff

Plan complete dan tersimpan di `docs/superpowers/plans/2026-07-11-kalkulator-import-3mf.md`. Dua opsi eksekusi:

1. **Subagent-Driven (recommended)** — saya dispatch subagent fresh per task, review 2 tahap (spec compliance → code quality) tiap task, iterasi cepat.
2. **Inline Execution** — saya eksekusi task-by-task di sesi ini langsung, checkpoint tiap beberapa task buat direview.

Mau pakai yang mana?
