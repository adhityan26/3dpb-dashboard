# Redesign UX Kalkulator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menata ulang halaman kalkulator (`apps/saas` `/`) jadi section bertahap (Produksi → Komponen → Finishing → Packing) dengan kontrol per-perilaku, dan panel hasil satu rekomendasi dominan berlaba/margin — tanpa mengubah formula bisnis.

**Architecture:** Formula core tak disentuh. `fullView` diperluas additive (`strategi[channel][tier]` = harga ceil-500 + laba + margin turunan). `KomponenLaborInput` dipecah jadi `KomponenInput`/`LaborInput`/`PackingInput`. Section dibungkus `CalcSection` collapsible. Panel hasil jadi `ResultPanel`. `Calculator` mengorkestrasi state (plates/hasil/komponen/labor/packing + channel/tier) + urutan section + ResultPanel.

**Tech Stack:** Next.js 16 (React 19, "use client"), TypeScript, vitest + @testing-library/react (jsdom), `@3pb/ui` (GlassCard/GlassInput/GlassButton), `@3pb/kalkulator-core`, Tailwind v4, tema Glass.

## Global Constraints

- **Bahasa Indonesia** semua label/microcopy/komentar.
- **Nol perubahan formula** `@3pb/kalkulator-core` (14 golden + test v2 hijau). Perubahan angka hanya tampilan (pembulatan ceil-500, laba/margin turunan).
- Pembulatan harga tampil: **`ceil500(x) = Math.ceil(x/500)*500`**. Angka eksak tetap di Rincian.
- Laba/margin: `net = harga/fee`, `laba = round(net − hppTotal)`, `marginPct = round1((laba/net)×100)`.
- **`newId()`** dari `@/lib/id` untuk id baris klien — JANGAN `crypto.randomUUID()`.
- Tier di copy = **"Pro"**; strategi = Kompetitif/Standard/Premium (=A/B/C).
- **JANGAN** tampilkan rumus `Harga Jual = Modal/(1−margin)` (bukan formula app) atau angka margin-minimum karangan (mis. "20%").
- Perluasan `CalcInput`/`fullView` **additive** — semua test 1a/1b existing hijau tanpa diedit.
- Aksesibilitas: focus ring jelas, target sentuh ≥44px mobile, label ter-asosiasi.
- Tanpa dependency baru. Kerja hanya di worktree `feat/saas-calc-redesign`; commit path spesifik, JANGAN `git add -A`.
- Node 22: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum perintah shell.
- Deploy homelab :3300 gated.

## File Structure

| File | Aksi | Task |
|---|---|---|
| `apps/saas/lib/kalkulator/format.ts` | Create | 1 |
| `apps/saas/lib/kalkulator/format.test.ts` | Create | 1 |
| `apps/saas/lib/kalkulator/compute.ts` | Modify (fullView `strategi`) | 1 |
| `apps/saas/lib/kalkulator/compute.test.ts` | Modify (tambah) | 1 |
| `apps/saas/components/CalcSection.tsx` | Create | 2 |
| `apps/saas/components/CalcSection.test.tsx` | Create | 2 |
| `apps/saas/components/PlateInput.tsx` | Modify (label permanen + "Hasil sekali cetak") | 3 |
| `apps/saas/components/PlateInput.test.tsx` | Modify (tambah) | 3 |
| `apps/saas/components/KomponenInput.tsx` | Create | 4 |
| `apps/saas/components/KomponenInput.test.tsx` | Create | 4 |
| `apps/saas/components/LaborInput.tsx` | Create | 5 |
| `apps/saas/components/LaborInput.test.tsx` | Create | 5 |
| `apps/saas/components/PackingInput.tsx` | Create | 6 |
| `apps/saas/components/PackingInput.test.tsx` | Create | 6 |
| `apps/saas/components/ResultPanel.tsx` | Create | 7 |
| `apps/saas/components/ResultPanel.test.tsx` | Create | 7 |
| `apps/saas/components/Calculator.tsx` | Rewrite (orkestrasi) | 8 |
| `apps/saas/components/calculator.test.tsx` | Modify | 8 |
| `apps/saas/components/KomponenLaborInput.tsx` | Delete | 8 |
| `apps/saas/components/komponen-labor-input.test.tsx` | Delete | 8 |
| `apps/saas/components/RincianPanel.tsx` | Delete (diserap ResultPanel) | 8 |
| `apps/saas/components/rincian-panel.test.tsx` | Delete | 8 |
| `apps/saas/components/MobileSummaryBar.tsx` | Create | 9 |
| `apps/saas/components/MobileSummaryBar.test.tsx` | Create | 9 |

**Interfaces global (dipakai lintas task):**

```ts
// format.ts (Task 1)
export function rupiah(n: number): string;   // "Rp29.370" (id-ID grouping)
export function ceil500(n: number): number;   // Math.ceil(n/500)*500

// compute.ts FullView (Task 1) — TAMBAHAN pada shape lama
export interface StrategiCell { harga: number; laba: number; marginPct: number }
export type Strategi = Record<string /*channelId*/, Record<"A" | "B" | "C", StrategiCell>>;
// FullView.strategi: Strategi   (field lama tetap: biayaModal, hargaJualMinimum, rekomendasi, channels, status, rincian)

// CalcSection.tsx (Task 2)
export function CalcSection(props: {
  n: number; title: string; subtitle?: string; icon?: React.ReactNode;
  subtotalLabel?: string; subtotal?: number;         // subtotal ditampilkan di header (rupiah)
  summary?: string;                                   // ringkasan saat collapse (mis. "1 item · Rp900")
  defaultOpen?: boolean; children: React.ReactNode;
}): JSX.Element;

// KomponenInput.tsx (Task 4)  — settings.komponenPresets, KomponenRow
export function KomponenInput(props: {
  locked: boolean; presets: { id: string; nama: string; harga: number }[];
  komponen: KomponenRow[]; onChange: (r: KomponenRow[]) => void;
}): JSX.Element;

// LaborInput.tsx (Task 5) — settings.laborPresets, LaborRow
export function LaborInput(props: {
  locked: boolean; presets: { id: string; nama: string; items: { nama: string; jam?: number; ratePerJam?: number; flat?: number }[] }[];
  labor: LaborRow[]; onChange: (r: LaborRow[]) => void;
}): JSX.Element;

// PackingInput.tsx (Task 6) — settings.packingPresets
export function PackingInput(props: {
  locked: boolean; presets: { id: string; nama: string; harga: number }[];
  packing: { nama: string; harga: number } | undefined;
  onChange: (p: { nama: string; harga: number } | undefined) => void;
}): JSX.Element;

// ResultPanel.tsx (Task 7)
export function ResultPanel(props: {
  view: FullView; channel: string; tier: "A" | "B" | "C";
  onChannel: (c: string) => void; onTier: (t: "A" | "B" | "C") => void;
  onCopy: () => void; onReset: () => void;
}): JSX.Element;
```

---

### Task 1: format.ts + perluasan fullView.strategi (TDD)

**Files:**
- Create: `apps/saas/lib/kalkulator/format.ts`, `apps/saas/lib/kalkulator/format.test.ts`
- Modify: `apps/saas/lib/kalkulator/compute.ts` (interface `FullView` + fungsi `fullView`)
- Modify: `apps/saas/lib/kalkulator/compute.test.ts` (tambah `describe` di akhir)

**Interfaces:**
- Consumes: `compute(c, ls)` → `HasilKalkulasiV2` (punya `hppTotal`, `hargaPerChannel[{channelId,A,B,C,margin}]`); `toSettingsV2(ls).channels[{id,nama,feeMultiplier}]`.
- Produces: `rupiah`, `ceil500`, `FullView.strategi` (`Strategi` di Interfaces global).

- [ ] **Step 1: Tulis test format yang gagal**

Buat `apps/saas/lib/kalkulator/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rupiah, ceil500 } from "./format";

describe("ceil500", () => {
  it("membulatkan ke atas kelipatan 500", () => {
    expect(ceil500(187155)).toBe(187500);
    expect(ceil500(54721)).toBe(55000);
    expect(ceil500(1)).toBe(500);
  });
  it("kelipatan pas tak berubah", () => {
    expect(ceil500(187500)).toBe(187500);
    expect(ceil500(0)).toBe(0);
  });
});

describe("rupiah", () => {
  it("format ribuan id-ID dengan prefix Rp", () => {
    expect(rupiah(29370)).toBe("Rp29.370");
    expect(rupiah(0)).toBe("Rp0");
  });
});
```

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/format.test.ts`
Expected: FAIL — modul `./format` belum ada.

- [ ] **Step 3: Buat format.ts**

Buat `apps/saas/lib/kalkulator/format.ts`:

```ts
export const rupiah = (n: number): string => "Rp" + Math.round(n).toLocaleString("id-ID");
export const ceil500 = (n: number): number => Math.ceil(n / 500) * 500;
```

- [ ] **Step 4: Jalankan — PASS**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Tulis test fullView.strategi yang gagal**

Tambahkan di akhir `apps/saas/lib/kalkulator/compute.test.ts`:

```ts
describe("fullView.strategi (redesign)", () => {
  const base = { gramasi: 50, durasiJam: 3, tipe: "FDM" as const };
  it("harga per tier = ceil500 dari channel; ada offline & shopee", () => {
    const v = fullView(base);
    expect(v.strategi.offline).toBeTruthy();
    expect(v.strategi.shopee).toBeTruthy();
    for (const t of ["A", "B", "C"] as const) {
      const off = v.channels.find((c) => c.channelId === "offline")!;
      expect(v.strategi.offline[t].harga).toBe(Math.ceil(off[t] / 500) * 500);
    }
  });
  it("laba offline (fee 1) = harga − biaya modal", () => {
    const v = fullView(base);
    const cell = v.strategi.offline.B;
    expect(cell.laba).toBe(Math.round(cell.harga - v.biayaModal));
    expect(cell.marginPct).toBeCloseTo(Math.round((cell.laba / cell.harga) * 1000) / 10, 5);
  });
  it("shopee (fee 1.2) pakai net = harga/1.2 untuk laba", () => {
    const v = fullView(base);
    const cell = v.strategi.shopee.B;
    const net = cell.harga / 1.2;
    expect(cell.laba).toBe(Math.round(net - v.biayaModal));
  });
});
```

- [ ] **Step 6: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compute.test.ts`
Expected: FAIL — `v.strategi` undefined.

- [ ] **Step 7: Tambah `strategi` ke FullView + fullView**

Di `apps/saas/lib/kalkulator/compute.ts`:

(a) Tambah import di baris atas (setelah import compose):

```ts
import { ceil500 } from "./format";
```

(b) Tambah tipe sebelum `export interface FullView` (atau tepat di atasnya):

```ts
export interface StrategiCell { harga: number; laba: number; marginPct: number }
export type Strategi = Record<string, Record<"A" | "B" | "C", StrategiCell>>;
```

(c) Tambah field `strategi: Strategi;` ke interface `FullView` (setelah `rincian: {...};`).

(d) Di fungsi `fullView`, sebelum `return {`, hitung strategi (pakai `settings.channels` untuk fee + `h.hppTotal`):

```ts
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const strategi: Strategi = {};
  for (const ch of h.hargaPerChannel) {
    const fee = settings.channels.find((s) => s.id === ch.channelId)?.feeMultiplier ?? 1;
    const cell = (tierVal: number) => {
      const harga = ceil500(tierVal);
      const net = fee > 0 ? harga / fee : 0;
      const laba = Math.round(net - h.hppTotal);
      return { harga, laba, marginPct: net > 0 ? round1((laba / net) * 100) : 0 };
    };
    strategi[ch.channelId] = { A: cell(ch.A), B: cell(ch.B), C: cell(ch.C) };
  }
```

(e) Tambahkan `strategi,` ke objek yang di-`return` (di antara field lain — tidak menghapus field lama).

- [ ] **Step 8: Jalankan test compute — PASS (baru + lama)**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compute.test.ts lib/kalkulator/format.test.ts`
Expected: PASS semua; test compute lama tetap hijau.

- [ ] **Step 9: Commit**

```bash
git add apps/saas/lib/kalkulator/format.ts apps/saas/lib/kalkulator/format.test.ts apps/saas/lib/kalkulator/compute.ts apps/saas/lib/kalkulator/compute.test.ts
git commit -m "feat(saas): format helper + fullView.strategi (harga ceil500 + laba/margin turunan) (TDD)"
```

---

### Task 2: CalcSection — kartu section collapsible

**Files:**
- Create: `apps/saas/components/CalcSection.tsx`, `apps/saas/components/CalcSection.test.tsx`

**Interfaces:**
- Consumes: `rupiah` dari `@/lib/kalkulator/format`.
- Produces: `CalcSection` (lihat Interfaces global).

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/saas/components/CalcSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalcSection } from "./CalcSection";

describe("CalcSection", () => {
  it("render nomor, judul, subtotal, dan body", () => {
    render(<CalcSection n={1} title="Produksi" subtotal={29370}><p>isi</p></CalcSection>);
    expect(screen.getByText("Produksi")).toBeTruthy();
    expect(screen.getByText(/Rp29\.370/)).toBeTruthy();
    expect(screen.getByText("isi")).toBeTruthy();
  });
  it("collapse menyembunyikan body & menampilkan ringkasan", () => {
    render(<CalcSection n={2} title="Komponen" summary="1 item · Rp900"><p>rahasia</p></CalcSection>);
    fireEvent.click(screen.getByRole("button", { name: /Komponen/ }));
    expect(screen.queryByText("rahasia")).toBeNull();
    expect(screen.getByText(/1 item · Rp900/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/CalcSection.test.tsx`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Buat CalcSection.tsx**

Buat `apps/saas/components/CalcSection.tsx`:

```tsx
"use client";
import { useState, type ReactNode } from "react";
import { GlassCard } from "@3pb/ui";
import { rupiah } from "@/lib/kalkulator/format";

export function CalcSection({
  n, title, subtitle, icon, subtotalLabel = "Subtotal", subtotal, summary, defaultOpen = true, children,
}: {
  n: number; title: string; subtitle?: string; icon?: ReactNode;
  subtotalLabel?: string; subtotal?: number; summary?: string;
  defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <GlassCard className="p-4 min-w-0">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left"
        aria-expanded={open}>
        <span className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-[12px] font-semibold"
          style={{ background: "color-mix(in srgb, var(--g-accent) 18%, transparent)", color: "var(--g-accent)" }}>
          {icon ?? n}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold g-t1">{n}. {title}</span>
          {subtitle && <span className="block text-[11px] g-t3">{subtitle}</span>}
        </span>
        {typeof subtotal === "number" && (
          <span className="shrink-0 text-right">
            <span className="block text-[10px] g-t4 uppercase tracking-wide">{subtotalLabel}</span>
            <span className="block text-sm font-semibold g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(subtotal)}</span>
          </span>
        )}
        <span className="shrink-0 g-t4 text-xs" aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="mt-4">{children}</div>
      ) : (
        summary && <div className="mt-2 text-[12px] g-t3">✓ {summary}</div>
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 4: Jalankan — PASS**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/CalcSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/CalcSection.tsx apps/saas/components/CalcSection.test.tsx
git commit -m "feat(saas): CalcSection kartu section collapsible + subtotal header (TDD)"
```

---

### Task 3: PlateInput — label permanen + "Hasil sekali cetak"

**Files:**
- Modify: `apps/saas/components/PlateInput.tsx` (blok Pro: header kolom + rename batch)
- Modify: `apps/saas/components/PlateInput.test.tsx` (tambah)

**Interfaces:**
- Consumes: `PlateRow`, `newPlateRow` (sudah ada); props `locked/plates/batch/onPlatesChange/onBatchChange` tetap.
- Produces: tidak ada tipe baru; label & copy berubah.

**Konteks:** File `PlateInput.tsx` saat ini (blok Pro) menampilkan baris plate `[nama][select|berat g|durasi jam]`, tombol "＋ tambah plate", TOTAL, dan field "Batch (pcs sekali cetak)". Task ini menambah **label kolom permanen** di atas baris plate dan mengganti "Batch" → "Hasil sekali cetak" + helper + minimal 1. Blok `locked` (Free) TIDAK berubah.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan `describe` di akhir `apps/saas/components/PlateInput.test.tsx`:

```tsx
describe("PlateInput redesign", () => {
  const row = (over: Partial<PlateRow> = {}): PlateRow => ({ id: "p1", nama: "", tipe: "FDM", gramasi: "50", durasiJam: "3", ...over });
  const base = { plates: [row()], batch: "1", onPlatesChange: () => {}, onBatchChange: () => {} };
  it("unlocked → label kolom permanen tampil", () => {
    render(<PlateInput {...base} locked={false} />);
    expect(screen.getByText("Metode cetak")).toBeTruthy();
    expect(screen.getByText("Berat filament")).toBeTruthy();
    expect(screen.getByText("Durasi cetak")).toBeTruthy();
  });
  it("unlocked → 'Hasil sekali cetak' menggantikan 'Batch'", () => {
    render(<PlateInput {...base} locked={false} />);
    expect(screen.getByText(/Hasil sekali cetak/)).toBeTruthy();
    expect(screen.queryByText(/^Batch/)).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/PlateInput.test.tsx`
Expected: FAIL — label "Metode cetak" & "Hasil sekali cetak" belum ada.

- [ ] **Step 3: Tambah header kolom + rename batch**

Di `apps/saas/components/PlateInput.tsx`, di dalam blok unlocked (`return` setelah `if (locked)`), TEPAT sebelum `{plates.map(...)}`, sisipkan baris header kolom (selaras dengan grid baris plate: select `w-[4.75rem]` + dua field `flex-1`):

```tsx
      <div className="flex items-center gap-2 text-[10px] g-t4 uppercase tracking-wide">
        <span className="w-[4.75rem] shrink-0">Metode cetak</span>
        <span className="flex-1 min-w-0">Berat filament</span>
        <span className="flex-1 min-w-0">Durasi cetak</span>
      </div>
```

Lalu ganti blok field **Batch** (label `Batch (pcs sekali cetak)` + InfoTip + GlassInput) dengan:

```tsx
      <label className="text-[12px] g-t3 flex flex-col">
        <span className="flex items-center gap-1">Hasil sekali cetak</span>
        <span className="text-[11px] g-t4 mb-1">Berapa produk yang dihasilkan dari sekali proses cetak di atas?</span>
        <GlassInput type="number" inputMode="numeric" min={1} value={batch} className="w-28"
          onChange={(e) => onBatchChange(e.target.value)} />
      </label>
```

(Header kolom "Bagian cetak (plate)" + InfoTip yang sudah ada di atas map biarkan.)

- [ ] **Step 4: Jalankan — PASS (baru + lama)**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/PlateInput.test.tsx`
Expected: PASS semua; test PlateInput lama tetap hijau.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/PlateInput.tsx apps/saas/components/PlateInput.test.tsx
git commit -m "feat(saas): Produksi — label kolom permanen + 'Hasil sekali cetak' (TDD)"
```

---

### Task 4: KomponenInput — checkbox-chip + baris ringkas + stepper

**Files:**
- Create: `apps/saas/components/KomponenInput.tsx`, `apps/saas/components/KomponenInput.test.tsx`

**Interfaces:**
- Consumes: `KomponenRow` dari `@/lib/kalkulator/compose`; `GlassInput` dari `@3pb/ui`; `newId`; `rupiah` dari format; `InfoTip`.
- Produces: `KomponenInput` (lihat Interfaces global).

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/saas/components/KomponenInput.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KomponenInput } from "./KomponenInput";

const presets = [{ id: "k1", nama: "Gantungan kew-kew", harga: 900 }, { id: "k2", nama: "Switch", harga: 2500 }];

describe("KomponenInput", () => {
  it("locked → 🔒 + CTA", () => {
    render(<KomponenInput locked presets={presets} komponen={[]} onChange={() => {}} />);
    expect(screen.getByText(/Pro/)).toBeTruthy();
  });
  it("klik chip preset → tambah baris komponen", () => {
    const onC = vi.fn();
    render(<KomponenInput locked={false} presets={presets} komponen={[]} onChange={onC} />);
    fireEvent.click(screen.getByRole("button", { name: /Gantungan kew-kew/ }));
    expect(onC.mock.calls[0][0][0]).toMatchObject({ nama: "Gantungan kew-kew", harga: 900, qty: 1 });
  });
  it("chip preset aktif (sudah ada) → klik lagi menghapus", () => {
    const onC = vi.fn();
    render(<KomponenInput locked={false} presets={presets} komponen={[{ id: "x", nama: "Gantungan kew-kew", harga: 900, qty: 1 }]} onChange={onC} />);
    fireEvent.click(screen.getByRole("button", { name: /Gantungan kew-kew/ }));
    expect(onC).toHaveBeenCalledWith([]);
  });
  it("stepper + menaikkan qty, − menurunkan (min 1)", () => {
    const onC = vi.fn();
    const { rerender } = render(<KomponenInput locked={false} presets={presets} komponen={[{ id: "x", nama: "A", harga: 900, qty: 1 }]} onChange={onC} />);
    fireEvent.click(screen.getByLabelText("Tambah qty"));
    expect(onC.mock.calls[0][0][0].qty).toBe(2);
    onC.mockClear();
    rerender(<KomponenInput locked={false} presets={presets} komponen={[{ id: "x", nama: "A", harga: 900, qty: 1 }]} onChange={onC} />);
    fireEvent.click(screen.getByLabelText("Kurangi qty"));
    expect(onC.mock.calls[0][0][0].qty).toBe(1); // clamp min 1
  });
  it("Tambah komponen custom → baris kosong", () => {
    const onC = vi.fn();
    render(<KomponenInput locked={false} presets={presets} komponen={[]} onChange={onC} />);
    fireEvent.click(screen.getByText(/Tambah komponen custom/));
    expect(onC.mock.calls[0][0][0]).toMatchObject({ nama: "", harga: 0, qty: 1 });
    expect(onC.mock.calls[0][0][0].id).toBeTruthy();
  });
});
```

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/KomponenInput.test.tsx`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Buat KomponenInput.tsx**

Buat `apps/saas/components/KomponenInput.tsx`:

```tsx
"use client";
import Link from "next/link";
import { GlassInput } from "@3pb/ui";
import type { KomponenRow } from "@/lib/kalkulator/compose";
import { rupiah } from "@/lib/kalkulator/format";
import { newId } from "@/lib/id";

export function KomponenInput({
  locked, presets, komponen, onChange,
}: {
  locked: boolean;
  presets: { id: string; nama: string; harga: number }[];
  komponen: KomponenRow[];
  onChange: (r: KomponenRow[]) => void;
}) {
  if (locked) {
    return (
      <div>
        <div className="text-[12px] g-t3 font-medium">🔒 Komponen tambahan</div>
        <p className="text-[11px] g-t4 mt-1">Hitung komponen di luar cetakan (gantungan, switch, label). <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
      </div>
    );
  }
  const idxOfPreset = (p: { nama: string; harga: number }) =>
    komponen.findIndex((r) => r.nama === p.nama && r.harga === p.harga);
  const toggle = (p: { nama: string; harga: number }) => {
    const i = idxOfPreset(p);
    if (i >= 0) onChange(komponen.filter((_, j) => j !== i));
    else onChange([...komponen, { id: newId(), nama: p.nama, harga: p.harga, qty: 1 }]);
  };
  const setRow = (i: number, patch: Partial<KomponenRow>) =>
    onChange(komponen.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] g-t3 mb-1.5">Preset komponen</div>
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => {
            const on = idxOfPreset(p) >= 0;
            return (
              <button key={p.id} type="button" onClick={() => toggle(p)}
                className="g-btn-ghost rounded-[10px] px-3 h-9 text-[12px] flex items-center gap-1.5"
                style={on ? { outline: "2px solid var(--g-accent)", color: "var(--g-accent)" } : undefined}>
                {on && <span aria-hidden>✓</span>}{p.nama} · {rupiah(p.harga)}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => onChange([...komponen, { id: newId(), nama: "", harga: 0, qty: 1 }])}
          className="mt-2 text-[12px] underline" style={{ color: "var(--g-accent)" }}>＋ Tambah komponen custom</button>
      </div>

      {komponen.length > 0 && (
        <div className="flex flex-col gap-2">
          {komponen.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2 rounded-[12px] border border-[color:var(--g-row-border)] p-2.5">
              <GlassInput value={r.nama} placeholder="Nama komponen" className="flex-1 min-w-0"
                onChange={(e) => setRow(i, { nama: e.target.value })} />
              <div className="relative w-24 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">Rp</span>
                <GlassInput type="number" inputMode="decimal" value={String(r.harga)} className="w-full pl-8"
                  onChange={(e) => setRow(i, { harga: Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" aria-label="Kurangi qty" className="g-btn-ghost rounded-[8px] w-8 h-9 text-sm"
                  onClick={() => setRow(i, { qty: Math.max(1, r.qty - 1) })}>−</button>
                <span className="w-6 text-center text-sm g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{r.qty}</span>
                <button type="button" aria-label="Tambah qty" className="g-btn-ghost rounded-[8px] w-8 h-9 text-sm"
                  onClick={() => setRow(i, { qty: r.qty + 1 })}>+</button>
              </div>
              <span className="w-20 text-right text-[12px] g-t2 shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah((r.harga > 0 ? r.harga : 0) * Math.max(1, r.qty))}</span>
              <button type="button" aria-label="Hapus komponen" className="g-t4 text-base px-1 shrink-0 leading-none"
                onClick={() => onChange(komponen.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Jalankan — PASS**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/KomponenInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/KomponenInput.tsx apps/saas/components/KomponenInput.test.tsx
git commit -m "feat(saas): KomponenInput checkbox-chip + baris ringkas + stepper qty (TDD)"
```

---

### Task 5: LaborInput — segmented metode waktu/flat + preset

**Files:**
- Create: `apps/saas/components/LaborInput.tsx`, `apps/saas/components/LaborInput.test.tsx`

**Interfaces:**
- Consumes: `LaborRow`; `GlassInput`; `newId`; `rupiah`.
- Produces: `LaborInput` (lihat Interfaces global).

**Perilaku metode:** tiap baris punya metode "waktu" atau "flat" ditentukan dari data — turunan: `flat != null && (jam == null && ratePerJam == null)` → "flat", selain itu "waktu". Segmented mengubah metode: ke "flat" → kosongkan jam/ratePerJam; ke "waktu" → kosongkan flat.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/saas/components/LaborInput.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LaborInput } from "./LaborInput";

const presets = [{ id: "l1", nama: "Finishing standar", items: [{ nama: "Assembly", jam: 0.5, ratePerJam: 35000 }] }];

describe("LaborInput", () => {
  it("locked → 🔒 + CTA", () => {
    render(<LaborInput locked presets={presets} labor={[]} onChange={() => {}} />);
    expect(screen.getByText(/Pro/)).toBeTruthy();
  });
  it("klik preset → append item bundle", () => {
    const onC = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[]} onChange={onC} />);
    fireEvent.click(screen.getByRole("button", { name: /Finishing standar/ }));
    expect(onC.mock.calls[0][0][0]).toMatchObject({ nama: "Assembly", jam: 0.5, ratePerJam: 35000 });
  });
  it("baris metode waktu → tampil jam & tarif, sembunyikan flat", () => {
    render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Assembly", jam: 0.5, ratePerJam: 35000 }]} onChange={() => {}} />);
    expect(screen.getByPlaceholderText("jam")).toBeTruthy();
    expect(screen.getByPlaceholderText("tarif")).toBeTruthy();
    expect(screen.queryByPlaceholderText("biaya")).toBeNull();
  });
  it("ganti ke Biaya flat → sembunyikan jam/tarif, tampil biaya", () => {
    const onC = vi.fn();
    const { rerender } = render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Assembly", jam: 0.5, ratePerJam: 35000 }]} onChange={onC} />);
    fireEvent.click(screen.getByRole("button", { name: /Biaya flat/ }));
    // jam & rate dikosongkan
    expect(onC.mock.calls[0][0][0]).toMatchObject({ jam: undefined, ratePerJam: undefined });
    rerender(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Assembly", flat: 0 }]} onChange={onC} />);
    expect(screen.getByPlaceholderText("biaya")).toBeTruthy();
    expect(screen.queryByPlaceholderText("jam")).toBeNull();
  });
  it("Tambah pekerjaan custom → baris kosong (metode waktu default)", () => {
    const onC = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[]} onChange={onC} />);
    fireEvent.click(screen.getByText(/Tambah pekerjaan custom/));
    expect(onC.mock.calls[0][0][0]).toMatchObject({ nama: "" });
    expect(onC.mock.calls[0][0][0].id).toBeTruthy();
  });
});
```

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/LaborInput.test.tsx`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Buat LaborInput.tsx**

Buat `apps/saas/components/LaborInput.tsx`:

```tsx
"use client";
import Link from "next/link";
import { GlassInput } from "@3pb/ui";
import type { LaborRow } from "@/lib/kalkulator/compose";
import { rupiah } from "@/lib/kalkulator/format";
import { newId } from "@/lib/id";

type Metode = "waktu" | "flat";
const metodeOf = (r: LaborRow): Metode =>
  r.flat != null && r.jam == null && r.ratePerJam == null ? "flat" : "waktu";
const biayaOf = (r: LaborRow) => (r.jam ?? 0) * (r.ratePerJam ?? 0) + (r.flat ?? 0);

export function LaborInput({
  locked, presets, labor, onChange,
}: {
  locked: boolean;
  presets: { id: string; nama: string; items: { nama: string; jam?: number; ratePerJam?: number; flat?: number }[] }[];
  labor: LaborRow[];
  onChange: (r: LaborRow[]) => void;
}) {
  if (locked) {
    return (
      <div>
        <div className="text-[12px] g-t3 font-medium">🔒 Finishing &amp; tenaga kerja</div>
        <p className="text-[11px] g-t4 mt-1">Hitung biaya perakitan, amplas, cat, dsb. <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
      </div>
    );
  }
  const setRow = (i: number, patch: Partial<LaborRow>) =>
    onChange(labor.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setMetode = (i: number, m: Metode) =>
    setRow(i, m === "flat" ? { jam: undefined, ratePerJam: undefined, flat: labor[i].flat ?? 0 } : { flat: undefined, jam: labor[i].jam ?? undefined, ratePerJam: labor[i].ratePerJam ?? undefined });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] g-t3 mb-1.5">Preset pengerjaan mask</div>
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onChange([...labor, ...p.items.map((it) => ({ id: newId(), nama: it.nama, jam: it.jam, ratePerJam: it.ratePerJam, flat: it.flat }))])}
              className="g-btn-ghost rounded-[10px] px-3 h-9 text-[12px]">＋ {p.nama}</button>
          ))}
        </div>
        <button type="button" onClick={() => onChange([...labor, { id: newId(), nama: "", jam: undefined, ratePerJam: undefined }])}
          className="mt-2 text-[12px] underline" style={{ color: "var(--g-accent)" }}>＋ Tambah pekerjaan custom</button>
      </div>

      {labor.length > 0 && (
        <div className="flex flex-col gap-2">
          {labor.map((r, i) => {
            const m = metodeOf(r);
            return (
              <div key={r.id} className="flex flex-col gap-2 rounded-[12px] border border-[color:var(--g-row-border)] p-2.5">
                <div className="flex items-center gap-2">
                  <GlassInput value={r.nama} placeholder="Nama pekerjaan" className="flex-1 min-w-0"
                    onChange={(e) => setRow(i, { nama: e.target.value })} />
                  <span className="text-[12px] g-t2 shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(biayaOf(r))}</span>
                  <button type="button" aria-label="Hapus pekerjaan" className="g-t4 text-base px-1 shrink-0 leading-none"
                    onClick={() => onChange(labor.filter((_, j) => j !== i))}>✕</button>
                </div>
                <div className="flex gap-1">
                  {(["waktu", "flat"] as const).map((opt) => (
                    <button key={opt} type="button" onClick={() => setMetode(i, opt)}
                      className="g-btn-ghost rounded-[8px] px-2.5 h-8 text-[11px]"
                      style={m === opt ? { outline: "2px solid var(--g-accent)", color: "var(--g-accent)" } : undefined}>
                      {opt === "waktu" ? "Berdasarkan waktu" : "Biaya flat"}
                    </button>
                  ))}
                </div>
                {m === "waktu" ? (
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <GlassInput type="number" inputMode="decimal" placeholder="jam" value={r.jam ?? ""} className="w-full min-w-0 pr-9"
                        onChange={(e) => setRow(i, { jam: e.target.value === "" ? undefined : Number(e.target.value) })} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">jam</span>
                    </div>
                    <span className="g-t4 text-sm shrink-0">×</span>
                    <div className="relative flex-1 min-w-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">Rp</span>
                      <GlassInput type="number" inputMode="decimal" placeholder="tarif" value={r.ratePerJam ?? ""} className="w-full min-w-0 pl-8 pr-10"
                        onChange={(e) => setRow(i, { ratePerJam: e.target.value === "" ? undefined : Number(e.target.value) })} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">/jam</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">Rp</span>
                    <GlassInput type="number" inputMode="decimal" placeholder="biaya" value={r.flat ?? ""} className="w-full min-w-0 pl-8"
                      onChange={(e) => setRow(i, { flat: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Jalankan — PASS**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/LaborInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/LaborInput.tsx apps/saas/components/LaborInput.test.tsx
git commit -m "feat(saas): LaborInput segmented metode waktu/flat + preset (TDD)"
```

---

### Task 6: PackingInput — radio card + Tanpa packing

**Files:**
- Create: `apps/saas/components/PackingInput.tsx`, `apps/saas/components/PackingInput.test.tsx`

**Interfaces:**
- Consumes: `rupiah`.
- Produces: `PackingInput` (lihat Interfaces global).

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/saas/components/PackingInput.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PackingInput } from "./PackingInput";

const presets = [{ id: "p1", nama: "Packing S", harga: 1500 }, { id: "p2", nama: "Packing M", harga: 2500 }];

describe("PackingInput", () => {
  it("locked → 🔒 + CTA", () => {
    render(<PackingInput locked presets={presets} packing={undefined} onChange={() => {}} />);
    expect(screen.getByText(/Pro/)).toBeTruthy();
  });
  it("pilih packing → onChange dgn nama+harga", () => {
    const onC = vi.fn();
    render(<PackingInput locked={false} presets={presets} packing={undefined} onChange={onC} />);
    fireEvent.click(screen.getByRole("radio", { name: /Packing S/ }));
    expect(onC).toHaveBeenCalledWith({ nama: "Packing S", harga: 1500 });
  });
  it("pilih 'Tanpa packing' → undefined", () => {
    const onC = vi.fn();
    render(<PackingInput locked={false} presets={presets} packing={{ nama: "Packing S", harga: 1500 }} onChange={onC} />);
    fireEvent.click(screen.getByRole("radio", { name: /Tanpa packing/ }));
    expect(onC).toHaveBeenCalledWith(undefined);
  });
  it("radio aktif tercermin (aria-checked)", () => {
    render(<PackingInput locked={false} presets={presets} packing={{ nama: "Packing S", harga: 1500 }} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: /Packing S/ }).getAttribute("aria-checked")).toBe("true");
  });
});
```

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/PackingInput.test.tsx`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Buat PackingInput.tsx**

Buat `apps/saas/components/PackingInput.tsx`:

```tsx
"use client";
import Link from "next/link";
import { rupiah } from "@/lib/kalkulator/format";

export function PackingInput({
  locked, presets, packing, onChange,
}: {
  locked: boolean;
  presets: { id: string; nama: string; harga: number }[];
  packing: { nama: string; harga: number } | undefined;
  onChange: (p: { nama: string; harga: number } | undefined) => void;
}) {
  if (locked) {
    return (
      <div>
        <div className="text-[12px] g-t3 font-medium">🔒 Packing</div>
        <p className="text-[11px] g-t4 mt-1">Tambahkan biaya kemasan ke harga jual. <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
      </div>
    );
  }
  const Card = ({ active, label, right, onClick }: { active: boolean; label: string; right?: string; onClick: () => void }) => (
    <button type="button" role="radio" aria-checked={active} aria-label={label} onClick={onClick}
      className="flex items-center gap-2.5 rounded-[12px] border p-3 text-left min-w-0"
      style={{ borderColor: active ? "var(--g-accent)" : "var(--g-row-border)", background: active ? "color-mix(in srgb, var(--g-accent) 12%, transparent)" : "transparent" }}>
      <span className="shrink-0 w-4 h-4 rounded-full border grid place-items-center"
        style={{ borderColor: active ? "var(--g-accent)" : "var(--g-row-border)" }}>
        {active && <span className="w-2 h-2 rounded-full" style={{ background: "var(--g-accent)" }} />}
      </span>
      <span className="flex-1 min-w-0 text-[13px] g-t1">{label}</span>
      {right && <span className="shrink-0 text-[12px] g-t2" style={{ fontVariantNumeric: "tabular-nums" }}>{right}</span>}
    </button>
  );
  const isNone = packing == null;
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {presets.map((p) => (
        <Card key={p.id} active={packing?.nama === p.nama && packing?.harga === p.harga}
          label={p.nama} right={rupiah(p.harga)} onClick={() => onChange({ nama: p.nama, harga: p.harga })} />
      ))}
      <Card active={isNone} label="Tanpa packing" onClick={() => onChange(undefined)} />
    </div>
  );
}
```

- [ ] **Step 4: Jalankan — PASS**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/PackingInput.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/PackingInput.tsx apps/saas/components/PackingInput.test.tsx
git commit -m "feat(saas): PackingInput radio card + Tanpa packing (TDD)"
```

---

### Task 7: ResultPanel — channel/strategi/laba/margin/rincian/aksi

**Files:**
- Create: `apps/saas/components/ResultPanel.tsx`, `apps/saas/components/ResultPanel.test.tsx`

**Interfaces:**
- Consumes: `FullView` + `Strategi` dari `@/lib/kalkulator/compute`; `rupiah`, `ceil500` dari format; `MARGIN_TIER_LABEL` dari `@3pb/kalkulator-core`; `InfoTip`.
- Produces: `ResultPanel` (lihat Interfaces global).

**Catatan:** `MARGIN_TIER_LABEL` = `{ A:'Kompetitif', B:'Standard', C:'Premium' }`. Headline = `view.strategi[channel][tier].harga`. `onCopy`/`onReset` disediakan Calculator. Simpan = tombol disabled + badge "segera".

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/saas/components/ResultPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResultPanel } from "./ResultPanel";
import { fullView } from "@/lib/kalkulator/compute";
import { rupiah } from "@/lib/kalkulator/format";

const view = fullView({ gramasi: 50, durasiJam: 3, tipe: "FDM" });

describe("ResultPanel", () => {
  const base = { view, channel: "offline", tier: "B" as const, onChannel: vi.fn(), onTier: vi.fn(), onCopy: vi.fn(), onReset: vi.fn() };
  it("headline = strategi[channel][tier].harga", () => {
    render(<ResultPanel {...base} />);
    expect(screen.getAllByText(rupiah(view.strategi.offline.B.harga)).length).toBeGreaterThan(0);
  });
  it("klik strategi Premium memanggil onTier('C')", () => {
    const onTier = vi.fn();
    render(<ResultPanel {...base} onTier={onTier} />);
    fireEvent.click(screen.getByRole("button", { name: /Premium/ }));
    expect(onTier).toHaveBeenCalledWith("C");
  });
  it("klik channel Shopee memanggil onChannel('shopee')", () => {
    const onChannel = vi.fn();
    render(<ResultPanel {...base} onChannel={onChannel} />);
    fireEvent.click(screen.getByRole("button", { name: /Shopee/ }));
    expect(onChannel).toHaveBeenCalledWith("shopee");
  });
  it("Salin & Reset memanggil handler; Simpan disabled", () => {
    const onCopy = vi.fn(), onReset = vi.fn();
    render(<ResultPanel {...base} onCopy={onCopy} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /Salin harga jual/ }));
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    expect(onCopy).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /Simpan/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("caveat marketplace muncul saat channel shopee", () => {
    render(<ResultPanel {...base} channel="shopee" />);
    expect(screen.getByText(/belum.*(voucher|ongkir|iklan)/i)).toBeTruthy();
  });
  it("tidak menampilkan rumus modal/(1−margin)", () => {
    const { container } = render(<ResultPanel {...base} />);
    expect(container.textContent).not.toMatch(/1\s*[−-]\s*margin/i);
  });
});
```

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/ResultPanel.test.tsx`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Buat ResultPanel.tsx**

Buat `apps/saas/components/ResultPanel.tsx`:

```tsx
"use client";
import { GlassCard } from "@3pb/ui";
import { MARGIN_TIER_LABEL, type MarginTier } from "@3pb/kalkulator-core";
import type { FullView } from "@/lib/kalkulator/compute";
import { rupiah, ceil500 } from "@/lib/kalkulator/format";
import { InfoTip } from "./InfoTip";

const TIERS: MarginTier[] = ["A", "B", "C"];
const CHANNELS = [{ id: "offline", label: "Offline / Langsung" }, { id: "shopee", label: "Shopee" }];

export function ResultPanel({
  view, channel, tier, onChannel, onTier, onCopy, onReset,
}: {
  view: FullView; channel: string; tier: MarginTier;
  onChannel: (c: string) => void; onTier: (t: MarginTier) => void;
  onCopy: () => void; onReset: () => void;
}) {
  const cell = view.strategi[channel]?.[tier] ?? { harga: 0, laba: 0, marginPct: 0 };
  const chanLabel = CHANNELS.find((c) => c.id === channel)?.label ?? channel;
  const r = view.rincian;
  const Seg = ({ items, value, onSelect }: { items: { id: string; label: string }[]; value: string; onSelect: (v: string) => void }) => (
    <div className="flex gap-1 p-1 rounded-[12px]" style={{ background: "color-mix(in srgb, var(--g-t5) 8%, transparent)" }}>
      {items.map((it) => (
        <button key={it.id} type="button" onClick={() => onSelect(it.id)}
          className="flex-1 h-9 rounded-[9px] text-[12px] font-medium"
          style={value === it.id ? { background: "var(--g-accent)", color: "#fff" } : { color: "var(--g-t3)" }}>{it.label}</button>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="p-4 min-w-0 flex flex-col gap-4">
        <div className="text-[13px] font-semibold g-t1 tracking-wide">REKOMENDASI HARGA JUAL</div>
        <Seg items={CHANNELS} value={channel} onSelect={onChannel} />

        <div>
          <div className="text-[11px] g-t3 mb-1.5 flex items-center gap-1">Strategi harga <InfoTip text="Kompetitif = margin tipis untuk menang harga. Standard = seimbang. Premium = margin tebal." /></div>
          <div className="grid grid-cols-3 gap-2">
            {TIERS.map((t) => {
              const c = view.strategi[channel]?.[t] ?? { harga: 0, laba: 0, marginPct: 0 };
              const on = t === tier;
              return (
                <button key={t} type="button" onClick={() => onTier(t)} aria-pressed={on}
                  className="rounded-[12px] border p-2.5 text-center min-w-0"
                  style={{ borderColor: on ? "var(--g-accent)" : "var(--g-row-border)", background: on ? "color-mix(in srgb, var(--g-accent) 12%, transparent)" : "transparent" }}>
                  <div className="text-[11px] g-t3">{MARGIN_TIER_LABEL[t]}</div>
                  <div className="text-sm font-semibold g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(c.harga)}</div>
                  <div className="text-[10px] g-t4 mt-1">Laba</div>
                  <div className="text-[12px] g-success" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(c.laba)}</div>
                  <div className="text-[10px] g-t4">({c.marginPct.toString().replace(".", ",")}%)</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[14px] p-4 text-center" style={{ background: "color-mix(in srgb, var(--g-accent) 10%, transparent)" }}>
          <div className="text-[11px] g-t3">{MARGIN_TIER_LABEL[tier]} · {chanLabel}</div>
          <div className="text-3xl font-bold mt-1" style={{ color: "var(--g-accent)", fontVariantNumeric: "tabular-nums" }}>{rupiah(cell.harga)}</div>
          <div className="flex justify-center gap-6 mt-3">
            <div><div className="text-[10px] g-t4">Estimasi laba</div><div className="text-sm g-success" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(cell.laba)}</div></div>
            <div><div className="text-[10px] g-t4 flex items-center gap-1 justify-center">Margin laba <InfoTip text="Margin = laba ÷ harga jual." /></div><div className="text-sm g-t1">{cell.marginPct.toString().replace(".", ",")}%</div></div>
          </div>
        </div>

        {channel === "shopee" && (
          <p className="text-[11px] g-t3">⚠️ Harga sudah termasuk perkiraan biaya admin marketplace, tapi belum termasuk voucher, subsidi ongkir, atau iklan.</p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onCopy} className="flex-1 h-10 rounded-[10px] text-[13px] font-medium" style={{ background: "var(--g-accent)", color: "#fff" }}>Salin harga jual</button>
          <button type="button" onClick={onReset} className="g-btn-ghost h-10 px-4 rounded-[10px] text-[13px]">Reset</button>
          <button type="button" disabled className="g-btn-ghost h-10 px-4 rounded-[10px] text-[13px] opacity-40 cursor-not-allowed flex items-center gap-1" title="Segera hadir">Simpan <span className="text-[9px] uppercase">segera</span></button>
        </div>
      </GlassCard>

      <GlassCard className="p-4 min-w-0">
        <div className="text-[11px] g-t4 mb-2 uppercase tracking-wide">Rincian biaya</div>
        {[
          ["Produksi (per produk)", r.produksi],
          ["Komponen tambahan", r.komponen],
          ["Finishing & tenaga kerja", r.labor],
          ["Packing", r.packing],
        ].filter(([, v]) => (v as number) > 0).map(([label, v]) => (
          <div key={label as string} className="flex justify-between text-[12px] g-t3 py-[3px]" style={{ borderBottom: "1px dashed var(--g-row-border)" }}>
            <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(v as number)}</span>
          </div>
        ))}
        <div className="flex justify-between text-[13px] g-t1 font-semibold py-1.5">
          <span>Total modal</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(r.biayaModal)}</span>
        </div>
        <div className="flex justify-between text-[12px] g-t3 py-[3px]">
          <span className="flex items-center gap-1">Harga aman minimum <InfoTip text="Sudah menutup modal, overhead, dan margin minimum. Jual di bawah ini = rugi." /></span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(ceil500(view.hargaJualMinimum))}</span>
        </div>
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan — PASS**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/ResultPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/ResultPanel.tsx apps/saas/components/ResultPanel.test.tsx
git commit -m "feat(saas): ResultPanel channel/strategi/laba-margin/rincian/aksi (TDD)"
```

---

### Task 8: Calculator — orkestrasi section + ResultPanel + hapus komponen lama

**Files:**
- Rewrite: `apps/saas/components/Calculator.tsx`
- Modify: `apps/saas/components/calculator.test.tsx`
- Delete: `apps/saas/components/KomponenLaborInput.tsx`, `apps/saas/components/komponen-labor-input.test.tsx`, `apps/saas/components/RincianPanel.tsx`, `apps/saas/components/rincian-panel.test.tsx`

**Interfaces:**
- Consumes: `CalcSection`, `PlateInput`+`PlateRow`, `KomponenInput`, `LaborInput`, `PackingInput`, `ResultPanel`; `fullView`, `CalcPlate` dari compute; `rupiah` dari format; `loadSettings`, `DEFAULT_LOCAL_SETTINGS`, `getRincianPref` (existing); `newId`.
- Produces: halaman kalkulator terintegrasi.

**Scene:** `Calculator.tsx` sekarang punya state `plates/batch/settings/komponen/labor/packing/showRincian` + grid 2-kolom [input | hasil]. Task ini menyusun ulang: kolom kiri = `CalcSection` (1 Produksi=PlateInput, 2 Komponen=KomponenInput, 3 Finishing=LaborInput, 4 Packing=PackingInput) dengan subtotal dari `view.rincian`; kolom kanan = `ResultPanel` (sticky). Tambah state `channel` ("offline") + `tier` ("B") + handler `onCopy`/`onReset`. Hapus `KomponenLaborInput` & `RincianPanel` beserta test-nya. `showRincian`/`getRincianPref`/`STATUS_LABEL`/`LockedBlock`/`MARGIN_TIER_LABEL` lama tidak lagi dipakai di Calculator (rincian pindah ke ResultPanel) — buang yang jadi dead import.

- [ ] **Step 1: Tulis test yang gagal (perluas calculator.test.tsx)**

Tambahkan `describe` di akhir `apps/saas/components/calculator.test.tsx`:

```tsx
describe("Calculator redesign", () => {
  it("Pro: section bernomor + ResultPanel terpasang", () => {
    render(<Calculator authenticated={true} paidCore={true} userId="u1" />);
    expect(screen.getByText(/1\. Produksi/)).toBeTruthy();
    expect(screen.getByText(/REKOMENDASI HARGA JUAL/)).toBeTruthy();
    expect(screen.getByText(/2\. Komponen tambahan/)).toBeTruthy();
  });
  it("Pro: klik strategi Premium mengubah headline harga", () => {
    render(<Calculator authenticated={true} paidCore={true} userId="u1" />);
    expect(screen.getByText(/Standard · /)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Premium/ }));
    expect(screen.getByText(/Premium · /)).toBeTruthy();
  });
  it("Free: Produksi tetap tampil, section add-on terkunci", () => {
    render(<Calculator authenticated={true} paidCore={false} userId={null} />);
    expect(screen.getByText(/1\. Produksi/)).toBeTruthy();
    expect(screen.getByText(/🔒 Komponen tambahan/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/calculator.test.tsx`
Expected: FAIL — teks section/ResultPanel belum ada.

- [ ] **Step 3: Tulis ulang Calculator.tsx**

Ganti seluruh isi `apps/saas/components/Calculator.tsx` dengan:

```tsx
"use client";
import { useEffect, useState } from "react";
import type { MarginTier } from "@3pb/kalkulator-core";
import { fullView, type CalcPlate } from "@/lib/kalkulator/compute";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/kalkulator/local-settings";
import { loadSettings } from "@/lib/store/local-settings";
import { rupiah } from "@/lib/kalkulator/format";
import { CalcSection } from "./CalcSection";
import { PlateInput, type PlateRow } from "./PlateInput";
import { KomponenInput } from "./KomponenInput";
import { LaborInput } from "./LaborInput";
import { PackingInput } from "./PackingInput";
import { ResultPanel } from "./ResultPanel";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";

const INITIAL_PLATES: PlateRow[] = [{ id: "plate-1", nama: "", tipe: "FDM", gramasi: "50", durasiJam: "3" }];

export function Calculator({ authenticated, paidCore = false, userId = null }: { authenticated: boolean; paidCore?: boolean; userId?: string | null }) {
  const [plates, setPlates] = useState<PlateRow[]>(INITIAL_PLATES);
  const [batch, setBatch] = useState("1");
  const [settings, setSettings] = useState<LocalSettings>(DEFAULT_LOCAL_SETTINGS);
  const [komponen, setKomponen] = useState<KomponenRow[]>([]);
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [packing, setPacking] = useState<{ nama: string; harga: number } | undefined>(undefined);
  const [channel, setChannel] = useState("offline");
  const [tier, setTier] = useState<MarginTier>("B");

  useEffect(() => {
    if (paidCore && userId) loadSettings(userId).then(setSettings);
  }, [paidCore, userId]);

  const toCalcPlate = (p: PlateRow): CalcPlate => ({
    id: p.id, nama: p.nama || undefined, tipe: p.tipe,
    gramasi: Number(p.gramasi), durasiJam: Number(p.durasiJam),
  });
  const valid = plates.length > 0 && plates.every((p) => Number(p.gramasi) > 0 && Number(p.durasiJam) > 0);
  const addon = paidCore ? { komponen, labor, packing } : {};
  const view = valid
    ? fullView({ plates: plates.map(toCalcPlate), batch: paidCore ? Number(batch) : 1, ...addon }, settings)
    : null;

  const onReset = () => {
    setPlates(INITIAL_PLATES); setBatch("1"); setKomponen([]); setLabor([]); setPacking(undefined);
    setChannel("offline"); setTier("B");
  };
  const onCopy = () => {
    if (view) navigator.clipboard?.writeText(String(view.strategi[channel]?.[tier]?.harga ?? "")).catch(() => {});
  };

  const r = view?.rincian;
  const hasil = Math.max(1, Number(batch) || 1);

  return (
    <div className="grid lg:grid-cols-[1fr_minmax(320px,380px)] gap-5 items-start pb-24 lg:pb-0">
      {/* Kolom kiri: form section */}
      <div className="flex flex-col gap-4 min-w-0">
        <CalcSection n={1} title="Produksi (Cetak 3D)" subtitle="Biaya material dan waktu cetak"
          subtotalLabel="Subtotal per produk" subtotal={r?.produksi}>
          <PlateInput locked={!paidCore} plates={plates} batch={batch} onPlatesChange={setPlates} onBatchChange={setBatch} />
          {view && (
            <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[12px]">
              <span className="g-t4">Biaya per proses <span className="g-t1 font-medium">{rupiah(r!.produksi * hasil)}</span></span>
              <span className="g-t4">Hasil per proses <span className="g-t1 font-medium">{hasil} pcs</span></span>
              <span className="g-t4">Biaya per produk <span className="g-t1 font-medium">{rupiah(r!.produksi)}</span></span>
            </div>
          )}
        </CalcSection>

        <CalcSection n={2} title="Komponen tambahan" subtitle="Komponen yang dipasang pada produk"
          subtotal={paidCore ? (r?.komponen ?? 0) : undefined}
          summary={komponen.length ? `${komponen.length} item · ${rupiah(r?.komponen ?? 0)}` : "Belum ada"}>
          <KomponenInput locked={!paidCore} presets={settings.komponenPresets} komponen={komponen} onChange={setKomponen} />
        </CalcSection>

        <CalcSection n={3} title="Finishing & tenaga kerja" subtitle="Perakitan, pengamplasan, pengecatan, dll."
          subtotal={paidCore ? (r?.labor ?? 0) : undefined}
          summary={labor.length ? `${labor.length} pekerjaan · ${rupiah(r?.labor ?? 0)}` : "Belum ada"}>
          <LaborInput locked={!paidCore} presets={settings.laborPresets} labor={labor} onChange={setLabor} />
        </CalcSection>

        <CalcSection n={4} title="Packing" subtitle="Biaya kemasan & pelindung produk"
          subtotal={paidCore ? (r?.packing ?? 0) : undefined}
          summary={packing ? `${packing.nama} · ${rupiah(packing.harga)}` : "Tanpa packing"}>
          <PackingInput locked={!paidCore} presets={settings.packingPresets} packing={packing} onChange={setPacking} />
        </CalcSection>
      </div>

      {/* Kolom kanan: hasil (sticky desktop) */}
      <div className="lg:sticky lg:top-6 min-w-0">
        {view ? (
          <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} />
        ) : (
          <div className="text-[12px] g-t4 p-4">Isi berat &amp; durasi (angka &gt; 0) untuk melihat hasil.</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Hapus komponen lama + test-nya**

```bash
git rm apps/saas/components/KomponenLaborInput.tsx apps/saas/components/komponen-labor-input.test.tsx apps/saas/components/RincianPanel.tsx apps/saas/components/rincian-panel.test.tsx
```

- [ ] **Step 5: Jalankan test calculator — PASS**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/calculator.test.tsx`
Expected: PASS — 3 test baru hijau. **Test calculator LAMA berikut mengassert panel hasil yang kini dihapus dan HARUS di-update ke struktur baru** (bukan di-bypass; pertahankan maksud tiap test):
- `"anonim → blok banding ter-blur (locked-blur)"` & `"login → tak ada blur"` — ResultPanel tak lagi pakai `LockedBlock`/`.locked-blur`. Hapus dua test ini (blur konsep lama) ATAU ganti jadi assertion "ResultPanel tampil untuk authenticated" — pilih yang mempertahankan maksud: channel/strategi tampil untuk user login.
- `"menampilkan label margin Standard untuk rekomendasi"` — panel baru menampilkan "Standard" di strategy card + headline; update assertion ke `getByText(/Standard/)` pada ResultPanel.
- `"field & angka hasil punya penjelasan (ℹ) ≥6, tips[0]→Berat total produk"` — hitung ulang jumlah InfoTip pada layout baru (Free: 3 di PlateInput + beberapa di ResultPanel); pertahankan cek bahwa tips ADA dan tips pertama = "Berat total produk" (PlateInput dirender sebelum ResultPanel di DOM). Sesuaikan angka minimal bila perlu, jangan hapus intent.
- Test yang MASIH valid apa adanya: gating settings (`loadSettings` dipanggil saat paidCore), add-on gating (`🔒 Komponen tambahan`), chip preset komponen muncul saat Pro, `TIDAK_DISET`/`Status:` tak bocor.
Pertahankan cakupan: Free vs Pro, gating add-on, regresi `newId`.

- [ ] **Step 6: Jalankan seluruh suite saas + build**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run`
Expected: PASS semua (tak ada import ke file yang dihapus).

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas build`
Expected: build sukses. Jika gagal karena `@prisma/client`, jalankan `cd apps/saas && npx prisma generate` lalu ulangi.

- [ ] **Step 7: Commit**

```bash
git add apps/saas/components/Calculator.tsx apps/saas/components/calculator.test.tsx
git commit -m "feat(saas): rakit ulang Calculator — section bertahap + ResultPanel; hapus KomponenLaborInput & RincianPanel lama (TDD)"
```

---

### Task 9: Mobile sticky summary + bottom sheet + polish hierarki

**Files:**
- Create: `apps/saas/components/MobileSummaryBar.tsx`, `apps/saas/components/MobileSummaryBar.test.tsx`
- Modify: `apps/saas/components/Calculator.tsx` (pasang MobileSummaryBar + sheet)

**Interfaces:**
- Consumes: `rupiah`; `ResultPanel` (dirender dalam sheet); `FullView`.
- Produces: `MobileSummaryBar` (sticky bawah + toggle sheet).

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/saas/components/MobileSummaryBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MobileSummaryBar } from "./MobileSummaryBar";

describe("MobileSummaryBar", () => {
  it("tampil modal & harga jual, tombol buka rincian", () => {
    const onOpen = vi.fn();
    render(<MobileSummaryBar modal={95520} harga={187500} onOpen={onOpen} />);
    expect(screen.getByText(/Rp95\.520/)).toBeTruthy();
    expect(screen.getByText(/Rp187\.500/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /rincian/i }));
    expect(onOpen).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/MobileSummaryBar.test.tsx`
Expected: FAIL — modul belum ada.

- [ ] **Step 3: Buat MobileSummaryBar.tsx**

Buat `apps/saas/components/MobileSummaryBar.tsx`:

```tsx
"use client";
import { rupiah } from "@/lib/kalkulator/format";

export function MobileSummaryBar({ modal, harga, onOpen }: { modal: number; harga: number; onOpen: () => void }) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-3 flex items-center gap-3"
      style={{ background: "color-mix(in srgb, var(--g-card) 92%, black)", borderTop: "1px solid var(--g-card-border)", backdropFilter: "blur(12px)" }}>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] g-t4">Modal</div>
        <div className="text-[13px] font-semibold g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(modal)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] g-t4">Harga jual</div>
        <div className="text-[15px] font-bold" style={{ color: "var(--g-accent)", fontVariantNumeric: "tabular-nums" }}>{rupiah(harga)}</div>
      </div>
      <button type="button" onClick={onOpen} className="shrink-0 h-11 px-4 rounded-[10px] text-[13px] font-medium" style={{ background: "var(--g-accent)", color: "#fff" }}>Lihat rincian</button>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan — PASS**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/MobileSummaryBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Pasang di Calculator — sticky bar (mobile) + sheet**

Di `apps/saas/components/Calculator.tsx`:

(a) Import + state sheet (tambah setelah import ResultPanel & setelah deklarasi `tier` state):

```tsx
import { MobileSummaryBar } from "./MobileSummaryBar";
```
```tsx
  const [sheetOpen, setSheetOpen] = useState(false);
```

(b) Ubah kolom kanan agar **tersembunyi di mobile** (hanya sticky desktop): ganti `<div className="lg:sticky lg:top-6 min-w-0">` menjadi `<div className="hidden lg:block lg:sticky lg:top-6 min-w-0">`.

(c) Sebelum penutup `</div>` grid terluar, tambahkan sticky bar + sheet (mobile):

```tsx
      {view && (
        <>
          <MobileSummaryBar modal={view.rincian.biayaModal} harga={view.strategi[channel]?.[tier]?.harga ?? 0} onOpen={() => setSheetOpen(true)} />
          {sheetOpen && (
            <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
              <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/50" onClick={() => setSheetOpen(false)} />
              <div className="relative max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 modal-surface">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold g-t1">Hasil perhitungan</span>
                  <button type="button" aria-label="Tutup rincian" className="g-t3 text-lg leading-none" onClick={() => setSheetOpen(false)}>✕</button>
                </div>
                <ResultPanel view={view} channel={channel} tier={tier} onChannel={setChannel} onTier={setTier} onCopy={onCopy} onReset={onReset} />
              </div>
            </div>
          )}
        </>
      )}
```

- [ ] **Step 6: Jalankan seluruh suite saas + build**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run && pnpm --filter @3pb/saas build`
Expected: PASS semua + build sukses.

- [ ] **Step 7: Commit**

```bash
git add apps/saas/components/MobileSummaryBar.tsx apps/saas/components/MobileSummaryBar.test.tsx apps/saas/components/Calculator.tsx
git commit -m "feat(saas): sticky summary + bottom sheet hasil di mobile (TDD)"
```

---

## Verifikasi akhir (setelah semua task)

- [ ] `pnpm --filter @3pb/saas exec vitest run` hijau.
- [ ] `pnpm --filter @3pb/kalkulator-core exec vitest run` hijau (formula tak berubah).
- [ ] `pnpm --filter @3pb/saas build` sukses.
- [ ] Verifikasi visual (preview dev sementara, mode Pro): section 1–4 collapsible + subtotal; komponen chip→baris+stepper; labor waktu/flat; packing radio + Tanpa packing; panel kanan channel→strategi→headline ceil500 + laba/margin; mobile sticky bar + sheet.
- [ ] Deploy homelab **tidak dijalankan** kecuali diminta.

## Follow-up (di luar plan ini)

- Simpan kalkulasi + Catatan (opsional) + history = **Fase 1b-4**.
- Format input angka live (35000→35.000, koma) = polish pass.
