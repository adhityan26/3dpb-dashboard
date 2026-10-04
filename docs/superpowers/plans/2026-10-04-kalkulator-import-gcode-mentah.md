# Kalkulator: Import Gcode Mentah (Sub-proyek A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kalkulator SaaS bisa import file `.gcode` mentah dari Bambu Studio dan OrcaSlicer/Snapmaker Orca, mengisi gramasi per filamen + durasi plate secara persis — sama seperti import `.gcode.3mf` yang sudah ada.

**Architecture:** Parser murni di `@3pb/kalkulator-core/import-gcode` membaca potongan awal + akhir gcode (string) → `GcodeSummary`, lalu adapter mengubahnya jadi `SliceInfoPlate` + `ProjectFilamentSlot[]` (tipe yang sudah dipakai import 3MF). Di SaaS, `importSlicerFile` mendeteksi ekstensi `.gcode`, membaca 128 KB awal + 128 KB akhir file via `File.slice`, dan meneruskan hasil adapter ke `buildImportDraft` yang sudah ada. Rumus HPP tidak disentuh.

**Tech Stack:** TypeScript, vitest 1.6, pnpm workspace (`@3pb/kalkulator-core`, `apps/saas` Next.js 16), React Testing Library (jsdom) untuk PlateInput.

**Spec:** `docs/superpowers/specs/2026-10-04-kalkulator-estimasi-hybrid-design.md` — bagian "Sub-proyek A — Import Gcode Mentah (detail)".

## Global Constraints

- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum perintah `pnpm` (default shell Node v10 rusak).
- Kerja di worktree/branch sendiri, **bukan** di folder `master`. `git add <path spesifik>` saja — **jangan** `git add -A` / `git add .`.
- Comment di kode & pesan commit: **Bahasa Inggris**. Teks UI: Bahasa Indonesia (mengikuti yang sudah ada).
- `packages/kalkulator-core/src/formula.test.ts` (14 golden test) **tidak boleh diubah**.
- Parsing tetap di browser — file tidak pernah di-upload ke server.
- Format didukung: Bambu Studio (summary di header, config di awal file) dan OrcaSlicer/Snapmaker Orca (summary + config di footer). Waktu = **total estimated time** (Bambu) / **estimated printing time (normal mode)** (Orca), konsisten dengan `prediction` di `slice_info.config`.
- Baca hanya **128 KB awal + 128 KB akhir** file.
- Fitur import sudah Pro-only di SaaS (PlateInput `locked` menyembunyikan tombol) — tidak ada gating baru.
- Dashboard (`apps/dashboard`) di luar scope plan ini.
- Setiap commit diakhiri baris `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Status | Tanggung jawab |
|---|---|---|
| `packages/kalkulator-core/src/import-gcode/types.ts` | Create | `GcodeSlicer`, `GcodeFilament`, `GcodeSummary` |
| `packages/kalkulator-core/src/import-gcode/parse-duration.ts` | Create | `parseSlicerDuration("1d 2h 3m 4s")` → detik |
| `packages/kalkulator-core/src/import-gcode/parse-gcode-summary.ts` | Create | `parseGcodeSummary(head, tail)` → `GcodeSummary \| null` |
| `packages/kalkulator-core/src/import-gcode/to-slice-input.ts` | Create | `gcodeSummaryToSliceInput(summary)` → `{ slicePlate, filamentSlots }` |
| `packages/kalkulator-core/src/import-gcode/index.ts` | Create | Barrel export |
| `packages/kalkulator-core/package.json` | Modify | Subpath export `./import-gcode` |
| `apps/saas/lib/kalkulator/import-3mf/gcode.ts` | Create | `isRawGcode`, `readGcodeEdges`, `importGcodeFile` |
| `apps/saas/lib/kalkulator/import-3mf/index.ts` | Modify | Dispatch `.gcode` → `importGcodeFile` |
| `apps/saas/lib/kalkulator/import-3mf/build-draft.ts` | Modify | `deriveNama` juga membuang `.gcode` |
| `apps/saas/components/PlateInput.tsx` | Modify | `accept` + pesan error khusus gcode |

---

### Task 1: Parser ringkasan gcode di kalkulator-core

**Files:**
- Create: `packages/kalkulator-core/src/import-gcode/types.ts`
- Create: `packages/kalkulator-core/src/import-gcode/parse-duration.ts`
- Create: `packages/kalkulator-core/src/import-gcode/parse-gcode-summary.ts`
- Create: `packages/kalkulator-core/src/import-gcode/index.ts`
- Modify: `packages/kalkulator-core/package.json` (blok `exports`)
- Test: `packages/kalkulator-core/src/import-gcode/parse-duration.test.ts`
- Test: `packages/kalkulator-core/src/import-gcode/parse-gcode-summary.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type GcodeSlicer = "bambu" | "orca"`
  - `interface GcodeFilament { index: number; usedG: number; type?: string; color?: string; vendor?: string }` — `index` 1-based sesuai urutan slot filamen di slicer
  - `interface GcodeSummary { slicer: GcodeSlicer; totalSec: number; filaments: GcodeFilament[]; filamentChanges?: number; printerModel?: string }`
  - `parseSlicerDuration(text: string): number` — `NaN` bila tak ada angka+satuan
  - `parseGcodeSummary(head: string, tail: string): GcodeSummary | null`
  - Import path: `@3pb/kalkulator-core/import-gcode`

- [ ] **Step 1: Tulis test durasi yang gagal**

`packages/kalkulator-core/src/import-gcode/parse-duration.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseSlicerDuration } from "./parse-duration"

describe("parseSlicerDuration", () => {
  it("parses minutes + seconds", () => {
    expect(parseSlicerDuration("18m 24s")).toBe(1104)
  })
  it("parses hours, minutes, seconds", () => {
    expect(parseSlicerDuration("13h 49m 27s")).toBe(49767)
  })
  it("parses days", () => {
    expect(parseSlicerDuration("1d 2h 3m 4s")).toBe(93784)
  })
  it("returns NaN when nothing parseable", () => {
    expect(parseSlicerDuration("")).toBeNaN()
    expect(parseSlicerDuration("soon")).toBeNaN()
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cd packages/kalkulator-core && pnpm vitest run src/import-gcode/parse-duration.test.ts`
Expected: FAIL — `Failed to resolve import "./parse-duration"`

- [ ] **Step 3: Implementasi durasi + types**

`packages/kalkulator-core/src/import-gcode/types.ts`:

```ts
export type GcodeSlicer = "bambu" | "orca"

/** One filament slot with non-zero usage. `index` is 1-based, matching the slicer's slot order. */
export interface GcodeFilament {
  index: number
  usedG: number
  type?: string
  color?: string
  vendor?: string
}

/** Print summary read from a raw .gcode header/footer (Bambu Studio or OrcaSlicer family). */
export interface GcodeSummary {
  slicer: GcodeSlicer
  /** Total estimated time including prepare — same meaning as slice_info `prediction`. */
  totalSec: number
  filaments: GcodeFilament[]
  /** Orca only: `; total filament change = N`. */
  filamentChanges?: number
  printerModel?: string
}
```

`packages/kalkulator-core/src/import-gcode/parse-duration.ts`:

```ts
const UNIT_SEC: Record<string, number> = { d: 86400, h: 3600, m: 60, s: 1 }

/** Slicer duration text ("1d 2h 3m 4s", "18m 24s") to seconds; NaN when nothing parseable. */
export function parseSlicerDuration(text: string): number {
  let total = 0
  let found = false
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])\b/g)) {
    total += parseFloat(m[1]) * UNIT_SEC[m[2]]
    found = true
  }
  return found ? total : NaN
}
```

- [ ] **Step 4: Jalankan test durasi, pastikan lulus**

Run: `cd packages/kalkulator-core && pnpm vitest run src/import-gcode/parse-duration.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Tulis test parser ringkasan yang gagal**

Fixture = potongan asli (dipangkas) dari gcode Switch A1 (Bambu 02.08), Zord P1S 4 warna (Bambu), dan Zord U1 (Snapmaker Orca/OrcaSlicer 2.4.2).

`packages/kalkulator-core/src/import-gcode/parse-gcode-summary.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { parseGcodeSummary } from "./parse-gcode-summary"

const BAMBU_A1_HEAD = `; HEADER_BLOCK_START
; BambuStudio 02.08.02.61
; model printing time: 18m 24s; total estimated time: 24m 40s
; total layer number: 60
; total filament length [mm] : 2742.71
; total filament weight [g] : 8.25
; filament_density: 1.25
; filament: 1
; HEADER_BLOCK_END

; CONFIG_BLOCK_START
; default_filament_colour = ""
; filament_colour = #898989
; filament_settings_id = "eSUN PLA+ @BBL A1"
; filament_type = PLA
; filament_vendor = eSUN
; printer_model = Bambu Lab A1
; CONFIG_BLOCK_END
`

// Real Bambu header (Nike Crocs plate 3, P1P, 8 AMS slots): weights are listed only for the
// USED filaments, in the order of `; filament:` — slot 4 (PETG) is unused, the 4th weight is slot 5.
const BAMBU_P1P_SPARSE_HEAD = `; HEADER_BLOCK_START
; BambuStudio 02.02.01.58
; model printing time: 33m 30s; total estimated time: 39m 45s
; total layer number: 3
; total filament weight [g] : 1.01,1.65,1.82,1.65,1.42
; filament_density: 1.25,1.25,1.25,1.27,1.25,1.25,1.25,1.25
; filament: 1,2,3,5,6
; HEADER_BLOCK_END
; filament_colour = #000000;#800002;#FB0207;#808080;#F75D00;#FECC66;#FFFF0A;#FFFF66
; filament_type = PLA;PLA;PLA;PETG;PLA;PLA;PLA;PLA
; filament_vendor = eSUN;eSUN;eSUN;Generic;"Bambu Lab";eSUN;eSUN;eSUN
; printer_model = Bambu Lab P1P
`

// Real Orca footer (cigarete, 5 extruders): Orca lists every extruder, unused ones as 0.00.
const ORCA_ZERO_TAIL = `; filament used [g] = 28.02, 16.22, 1.53, 0.00, 0.00
; estimated printing time (normal mode) = 3h 8m 38s
; filament_type = PLA;PLA;PLA;PLA;PLA
`

const ORCA_U1_TAIL = `; filament used [mm] = 20255.76, 3319.06, 5818.87, 21642.21
; filament used [cm3] = 48.72, 7.98, 14.00, 52.06
; filament used [g] = 60.41, 9.90, 17.36, 64.55
; total filament used [g] = 152.22
; total filament cost = 3.04
; total filament change = 265
; total layers count = 144
; estimated printing time (normal mode) = 13h 49m 27s
; CONFIG_BLOCK_START
; filament_colour = #D90000;#FFFF00;#00FF00;#000000
; filament_type = PLA;PLA;PLA;PLA
; filament_vendor = Generic;Generic;Generic;Generic
; printer_model = Snapmaker U1
; CONFIG_BLOCK_END
`

describe("parseGcodeSummary", () => {
  it("reads a single-filament Bambu Studio gcode from the head", () => {
    expect(parseGcodeSummary(BAMBU_A1_HEAD, "G1 X0\n")).toEqual({
      slicer: "bambu",
      totalSec: 1480,
      filaments: [{ index: 1, usedG: 8.25, type: "PLA", color: "#898989", vendor: "eSUN" }],
      printerModel: "Bambu Lab A1",
    })
  })

  it("maps Bambu weights onto the slot ids from `; filament:` and strips quotes", () => {
    const s = parseGcodeSummary(BAMBU_P1P_SPARSE_HEAD, "")!
    expect(s.slicer).toBe("bambu")
    expect(s.totalSec).toBe(2385)
    expect(s.filaments.map(f => f.index)).toEqual([1, 2, 3, 5, 6])
    expect(s.filaments[3]).toEqual({ index: 5, usedG: 1.65, type: "PLA", color: "#F75D00", vendor: "Bambu Lab" })
    expect(s.printerModel).toBe("Bambu Lab P1P")
  })

  it("falls back to positional slots when `; filament:` does not match the weight count", () => {
    const head = BAMBU_P1P_SPARSE_HEAD.replace("; filament: 1,2,3,5,6", "; filament: 1,2")
    expect(parseGcodeSummary(head, "")!.filaments.map(f => f.index)).toEqual([1, 2, 3, 4, 5])
  })

  it("drops Orca extruders with zero usage", () => {
    const s = parseGcodeSummary("", ORCA_ZERO_TAIL)!
    expect(s.slicer).toBe("orca")
    expect(s.totalSec).toBe(11318)
    expect(s.filaments.map(f => [f.index, f.usedG])).toEqual([[1, 28.02], [2, 16.22], [3, 1.53]])
  })

  it("uses the Orca summary when a Bambu-style time line has no Bambu weight", () => {
    const head = "; model printing time: 1h; total estimated time: 1h 5m\n"
    expect(parseGcodeSummary(head, ORCA_U1_TAIL)!.slicer).toBe("orca")
  })

  it("reads an OrcaSlicer / Snapmaker Orca gcode from the tail", () => {
    const s = parseGcodeSummary("; HEADER_BLOCK_START\n; generated by OrcaSlicer 2.4.2\n", ORCA_U1_TAIL)!
    expect(s.slicer).toBe("orca")
    expect(s.totalSec).toBe(49767)
    expect(s.filamentChanges).toBe(265)
    expect(s.printerModel).toBe("Snapmaker U1")
    expect(s.filaments.map(f => f.usedG)).toEqual([60.41, 9.9, 17.36, 64.55])
    expect(s.filaments[3]).toMatchObject({ index: 4, type: "PLA", color: "#000000", vendor: "Generic" })
  })

  it("handles CRLF line endings", () => {
    const s = parseGcodeSummary(BAMBU_A1_HEAD.replace(/\n/g, "\r\n"), "")!
    expect(s.totalSec).toBe(1480)
    expect(s.filaments[0].usedG).toBe(8.25)
  })

  it("returns null for gcode without a known summary", () => {
    expect(parseGcodeSummary("; generated by PrusaSlicer\nG1 X0\n", "G1 X1\n")).toBeNull()
  })

  it("returns null when the time is present but the weight is missing", () => {
    expect(parseGcodeSummary("", "; estimated printing time (normal mode) = 1h 2m 3s\n")).toBeNull()
  })
})
```

- [ ] **Step 6: Jalankan, pastikan gagal**

Run: `cd packages/kalkulator-core && pnpm vitest run src/import-gcode/parse-gcode-summary.test.ts`
Expected: FAIL — `Failed to resolve import "./parse-gcode-summary"`

- [ ] **Step 7: Implementasi parser**

`packages/kalkulator-core/src/import-gcode/parse-gcode-summary.ts`:

```ts
import { parseSlicerDuration } from "./parse-duration"
import type { GcodeFilament, GcodeSlicer, GcodeSummary } from "./types"

// Bambu Studio: summary in the header block, config block right after it (start of file).
// Weights are listed only for USED filaments, in the order of the `; filament:` slot-id list.
const BAMBU_TIME = /^; model printing time: [^;\n]*; total estimated time: ([^\n]+)$/m
const BAMBU_WEIGHT = /^; total filament weight \[g\] : ([^\n]+)$/m
const BAMBU_SLOT_IDS = /^; filament: ([\d,]+)$/m
// OrcaSlicer family (incl. Snapmaker Orca): summary + config block in the footer.
const ORCA_TIME = /^; estimated printing time \(normal mode\) = ([^\n]+)$/m
const ORCA_WEIGHT = /^; filament used \[g\] = ([^\n]+)$/m
const ORCA_CHANGES = /^; total filament change = (\d+)/m

function match1(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m ? m[1].trim() : null
}

/** `; key = a;b;"c"` config line as a list, quotes stripped; [] when absent. */
function configList(text: string, key: string): string[] {
  const raw = match1(text, new RegExp(`^; ${key} = ([^\\n]*)$`, "m"))
  if (raw == null) return []
  return raw.split(";").map(s => s.trim().replace(/^"(.*)"$/, "$1"))
}

/** Bambu or Orca summary pair (time + weights); Bambu wins when both are complete. */
function detect(text: string): { slicer: GcodeSlicer; timeRaw: string; weightRaw: string } | null {
  const bambuTime = match1(text, BAMBU_TIME)
  const bambuWeight = match1(text, BAMBU_WEIGHT)
  if (bambuTime != null && bambuWeight != null) return { slicer: "bambu", timeRaw: bambuTime, weightRaw: bambuWeight }
  // Orca builds for Bambu printers may also print a Bambu-style time line in the header.
  const orcaTime = match1(text, ORCA_TIME)
  const orcaWeight = match1(text, ORCA_WEIGHT)
  if (orcaTime != null && orcaWeight != null) return { slicer: "orca", timeRaw: orcaTime, weightRaw: orcaWeight }
  return null
}

/** 1-based slot id per weight: Bambu's `; filament:` list when it lines up, else positional. */
function slotIds(text: string, slicer: GcodeSlicer, count: number): number[] {
  const positional = Array.from({ length: count }, (_, i) => i + 1)
  if (slicer !== "bambu") return positional
  const raw = match1(text, BAMBU_SLOT_IDS)
  const ids = raw ? raw.split(",").map(s => parseInt(s, 10)) : []
  return ids.length === count && ids.every(n => n > 0) ? ids : positional
}

/** Parse the print summary from the first and last chunk of a raw .gcode.
 *  Returns null when neither a Bambu nor an Orca summary is found, or it is incomplete.
 *  For files smaller than head+tail the chunks overlap; first-match lookups make that harmless. */
export function parseGcodeSummary(head: string, tail: string): GcodeSummary | null {
  const text = `${head}\n${tail}`.replace(/\r/g, "")

  const found = detect(text)
  if (found == null) return null
  const { slicer, timeRaw, weightRaw } = found

  const totalSec = parseSlicerDuration(timeRaw)
  if (!Number.isFinite(totalSec)) return null

  const weights = weightRaw.split(",").map(s => parseFloat(s.trim()))
  if (weights.some(w => !Number.isFinite(w))) return null

  const ids = slotIds(text, slicer, weights.length)
  const types = configList(text, "filament_type")
  const colors = configList(text, "filament_colour")
  const vendors = configList(text, "filament_vendor")
  const filaments: GcodeFilament[] = weights
    .map((usedG, i) => {
      const slot = ids[i] - 1
      const f: GcodeFilament = { index: ids[i], usedG }
      if (types[slot]) f.type = types[slot]
      if (colors[slot]) f.color = colors[slot]
      if (vendors[slot]) f.vendor = vendors[slot]
      return f
    })
    .filter(f => f.usedG > 0)

  const summary: GcodeSummary = { slicer, totalSec, filaments }
  const changes = match1(text, ORCA_CHANGES)
  if (changes != null) summary.filamentChanges = parseInt(changes, 10)
  const printerModel = configList(text, "printer_model")[0]
  if (printerModel) summary.printerModel = printerModel
  return summary
}
```

`packages/kalkulator-core/src/import-gcode/index.ts`:

```ts
export * from "./types"
export { parseSlicerDuration } from "./parse-duration"
export { parseGcodeSummary } from "./parse-gcode-summary"
```

`packages/kalkulator-core/package.json` — blok `exports` menjadi:

```json
  "exports": {
    ".": "./src/index.ts",
    "./import-3mf": "./src/import-3mf/index.ts",
    "./import-gcode": "./src/import-gcode/index.ts"
  },
```

- [ ] **Step 8: Jalankan seluruh test core, pastikan lulus**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/kalkulator-core test`
Expected: PASS — semua test lama (termasuk 14 golden) + 13 test baru

- [ ] **Step 9: Commit**

```bash
git add packages/kalkulator-core/src/import-gcode/types.ts \
  packages/kalkulator-core/src/import-gcode/parse-duration.ts \
  packages/kalkulator-core/src/import-gcode/parse-duration.test.ts \
  packages/kalkulator-core/src/import-gcode/parse-gcode-summary.ts \
  packages/kalkulator-core/src/import-gcode/parse-gcode-summary.test.ts \
  packages/kalkulator-core/src/import-gcode/index.ts \
  packages/kalkulator-core/package.json
git commit -m "feat(kalkulator-core): parse raw gcode summary from Bambu and Orca slicers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Adapter `GcodeSummary` → input import 3MF

**Files:**
- Create: `packages/kalkulator-core/src/import-gcode/to-slice-input.ts`
- Modify: `packages/kalkulator-core/src/import-gcode/index.ts`
- Test: `packages/kalkulator-core/src/import-gcode/to-slice-input.test.ts`

**Interfaces:**
- Consumes: `GcodeSummary` (Task 1); `SliceInfoPlate`, `ProjectFilamentSlot` dari `packages/kalkulator-core/src/import-3mf/types.ts` (sudah ada)
- Produces:
  - `interface GcodeSliceInput { slicePlate: SliceInfoPlate; filamentSlots: ProjectFilamentSlot[] }`
  - `gcodeSummaryToSliceInput(summary: GcodeSummary): GcodeSliceInput` — diekspor dari `@3pb/kalkulator-core/import-gcode`
  - Kontrak: `filamentSlots[f.index - 1]` = `{ vendor, type }` filamen itu (slot kosong diisi `{ vendor: "", type: "" }`), karena `build-draft` mencari slot via `filament.id - 1`. `objectCount = partCount = 1` (gcode tidak menyimpan jumlah objek dengan andal → batch 1).

- [ ] **Step 1: Tulis test yang gagal**

`packages/kalkulator-core/src/import-gcode/to-slice-input.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { gcodeSummaryToSliceInput } from "./to-slice-input"
import type { GcodeSummary } from "./types"

const summary: GcodeSummary = {
  slicer: "bambu",
  totalSec: 46368,
  filaments: [
    { index: 1, usedG: 58.16, type: "PLA", color: "#D90000", vendor: "Generic" },
    { index: 3, usedG: 33.48, type: "PETG", color: "#00FF00", vendor: "Bambu Lab" },
  ],
  printerModel: "Bambu Lab P1S",
}

describe("gcodeSummaryToSliceInput", () => {
  it("builds one sliced plate with batch-1 object counts", () => {
    const { slicePlate } = gcodeSummaryToSliceInput(summary)
    expect(slicePlate).toEqual({
      index: 1,
      weightG: 91.64,
      predictionSec: 46368,
      printerModelId: null,
      objectCount: 1,
      partCount: 1,
      partCountConsistent: true,
      filaments: [
        { id: 1, type: "PLA", color: "#D90000", usedG: 58.16 },
        { id: 3, type: "PETG", color: "#00FF00", usedG: 33.48 },
      ],
    })
  })

  it("places filament slots at index-1 and fills gaps", () => {
    const { filamentSlots } = gcodeSummaryToSliceInput(summary)
    expect(filamentSlots).toEqual([
      { vendor: "Generic", type: "PLA" },
      { vendor: "", type: "" },
      { vendor: "Bambu Lab", type: "PETG" },
    ])
  })

  it("defaults missing type/color/vendor to empty strings", () => {
    const { slicePlate, filamentSlots } = gcodeSummaryToSliceInput({
      slicer: "orca", totalSec: 60, filaments: [{ index: 1, usedG: 2 }],
    })
    expect(slicePlate.filaments[0]).toEqual({ id: 1, type: "", color: "", usedG: 2 })
    expect(filamentSlots).toEqual([{ vendor: "", type: "" }])
  })
})
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cd packages/kalkulator-core && pnpm vitest run src/import-gcode/to-slice-input.test.ts`
Expected: FAIL — `Failed to resolve import "./to-slice-input"`

- [ ] **Step 3: Implementasi**

`packages/kalkulator-core/src/import-gcode/to-slice-input.ts`:

```ts
import type { ProjectFilamentSlot, SliceInfoPlate } from "../import-3mf/types"
import type { GcodeSummary } from "./types"

export interface GcodeSliceInput {
  slicePlate: SliceInfoPlate
  filamentSlots: ProjectFilamentSlot[]
}

/** Map a raw-gcode summary onto the slice_info shapes the 3MF import already consumes:
 *  one plate, batch 1 (gcode has no reliable object count), slots addressed by `index - 1`. */
export function gcodeSummaryToSliceInput(summary: GcodeSummary): GcodeSliceInput {
  const maxIndex = summary.filaments.reduce((m, f) => Math.max(m, f.index), 0)
  const filamentSlots: ProjectFilamentSlot[] = Array.from({ length: maxIndex }, () => ({ vendor: "", type: "" }))
  for (const f of summary.filaments) {
    filamentSlots[f.index - 1] = { vendor: f.vendor ?? "", type: f.type ?? "" }
  }

  const weightG = Math.round(summary.filaments.reduce((sum, f) => sum + f.usedG, 0) * 100) / 100

  return {
    slicePlate: {
      index: 1,
      weightG,
      predictionSec: summary.totalSec,
      // slice_info model codes (e.g. "C12") feed the dashboard printer mapping; a display name
      // like "Bambu Lab P1S" would not match, so it stays null. GcodeSummary.printerModel keeps it.
      printerModelId: null,
      objectCount: 1,
      partCount: 1,
      partCountConsistent: true,
      filaments: summary.filaments.map(f => ({ id: f.index, type: f.type ?? "", color: f.color ?? "", usedG: f.usedG })),
    },
    filamentSlots,
  }
}
```

Tambahkan ke `packages/kalkulator-core/src/import-gcode/index.ts` (baris terakhir):

```ts
export { gcodeSummaryToSliceInput, type GcodeSliceInput } from "./to-slice-input"
```

- [ ] **Step 4: Jalankan test core, pastikan lulus**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/kalkulator-core test`
Expected: PASS — termasuk 3 test baru

- [ ] **Step 5: Commit**

```bash
git add packages/kalkulator-core/src/import-gcode/to-slice-input.ts \
  packages/kalkulator-core/src/import-gcode/to-slice-input.test.ts \
  packages/kalkulator-core/src/import-gcode/index.ts
git commit -m "feat(kalkulator-core): map gcode summary onto slice_info import shapes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Import `.gcode` di lib SaaS

**Files:**
- Create: `apps/saas/lib/kalkulator/import-3mf/gcode.ts`
- Modify: `apps/saas/lib/kalkulator/import-3mf/index.ts`
- Modify: `apps/saas/lib/kalkulator/import-3mf/build-draft.ts` (fungsi `deriveNama`)
- Test: `apps/saas/lib/kalkulator/import-3mf/gcode.test.ts`
- Test: `apps/saas/lib/kalkulator/import-3mf/build-draft.test.ts` (tambah 1 test)

**Interfaces:**
- Consumes: `parseGcodeSummary`, `gcodeSummaryToSliceInput` dari `@3pb/kalkulator-core/import-gcode` (Task 1–2); `buildImportDraft`, `ImportDraft` dari `./build-draft` (sudah ada); `FilamentEntry` dari `../local-settings` (sudah ada)
- Produces:
  - `GCODE_EDGE_BYTES = 128 * 1024`
  - `isRawGcode(fileName: string): boolean` — true untuk `*.gcode`, false untuk `*.gcode.3mf`
  - `readGcodeEdges(file: File, edgeBytes?: number): Promise<{ head: string; tail: string }>`
  - `importGcodeFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null>`
  - `importSlicerFile(file, filaments)` (sudah ada) kini juga menerima `.gcode`; kontrak `null` untuk file tak dikenali tetap

- [ ] **Step 1: Tulis test yang gagal**

`apps/saas/lib/kalkulator/import-3mf/gcode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { importSlicerFile } from "./index";
import { isRawGcode, readGcodeEdges } from "./gcode";
import type { FilamentEntry } from "../local-settings";

const BAMBU_HEAD = `; HEADER_BLOCK_START
; BambuStudio 02.08.02.61
; model printing time: 18m 24s; total estimated time: 24m 40s
; total filament weight [g] : 8.25
; HEADER_BLOCK_END
; CONFIG_BLOCK_START
; filament_colour = #898989
; filament_type = PLA
; filament_vendor = eSUN
; printer_model = Bambu Lab A1
; CONFIG_BLOCK_END
`;

const ORCA_TAIL = `; filament used [g] = 60.41, 9.90, 17.36, 64.55
; total filament change = 265
; estimated printing time (normal mode) = 13h 49m 27s
; CONFIG_BLOCK_START
; filament_colour = #D90000;#FFFF00;#00FF00;#000000
; filament_type = PLA;PLA;PLA;PLA
; filament_vendor = Generic;Generic;Generic;Generic
; printer_model = Snapmaker U1
; CONFIG_BLOCK_END
`;

// ~420 KB of moves, so head and tail land in separate 128 KB windows.
const FILLER = "G1 X10 Y10 E0.1\n".repeat(26000);

const catalog: FilamentEntry[] = [
  { id: "f-esun", brand: "eSUN", material: "PLA", tipe: "FDM", warna: "Abu", hppPerGram: 200, jualPerGram: 400, failureRatePct: 5 },
];

describe("isRawGcode", () => {
  it("matches .gcode but not .gcode.3mf", () => {
    expect(isRawGcode("Zord.gcode")).toBe(true);
    expect(isRawGcode("ZORD.GCODE")).toBe(true);
    expect(isRawGcode("Zord.gcode.3mf")).toBe(false);
    expect(isRawGcode("Zord.3mf")).toBe(false);
  });
});

describe("readGcodeEdges", () => {
  it("returns only the first and last chunk of a large file", async () => {
    const file = new File([BAMBU_HEAD, FILLER, ORCA_TAIL], "big.gcode");
    const { head, tail } = await readGcodeEdges(file, 1024);
    expect(head.startsWith("; HEADER_BLOCK_START")).toBe(true);
    expect(head.length).toBe(1024);
    expect(tail.endsWith("; CONFIG_BLOCK_END\n")).toBe(true);
    expect(tail.length).toBe(1024);
  });
});

describe("importSlicerFile — raw .gcode", () => {
  it("imports a Bambu Studio gcode into a one-plate draft", async () => {
    const file = new File([BAMBU_HEAD, FILLER], "Switch.gcode");
    const draft = await importSlicerFile(file, catalog);
    expect(draft).not.toBeNull();
    expect(draft!.nama).toBe("Switch");
    expect(draft!.isSliced).toBe(true);
    expect(draft!.batch).toBe(1);
    expect(draft!.plates).toHaveLength(1);
    expect(draft!.plates[0].durasiJam).toBe(0.41);
    expect(draft!.plates[0].materials).toEqual([
      { filamentId: "f-esun", tipe: "FDM", gramasi: 8.25, warnaHex: "#898989" },
    ]);
    expect(draft!.warnings).toEqual([]);
  });

  it("imports a 4-color Orca/Snapmaker gcode read from the footer", async () => {
    const file = new File(["; generated by OrcaSlicer 2.4.2\n", FILLER, ORCA_TAIL], "Zord_PLA_13h49m.gcode");
    const draft = await importSlicerFile(file, catalog);
    expect(draft).not.toBeNull();
    expect(draft!.plates[0].durasiJam).toBe(13.82);
    expect(draft!.plates[0].materials.map((m) => m.gramasi)).toEqual([60.41, 9.9, 17.36, 64.55]);
    expect(draft!.plates[0].materials.map((m) => m.warnaHex)).toEqual(["#D90000", "#FFFF00", "#00FF00", "#000000"]);
    // build-draft emits one warning per unmatched filament; PlateInput dedupes them for display.
    expect([...new Set(draft!.warnings)]).toEqual(['Filament "Generic PLA" belum ada di katalog — pakai tarif default']);
  });

  it("falls back to the zip path for a .gcode.3mf saved as .gcode", async () => {
    const zip = new JSZip();
    zip.file("Metadata/model_settings.config", `<config><plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value=""/></plate></config>`);
    zip.file("Metadata/project_settings.config", JSON.stringify({ filament_vendor: ["eSUN"], filament_type: ["PLA"] }));
    zip.file("Metadata/slice_info.config", `<config><plate>
  <metadata key="index" value="1"/><metadata key="prediction" value="3600"/><metadata key="weight" value="10"/>
  <object identify_id="1" name="A" skipped="false" />
  <filament id="1" type="PLA" color="#898989" used_m="1" used_g="10"/>
</plate></config>`);
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    const draft = await importSlicerFile(new File([buf], "Untitled_plate_1.gcode"), catalog);
    expect(draft).not.toBeNull();
    expect(draft!.nama).toBe("Untitled_plate_1");
    expect(draft!.plates[0].materials[0]).toMatchObject({ filamentId: "f-esun", gramasi: 10 });
  });

  it("returns null for gcode from an unsupported slicer", async () => {
    const file = new File(["; generated by PrusaSlicer 2.8\n", FILLER], "part.gcode");
    expect(await importSlicerFile(file, catalog)).toBeNull();
  });
});
```

Tambahkan ke `apps/saas/lib/kalkulator/import-3mf/build-draft.test.ts`, di dalam blok `describe` utama yang sudah ada (pakai `input` minimal yang sama polanya dengan test lain di file itu — salin objek input test pertama lalu ganti `fileName`):

```ts
  it("strips .gcode from the draft name", () => {
    const draft = buildImportDraft({
      fileName: "Zord Painted_PLA_13h49m.gcode",
      slicePlates: [],
      modelPlates: [],
      filamentSlots: [],
      filamentCatalog: [],
    });
    expect(draft.nama).toBe("Zord Painted_PLA_13h49m");
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && pnpm vitest run lib/kalkulator/import-3mf/gcode.test.ts lib/kalkulator/import-3mf/build-draft.test.ts`
Expected: FAIL — `Failed to resolve import "./gcode"` dan test `.gcode` nama gagal (`"Zord Painted_PLA_13h49m.gcode"` ≠ yang diharapkan)

- [ ] **Step 3: Implementasi**

`apps/saas/lib/kalkulator/import-3mf/gcode.ts`:

```ts
import { gcodeSummaryToSliceInput, parseGcodeSummary } from "@3pb/kalkulator-core/import-gcode";
import type { FilamentEntry } from "../local-settings";
import { buildImportDraft, type ImportDraft } from "./build-draft";

/** Bambu keeps summary + config near the start, Orca near the end — both fit well
 *  inside 128 KB (verified: Bambu config ~34 KB in, Orca footer ~27 KB from the end
 *  of a 97.7 MB file), so huge gcode never has to be read whole. */
export const GCODE_EDGE_BYTES = 128 * 1024;

/** True for raw `.gcode`; `.gcode.3mf` stays on the zip path. */
export function isRawGcode(fileName: string): boolean {
  return /\.gcode$/i.test(fileName);
}

export async function readGcodeEdges(file: File, edgeBytes = GCODE_EDGE_BYTES): Promise<{ head: string; tail: string }> {
  const head = await file.slice(0, edgeBytes).text();
  const tail = await file.slice(Math.max(0, file.size - edgeBytes)).text();
  return { head, tail };
}

/** Raw .gcode → ImportDraft via the same builder the 3MF import uses. Null when the slicer is unsupported. */
export async function importGcodeFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null> {
  const { head, tail } = await readGcodeEdges(file);
  const summary = parseGcodeSummary(head, tail);
  if (!summary) return null;
  const { slicePlate, filamentSlots } = gcodeSummaryToSliceInput(summary);
  return buildImportDraft({
    fileName: file.name,
    slicePlates: [slicePlate],
    modelPlates: [],
    filamentSlots,
    filamentCatalog: filaments,
  });
}
```

`apps/saas/lib/kalkulator/import-3mf/index.ts` — tambah import dan cabang `.gcode` di awal blok `try`:

```ts
import {
  readGcode3mfEntries,
  parseSliceInfo,
  parseModelSettingsPlates,
  parseProjectSettingsFilamentSlots,
} from "@3pb/kalkulator-core/import-3mf";
import type { FilamentEntry } from "../local-settings";
import { buildImportDraft, type ImportDraft } from "./build-draft";
import { importGcodeFile, isRawGcode } from "./gcode";

/** Parse file .3mf/.gcode.3mf/.gcode jadi draft siap pakai untuk PlateInput.
 *  Semua parsing terjadi di browser — file tidak pernah di-upload ke server. */
export async function importSlicerFile(file: File, filaments: FilamentEntry[]): Promise<ImportDraft | null> {
  try {
    if (isRawGcode(file.name)) {
      const draft = await importGcodeFile(file, filaments);
      if (draft) return draft;
      // Some exports are a zipped plate saved as "*.gcode" (PK header) — let the zip path try.
    }

    const buf = await file.arrayBuffer();
```

(sisa fungsi tidak berubah)

`apps/saas/lib/kalkulator/import-3mf/build-draft.ts` — `deriveNama` menjadi:

```ts
function deriveNama(fileName: string): string {
  return fileName.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, "").replace(/\.gcode$/i, "");
}
```

- [ ] **Step 4: Jalankan test lib import, pastikan lulus**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && pnpm vitest run lib/kalkulator/import-3mf`
Expected: PASS — test lama (`index.test.ts`, `build-draft.test.ts`, `merge-plates.test.ts`) + 7 test baru. Jangan ubah `build-draft.ts` selain `deriveNama`.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/import-3mf/gcode.ts \
  apps/saas/lib/kalkulator/import-3mf/gcode.test.ts \
  apps/saas/lib/kalkulator/import-3mf/index.ts \
  apps/saas/lib/kalkulator/import-3mf/build-draft.ts \
  apps/saas/lib/kalkulator/import-3mf/build-draft.test.ts
git commit -m "feat(saas): import raw .gcode from Bambu Studio and Orca slicers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: PlateInput menerima `.gcode` + pesan error khusus

**Files:**
- Modify: `apps/saas/components/PlateInput.tsx` (handler `handleImportFiles` ±baris 140–153, atribut `accept` ±baris 302)
- Test: `apps/saas/components/PlateInput.test.tsx` (tambah 2 test di `describe("1b-6b import file slicer (multi-file append)")`)

**Interfaces:**
- Consumes: `isRawGcode` dari `@/lib/kalkulator/import-3mf/gcode` (Task 3); `importSlicerFile` (sudah ada, di-mock di test)
- Produces: perilaku UI — input file `accept=".3mf,.gcode.3mf,.gcode"`; file `.gcode` gagal → pesan "Format gcode belum didukung…"; file lain gagal → pesan "File tidak dikenali…" (teks diperluas dengan `.gcode`)

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di dalam `describe("1b-6b import file slicer (multi-file append)", …)` di `apps/saas/components/PlateInput.test.tsx` (helper `base`, `fileInput`, `mockImport` sudah tersedia di scope itu):

```tsx
  it("input file menerima .gcode mentah", () => {
    render(<PlateInput {...base} locked={false} />);
    expect(fileInput().getAttribute("accept")).toBe(".3mf,.gcode.3mf,.gcode");
  });

  it("gcode dari slicer tak didukung → pesan format gcode, file lain pesan umum", async () => {
    mockImport.mockResolvedValue(null);
    render(<PlateInput {...base} locked={false} onPlatesChange={vi.fn()} />);
    fireEvent.change(fileInput(), {
      target: { files: [new File(["d"], "cura.gcode"), new File(["d"], "bad.zip")] },
    });
    expect(await screen.findByText(/Format gcode belum didukung: cura\.gcode/)).toBeTruthy();
    expect(screen.getByText(/File tidak dikenali: bad\.zip/)).toBeTruthy();
  });
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && pnpm vitest run components/PlateInput.test.tsx`
Expected: FAIL — accept masih `.3mf,.gcode.3mf`; teks "Format gcode belum didukung" tidak ditemukan

- [ ] **Step 3: Implementasi**

Di `apps/saas/components/PlateInput.tsx`, tambah import (di bawah import `mergeImportedPlates`):

```tsx
import { isRawGcode } from "@/lib/kalkulator/import-3mf/gcode";
```

Ganti blok pesan error di `handleImportFiles`:

```tsx
    if (failed.length > 0) {
      setImportError(`File tidak dikenali: ${failed.join(", ")} — pastikan file .3mf/.gcode.3mf dari Bambu Studio/OrcaSlicer.`);
    }
```

menjadi:

```tsx
    if (failed.length > 0) {
      const failedGcode = failed.filter(isRawGcode);
      const failedOther = failed.filter((n) => !isRawGcode(n));
      const messages: string[] = [];
      if (failedGcode.length > 0) {
        messages.push(`Format gcode belum didukung: ${failedGcode.join(", ")} — baru Bambu Studio & OrcaSlicer/Snapmaker Orca.`);
      }
      if (failedOther.length > 0) {
        messages.push(`File tidak dikenali: ${failedOther.join(", ")} — pastikan file .3mf/.gcode.3mf/.gcode dari Bambu Studio/OrcaSlicer.`);
      }
      setImportError(messages.join(" "));
    }
```

Ganti atribut input:

```tsx
        accept=".3mf,.gcode.3mf,.gcode"
```

- [ ] **Step 4: Jalankan test PlateInput, pastikan lulus**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && pnpm vitest run components/PlateInput.test.tsx`
Expected: PASS — termasuk test lama "semua file tidak dikenali → error inline tampil" (regex `/tidak dikenali/` masih cocok) + 2 test baru

- [ ] **Step 5: Jalankan seluruh test monorepo + lint**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm turbo test && pnpm --filter @3pb/saas lint`
Expected: semua PASS, lint bersih.

- [ ] **Step 6: Verifikasi manual di browser dengan file asli**

Run dev server SaaS (lihat `apps/saas/package.json` script `dev`, port 3300), login sebagai user Pro, buka kalkulator, klik "⬆ Import file slicer", pilih:
1. `/Users/adhityatangahu/Documents/Flexi Red Dragon Zord Painted_PLA_13h49m.gcode` (Orca/U1, 97,7 MB) → 1 plate, 4 material: 60,41 / 9,9 / 17,36 / 64,55 g, durasi 13,82 jam; import selesai < 2 detik.
2. Gcode Bambu (export "Export plate sliced file" lalu ambil `Metadata/plate_1.gcode` dari `~/Downloads/Switch.gcode.3mf`, rename `Switch.gcode`) → 1 plate, 15,21 g, 0,99 jam (59m18s).

Expected: angka sama persis dengan yang ditampilkan slicer.

- [ ] **Step 7: Commit**

```bash
git add apps/saas/components/PlateInput.tsx apps/saas/components/PlateInput.test.tsx
git commit -m "feat(saas): accept raw .gcode in the slicer import button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
