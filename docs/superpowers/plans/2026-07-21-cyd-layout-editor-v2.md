# CYD Layout Editor v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti editor `/cyd-layout` v1 (dropdown per slot rak tetap) jadi page-builder visual interaktif — grid custom per halaman, drag-and-drop printer & label, resize baris/sel, canvas yang render akurat menyerupai CYD asli. Sekalian tambah status-live (state/progress) di halaman Produk→Filamen→Printer, satu sumber data dengan palette editor.

**Architecture:** State editor React = representasi langsung schema `LayoutConfig` firmware (bukan lagi `assignment` datar). `Printer.slug` (Prisma, baru) jadi identitas printer bersama antara tabel `Printer` dan id stabil MQTT `3dpb/printers`. Satu fungsi `getPrintersWithLiveStatus()` gabung tabel `Printer` + retained MQTT, dipakai bareng oleh palette editor dan halaman Produk→Printer. Drag-and-drop pakai `@dnd-kit/core` (sudah ada di `package.json`, dipakai pola `useDraggable`/`useDroppable` — beda dari `SortableList.tsx` yang pakai preset `sortable` buat reorder list, di sini butuh 2D grid placement bebas).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7 + PostgreSQL, TanStack Query v5, `@dnd-kit/core` (sudah terinstall), Vitest.

## Global Constraints

- **Repo & app:** semua path di bawah relatif ke `apps/dashboard/` di monorepo `shopee-analysis` (pnpm workspace), kecuali disebut lain.
- **Node 22 wajib:** `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum command shell apa pun.
- **Dashboard auth pattern (existing, wajib diikuti persis):** tiap API route diawali `const session = await auth(); if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`.
- **Prisma client:** import `{ prisma }` dari `@/lib/db` (singleton sudah ada, jangan `new PrismaClient()` langsung).
- **Testing convention (existing, wajib diikuti — JANGAN dibuat baru):**
  - File `lib/**/*.ts` (logic murni, tanpa JSX): Vitest biasa (`describe`/`it`/`expect` dari `'vitest'`), lihat `lib/cyd-layout/__tests__/build-config.test.ts` existing.
  - Komponen presentasional statis (`.tsx`, tanpa interaktivitas kompleks): Vitest + `renderToStaticMarkup` dari `'react-dom/server'` (cek HTML string output) — lihat `components/layout/__tests__/PageShell.test.tsx`. **TIDAK ADA** `@testing-library/react`/jsdom di project ini — jangan coba install/pakai, ikuti pola `renderToStaticMarkup` yang sudah ada.
  - Komponen interaktif (drag-and-drop, resize, state kompleks — `GridCanvas.tsx`, `PrinterPalette.tsx`, halaman `page.tsx`): **tidak ada automated test** — verifikasi manual di browser (`pnpm --filter shopee-dashboard dev`, buka halaman, coba interaksi). Ini konvensi existing project, bukan penyederhanaan yang dipilih plan ini.
- **`LayoutConfig` JSON schema (firmware, TIDAK BOLEH diubah):** `{ schemaVersion: 1, pages: LayoutPage[] }`. `LayoutPage = { id: string, grid: { cols: number, rows: number, rowWeights?: number[] }, fields: FieldRow[], durationSec: number, cells: LayoutCell[] }`. `LayoutCell` = printer cell `{ printer: string, col: number, row: number, colSpan?: number, rowSpan?: number, fields?: FieldRow[] }` ATAU label cell `{ type: 'label', text: string, col: number, row: number, colSpan?: number, rowSpan?: number }`. `FieldRow = (FieldId | { id: FieldId, label?: string })[]`. `FieldId` = `'name' | 'type' | 'state' | 'progress' | 'progressBar' | 'timeLeft' | 'eta' | 'filename' | 'error'`. Batas: max 8 halaman, max 24 cell/halaman, max 3 field/baris, max 8 baris field (default halaman) / max 3 baris field (override per-cell) — cocok `MAX_PAGES`/`MAX_CELLS_PER_PAGE`/`MAX_FIELDS_PER_ROW`/`MAX_ROWS_PER_FIELDS`/`MAX_CELL_FIELD_ROWS` di `layout_types.h` firmware (`~/Documents/Project/3pb-monitoring-display/apps/internal/src/layout/layout_types.h`) — TIDAK di-hardcode ulang di plan ini, cukup dicatat sebagai batas validasi.
- **Kolom grid SELALU rata lebar** — firmware tidak support `colWeights`. Baris BISA tak-rata (`rowWeights`, jumlah harus sama dengan `grid.rows`, sum > 0).
- **Warna canvas (persis dari firmware `display.h`, `~/Documents/Project/3pb-monitoring-display/apps/internal/src/display.h` dan `stateColor()` di `src/screens/printers.cpp`):**
  ```
  C_BG = '#0a0a0f'; C_GREEN = '#00ff88'; C_YELLOW = '#ffaa00'; C_RED = '#ff0000';
  C_ORANGE = '#ffa726'; C_PURPLE = '#9c6bff'; C_TEAL = '#4cc978'; C_SKYBLUE = '#4c9aff';
  C_PINK = '#ff6b9c'; C_DIM = 'rgb(156,154,152)';
  STATE_COLOR: RUNNING/PRINT -> C_GREEN, ERROR -> C_RED, FINISH -> 'rgb(0,160,255)',
               PAUSE/PAUSED -> C_YELLOW, default -> C_DIM
  ```
- **MQTT:** broker default `mqtt://192.168.88.113:1883` (env `MQTT_BROKER_URL` override). Topik: printer status `3dpb/printers` (retained, payload `{"payload":[{"id":"jupiter","name":"Jupiter","type":"X1C","state":"finish","progress":100,"remaining_min":0,"filename":"...","error_msg":"...","last_seen":"..."}]}` — `state` di MQTT lowercase, firmware `stateColor()` expects UPPERCASE, ikuti konvensi existing `parsePrintersJson` di firmware yang uppercase-kan sebelum match). Layout config `3dpb/cyd/internal-rack/layout`, readback `3dpb/cyd/internal-rack/layout/current`.
- **Field preset (persis dari `build-config.ts` v1, dipertahankan sebagai konstanta):**
  ```ts
  RINGKAS: FieldRow[] = [['name'], ['state', 'progress'], ['progressBar']]
  DETAIL: FieldRow[] = [['name', 'type'], ['state', 'progress'], ['progressBar'],
                         [{ id: 'timeLeft', label: 'Sisa' }, { id: 'eta', label: 'ETA' }], ['filename']]
  ```

---

### Task 1: `Printer.slug` — kolom baru, slugify util, backfill script

**Files:**
- Modify: `prisma/schema.prisma` (`model Printer`)
- Create: `lib/utils/slugify.ts`
- Test: `lib/utils/__tests__/slugify.test.ts`
- Create: `scripts/backfill-printer-slug.ts`

**Interfaces:**
- Consumes: nothing (task pertama, foundational).
- Produces: `slugify(input: string): string` (dipakai Task 3's `printer-service.ts`). Kolom `Printer.slug` (nullable di step ini — jadi required di Task 3 setelah backfill dijalankan manual oleh user, DI LUAR scope task otomatis ini karena butuh verifikasi manual per-baris per Global Constraints spec `docs/superpowers/specs/2026-07-21-cyd-layout-editor-v2-design.md` §6).

- [ ] **Step 1: Tulis test `slugify`**

```ts
// lib/utils/__tests__/slugify.test.ts
import { describe, it, expect } from 'vitest'
import { slugify } from '../slugify'

describe('slugify', () => {
  it('lowercase dan ganti spasi jadi tanpa spasi', () => {
    expect(slugify('Jupiter')).toBe('jupiter')
    expect(slugify('X1C Printer')).toBe('x1c-printer')
  })

  it('buang karakter non alfanumerik selain dash', () => {
    expect(slugify('Mars (P1P) #1')).toBe('mars-p1p-1')
  })

  it('collapse multiple dash jadi satu, trim dash di ujung', () => {
    expect(slugify('  --Neptune--  ')).toBe('neptune')
  })
})
```

- [ ] **Step 2: Run test, verifikasi gagal**

Run: `cd apps/dashboard && pnpm vitest run lib/utils/__tests__/slugify.test.ts`
Expected: FAIL — `Cannot find module '../slugify'`

- [ ] **Step 3: Implementasi `slugify`**

```ts
// lib/utils/slugify.ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
```

- [ ] **Step 4: Run test, verifikasi lulus**

Run: `cd apps/dashboard && pnpm vitest run lib/utils/__tests__/slugify.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Tambah kolom `slug` ke Prisma schema (nullable dulu)**

Edit `prisma/schema.prisma`, `model Printer`:

```prisma
model Printer {
  id        String   @id @default(cuid())
  slug      String?  @unique
  name      String
  model     String   @default("")
  isActive  Boolean  @default(true)
  notes     String   @default("")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Run: `cd apps/dashboard && npx prisma migrate dev --name add_printer_slug`
Expected: migration file baru dibuat di `prisma/migrations/`, `slug` kolom nullable+unique ditambahkan, tidak ada data existing yang error (nullable jadi aman).

- [ ] **Step 6: Tulis script backfill (dry-run by default)**

```ts
// scripts/backfill-printer-slug.ts
// Usage: pnpm tsx scripts/backfill-printer-slug.ts          -> dry-run, cuma print
//        pnpm tsx scripts/backfill-printer-slug.ts --apply  -> beneran tulis ke DB
//
// PENTING: slug HARUS match persis id yang sudah dipublish printer-monitor-core
// ke topik MQTT 3dpb/printers (lihat services/printer-monitor/config.json di
// repo terpisah) — kalau meleset, printer tampil kosong di CYD (lihat spec
// docs/superpowers/specs/2026-07-21-cyd-layout-editor-v2-design.md §5).
// Verifikasi manual tiap baris print sebelum jalankan --apply.
import { prisma } from '../lib/db'
import { slugify } from '../lib/utils/slugify'

async function main() {
  const apply = process.argv.includes('--apply')
  const printers = await prisma.printer.findMany({ where: { slug: null } })

  if (printers.length === 0) {
    console.log('Semua printer sudah punya slug.')
    return
  }

  console.log(`${printers.length} printer belum punya slug:\n`)
  for (const p of printers) {
    const proposed = slugify(p.name)
    console.log(`  ${p.name.padEnd(20)} -> ${proposed}`)
  }

  if (!apply) {
    console.log('\nDry-run selesai. Verifikasi manual daftar di atas cocok dengan')
    console.log('id MQTT 3dpb/printers (mosquitto_sub -t 3dpb/printers), baru jalankan:')
    console.log('  pnpm tsx scripts/backfill-printer-slug.ts --apply')
    return
  }

  for (const p of printers) {
    await prisma.printer.update({ where: { id: p.id }, data: { slug: slugify(p.name) } })
  }
  console.log(`\n${printers.length} printer di-update.`)
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 7: Commit**

```bash
cd apps/dashboard
git add prisma/schema.prisma prisma/migrations lib/utils/slugify.ts lib/utils/__tests__/slugify.test.ts scripts/backfill-printer-slug.ts
git commit -m "feat(printer): tambah kolom Printer.slug (nullable) + slugify util + script backfill dry-run"
```

**Catatan buat controller (bukan bagian otomatis task ini):** setelah semua task implementasi selesai, jalankan `pnpm tsx scripts/backfill-printer-slug.ts` (dry-run), user verifikasi manual daftar slug vs id MQTT `3dpb/printers`, baru `--apply`. JANGAN jalankan `--apply` sebagai bagian dari task ini.

---

### Task 2: `getPrintersWithLiveStatus()` + `/api/printers/live`

**Files:**
- Create: `lib/printers/live-status.ts`
- Test: `lib/printers/__tests__/live-status.test.ts`
- Create: `app/api/printers/live/route.ts`

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db`, `readRetained` dari `@/lib/cyd-layout/mqtt-client` (sudah ada, signature `readRetained(topic: string, timeoutMs?: number): Promise<string | null>`).
- Produces: `getPrintersWithLiveStatus(): Promise<PrinterWithLiveStatus[]>` dan tipe `PrinterWithLiveStatus` — dipakai Task 3 (PrinterTab), Task 6 (`/api/cyd-layout/printers`), Task 7 (palette).

- [ ] **Step 1: Tulis test `getPrintersWithLiveStatus`**

```ts
// lib/printers/__tests__/live-status.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: { printer: { findMany: vi.fn() } },
}))
vi.mock('@/lib/cyd-layout/mqtt-client', () => ({
  readRetained: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { readRetained } from '@/lib/cyd-layout/mqtt-client'
import { getPrintersWithLiveStatus } from '../live-status'

describe('getPrintersWithLiveStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gabung printer DB dengan status MQTT by slug', async () => {
    vi.mocked(prisma.printer.findMany).mockResolvedValue([
      { id: 'c1', slug: 'jupiter', name: 'Jupiter', model: 'X1C', notes: '', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ] as never)
    vi.mocked(readRetained).mockResolvedValue(JSON.stringify({
      payload: [{ id: 'jupiter', name: 'Jupiter', type: 'X1C', state: 'running', progress: 42, remaining_min: 30, filename: 'x.gcode', error_msg: '', last_seen: '2026-01-01' }],
    }))

    const result = await getPrintersWithLiveStatus()

    expect(result).toEqual([
      { id: 'c1', slug: 'jupiter', name: 'Jupiter', model: 'X1C', notes: '', live: { state: 'running', progress: 42, remainingMin: 30 } },
    ])
  })

  it('printer DB tanpa slug match di MQTT -> live: null (bukan error)', async () => {
    vi.mocked(prisma.printer.findMany).mockResolvedValue([
      { id: 'c1', slug: 'venus', name: 'Venus', model: '', notes: '', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ] as never)
    vi.mocked(readRetained).mockResolvedValue(JSON.stringify({ payload: [] }))

    const result = await getPrintersWithLiveStatus()
    expect(result).toEqual([{ id: 'c1', slug: 'venus', name: 'Venus', model: '', notes: '', live: null }])
  })

  it('printer DB dengan slug null -> live: null, tak crash', async () => {
    vi.mocked(prisma.printer.findMany).mockResolvedValue([
      { id: 'c1', slug: null, name: 'Belum Diisi', model: '', notes: '', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ] as never)
    vi.mocked(readRetained).mockResolvedValue(JSON.stringify({ payload: [{ id: 'jupiter', name: 'Jupiter', type: '', state: 'running', progress: 1, remaining_min: 1, filename: '', error_msg: '', last_seen: '' }] }))

    const result = await getPrintersWithLiveStatus()
    expect(result).toEqual([{ id: 'c1', slug: null, name: 'Belum Diisi', model: '', notes: '', live: null }])
  })

  it('MQTT tak reachable (readRetained null) -> semua printer live: null, tak throw', async () => {
    vi.mocked(prisma.printer.findMany).mockResolvedValue([
      { id: 'c1', slug: 'jupiter', name: 'Jupiter', model: '', notes: '', isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ] as never)
    vi.mocked(readRetained).mockResolvedValue(null)

    const result = await getPrintersWithLiveStatus()
    expect(result).toEqual([{ id: 'c1', slug: 'jupiter', name: 'Jupiter', model: '', notes: '', live: null }])
  })

  it('cuma ambil printer isActive (filter di query)', async () => {
    vi.mocked(prisma.printer.findMany).mockResolvedValue([])
    vi.mocked(readRetained).mockResolvedValue(JSON.stringify({ payload: [] }))

    await getPrintersWithLiveStatus()
    expect(prisma.printer.findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { name: 'asc' } })
  })
})
```

- [ ] **Step 2: Run test, verifikasi gagal**

Run: `cd apps/dashboard && pnpm vitest run lib/printers/__tests__/live-status.test.ts`
Expected: FAIL — `Cannot find module '../live-status'`

- [ ] **Step 3: Implementasi**

```ts
// lib/printers/live-status.ts
import { prisma } from '@/lib/db'
import { readRetained } from '@/lib/cyd-layout/mqtt-client'

export interface LivePrinterStatus {
  state: string
  progress: number
  remainingMin: number
}

export interface PrinterWithLiveStatus {
  id: string
  slug: string | null
  name: string
  model: string
  notes: string
  live: LivePrinterStatus | null
}

interface MqttPrinterEntry {
  id: string
  state: string
  progress: number
  remaining_min: number
}

export async function getPrintersWithLiveStatus(): Promise<PrinterWithLiveStatus[]> {
  const printers = await prisma.printer.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })

  const liveById = new Map<string, LivePrinterStatus>()
  const raw = await readRetained('3dpb/printers')
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { payload: MqttPrinterEntry[] }
      for (const entry of parsed.payload) {
        liveById.set(entry.id, { state: entry.state, progress: entry.progress, remainingMin: entry.remaining_min })
      }
    } catch {
      // MQTT payload korup/tak terduga -> treat sebagai tak ada data live, jangan crash
    }
  }

  return printers.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    model: p.model,
    notes: p.notes,
    live: p.slug ? (liveById.get(p.slug) ?? null) : null,
  }))
}
```

- [ ] **Step 4: Run test, verifikasi lulus**

Run: `cd apps/dashboard && pnpm vitest run lib/printers/__tests__/live-status.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: API route**

```ts
// app/api/printers/live/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPrintersWithLiveStatus } from '@/lib/printers/live-status'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const printers = await getPrintersWithLiveStatus()
  return NextResponse.json(printers)
}
```

- [ ] **Step 6: Commit**

```bash
cd apps/dashboard
git add lib/printers app/api/printers
git commit -m "feat(printers): getPrintersWithLiveStatus — gabung tabel Printer + status MQTT by slug, endpoint /api/printers/live"
```

---

### Task 3: Status badge/progress bar + wire ke `PrinterTab.tsx` + field slug

**Files:**
- Create: `components/printers/PrinterStatusBadge.tsx`
- Test: `components/printers/__tests__/PrinterStatusBadge.test.tsx`
- Create: `components/printers/PrinterProgressBar.tsx`
- Modify: `lib/filamen/types.ts` (`PrinterData` tambah `slug`)
- Modify: `lib/filamen/printer-service.ts` (slug di response, auto-generate saat create pakai `slugify`)
- Modify: `app/api/filamen/printers/route.ts` (tak berubah signature, cuma ikut return slug via service)
- Modify: `components/filamen/PrinterTab.tsx` (tampilkan slug + badge status + progress bar, pakai `usePrintersLive` hook baru)
- Modify: `lib/hooks/use-filamen.ts` (tambah `usePrintersLive`)

**Interfaces:**
- Consumes: `slugify` (Task 1), `getPrintersWithLiveStatus`/`PrinterWithLiveStatus` (Task 2, via `/api/printers/live`).
- Produces: `<PrinterStatusBadge state={string|null} />`, `<PrinterProgressBar progress={number} state={string} />` — dipakai lagi di Task 7 (`PrinterPalette.tsx`).

- [ ] **Step 1: Tulis test `PrinterStatusBadge`**

```tsx
// components/printers/__tests__/PrinterStatusBadge.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PrinterStatusBadge } from '../PrinterStatusBadge'

describe('PrinterStatusBadge', () => {
  it('state null -> tampilkan "Offline", warna dim', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state={null} />)
    expect(html).toContain('Offline')
    expect(html).toContain('rgb(156,154,152)')
  })

  it('RUNNING -> hijau', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state="running" />)
    expect(html).toContain('#00ff88')
  })

  it('ERROR -> merah', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state="error" />)
    expect(html).toContain('#ff0000')
  })

  it('FINISH -> biru rgb(0,160,255)', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state="finish" />)
    expect(html).toContain('rgb(0,160,255)')
  })

  it('PAUSE -> kuning', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state="pause" />)
    expect(html).toContain('#ffaa00')
  })

  it('state tak dikenal -> dim (default)', () => {
    const html = renderToStaticMarkup(<PrinterStatusBadge state="unknown_state" />)
    expect(html).toContain('rgb(156,154,152)')
  })
})
```

- [ ] **Step 2: Run test, verifikasi gagal**

Run: `cd apps/dashboard && pnpm vitest run components/printers/__tests__/PrinterStatusBadge.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implementasi `stateColor` shared + `PrinterStatusBadge` + `PrinterProgressBar`**

Perhatikan: warna ini akan dipakai lagi persis di Task 4 (`lib/cyd-layout/colors.ts`) buat canvas. Definisikan sekali di `lib/cyd-layout/colors.ts` supaya tak duplikat — tapi Task 4 belum jalan di titik ini, jadi Task 3 mendefinisikan versi awal, Task 4 nanti IMPORT dari sini (bukan sebaliknya) supaya urutan dependency task tetap linear.

```ts
// lib/cyd-layout/colors.ts
// Warna persis dari firmware ~/Documents/Project/3pb-monitoring-display/apps/internal/src/display.h
// dan stateColor() di src/screens/printers.cpp — JANGAN diubah tanpa cross-check firmware.
export const CYD_COLORS = {
  bg: '#0a0a0f',
  green: '#00ff88',
  yellow: '#ffaa00',
  red: '#ff0000',
  orange: '#ffa726',
  purple: '#9c6bff',
  teal: '#4cc978',
  skyblue: '#4c9aff',
  pink: '#ff6b9c',
  dim: 'rgb(156,154,152)',
  finish: 'rgb(0,160,255)',
} as const

export function stateColor(state: string | null | undefined): string {
  const s = (state ?? '').toUpperCase()
  if (s === 'RUNNING' || s === 'PRINT') return CYD_COLORS.green
  if (s === 'ERROR') return CYD_COLORS.red
  if (s === 'FINISH') return CYD_COLORS.finish
  if (s === 'PAUSE' || s === 'PAUSED') return CYD_COLORS.yellow
  return CYD_COLORS.dim
}
```

```tsx
// components/printers/PrinterStatusBadge.tsx
import { stateColor, CYD_COLORS } from '@/lib/cyd-layout/colors'

export function PrinterStatusBadge({ state }: { state: string | null }) {
  const label = state ? state.toUpperCase() : 'OFFLINE'
  const color = state ? stateColor(state) : CYD_COLORS.dim
  return (
    <span
      className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
      style={{ color, borderColor: color }}
    >
      {label}
    </span>
  )
}
```

```tsx
// components/printers/PrinterProgressBar.tsx
import { stateColor } from '@/lib/cyd-layout/colors'

export function PrinterProgressBar({ progress, state }: { progress: number; state: string | null }) {
  const color = stateColor(state)
  const pct = Math.max(0, Math.min(100, progress))
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}
```

- [ ] **Step 4: Run test, verifikasi lulus**

Run: `cd apps/dashboard && pnpm vitest run components/printers/__tests__/PrinterStatusBadge.test.tsx`
Expected: PASS (6/6)

- [ ] **Step 5: `PrinterData` tambah `slug`, `printer-service.ts` auto-generate slug saat create**

Edit `lib/filamen/types.ts`, tambah field ke interface existing:

```ts
export interface PrinterData {
  id: string
  slug: string | null
  name: string
  model: string
  isActive: boolean
  notes: string
  createdAt: string
  updatedAt: string
}
```

Edit `lib/filamen/printer-service.ts` — import `slugify`, tambah `slug` ke `toResponse` dan `createPrinter`:

```ts
import { prisma } from '@/lib/db'
import { slugify } from '@/lib/utils/slugify'

export interface PrinterData {
  id: string
  slug: string | null
  name: string
  model: string
  isActive: boolean
  notes: string
  createdAt: string
  updatedAt: string
}

export interface PrinterInput {
  name: string
  model?: string
  isActive?: boolean
  notes?: string
  slug?: string
}

function toResponse(p: { id: string; slug: string | null; name: string; model: string; isActive: boolean; notes: string; createdAt: Date; updatedAt: Date }): PrinterData {
  return { ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() }
}

export async function listPrinters(): Promise<PrinterData[]> {
  const printers = await prisma.printer.findMany({ orderBy: { name: 'asc' } })
  return printers.map(toResponse)
}

export async function createPrinter(input: PrinterInput): Promise<PrinterData> {
  const printer = await prisma.printer.create({
    data: {
      name: input.name.trim(),
      slug: input.slug?.trim() || slugify(input.name),
      model: input.model?.trim() ?? '',
      isActive: input.isActive ?? true,
      notes: input.notes?.trim() ?? '',
      updatedAt: new Date(),
    },
  })
  return toResponse(printer)
}

export async function updatePrinter(id: string, input: Partial<PrinterInput>): Promise<PrinterData> {
  const printer = await prisma.printer.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.slug !== undefined && { slug: input.slug.trim() || null }),
      ...(input.model !== undefined && { model: input.model.trim() }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.notes !== undefined && { notes: input.notes.trim() }),
      updatedAt: new Date(),
    },
  })
  return toResponse(printer)
}

export async function deletePrinter(id: string): Promise<void> {
  await prisma.printer.delete({ where: { id } })
}
```

`app/api/filamen/printers/route.ts` dan `[id]/route.ts` **tidak perlu diubah** — sudah generic lewat `input`/`body` passthrough ke service.

- [ ] **Step 6: Tambah `usePrintersLive` hook**

Edit `lib/hooks/use-filamen.ts`, tambah setelah blok Printer existing:

```ts
// ── Printer live status (gabungan DB + MQTT, dipakai PrinterTab dan CYD palette) ──
const PRINTERS_LIVE_KEY = ['printers', 'live'] as const

async function fetchPrintersLive() {
  const res = await fetch('/api/printers/live')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function usePrintersLive() {
  return useQuery({ queryKey: PRINTERS_LIVE_KEY, queryFn: fetchPrintersLive, refetchInterval: 15000 })
}
```

- [ ] **Step 7: Wire ke `PrinterTab.tsx`**

Edit `components/filamen/PrinterTab.tsx` — tambah import, panggil `usePrintersLive()`, render badge+progress di baris list (bagian non-editing), dan tampilkan `slug` di bawah nama:

```tsx
"use client"

import { useState } from "react"
import { usePrinters, useCreatePrinter, useUpdatePrinter, useDeletePrinter, usePrintersLive } from "@/lib/hooks/use-filamen"
import type { PrinterData } from "@/lib/filamen/types"
import { PrinterStatusBadge } from "@/components/printers/PrinterStatusBadge"
import { PrinterProgressBar } from "@/components/printers/PrinterProgressBar"

export function PrinterTab() {
  const { data: printers, isLoading } = usePrinters()
  const { data: liveData } = usePrintersLive()
  const createPrinter = useCreatePrinter()
  const updatePrinter = useUpdatePrinter()
  const deletePrinter = useDeletePrinter()

  const liveBySlug = new Map((liveData ?? []).map((p: { slug: string | null; live: unknown }) => [p.slug, p.live]))

  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: "", model: "", notes: "" })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<PrinterData>>({})
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!form.name.trim()) { setError("Nama printer wajib diisi"); return }
    setError(null)
    try {
      await createPrinter.mutateAsync(form)
      setForm({ name: "", model: "", notes: "" })
      setShowAdd(false)
    } catch { setError("Gagal tambah printer") }
  }

  async function handleUpdate(id: string) {
    try {
      await updatePrinter.mutateAsync({ id, ...editForm })
      setEditingId(null)
    } catch { setError("Gagal update printer") }
  }

  async function handleToggle(p: PrinterData) {
    await updatePrinter.mutateAsync({ id: p.id, isActive: !p.isActive })
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus printer ini?")) return
    await deletePrinter.mutateAsync(id)
  }

  if (isLoading) return <div className="text-gray-400 dark:text-slate-500 py-8 text-center">Memuat printer...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-slate-400">Daftar printer yang digunakan untuk produksi</p>
        <button
          onClick={() => { setShowAdd(true); setError(null) }}
          className="bg-[#EE4D2D] dark:bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-[#d44226] dark:hover:bg-indigo-700"
        >
          + Tambah Printer
        </button>
      </div>

      {showAdd && (
        <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-gray-50 dark:bg-slate-900 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-slate-200">Printer Baru</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block" htmlFor="add-name">Nama *</label>
              <input id="add-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. X1C #1" className="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block" htmlFor="add-model">Model</label>
              <input id="add-model" value={form.model} onChange={(e) => setForm(f => ({ ...f, model: e.target.value }))}
                placeholder="e.g. X1C, P1S" className="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block" htmlFor="add-notes">Catatan</label>
            <input id="add-notes" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Opsional" className="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={createPrinter.isPending}
              className="bg-[#EE4D2D] dark:bg-indigo-600 text-white text-sm px-4 py-1.5 rounded-md hover:bg-[#d44226] dark:hover:bg-indigo-700 disabled:opacity-50">
              Simpan
            </button>
            <button onClick={() => { setShowAdd(false); setError(null) }}
              className="text-sm text-gray-500 dark:text-slate-400 px-4 py-1.5 rounded-md border border-gray-300 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700">
              Batal
            </button>
          </div>
        </div>
      )}

      {!printers || printers.length === 0 ? (
        <div className="text-gray-400 dark:text-slate-500 text-sm text-center py-8">Belum ada printer.</div>
      ) : (
        <div className="space-y-2">
          {printers.map((p: PrinterData) => {
            const live = p.slug ? liveBySlug.get(p.slug) as { state: string; progress: number } | null | undefined : null
            return (
            <div key={p.id} className={`border rounded-lg p-4 bg-white dark:bg-slate-800 ${p.isActive ? "border-gray-200 dark:border-slate-700" : "border-gray-100 dark:border-slate-700 opacity-60"}`}>
              {editingId === p.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={editForm.name ?? p.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                      className="border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100" placeholder="Nama" />
                    <input value={editForm.model ?? p.model} onChange={(e) => setEditForm(f => ({ ...f, model: e.target.value }))}
                      className="border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100" placeholder="Model" />
                  </div>
                  <input value={editForm.slug ?? p.slug ?? ""} onChange={(e) => setEditForm(f => ({ ...f, slug: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 font-mono" placeholder="slug (id CYD/MQTT, mis. jupiter)" />
                  <input value={editForm.notes ?? p.notes} onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100" placeholder="Catatan" />
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(p.id)} className="text-sm bg-[#EE4D2D] dark:bg-indigo-600 text-white px-3 py-1 rounded hover:bg-[#d44226] dark:hover:bg-indigo-700">Simpan</button>
                    <button onClick={() => setEditingId(null)} className="text-sm text-gray-500 dark:text-slate-400 px-3 py-1 rounded border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700">Batal</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800 dark:text-slate-100">{p.name}
                        {p.model && <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">{p.model}</span>}
                      </p>
                      <PrinterStatusBadge state={live?.state ?? null} />
                    </div>
                    {p.slug && <p className="text-[10px] font-mono text-gray-400 dark:text-slate-500 mt-0.5">{p.slug}</p>}
                    {p.notes && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{p.notes}</p>}
                    {live && (
                      <div className="mt-1.5 max-w-[160px]">
                        <PrinterProgressBar progress={live.progress} state={live.state} />
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleToggle(p)}
                    className={`text-xs px-2 py-1 rounded-full border ${p.isActive ? "border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30" : "border-gray-300 dark:border-slate-600 text-gray-400 dark:text-slate-500"}`}>
                    {p.isActive ? "Aktif" : "Nonaktif"}
                  </button>
                  <button onClick={() => { setEditingId(p.id); setEditForm({}) }}
                    className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 px-2 py-1">Edit</button>
                  <button onClick={() => handleDelete(p.id)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1">Hapus</button>
                </div>
              )}
            </div>
          )})}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Build check**

Run: `cd apps/dashboard && pnpm build`
Expected: build sukses, tidak ada TypeScript error dari perubahan ini (kalau ada error stale-Prisma-client seperti pernah terjadi sesi ini, jalankan `npx prisma generate` dulu lalu build ulang — bukan bug dari perubahan ini).

- [ ] **Step 9: Commit**

```bash
cd apps/dashboard
git add lib/filamen lib/hooks/use-filamen.ts components/filamen/PrinterTab.tsx components/printers app/api/filamen
git commit -m "feat(printer-tab): tampilkan slug + badge status live + progress bar di Produk->Filamen->Printer"
```

---

### Task 4: `lib/cyd-layout/types.ts` — tipe LayoutConfig + FIELD_PRESETS

**Files:**
- Create: `lib/cyd-layout/types.ts`

**Interfaces:**
- Consumes: `CYD_COLORS`/`stateColor` (Task 3, sudah ada di `lib/cyd-layout/colors.ts`).
- Produces: semua tipe (`FieldId`, `FieldEntry`, `FieldRow`, `LayoutCellOut`, `LayoutPageOut`, `LayoutConfigOut`) dan `FIELD_PRESETS` — dipakai Task 5 (build-config), Task 8-10 (GridCanvas), Task 11 (page.tsx).

Task ini murni tipe TypeScript + 1 konstanta objek — tidak ada logic untuk di-unit-test terpisah (akan tervalidasi lewat penggunaan di Task 5's test).

- [ ] **Step 1: Tulis file**

```ts
// lib/cyd-layout/types.ts
export type FieldId = 'name' | 'type' | 'state' | 'progress' | 'progressBar' | 'timeLeft' | 'eta' | 'filename' | 'error'

export type FieldEntry = FieldId | { id: FieldId; label?: string }
export type FieldRow = FieldEntry[]

export interface LayoutCellPrinterOut {
  printer: string
  col: number
  row: number
  colSpan?: number
  rowSpan?: number
  fields?: FieldRow[]
}

export interface LayoutCellLabelOut {
  type: 'label'
  text: string
  col: number
  row: number
  colSpan?: number
  rowSpan?: number
}

export type LayoutCellOut = LayoutCellPrinterOut | LayoutCellLabelOut

export interface LayoutPageOut {
  id: string
  grid: { cols: number; rows: number; rowWeights?: number[] }
  fields: FieldRow[]
  durationSec: number
  cells: LayoutCellOut[]
}

export interface LayoutConfigOut {
  schemaVersion: 1
  pages: LayoutPageOut[]
}

// Persis dari build-config.ts v1 — dipertahankan sebagai preset field per-sel/per-halaman.
export const FIELD_PRESETS = {
  ringkas: [['name'], ['state', 'progress'], ['progressBar']] as FieldRow[],
  detail: [
    ['name', 'type'],
    ['state', 'progress'],
    ['progressBar'],
    [{ id: 'timeLeft', label: 'Sisa' }, { id: 'eta', label: 'ETA' }],
    ['filename'],
  ] as FieldRow[],
} as const

export type FieldPresetKey = keyof typeof FIELD_PRESETS

// Batas validasi — cocok MAX_* di firmware layout_types.h
// (~/Documents/Project/3pb-monitoring-display/apps/internal/src/layout/layout_types.h)
export const LAYOUT_LIMITS = {
  maxPages: 8,
  maxCellsPerPage: 24,
  maxFieldsPerRow: 3,
  maxRowsPerFieldsPageDefault: 8,
  maxRowsPerFieldsCellOverride: 3,
} as const
```

- [ ] **Step 2: Build check**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: tidak ada TypeScript error baru dari file ini (file baru murni tipe, tidak dipakai di mana pun masih — memastikan sintaks valid).

- [ ] **Step 3: Commit**

```bash
cd apps/dashboard
git add lib/cyd-layout/types.ts
git commit -m "feat(cyd-layout): tipe LayoutConfig v2 (types.ts) + FIELD_PRESETS + LAYOUT_LIMITS"
```

---

### Task 5: `build-config.ts` v2 — validasi + serialize, hapus `rack-template.ts`

**Files:**
- Modify (rewrite total): `lib/cyd-layout/build-config.ts`
- Modify (rewrite total): `lib/cyd-layout/__tests__/build-config.test.ts`
- Delete: `lib/cyd-layout/rack-template.ts`

**Interfaces:**
- Consumes: tipe dari `lib/cyd-layout/types.ts` (Task 4), `LAYOUT_LIMITS`.
- Produces: `validateLayoutConfig(config: unknown): { valid: true; config: LayoutConfigOut } | { valid: false; error: string }` — dipakai Task 6 (API route POST).

Catatan: fungsi lama `buildLayoutConfig(assignment)` dan `findDuplicatePrinterIds(assignment)` **dihapus total** — state editor v2 SUDAH berbentuk `LayoutConfigOut` langsung (dibangun interaktif di canvas, Task 8-11), jadi tidak ada lagi "assignment -> config" generation. Yang dibutuhkan cuma validasi sebelum publish.

- [ ] **Step 1: Tulis test validasi**

```ts
// lib/cyd-layout/__tests__/build-config.test.ts
import { describe, it, expect } from 'vitest'
import { validateLayoutConfig } from '../build-config'
import type { LayoutConfigOut } from '../types'

function validConfig(): LayoutConfigOut {
  return {
    schemaVersion: 1,
    pages: [
      {
        id: 'rack',
        grid: { cols: 6, rows: 4, rowWeights: [0.06, 0.32, 0.36, 0.26] },
        fields: [['name'], ['state', 'progress'], ['progressBar']],
        durationSec: 0,
        cells: [
          { type: 'label', text: 'RAK KIRI', col: 0, row: 0, colSpan: 2 },
          { printer: 'mars', col: 0, row: 1 },
          { printer: 'saturn', col: 1, row: 1 },
        ],
      },
    ],
  }
}

describe('validateLayoutConfig', () => {
  it('config valid -> valid: true, config diteruskan apa adanya', () => {
    const cfg = validConfig()
    const result = validateLayoutConfig(cfg)
    expect(result).toEqual({ valid: true, config: cfg })
  })

  it('schemaVersion selain 1 -> invalid', () => {
    const cfg = { ...validConfig(), schemaVersion: 2 }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('pages kosong -> invalid', () => {
    const cfg = { ...validConfig(), pages: [] }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('pages lebih dari MAX_PAGES (8) -> invalid', () => {
    const page = validConfig().pages[0]
    const cfg = { schemaVersion: 1 as const, pages: Array.from({ length: 9 }, (_, i) => ({ ...page, id: `p${i}` })) }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('cells lebih dari MAX_CELLS_PER_PAGE (24) -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].cells = Array.from({ length: 25 }, (_, i) => ({ printer: `p${i}`, col: 0, row: 0 }))
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('rowWeights.length tak sama dengan grid.rows -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].grid.rowWeights = [0.5, 0.5]  // rows=4, cuma 2 weight
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('sum rowWeights <= 0 -> invalid (cegah div-by-zero di firmware)', () => {
    const cfg = validConfig()
    cfg.pages[0].grid.rowWeights = [0, 0, 0, 0]
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('printer id dobel dalam satu halaman -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].cells.push({ printer: 'mars', col: 5, row: 3 })
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('printer id sama muncul di HALAMAN BERBEDA -> valid (bukan duplikat, disengaja)', () => {
    const cfg = validConfig()
    cfg.pages.push({
      id: 'detail-1', grid: { cols: 1, rows: 1 }, fields: [['name']], durationSec: 8,
      cells: [{ printer: 'mars', col: 0, row: 0 }],
    })
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(true)
  })

  it('cell printer tanpa field "printer" terisi -> invalid', () => {
    const cfg = validConfig()
    // @ts-expect-error sengaja kirim cell tak valid
    cfg.pages[0].cells.push({ printer: '', col: 5, row: 3 })
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('cell col+colSpan melebihi grid.cols -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].cells.push({ printer: 'x', col: 5, row: 2, colSpan: 3 })  // 5+3=8 > cols=6
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('bukan object / null -> invalid, tak throw', () => {
    expect(validateLayoutConfig(null).valid).toBe(false)
    expect(validateLayoutConfig('string').valid).toBe(false)
    expect(validateLayoutConfig(42).valid).toBe(false)
  })
})
```

- [ ] **Step 2: Run test, verifikasi gagal**

Run: `cd apps/dashboard && pnpm vitest run lib/cyd-layout/__tests__/build-config.test.ts`
Expected: FAIL — test lama (assignment-based) juga akan hilang karena file test ini di-overwrite; pastikan environment belum ada `validateLayoutConfig` -> `Cannot find module` atau `validateLayoutConfig is not a function`.

- [ ] **Step 3: Implementasi**

```ts
// lib/cyd-layout/build-config.ts
import type { LayoutConfigOut, LayoutPageOut, LayoutCellOut } from './types'
import { LAYOUT_LIMITS } from './types'

type ValidationResult = { valid: true; config: LayoutConfigOut } | { valid: false; error: string }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validatePage(page: unknown, index: number): string | null {
  if (!isPlainObject(page)) return `pages[${index}] bukan object`
  if (typeof page.id !== 'string' || !page.id) return `pages[${index}].id wajib string non-kosong`

  const grid = page.grid
  if (!isPlainObject(grid)) return `pages[${index}].grid wajib object`
  if (typeof grid.cols !== 'number' || grid.cols < 1) return `pages[${index}].grid.cols wajib >= 1`
  if (typeof grid.rows !== 'number' || grid.rows < 1) return `pages[${index}].grid.rows wajib >= 1`

  if (grid.rowWeights !== undefined) {
    if (!Array.isArray(grid.rowWeights) || grid.rowWeights.length !== grid.rows) {
      return `pages[${index}].grid.rowWeights panjangnya harus sama dengan grid.rows`
    }
    const sum = (grid.rowWeights as number[]).reduce((a, b) => a + b, 0)
    if (sum <= 0) return `pages[${index}].grid.rowWeights sum harus > 0`
  }

  if (typeof page.durationSec !== 'number' || page.durationSec < 0) {
    return `pages[${index}].durationSec wajib angka >= 0`
  }

  const cells = page.cells
  if (!Array.isArray(cells)) return `pages[${index}].cells wajib array`
  if (cells.length > LAYOUT_LIMITS.maxCellsPerPage) {
    return `pages[${index}].cells melebihi batas ${LAYOUT_LIMITS.maxCellsPerPage}`
  }

  const seenPrinters = new Set<string>()
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i] as LayoutCellOut
    if (!isPlainObject(cell)) return `pages[${index}].cells[${i}] bukan object`

    if (typeof cell.col !== 'number' || typeof cell.row !== 'number') {
      return `pages[${index}].cells[${i}] wajib punya col/row angka`
    }
    const colSpan = cell.colSpan ?? 1
    const rowSpan = cell.rowSpan ?? 1
    if (cell.col + colSpan > (grid.cols as number)) return `pages[${index}].cells[${i}] col+colSpan melebihi grid.cols`
    if (cell.row + rowSpan > (grid.rows as number)) return `pages[${index}].cells[${i}] row+rowSpan melebihi grid.rows`

    if ('type' in cell && cell.type === 'label') {
      if (typeof cell.text !== 'string') return `pages[${index}].cells[${i}] label wajib punya text string`
    } else {
      const printerCell = cell as { printer?: unknown }
      if (typeof printerCell.printer !== 'string' || !printerCell.printer) {
        return `pages[${index}].cells[${i}] wajib punya printer (string non-kosong) kecuali type:'label'`
      }
      if (seenPrinters.has(printerCell.printer)) {
        return `pages[${index}] printer "${printerCell.printer}" dipasang lebih dari sekali di halaman yang sama`
      }
      seenPrinters.add(printerCell.printer)
    }
  }

  return null
}

export function validateLayoutConfig(input: unknown): ValidationResult {
  if (!isPlainObject(input)) return { valid: false, error: 'config wajib berupa object' }
  if (input.schemaVersion !== 1) return { valid: false, error: 'schemaVersion wajib 1' }

  const pages = input.pages
  if (!Array.isArray(pages) || pages.length === 0) return { valid: false, error: 'pages wajib array non-kosong' }
  if (pages.length > LAYOUT_LIMITS.maxPages) return { valid: false, error: `pages melebihi batas ${LAYOUT_LIMITS.maxPages}` }

  for (let i = 0; i < pages.length; i++) {
    const err = validatePage(pages[i], i)
    if (err) return { valid: false, error: err }
  }

  return { valid: true, config: input as unknown as LayoutConfigOut }
}
```

- [ ] **Step 4: Run test, verifikasi lulus**

Run: `cd apps/dashboard && pnpm vitest run lib/cyd-layout/__tests__/build-config.test.ts`
Expected: PASS (12/12)

- [ ] **Step 5: JANGAN hapus `rack-template.ts` atau fungsi lama di titik ini (koreksi ordering, ditemukan saat eksekusi)**

`buildLayoutConfig()`/`findDuplicatePrinterIds()` versi v1 dan `rack-template.ts` **masih dipakai** oleh `app/api/cyd-layout/route.ts` (v1, belum diganti sampai Task 6) dan `app/(dashboard)/cyd-layout/page.tsx` (v1, belum diganti sampai Task 11). Menghapusnya sekarang akan merusak build. `validateLayoutConfig` (baru) ditambahkan **BERDAMPINGAN** dengan fungsi v1 (tetap utuh, tak diubah) di file yang sama — bukan menggantikannya. Penghapusan `rack-template.ts` + fungsi v1 dipindah jadi step tambahan di akhir Task 11 (lihat Task 11 Step 5 baru), setelah consumer terakhirnya (`page.tsx`) sudah diganti.

Test file juga sama: pertahankan test suite v1 (`buildLayoutConfig`/`findDuplicatePrinterIds`) yang sudah ada, TAMBAHKAN 12 test case `validateLayoutConfig` di atas berdampingan (bukan mengganti file test lama).

- [ ] **Step 6: Run full test file + build check, verifikasi tak ada yang rusak**

Run: `cd apps/dashboard && pnpm vitest run lib/cyd-layout/__tests__/build-config.test.ts`
Expected: PASS — jumlah test v1 lama + 12 test `validateLayoutConfig` baru, semua lulus.

Run: `cd apps/dashboard && pnpm build`
Expected: SUCCESS — konfirmasi `route.ts`/`page.tsx` v1 (consumer lama) masih compile normal, tak tersentuh.

- [ ] **Step 7: Commit**

```bash
cd apps/dashboard
git add lib/cyd-layout/build-config.ts lib/cyd-layout/__tests__/build-config.test.ts
git commit -m "feat(cyd-layout): validateLayoutConfig (v2) berdampingan dengan buildLayoutConfig (v1, dipertahankan sampai Task 11)"
```

---

### Task 6: API routes — `/api/cyd-layout/printers` + `/api/cyd-layout` (POST body baru)

**Files:**
- Modify (rewrite): `app/api/cyd-layout/printers/route.ts`
- Modify (rewrite): `app/api/cyd-layout/route.ts`

**Interfaces:**
- Consumes: `getPrintersWithLiveStatus` (Task 2), `validateLayoutConfig` (Task 5), `publishAndConfirm` (existing, `lib/cyd-layout/mqtt-client.ts`, tak berubah).
- Produces: `GET /api/cyd-layout/printers` return `{id: slug, name, model, live}[]` (id = slug supaya konsisten dipakai langsung sebagai `cell.printer`), `POST /api/cyd-layout` terima `{config}` bukan `{assignment}`.

Task ini murni API route (Next.js Route Handler) — tidak ada unit test terpisah per Global Constraints (konsisten dengan route existing lain di project, semua diverifikasi manual/via curl, bukan vitest — cek `app/api/cyd-layout/route.ts` v1 yang juga tak punya test file).

- [ ] **Step 1: Rewrite `printers/route.ts`**

```ts
// app/api/cyd-layout/printers/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getPrintersWithLiveStatus } from '@/lib/printers/live-status'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const printers = await getPrintersWithLiveStatus()
  // id = slug (bukan cuid Prisma) -> ini yang langsung dipakai sebagai cell.printer di editor.
  // Printer tanpa slug (belum di-generate/diisi manual) DIKELUARKAN dari palette -- tak bisa
  // dipasang ke layout sebelum punya identitas MQTT yang valid.
  return NextResponse.json(
    printers
      .filter((p) => p.slug !== null)
      .map((p) => ({ id: p.slug as string, name: p.name, model: p.model, live: p.live }))
  )
}
```

- [ ] **Step 2: Rewrite `route.ts` (POST)**

```ts
// app/api/cyd-layout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { validateLayoutConfig } from '@/lib/cyd-layout/build-config'
import { publishAndConfirm } from '@/lib/cyd-layout/mqtt-client'

const CONFIG_TOPIC = '3dpb/cyd/internal-rack/layout'
const READBACK_TOPIC = '3dpb/cyd/internal-rack/layout/current'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = validateLayoutConfig(body?.config)
  if (!result.valid) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const payload = JSON.stringify(result.config)
  const confirmed = await publishAndConfirm(CONFIG_TOPIC, READBACK_TOPIC, payload)

  return NextResponse.json({ confirmed })
}
```

- [ ] **Step 3: Build check**

Run: `cd apps/dashboard && pnpm build`
Expected: build sukses (halaman `app/(dashboard)/cyd-layout/page.tsx` v1 MASIH memakai `{assignment}`/bentuk lama sampai Task 11 rewrite — build boleh gagal type-check di titik INI kalau `page.tsx` lama strict-typed terhadap request body lama; kalau iya, itu ekspektasi wajar sampai Task 11, JANGAN "perbaiki" `page.tsx` di task ini, biarkan untuk Task 11).

- [ ] **Step 4: Commit**

```bash
cd apps/dashboard
git add app/api/cyd-layout
git commit -m "feat(cyd-layout): API v2 — GET printers dari getPrintersWithLiveStatus, POST terima {config} LayoutConfig penuh"
```

---

### Task 7: `PrinterPalette.tsx`

**Files:**
- Create: `components/cyd-layout/PrinterPalette.tsx`

**Interfaces:**
- Consumes: `GET /api/cyd-layout/printers` (Task 6), `PrinterStatusBadge` (Task 3), `@dnd-kit/core` `useDraggable`.
- Produces: `<PrinterPalette usedSlugsOnActivePage={string[]} />` — component mandiri, fetch sendiri (tak butuh props data dari parent selain "printer mana yang sudah kepakai di halaman aktif" buat visual dim). Dipakai Task 11 (`page.tsx`), harus berada DI DALAM `DndContext` yang sama dengan `GridCanvas` (disediakan parent `page.tsx`, bukan komponen ini sendiri).

- [ ] **Step 1: Implementasi**

```tsx
// components/cyd-layout/PrinterPalette.tsx
'use client'

import { useEffect, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { PrinterStatusBadge } from '@/components/printers/PrinterStatusBadge'

interface PaletteItem {
  id: string  // = slug
  name: string
  model: string
  live: { state: string; progress: number; remainingMin: number } | null
}

function DraggablePrinterCard({ printer, disabled }: { printer: PaletteItem; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${printer.id}`,
    data: { type: 'printer', printerId: printer.id },
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : { ...listeners, ...attributes })}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: disabled ? 0.4 : isDragging ? 0.3 : 1,
        cursor: disabled ? 'not-allowed' : 'grab',
      }}
      className="border border-gray-300 dark:border-slate-600 rounded-md px-2 py-1.5 bg-white dark:bg-slate-800 select-none"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-gray-800 dark:text-slate-100 truncate">🖨️ {printer.name}</span>
        <PrinterStatusBadge state={printer.live?.state ?? null} />
      </div>
      {printer.model && <span className="text-[10px] text-gray-400 dark:text-slate-500">{printer.model}</span>}
    </div>
  )
}

export function PrinterPalette({ usedSlugsOnActivePage }: { usedSlugsOnActivePage: string[] }) {
  const [printers, setPrinters] = useState<PaletteItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cyd-layout/printers')
      .then((r) => r.json())
      .then((data: PaletteItem[]) => setPrinters(data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="w-40 flex-shrink-0 space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold">Printer</div>
      {loading && <div className="text-xs text-gray-400 dark:text-slate-500">Memuat...</div>}
      {!loading && printers.length === 0 && (
        <div className="text-xs text-gray-400 dark:text-slate-500">
          Belum ada printer aktif dengan slug. Tambah/lengkapi di Produk→Filamen→Printer.
        </div>
      )}
      {printers.map((p) => (
        <DraggablePrinterCard key={p.id} printer={p} disabled={usedSlugsOnActivePage.includes(p.id)} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Build check**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: tidak ada TypeScript error (komponen belum dipakai di mana pun, cuma cek sintaks/tipe valid — akan diverifikasi visual di Task 11).

- [ ] **Step 3: Commit**

```bash
cd apps/dashboard
git add components/cyd-layout/PrinterPalette.tsx
git commit -m "feat(cyd-layout): PrinterPalette — draggable card printer dari /api/cyd-layout/printers"
```

---

### Task 8: `GridCanvas.tsx` — render grid akurat + tempatkan printer/label

**Files:**
- Create: `components/cyd-layout/GridCanvas.tsx`

**Interfaces:**
- Consumes: `LayoutPageOut`/`LayoutCellOut` (Task 4), `CYD_COLORS`/`stateColor` (Task 3), `@dnd-kit/core` `useDroppable`.
- Produces: `<GridCanvas page={LayoutPageOut} livePrinters={Record<string,{state,progress}>} selectedCellIndex={number|null} onSelectCell={(i:number|null)=>void} onAddCell={(cell:LayoutCellOut)=>void} onUpdateCell={(i:number,cell:LayoutCellOut)=>void} />` — dipakai Task 11. Penghapusan sel dilakukan lewat `CellSettingsPanel` (Task 10), BUKAN dari dalam `GridCanvas` — jangan tambahkan `onRemoveCell` ke props ini, itu prop mati (didefinisikan tapi tak pernah dipanggil di GridCanvas). Resize (colSpan/rowSpan drag-handle, rowWeights divider-drag) ditambahkan Task 9 (extend file ini, bukan file baru).

Task ini fokus: render grid akurat (warna/proporsi CYD), sel kosong dengan menu "+" (pilih Printer via drag-drop dari palette ATAU klik pilih dari list kecil, atau Label via input teks langsung), render sel terisi (printer: nama+state+progress dari `livePrinters`; label: teks). BELUM ada resize (Task 9).

- [ ] **Step 1: Implementasi**

```tsx
// components/cyd-layout/GridCanvas.tsx
'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { LayoutPageOut, LayoutCellOut } from '@/lib/cyd-layout/types'
import { CYD_COLORS, stateColor } from '@/lib/cyd-layout/colors'

interface LivePrinterInfo {
  state: string
  progress: number
}

interface GridCanvasProps {
  page: LayoutPageOut
  livePrinters: Record<string, LivePrinterInfo>
  selectedCellIndex: number | null
  onSelectCell: (index: number | null) => void
  onAddCell: (cell: LayoutCellOut) => void
  onUpdateCell: (index: number, cell: LayoutCellOut) => void
}

// Posisi grid (col,row) -> index cell yang menempati situ (kalau ada), null kalau kosong.
function findCellAt(cells: LayoutCellOut[], col: number, row: number): number | null {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    const colSpan = c.colSpan ?? 1
    const rowSpan = c.rowSpan ?? 1
    if (col >= c.col && col < c.col + colSpan && row >= c.row && row < c.row + rowSpan) return i
  }
  return null
}

function EmptyCellMenu({ onPickPrinter, onPickLabel, onClose }: { onPickPrinter: () => void; onPickLabel: () => void; onClose: () => void }) {
  return (
    <div className="absolute z-10 top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg overflow-hidden w-28">
      <button onClick={() => { onPickPrinter(); onClose() }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-100">
        🖨️ Printer
      </button>
      <button onClick={() => { onPickLabel(); onClose() }} className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-800 dark:text-slate-100">
        🏷️ Label
      </button>
    </div>
  )
}

function EmptyCell({ col, row, onAddCell }: { col: number; row: number; onAddCell: (cell: LayoutCellOut) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: `cell-${col}-${row}`, data: { type: 'cell', col, row } })

  return (
    <div
      ref={setNodeRef}
      className="relative border border-dashed flex items-center justify-center cursor-pointer"
      style={{ borderColor: isOver ? CYD_COLORS.purple : 'rgba(255,255,255,.2)', background: isOver ? `${CYD_COLORS.purple}22` : 'transparent' }}
      onClick={() => setMenuOpen((v) => !v)}
    >
      <span className="text-gray-500 text-lg select-none">+</span>
      {menuOpen && (
        <EmptyCellMenu
          onClose={() => setMenuOpen(false)}
          onPickPrinter={() => { /* drag-drop dari palette yang isi beneran; klik cuma buka petunjuk */ }}
          onPickLabel={() => onAddCell({ type: 'label', text: 'Label baru', col, row })}
        />
      )}
    </div>
  )
}

function FilledCell({ cell, index, isSelected, live, onSelect }: {
  cell: LayoutCellOut; index: number; isSelected: boolean; live: LivePrinterInfo | undefined; onSelect: () => void
}) {
  const isLabel = 'type' in cell && cell.type === 'label'
  const gridColumn = `${cell.col + 1} / span ${cell.colSpan ?? 1}`
  const gridRow = `${cell.row + 1} / span ${cell.rowSpan ?? 1}`

  if (isLabel) {
    return (
      <div
        onClick={onSelect}
        style={{ gridColumn, gridRow, background: '#050508', border: isSelected ? `2px solid ${CYD_COLORS.purple}` : '1px solid rgba(255,255,255,.15)' }}
        className="flex items-center justify-center px-1 cursor-pointer"
      >
        <span style={{ color: CYD_COLORS.dim, fontFamily: 'monospace', fontSize: 13 }}>{cell.text}</span>
      </div>
    )
  }

  const color = stateColor(live?.state ?? null)
  return (
    <div
      onClick={onSelect}
      style={{ gridColumn, gridRow, background: '#0a0a10', border: isSelected ? `2px solid ${CYD_COLORS.purple}` : '1px solid #1a1a22', position: 'relative' }}
      className="cursor-pointer overflow-hidden"
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: 4, height: '100%', background: color }} />
      <div style={{ paddingLeft: 10, paddingTop: 4, fontFamily: 'monospace' }}>
        <div style={{ color: '#fff', fontSize: 15 }}>{cell.printer}</div>
        {live && <div style={{ color, fontSize: 12 }}>{live.state.toUpperCase()} {live.progress}%</div>}
        {!live && <div style={{ color: CYD_COLORS.dim, fontSize: 12 }}>— tak ada data —</div>}
      </div>
    </div>
  )
}

export function GridCanvas({ page, livePrinters, selectedCellIndex, onSelectCell, onAddCell, onUpdateCell }: GridCanvasProps) {
  void onUpdateCell  // dipakai Task 9 (resize) — dijaga di signature dari awal biar tak breaking change lagi

  const rowWeights = page.grid.rowWeights ?? Array.from({ length: page.grid.rows }, () => 1 / page.grid.rows)

  return (
    <div
      style={{
        aspectRatio: '320 / 240',
        background: CYD_COLORS.bg,
        border: '2px solid #333',
        borderRadius: 4,
        display: 'grid',
        gridTemplateColumns: `repeat(${page.grid.cols}, 1fr)`,
        gridTemplateRows: rowWeights.map((w) => `${w}fr`).join(' '),
        gap: 1,
        width: '100%',
        maxWidth: 900,
      }}
    >
      {Array.from({ length: page.grid.rows }, (_, row) =>
        Array.from({ length: page.grid.cols }, (_, col) => {
          const cellIndex = findCellAt(page.cells, col, row)
          if (cellIndex === null) {
            return <EmptyCell key={`${col}-${row}`} col={col} row={row} onAddCell={onAddCell} />
          }
          const cell = page.cells[cellIndex]
          // Cuma render sekali per cell multi-span, di posisi (cell.col, cell.row)-nya sendiri
          if (cell.col !== col || cell.row !== row) return null
          const live = 'printer' in cell ? livePrinters[cell.printer] : undefined
          return (
            <FilledCell
              key={`${col}-${row}`}
              cell={cell}
              index={cellIndex}
              isSelected={selectedCellIndex === cellIndex}
              live={live}
              onSelect={() => onSelectCell(cellIndex)}
            />
          )
        })
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build check**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: tidak ada TypeScript error.

- [ ] **Step 3: Verifikasi manual (browser, tanpa integrasi penuh dulu — cukup import sementara di halaman test/storybook-style kalau ada, atau tunda verifikasi visual sampai Task 11 selesai integrasi. Kalau tunda: skip step ini, catat di report bahwa verifikasi visual digabung ke Task 11.)**

- [ ] **Step 4: Commit**

```bash
cd apps/dashboard
git add components/cyd-layout/GridCanvas.tsx
git commit -m "feat(cyd-layout): GridCanvas — render grid akurat warna CYD, sel kosong menu +Printer/+Label, sel terisi live status"
```

---

### Task 9: Resize — colSpan/rowSpan (handle pojok) + rowWeights (drag divider)

**Files:**
- Modify: `components/cyd-layout/GridCanvas.tsx`

**Interfaces:**
- Consumes: `onUpdateCell`/`onUpdatePage` — `onUpdatePage` BARU ditambah ke `GridCanvasProps` (buat update `grid.rowWeights` di level halaman, bukan cell).
- Produces: `GridCanvasProps` bertambah field `onUpdatePage: (updates: Partial<LayoutPageOut>) => void`.

- [ ] **Step 1: Tambah resize handle pojok di `FilledCell` (colSpan/rowSpan)**

Edit `components/cyd-layout/GridCanvas.tsx` — ganti `FilledCell` (bagian printer, bukan label — label juga bisa di-resize sama caranya, terapkan ke keduanya):

```tsx
function ResizeHandle({ onResize }: { onResize: (deltaCol: number, deltaRow: number) => void }) {
  function handlePointerDown(startEvent: React.PointerEvent) {
    startEvent.stopPropagation()
    const startX = startEvent.clientX
    const startY = startEvent.clientY
    const cellEl = (startEvent.target as HTMLElement).closest('[data-cell-size]') as HTMLElement | null
    const cellW = cellEl?.offsetWidth ?? 50
    const cellH = cellEl?.offsetHeight ?? 50

    function handlePointerMove(moveEvent: PointerEvent) {
      const dCol = Math.round((moveEvent.clientX - startX) / cellW)
      const dRow = Math.round((moveEvent.clientY - startY) / cellH)
      onResize(dCol, dRow)
    }
    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{ position: 'absolute', bottom: -4, right: -4, width: 10, height: 10, background: CYD_COLORS.purple, borderRadius: 2, cursor: 'nwse-resize' }}
    />
  )
}
```

Update `FilledCell` — tambah `data-cell-size` attribute dan render `<ResizeHandle>` kalau `isSelected`, panggil `onUpdateCell` dengan colSpan/rowSpan baru (clamp minimal 1, maksimal sisa kolom/baris grid):

```tsx
function FilledCell({ cell, index, isSelected, live, onSelect, onUpdateCell, gridCols, gridRows }: {
  cell: LayoutCellOut; index: number; isSelected: boolean; live: LivePrinterInfo | undefined; onSelect: () => void
  onUpdateCell: (index: number, cell: LayoutCellOut) => void; gridCols: number; gridRows: number
}) {
  const isLabel = 'type' in cell && cell.type === 'label'
  const gridColumn = `${cell.col + 1} / span ${cell.colSpan ?? 1}`
  const gridRow = `${cell.row + 1} / span ${cell.rowSpan ?? 1}`

  function handleResize(deltaCol: number, deltaRow: number) {
    const maxColSpan = gridCols - cell.col
    const maxRowSpan = gridRows - cell.row
    const newColSpan = Math.max(1, Math.min(maxColSpan, (cell.colSpan ?? 1) + deltaCol))
    const newRowSpan = Math.max(1, Math.min(maxRowSpan, (cell.rowSpan ?? 1) + deltaRow))
    onUpdateCell(index, { ...cell, colSpan: newColSpan, rowSpan: newRowSpan })
  }

  if (isLabel) {
    return (
      <div
        data-cell-size
        onClick={onSelect}
        style={{ gridColumn, gridRow, background: '#050508', border: isSelected ? `2px solid ${CYD_COLORS.purple}` : '1px solid rgba(255,255,255,.15)', position: 'relative' }}
        className="flex items-center justify-center px-1 cursor-pointer"
      >
        <span style={{ color: CYD_COLORS.dim, fontFamily: 'monospace', fontSize: 13 }}>{cell.text}</span>
        {isSelected && <ResizeHandle onResize={handleResize} />}
      </div>
    )
  }

  const color = stateColor(live?.state ?? null)
  return (
    <div
      data-cell-size
      onClick={onSelect}
      style={{ gridColumn, gridRow, background: '#0a0a10', border: isSelected ? `2px solid ${CYD_COLORS.purple}` : '1px solid #1a1a22', position: 'relative' }}
      className="cursor-pointer overflow-hidden"
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: 4, height: '100%', background: color }} />
      <div style={{ paddingLeft: 10, paddingTop: 4, fontFamily: 'monospace' }}>
        <div style={{ color: '#fff', fontSize: 15 }}>{cell.printer}</div>
        {live && <div style={{ color, fontSize: 12 }}>{live.state.toUpperCase()} {live.progress}%</div>}
        {!live && <div style={{ color: CYD_COLORS.dim, fontSize: 12 }}>— tak ada data —</div>}
      </div>
      {isSelected && <ResizeHandle onResize={handleResize} />}
    </div>
  )
}
```

Update pemanggilan `<FilledCell>` di `GridCanvas` buat teruskan prop baru (`onUpdateCell`, `gridCols={page.grid.cols}`, `gridRows={page.grid.rows}`), dan hapus `void onUpdateCell` yang sebelumnya cuma placeholder.

- [ ] **Step 2: Tambah divider antar-baris (rowWeights)**

Tambah komponen baru di `GridCanvas.tsx`, dan `onUpdatePage` ke props:

```tsx
function RowDivider({ rowIndex, onDrag }: { rowIndex: number; onDrag: (rowIndex: number, deltaFraction: number) => void }) {
  function handlePointerDown(startEvent: React.PointerEvent) {
    startEvent.stopPropagation()
    const startY = startEvent.clientY
    const container = (startEvent.target as HTMLElement).closest('[data-canvas-height]') as HTMLElement | null
    const containerH = container?.offsetHeight ?? 240

    function handlePointerMove(moveEvent: PointerEvent) {
      const deltaFraction = (moveEvent.clientY - startY) / containerH
      onDrag(rowIndex, deltaFraction)
    }
    function handlePointerUp() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{ gridColumn: '1 / -1', gridRow: `${rowIndex + 1} / span 1`, alignSelf: 'end', height: 4, marginBottom: -2, background: CYD_COLORS.purple, cursor: 'ns-resize', zIndex: 5 }}
    />
  )
}
```

Update `GridCanvas` — bungkus grid dengan `data-canvas-height`, render `<RowDivider>` di antara tiap baris (kecuali setelah baris terakhir), dan tambah handler:

```tsx
export function GridCanvas({ page, livePrinters, selectedCellIndex, onSelectCell, onAddCell, onUpdateCell, onUpdatePage }: GridCanvasProps) {
  const rowWeights = page.grid.rowWeights ?? Array.from({ length: page.grid.rows }, () => 1 / page.grid.rows)

  function handleRowDrag(rowIndex: number, deltaFraction: number) {
    const next = [...rowWeights]
    const minWeight = 0.02
    const amount = Math.max(-(next[rowIndex] - minWeight), Math.min(next[rowIndex + 1] - minWeight, deltaFraction))
    next[rowIndex] += amount
    next[rowIndex + 1] -= amount
    onUpdatePage({ grid: { ...page.grid, rowWeights: next } })
  }

  return (
    <div
      data-canvas-height
      style={{
        aspectRatio: '320 / 240',
        background: CYD_COLORS.bg,
        border: '2px solid #333',
        borderRadius: 4,
        display: 'grid',
        gridTemplateColumns: `repeat(${page.grid.cols}, 1fr)`,
        gridTemplateRows: rowWeights.map((w) => `${w}fr`).join(' '),
        gap: 1,
        width: '100%',
        maxWidth: 900,
        position: 'relative',
      }}
    >
      {Array.from({ length: page.grid.rows }, (_, row) =>
        Array.from({ length: page.grid.cols }, (_, col) => {
          const cellIndex = findCellAt(page.cells, col, row)
          if (cellIndex === null) {
            return <EmptyCell key={`${col}-${row}`} col={col} row={row} onAddCell={onAddCell} />
          }
          const cell = page.cells[cellIndex]
          if (cell.col !== col || cell.row !== row) return null
          const live = 'printer' in cell ? livePrinters[cell.printer] : undefined
          return (
            <FilledCell
              key={`${col}-${row}`}
              cell={cell}
              index={cellIndex}
              isSelected={selectedCellIndex === cellIndex}
              live={live}
              onSelect={() => onSelectCell(cellIndex)}
              onUpdateCell={onUpdateCell}
              gridCols={page.grid.cols}
              gridRows={page.grid.rows}
            />
          )
        })
      )}
      {Array.from({ length: page.grid.rows - 1 }, (_, i) => (
        <RowDivider key={`divider-${i}`} rowIndex={i} onDrag={handleRowDrag} />
      ))}
    </div>
  )
}
```

Update `GridCanvasProps` interface — tambah `onUpdatePage: (updates: Partial<LayoutPageOut>) => void`.

- [ ] **Step 2: Build check**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: tidak ada error.

- [ ] **Step 3: Commit**

```bash
cd apps/dashboard
git add components/cyd-layout/GridCanvas.tsx
git commit -m "feat(cyd-layout): resize interaktif — handle pojok colSpan/rowSpan, drag divider antar-baris rowWeights"
```

---

### Task 10: `PageTabs.tsx` + `CellSettingsPanel.tsx`

**Files:**
- Create: `components/cyd-layout/PageTabs.tsx`
- Test: `components/cyd-layout/__tests__/PageTabs.test.tsx`
- Create: `components/cyd-layout/CellSettingsPanel.tsx`

**Interfaces:**
- Consumes: `LayoutPageOut` (Task 4).
- Produces: `<PageTabs pages={LayoutPageOut[]} activeIndex={number} onSelect={(i:number)=>void} onAdd={()=>void} onRemove={(i:number)=>void} onReorder={(newPages:LayoutPageOut[])=>void} />`, `<CellSettingsPanel cell={LayoutCellOut|null} onUpdateCell={(cell:LayoutCellOut)=>void} onRemoveCell={()=>void} pageDurationSec={number} onUpdateDuration={(s:number)=>void} />` — dipakai Task 11.

- [ ] **Step 1: Tulis test `PageTabs` (render statis — jumlah tab, label, tombol tambah)**

```tsx
// components/cyd-layout/__tests__/PageTabs.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageTabs } from '../PageTabs'
import type { LayoutPageOut } from '@/lib/cyd-layout/types'

function page(id: string): LayoutPageOut {
  return { id, grid: { cols: 1, rows: 1 }, fields: [['name']], durationSec: 0, cells: [] }
}

describe('PageTabs', () => {
  it('render satu tab per halaman', () => {
    const html = renderToStaticMarkup(
      <PageTabs pages={[page('rack'), page('detail-1')]} activeIndex={0} onSelect={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} onReorder={vi.fn()} />
    )
    expect(html).toContain('rack')
    expect(html).toContain('detail-1')
  })

  it('render tombol tambah halaman', () => {
    const html = renderToStaticMarkup(
      <PageTabs pages={[page('rack')]} activeIndex={0} onSelect={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} onReorder={vi.fn()} />
    )
    expect(html).toContain('+ Halaman')
  })
})
```

- [ ] **Step 2: Run test, verifikasi gagal**

Run: `cd apps/dashboard && pnpm vitest run components/cyd-layout/__tests__/PageTabs.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implementasi `PageTabs`**

```tsx
// components/cyd-layout/PageTabs.tsx
'use client'

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { LayoutPageOut } from '@/lib/cyd-layout/types'

function SortableTab({ page, isActive, onSelect, onRemove }: { page: LayoutPageOut; isActive: boolean; onSelect: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      onClick={onSelect}
      className={`px-3 py-1.5 rounded-md text-sm cursor-pointer flex items-center gap-1.5 ${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300'}`}
    >
      {page.id}
      <span
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        className="text-xs opacity-60 hover:opacity-100 ml-1"
      >
        ✕
      </span>
    </div>
  )
}

export function PageTabs({ pages, activeIndex, onSelect, onAdd, onRemove, onReorder }: {
  pages: LayoutPageOut[]; activeIndex: number; onSelect: (i: number) => void; onAdd: () => void; onRemove: (i: number) => void; onReorder: (newPages: LayoutPageOut[]) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = pages.findIndex((p) => p.id === active.id)
    const newIndex = pages.findIndex((p) => p.id === over.id)
    onReorder(arrayMove(pages, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex items-center gap-2 flex-wrap">
        <SortableContext items={pages.map((p) => p.id)} strategy={horizontalListSortingStrategy}>
          {pages.map((p, i) => (
            <SortableTab key={p.id} page={p} isActive={i === activeIndex} onSelect={() => onSelect(i)} onRemove={() => onRemove(i)} />
          ))}
        </SortableContext>
        <button onClick={onAdd} className="px-3 py-1.5 rounded-md text-sm border border-dashed border-gray-400 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800">
          + Halaman
        </button>
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 4: Run test, verifikasi lulus**

Run: `cd apps/dashboard && pnpm vitest run components/cyd-layout/__tests__/PageTabs.test.tsx`
Expected: PASS (2/2)

- [ ] **Step 5: Implementasi `CellSettingsPanel` (tidak ditest — interaktif form sederhana, ikut konvensi manual-verify)**

```tsx
// components/cyd-layout/CellSettingsPanel.tsx
'use client'

import type { LayoutCellOut, FieldPresetKey } from '@/lib/cyd-layout/types'
import { FIELD_PRESETS } from '@/lib/cyd-layout/types'

export function CellSettingsPanel({ cell, onUpdateCell, onRemoveCell, pageDurationSec, onUpdateDuration }: {
  cell: LayoutCellOut | null
  onUpdateCell: (cell: LayoutCellOut) => void
  onRemoveCell: () => void
  pageDurationSec: number
  onUpdateDuration: (seconds: number) => void
}) {
  const isPrinterCell = cell !== null && !('type' in cell && cell.type === 'label')

  function handlePresetChange(preset: FieldPresetKey) {
    if (!cell || !isPrinterCell) return
    onUpdateCell({ ...cell, fields: FIELD_PRESETS[preset] } as LayoutCellOut)
  }

  return (
    <div className="w-44 flex-shrink-0 space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold mb-1">Sel Terpilih</div>
        {!cell && <div className="text-xs text-gray-400 dark:text-slate-500">Klik sel di canvas</div>}
        {cell && isPrinterCell && (
          <div className="space-y-2">
            <label className="text-xs text-gray-500 dark:text-slate-400 block">
              Field preset
              <select
                className="w-full mt-1 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
                onChange={(e) => handlePresetChange(e.target.value as FieldPresetKey)}
              >
                <option value="ringkas">Ringkas</option>
                <option value="detail">Detail</option>
              </select>
            </label>
            <button onClick={onRemoveCell} className="text-xs text-red-400 hover:text-red-600">Hapus dari grid</button>
          </div>
        )}
        {cell && !isPrinterCell && (
          <div className="space-y-2">
            <label className="text-xs text-gray-500 dark:text-slate-400 block">
              Teks label
              <input
                defaultValue={cell.text}
                onBlur={(e) => onUpdateCell({ ...cell, text: e.target.value })}
                className="w-full mt-1 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
              />
            </label>
            <button onClick={onRemoveCell} className="text-xs text-red-400 hover:text-red-600">Hapus dari grid</button>
          </div>
        )}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500 font-semibold mb-1">Halaman</div>
        <label className="text-xs text-gray-500 dark:text-slate-400 block">
          Durasi rotasi (detik, 0 = statis)
          <input
            type="number"
            min={0}
            defaultValue={pageDurationSec}
            onBlur={(e) => onUpdateDuration(Number(e.target.value))}
            className="w-full mt-1 border border-gray-300 dark:border-slate-600 rounded px-2 py-1 text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100"
          />
        </label>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Build check**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: tidak ada error.

- [ ] **Step 7: Commit**

```bash
cd apps/dashboard
git add components/cyd-layout/PageTabs.tsx components/cyd-layout/__tests__/PageTabs.test.tsx components/cyd-layout/CellSettingsPanel.tsx
git commit -m "feat(cyd-layout): PageTabs (tambah/hapus/reorder halaman) + CellSettingsPanel (field preset, durasi, hapus sel)"
```

---

### Task 11: `app/(dashboard)/cyd-layout/page.tsx` — orkestrasi penuh

**Files:**
- Modify (rewrite total): `app/(dashboard)/cyd-layout/page.tsx`

**Interfaces:**
- Consumes: SEMUA dari Task 4-10 (`PrinterPalette`, `GridCanvas`, `PageTabs`, `CellSettingsPanel`, tipe dari `types.ts`, API routes Task 6).
- Produces: halaman utuh, tidak ada lagi consumer di luar ini.

Ini task INTEGRASI — merangkai semua komponen jadi satu halaman, kelola state `LayoutConfigOut` penuh di level page, sediakan `DndContext` tunggal yang membungkus `PrinterPalette` + `GridCanvas` (drag dari palette ke sel grid), handle publish via `POST /api/cyd-layout`.

- [ ] **Step 1: Implementasi**

```tsx
// app/(dashboard)/cyd-layout/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { PrinterPalette } from '@/components/cyd-layout/PrinterPalette'
import { GridCanvas } from '@/components/cyd-layout/GridCanvas'
import { PageTabs } from '@/components/cyd-layout/PageTabs'
import { CellSettingsPanel } from '@/components/cyd-layout/CellSettingsPanel'
import { FIELD_PRESETS } from '@/lib/cyd-layout/types'
import type { LayoutConfigOut, LayoutPageOut, LayoutCellOut } from '@/lib/cyd-layout/types'

const DEFAULT_CONFIG: LayoutConfigOut = {
  schemaVersion: 1,
  pages: [
    { id: 'rack', grid: { cols: 6, rows: 4, rowWeights: [0.06, 0.32, 0.36, 0.26] }, fields: FIELD_PRESETS.ringkas, durationSec: 0, cells: [] },
  ],
}

interface LiveMap { [printerId: string]: { state: string; progress: number } }

export default function CydLayoutPage() {
  const [config, setConfig] = useState<LayoutConfigOut>(DEFAULT_CONFIG)
  const [activePageIndex, setActivePageIndex] = useState(0)
  const [selectedCellIndex, setSelectedCellIndex] = useState<number | null>(null)
  const [liveMap, setLiveMap] = useState<LiveMap>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'confirmed' | 'timeout' | 'error'>('idle')

  useEffect(() => {
    fetch('/api/cyd-layout/printers')
      .then((r) => r.json())
      .then((printers: { id: string; live: { state: string; progress: number } | null }[]) => {
        const map: LiveMap = {}
        for (const p of printers) if (p.live) map[p.id] = p.live
        setLiveMap(map)
      })
  }, [])

  const activePage = config.pages[activePageIndex]
  const usedSlugsOnActivePage = activePage.cells.filter((c): c is Extract<LayoutCellOut, { printer: string }> => 'printer' in c).map((c) => c.printer)

  function updateActivePage(updates: Partial<LayoutPageOut>) {
    setConfig((cfg) => ({
      ...cfg,
      pages: cfg.pages.map((p, i) => (i === activePageIndex ? { ...p, ...updates } : p)),
    }))
  }

  function addCell(cell: LayoutCellOut) {
    updateActivePage({ cells: [...activePage.cells, cell] })
  }

  function updateCell(index: number, cell: LayoutCellOut) {
    updateActivePage({ cells: activePage.cells.map((c, i) => (i === index ? cell : c)) })
  }

  function removeCell(index: number) {
    updateActivePage({ cells: activePage.cells.filter((_, i) => i !== index) })
    setSelectedCellIndex(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const overData = over.data.current as { type: string; col: number; row: number } | undefined
    const activeData = active.data.current as { type: string; printerId: string } | undefined
    if (overData?.type === 'cell' && activeData?.type === 'printer') {
      if (usedSlugsOnActivePage.includes(activeData.printerId)) return  // dobel di halaman sama, cegah
      addCell({ printer: activeData.printerId, col: overData.col, row: overData.row })
    }
  }

  function addPage() {
    const newId = `halaman-${config.pages.length + 1}`
    setConfig((cfg) => ({
      ...cfg,
      pages: [...cfg.pages, { id: newId, grid: { cols: 1, rows: 1 }, fields: FIELD_PRESETS.ringkas, durationSec: 8, cells: [] }],
    }))
    setActivePageIndex(config.pages.length)
  }

  function removePage(index: number) {
    if (config.pages.length <= 1) return  // minimal 1 halaman
    setConfig((cfg) => ({ ...cfg, pages: cfg.pages.filter((_, i) => i !== index) }))
    setActivePageIndex((i) => Math.max(0, i - (index <= i ? 1 : 0)))
  }

  async function handlePublish() {
    setStatus('saving')
    try {
      const res = await fetch('/api/cyd-layout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      const body = await res.json()
      if (!res.ok) { setStatus('error'); return }
      setStatus(body.confirmed ? 'confirmed' : 'timeout')
    } catch {
      setStatus('error')
    }
  }

  const selectedCell = selectedCellIndex !== null ? (activePage.cells[selectedCellIndex] ?? null) : null

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Layout CYD</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">Susun halaman, drag printer/label ke grid, resize baris & sel.</p>
        </div>
        <button
          onClick={handlePublish}
          disabled={status === 'saving'}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {status === 'saving' ? 'Menyimpan...' : 'Simpan & Terapkan'}
        </button>
      </div>

      {status === 'confirmed' && <p className="mb-3 text-green-600 text-sm">✅ Diterapkan ke CYD</p>}
      {status === 'timeout' && <p className="mb-3 text-amber-600 text-sm">⚠️ Tersimpan, tapi device belum konfirmasi (cek koneksi CYD)</p>}
      {status === 'error' && <p className="mb-3 text-red-600 text-sm">Gagal menyimpan, coba lagi.</p>}

      <div className="mb-4">
        <PageTabs
          pages={config.pages}
          activeIndex={activePageIndex}
          onSelect={setActivePageIndex}
          onAdd={addPage}
          onRemove={removePage}
          onReorder={(newPages) => setConfig((cfg) => ({ ...cfg, pages: newPages }))}
        />
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 items-start">
          <PrinterPalette usedSlugsOnActivePage={usedSlugsOnActivePage} />
          <GridCanvas
            page={activePage}
            livePrinters={liveMap}
            selectedCellIndex={selectedCellIndex}
            onSelectCell={setSelectedCellIndex}
            onAddCell={addCell}
            onUpdateCell={updateCell}
            onUpdatePage={updateActivePage}
          />
          <CellSettingsPanel
            cell={selectedCell}
            activePageId={activePage.id}
            onUpdateCell={(cell) => selectedCellIndex !== null && updateCell(selectedCellIndex, cell)}
            onRemoveCell={() => selectedCellIndex !== null && removeCell(selectedCellIndex)}
            pageDurationSec={activePage.durationSec}
            onUpdateDuration={(seconds) => updateActivePage({ durationSec: seconds })}
          />
        </div>
      </DndContext>
    </div>
  )
}
```

- [ ] **Step 2: Build check**

Run: `cd apps/dashboard && pnpm build`
Expected: SUCCESS, route `/cyd-layout` muncul di output build.

- [ ] **Step 3: Verifikasi manual di browser (WAJIB, ini task integrasi utama)**

```bash
cd apps/dashboard && pnpm dev
```

Buka `http://localhost:3000/cyd-layout` (login dulu), verifikasi satu-satu:
1. Palette printer kiri muncul, card bisa di-drag.
2. Drag printer dari palette ke sel kosong grid rak → cell terisi, tampil nama+status+progress kalau ada live data.
3. Klik sel kosong → menu "+" muncul → pilih Label → input teks langsung fokus, bisa diketik.
4. Klik sel terisi → `CellSettingsPanel` kanan tampilkan field preset dropdown (printer) atau input teks (label) + tombol hapus.
5. Sel terpilih → drag handle pojok kanan-bawah → colSpan/rowSpan berubah, cell melebar.
6. Drag garis divider antar-baris → tinggi baris berubah, cell yang sudah ada ikut menyesuaikan posisi visual.
7. Tab "+ Halaman" → halaman baru muncul, bisa pindah-pindah tab, drag reorder tab.
8. Klik "Simpan & Terapkan" → status berubah (confirmed/timeout/error) sesuai respons device.

Kalau ada langkah yang tidak sesuai, JANGAN lanjut ke Task 12 — perbaiki dulu di task ini.

- [ ] **Step 4: Commit `page.tsx`**

```bash
cd apps/dashboard
git add "app/(dashboard)/cyd-layout/page.tsx"
git commit -m "feat(cyd-layout): page.tsx v2 — orkestrasi penuh page-builder (palette+canvas+tabs+settings+publish)"
```

- [ ] **Step 5: Cleanup v1 — hapus `rack-template.ts` + fungsi lama (ditunda dari Task 5, sekarang consumer terakhir sudah diganti)**

Setelah Step 4, `page.tsx` (consumer terakhir `rack-template.ts`/`buildLayoutConfig`/`findDuplicatePrinterIds` v1) sudah diganti versi v2. Sekarang aman dihapus:

```bash
cd apps/dashboard
grep -rl "rack-template\|buildLayoutConfig\|findDuplicatePrinterIds" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v __tests__
```
Expected: tidak ada hasil di luar `lib/cyd-layout/build-config.ts` sendiri (definisi fungsinya) — kalau ada importer lain yang belum ke-cover, JANGAN lanjut hapus, laporkan sebagai temuan.

Kalau bersih:
```bash
git rm lib/cyd-layout/rack-template.ts
```

Edit `lib/cyd-layout/build-config.ts` — hapus fungsi `buildLayoutConfig()` dan `findDuplicatePrinterIds()` v1 (yang sudah tak dipakai lagi), sisakan cuma `validateLayoutConfig()`.

Edit `lib/cyd-layout/__tests__/build-config.test.ts` — hapus test suite v1 (`describe('buildLayoutConfig', ...)`/`describe('findDuplicatePrinterIds', ...)`), sisakan cuma `describe('validateLayoutConfig', ...)`.

Run: `cd apps/dashboard && pnpm vitest run lib/cyd-layout/__tests__/build-config.test.ts && pnpm build`
Expected: test tetap 12/12 (cuma validateLayoutConfig tersisa), build SUCCESS.

```bash
git add lib/cyd-layout/rack-template.ts lib/cyd-layout/build-config.ts lib/cyd-layout/__tests__/build-config.test.ts
git commit -m "refactor(cyd-layout): hapus rack-template.ts + buildLayoutConfig/findDuplicatePrinterIds v1 (consumer terakhir sudah diganti page.tsx v2)"
```

---

### Task 12: Verifikasi hardware end-to-end + migrasi slug final

**Files:** tidak ada file baru — task verifikasi + operasional.

**Interfaces:**
- Consumes: seluruh sistem dari Task 1-11.
- Produces: konfirmasi siap-pakai, TIDAK ADA kode baru.

- [ ] **Step 1: Jalankan migrasi slug (dry-run dulu, verifikasi manual, baru apply)**

```bash
cd apps/dashboard
pnpm tsx scripts/backfill-printer-slug.ts
```

Cocokkan tiap baris output slug yang diusulkan terhadap id MQTT real:
```bash
mosquitto_sub -h 192.168.88.113 -p 1883 -t 3dpb/printers -C 1 | python3 -m json.tool
```

Kalau semua cocok:
```bash
pnpm tsx scripts/backfill-printer-slug.ts --apply
```

Kalau ada yang tidak cocok (mis. slugify hasilkan sesuatu yang beda dari id MQTT existing), edit manual lewat UI Produk→Filamen→Printer (field slug sudah editable per Task 3) SEBELUM apply, atau update manual di DB.

- [ ] **Step 2: Jadikan `slug` required setelah backfill (migration kedua)**

Edit `prisma/schema.prisma`:

```prisma
model Printer {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  model     String   @default("")
  isActive  Boolean  @default(true)
  notes     String   @default("")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Run: `npx prisma migrate dev --name printer_slug_required`
Expected: sukses HANYA kalau semua baris `Printer` sudah punya `slug` non-null (dari Step 1) — kalau masih ada yang null, migration akan gagal, itu sinyal untuk kembali ke Step 1.

- [ ] **Step 3: Deploy dashboard ke `.113`**

```bash
cd apps/dashboard
./deploy.sh build
```

Verifikasi: `docker -H tcp://192.168.88.113:2375 logs shopee-dashboard --tail 10` menunjukkan `Ready in`.

- [ ] **Step 4: Uji end-to-end di hardware fisik**

1. Buka `/cyd-layout` di dashboard produksi, susun layout custom (grid beda dari default, minimal 1 label + 3 printer, resize minimal 1 baris + 1 sel).
2. Klik "Simpan & Terapkan" → tunggu status "confirmed".
3. Lihat layar CYD fisik → verifikasi render sesuai yang disusun (posisi, ukuran cell, teks label, status/progress printer).
4. Buka `/produk` → tab Filamen → Printer → verifikasi badge status + progress bar muncul dan update (refetch tiap 15 detik per `usePrintersLive`).

- [ ] **Step 5: Final report ke user**

Rangkum: migrasi slug selesai (berapa printer di-backfill), deploy sukses, hasil uji end-to-end hardware (poin 1-4 Step 4), dan buka pertanyaan apakah ada penyesuaian visual/interaksi yang masih diperlukan setelah lihat langsung di device.
