# Katalog Pekerjaan Labor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Field nama pekerjaan labor jadi autocomplete dari katalog `laborJobs`; pilih pekerjaan dikenal → tarif auto-isi; pekerjaan baru lewat popup → tersimpan ke katalog; katalog dikelola di Setting.

**Architecture:** Katalog `laborJobs` = field UI baru di `LocalSettings` (bukan input formula). `LaborInput` dapat `jobs` + `onAddJob`. `Calculator` menyimpan katalog (Pro → `saveSettings` IndexedDB). Backward-compat gratis dari merge `{...DEFAULT, ...stored}` di `loadSettings`.

**Tech Stack:** Next.js 16 / React 19, TypeScript, vitest + @testing-library/react (jsdom), `@3pb/ui`, idb.

## Global Constraints

- **Bahasa Indonesia** semua copy/komentar.
- **Formula bisnis TAK berubah** — `laborJobs` katalog UI, tidak masuk `composeLabor`/core.
- **`newId()`** dari `@/lib/id` untuk id — JANGAN `crypto.randomUUID()`.
- `LocalSettings` diperluas **additive**; backward-compat dari merge existing (`loadSettings` = `{...DEFAULT_LOCAL_SETTINGS, ...stored}`).
- Popup pakai `modal-surface`, `role="dialog"`, `aria-modal="true"`, Esc/backdrop tutup.
- Border-radius kontrol `rounded-[5px]` (konsisten). Tema Glass.
- Semua 275 test existing tetap hijau.
- Node 22: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum shell.
- Kerja hanya di worktree `feat/saas-labor-catalog`; commit path spesifik, JANGAN `git add -A`.
- Deploy homelab :3300 gated.

## File Structure

| File | Aksi | Task |
|---|---|---|
| `apps/saas/lib/kalkulator/local-settings.ts` | Modify (`LaborJob` type, `laborJobs` field+seed, validate) | 1 |
| `apps/saas/lib/kalkulator/local-settings.test.ts` | Modify (tambah) | 1 |
| `apps/saas/components/LaborInput.tsx` | Modify (datalist + autofill + NewJobDialog) | 2 |
| `apps/saas/components/LaborInput.test.tsx` | Modify (tambah) | 2 |
| `apps/saas/components/Calculator.tsx` | Modify (jobs + onAddJob + persist) | 3 |
| `apps/saas/components/calculator.test.tsx` | Modify (tambah) | 3 |
| `apps/saas/components/SettingsPanel.tsx` | Modify (section Daftar pekerjaan) | 4 |
| `apps/saas/components/settings-panel.test.tsx` | Modify (tambah) | 4 |

**Interfaces global:**

```ts
// local-settings.ts (Task 1)
export interface LaborJob { id: string; nama: string; ratePerJam?: number; flat?: number }
// LocalSettings tambah field: laborJobs: LaborJob[];

// LaborInput.tsx (Task 2) — props tambahan
//   jobs: LaborJob[];
//   onAddJob: (job: { nama: string; ratePerJam?: number; flat?: number }) => void;
```

---

### Task 1: Data — `laborJobs` type + seed + validate

**Files:**
- Modify: `apps/saas/lib/kalkulator/local-settings.ts`
- Modify: `apps/saas/lib/kalkulator/local-settings.test.ts`

**Interfaces:**
- Produces: `LaborJob`, `LocalSettings.laborJobs`, seed default, validasi.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `apps/saas/lib/kalkulator/local-settings.test.ts`:

```ts
describe("laborJobs katalog", () => {
  it("default berisi Assembly/Sanding/Painting dengan tarif", () => {
    const namas = DEFAULT_LOCAL_SETTINGS.laborJobs.map((j) => j.nama);
    expect(namas).toEqual(expect.arrayContaining(["Assembly", "Sanding", "Painting"]));
    const painting = DEFAULT_LOCAL_SETTINGS.laborJobs.find((j) => j.nama === "Painting")!;
    expect(painting.ratePerJam).toBe(75000);
  });
  it("validate menolak job tarif negatif", () => {
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, laborJobs: [{ id: "x", nama: "X", ratePerJam: -1 }] };
    expect(validateLocalSettings(bad)).toContain('Pekerjaan "X" tarif negatif');
  });
  it("validate menolak job nama kosong", () => {
    const bad: LocalSettings = { ...DEFAULT_LOCAL_SETTINGS, laborJobs: [{ id: "x", nama: "  ", ratePerJam: 100 }] };
    expect(validateLocalSettings(bad).some((e) => /Pekerjaan #1 nama kosong/.test(e))).toBe(true);
  });
});
```

(Pastikan file mengimpor `validateLocalSettings`, `DEFAULT_LOCAL_SETTINGS`, `type LocalSettings` — sebagian besar sudah; tambahkan yang kurang.)

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/local-settings.test.ts`
Expected: FAIL — `laborJobs` belum ada.

- [ ] **Step 3: Tambah tipe + field + seed + validate**

Di `apps/saas/lib/kalkulator/local-settings.ts`:

(a) Setelah `export interface LaborPreset {...}` tambah:

```ts
export interface LaborJob { id: string; nama: string; ratePerJam?: number; flat?: number }
```

(b) Di `interface LocalSettings`, setelah `laborPresets: LaborPreset[];` tambah:

```ts
  laborJobs: LaborJob[];
```

(c) Di `DEFAULT_LOCAL_SETTINGS`, setelah properti `laborPresets: [...]` tambah:

```ts
  laborJobs: [
    { id: "job-assembly", nama: "Assembly", ratePerJam: 35000 },
    { id: "job-sanding", nama: "Sanding", ratePerJam: 35000 },
    { id: "job-painting", nama: "Painting", ratePerJam: 75000 },
  ],
```

(d) Di `validateLocalSettings`, sebelum `return errs;` tambah:

```ts
  ls.laborJobs.forEach((j, i) => {
    if (!j.nama.trim()) errs.push(`Pekerjaan #${i + 1} nama kosong`);
    if (j.ratePerJam != null && j.ratePerJam < 0) errs.push(`Pekerjaan "${j.nama || i + 1}" tarif negatif`);
    if (j.flat != null && j.flat < 0) errs.push(`Pekerjaan "${j.nama || i + 1}" tarif negatif`);
  });
```

- [ ] **Step 4: Jalankan — PASS (baru + lama)**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run lib/kalkulator/local-settings.test.ts`
Expected: PASS semua.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/kalkulator/local-settings.ts apps/saas/lib/kalkulator/local-settings.test.ts
git commit -m "feat(saas): laborJobs katalog di LocalSettings — tipe, seed, validasi (TDD)"
```

---

### Task 2: LaborInput — autocomplete + auto-isi tarif + popup pekerjaan baru

**Files:**
- Modify: `apps/saas/components/LaborInput.tsx`
- Modify: `apps/saas/components/LaborInput.test.tsx`

**Interfaces:**
- Consumes: `LaborJob` dari `@/lib/kalkulator/local-settings`; `newId` (untuk key list — tak wajib); `GlassInput`; `rupiah`.
- Produces: `LaborInput` dengan props tambahan `jobs`, `onAddJob`.

**Konteks:** `LaborInput.tsx` saat ini (Arah A) punya props `{ locked, presets, labor, onChange }`, tiap baris: nama input + chip metode + input jam/tarif atau flat + total + ✕ + helper menit. Tambahkan katalog: datalist saran di field nama, auto-isi tarif saat nama cocok katalog & baris kosong, dan popup untuk nama baru.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di `apps/saas/components/LaborInput.test.tsx`. Perbarui fixture jadi menyertakan `jobs` + `onAddJob` di props default (buat helper), lalu tambah describe:

```tsx
const jobs = [
  { id: "j1", nama: "Painting", ratePerJam: 75000 },
  { id: "j2", nama: "Packing", flat: 3000 },
];
const withCat = { jobs, onAddJob: vi.fn() };

describe("LaborInput katalog", () => {
  it("datalist berisi nama job dari katalog", () => {
    const { container } = render(<LaborInput locked={false} presets={presets} labor={[]} onChange={() => {}} {...withCat} />);
    const opts = Array.from(container.querySelectorAll("datalist option")).map((o) => (o as HTMLOptionElement).value);
    expect(opts).toEqual(expect.arrayContaining(["Painting", "Packing"]));
  });
  it("ketik nama cocok katalog (baris kosong) → auto-isi ratePerJam", () => {
    const onC = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "" }]} onChange={onC} {...withCat} />);
    fireEvent.change(screen.getByPlaceholderText(/Nama pekerjaan/), { target: { value: "Painting" } });
    expect(onC.mock.calls.at(-1)![0][0]).toMatchObject({ nama: "Painting", ratePerJam: 75000 });
  });
  it("nama cocok tapi baris SUDAH ada tarif → tidak menimpa", () => {
    const onC = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "", jam: 1, ratePerJam: 10000 }]} onChange={onC} {...withCat} />);
    fireEvent.change(screen.getByPlaceholderText(/Nama pekerjaan/), { target: { value: "Painting" } });
    expect(onC.mock.calls.at(-1)![0][0]).toMatchObject({ nama: "Painting", ratePerJam: 10000 });
  });
  it("blur nama BARU (tak di katalog, baris kosong) → dialog muncul; Simpan panggil onAddJob + isi baris", () => {
    const onC = vi.fn(); const onAdd = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Coating" }]} onChange={onC} jobs={jobs} onAddJob={onAdd} />);
    fireEvent.blur(screen.getByDisplayValue("Coating"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Tarif/i), { target: { value: "50000" } });
    fireEvent.click(screen.getByRole("button", { name: /Simpan & pakai/ }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ nama: "Coating", ratePerJam: 50000 }));
    expect(onC.mock.calls.at(-1)![0][0]).toMatchObject({ ratePerJam: 50000 });
  });
  it("blur nama baru → 'Nanti' menutup dialog tanpa onAddJob", () => {
    const onAdd = vi.fn();
    render(<LaborInput locked={false} presets={presets} labor={[{ id: "x", nama: "Coating" }]} onChange={() => {}} jobs={jobs} onAddJob={onAdd} />);
    fireEvent.blur(screen.getByDisplayValue("Coating"));
    fireEvent.click(screen.getByRole("button", { name: /Nanti/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
```

Catatan: test lama yang render `<LaborInput .../>` tanpa `jobs`/`onAddJob` perlu diberi default. Buat `jobs`/`onAddJob` **opsional** di props (default `jobs = []`, `onAddJob = () => {}`) supaya test lama tetap jalan tanpa diubah.

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/LaborInput.test.tsx`
Expected: FAIL — props/perilaku belum ada.

- [ ] **Step 3: Implementasi**

Ubah `apps/saas/components/LaborInput.tsx`:

(a) Import + tipe:

```tsx
import { useState, useId } from "react";
import type { LaborJob } from "@/lib/kalkulator/local-settings";
```

(b) Tambah props (opsional, default aman untuk test lama):

```tsx
export function LaborInput({
  locked, presets, labor, onChange, jobs = [], onAddJob = () => {},
}: {
  locked: boolean;
  presets: { id: string; nama: string; items: { nama: string; jam?: number; ratePerJam?: number; flat?: number }[] }[];
  labor: LaborRow[];
  onChange: (r: LaborRow[]) => void;
  jobs?: LaborJob[];
  onAddJob?: (job: { nama: string; ratePerJam?: number; flat?: number }) => void;
}) {
```

(c) Di dalam komponen (setelah `setRow`), tambah util katalog + state dialog + dismissed:

```tsx
  const listId = useId();
  const [dialog, setDialog] = useState<{ i: number; nama: string } | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const findJob = (nama: string) => jobs.find((j) => j.nama.trim().toLowerCase() === nama.trim().toLowerCase());
  const rowKosong = (r: LaborRow) => r.jam == null && r.ratePerJam == null && r.flat == null;

  const onNamaChange = (i: number, nama: string) => {
    const j = findJob(nama);
    if (j && rowKosong(labor[i])) {
      setRow(i, j.ratePerJam != null ? { nama, ratePerJam: j.ratePerJam, jam: labor[i].jam ?? 1, flat: undefined } : { nama, flat: j.flat, jam: undefined, ratePerJam: undefined });
    } else {
      setRow(i, { nama });
    }
  };
  const onNamaBlur = (i: number) => {
    const r = labor[i];
    if (r.nama.trim() && !findJob(r.nama) && rowKosong(r) && !dismissed.has(r.id)) {
      setDialog({ i, nama: r.nama.trim() });
    }
  };
```

(d) Ganti handler nama field pada tiap baris: `onChange={(e) => setRow(i, { nama: e.target.value })}` → `onChange={(e) => onNamaChange(i, e.target.value)}`, dan tambah `onBlur={() => onNamaBlur(i)}` + `list={listId}`.

(e) Sebelum `</div>` penutup terluar komponen, tambahkan `<datalist>` + dialog:

```tsx
      <datalist id={listId}>
        {jobs.map((j) => <option key={j.id} value={j.nama} />)}
      </datalist>

      {dialog && (
        <NewJobDialog
          nama={dialog.nama}
          onCancel={() => { setDismissed((s) => new Set(s).add(labor[dialog.i].id)); setDialog(null); }}
          onSave={(patch) => {
            onAddJob({ nama: dialog.nama, ...patch });
            setRow(dialog.i, patch.ratePerJam != null ? { ratePerJam: patch.ratePerJam, jam: labor[dialog.i].jam ?? 1, flat: undefined } : { flat: patch.flat, jam: undefined, ratePerJam: undefined });
            setDialog(null);
          }}
        />
      )}
```

(f) Tambah komponen `NewJobDialog` di file yang sama (bawah `LaborInput`):

```tsx
function NewJobDialog({ nama, onSave, onCancel }: {
  nama: string;
  onSave: (patch: { ratePerJam?: number; flat?: number }) => void;
  onCancel: () => void;
}) {
  const [metode, setMetode] = useState<"waktu" | "flat">("waktu");
  const [nilai, setNilai] = useState("");
  const id = useId();
  const n = Number(nilai);
  const valid = Number.isFinite(n) && n >= 0 && nilai !== "";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Tutup" className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-[5px] p-4 modal-surface flex flex-col gap-3"
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
        <div className="text-sm font-semibold g-t1">Pekerjaan baru: {nama}</div>
        <p className="text-[11px] g-t4">Set tarifnya sekali, nanti otomatis terpakai lagi.</p>
        <div className="flex gap-1">
          {(["waktu", "flat"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMetode(m)}
              className="g-btn-ghost rounded-[5px] px-2.5 h-8 text-[12px]"
              style={metode === m ? { outline: "2px solid var(--g-accent)", color: "var(--g-accent)" } : undefined}>
              {m === "waktu" ? "⏱ Per jam" : "Rp Tetap"}
            </button>
          ))}
        </div>
        <label className="text-[11px] g-t3 flex flex-col gap-1">
          <span>{metode === "waktu" ? "Tarif per jam (Rp)" : "Biaya tetap (Rp)"}</span>
          <GlassInput id={id} aria-label="Tarif" type="number" inputMode="decimal" value={nilai} autoFocus
            onChange={(e) => setNilai(e.target.value)} />
        </label>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel} className="g-btn-ghost rounded-[5px] h-9 px-3 text-[12px]">Nanti</button>
          <button type="button" disabled={!valid}
            onClick={() => onSave(metode === "waktu" ? { ratePerJam: n } : { flat: n })}
            className="rounded-[5px] h-9 px-3 text-[12px] font-medium text-white disabled:opacity-40"
            style={{ background: "var(--g-accent)" }}>Simpan &amp; pakai</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan — PASS (baru + lama)**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/LaborInput.test.tsx`
Expected: PASS semua.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/LaborInput.tsx apps/saas/components/LaborInput.test.tsx
git commit -m "feat(saas): LaborInput autocomplete katalog + auto-isi tarif + popup pekerjaan baru (TDD)"
```

---

### Task 3: Calculator — teruskan jobs + onAddJob + persist

**Files:**
- Modify: `apps/saas/components/Calculator.tsx`
- Modify: `apps/saas/components/calculator.test.tsx`

**Interfaces:**
- Consumes: `LaborInput` props `jobs`/`onAddJob`; `saveSettings` dari `@/lib/store/local-settings`.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di `apps/saas/components/calculator.test.tsx` (mock `saveSettings` di modul store — file sudah `vi.mock("@/lib/store/local-settings", ...)`; tambahkan `saveSettings: vi.fn()` ke mock bila belum ada):

Pastikan blok mock jadi:

```tsx
vi.mock("@/lib/store/local-settings", () => ({ loadSettings: vi.fn(async () => ({})), saveSettings: vi.fn(async () => {}) }));
import { loadSettings, saveSettings } from "@/lib/store/local-settings";
```

Lalu tambah test:

```tsx
describe("Calculator katalog pekerjaan", () => {
  it("Pro: LaborInput menerima jobs dari settings (datalist terisi)", async () => {
    (loadSettings as any).mockResolvedValue(DEFAULT_LOCAL_SETTINGS);
    const { container } = render(<Calculator authenticated paidCore userId="u1" />);
    await waitFor(() => {
      const opts = Array.from(container.querySelectorAll("datalist option")).map((o) => (o as HTMLOptionElement).value);
      expect(opts).toEqual(expect.arrayContaining(["Painting"]));
    });
  });
});
```

(Import `DEFAULT_LOCAL_SETTINGS` bila belum.)

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/calculator.test.tsx`
Expected: FAIL — datalist belum terpasang / props belum diteruskan.

- [ ] **Step 3: Implementasi**

Di `apps/saas/components/Calculator.tsx`:

(a) Import `saveSettings`:

```tsx
import { loadSettings, saveSettings } from "@/lib/store/local-settings";
```

(b) Tambah handler sebelum `return`:

```tsx
  const onAddJob = (job: { nama: string; ratePerJam?: number; flat?: number }) => {
    if (settings.laborJobs.some((j) => j.nama.trim().toLowerCase() === job.nama.trim().toLowerCase())) return;
    const next = { ...settings, laborJobs: [...settings.laborJobs, { id: newId(), ...job }] };
    setSettings(next);
    if (paidCore && userId) saveSettings(userId, next).catch(() => {});
  };
```

Tambahkan import `newId`: `import { newId } from "@/lib/id";` (bila belum ada).

(c) Teruskan ke LaborInput:

```tsx
          <LaborInput locked={!paidCore} presets={settings.laborPresets} labor={labor} onChange={setLabor}
            jobs={settings.laborJobs} onAddJob={onAddJob} />
```

- [ ] **Step 4: Jalankan — PASS + seluruh suite**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/calculator.test.tsx`
Expected: PASS.

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run`
Expected: PASS semua.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/Calculator.tsx apps/saas/components/calculator.test.tsx
git commit -m "feat(saas): Calculator teruskan katalog jobs + onAddJob (persist Pro) (TDD)"
```

---

### Task 4: SettingsPanel — section "Daftar pekerjaan"

**Files:**
- Modify: `apps/saas/components/SettingsPanel.tsx`
- Modify: `apps/saas/components/settings-panel.test.tsx`

**Interfaces:**
- Consumes: `LaborJob` type; pola `setS`/`save` yang ada.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di `apps/saas/components/settings-panel.test.tsx`:

```tsx
describe("SettingsPanel daftar pekerjaan", () => {
  it("render job dari katalog + bisa tambah (Pro)", async () => {
    (loadSettings as any).mockResolvedValue(DEFAULT_LOCAL_SETTINGS);
    render(<SettingsPanel editable={true} userId="u1" />);
    await waitFor(() => expect(screen.getByDisplayValue("Painting")).toBeTruthy());
    expect(screen.getByText(/Daftar pekerjaan/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tambah pekerjaan/ }));
    // baris kosong baru muncul (input nama tambahan)
    expect(screen.getAllByPlaceholderText("Nama pekerjaan").length).toBeGreaterThanOrEqual(1);
  });
});
```

(Import `DEFAULT_LOCAL_SETTINGS` bila belum ada di file.)

- [ ] **Step 2: Jalankan — GAGAL**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/settings-panel.test.tsx`
Expected: FAIL — section belum ada.

- [ ] **Step 3: Implementasi**

Di `apps/saas/components/SettingsPanel.tsx`:

(a) Import tipe: tambah `type LaborJob` ke import dari `@/lib/kalkulator/local-settings`.

(b) Tambah mutator setelah `delLaborPreset`/`delItem`:

```tsx
  const setJob = (i: number, patch: Partial<LaborJob>) =>
    setS((p) => ({ ...p, laborJobs: p.laborJobs.map((j, k) => (k === i ? { ...j, ...patch } : j)) }));
  const addJob = () => setS((p) => ({ ...p, laborJobs: [...p.laborJobs, { id: newId(), nama: "", ratePerJam: 0 }] }));
  const delJob = (i: number) => setS((p) => ({ ...p, laborJobs: p.laborJobs.filter((_, k) => k !== i) }));
  const jobMetode = (j: LaborJob): "waktu" | "flat" => (j.flat != null && j.ratePerJam == null ? "flat" : "waktu");
  const setJobMetode = (i: number, m: "waktu" | "flat") =>
    setJob(i, m === "flat" ? { ratePerJam: undefined, flat: s.laborJobs[i].flat ?? 0 } : { flat: undefined, ratePerJam: s.laborJobs[i].ratePerJam ?? 0 });
```

(c) Tambah section baru di dalam `return`, di grup "Tambahan" (setelah section labor preset / sebelum "Tampilan"). Sisipkan `<Section>` ini:

```tsx
      <Section title="Daftar pekerjaan" purpose="Tarif tiap pekerjaan finishing. Dipakai auto-lengkap saat mengisi kalkulator." locked={disabled}>
        <div className="flex flex-col gap-2">
          {s.laborJobs.map((j, i) => {
            const m = jobMetode(j);
            return (
              <div key={j.id} className="flex items-center gap-2">
                <GlassInput value={j.nama} disabled={disabled} placeholder="Nama pekerjaan" className="flex-1" onChange={(e) => setJob(i, { nama: e.target.value })} />
                <button type="button" disabled={disabled} onClick={() => setJobMetode(i, m === "waktu" ? "flat" : "waktu")}
                  className="g-btn-ghost rounded-[5px] h-9 px-2 text-[11px] shrink-0 whitespace-nowrap disabled:opacity-60">
                  {m === "waktu" ? "⏱ /jam" : "Rp tetap"}
                </button>
                <GlassInput type="number" inputMode="decimal" disabled={disabled} className="w-28"
                  value={String(m === "waktu" ? (j.ratePerJam ?? 0) : (j.flat ?? 0))}
                  onChange={(e) => setJob(i, m === "waktu" ? { ratePerJam: Number(e.target.value) } : { flat: Number(e.target.value) })} />
                {!disabled && <button type="button" onClick={() => delJob(i)} className="g-t4 text-sm px-1" aria-label="Hapus pekerjaan">✕</button>}
              </div>
            );
          })}
          {!disabled && <button type="button" onClick={addJob} className="text-[12px] g-t4 underline self-start">＋ Tambah pekerjaan</button>}
        </div>
      </Section>
```

(Simpan pakai tombol Simpan existing → `save()` sudah meneruskan seluruh `s` termasuk `laborJobs`. Tak perlu ubah `save()`.)

- [ ] **Step 4: Jalankan — PASS + seluruh suite + build**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run components/settings-panel.test.tsx`
Expected: PASS.

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter @3pb/saas exec vitest run && pnpm --filter @3pb/saas build`
Expected: PASS semua + build sukses (bila gagal `@prisma/client`, `cd apps/saas && npx prisma generate` lalu ulang).

- [ ] **Step 5: Commit**

```bash
git add apps/saas/components/SettingsPanel.tsx apps/saas/components/settings-panel.test.tsx
git commit -m "feat(saas): section Daftar pekerjaan di Setting (kelola katalog labor) (TDD)"
```

---

## Verifikasi akhir

- [ ] `pnpm --filter @3pb/saas exec vitest run` hijau.
- [ ] `pnpm --filter @3pb/kalkulator-core exec vitest run` hijau (formula tak berubah).
- [ ] `pnpm --filter @3pb/saas build` sukses.
- [ ] Manual (preview Pro): ketik "Painting" → tarif auto 75rb; ketik "Coating" → popup, simpan → masuk katalog; Setting → Daftar pekerjaan edit/hapus.
- [ ] Deploy homelab **tidak dijalankan** kecuali diminta.

## Follow-up (di luar plan)

- Impor katalog masal, kategori pekerjaan, sinkron cloud.
- Fuzzy match autocomplete (sekarang datalist native + exact-match).
