# Kalkulator Multiple Gcode Import (Append Plate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kedua kalkulator (SaaS `PlateInput` + dashboard `KalkulasiForm`) bisa import banyak file `.gcode.3mf` — multi-select sekaligus DAN import berulang — dengan semantik **append plate** (bukan replace).

**Architecture:** Parser `@3pb/kalkulator-core/import-3mf` tidak berubah. Tiap app dapat satu fungsi murni `mergeImportedPlates` (pristine-detection + append) yang di-unit-test, lalu handler UI di-loop per file dan memakai fungsi itu. Batch/nama hanya di-set saat state pristine; error per file tidak menggagalkan file lain; warnings digabung + dedupe.

**Tech Stack:** Next.js 16, React, TypeScript, vitest (+ @testing-library/react di saas), pnpm workspace + turbo.

**Spec:** `docs/superpowers/specs/2026-08-11-kalkulator-multiple-gcode-import-design.md`

## Global Constraints

- Semua perintah pnpm butuh Node 22: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` di awal tiap shell.
- Komentar kode & pesan commit **Bahasa Inggris**; UI copy Bahasa Indonesia.
- `git add <path spesifik>` — JANGAN `git add -A` / `git add .`.
- Commit diakhiri `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- 14 golden test `packages/kalkulator-core/src/formula.test.ts` tidak boleh disentuh (task ini memang tak menyentuh core).
- Style per app: **saas pakai semicolon**, **dashboard tanpa semicolon** — ikuti file yang diedit.
- JANGAN deploy — siapkan sampai siap deploy saja.

---

### Task 1: Helper murni saas — `merge-plates.ts`

**Files:**
- Create: `apps/saas/lib/kalkulator/import-3mf/merge-plates.ts`
- Test: `apps/saas/lib/kalkulator/import-3mf/merge-plates.test.ts`

**Interfaces:**
- Consumes: — (murni, tanpa dependency)
- Produces:
  - `interface MergablePlate { nama: string; durasiJam: string; materials: { gramasi: string }[] }`
  - `isPristinePlate(p: MergablePlate): boolean`
  - `mergeImportedPlates<T extends MergablePlate>(existing: T[], imported: T[]): { plates: T[]; wasPristine: boolean }`

- [ ] **Step 1: Write the failing test**

Buat `apps/saas/lib/kalkulator/import-3mf/merge-plates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isPristinePlate, mergeImportedPlates } from "./merge-plates";

const empty = { nama: "", durasiJam: "", materials: [{ gramasi: "" }] };
const filled = { nama: "Body", durasiJam: "2.5", materials: [{ gramasi: "120" }] };

describe("isPristinePlate", () => {
  it("plate kosong bawaan dianggap pristine", () => {
    expect(isPristinePlate(empty)).toBe(true);
  });
  it("durasi terisi → bukan pristine", () => {
    expect(isPristinePlate({ ...empty, durasiJam: "1" })).toBe(false);
  });
  it("gramasi material terisi → bukan pristine", () => {
    expect(isPristinePlate({ ...empty, materials: [{ gramasi: "5" }] })).toBe(false);
  });
  it("nama terisi → bukan pristine", () => {
    expect(isPristinePlate({ ...empty, nama: "x" })).toBe(false);
  });
  it("durasi '0' dan gramasi '0' masih pristine (setara kosong)", () => {
    expect(isPristinePlate({ nama: " ", durasiJam: "0", materials: [{ gramasi: "0" }] })).toBe(true);
  });
});

describe("mergeImportedPlates", () => {
  it("state pristine: plate kosong diganti hasil import, wasPristine true", () => {
    const { plates, wasPristine } = mergeImportedPlates([empty], [filled]);
    expect(plates).toEqual([filled]);
    expect(wasPristine).toBe(true);
  });
  it("state terisi: hasil import di-append di belakang, wasPristine false", () => {
    const other = { ...filled, nama: "Lid" };
    const { plates, wasPristine } = mergeImportedPlates([filled], [other]);
    expect(plates).toEqual([filled, other]);
    expect(wasPristine).toBe(false);
  });
  it("plate pristine di tengah daftar terisi ikut dibuang saat append", () => {
    const other = { ...filled, nama: "Lid" };
    const { plates, wasPristine } = mergeImportedPlates([filled, empty], [other]);
    expect(plates).toEqual([filled, other]);
    expect(wasPristine).toBe(false);
  });
  it("existing kosong (0 plate) dianggap pristine", () => {
    const { plates, wasPristine } = mergeImportedPlates([], [filled]);
    expect(plates).toEqual([filled]);
    expect(wasPristine).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @3pb/saas test merge-plates`
Expected: FAIL — `Cannot find module './merge-plates'` (atau setara).

- [ ] **Step 3: Write minimal implementation**

Buat `apps/saas/lib/kalkulator/import-3mf/merge-plates.ts`:

```ts
/** Minimal plate shape needed for the pristine check — structural, so PlateRow
 *  (components/PlateInput.tsx) satisfies it without lib importing from components. */
export interface MergablePlate {
  nama: string;
  durasiJam: string;
  materials: { gramasi: string }[];
}

/** A plate is pristine when nothing meaningful has been filled in:
 *  empty name, zero/empty duration, and all material weights zero/empty. */
export function isPristinePlate(p: MergablePlate): boolean {
  return (
    p.nama.trim() === "" &&
    (Number(p.durasiJam) || 0) === 0 &&
    p.materials.every((m) => (Number(m.gramasi) || 0) === 0)
  );
}

/** Merge imported plates into the existing list: pristine placeholder rows are
 *  dropped, imported plates appended. `wasPristine` is true when ALL existing
 *  plates were pristine — the caller's signal to also apply batch/nama from the
 *  first imported file. */
export function mergeImportedPlates<T extends MergablePlate>(
  existing: T[],
  imported: T[],
): { plates: T[]; wasPristine: boolean } {
  const wasPristine = existing.every(isPristinePlate);
  return {
    plates: [...existing.filter((p) => !isPristinePlate(p)), ...imported],
    wasPristine,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @3pb/saas test merge-plates`
Expected: PASS (9 test).

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/import-3mf/merge-plates.ts apps/saas/lib/kalkulator/import-3mf/merge-plates.test.ts
git commit -m "feat(saas): add mergeImportedPlates helper (pristine detection + append)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Wiring saas `PlateInput` — multi-file + append

**Files:**
- Modify: `apps/saas/components/PlateInput.tsx` (handler `handleImportFile` ±baris 135-159, input file ±baris 283-293)
- Modify: `apps/saas/components/PlateInput.test.tsx` (describe `"1b-6b import file slicer"` ±baris 194-234)

**Interfaces:**
- Consumes: `mergeImportedPlates` dari Task 1; `importSlicerFile(file, filaments): Promise<ImportDraft | null>` (sudah ada); `ImportDraft` dari `@/lib/kalkulator/import-3mf/build-draft`.
- Produces: perilaku UI — bukan API baru.

- [ ] **Step 1: Update existing test + add new tests (failing first)**

Di `apps/saas/components/PlateInput.test.tsx`, ganti seluruh describe `"1b-6b import file slicer"` dengan:

```tsx
describe("1b-6b import file slicer (multi-file append)", () => {
  const mockImport = importSlicerFile as unknown as ReturnType<typeof vi.fn>;
  beforeEach(() => { mockImport.mockReset(); });

  const draftA = {
    nama: "PrintA", batch: 2, isSliced: true, warnings: ["Filament X belum ada di katalog — pakai tarif default"],
    plates: [{ nama: "Plate A1", durasiJam: 1, materials: [{ tipe: "FDM", gramasi: 10 }] }],
  };
  const draftB = {
    nama: "PrintB", batch: 3, isSliced: true, warnings: [],
    plates: [
      { nama: "Plate B1", durasiJam: 2, materials: [{ tipe: "FDM", gramasi: 20 }] },
      { nama: "Plate B2", durasiJam: 3, materials: [{ tipe: "FDM", gramasi: 30 }] },
    ],
  };
  const pristinePlates = [{ id: "p1", nama: "", durasiJam: "", materials: [{ id: "m1", tipe: "FDM" as const, gramasi: "" }] }];
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  it("tombol import muncul untuk Pro, tidak untuk Free", () => {
    const { rerender } = render(<PlateInput {...base} locked={false} />);
    expect(screen.getByText(/Import file slicer/)).toBeTruthy();
    rerender(<PlateInput {...base} locked={true} />);
    expect(screen.queryByText(/Import file slicer/)).toBeNull();
  });

  it("input file punya atribut multiple", () => {
    render(<PlateInput {...base} locked={false} />);
    expect(fileInput().multiple).toBe(true);
  });

  it("state pristine → plate kosong diganti hasil import + batch di-set dari file pertama", async () => {
    mockImport.mockResolvedValue(draftA);
    const onP = vi.fn();
    const onB = vi.fn();
    render(<PlateInput {...base} plates={pristinePlates} locked={false} onPlatesChange={onP} onBatchChange={onB} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "a.gcode.3mf")] } });
    await waitFor(() => expect(onP).toHaveBeenCalled());
    expect(onP.mock.calls[0][0]).toHaveLength(1);
    expect(onP.mock.calls[0][0][0]).toMatchObject({ nama: "Plate A1", durasiJam: "1" });
    expect(onB).toHaveBeenCalledWith("2");
    expect(await screen.findByText(/Filament X belum ada di katalog/)).toBeTruthy();
  });

  it("state terisi → hasil import di-APPEND, batch TIDAK diubah", async () => {
    mockImport.mockResolvedValue(draftB);
    const onP = vi.fn();
    const onB = vi.fn();
    // base.plates = 1 plate terisi (durasiJam "3", gramasi "50")
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} onBatchChange={onB} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "b.gcode.3mf")] } });
    await waitFor(() => expect(onP).toHaveBeenCalled());
    expect(onP.mock.calls[0][0]).toHaveLength(3); // 1 lama + 2 baru
    expect(onP.mock.calls[0][0][1]).toMatchObject({ nama: "Plate B1" });
    expect(onP.mock.calls[0][0][2]).toMatchObject({ nama: "Plate B2" });
    expect(onB).not.toHaveBeenCalled();
  });

  it("multi-select 2 file sekaligus → semua plate masuk berurutan", async () => {
    mockImport.mockResolvedValueOnce(draftA).mockResolvedValueOnce(draftB);
    const onP = vi.fn();
    render(<PlateInput {...base} plates={pristinePlates} locked={false} onPlatesChange={onP} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "a.gcode.3mf"), new File(["d"], "b.gcode.3mf")] } });
    await waitFor(() => expect(onP).toHaveBeenCalled());
    expect(mockImport).toHaveBeenCalledTimes(2);
    expect(onP.mock.calls[0][0].map((p: { nama: string }) => p.nama)).toEqual(["Plate A1", "Plate B1", "Plate B2"]);
  });

  it("1 file gagal + 1 file valid → yang valid tetap masuk, error menyebut nama file gagal", async () => {
    mockImport.mockResolvedValueOnce(null).mockResolvedValueOnce(draftB);
    const onP = vi.fn();
    render(<PlateInput {...base} plates={pristinePlates} locked={false} onPlatesChange={onP} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "bad.zip"), new File(["d"], "b.gcode.3mf")] } });
    expect(await screen.findByText(/bad\.zip/)).toBeTruthy();
    await waitFor(() => expect(onP).toHaveBeenCalled());
    expect(onP.mock.calls[0][0]).toHaveLength(2);
  });

  it("semua file tidak dikenali → error inline tampil, plates tak berubah", async () => {
    mockImport.mockResolvedValue(null);
    const onP = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "bad.zip")] } });
    expect(await screen.findByText(/tidak dikenali/)).toBeTruthy();
    expect(onP).not.toHaveBeenCalled();
  });

  it("warnings duplikat lintas file di-dedupe", async () => {
    mockImport.mockResolvedValueOnce(draftA).mockResolvedValueOnce({ ...draftB, warnings: draftA.warnings });
    render(<PlateInput {...base} plates={pristinePlates} locked={false} onPlatesChange={vi.fn()} />);
    fireEvent.change(fileInput(), { target: { files: [new File(["d"], "a.gcode.3mf"), new File(["d"], "b.gcode.3mf")] } });
    const warns = await screen.findAllByText(/Filament X belum ada di katalog/);
    expect(warns).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @3pb/saas test PlateInput`
Expected: FAIL — test baru (multiple, append, partial failure) gagal; test lama yang sudah diganti tak ada lagi.

- [ ] **Step 3: Implement in `PlateInput.tsx`**

3a. Tambah import di atas (baris ±7-8):

```tsx
import { importSlicerFile } from "@/lib/kalkulator/import-3mf";
import type { ImportDraft } from "@/lib/kalkulator/import-3mf/build-draft";
import { mergeImportedPlates } from "@/lib/kalkulator/import-3mf/merge-plates";
```

3b. Ganti seluruh `handleImportFile` (±baris 135-159) dengan:

```tsx
  const handleImportFiles = async (files: File[]) => {
    setImportError(null);
    setImportWarnings([]);
    const drafts: ImportDraft[] = [];
    const failed: string[] = [];
    for (const file of files) {
      const draft = await importSlicerFile(file, filaments);
      if (draft) drafts.push(draft);
      else failed.push(file.name);
    }
    if (failed.length > 0) {
      setImportError(`File tidak dikenali: ${failed.join(", ")} — pastikan file .3mf/.gcode.3mf dari Bambu Studio/OrcaSlicer.`);
    }
    if (drafts.length === 0) return;
    const importedRows: PlateRow[] = drafts.flatMap((draft) =>
      draft.plates.map((p) => ({
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
      })),
    );
    // Append semantics: importing more files adds plates; pristine placeholder
    // rows are dropped, and batch only follows the file when nothing was filled yet.
    const { plates: merged, wasPristine } = mergeImportedPlates(plates, importedRows);
    onPlatesChange(merged);
    if (wasPristine) onBatchChange(String(drafts[0].batch));
    // Dedupe: identical unmatched-filament warnings repeat across plates/files —
    // show each unique message once.
    setImportWarnings([...new Set(drafts.flatMap((d) => d.warnings))]);
  };
```

3c. Ganti input file (±baris 283-293) dengan:

```tsx
      <input
        ref={fileInputRef}
        type="file"
        accept=".3mf,.gcode.3mf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) void handleImportFiles(files);
        }}
      />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @3pb/saas test PlateInput`
Expected: PASS semua (termasuk describe lain yang tak disentuh).

- [ ] **Step 5: Run full saas suite**

Run: `pnpm --filter @3pb/saas test`
Expected: PASS — tak ada regresi.

- [ ] **Step 6: Commit**

```bash
git add apps/saas/components/PlateInput.tsx apps/saas/components/PlateInput.test.tsx
git commit -m "feat(saas): PlateInput accepts multiple slicer files, appends plates

Importing now appends each file's plates instead of replacing the list.
Pristine placeholder rows are dropped; batch only set when state was empty.
Per-file failures don't abort the remaining files.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Helper murni dashboard — `merge-plates.ts`

**Files:**
- Create: `apps/dashboard/lib/kalkulator/import-3mf/merge-plates.ts`
- Test: `apps/dashboard/lib/kalkulator/import-3mf/__tests__/merge-plates.test.ts`

**Interfaces:**
- Consumes: `PlateInputApp` dari `@/lib/kalkulator/types` (= `PlateInput & { printerProfileId?; materialProfileId? }`; `PlateInput` punya `namaPart?`, `gramasi?`, `durasiJam: number`, `materials?: { gramasi: number }[]`).
- Produces:
  - `isPristinePlate(p: PlateInputApp): boolean`
  - `mergeImportedPlates<T extends PlateInputApp>(existing: T[], imported: T[]): { plates: T[]; wasPristine: boolean }`

- [ ] **Step 1: Write the failing test**

Buat `apps/dashboard/lib/kalkulator/import-3mf/__tests__/merge-plates.test.ts` (style dashboard: tanpa semicolon):

```ts
import { describe, expect, it } from "vitest"
import { isPristinePlate, mergeImportedPlates } from "../merge-plates"

const empty = { tipe: "FDM" as const, gramasi: 0, durasiJam: 0 }
const filled = { namaPart: "Body", tipe: "FDM" as const, gramasi: 120, durasiJam: 2.5 }

describe("isPristinePlate (dashboard)", () => {
  it("DEFAULT_PLATE-shaped row is pristine", () => {
    expect(isPristinePlate(empty)).toBe(true)
  })
  it("filled duration → not pristine", () => {
    expect(isPristinePlate({ ...empty, durasiJam: 1 })).toBe(false)
  })
  it("filled gramasi → not pristine", () => {
    expect(isPristinePlate({ ...empty, gramasi: 5 })).toBe(false)
  })
  it("filled namaPart → not pristine", () => {
    expect(isPristinePlate({ ...empty, namaPart: "x" })).toBe(false)
  })
  it("multi-material with any weight → not pristine", () => {
    expect(isPristinePlate({ ...empty, materials: [{ id: 1, material: "PLA", color: "", gramasi: 3 }] })).toBe(false)
  })
})

describe("mergeImportedPlates (dashboard)", () => {
  it("pristine state: placeholder replaced, wasPristine true", () => {
    const { plates, wasPristine } = mergeImportedPlates([empty], [filled])
    expect(plates).toEqual([filled])
    expect(wasPristine).toBe(true)
  })
  it("filled state: imported plates appended, wasPristine false", () => {
    const other = { ...filled, namaPart: "Lid" }
    const { plates, wasPristine } = mergeImportedPlates([filled], [other])
    expect(plates).toEqual([filled, other])
    expect(wasPristine).toBe(false)
  })
  it("pristine row among filled rows is dropped on append", () => {
    const other = { ...filled, namaPart: "Lid" }
    const { plates } = mergeImportedPlates([filled, empty], [other])
    expect(plates).toEqual([filled, other])
  })
})
```

Catatan: elemen `materials` di dashboard adalah `FilamentEntry` core (`{ id: number; material: string; color: string; gramasi: number; ... }`) — test di atas sudah memakai bentuk itu.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter shopee-dashboard test merge-plates`
Expected: FAIL — `Cannot find module '../merge-plates'`.

- [ ] **Step 3: Write minimal implementation**

Buat `apps/dashboard/lib/kalkulator/import-3mf/merge-plates.ts`:

```ts
import type { PlateInputApp } from "@/lib/kalkulator/types"

/** A plate is pristine when nothing meaningful has been filled in: no part name,
 *  zero weight, zero duration, and (if multi-material) all material weights zero. */
export function isPristinePlate(p: PlateInputApp): boolean {
  return (
    !p.namaPart?.trim() &&
    (p.gramasi ?? 0) === 0 &&
    p.durasiJam === 0 &&
    (p.materials ?? []).every(m => (m.gramasi || 0) === 0)
  )
}

/** Merge imported plates into the existing list: pristine placeholder rows are
 *  dropped, imported plates appended. `wasPristine` is true when ALL existing
 *  plates were pristine — the caller's signal to also apply nama/batch from the
 *  first imported file. */
export function mergeImportedPlates<T extends PlateInputApp>(
  existing: T[],
  imported: T[],
): { plates: T[]; wasPristine: boolean } {
  const wasPristine = existing.every(isPristinePlate)
  return {
    plates: [...existing.filter(p => !isPristinePlate(p)), ...imported],
    wasPristine,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter shopee-dashboard test merge-plates`
Expected: PASS (8 test).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator/import-3mf/merge-plates.ts apps/dashboard/lib/kalkulator/import-3mf/__tests__/merge-plates.test.ts
git commit -m "feat(dashboard): add mergeImportedPlates helper (pristine detection + append)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Wiring dashboard `KalkulasiForm` — multi-file + append + thumbnails

**Files:**
- Modify: `apps/dashboard/components/kalkulator/KalkulasiForm.tsx`:
  - `handleImport3mf` (±baris 71-93)
  - `handleDrop` (±baris 112-119)
  - input file JSX + title tombol (±baris 358-377)

**Interfaces:**
- Consumes: `mergeImportedPlates` dari Task 3; `import3mfFile(file, deps): Promise<Kalkulasi3mfDraft>` (throw kalau gagal); `Kalkulasi3mfDraft` dari `@/lib/kalkulator/import-3mf/types` (punya `nama`, `batch`, `plates`, `warnings`, `thumbnails: (Blob | null)[]` index-aligned dengan `plates`).
- Produces: perilaku UI — bukan API baru. (Tidak ada component test untuk form ini — cakupan dari unit test Task 3 + typecheck + verifikasi manual Task 5.)

- [ ] **Step 1: Tambah import + ref counter**

1a. Di blok import (±baris 23):

```tsx
import { import3mfFile } from "@/lib/kalkulator/import-3mf"
import type { Kalkulasi3mfDraft } from "@/lib/kalkulator/import-3mf/types"
import { mergeImportedPlates } from "@/lib/kalkulator/import-3mf/merge-plates"
```

1b. Di dekat `const fileRef = useRef<HTMLInputElement>(null)` (±baris 64), tambah:

```tsx
  // Monotonic key counter across imports — `p-3mf-${index}` would collide when a
  // second import appends plates, breaking React keys and thumbnail mapping.
  const importSeqRef = useRef(0)
```

- [ ] **Step 2: Ganti `handleImport3mf` (±baris 71-93) dengan versi multi-file**

```tsx
  async function handleImport3mf(files: File[]) {
    setImport3mfError(null)
    setImport3mfWarnings([])
    setImport3mfPending(true)
    try {
      const drafts: Kalkulasi3mfDraft[] = []
      const failed: string[] = []
      for (const file of files) {
        try {
          drafts.push(await import3mfFile(file, {
            filamentCatalog: filamentCatalog ?? [],
            printerProfiles: printerProfiles ?? [],
          }))
        } catch (e) {
          failed.push(`${file.name}: ${e instanceof Error ? e.message : "Gagal membaca file 3MF"}`)
        }
      }
      if (failed.length > 0) setImport3mfError(failed.join(" · "))
      if (drafts.length === 0) return
      const newPlates: PlateRow[] = drafts.flatMap(d =>
        d.plates.map(p => ({ ...p, key: `p-3mf-${++importSeqRef.current}` }))
      )
      // Thumbnails are index-aligned per draft — walk drafts with a running offset
      // into newPlates to key each blob by its plate's key.
      const thumbs: Record<string, Blob> = {}
      let offset = 0
      for (const d of drafts) {
        d.thumbnails.forEach((blob, i) => { if (blob) thumbs[newPlates[offset + i].key] = blob })
        offset += d.plates.length
      }
      const { plates: merged, wasPristine } = mergeImportedPlates(plates, newPlates)
      setPlates(merged)
      if (wasPristine) {
        setNama(drafts[0].nama)
        setBatch(drafts[0].batch)
      }
      setPendingThumbnails(prev => (wasPristine ? thumbs : { ...prev, ...thumbs }))
      setImport3mfWarnings([...new Set(drafts.flatMap(d => d.warnings))])
    } finally {
      setImport3mfPending(false)
    }
  }
```

Catatan tipe: `PlateRow` (baris 26) = `PlateInputApp & { key: string; id?: string; thumbnailKey?: string }` — `d.plates` bertipe `PlateInputApp[]`, spread + `key` memenuhi `PlateRow`.

- [ ] **Step 3: Ganti `handleDrop` (±baris 112-119)**

```tsx
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDraggingFile(false)
    if (isEditing) return
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length > 0) handleImport3mf(files)
  }
```

- [ ] **Step 4: Update input file + title tombol (±baris 358-377)**

Input jadi:

```tsx
              <input
                ref={fileRef}
                type="file"
                accept=".3mf"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length > 0) handleImport3mf(files)
                  e.target.value = ""
                }}
              />
```

Title tombol import jadi:

```tsx
                title="Auto-fill dari file .gcode.3mf hasil slice Bambu Studio/OrcaSlicer — bisa pilih beberapa file sekaligus; import berikutnya menambah plate"
```

- [ ] **Step 5: Typecheck + full dashboard suite**

Run: `pnpm --filter shopee-dashboard exec tsc --noEmit` lalu `pnpm --filter shopee-dashboard test`
Expected: keduanya PASS, tak ada regresi.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/components/kalkulator/KalkulasiForm.tsx
git commit -m "feat(dashboard): KalkulasiForm accepts multiple 3MF files, appends plates

Import (button + drag-drop) now parses every selected/dropped file and appends
their plates. Plate keys use a monotonic counter so repeat imports don't
collide; pending thumbnails are merged instead of replaced. Nama/batch only
follow the first file when the form was still pristine.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Verifikasi menyeluruh

**Files:**
- Tidak ada file baru di repo (fixture di scratchpad).

**Interfaces:**
- Consumes: hasil Task 1-4.
- Produces: bukti verifikasi (output test + build; screenshot browser bila memungkinkan).

- [ ] **Step 1: Full monorepo test**

Run (dari root): `pnpm turbo test`
Expected: PASS semua package — termasuk 14 golden test formula (tak tersentuh).

- [ ] **Step 2: Build kedua app**

Run: `pnpm turbo build --filter @3pb/saas --filter shopee-dashboard`
Expected: build sukses tanpa error TypeScript.

- [ ] **Step 3: Buat fixture `.gcode.3mf` di scratchpad (zip CLI bawaan macOS)**

Buat 2 fixture: `fixture-a.gcode.3mf` (1 plate) dan `fixture-b.gcode.3mf` (2 plate). Contoh untuk A (B serupa, slice_info berisi dua blok `<plate>` dengan `index` 1 & 2):

```bash
cd "$SCRATCHPAD" && mkdir -p fxa/Metadata && cd fxa
cat > Metadata/slice_info.config <<'EOF'
<config><plate>
  <metadata key="index" value="1"/>
  <metadata key="prediction" value="3600"/>
  <metadata key="weight" value="10"/>
  <object identify_id="1" name="A" skipped="false" />
  <filament id="1" type="PLA" color="#000000" used_m="1" used_g="10"/>
</plate></config>
EOF
cat > Metadata/model_settings.config <<'EOF'
<config><plate>
  <metadata key="plater_id" value="1"/>
  <metadata key="plater_name" value="plate-A"/>
  <model_instance><metadata key="object_id" value="1"/><metadata key="identify_id" value="1"/></model_instance>
</plate></config>
EOF
printf '{"filament_vendor":["Bambu Lab"],"filament_type":["PLA"]}' > Metadata/project_settings.config
zip -X ../fixture-a.gcode.3mf Metadata/*
```

- [ ] **Step 4: Verifikasi browser saas (best effort)**

Jalankan dev server saas via preview (`.claude/launch.json` entry `runtimeExecutable: "pnpm"`, `runtimeArgs: ["--filter", "@3pb/saas", "dev"]`, port sesuai output dev). Buka `/kalkulator`. **Catatan gating:** tombol import hanya muncul saat `paidCore` (Pro). Kalau sesi Pro tak tersedia lokal, SKIP langkah browser ini dan catat di laporan akhir bahwa verifikasi visual dilakukan user dengan file asli — cakupan perilaku sudah dipegang component test Task 2.

Bila bisa: import fixture-a → 1 plate terisi; import fixture-b → total 3 plate; batch tidak berubah setelah import kedua; screenshot sebagai bukti.

- [ ] **Step 5: Update task board + laporan**

Sesuai skill task-tracker: catat task ini di board sebagai **Perlu verifikasi** (bukan Done) via OK MCP bila tersedia, dan laporkan hasil (test/build output, keterbatasan verifikasi browser) ke user. JANGAN deploy.

---

## Self-Review Checklist (sudah dijalankan penulis plan)

1. **Spec coverage:** multi-select (T2 S3c, T4 S4) ✓; append + pristine (T1, T3) ✓; batch/nama pristine-only (T2 S3b, T4 S2) ✓; error per file (T2 S3b, T4 S2) ✓; dedupe warnings (T2 S3b, T4 S2) ✓; thumbnail key unik + merge (T4 S1b, S2) ✓; core tak berubah ✓.
2. **Placeholder scan:** tidak ada TBD/TODO; semua step berisi kode aktual.
3. **Type consistency:** `mergeImportedPlates` signature identik di kedua app (beda constraint sesuai tipe plate per app); `handleImportFiles`/`handleImport3mf(files: File[])` konsisten dipakai di input + drop.
