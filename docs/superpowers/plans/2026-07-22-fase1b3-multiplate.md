# Fase 1b-3 — Multi-plate + Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buka multi-plate (produk multi-bagian, HPP/harga jual dijumlahkan antar-plate) + batch (biaya produksi ÷ jumlah unit identik) di kalkulator Slizebiz, keduanya gate Pro; Free tetap single-plate identik.

**Architecture:** `packages/kalkulator-core` sudah plate-array-native — nol perubahan kode core (hanya tambah test karakterisasi). Lapisan saas: `buildInputV2` di `compute.ts` digeneralisasi dari 1 plate hardcoded jadi N plate + batch dinamis lewat perluasan additive `CalcInput`. UI: komponen baru `PlateInput.tsx` — Free render single-plate berlabel + blok terkunci; Pro render baris ringkas per plate + batch + TOTAL. `Calculator.tsx` ganti state flat gram/durasi/tipe jadi `plates[]` + `batch`.

**Tech Stack:** Next.js 16 (React 19, "use client"), TypeScript, vitest + @testing-library/react (jsdom), `@3pb/kalkulator-core`, `@3pb/ui` (GlassInput), pnpm workspace.

## Global Constraints

- **Bahasa Indonesia** untuk semua copy & komentar user-facing.
- **`newId()`** dari `@/lib/id` untuk semua id baris klien — JANGAN `crypto.randomUUID()` (regresi bug produksi 2026-07-21: undefined di `http://<IP>` non-secure-context → TypeError diam).
- Nama tier di copy = **"Pro"** (bukan "Beli" sebagai nama tier; "beli/bayar" hanya kata kerja aksi).
- **Nol perubahan `packages/kalkulator-core`** selain menambah test.
- Perluasan `CalcInput` bersifat **additive/opsional** — semua test 1a/1b existing tetap hijau tanpa diedit.
- Add-on komponen/labor/packing **tetap top-level per-kalkulasi** (bukan per-plate).
- Kerja **hanya** di worktree `feat/saas-1b3-multiplate`; commit **path spesifik**, JANGAN `git add -A`.
- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum perintah shell.
- Deploy homelab :3300 **gated** — tunggu diminta user (bukan bagian plan ini).

## File Structure

| File | Tanggung jawab | Aksi |
|---|---|---|
| `packages/kalkulator-core/src/formula-v2.test.ts` | Kunci kontrak sum antar-plate + batch (sebelumnya tak diuji) | Modify (tambah 2 test) |
| `apps/saas/lib/kalkulator/compute.ts` | Terjemah input saas → `KalkulasiInputV2`; sekarang N plate + batch | Modify |
| `apps/saas/lib/kalkulator/compute.test.ts` | Uji jalur plates[], batch, parity legacy | Modify (tambah, tak ubah lama) |
| `apps/saas/components/PlateInput.tsx` | UI daftar plate + batch; locked Free / rows Pro | Create |
| `apps/saas/components/PlateInput.test.tsx` | Uji locked/unlocked/add/remove/total/batch/no-crypto | Create |
| `apps/saas/components/Calculator.tsx` | State `plates[]`+`batch`, render PlateInput, feed fullView | Modify |
| `apps/saas/components/calculator.test.tsx` | Uji Free parity + Pro multi-plate | Modify (tambah) |

**Interfaces global (dipakai lintas task):**

```ts
// compute.ts (Task 2)
export interface CalcPlate { id: string; nama?: string; tipe: "FDM" | "SLA"; gramasi: number; durasiJam: number; }
export interface CalcInput {
  gramasi?: number; durasiJam?: number; tipe?: "FDM" | "SLA";   // legacy single-plate
  plates?: CalcPlate[]; batch?: number;                          // baru
  hargaAktual?: { channelId: string; harga: number };
  komponen?: KomponenRow[]; labor?: LaborRow[]; packing?: { nama: string; harga: number };
}

// PlateInput.tsx (Task 3)
export interface PlateRow { id: string; nama: string; tipe: "FDM" | "SLA"; gramasi: string; durasiJam: string; }
export function newPlateRow(): PlateRow;   // { id: newId(), nama:"", tipe:"FDM", gramasi:"", durasiJam:"" }
export function PlateInput(props: {
  locked: boolean; plates: PlateRow[]; batch: string;
  onPlatesChange: (p: PlateRow[]) => void; onBatchChange: (b: string) => void;
}): JSX.Element;
```

---

### Task 1: Core — test karakterisasi multi-plate sum + batch

**Files:**
- Modify: `packages/kalkulator-core/src/formula-v2.test.ts` (tambah 2 test di dalam `describe('hitungKalkulasiV2', ...)`, setelah test `'batch membagi biaya produksi'` sekitar baris 100)

**Interfaces:**
- Consumes: `hitungKalkulasiV2`, `baseInput`, `SETTINGS` (sudah ada di file itu).
- Produces: tidak ada (hanya test).

**Catatan penting:** Core SUDAH menjumlahkan plate & membagi batch dengan benar. Test ini **karakterisasi/regresi** — mengunci perilaku yang selama ini tak diuji (`plates.length > 1`). Karena implementasi sudah ada, test akan **langsung PASS**. Itu tujuannya: jaring pengaman sebelum lapisan saas bergantung padanya. JANGAN ubah kode core untuk "membuatnya gagal dulu".

- [ ] **Step 1: Tambahkan dua test**

Sisipkan setelah blok test `it('batch membagi biaya produksi', ...)` (sekitar baris 100), masih di dalam `describe('hitungKalkulasiV2', ...)`:

```ts
  it('multi-plate: hpp & jual dijumlahkan antar-plate', () => {
    const plate = { durasiJam: 1, mesinPerJam: 1000, materials: [{ gramasi: 10, hppPerGram: 300, jualPerGram: 900, failureRatePct: 0 }] }
    const one = hitungKalkulasiV2(baseInput({ plates: [plate] }), SETTINGS)
    const two = hitungKalkulasiV2(baseInput({ plates: [plate, plate] }), SETTINGS)
    expect(two.hppProduksi).toBeCloseTo(one.hppProduksi * 2)   // 8000
    expect(two.floorPrice).toBeCloseTo(one.floorPrice * 2)     // 20000
  })

  it('batch membagi total gabungan multi-plate', () => {
    const plate = { durasiJam: 1, mesinPerJam: 1000, materials: [{ gramasi: 10, hppPerGram: 300, jualPerGram: 900, failureRatePct: 0 }] }
    const r = hitungKalkulasiV2(baseInput({ plates: [plate, plate], batch: 2 }), SETTINGS)
    expect(r.hppProduksi).toBeCloseTo(4000)    // 8000 / 2
    expect(r.floorPrice).toBeCloseTo(10000)    // 20000 / 2
  })
```

- [ ] **Step 2: Jalankan test (harus PASS — perilaku sudah ada)**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/kalkulator-core exec vitest run src/formula-v2.test.ts`
Expected: PASS, termasuk 2 test baru. (Kalau gagal, itu temuan nyata di core — laporkan, jangan tambal test.)

- [ ] **Step 3: Commit**

```bash
git add packages/kalkulator-core/src/formula-v2.test.ts
git commit -m "test(core): kunci sum antar-plate + batch multi-plate (karakterisasi 1b-3)"
```

---

### Task 2: compute.ts — CalcInput multi-plate + normalisasi buildInputV2

**Files:**
- Modify: `apps/saas/lib/kalkulator/compute.ts:12-41` (interface `CalcInput` + fungsi `buildInputV2`)
- Modify: `apps/saas/lib/kalkulator/compute.test.ts` (tambah `describe` baru di akhir file)

**Interfaces:**
- Consumes: `ls.material[tipe]` (`{ hppPerGram, jualPerGram, failureRatePct }`), `ls.mesinPerJam`, `composeKomponen`, `composeLabor` (sudah diimpor di file).
- Produces:
  - `export interface CalcPlate { id: string; nama?: string; tipe: "FDM" | "SLA"; gramasi: number; durasiJam: number; }`
  - `CalcInput` dengan field baru opsional `plates?: CalcPlate[]` dan `batch?: number`, dan `gramasi/durasiJam/tipe` jadi opsional.
  - `buildInputV2(c, ls)` yang: pakai `c.plates` bila ada (map ke `PlateInputV2`), else bangun 1 plate dari field legacy; sanitasi `batch` ke `>= 1`.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan `type CalcPlate` ke import compute yang sudah ada di baris 3 (jadi `import { buildInputV2, compute, fullView, defaultSettings, type CalcPlate } from "@/lib/kalkulator/compute";`), lalu tambahkan `describe` ini di akhir `apps/saas/lib/kalkulator/compute.test.ts`:

```ts
describe("1b-3 multi-plate + batch", () => {
  const p = (over: Partial<CalcPlate> = {}): CalcPlate => ({ id: "x", tipe: "FDM", gramasi: 50, durasiJam: 3, ...over });

  it("plates[] menghasilkan N plate di output V2", () => {
    const out = buildInputV2({ plates: [p(), p({ id: "y", gramasi: 30 }), p({ id: "z", tipe: "SLA", gramasi: 20 })] });
    expect(out.plates).toHaveLength(3);
    expect(out.plates[0].materials[0].gramasi).toBe(50);
    expect(out.plates[2].materials[0].gramasi).toBe(20);
    // plate SLA memakai rate material SLA dari settings
    expect(out.plates[2].materials[0].hppPerGram).toBe(DEFAULT_LOCAL_SETTINGS.material.SLA.hppPerGram);
  });

  it("nama plate → namaPart (dan diabaikan bila kosong)", () => {
    const out = buildInputV2({ plates: [p({ nama: "Face" }), p({ id: "y" })] });
    expect(out.plates[0].namaPart).toBe("Face");
    expect(out.plates[1].namaPart).toBeUndefined();
  });

  it("batch diteruskan & di-sanitasi (>=1, NaN/undefined → 1)", () => {
    expect(buildInputV2({ plates: [p()], batch: 4 }).batch).toBe(4);
    expect(buildInputV2({ plates: [p()], batch: 0 }).batch).toBe(1);
    expect(buildInputV2({ plates: [p()], batch: -2 }).batch).toBe(1);
    expect(buildInputV2({ plates: [p()] }).batch).toBe(1);
  });

  it("parity: plates single == jalur legacy flat (angka identik)", () => {
    const viaPlate = fullView({ plates: [p({ gramasi: 50, durasiJam: 3, tipe: "FDM" })] });
    const viaLegacy = fullView({ gramasi: 50, durasiJam: 3, tipe: "FDM" });
    expect(viaPlate).toEqual(viaLegacy);
  });

  it("dua plate [50,50] == satu plate 100g/6jam (core linear)", () => {
    const two = fullView({ plates: [p({ gramasi: 50, durasiJam: 3 }), p({ id: "y", gramasi: 50, durasiJam: 3 })] });
    const one = fullView({ gramasi: 100, durasiJam: 6, tipe: "FDM" });
    expect(two.biayaModal).toBe(one.biayaModal);
    expect(two.hargaJualMinimum).toBe(one.hargaJualMinimum);
  });

  it("batch 2 pada dua plate identik membagi produksi", () => {
    const b1 = fullView({ plates: [p(), p({ id: "y" })], batch: 1 });
    const b2 = fullView({ plates: [p(), p({ id: "y" })], batch: 2 });
    expect(b2.rincian.produksi).toBe(Math.round(b1.rincian.produksi / 2));
  });
});
```

- [ ] **Step 2: Jalankan test — harus GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compute.test.ts`
Expected: FAIL — `CalcPlate` belum diekspor / `buildInputV2` belum menerima `plates`/`batch` (TS error atau assertion gagal).

- [ ] **Step 3: Ganti interface + buildInputV2**

Ganti `apps/saas/lib/kalkulator/compute.ts` baris 12-41 (dari `export interface CalcInput {` sampai penutup `}` fungsi `buildInputV2`) dengan:

```ts
export interface CalcPlate {
  id: string;
  nama?: string;
  tipe: "FDM" | "SLA";
  gramasi: number;
  durasiJam: number;
}

export interface CalcInput {
  // legacy single-plate — tetap didukung agar seluruh test lama hijau
  gramasi?: number;
  durasiJam?: number;
  tipe?: "FDM" | "SLA";
  // multi-plate (1b-3) — kalau plates ada & non-kosong, dipakai; kalau tidak, fallback ke 3 field legacy
  plates?: CalcPlate[];
  batch?: number;
  hargaAktual?: { channelId: string; harga: number };
  komponen?: KomponenRow[];
  labor?: LaborRow[];
  packing?: { nama: string; harga: number };
}

export function buildInputV2(c: CalcInput, ls: LocalSettings = DEFAULT_LOCAL_SETTINGS): KalkulasiInputV2 {
  const toPlate = (tipe: "FDM" | "SLA", gramasi: number, durasiJam: number, nama?: string) => {
    const m = ls.material[tipe];
    return {
      ...(nama ? { namaPart: nama } : {}),
      durasiJam,
      mesinPerJam: ls.mesinPerJam,
      mesinPerJamJual: ls.mesinPerJam,
      materials: [{
        gramasi,
        hppPerGram: m.hppPerGram,
        jualPerGram: m.jualPerGram,
        failureRatePct: m.failureRatePct,
      }],
    };
  };
  const plates =
    c.plates && c.plates.length > 0
      ? c.plates.map((p) => toPlate(p.tipe, p.gramasi, p.durasiJam, p.nama))
      : [toPlate(c.tipe ?? "FDM", c.gramasi ?? 0, c.durasiJam ?? 0)];
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

(Fungsi `compute` dan `fullView` di bawahnya TIDAK berubah — keduanya sudah menerima `CalcInput`.)

- [ ] **Step 4: Jalankan test compute — harus PASS (baru + lama)**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/compute.test.ts`
Expected: PASS semua — 6 test baru hijau, dan semua test lama (`compute parity`, `fullView`, `compute custom settings`, `1b-2 add-on + rincian`) tetap hijau.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/compute.ts apps/saas/lib/kalkulator/compute.test.ts
git commit -m "feat(saas): CalcInput multi-plate + batch, buildInputV2 normalisasi plates[] (TDD)"
```

---

### Task 3: PlateInput.tsx — komponen daftar plate + batch

**Files:**
- Create: `apps/saas/components/PlateInput.tsx`
- Create: `apps/saas/components/PlateInput.test.tsx`

**Interfaces:**
- Consumes: `GlassInput` dari `@3pb/ui`, `InfoTip` dari `./InfoTip`, `newId` dari `@/lib/id`, `Link` dari `next/link`.
- Produces: `PlateRow`, `newPlateRow()`, `PlateInput` (lihat Interfaces global di atas).

**Desain render:**
- **locked (Free):** render `plates[0]` dengan layout berlabel **verbatim** seperti kalkulator lama (Berat/Durasi/Jenis + InfoTip) supaya angka & UX Free identik — TANPA field nama, TANPA batch, TANPA tombol tambah. Lalu blok terkunci `🔒 Multi-plate & batch` + CTA `/beli`.
- **unlocked (Pro):** header kecil "Bagian cetak (plate)" + InfoTip; tiap plate = 1 baris `[nama | FDM/SLA | gram | durasi | ✕]` (✕ hilang saat cuma 1 plate); tombol `＋ tambah plate`; baris TOTAL (gram+durasi) muncul saat `plates.length > 1`; field Batch + InfoTip; catatan "per pcs ÷ batch" saat `>1 plate && batch>1`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/saas/components/PlateInput.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlateInput, newPlateRow, type PlateRow } from "./PlateInput";

const row = (over: Partial<PlateRow> = {}): PlateRow => ({ id: "p1", nama: "", tipe: "FDM", gramasi: "50", durasiJam: "3", ...over });
const base = { plates: [row()], batch: "1", onPlatesChange: vi.fn(), onBatchChange: vi.fn() };

describe("PlateInput", () => {
  it("locked → field berlabel + blok terkunci, tak ada tambah plate / batch", () => {
    render(<PlateInput {...base} locked={true} />);
    expect(screen.getByText(/Berat/)).toBeTruthy();
    expect(screen.getByText(/Multi-plate/)).toBeTruthy();
    expect(screen.queryByText(/tambah plate/)).toBeNull();
    expect(screen.queryByText(/Batch/)).toBeNull();
  });

  it("locked → mengubah gram tetap memanggil onPlatesChange", () => {
    const onP = vi.fn();
    render(<PlateInput {...base} locked={true} onPlatesChange={onP} />);
    fireEvent.change(screen.getByDisplayValue("50"), { target: { value: "70" } });
    expect(onP).toHaveBeenCalled();
    expect(onP.mock.calls[0][0][0]).toMatchObject({ gramasi: "70" });
  });

  it("unlocked → ＋ tambah plate menambah baris", () => {
    const onP = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} />);
    fireEvent.click(screen.getByText(/tambah plate/));
    expect(onP.mock.calls[0][0]).toHaveLength(2);
    expect(onP.mock.calls[0][0][1].id).toBeTruthy();
  });

  it("unlocked → hapus plate; plate terakhir tak bisa dihapus", () => {
    // 1 plate → tak ada tombol hapus
    const { rerender } = render(<PlateInput {...base} locked={false} />);
    expect(screen.queryByLabelText(/Hapus plate/)).toBeNull();
    // 2 plate → ada tombol hapus, klik → sisa 1
    const onP = vi.fn();
    rerender(<PlateInput plates={[row(), row({ id: "p2" })]} batch="1" onBatchChange={vi.fn()} locked={false} onPlatesChange={onP} />);
    fireEvent.click(screen.getAllByLabelText(/Hapus plate/)[0]);
    expect(onP.mock.calls[0][0]).toHaveLength(1);
  });

  it("unlocked → baris TOTAL muncul saat >1 plate dengan jumlah benar", () => {
    render(<PlateInput plates={[row({ gramasi: "50", durasiJam: "3" }), row({ id: "p2", gramasi: "30", durasiJam: "2" })]} batch="1" onPlatesChange={vi.fn()} onBatchChange={vi.fn()} locked={false} />);
    expect(screen.getByText(/TOTAL/)).toBeTruthy();
    expect(screen.getByText(/80 g/)).toBeTruthy();
    expect(screen.getByText(/5 jam/)).toBeTruthy();
  });

  it("unlocked → field batch memanggil onBatchChange", () => {
    const onB = vi.fn();
    render(<PlateInput {...base} locked={false} onBatchChange={onB} />);
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "4" } });
    expect(onB).toHaveBeenCalledWith("4");
  });

  it("newPlateRow menghasilkan row kosong ber-id", () => {
    const r = newPlateRow();
    expect(r).toMatchObject({ nama: "", tipe: "FDM", gramasi: "", durasiJam: "" });
    expect(r.id).toBeTruthy();
  });
});

// Regresi bug produksi 2026-07-21: di http://<IP> crypto.randomUUID undefined.
describe("PlateInput tanpa crypto.randomUUID (http:// + IP)", () => {
  const asli = globalThis.crypto;
  beforeEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      value: { getRandomValues: asli.getRandomValues.bind(asli) }, // randomUUID SENGAJA tak ada
      configurable: true, writable: true,
    });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", { value: asli, configurable: true, writable: true });
  });

  it("tambah plate tetap jalan & id truthy", () => {
    const onP = vi.fn();
    render(<PlateInput {...base} locked={false} onPlatesChange={onP} />);
    fireEvent.click(screen.getByText(/tambah plate/));
    expect(onP.mock.calls[0][0]).toHaveLength(2);
    expect(onP.mock.calls[0][0][1].id).toBeTruthy();
  });
});
```

- [ ] **Step 2: Jalankan test — harus GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/PlateInput.test.tsx`
Expected: FAIL — modul `./PlateInput` belum ada.

- [ ] **Step 3: Buat komponen**

Buat `apps/saas/components/PlateInput.tsx`:

```tsx
"use client";
import Link from "next/link";
import { GlassInput } from "@3pb/ui";
import { InfoTip } from "./InfoTip";
import { newId } from "@/lib/id";

export interface PlateRow {
  id: string;
  nama: string;
  tipe: "FDM" | "SLA";
  gramasi: string;
  durasiJam: string;
}

export function newPlateRow(): PlateRow {
  return { id: newId(), nama: "", tipe: "FDM", gramasi: "", durasiJam: "" };
}

export function PlateInput({
  locked, plates, batch, onPlatesChange, onBatchChange,
}: {
  locked: boolean;
  plates: PlateRow[];
  batch: string;
  onPlatesChange: (p: PlateRow[]) => void;
  onBatchChange: (b: string) => void;
}) {
  const setRow = (i: number, patch: Partial<PlateRow>) =>
    onPlatesChange(plates.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  if (locked) {
    const p = plates[0];
    return (
      <div className="flex flex-col gap-3">
        <label className="text-[12px] g-t3 flex flex-col">
          <span className="flex items-center gap-1">Berat (gram)
            <InfoTip text="Berat total produk yang dicetak. Dikali harga material per gram untuk jadi Biaya modal." /></span>
          <GlassInput type="number" inputMode="decimal" value={p.gramasi}
            onChange={(e) => setRow(0, { gramasi: e.target.value })} className="w-full mt-1" />
        </label>
        <label className="text-[12px] g-t3 flex flex-col">
          <span className="flex items-center gap-1">Durasi print (jam)
            <InfoTip text="Lama cetak menurut slicer. Dikali Biaya mesin/jam (listrik + depresiasi + maintenance)." /></span>
          <GlassInput type="number" inputMode="decimal" value={p.durasiJam}
            onChange={(e) => setRow(0, { durasiJam: e.target.value })} className="w-full mt-1" />
        </label>
        <label className="text-[12px] g-t3 flex flex-col">
          <span className="flex items-center gap-1">Jenis filament
            <InfoTip text="Menentukan tarif material yang dipakai: FDM pakai harga filament, SLA pakai harga resin." /></span>
          <select value={p.tipe} onChange={(e) => setRow(0, { tipe: e.target.value as "FDM" | "SLA" })}
            className="glass-input rounded-[10px] px-3 h-10 text-sm w-full mt-1">
            <option value="FDM">FDM (PLA/PETG)</option>
            <option value="SLA">SLA (Resin)</option>
          </select>
        </label>
        <div className="border-t border-[color:var(--g-row-border)] pt-3 mt-1">
          <div className="text-[12px] g-t3 font-medium">🔒 Multi-plate &amp; batch</div>
          <p className="text-[11px] g-t4 mt-1">Produk multi-bagian (tiap part berat &amp; durasi sendiri) dan banyak pcs sekali cetak. <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
        </div>
      </div>
    );
  }

  const totalGram = plates.reduce((s, p) => s + (Number(p.gramasi) || 0), 0);
  const totalDurasi = plates.reduce((s, p) => s + (Number(p.durasiJam) || 0), 0);
  const batchN = Number(batch) || 1;
  const multi = plates.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] g-t3 flex items-center gap-1">Bagian cetak (plate)
        <InfoTip text="Satu produk bisa terdiri dari beberapa bagian cetak. Tiap plate punya berat & durasi sendiri; totalnya dijumlahkan jadi biaya produksi." /></div>

      {plates.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <GlassInput value={p.nama} placeholder="Nama part (opsional)" className="flex-1"
              onChange={(e) => setRow(i, { nama: e.target.value })} />
            {multi && (
              <button type="button" aria-label="Hapus plate" className="g-t4 text-sm px-1"
                onClick={() => onPlatesChange(plates.filter((_, j) => j !== i))}>✕</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select value={p.tipe} onChange={(e) => setRow(i, { tipe: e.target.value as "FDM" | "SLA" })}
              className="glass-input rounded-[10px] px-2 h-10 text-sm w-24">
              <option value="FDM">FDM</option>
              <option value="SLA">SLA</option>
            </select>
            <GlassInput type="number" inputMode="decimal" placeholder="gram" value={p.gramasi} className="flex-1"
              onChange={(e) => setRow(i, { gramasi: e.target.value })} />
            <GlassInput type="number" inputMode="decimal" placeholder="durasi (jam)" value={p.durasiJam} className="flex-1"
              onChange={(e) => setRow(i, { durasiJam: e.target.value })} />
          </div>
        </div>
      ))}

      <button type="button" onClick={() => onPlatesChange([...plates, newPlateRow()])}
        className="text-[12px] g-t4 underline text-left">＋ tambah plate</button>

      {multi && (
        <div className="text-[11px] g-t4 flex items-center gap-1">
          TOTAL: {totalGram} g · {totalDurasi} jam
          <InfoTip text="Jumlah berat & durasi seluruh plate. Biaya produksi dihitung dari total ini." />
        </div>
      )}

      <label className="text-[12px] g-t3 flex flex-col">
        <span className="flex items-center gap-1">Batch (pcs sekali cetak)
          <InfoTip text="Jumlah unit identik dari sekali gabungan cetak. Biaya produksi dibagi angka ini." /></span>
        <GlassInput type="number" inputMode="numeric" value={batch} className="w-24 mt-1"
          onChange={(e) => onBatchChange(e.target.value)} />
      </label>

      {multi && batchN > 1 && (
        <div className="text-[11px] g-t4">per pcs = total produksi ÷ {batchN}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test — harus PASS**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/PlateInput.test.tsx`
Expected: PASS semua (8 test).

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/PlateInput.tsx apps/saas/components/PlateInput.test.tsx
git commit -m "feat(saas): komponen PlateInput multi-plate + batch (locked Free / rows Pro) (TDD)"
```

---

### Task 4: Calculator.tsx — wiring state plates[] + batch

**Files:**
- Modify: `apps/saas/components/Calculator.tsx`
- Modify: `apps/saas/components/calculator.test.tsx` (tambah 2 test)

**Interfaces:**
- Consumes: `PlateInput`, `PlateRow`, `newPlateRow` dari `./PlateInput` (Task 3); `CalcPlate` dari `@/lib/kalkulator/compute` (Task 2); `fullView` (sudah diimpor).
- Produces: tidak ada (komponen halaman terminal).

**Perubahan state & render:**
- Buang state `gramasi`, `durasi`, `tipe`.
- Tambah `plates: PlateRow[]` (seed 1 plate id **stabil** `"plate-1"` — id stabil untuk baris awal menghindari mismatch hidrasi SSR/klien; baris tambahan pakai `newPlateRow()`), dan `batch: string` (seed `"1"`).
- Ganti tiga blok `<label>` (baris 57-77) dengan `<PlateInput .../>`.
- Hitung `valid` dari semua plate; `view` dari `fullView({ plates: plates.map(toCalcPlate), batch: paidCore ? Number(batch) : 1, ...addon }, settings)`.
- Update teks upsell bawah dari `"Simpan hasil & multi-plate → Pro 🔒"` jadi `"Simpan hasil → Pro 🔒"` (multi-plate kini ditangani blok terkunci di kartu input).

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan `describe` ini di akhir `apps/saas/components/calculator.test.tsx`:

```tsx
describe("1b-3 multi-plate di Calculator", () => {
  it("Pro: tampil kontrol multi-plate (tambah plate + batch)", () => {
    render(<Calculator authenticated={true} paidCore={true} userId="u1" />);
    expect(screen.getByText(/tambah plate/)).toBeTruthy();
    expect(screen.getByText(/Batch/)).toBeTruthy();
  });

  it("Free: multi-plate terkunci, tetap tampil field Berat berlabel", () => {
    render(<Calculator authenticated={true} paidCore={false} userId={null} />);
    expect(screen.getByText(/Berat/)).toBeTruthy();
    expect(screen.getByText(/Multi-plate/)).toBeTruthy();
    expect(screen.queryByText(/tambah plate/)).toBeNull();
  });
});
```

Sesuaikan import di atas file bila `render`/`screen`/`Calculator` belum diimpor (ikuti pola test yang sudah ada di file itu).

- [ ] **Step 2: Jalankan test — harus GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/calculator.test.tsx`
Expected: FAIL — teks `/tambah plate/` & `/Multi-plate/` belum ada (Calculator masih pakai field flat lama).

- [ ] **Step 3: Ubah Calculator**

Di `apps/saas/components/Calculator.tsx`:

**(a)** Tambah import (setelah baris `import { KomponenLaborInput } from "./KomponenLaborInput";`):

```tsx
import { PlateInput, type PlateRow } from "./PlateInput";
import type { CalcPlate } from "@/lib/kalkulator/compute";
```

**(b)** Ganti tiga baris state (baris 28-30):

```tsx
  const [gramasi, setGramasi] = useState("50");
  const [durasi, setDurasi] = useState("3");
  const [tipe, setTipe] = useState<"FDM" | "SLA">("FDM");
```

dengan:

```tsx
  const [plates, setPlates] = useState<PlateRow[]>([
    { id: "plate-1", nama: "", tipe: "FDM", gramasi: "50", durasiJam: "3" },
  ]);
  const [batch, setBatch] = useState("1");
```

**(c)** Ganti blok hitung `valid`/`view` (baris 47-51):

```tsx
  const g = Number(gramasi);
  const d = Number(durasi);
  const valid = Number.isFinite(g) && g > 0 && Number.isFinite(d) && d > 0;
  const addon = paidCore ? { komponen, labor, packing } : {};
  const view = valid ? fullView({ gramasi: g, durasiJam: d, tipe, ...addon }, settings) : null;
```

dengan:

```tsx
  const toCalcPlate = (p: PlateRow): CalcPlate => ({
    id: p.id, nama: p.nama || undefined, tipe: p.tipe,
    gramasi: Number(p.gramasi), durasiJam: Number(p.durasiJam),
  });
  const valid =
    plates.length > 0 &&
    plates.every((p) => Number(p.gramasi) > 0 && Number(p.durasiJam) > 0);
  const addon = paidCore ? { komponen, labor, packing } : {};
  const view = valid
    ? fullView({ plates: plates.map(toCalcPlate), batch: paidCore ? Number(batch) : 1, ...addon }, settings)
    : null;
```

**(d)** Ganti tiga blok `<label>` berlabel Berat/Durasi/Jenis (baris 57-77) dengan:

```tsx
          <PlateInput
            locked={!paidCore}
            plates={plates}
            batch={batch}
            onPlatesChange={setPlates}
            onBatchChange={setBatch}
          />
```

(Biarkan baris `<p ...>Printer: Default (Bambu P1P) ...</p>` dan `<KomponenLaborInput .../>` di bawahnya apa adanya.)

**(e)** Ganti teks upsell bawah (baris 132-136):

```tsx
              {!paidCore && (
                <Link href="/beli" className="text-[11px] g-t4 text-left underline">
                  Simpan hasil & multi-plate → Pro 🔒
                </Link>
              )}
```

dengan:

```tsx
              {!paidCore && (
                <Link href="/beli" className="text-[11px] g-t4 text-left underline">
                  Simpan hasil → Pro 🔒
                </Link>
              )}
```

- [ ] **Step 4: Jalankan test calculator — harus PASS**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/calculator.test.tsx`
Expected: PASS — 2 test baru hijau, semua test calculator lama tetap hijau.

- [ ] **Step 5: Jalankan seluruh suite saas + core + lint**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run && pnpm --filter @3pb/kalkulator-core exec vitest run`
Expected: PASS semua (tak ada regresi 1a/1b).

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas build`
Expected: build sukses (verifikasi tak ada TS error di `Calculator.tsx`/`PlateInput.tsx`/`compute.ts`). Kalau `next build` gagal karena `@prisma/client` ter-clobber app lain, jalankan `cd apps/saas && npx prisma generate` lalu ulangi build.

- [ ] **Step 6: Commit**

```bash
git add apps/saas/components/Calculator.tsx apps/saas/components/calculator.test.tsx
git commit -m "feat(saas): Calculator pakai PlateInput multi-plate + batch, upsell diperbarui (TDD)"
```

---

## Verifikasi akhir (setelah semua task)

- [ ] Seluruh `pnpm --filter @3pb/saas exec vitest run` hijau.
- [ ] Seluruh `pnpm --filter @3pb/kalkulator-core exec vitest run` hijau.
- [ ] `pnpm --filter @3pb/saas build` sukses.
- [ ] Manual (opsional, via preview): Free = kalkulator single-plate identik + blok 🔒 Multi-plate; Pro = tambah/hapus plate, TOTAL, batch mengubah angka.
- [ ] Deploy homelab **tidak dijalankan** kecuali user meminta.

## Follow-up (di luar 1b-3)

- Subtotal Rp per-plate di `RincianPanel` (butuh core expose per-plate cost).
- Per-plate material/printer profile (saas belum punya katalog profil).
- Simpan hasil kalkulasi (IndexedDB) = **1b-4**.
