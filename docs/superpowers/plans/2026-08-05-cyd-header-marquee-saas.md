# CYD Header Marquee (sisi SaaS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan field opsional `headerText` (maks 120 byte UTF-8) ke `LayoutConfigOut`, supaya
user bisa mengisi teks bebas (mis. kata motivasi) yang nanti tampil marquee di strip notifikasi CYD
(sub-proyek B, firmware, plan terpisah).

**Architecture:** Field baru menumpang pipeline `LayoutConfigOut` yang sudah ada sepenuhnya --
tersimpan sebagai bagian blob JSON `CydLayout.config` (bukan kolom Postgres baru), divalidasi di
`validateLayoutConfig()` (shared package, sudah dipakai jalur `saveLayout()`), dan diedit lewat satu
input teks baru di `LayoutEditor.tsx`. Tidak ada endpoint/topic MQTT baru, tidak ada migration Prisma,
tidak ada perubahan di Agent (Electron) atau route API -- semuanya sudah generic terhadap
`LayoutConfigOut`.

**Tech Stack:** TypeScript, Next.js 16 (App Router), Prisma (schema tak berubah), Vitest +
Testing Library, pnpm workspace (`@3pb/cyd-layout-schema`, `@3pb/saas`).

## Global Constraints

- Batas panjang `headerText`: **120 byte UTF-8** (bukan 120 karakter -- string multibyte/emoji harus
  dihitung per byte, sesuai kapasitas buffer firmware `char headerText[125]`).
- String kosong (`""`) valid -- berarti "belum diisi", BUKAN error. Firmware fallback ke "Slizebiz"
  saat kosong (di luar cakupan plan ini).
- `headerText` field opsional top-level di `LayoutConfigOut`, sejajar `schemaVersion`/`pages` --
  BUKAN properti per-halaman atau per-sel.
- **JANGAN commit ke folder utama repo (`~/Documents/shopee-analysis` tanpa suffix worktree) --
  SELALU kerja dan commit di worktree sesi ini
  (`~/Documents/shopee-analysis/.claude/worktrees/inspiring-turing-f985b5`, branch
  `claude/firmware-cyd-738640`).** Sebelum commit apa pun, jalankan `git branch --show-current` dan
  pastikan hasilnya `claude/firmware-cyd-738640`, BUKAN `master`. Repo ini adalah monorepo pnpm
  dengan aturan ketat: `git add <path spesifik>` saja, JANGAN `git add -A`/`git add .`.
- Sub-proyek B (firmware, repo terpisah `3pb-monitoring-display`) di-plan dan diimplementasikan
  TERPISAH setelah plan ini selesai & direview -- tidak ada task firmware di plan ini.
- Spec acuan: `docs/superpowers/specs/2026-08-05-cyd-header-marquee-saas-design.md` (repo ini).

---

### Task 1: Field `headerText` di schema + validasi (`packages/cyd-layout-schema`)

**Files:**
- Modify: `packages/cyd-layout-schema/src/types.ts:33-36` (interface `LayoutConfigOut`),
  `packages/cyd-layout-schema/src/types.ts:41-59` (const `LAYOUT_LIMITS`)
- Modify: `packages/cyd-layout-schema/src/validate.ts:112-126` (fungsi `validateLayoutConfig`)
- Test: `packages/cyd-layout-schema/src/validate.test.ts`

**Interfaces:**
- Consumes: tidak ada (task pertama, tidak bergantung task lain)
- Produces:
  - `LayoutConfigOut.headerText?: string` -- field baru, dipakai Task 2 (`config.headerText`)
  - `LAYOUT_LIMITS.headerTextMaxLength: 120` -- konstanta byte-limit, dipakai Task 2 (validasi FE +
    counter UI)
  - `validateLayoutConfig()` menolak `headerText` non-string atau >120 byte UTF-8, menerima
    absen/kosong/di bawah batas -- perilaku ini otomatis dipakai `saveLayout()`
    (`apps/saas/lib/cyd-layout/service.ts:43`) tanpa perubahan kode di sana

- [ ] **Step 1: Tambah field ke tipe `LayoutConfigOut` dan `LAYOUT_LIMITS`**

Di `packages/cyd-layout-schema/src/types.ts`, ubah:

```ts
export interface LayoutConfigOut {
  schemaVersion: 1
  pages: LayoutPageOut[]
}
```

menjadi:

```ts
export interface LayoutConfigOut {
  schemaVersion: 1
  headerText?: string
  pages: LayoutPageOut[]
}
```

Dan tambah satu baris di `LAYOUT_LIMITS` (setelah `maxPageIdLength: 15,`):

```ts
export const LAYOUT_LIMITS = {
  maxPages: 8,
  maxCellsPerPage: 24,
  maxGridRows: 8,
  maxFieldsPerRow: 3,
  maxRowsPerFieldsPageDefault: 8,
  maxRowsPerFieldsCellOverride: 3,
  maxPrinterIdLength: 23,
  maxPrinterModelLength: 11,
  maxLabelLength: 15,
  maxLabelTextLength: 31,
  maxPageIdLength: 15,
  // Batas teks header strip notif CYD (fitur marquee) -- byte UTF-8, cocok kapasitas buffer
  // firmware `char headerText[125]` (120 byte usable + null + margin kecil).
  headerTextMaxLength: 120,
} as const
```

- [ ] **Step 2: Tulis test yang gagal untuk validasi `headerText`**

Di `packages/cyd-layout-schema/src/validate.test.ts`, tambah di akhir file (setelah blok
`describe('validateLayoutConfig — batas panjang string (BARU)', ...)` yang sudah ada):

```ts
describe('validateLayoutConfig — headerText (BARU)', () => {
  it('headerText absen -> valid (opsional)', () => {
    const cfg = validConfig()
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(true)
  })

  it('headerText string kosong -> valid', () => {
    const cfg = { ...validConfig(), headerText: '' }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(true)
  })

  it('headerText bukan string -> invalid', () => {
    const cfg = { ...validConfig(), headerText: 123 }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('headerText persis 120 byte -> valid', () => {
    const cfg = { ...validConfig(), headerText: 'a'.repeat(120) }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(true)
  })

  it('headerText 121 byte -> invalid', () => {
    const cfg = { ...validConfig(), headerText: 'a'.repeat(121) }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('headerText multibyte (emoji) -- .length pendek tapi byte melebihi batas -> invalid', () => {
    // '🚀' = 2 UTF-16 code unit (.length menghitungnya 2) tapi 4 byte UTF-8.
    // 31 emoji: .length = 62 (jauh di bawah 120), byte = 124 (di atas 120). Test ini gagal kalau
    // implementasi salah pakai .length alih-alih Buffer.byteLength.
    const cfg = { ...validConfig(), headerText: '🚀'.repeat(31) }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run: `pnpm --filter @3pb/cyd-layout-schema test`
Expected: FAIL -- 6 test baru gagal (`headerText` belum dicek sama sekali, semua kasus yang
seharusnya `invalid` malah lolos `valid: true` karena field ini belum dibaca `validateLayoutConfig`).

- [ ] **Step 4: Implementasikan validasi minimal**

Di `packages/cyd-layout-schema/src/validate.ts`, ubah:

```ts
export function validateLayoutConfig(input: unknown): ValidationResult {
  if (!isPlainObject(input)) return { valid: false, error: 'config wajib berupa object' }
  if (input.schemaVersion !== 1) return { valid: false, error: 'schemaVersion wajib 1' }

  const pages = input.pages
```

menjadi:

```ts
export function validateLayoutConfig(input: unknown): ValidationResult {
  if (!isPlainObject(input)) return { valid: false, error: 'config wajib berupa object' }
  if (input.schemaVersion !== 1) return { valid: false, error: 'schemaVersion wajib 1' }

  if (input.headerText !== undefined) {
    if (typeof input.headerText !== 'string') return { valid: false, error: 'headerText wajib string' }
    if (Buffer.byteLength(input.headerText, 'utf8') > LAYOUT_LIMITS.headerTextMaxLength) {
      return { valid: false, error: `headerText melebihi batas ${LAYOUT_LIMITS.headerTextMaxLength} byte` }
    }
  }

  const pages = input.pages
```

(Sisa fungsi tidak berubah -- `pages`, loop `validatePage`, dan `return { valid: true, config: ... }`
di baris terakhir tetap seperti semula.)

- [ ] **Step 5: Jalankan test, pastikan semua lolos**

Run: `pnpm --filter @3pb/cyd-layout-schema test`
Expected: PASS -- seluruh file `validate.test.ts` hijau, termasuk 6 test baru dan semua test lama
(regresi nol terhadap validasi `pages`/`schemaVersion`/dll yang sudah ada).

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # WAJIB: pastikan hasilnya claude/firmware-cyd-738640, bukan master
git add packages/cyd-layout-schema/src/types.ts packages/cyd-layout-schema/src/validate.ts packages/cyd-layout-schema/src/validate.test.ts
git commit -m "feat(cyd-layout-schema): field headerText opsional (maks 120 byte) + validasi"
```

---

### Task 2: Input teks header di editor `/printer` (`apps/saas`)

**Files:**
- Modify: `apps/saas/components/printer/LayoutEditor.tsx`
- Test: `apps/saas/components/printer/LayoutEditor.test.tsx`

**Interfaces:**
- Consumes: `LayoutConfigOut.headerText?: string` dan `LAYOUT_LIMITS.headerTextMaxLength` dari Task 1
  (`@3pb/cyd-layout-schema`)
- Produces: tidak ada (task terakhir plan ini) -- perubahan `config.headerText` di client state
  otomatis ikut terkirim di body `PUT /api/cyd-layout` yang sudah ada (`handleSave()`,
  `LayoutEditor.tsx:232-259`, tidak diubah task ini) karena `config` di-`JSON.stringify` utuh.

- [ ] **Step 1: Tulis test yang gagal untuk field header text**

Di `apps/saas/components/printer/LayoutEditor.test.tsx`, tambah 2 test baru di akhir `describe("LayoutEditor", ...)` (setelah test `"render sel tersimpan, seleksi sel, ganti & tambah halaman, ..."` yang sudah ada, sebelum penutup `});` terakhir):

```tsx
  it("teks header: ter-render dari GET, bisa diedit, ikut terkirim di PUT", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          headerText: "Semangat pagi!",
          pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    render(<LayoutEditor devices={[]} />);

    const input = (await screen.findByLabelText(/teks header/i)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("Semangat pagi!"));

    fireEvent.change(input, { target: { value: "Kata baru" } });
    fireEvent.blur(input);

    fireEvent.click(screen.getByRole("button", { name: /^simpan$/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cyd-layout", expect.objectContaining({ method: "PUT" })));
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as { body: string }).body);
    expect(body.headerText).toBe("Kata baru");
  });

  it("teks header lebih dari 120 byte -> simpan ditolak di client, PUT tak terpanggil", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ schemaVersion: 1, pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [] }] }),
    });
    render(<LayoutEditor devices={[]} />);

    const input = (await screen.findByLabelText(/teks header/i)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a".repeat(121) } });
    fireEvent.blur(input);

    fireEvent.click(screen.getByRole("button", { name: /^simpan$/i }));
    await waitFor(() => expect(screen.getByText(/lebih dari 120 byte/i)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1); // cuma GET awal, PUT tak pernah terpanggil
  });
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `pnpm --filter @3pb/saas test -- LayoutEditor.test.tsx`
Expected: FAIL -- `screen.findByLabelText(/teks header/i)` timeout/melempar error karena belum ada
input dengan label itu di komponen.

- [ ] **Step 3: Tambah helper `utf8Length` dan komponen `HeaderTextField`**

Di `apps/saas/components/printer/LayoutEditor.tsx`, tambah setelah fungsi `defaultConfig()`
(sebelum `function isLayoutConfig(...)`):

```tsx
function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Input teks header dengan state lokal supaya counter/peringatan muncul saat mengetik (pola sama LabelTextField di CellSettingsPanel). */
function HeaderTextField({ value, onCommit }: { value: string; onCommit: (text: string) => void }) {
  const [text, setText] = useState(value);
  const byteLen = utf8Length(text);
  const tooLong = byteLen > LAYOUT_LIMITS.headerTextMaxLength;
  return (
    <label className="g-t2 block text-xs">
      Teks header (opsional)
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        placeholder='mis. "Semangat pagi! Cetak lancar hari ini"'
        className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
      />
      <span className={`mt-1 block text-[10px] leading-relaxed ${tooLong ? "text-red-500" : "g-t4"}`}>
        {byteLen}/{LAYOUT_LIMITS.headerTextMaxLength} byte{tooLong ? " — simpan akan ditolak." : ""}
      </span>
    </label>
  );
}
```

- [ ] **Step 4: Render `HeaderTextField` di layout, wire ke `config` state**

Di `apps/saas/components/printer/LayoutEditor.tsx`, cari blok ini (setelah baris status/message,
sebelum `<div className="mb-3"><PageTabs`):

```tsx
      {status === "saved" && !message && <p className="mb-2 text-[12px] text-emerald-600 dark:text-emerald-400">Layout tersimpan. CYD ambil versi baru saat sinkron berikutnya.</p>}
      {message && <p className={`mb-2 text-[12px] ${status === "error" ? "text-red-500" : "g-t4"}`}>{message}</p>}

      <div className="mb-3">
        <PageTabs
```

Ubah jadi (tambah 1 blok baru sebelum `<div className="mb-3"><PageTabs`):

```tsx
      {status === "saved" && !message && <p className="mb-2 text-[12px] text-emerald-600 dark:text-emerald-400">Layout tersimpan. CYD ambil versi baru saat sinkron berikutnya.</p>}
      {message && <p className={`mb-2 text-[12px] ${status === "error" ? "text-red-500" : "g-t4"}`}>{message}</p>}

      <div className="mb-3">
        <HeaderTextField
          value={config.headerText ?? ""}
          onCommit={(text) => setConfig((cfg) => ({ ...cfg, headerText: text }))}
        />
      </div>

      <div className="mb-3">
        <PageTabs
```

- [ ] **Step 5: Tambah pengecekan `headerText` di `findLayoutProblem` (validasi FE sebelum PUT)**

Di `apps/saas/components/printer/LayoutEditor.tsx`, cari:

```tsx
export function findLayoutProblem(config: LayoutConfigOut): string | null {
  if (config.pages.length > LAYOUT_LIMITS.maxPages) return `Maksimal ${LAYOUT_LIMITS.maxPages} halaman.`;
```

Ubah jadi:

```tsx
export function findLayoutProblem(config: LayoutConfigOut): string | null {
  if (config.headerText !== undefined && utf8Length(config.headerText) > LAYOUT_LIMITS.headerTextMaxLength) {
    return `Teks header lebih dari ${LAYOUT_LIMITS.headerTextMaxLength} byte.`;
  }
  if (config.pages.length > LAYOUT_LIMITS.maxPages) return `Maksimal ${LAYOUT_LIMITS.maxPages} halaman.`;
```

(Sisa fungsi `findLayoutProblem` tidak berubah.)

- [ ] **Step 6: Jalankan test, pastikan semua lolos**

Run: `pnpm --filter @3pb/saas test -- LayoutEditor.test.tsx`
Expected: PASS -- semua test di file ini hijau, termasuk 2 test baru dan 3 test lama yang sudah ada
(regresi nol -- render awal, tombol simpan, seleksi sel/halaman/PUT body semua tetap jalan).

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # WAJIB: pastikan hasilnya claude/firmware-cyd-738640, bukan master
git add apps/saas/components/printer/LayoutEditor.tsx apps/saas/components/printer/LayoutEditor.test.tsx
git commit -m "feat(saas): input teks header CYD di editor /printer (maks 120 byte)"
```

---

## Catatan implementasi (bukan task terpisah, konfirmasi sebelum selesai)

- `apps/saas/lib/cyd-layout/service.ts`, `apps/saas/app/api/cyd-layout/route.ts`, dan
  `apps/agent/src/main/layout-publisher.ts` **TIDAK disentuh sama sekali** oleh plan ini -- ketiganya
  sudah generic terhadap `LayoutConfigOut` (lihat spec §5, §7). Kalau task-implementer merasa perlu
  mengubah salah satu file ini, itu tanda ada penyimpangan dari desain -- STOP dan tanya, jangan
  lanjut.
- Prisma schema (`apps/saas/prisma/schema.prisma`) **TIDAK berubah** -- `CydLayout.config` sudah
  kolom `Json` tunggal (lihat spec §4). Tidak ada `db:push`/migration di plan ini.
