# Duplikat kalkulasi + Hitung ulang tarif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Pro users in `apps/saas` (Slizebiz) duplicate a saved kalkulasi (from Riwayat or from the edit page) into a fresh record, and recalculate an existing saved record's frozen price snapshot against current catalog rates — with a before/after comparison shown before any overwrite.

**Architecture:** A new pure function `computeKalkulasiSnapshot` (in `lib/kalkulator/`) recomputes a `KalkulasiSnapshot` from a stored `KalkulasiInput` + current `LocalSettings`, reusing `fullView` exactly as `Calculator.tsx` already does. `RiwayatList.tsx` gains two new per-row actions built on this function (Duplikat, Hitung ulang); `Calculator.tsx`/`ResultPanel.tsx` gain a "Duplikat" button for the case where the user is already looking at a live-computed `view` (no need to call the new function there — reuse the view already on screen).

**Tech Stack:** Same as Fase 1b-4 — Next.js 16 App Router, `idb`/IndexedDB via the existing `kalkulasi-history.ts` CRUD layer, vitest + `@testing-library/react`.

## Global Constraints

- Node 22 required for every shell command: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` first.
- Run tests/build from the worktree `/Users/adhityatangahu/Documents/trees/saas-duplikat-recalc` on branch `feat/saas-duplikat-recalc-kalkulasi`.
- **Never `git add -A` / `git add .`** — every commit step lists exact paths.
- **Never `crypto.randomUUID()` directly** — always `newId()` from `@/lib/id`.
- **Formula core `packages/kalkulator-core` must NOT change.**
- Duplicate's name is always `originalNama + " (salinan)"` — never a prompt, never identical-with-no-suffix.
- Duplicate ALWAYS recomputes the snapshot fresh (from the live `view` when duplicating from the edit page, or via `computeKalkulasiSnapshot` when duplicating from Riwayat) — never copies the old snapshot verbatim.
- Duplicating from the edit page (`/kalkulator/[id]`) creates a NEW id via `newId()` and navigates to `/kalkulator/<new-id>` — the original record (`savedId`) is never touched/overwritten.
- Duplicating from `RiwayatList` stays on the Riwayat page (list refresh only, no navigation).
- "Hitung ulang" (RiwayatList only) overwrites the SAME record's `snapshot`/`updatedAt` (not `id`/`nama`/`createdAt`) — but only after `window.confirm` with a message showing old price → new price + signed delta; a `false` result must leave the record completely untouched. If the freshly computed `rekomendasi` equals the stored one, skip `window.confirm` and `putKalkulasi` entirely — just show an info message ("Tidak ada perubahan — harga masih sama").
- Free tier: unaffected — none of this is reachable outside `RiwayatList`/`/kalkulator/[id]`, both already Pro-only.

---

### Task 1: `lib/kalkulator/snapshot.ts` — pure recompute function

**Files:**
- Create: `apps/saas/lib/kalkulator/snapshot.ts`
- Create: `apps/saas/lib/kalkulator/snapshot.test.ts`

**Interfaces:**
- Consumes: `fullView, type CalcPlate` from `./compute`; `type LocalSettings` from `./local-settings`; `type PlateRow` from `@/components/PlateInput`; `type KalkulasiInput, type KalkulasiSnapshot` from `@/lib/store/kalkulasi-history`.
- Produces: `computeKalkulasiSnapshot(input: KalkulasiInput, settings: LocalSettings): KalkulasiSnapshot | null` — consumed by Task 4 (`RiwayatList.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `apps/saas/lib/kalkulator/snapshot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeKalkulasiSnapshot } from "./snapshot";
import { fullView } from "./compute";
import { DEFAULT_LOCAL_SETTINGS } from "./local-settings";
import type { KalkulasiInput } from "@/lib/store/kalkulasi-history";

const VALID_INPUT: KalkulasiInput = {
  plates: [{ id: "p1", nama: "", durasiJam: "3", materials: [{ id: "m1", tipe: "FDM", gramasi: "50" }] }],
  batch: "1",
  komponen: [],
  labor: [],
  packing: undefined,
  channel: "offline",
  tier: "B",
};

describe("computeKalkulasiSnapshot", () => {
  it("input valid → snapshot sama dengan fullView untuk plate yang sama", () => {
    const snapshot = computeKalkulasiSnapshot(VALID_INPUT, DEFAULT_LOCAL_SETTINGS);
    const expected = fullView({
      plates: [{ id: "p1", durasiJam: 3, materials: [{ tipe: "FDM", gramasi: 50 }] }],
      batch: 1, komponen: [], labor: [], packing: undefined,
    }, DEFAULT_LOCAL_SETTINGS);
    expect(snapshot).toEqual({
      biayaModal: expected.biayaModal,
      hargaJualMinimum: expected.hargaJualMinimum,
      rekomendasi: expected.rekomendasi,
      status: expected.status,
      strategi: expected.strategi,
    });
  });

  it("plates kosong → null", () => {
    expect(computeKalkulasiSnapshot({ ...VALID_INPUT, plates: [] }, DEFAULT_LOCAL_SETTINGS)).toBeNull();
  });

  it("durasiJam 0 → null", () => {
    const input = { ...VALID_INPUT, plates: [{ ...VALID_INPUT.plates[0], durasiJam: "0" }] };
    expect(computeKalkulasiSnapshot(input, DEFAULT_LOCAL_SETTINGS)).toBeNull();
  });

  it("gramasi 0 → null", () => {
    const input = {
      ...VALID_INPUT,
      plates: [{ ...VALID_INPUT.plates[0], materials: [{ id: "m1", tipe: "FDM" as const, gramasi: "0" }] }],
    };
    expect(computeKalkulasiSnapshot(input, DEFAULT_LOCAL_SETTINGS)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && npx vitest run lib/kalkulator/snapshot.test.ts`
Expected: FAIL — module `./snapshot` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/saas/lib/kalkulator/snapshot.ts`:

```ts
import { fullView, type CalcPlate } from "./compute";
import type { LocalSettings } from "./local-settings";
import type { PlateRow } from "@/components/PlateInput";
import type { KalkulasiInput, KalkulasiSnapshot } from "@/lib/store/kalkulasi-history";

/** Hitung snapshot harga dari KalkulasiInput tersimpan + settings saat ini — dipakai
 *  RiwayatList (tak seperti Calculator, tak punya `view` live yang sudah dihitung). */
export function computeKalkulasiSnapshot(
  input: KalkulasiInput,
  settings: LocalSettings
): KalkulasiSnapshot | null {
  const valid = input.plates.length > 0 && input.plates.every(
    (p) => Number(p.durasiJam) > 0 && p.materials.length > 0 && p.materials.every((m) => Number(m.gramasi) > 0),
  );
  if (!valid) return null;
  const toCalcPlate = (p: PlateRow): CalcPlate => ({
    id: p.id, nama: p.nama || undefined, durasiJam: Number(p.durasiJam),
    materials: p.materials.map((m) => ({ filamentId: m.filamentId, tipe: m.tipe, gramasi: Number(m.gramasi) })),
  });
  const view = fullView({
    plates: input.plates.map(toCalcPlate),
    batch: Number(input.batch),
    komponen: input.komponen,
    labor: input.labor,
    packing: input.packing,
  }, settings);
  return {
    biayaModal: view.biayaModal,
    hargaJualMinimum: view.hargaJualMinimum,
    rekomendasi: view.rekomendasi,
    status: view.status,
    strategi: view.strategi,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/kalkulator/snapshot.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/snapshot.ts apps/saas/lib/kalkulator/snapshot.test.ts
git commit -m "feat(saas): computeKalkulasiSnapshot — recompute snapshot pure function"
```

---

### Task 2: `ResultPanel.tsx` — tombol Duplikat

**Files:**
- Modify: `apps/saas/components/ResultPanel.tsx:13-19` (signature), `:101-109` (button block)
- Modify: `apps/saas/components/ResultPanel.test.tsx` (append new describe block)

**Interfaces:**
- Produces: `ResultPanel` gains optional prop `onDuplicate?: () => void` — consumed by Task 3 (`Calculator.tsx` passes it in both `<ResultPanel>` usages).

- [ ] **Step 1: Write the failing tests**

Append to `apps/saas/components/ResultPanel.test.tsx` (after the existing `describe("ResultPanel: Simpan/Update (1b-4)", ...)` block, before the file's final closing):

```tsx

describe("ResultPanel: Duplikat", () => {
  const base = { view, channel: "offline", tier: "B" as const, onChannel: vi.fn(), onTier: vi.fn(), onCopy: vi.fn(), onReset: vi.fn() };
  it("tanpa onDuplicate → tombol Duplikat tak dirender", () => {
    render(<ResultPanel {...base} />);
    expect(screen.queryByRole("button", { name: /Duplikat/ })).toBeNull();
  });
  it("onDuplicate diberikan → tombol muncul dan memanggilnya saat diklik", () => {
    const onDuplicate = vi.fn();
    render(<ResultPanel {...base} onDuplicate={onDuplicate} />);
    fireEvent.click(screen.getByRole("button", { name: /Duplikat/ }));
    expect(onDuplicate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && npx vitest run components/ResultPanel.test.tsx`
Expected: FAIL — `onDuplicate` prop not accepted, no Duplikat button rendered.

- [ ] **Step 3: Wire up the button**

Modify `apps/saas/components/ResultPanel.tsx` — signature (lines 13-19):

```tsx
export function ResultPanel({
  view, channel, tier, onChannel, onTier, onCopy, onReset, showRincian = true, onSave, isEditing = false, onDuplicate,
}: {
  view: FullView; channel: string; tier: MarginTier;
  onChannel: (c: string) => void; onTier: (t: MarginTier) => void;
  onCopy: () => void; onReset: () => void; showRincian?: boolean;
  onSave?: () => void; isEditing?: boolean; onDuplicate?: () => void;
}) {
```

Replace the button row (lines 101-109):

```tsx
        <div className="flex gap-2">
          <button type="button" onClick={onCopy} className="flex-1 h-10 rounded-[5px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--g-accent)" }}>Salin harga jual</button>
          <button type="button" onClick={onReset} className="g-btn-ghost h-10 px-4 rounded-[5px] text-[13px]">Reset</button>
          {onDuplicate && (
            <button type="button" onClick={onDuplicate} className="g-btn-ghost h-10 px-3 rounded-[5px] text-[13px] font-medium">
              📋 Duplikat
            </button>
          )}
          {onSave && (
            <button type="button" onClick={onSave} className="g-btn-ghost h-10 px-3 rounded-[5px] text-[13px] font-medium">
              {isEditing ? "Update" : "Simpan"}
            </button>
          )}
        </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ResultPanel.test.tsx`
Expected: PASS (all cases, including the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/ResultPanel.tsx apps/saas/components/ResultPanel.test.tsx
git commit -m "feat(saas): tombol Duplikat di ResultPanel"
```

---

### Task 3: `Calculator.tsx` — `handleDuplicate`

**Files:**
- Modify: `apps/saas/components/Calculator.tsx` (add `handleDuplicate`, wire `onDuplicate` prop)
- Modify: `apps/saas/components/calculator.test.tsx` (append new describe block)

**Interfaces:**
- Consumes: `onDuplicate?: () => void` prop on `ResultPanel` (Task 2).
- Produces: nothing new consumed by later tasks (Task 4 is independent of this one).

- [ ] **Step 1: Write the failing tests**

Append to `apps/saas/components/calculator.test.tsx` (after the existing `describe("Calculator: simpan & riwayat (1b-4)", ...)` block, before the file's final closing):

```tsx

describe("Calculator: Duplikat", () => {
  it("kalkulasi baru (belum tersimpan) → tombol Duplikat tak muncul", () => {
    render(<Calculator paidCore userId="u1" />);
    expect(screen.queryByRole("button", { name: /Duplikat/ })).toBeNull();
  });

  it("sedang edit record tersimpan → tombol Duplikat muncul", async () => {
    (getKalkulasi as any).mockResolvedValueOnce({
      id: "k1", userId: "u1", nama: "X",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      input: {
        plates: [{ id: "p1", nama: "", durasiJam: "5", materials: [{ id: "m1", tipe: "FDM", gramasi: "80" }] }],
        batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
      },
      snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 0, status: "AMAN", strategi: {} },
    });
    render(<Calculator paidCore userId="u1" kalkulasiId="k1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Duplikat/ })).toBeTruthy());
  });

  it("klik Duplikat → putKalkulasi id BARU (beda dari kalkulasiId), nama berakhiran (salinan), pindah ke /kalkulator/[id-baru]", async () => {
    (getKalkulasi as any).mockResolvedValueOnce({
      id: "k1", userId: "u1", nama: "Vas bunga",
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      input: {
        plates: [{ id: "p1", nama: "", durasiJam: "5", materials: [{ id: "m1", tipe: "FDM", gramasi: "80" }] }],
        batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
      },
      snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 0, status: "AMAN", strategi: {} },
    });
    mockPush.mockClear();
    (putKalkulasi as any).mockClear();
    render(<Calculator paidCore userId="u1" kalkulasiId="k1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Duplikat/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Duplikat/ }));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    const saved = (putKalkulasi as any).mock.calls[0][0];
    expect(saved.id).not.toBe("k1");
    expect(saved.nama).toBe("Vas bunga (salinan)");
    expect(mockPush).toHaveBeenCalledWith(`/kalkulator/${saved.id}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && npx vitest run components/calculator.test.tsx`
Expected: FAIL — no Duplikat button, `handleDuplicate` doesn't exist.

- [ ] **Step 3: Add `handleDuplicate` and wire it up**

Modify `apps/saas/components/Calculator.tsx` — insert this new function right after `handleSave`'s closing `};` (currently line 132, right before `const r = view?.rincian;`):

```tsx
  const handleDuplicate = () => {
    if (saving) return;
    if (!userId || !view || savedId === undefined) return;
    const id = newId();
    const now = new Date().toISOString();
    const finalNama = (nama.trim() || "Kalkulasi " + new Date().toLocaleDateString("id-ID")) + " (salinan)";
    const record: KalkulasiRecord = {
      id,
      userId,
      nama: finalNama,
      createdAt: now,
      updatedAt: now,
      input: { plates, batch, komponen, labor, packing, channel, tier },
      snapshot: {
        biayaModal: view.biayaModal,
        hargaJualMinimum: view.hargaJualMinimum,
        rekomendasi: view.rekomendasi,
        status: view.status,
        strategi: view.strategi,
      },
    };
    setSaving(true);
    putKalkulasi(record).then(() => {
      setSaving(false);
      router.push(`/kalkulator/${id}`);
    });
  };
```

Then modify BOTH `<ResultPanel>` usages (desktop sticky panel and mobile bottom sheet) to add `onDuplicate`. Current desktop usage:

```tsx
          <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} showRincian={showRincian}
            onSave={paidCore ? handleSave : undefined} isEditing={savedId !== undefined} />
```

becomes:

```tsx
          <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} showRincian={showRincian}
            onSave={paidCore ? handleSave : undefined} isEditing={savedId !== undefined}
            onDuplicate={paidCore && savedId !== undefined ? handleDuplicate : undefined} />
```

Current mobile usage:

```tsx
                <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} showRincian={showRincian}
                  onSave={paidCore ? handleSave : undefined} isEditing={savedId !== undefined} />
```

becomes:

```tsx
                <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} showRincian={showRincian}
                  onSave={paidCore ? handleSave : undefined} isEditing={savedId !== undefined}
                  onDuplicate={paidCore && savedId !== undefined ? handleDuplicate : undefined} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/calculator.test.tsx`
Expected: PASS — all pre-existing cases plus the new "Calculator: Duplikat" block.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/Calculator.tsx apps/saas/components/calculator.test.tsx
git commit -m "feat(saas): Calculator.handleDuplicate — duplikat dari halaman edit"
```

---

### Task 4: `RiwayatList.tsx` — Duplikat & Hitung ulang per-baris

**Files:**
- Modify: `apps/saas/components/RiwayatList.tsx` (whole file — see full replacement below)
- Modify: `apps/saas/components/RiwayatList.test.tsx` (add mocks + new describe block)

**Interfaces:**
- Consumes: `computeKalkulasiSnapshot` from `@/lib/kalkulator/snapshot` (Task 1); `putKalkulasi` from `@/lib/store/kalkulasi-history` (already exists, not previously imported here); `loadSettings` from `@/lib/store/local-settings`; `newId` from `@/lib/id`.
- Produces: nothing consumed by later tasks — this is the last feature task.

- [ ] **Step 1: Add mocks and failing tests to `RiwayatList.test.tsx`**

Modify `apps/saas/components/RiwayatList.test.tsx` — replace the top mock block and `REC` fixture (lines 1-22) in full:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RiwayatList } from "./RiwayatList";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/kalkulator/local-settings";

vi.mock("@/lib/store/kalkulasi-history", () => ({
  listKalkulasi: vi.fn(async () => []),
  deleteKalkulasi: vi.fn(async () => {}),
  putKalkulasi: vi.fn(async () => {}),
}));
import { listKalkulasi, deleteKalkulasi, putKalkulasi } from "@/lib/store/kalkulasi-history";

vi.mock("@/lib/store/local-settings", () => ({
  loadSettings: vi.fn(async () => ({})),
}));
import { loadSettings } from "@/lib/store/local-settings";

const REC = {
  id: "k1", userId: "u1", nama: "Vas bunga",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
  input: {
    plates: [{ id: "p1", nama: "", durasiJam: "3", materials: [{ id: "m1", tipe: "FDM", gramasi: "50" }] }],
    batch: "1", komponen: [], labor: [], packing: undefined, channel: "offline", tier: "B",
  },
  snapshot: { biayaModal: 0, hargaJualMinimum: 0, rekomendasi: 25000, status: "AMAN", strategi: {} },
};

beforeEach(() => {
  (listKalkulasi as any).mockReset().mockResolvedValue([]);
  (deleteKalkulasi as any).mockReset().mockResolvedValue(undefined);
  (putKalkulasi as any).mockReset().mockResolvedValue(undefined);
  (loadSettings as any).mockReset().mockResolvedValue(DEFAULT_LOCAL_SETTINGS);
});
```

Note: `REC.input.plates` now uses the SAME fixture plate as `snapshot.test.ts` (durasiJam "3", gramasi "50", FDM) — with `DEFAULT_LOCAL_SETTINGS`, `computeKalkulasiSnapshot` on this exact input produces `{ biayaModal: 29370, hargaJualMinimum: 58620, rekomendasi: 87930, status: "TIDAK_DISET" }` (verified by running the real formula against this fixture). `REC.snapshot.rekomendasi` stays `25000` (an arbitrary stored value, deliberately different from the freshly-computed `87930`) so the existing display/delete tests are unaffected and the new "Hitung ulang" tests below have a real, non-zero delta to assert on.

Append this new describe block at the end of the file, after the existing `describe("RiwayatList", ...)` block:

```tsx

describe("RiwayatList: Duplikat & Hitung ulang", () => {
  it("klik Duplikat → putKalkulasi id baru + nama (salinan), list refresh, tak ada navigasi", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    (putKalkulasi as any).mockClear();
    (listKalkulasi as any).mockClear();
    fireEvent.click(screen.getByLabelText("Duplikat"));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    const saved = (putKalkulasi as any).mock.calls[0][0];
    expect(saved.id).not.toBe("k1");
    expect(saved.nama).toBe("Vas bunga (salinan)");
    expect(saved.snapshot.rekomendasi).toBe(87930);
    await waitFor(() => expect(listKalkulasi).toHaveBeenCalledTimes(1));
  });

  it("input plate tak valid → pesan error, putKalkulasi TIDAK dipanggil", async () => {
    const rusak = { ...REC, input: { ...REC.input, plates: [] } };
    (listKalkulasi as any).mockResolvedValue([rusak]);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Duplikat"));
    await waitFor(() => expect(screen.getByText(/Gagal duplikat/)).toBeTruthy());
    expect(putKalkulasi).not.toHaveBeenCalled();
  });

  it("klik Hitung ulang, harga beda → confirm tampil dgn harga lama+baru+selisih, OK → putKalkulasi id sama", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    window.confirm = vi.fn(() => true);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    (putKalkulasi as any).mockClear();
    fireEvent.click(screen.getByLabelText("Hitung ulang"));
    await waitFor(() => expect(putKalkulasi).toHaveBeenCalledTimes(1));
    expect((putKalkulasi as any).mock.calls[0][0].id).toBe("k1");
    expect((putKalkulasi as any).mock.calls[0][0].snapshot.rekomendasi).toBe(87930);
    expect(window.confirm).toHaveBeenCalledWith(
      'Perbarui harga "Vas bunga"?\nRp25.000 → Rp87.930 (+Rp62.930)'
    );
  });

  it("klik Hitung ulang, confirm Cancel → putKalkulasi TIDAK dipanggil, record tak berubah", async () => {
    (listKalkulasi as any).mockResolvedValue([REC]);
    window.confirm = vi.fn(() => false);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    (putKalkulasi as any).mockClear();
    fireEvent.click(screen.getByLabelText("Hitung ulang"));
    expect(putKalkulasi).not.toHaveBeenCalled();
  });

  it("klik Hitung ulang, harga SAMA → tak ada confirm, pesan 'Tidak ada perubahan', putKalkulasi TIDAK dipanggil", async () => {
    const sama = { ...REC, snapshot: { ...REC.snapshot, rekomendasi: 87930 } };
    (listKalkulasi as any).mockResolvedValue([sama]);
    window.confirm = vi.fn(() => true);
    render(<RiwayatList userId="u1" />);
    await waitFor(() => expect(screen.getByText("Vas bunga")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Hitung ulang"));
    await waitFor(() => expect(screen.getByText(/Tidak ada perubahan/)).toBeTruthy());
    expect(window.confirm).not.toHaveBeenCalled();
    expect(putKalkulasi).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && npx vitest run components/RiwayatList.test.tsx`
Expected: FAIL — no `aria-label="Duplikat"`/`"Hitung ulang"` buttons exist yet.

- [ ] **Step 3: Rewrite `RiwayatList.tsx`**

Replace `apps/saas/components/RiwayatList.tsx` in full:

```tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GlassCard, GlassButton } from "@3pb/ui";
import { listKalkulasi, deleteKalkulasi, putKalkulasi, type KalkulasiRecord } from "@/lib/store/kalkulasi-history";
import { computeKalkulasiSnapshot } from "@/lib/kalkulator/snapshot";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings } from "@/lib/store/local-settings";
import { rupiah } from "@/lib/kalkulator/format";
import { newId } from "@/lib/id";

export function RiwayatList({ userId }: { userId: string }) {
  const [records, setRecords] = useState<KalkulasiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    listKalkulasi(userId).then((r) => { setRecords(r); setLoading(false); });
  };

  useEffect(() => { load(); }, [userId]);
  useEffect(() => { loadSettings(userId).then(setSettings); }, [userId]);

  const onDelete = (id: string) => {
    if (!window.confirm("Hapus kalkulasi ini? Tindakan ini tak bisa dibatalkan.")) return;
    deleteKalkulasi(userId, id).then(load);
  };

  const onDuplicate = (record: KalkulasiRecord) => {
    const snapshot = computeKalkulasiSnapshot(record.input, settings);
    if (!snapshot) { setActionMsg("Gagal duplikat — data plate tidak valid"); return; }
    const now = new Date().toISOString();
    const copy: KalkulasiRecord = { ...record, id: newId(), nama: record.nama + " (salinan)", createdAt: now, updatedAt: now, snapshot };
    putKalkulasi(copy).then(() => { setActionMsg(null); load(); });
  };

  const onRecalculate = (record: KalkulasiRecord) => {
    const newSnapshot = computeKalkulasiSnapshot(record.input, settings);
    if (!newSnapshot) { setActionMsg("Gagal hitung ulang — data plate tidak valid"); return; }
    if (newSnapshot.rekomendasi === record.snapshot.rekomendasi) {
      setActionMsg("Tidak ada perubahan — harga masih sama");
      return;
    }
    const delta = newSnapshot.rekomendasi - record.snapshot.rekomendasi;
    const sign = delta >= 0 ? "+" : "-";
    const pesan = `Perbarui harga "${record.nama}"?\n${rupiah(record.snapshot.rekomendasi)} → ${rupiah(newSnapshot.rekomendasi)} (${sign}${rupiah(Math.abs(delta))})`;
    if (!window.confirm(pesan)) return;
    putKalkulasi({ ...record, updatedAt: new Date().toISOString(), snapshot: newSnapshot }).then(() => { setActionMsg(null); load(); });
  };

  if (loading) {
    return <div className="text-[12px] g-t4 p-4">Memuat riwayat…</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Link href="/kalkulator"><GlassButton>Hitung</GlassButton></Link>
        <button type="button" onClick={load} className="g-btn-ghost h-10 px-3 rounded-[5px] text-[12px]">🔄 Refresh</button>
      </div>

      {actionMsg && <div className="text-[12px] g-t4">{actionMsg}</div>}

      {records.length === 0 ? (
        <GlassCard className="p-6 text-center">
          <p className="text-[13px] g-t3">Belum ada riwayat, mulai hitung pertama kamu.</p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-2">
          {records.map((rec) => (
            <GlassCard key={rec.id} className="p-3 flex items-center justify-between gap-3">
              <Link href={`/kalkulator/${rec.id}`} className="flex-1 min-w-0 no-underline">
                <div className="text-[13px] font-medium g-t1 truncate">{rec.nama}</div>
                <div className="text-[11px] g-t4">{new Date(rec.updatedAt).toLocaleDateString("id-ID")} · {rupiah(rec.snapshot.rekomendasi)}</div>
              </Link>
              <button type="button" aria-label="Duplikat" onClick={() => onDuplicate(rec)} className="g-btn-ghost h-8 px-2 rounded-[5px] text-[13px] shrink-0">📋</button>
              <button type="button" aria-label="Hitung ulang" onClick={() => onRecalculate(rec)} className="g-btn-ghost h-8 px-2 rounded-[5px] text-[13px] shrink-0">🧮</button>
              <button type="button" aria-label="Hapus" onClick={() => onDelete(rec.id)} className="g-btn-ghost h-8 px-2 rounded-[5px] text-[13px] shrink-0">🗑️</button>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/RiwayatList.test.tsx`
Expected: PASS — all pre-existing cases plus the 5 new ones in "RiwayatList: Duplikat & Hitung ulang".

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/RiwayatList.tsx apps/saas/components/RiwayatList.test.tsx
git commit -m "feat(saas): RiwayatList — Duplikat & Hitung ulang per-baris"
```

---

### Task 5: Verifikasi akhir

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/saas && npx vitest run`
Expected: all tests pass, including every file touched in Tasks 1-4.

- [ ] **Step 2: Typecheck + build**

Run: `npx prisma generate && npx tsc --noEmit && npx next build`
Expected: no NEW type errors introduced by this branch's files (the repo may show pre-existing unrelated errors in `import-3mf`/`beli`/`wa` test files from before this branch — confirm via `git stash` or comparing against `master` if any errors appear in files this plan didn't touch). Build succeeds.

- [ ] **Step 3: Whole-monorepo test run**

From repo root: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm turbo test`
Expected: all packages green.

- [ ] **Step 4: Confirm scope**

Run: `git status` and `git diff --stat master...HEAD`
Expected: only files listed in Tasks 1-4 appear (`apps/saas/lib/kalkulator/snapshot.ts`, `apps/saas/lib/kalkulator/snapshot.test.ts`, `apps/saas/components/ResultPanel.tsx`, `apps/saas/components/ResultPanel.test.tsx`, `apps/saas/components/Calculator.tsx`, `apps/saas/components/calculator.test.tsx`, `apps/saas/components/RiwayatList.tsx`, `apps/saas/components/RiwayatList.test.tsx`), plus the spec/plan docs already committed.

No commit in this task — verification-only. If green, branch is ready for final whole-branch review and `finishing-a-development-branch`.
