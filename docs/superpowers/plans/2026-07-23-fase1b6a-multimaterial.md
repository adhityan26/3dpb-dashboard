# Fase 1b-6a — Multi-material per plate + katalog filament Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satu plate di kalkulator `apps/saas` bisa memakai >1 filament, tiap material mengambil tarif dari katalog filament yang dikelola user di Setting.

**Architecture:** Aditif di sisi `apps/saas` saja. Data model (`LocalSettings.filaments` + `PlateRow.materials[]`), UI (Setting "Daftar filament" + toggle multi-material di plate), lalu wiring `buildInputV2` map material → tarif katalog dengan fallback `material[tipe]`. Formula core `@3pb/kalkulator-core` **tidak disentuh** — `PlateInputV2.materials[]` sudah native.

**Tech Stack:** Next.js 16 (React 19, "use client"), TypeScript, vitest + @testing-library/react (jsdom), IndexedDB (idb), `@3pb/ui` (Glass primitives + `HexColorPicker`/`isValidHexColor`).

## Global Constraints

- **Bahasa Indonesia** untuk semua copy UI, komentar, pesan validasi.
- **Node 22**: sebelum perintah shell jalankan `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`.
- **ID pakai `newId()` dari `@/lib/id`** — JANGAN `crypto.randomUUID()` (rusak di context non-secure `http://<IP>`).
- **Formula core tidak berubah.** Perubahan tarif/multi-material hanya di adapter `apps/saas/lib/kalkulator/*`.
- **`git add <path spesifik>`** tiap commit — JANGAN `git add -A`/`git add .`.
- **Paritas:** user yang tak menyentuh katalog (material tanpa `filamentId`) harus dapat hasil **identik** dengan sebelum 1b-6a (fallback `LocalSettings.material[tipe]`).
- **Gating:** multi-material + katalog filament = fitur **Pro** (locked branch tak dapat editor katalog / toggle). Konsisten dengan multi-plate.
- **Tier disebut "Pro"** di copy (bukan "Beli").
- Angka default tarif filament seed = ambil dari `DEFAULT_MATERIAL` (`FDM: hpp 300 / jual 900`, `SLA: hpp 1750 / jual 3500`, `failureRatePct 12`).
- Jalankan test dengan Node 22: `cd apps/saas && npx prisma generate` sekali di worktree baru sebelum suite penuh (entitlement.test butuh Prisma client), lalu `pnpm --filter @3pb/saas test`.

---

### Task 1: Data model katalog filament — `FilamentEntry` + `LocalSettings.filaments` + validasi

**Files:**
- Modify: `apps/saas/lib/kalkulator/local-settings.ts`
- Test: `apps/saas/lib/kalkulator/local-settings.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_MATERIAL` dari `./default-settings`, `isValidHexColor` dari `@3pb/ui`.
- Produces: `FilamentEntry`, `LocalSettings.filaments: FilamentEntry[]`, `newFilamentEntry(): FilamentEntry`, dan aturan validasi baru. Dipakai Task 2 (compute), Task 4 (Settings UI), Task 5 (plate UI).

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `apps/saas/lib/kalkulator/local-settings.test.ts`:

```ts
import { DEFAULT_LOCAL_SETTINGS, validateLocalSettings, newFilamentEntry, type LocalSettings } from "./local-settings";

describe("1b-6a filament catalog", () => {
  it("DEFAULT punya minimal 3 filament valid", () => {
    expect(DEFAULT_LOCAL_SETTINGS.filaments.length).toBeGreaterThanOrEqual(3);
    expect(validateLocalSettings(DEFAULT_LOCAL_SETTINGS)).toEqual([]);
  });

  it("newFilamentEntry: baris kosong ber-id, tipe FDM default", () => {
    const f = newFilamentEntry();
    expect(f).toMatchObject({ brand: "", material: "", warna: "", tipe: "FDM" });
    expect(typeof f.id).toBe("string");
    expect(f.id.length).toBeGreaterThan(0);
  });

  it("menolak filament harga modal / jual ≤ 0", () => {
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, filaments: [
      { id: "f1", brand: "A", material: "PLA", tipe: "FDM", warna: "Putih", hppPerGram: 0, jualPerGram: 500 },
    ] };
    expect(validateLocalSettings(bad).some((e) => /harga modal|modal.*> 0|hpp/i.test(e))).toBe(true);
  });

  it("menolak warnaHex tidak valid", () => {
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, filaments: [
      { id: "f1", brand: "A", material: "PLA", tipe: "FDM", warna: "Putih", warnaHex: "bukan-hex", hppPerGram: 300, jualPerGram: 500 },
    ] };
    expect(validateLocalSettings(bad).some((e) => /warna|hex/i.test(e))).toBe(true);
  });

  it("menolak filament identitas duplikat (brand+material+warna)", () => {
    const dup = { brand: "eSUN", material: "PLA", tipe: "FDM" as const, warna: "Putih", hppPerGram: 300, jualPerGram: 500 };
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, filaments: [
      { id: "f1", ...dup }, { id: "f2", ...dup },
    ] };
    expect(validateLocalSettings(bad).some((e) => /sama|unik|duplik/i.test(e))).toBe(true);
  });

  it("menerima katalog filament kosong", () => {
    const empty: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, filaments: [] };
    expect(validateLocalSettings(empty)).toEqual([]);
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run: `cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run lib/kalkulator/local-settings.test.ts`
Expected: FAIL — `newFilamentEntry` tak ada / `filaments` undefined.

- [ ] **Step 3: Implementasi minimal**

Di `apps/saas/lib/kalkulator/local-settings.ts`:

1. Tambah import: `import { isValidHexColor } from "@3pb/ui";`
2. Tambah interface setelah `LaborJob`:

```ts
export interface FilamentEntry {
  id: string;
  brand: string;
  material: string;         // polimer: "PLA+", "PETG", "Resin"
  tipe: "FDM" | "SLA";
  warna: string;
  warnaHex?: string;
  hppPerGram: number;
  jualPerGram: number;
  failureRatePct?: number;
}
```

3. Tambah `filaments: FilamentEntry[];` ke interface `LocalSettings` (setelah `laborJobs`).
4. Tambah ke `DEFAULT_LOCAL_SETTINGS` (setelah `laborJobs`):

```ts
  filaments: [
    { id: "fil-pla-putih",  brand: "eSUN",     material: "PLA+",  tipe: "FDM", warna: "Putih", warnaHex: "#f5f5f5", hppPerGram: 300,  jualPerGram: 900 },
    { id: "fil-petg-hitam", brand: "eSUN",     material: "PETG",  tipe: "FDM", warna: "Hitam", warnaHex: "#1a1a1a", hppPerGram: 300,  jualPerGram: 900 },
    { id: "fil-resin-abu",  brand: "Anycubic", material: "Resin", tipe: "SLA", warna: "Abu",   warnaHex: "#9ca3af", hppPerGram: 1750, jualPerGram: 3500 },
  ],
```

5. Tambah factory (export, dekat file bawah):

```ts
export function newFilamentEntry(): FilamentEntry {
  return { id: "", brand: "", material: "", tipe: "FDM", warna: "", hppPerGram: 0, jualPerGram: 0 };
}
```
> Catatan: `id` diisi caller lewat `newId()` di UI (jangan panggil `newId` di modul lib supaya tetap pure & deterministik untuk test). UI: `{ ...newFilamentEntry(), id: newId() }`.

6. Tambah validasi di `validateLocalSettings` (sebelum `return errs;`):

```ts
  ls.filaments.forEach((f, i) => {
    const label = `${f.brand} ${f.material} ${f.warna}`.trim() || `#${i + 1}`;
    if (!`${f.brand}${f.material}${f.warna}`.trim()) errs.push(`Filament #${i + 1} brand/material/warna kosong`);
    if (!(f.hppPerGram > 0)) errs.push(`Filament "${label}" harga modal harus > 0`);
    if (!(f.jualPerGram > 0)) errs.push(`Filament "${label}" harga jual harus > 0`);
    if (f.warnaHex != null && f.warnaHex.trim() !== "" && !isValidHexColor(f.warnaHex)) errs.push(`Filament "${label}" warna hex tidak valid`);
    if (f.failureRatePct != null && (f.failureRatePct < 0 || f.failureRatePct > 100)) errs.push(`Filament "${label}" failure rate harus 0–100`);
  });
  const filKeys = ls.filaments.map((f) => `${f.brand}|${f.material}|${f.warna}`.trim().toLowerCase()).filter((k) => k !== "||");
  if (new Set(filKeys).size !== filKeys.length) errs.push("Ada filament dengan identitas sama — brand+material+warna harus unik");
```

- [ ] **Step 4: Jalankan test — pastikan lulus**

Run: `cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run lib/kalkulator/local-settings.test.ts`
Expected: PASS (semua, termasuk test lama).

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/local-settings.ts apps/saas/lib/kalkulator/local-settings.test.ts
git commit -m "feat(saas): FilamentEntry + LocalSettings.filaments + validasi (1b-6a)"
```

---

### Task 2: `compute.ts` — `CalcMaterial` + `CalcPlate.materials` + `rateOf` (paritas)

**Files:**
- Modify: `apps/saas/lib/kalkulator/compute.ts`
- Test: `apps/saas/lib/kalkulator/compute.test.ts`

**Interfaces:**
- Consumes: `FilamentEntry`, `LocalSettings.filaments` (Task 1).
- Produces: `CalcMaterial { filamentId?; tipe: "FDM"|"SLA"; gramasi: number }`; `CalcPlate` diperluas dengan `materials?: CalcMaterial[]` (legacy `tipe`/`gramasi` tetap didukung). Dipakai Task 3 (`toCalcPlate` di Calculator).

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `apps/saas/lib/kalkulator/compute.test.ts` (blok `describe("buildInputV2 multi-plate"...)` sudah ada; tambah blok baru):

```ts
import { DEFAULT_LOCAL_SETTINGS } from "./local-settings";

describe("1b-6a multi-material", () => {
  const p = (over = {}): CalcPlate => ({ id: "x", tipe: "FDM", gramasi: 50, durasiJam: 3, ...over });

  it("paritas: plate 1 material tanpa filamentId == perilaku legacy", () => {
    const legacy = buildInputV2({ plates: [p()] });
    const viaMaterials = buildInputV2({ plates: [{ id: "x", durasiJam: 3, materials: [{ tipe: "FDM", gramasi: 50 }] }] });
    expect(viaMaterials.plates[0].materials).toEqual(legacy.plates[0].materials);
  });

  it("plate 2 material dari katalog: gram & tarif per material dari filaments", () => {
    const ls = DEFAULT_LOCAL_SETTINGS;
    const out = buildInputV2({ plates: [{
      id: "x", durasiJam: 3, materials: [
        { filamentId: "fil-pla-putih", tipe: "FDM", gramasi: 40 },
        { filamentId: "fil-resin-abu", tipe: "SLA", gramasi: 10 },
      ],
    }] }, ls);
    expect(out.plates[0].materials).toHaveLength(2);
    expect(out.plates[0].materials[0]).toMatchObject({ gramasi: 40, hppPerGram: 300, jualPerGram: 900 });
    expect(out.plates[0].materials[1]).toMatchObject({ gramasi: 10, hppPerGram: 1750, jualPerGram: 3500 });
  });

  it("filamentId tak dikenal → fallback material[tipe]", () => {
    const out = buildInputV2({ plates: [{ id: "x", durasiJam: 3, materials: [{ filamentId: "tidak-ada", tipe: "SLA", gramasi: 20 }] }] }, DEFAULT_LOCAL_SETTINGS);
    expect(out.plates[0].materials[0]).toMatchObject({
      gramasi: 20,
      hppPerGram: DEFAULT_LOCAL_SETTINGS.material.SLA.hppPerGram,
      jualPerGram: DEFAULT_LOCAL_SETTINGS.material.SLA.jualPerGram,
    });
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run: `cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run lib/kalkulator/compute.test.ts`
Expected: FAIL — `materials` di CalcPlate tak dikenal / tarif tak ter-resolve.

- [ ] **Step 3: Implementasi minimal**

Di `apps/saas/lib/kalkulator/compute.ts`:

1. Ubah import `local-settings` untuk menyertakan `FilamentEntry` (tak wajib diekspor ulang; cukup pakai `ls.filaments`).
2. Tambah interface & perluas `CalcPlate`:

```ts
export interface CalcMaterial {
  filamentId?: string;
  tipe: "FDM" | "SLA";
  gramasi: number;
}

export interface CalcPlate {
  id: string;
  nama?: string;
  durasiJam: number;
  // legacy single-material (1b-3) — tetap didukung
  tipe?: "FDM" | "SLA";
  gramasi?: number;
  // multi-material (1b-6a) — kalau ada & non-kosong, dipakai
  materials?: CalcMaterial[];
}
```

3. Ganti `toPlate` agar berbasis material array + resolver tarif:

```ts
export function buildInputV2(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): KalkulasiInputV2 {
  const rateOf = (m: CalcMaterial) => {
    const fil = m.filamentId ? ls.filaments.find((f) => f.id === m.filamentId) : undefined;
    const base = ls.material[m.tipe];
    return {
      gramasi: m.gramasi,
      hppPerGram: fil?.hppPerGram ?? base.hppPerGram,
      jualPerGram: fil?.jualPerGram ?? base.jualPerGram,
      failureRatePct: fil?.failureRatePct ?? base.failureRatePct,
    };
  };
  const materialsOf = (p: CalcPlate): CalcMaterial[] =>
    p.materials && p.materials.length > 0
      ? p.materials
      : [{ tipe: p.tipe ?? "FDM", gramasi: p.gramasi ?? 0 }];
  const toPlate = (p: CalcPlate) => ({
    ...(p.nama ? { namaPart: p.nama } : {}),
    durasiJam: p.durasiJam,
    mesinPerJam: ls.mesinPerJam,
    mesinPerJamJual: ls.mesinPerJam,
    materials: materialsOf(p).map(rateOf),
  });
  const plates =
    c.plates && c.plates.length > 0
      ? c.plates.map(toPlate)
      : [toPlate({ id: "legacy", tipe: c.tipe ?? "FDM", gramasi: c.gramasi ?? 0, durasiJam: c.durasiJam ?? 0 })];
  const safeBatch =
    typeof c.batch === "number" && Number.isFinite(c.batch) && c.batch >= 1 ? c.batch : 1;
  return {
    plates,
    batch: safeBatch,
    komponen: composeKomponen(c.packing, c.komponen ?? []),
    labor: composeLabor(c.labor ?? []),
    ...(c.hargaAktual ? { hargaAktual: c.hargaAktual } : {}),
  };
}
```

> Perhatikan: `CalcInput` legacy top-level (`c.tipe`/`c.gramasi`/`c.durasiJam`) tetap didukung lewat cabang else. `fullView`/`compute`/`strategi` **tidak berubah**.

- [ ] **Step 4: Jalankan test — pastikan lulus**

Run: `cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run lib/kalkulator/compute.test.ts`
Expected: PASS — semua test lama (parity `fullView`, multi-plate) + 3 test baru hijau.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/compute.ts apps/saas/lib/kalkulator/compute.test.ts
git commit -m "feat(saas): compute multi-material per plate + tarif katalog fallback (1b-6a)"
```

---

### Task 3: Migrasi `PlateRow` → `materials[]` (single-material UI tetap) + wiring Calculator

**Files:**
- Modify: `apps/saas/components/PlateInput.tsx`
- Modify: `apps/saas/components/Calculator.tsx`
- Test: `apps/saas/components/PlateInput.test.tsx`
- Test: `apps/saas/components/calculator.test.tsx` (kalau ada assertion shape plate)

**Interfaces:**
- Consumes: `CalcMaterial`/`CalcPlate` (Task 2).
- Produces: `PlateMaterial { id; filamentId?; tipe: "FDM"|"SLA"; gramasi: string; warnaHex? }`; `PlateRow { id; nama; durasiJam: string; materials: PlateMaterial[] }`; `newPlateRow()` (1 material). Dipakai Task 5 (multi-material UI).

**Catatan migrasi:** langkah ini HANYA memindahkan sumber data `tipe`/`gramasi` ke `materials[0]` — tampilan single-material **identik** dengan sekarang. Belum ada toggle/katalog (itu Task 5).

- [ ] **Step 1: Ubah test ke shape baru (test dulu)**

Di `apps/saas/components/PlateInput.test.tsx` ubah helper `row` dan test `newPlateRow`:

```ts
import { PlateInput, newPlateRow, type PlateRow } from "./PlateInput";

const mat = (over = {}) => ({ id: "m1", tipe: "FDM" as const, gramasi: "50", ...over });
const row = (over: Partial<PlateRow> = {}): PlateRow => ({ id: "p1", nama: "", durasiJam: "3", materials: [mat()], ...over });
```

Ganti assertion yang membaca `gramasi: "70"` di root row menjadi lewat material. Contoh test "ubah berat" (baris ~23):

```ts
// setelah ketik berat "70" di plate tunggal:
expect(onP.mock.calls[0][0][0].materials[0]).toMatchObject({ gramasi: "70" });
```

Dan test `newPlateRow` (baris ~59):

```ts
it("newPlateRow menghasilkan row 1 material kosong ber-id", () => {
  const r = newPlateRow();
  expect(r).toMatchObject({ nama: "", durasiJam: "" });
  expect(r.materials).toHaveLength(1);
  expect(r.materials[0]).toMatchObject({ tipe: "FDM", gramasi: "" });
});
```

Untuk test multi-plate total berat (baris ~46), sesuaikan pembuatan row memakai `materials`:

```ts
render(<PlateInput plates={[row({ materials: [mat({ gramasi: "50" })] }), row({ id: "p2", materials: [mat({ id: "m2", gramasi: "30" })] })]} batch="1" onPlatesChange={vi.fn()} onBatchChange={vi.fn()} locked={false} />);
```

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run: `cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run components/PlateInput.test.tsx`
Expected: FAIL — `materials` belum ada di PlateRow.

- [ ] **Step 3: Implementasi — migrasi PlateInput.tsx**

Di `apps/saas/components/PlateInput.tsx`:

1. Ganti interface + factory:

```ts
export interface PlateMaterial {
  id: string;
  filamentId?: string;
  tipe: "FDM" | "SLA";
  gramasi: string;
  warnaHex?: string;
}

export interface PlateRow {
  id: string;
  nama: string;
  durasiJam: string;
  materials: PlateMaterial[];
}

export function newPlateMaterial(): PlateMaterial {
  return { id: newId(), tipe: "FDM", gramasi: "" };
}

export function newPlateRow(): PlateRow {
  return { id: newId(), nama: "", durasiJam: "", materials: [newPlateMaterial()] };
}
```

2. Tambah helper baca/tulis material[0] untuk cabang single-material. Ganti `setRow` konteks: tambah helper `setMat0`:

```ts
  const setRow = (i: number, patch: Partial<PlateRow>) =>
    onPlatesChange(plates.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setMat0 = (i: number, patch: Partial<PlateMaterial>) =>
    onPlatesChange(plates.map((p, j) => (j === i ? { ...p, materials: p.materials.map((m, k) => (k === 0 ? { ...m, ...patch } : m)) } : p)));
```

3. Ganti seluruh pembacaan `p.tipe`/`p.gramasi` menjadi `p.materials[0].tipe`/`p.materials[0].gramasi`, dan penulisannya lewat `setMat0`. Di cabang **locked** (baris ~33-63) dan **single-plate non-locked** (baris ~77-109) dan **tabel multi-plate** (baris ~110-155):
   - `value={p.gramasi}` → `value={p.materials[0].gramasi}`; `onChange` `setRow(i,{gramasi})` → `setMat0(i,{gramasi:e.target.value})`.
   - `value={p.tipe}` → `value={p.materials[0].tipe}`; `onChange` → `setMat0(i,{tipe:e.target.value as "FDM"|"SLA"})`.
   - Untuk locked branch yang pakai `setRow(0, {...})` untuk gramasi/tipe → ganti ke `setMat0(0, {...})`. Durasi tetap `setRow`.
4. `totalGram` → `plates.reduce((s, p) => s + p.materials.reduce((a, m) => a + (Number(m.gramasi) || 0), 0), 0)`.
5. `totalDurasi` tetap dari `p.durasiJam`.

Di `apps/saas/components/Calculator.tsx`:

6. `INITIAL_PLATES` (baris ~19):

```ts
const INITIAL_PLATES: PlateRow[] = [{ id: "plate-1", nama: "", durasiJam: "3", materials: [{ id: "m1", tipe: "FDM", gramasi: "50" }] }];
```

7. `toCalcPlate` (baris ~39):

```ts
  const toCalcPlate = (p: PlateRow): CalcPlate => ({
    id: p.id, nama: p.nama || undefined, durasiJam: Number(p.durasiJam),
    materials: p.materials.map((m) => ({ filamentId: m.filamentId, tipe: m.tipe, gramasi: Number(m.gramasi) })),
  });
```

8. `valid` (baris ~43):

```ts
  const valid = plates.length > 0 && plates.every(
    (p) => Number(p.durasiJam) > 0 && p.materials.length > 0 && p.materials.every((m) => Number(m.gramasi) > 0),
  );
```

- [ ] **Step 4: Jalankan test — pastikan lulus**

Run: `cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run components/PlateInput.test.tsx components/calculator.test.tsx`
Expected: PASS. Kalau `calculator.test.tsx` tak mengassert shape plate, cukup PlateInput hijau.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/PlateInput.tsx apps/saas/components/Calculator.tsx apps/saas/components/PlateInput.test.tsx apps/saas/components/calculator.test.tsx
git commit -m "refactor(saas): PlateRow → materials[] (single-material UI tetap) + wiring Calculator (1b-6a)"
```

---

### Task 4: Setting — section "Daftar filament" (mirror `laborJobs`)

**Files:**
- Modify: `apps/saas/components/SettingsPanel.tsx`
- Test: `apps/saas/components/settings-panel.test.tsx`

**Interfaces:**
- Consumes: `FilamentEntry`, `newFilamentEntry` (Task 1), `isValidHexColor` (`@3pb/ui`), `newId` (`@/lib/id`).
- Produces: UI editor katalog filament. Tak dikonsumsi task lain (murni Settings).

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `apps/saas/components/settings-panel.test.tsx`:

```ts
describe("1b-6a Daftar filament", () => {
  it("Pro: render section + tambah/hapus filament", async () => {
    const user = userEvent.setup();
    render(<SettingsPanel paid userId="u1" />); // sesuaikan props dgn test lain di file ini
    expect(await screen.findByText("Daftar filament")).toBeTruthy();
    const before = screen.getAllByPlaceholderText("Brand").length;
    await user.click(screen.getByText("＋ Tambah filament"));
    expect(screen.getAllByPlaceholderText("Brand").length).toBe(before + 1);
  });
});
```
> Sesuaikan cara render `SettingsPanel` dan util (`userEvent`, `paid`/`userId`) dengan test yang sudah ada di file — pola persis test "Daftar pekerjaan".

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run: `cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run components/settings-panel.test.tsx`
Expected: FAIL — teks "Daftar filament" belum ada.

- [ ] **Step 3: Implementasi**

Di `apps/saas/components/SettingsPanel.tsx`:

1. Import: tambah `type FilamentEntry`, `newFilamentEntry` dari `@/lib/kalkulator/local-settings`; `isValidHexColor` dari `@3pb/ui`.
2. Tambah handler (dekat handler `laborJobs`):

```ts
  const setFil = (i: number, patch: Partial<FilamentEntry>) =>
    setS((p) => ({ ...p, filaments: p.filaments.map((f, k) => (k === i ? { ...f, ...patch } : f)) }));
  const addFil = () => setS((p) => ({ ...p, filaments: [...p.filaments, { ...newFilamentEntry(), id: newId() }] }));
  const delFil = (i: number) => setS((p) => ({ ...p, filaments: p.filaments.filter((_, k) => k !== i) }));
```

3. Tambah `<Section>` baru (setelah section "Daftar pekerjaan", sebelum "Tampilan"):

```tsx
      <Section title="Daftar filament" purpose="Merek & harga filament/resin. Dipakai saat memilih material per plate di kalkulator." locked={disabled}>
        <div className="flex flex-col gap-2">
          {s.filaments.map((f, i) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2">
              <GlassInput value={f.brand} disabled={disabled} placeholder="Brand" className="w-24" onChange={(e) => setFil(i, { brand: e.target.value })} />
              <GlassInput value={f.material} disabled={disabled} placeholder="Material" className="w-24" onChange={(e) => setFil(i, { material: e.target.value })} />
              <select value={f.tipe} disabled={disabled} className="glass-input rounded-[5px] px-2 h-10 text-sm w-[4.5rem]" onChange={(e) => setFil(i, { tipe: e.target.value as "FDM" | "SLA" })}>
                <option value="FDM">FDM</option>
                <option value="SLA">SLA</option>
              </select>
              <span className="inline-flex items-center gap-1">
                <span className="w-4 h-4 rounded-full shrink-0" style={isValidHexColor(f.warnaHex ?? "") ? { background: f.warnaHex, border: "1px solid rgba(255,255,255,0.25)" } : { border: "1px dashed rgba(255,255,255,0.35)" }} />
                <GlassInput value={f.warna} disabled={disabled} placeholder="Warna" className="w-20" onChange={(e) => setFil(i, { warna: e.target.value })} />
                <GlassInput value={f.warnaHex ?? ""} disabled={disabled} placeholder="#hex" className="w-20" onChange={(e) => setFil(i, { warnaHex: e.target.value })} />
              </span>
              <GlassInput type="number" inputMode="decimal" value={String(f.hppPerGram)} disabled={disabled} placeholder="modal/g" className="w-24" onChange={(e) => setFil(i, { hppPerGram: Number(e.target.value) })} />
              <GlassInput type="number" inputMode="decimal" value={String(f.jualPerGram)} disabled={disabled} placeholder="jual/g" className="w-24" onChange={(e) => setFil(i, { jualPerGram: Number(e.target.value) })} />
              {!disabled && <button type="button" onClick={() => delFil(i)} className="g-t4 text-sm px-1" aria-label="Hapus filament">✕</button>}
            </div>
          ))}
          {!disabled && <button type="button" onClick={addFil} className="text-[12px] g-t4 underline self-start">＋ Tambah filament</button>}
        </div>
      </Section>
```

- [ ] **Step 4: Jalankan test — pastikan lulus**

Run: `cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run components/settings-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/SettingsPanel.tsx apps/saas/components/settings-panel.test.tsx
git commit -m "feat(saas): Setting section Daftar filament (1b-6a)"
```

---

### Task 5: Plate UI — toggle multi-material + baris material + dropdown katalog + HexColorPicker

**Files:**
- Modify: `apps/saas/components/PlateInput.tsx`
- Modify: `apps/saas/components/Calculator.tsx` (teruskan `filaments`)
- Test: `apps/saas/components/PlateInput.test.tsx`

**Interfaces:**
- Consumes: `PlateMaterial`/`PlateRow`/`newPlateMaterial` (Task 3), `FilamentEntry` (Task 1), `HexColorPicker`/`HexColorPickerOption` (`@3pb/ui`).
- Produces: interaksi multi-material lengkap. Terminal — tak dikonsumsi task lain.

**Struktur UI (disepakati di spec):** plate dengan 1 material tampil seperti sekarang + tombol kecil "🎨 Multi-material". Plate dengan >1 material tampil sebagai daftar material ter-indent: tiap baris `[filament ▾] [berat g] [swatch] [✕]`, + "＋ material". Pilih filament → set `filamentId`+`tipe`+`warnaHex`. Opsi "— tarif default —" mengosongkan `filamentId` (perlu select FDM/SLA). Polish visual final diverifikasi lewat preview.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan ke `apps/saas/components/PlateInput.test.tsx`:

```ts
describe("1b-6a multi-material di plate", () => {
  const mat = (over = {}) => ({ id: "m1", tipe: "FDM" as const, gramasi: "50", ...over });
  const row = (over = {}): PlateRow => ({ id: "p1", nama: "", durasiJam: "3", materials: [mat()], ...over });
  const fil = [
    { id: "fil-a", brand: "eSUN", material: "PLA+", tipe: "FDM" as const, warna: "Putih", warnaHex: "#f5f5f5", hppPerGram: 300, jualPerGram: 900 },
  ];

  it("tombol Multi-material menambah material ke-2", async () => {
    const user = userEvent.setup();
    const onP = vi.fn();
    render(<PlateInput locked={false} plates={[row()]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /multi-material/i }));
    expect(onP.mock.calls[0][0][0].materials).toHaveLength(2);
  });

  it("hapus material ke-2 kembali single", async () => {
    const user = userEvent.setup();
    const onP = vi.fn();
    const multi = row({ materials: [mat(), mat({ id: "m2", gramasi: "20" })] });
    render(<PlateInput locked={false} plates={[multi]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: /hapus material/i })[1]);
    expect(onP.mock.calls[0][0][0].materials).toHaveLength(1);
  });

  it("pilih filament dari katalog mengisi filamentId + tipe", async () => {
    const user = userEvent.setup();
    const onP = vi.fn();
    const multi = row({ materials: [mat(), mat({ id: "m2" })] });
    render(<PlateInput locked={false} plates={[multi]} batch="1" filaments={fil} onPlatesChange={onP} onBatchChange={vi.fn()} />);
    const selects = screen.getAllByRole("combobox").filter((el) => (el as HTMLSelectElement).name === "filament" || el.getAttribute("aria-label") === "Pilih filament");
    await user.selectOptions(selects[0], "fil-a");
    expect(onP.mock.calls[0][0][0].materials[0]).toMatchObject({ filamentId: "fil-a", tipe: "FDM" });
  });
});
```
> Sesuaikan query selector dengan implementasi Step 3 (beri `aria-label="Pilih filament"` pada select filament).

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run: `cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run components/PlateInput.test.tsx`
Expected: FAIL — prop `filaments` & UI multi-material belum ada.

- [ ] **Step 3: Implementasi**

Di `apps/saas/components/PlateInput.tsx`:

1. Import: `import { GlassInput, HexColorPicker, type HexColorPickerOption } from "@3pb/ui";` dan `import type { FilamentEntry } from "@/lib/kalkulator/local-settings";`
2. Tambah prop `filaments: FilamentEntry[]` ke signature `PlateInput` (default `[]`).
3. Tambah helper material CRUD:

```ts
  const setMat = (pi: number, mi: number, patch: Partial<PlateMaterial>) =>
    onPlatesChange(plates.map((p, j) => (j === pi ? { ...p, materials: p.materials.map((m, k) => (k === mi ? { ...m, ...patch } : m)) } : p)));
  const addMat = (pi: number) =>
    onPlatesChange(plates.map((p, j) => (j === pi ? { ...p, materials: [...p.materials, newPlateMaterial()] } : p)));
  const delMat = (pi: number, mi: number) =>
    onPlatesChange(plates.map((p, j) => (j === pi ? { ...p, materials: p.materials.filter((_, k) => k !== mi) } : p)));
  const pickFilament = (pi: number, mi: number, filamentId: string) => {
    const f = filaments.find((x) => x.id === filamentId);
    setMat(pi, mi, f ? { filamentId: f.id, tipe: f.tipe, warnaHex: f.warnaHex } : { filamentId: undefined });
  };
  const swatchOptions = (f: FilamentEntry | undefined): HexColorPickerOption[] =>
    !f ? [] : filaments
      .filter((x) => x.brand === f.brand && x.material === f.material && x.warnaHex)
      .map((x) => ({ id: x.id, colorName: x.warna, colorHex: x.warnaHex! }));
```

4. Tambah komponen internal `MaterialRows` (dirender di bawah kontrol plate saat `p.materials.length > 1`), dan tombol "🎨 Multi-material" (saat `length === 1`) yang memanggil `addMat(pi)`. Contoh untuk cabang single-plate & tiap baris tabel:

```tsx
{p.materials.length === 1 ? (
  <button type="button" onClick={() => addMat(i)} className="text-[11px] underline self-start" style={{ color: "var(--g-accent)" }}>🎨 Multi-material</button>
) : (
  <div className="flex flex-col gap-1.5 pl-4 border-l-2 border-[color:var(--g-row-border)]">
    {p.materials.map((m, mi) => {
      const f = filaments.find((x) => x.id === m.filamentId);
      return (
        <div key={m.id} className="flex items-center gap-1.5">
          <select aria-label="Pilih filament" value={m.filamentId ?? ""} onChange={(e) => pickFilament(i, mi, e.target.value)}
            className="glass-input rounded-[5px] px-2 h-9 text-[13px] flex-1 min-w-0">
            <option value="">— tarif default —</option>
            {filaments.map((x) => <option key={x.id} value={x.id}>{`${x.brand} ${x.material} ${x.warna}`}</option>)}
          </select>
          {!m.filamentId && (
            <select aria-label="Tipe material" value={m.tipe} onChange={(e) => setMat(i, mi, { tipe: e.target.value as "FDM" | "SLA" })}
              className="glass-input rounded-[5px] px-1.5 h-9 text-[13px] w-16 shrink-0">
              <option value="FDM">FDM</option><option value="SLA">SLA</option>
            </select>
          )}
          <div className="relative w-[4.5rem] shrink-0">
            <GlassInput type="number" inputMode="decimal" placeholder="berat" value={m.gramasi} className="w-full px-2 pr-5"
              onChange={(e) => setMat(i, mi, { gramasi: e.target.value })} />
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">g</span>
          </div>
          <HexColorPicker color={m.warnaHex ?? ""} options={swatchOptions(f)} onSelect={(hex) => setMat(i, mi, { warnaHex: hex })} />
          <button type="button" aria-label="Hapus material" className="g-t4 text-sm px-1 shrink-0" onClick={() => delMat(i, mi)}>✕</button>
        </div>
      );
    })}
    <button type="button" onClick={() => addMat(i)} className="text-[11px] underline self-start" style={{ color: "var(--g-accent)" }}>＋ material</button>
  </div>
)}
```

> Integrasikan blok di atas: pada **single-plate** taruh setelah kartu kontrol; pada **tabel multi-plate** render di bawah baris plate (full-width, `order-*` terakhir) sehingga material ter-indent di bawah barisnya. Saat `materials.length > 1`, sembunyikan select `tipe` lama di baris utama (tipe sekarang per-material). Durasi & nama plate tetap di baris utama.

5. Di `apps/saas/components/Calculator.tsx`: teruskan prop `filaments={settings.filaments}` ke `<PlateInput ... />` (baris ~72).

- [ ] **Step 4: Jalankan test — pastikan lulus**

Run: `cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx vitest run components/PlateInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/PlateInput.tsx apps/saas/components/Calculator.tsx apps/saas/components/PlateInput.test.tsx
git commit -m "feat(saas): UI multi-material per plate + pilih filament katalog + swatch (1b-6a)"
```

---

### Task 6: Verifikasi akhir + verifikasi visual + docs + final review

**Files:**
- Modify: `apps/saas/README.md` atau `docs/` (catat fitur 1b-6a) — sesuaikan dengan konvensi dokumentasi saas yang ada.

- [ ] **Step 1: Prisma generate (worktree baru) + suite penuh**

Run:
```bash
cd apps/saas && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && npx prisma generate && pnpm --filter @3pb/saas test
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/kalkulator-core test
```
Expected: seluruh suite saas + core hijau (core tak berubah).

- [ ] **Step 2: Build**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas build`
Expected: sukses, tanpa error TypeScript.

- [ ] **Step 3: Verifikasi visual (preview sementara)**

Buat route preview sementara `apps/saas/app/zzpreviewcalc/page.tsx` yang merender `<Calculator paidCore userId="preview" />` dibungkus `PageShell` (title wajib). Jalankan `next dev` di port bebas, screenshot: (a) plate single-material default + tombol 🎨; (b) plate multi-material dengan 2 baris + dropdown filament + swatch; (c) Setting "Daftar filament". Perbaiki polish visual bila perlu (radius 5px, tak ada input nabrak). **Hapus route preview sebelum commit final.**

- [ ] **Step 4: Docs**

Catat fitur 1b-6a (katalog filament + multi-material + paritas fallback) di dokumen yang sesuai. Commit:
```bash
git add <file docs>
git commit -m "docs(saas): catat fitur multi-material + katalog filament (1b-6a)"
```

- [ ] **Step 5: Final whole-branch review**

Dispatch final code reviewer (model paling mampu) dengan `review-package MERGE_BASE HEAD` (MERGE_BASE = `git merge-base master HEAD`). Constraints yang diberikan ke reviewer: paritas fallback (material tanpa filamentId = hasil identik), core tak berubah, `newId()` bukan `crypto.randomUUID()`, gating Pro, `git add` spesifik. Perbaiki temuan Critical/Important lalu lanjut ke finishing-a-development-branch.

## Self-Review (penulis plan)

- **Spec coverage:** katalog filament (Task 1+4), multi-material per plate (Task 3+5), wiring tarif+fallback (Task 2), paritas (test Task 2), gating Pro (locked branch Task 3/5 + `disabled` Task 4), HexColorPicker reuse (Task 5). Import 3MF sengaja di luar scope (1b-6b). ✅
- **Placeholder scan:** semua step berisi kode nyata; angka seed pakai nilai `DEFAULT_MATERIAL` sebenarnya. ✅
- **Type consistency:** `PlateMaterial`/`PlateRow` (Task 3) dipakai konsisten di Task 5; `CalcMaterial`/`CalcPlate.materials` (Task 2) dipakai `toCalcPlate` (Task 3); `FilamentEntry` (Task 1) dipakai Task 2/4/5. `newPlateMaterial`/`newFilamentEntry` didefinisikan sebelum dipakai. ✅
- **Catatan risiko:** query selector di test Task 4/5 harus disesuaikan dengan pola test existing di file (userEvent, props render) — implementer diminta mencocokkan pola tetangga.
