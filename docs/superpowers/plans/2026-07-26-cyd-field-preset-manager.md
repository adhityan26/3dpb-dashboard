# CYD Field Preset Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti 2 preset field hardcoded (`FIELD_PRESETS` di `lib/cyd-layout/types.ts`) dengan preset yang bisa di-CRUD via UI (Settings → tab Monitoring), disimpan di DB, dipakai global oleh semua user login.

**Architecture:** Model Prisma `CydFieldPreset` baru → service layer (`lib/cyd-layout/field-preset-service.ts`, pola sama dengan `lib/kalkulator/profiles-service.ts`) → 2 API route (collection + `[id]`) → React Query hooks → 1 komponen Settings card inline (list+form, pola sama `LaborPresetsSection.tsx`) → dua titik konsumsi existing (`CellSettingsPanel.tsx`, `app/(dashboard)/cyd-layout/page.tsx`) dipindah dari const ke hook.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + PostgreSQL, TanStack Query v5, NextAuth (`auth()` helper), Vitest.

Spec lengkap: `docs/superpowers/specs/2026-07-26-cyd-field-preset-manager-design.md`.

## Global Constraints

- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` sebelum tiap `npx`/`pnpm` command.
- Kerja di worktree terpisah: `git worktree add .claude/worktrees/dashboard-work -b dashboard-work` dari root repo SEBELUM Task 1 (skip kalau worktree ini sudah ada dan masih di branch `dashboard-work`, bersih).
- `git add <path spesifik>` — JANGAN `git add -A` / `git add .`.
- 9 `FieldId` yang dikenal firmware (JANGAN ditambah/dikurangi tanpa ubah firmware CYD terpisah): `name, type, state, progress, progressBar, timeLeft, eta, filename, error` — sudah ada di `lib/cyd-layout/types.ts`, dipakai apa adanya.
- Batas firmware dari `LAYOUT_LIMITS` (`lib/cyd-layout/types.ts`, JANGAN diubah nilainya): `maxFieldsPerRow: 3`, `maxRowsPerFieldsPageDefault: 8`, `maxRowsPerFieldsCellOverride: 3`.
- Preset TIDAK direferensikan by-ID dari layout tersimpan — pilih preset = copy field rows ke `cell.fields`/`page.fields` saat itu juga (perilaku existing, jangan diubah).
- Tidak menyentuh `packages/kalkulator-core/src/formula.test.ts` (14 golden test) — di luar scope total.

---

### Task 1: Prisma model + export `validateFieldRows`

**Files:**
- Modify: `apps/dashboard/prisma/schema.prisma`
- Modify: `apps/dashboard/lib/cyd-layout/build-config.ts`
- Test: `apps/dashboard/lib/cyd-layout/__tests__/build-config.test.ts`

**Interfaces:**
- Produces: `export function validateFieldRows(rows: unknown, maxRows: number, context: string): string | null` — dipakai Task 2.
- Produces: Prisma model `CydFieldPreset { id, name, fieldsJson, createdAt, updatedAt }` — dipakai Task 2.

- [ ] **Step 1: Tambah model ke schema.prisma**

Tambahkan di akhir `apps/dashboard/prisma/schema.prisma` (setelah model terakhir di file):

```prisma
// ── CYD Field Preset (layout editor /cyd-layout) ─────────────────────────────

model CydFieldPreset {
  id        String   @id @default(cuid())
  name      String
  fieldsJson String  // JSON FieldRow[] — lihat lib/cyd-layout/types.ts
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Jalankan migration**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx prisma migrate dev --name add_cyd_field_preset
```

Expected: migration baru dibuat di `prisma/migrations/`, `npx prisma generate` jalan otomatis di akhir, tidak ada error.

- [ ] **Step 3: Export `validateFieldRows` di build-config.ts**

Di `apps/dashboard/lib/cyd-layout/build-config.ts`, ubah baris 16 dari:

```ts
function validateFieldRows(rows: unknown, maxRows: number, context: string): string | null {
```

menjadi:

```ts
export function validateFieldRows(rows: unknown, maxRows: number, context: string): string | null {
```

Tidak ada perubahan lain di file ini — fungsi & isi tetap sama persis, cuma ditambah `export`.

- [ ] **Step 4: Jalankan test existing untuk pastikan tidak ada regresi**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx vitest run lib/cyd-layout/__tests__/build-config.test.ts
```

Expected: semua test lama tetap PASS (cuma nambah `export`, tidak ubah behavior).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/prisma/schema.prisma apps/dashboard/prisma/migrations apps/dashboard/lib/cyd-layout/build-config.ts
git commit -m "feat(dashboard): add CydFieldPreset model, export validateFieldRows"
```

---

### Task 2: Service layer

**Files:**
- Create: `apps/dashboard/lib/cyd-layout/field-preset-service.ts`
- Test: `apps/dashboard/lib/cyd-layout/__tests__/field-preset-service.test.ts`

**Interfaces:**
- Consumes: `validateFieldRows` dari Task 1 (`./build-config`), `prisma` dari `@/lib/db`, `LAYOUT_LIMITS`+`FieldRow` dari `./types`.
- Produces: `CydFieldPresetData { id: string; name: string; fields: FieldRow[] }`, `listFieldPresets(): Promise<CydFieldPresetData[]>`, `createFieldPreset(input: { name: string; fields: FieldRow[] }): Promise<CydFieldPresetData>`, `updateFieldPreset(id: string, input: { name?: string; fields?: FieldRow[] }): Promise<CydFieldPresetData>`, `deleteFieldPreset(id: string): Promise<void>`. Semua dipakai Task 3 (API routes).

- [ ] **Step 1: Tulis test dulu (gagal karena file belum ada)**

Buat `apps/dashboard/lib/cyd-layout/__tests__/field-preset-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    cydFieldPreset: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}))

import { listFieldPresets, createFieldPreset, updateFieldPreset, deleteFieldPreset } from '../field-preset-service'

beforeEach(() => {
  mockFindMany.mockReset(); mockCreate.mockReset(); mockUpdate.mockReset(); mockDelete.mockReset()
})

describe('listFieldPresets', () => {
  it('mem-parse fieldsJson tiap row', async () => {
    mockFindMany.mockResolvedValue([
      { id: '1', name: 'Ringkas', fieldsJson: JSON.stringify([['name']]), createdAt: new Date(), updatedAt: new Date() },
    ])
    const result = await listFieldPresets()
    expect(result).toEqual([{ id: '1', name: 'Ringkas', fields: [['name']] }])
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } })
  })

  it('row dengan fieldsJson korup -> fields kosong, tidak throw', async () => {
    mockFindMany.mockResolvedValue([
      { id: '1', name: 'Rusak', fieldsJson: 'not json', createdAt: new Date(), updatedAt: new Date() },
    ])
    const result = await listFieldPresets()
    expect(result).toEqual([{ id: '1', name: 'Rusak', fields: [] }])
  })
})

describe('createFieldPreset', () => {
  it('menolak fields yang melebihi batas 8 baris', async () => {
    const fields = Array.from({ length: 9 }, () => ['name'] as const)
    await expect(createFieldPreset({ name: 'X', fields: fields as never })).rejects.toThrow(/melebihi batas 8 baris/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('menolak fields yang melebihi batas 3 field per baris', async () => {
    await expect(createFieldPreset({ name: 'X', fields: [['name', 'type', 'state', 'progress']] })).rejects.toThrow(/melebihi batas 3 field per baris/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('menolak name kosong', async () => {
    await expect(createFieldPreset({ name: '  ', fields: [['name']] })).rejects.toThrow('NAME_REQUIRED')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('valid -> create dengan fieldsJson ter-serialize, name di-trim', async () => {
    mockCreate.mockResolvedValue({ id: '1', name: 'Custom', fieldsJson: JSON.stringify([['name']]), createdAt: new Date(), updatedAt: new Date() })
    const result = await createFieldPreset({ name: '  Custom  ', fields: [['name']] })
    expect(mockCreate).toHaveBeenCalledWith({ data: { name: 'Custom', fieldsJson: JSON.stringify([['name']]) } })
    expect(result).toEqual({ id: '1', name: 'Custom', fields: [['name']] })
  })
})

describe('updateFieldPreset', () => {
  it('preset tidak ditemukan -> throw NOT_FOUND', async () => {
    mockUpdate.mockRejectedValue({ code: 'P2025' })
    await expect(updateFieldPreset('missing', { name: 'X' })).rejects.toThrow('NOT_FOUND')
  })

  it('valid -> update field yang dikirim saja', async () => {
    mockUpdate.mockResolvedValue({ id: '1', name: 'Baru', fieldsJson: JSON.stringify([['name']]), createdAt: new Date(), updatedAt: new Date() })
    const result = await updateFieldPreset('1', { name: 'Baru' })
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: '1' }, data: { name: 'Baru' } })
    expect(result.name).toBe('Baru')
  })
})

describe('deleteFieldPreset', () => {
  it('preset tidak ditemukan -> throw NOT_FOUND', async () => {
    mockDelete.mockRejectedValue({ code: 'P2025' })
    await expect(deleteFieldPreset('missing')).rejects.toThrow('NOT_FOUND')
  })

  it('valid -> delete dipanggil dengan id', async () => {
    mockDelete.mockResolvedValue({})
    await deleteFieldPreset('1')
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: '1' } })
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal (file belum ada)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx vitest run lib/cyd-layout/__tests__/field-preset-service.test.ts
```

Expected: FAIL — `Cannot find module '../field-preset-service'`.

- [ ] **Step 3: Implementasi service**

Buat `apps/dashboard/lib/cyd-layout/field-preset-service.ts`:

```ts
import { prisma } from '@/lib/db'
import { validateFieldRows } from './build-config'
import { LAYOUT_LIMITS, type FieldRow } from './types'

export interface CydFieldPresetData {
  id: string
  name: string
  fields: FieldRow[]
}

function parseFields(fieldsJson: string): FieldRow[] {
  try {
    const parsed = JSON.parse(fieldsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toData(row: { id: string; name: string; fieldsJson: string }): CydFieldPresetData {
  return { id: row.id, name: row.name, fields: parseFields(row.fieldsJson) }
}

function assertValidFields(fields: FieldRow[]): void {
  const err = validateFieldRows(fields, LAYOUT_LIMITS.maxRowsPerFieldsPageDefault, 'fields')
  if (err) throw new Error(err)
}

async function notFoundOr<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025') {
      throw new Error('NOT_FOUND')
    }
    throw err
  }
}

export async function listFieldPresets(): Promise<CydFieldPresetData[]> {
  const rows = await prisma.cydFieldPreset.findMany({ orderBy: { createdAt: 'asc' } })
  return rows.map(toData)
}

export async function createFieldPreset(input: { name: string; fields: FieldRow[] }): Promise<CydFieldPresetData> {
  const name = input.name.trim()
  if (!name) throw new Error('NAME_REQUIRED')
  assertValidFields(input.fields)
  const row = await prisma.cydFieldPreset.create({
    data: { name, fieldsJson: JSON.stringify(input.fields) },
  })
  return toData(row)
}

export async function updateFieldPreset(id: string, input: { name?: string; fields?: FieldRow[] }): Promise<CydFieldPresetData> {
  const data: { name?: string; fieldsJson?: string } = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new Error('NAME_REQUIRED')
    data.name = name
  }
  if (input.fields !== undefined) {
    assertValidFields(input.fields)
    data.fieldsJson = JSON.stringify(input.fields)
  }
  const row = await notFoundOr(() => prisma.cydFieldPreset.update({ where: { id }, data }))
  return toData(row)
}

export async function deleteFieldPreset(id: string): Promise<void> {
  await notFoundOr(() => prisma.cydFieldPreset.delete({ where: { id } }))
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx vitest run lib/cyd-layout/__tests__/field-preset-service.test.ts
```

Expected: semua test PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/cyd-layout/field-preset-service.ts apps/dashboard/lib/cyd-layout/__tests__/field-preset-service.test.ts
git commit -m "feat(dashboard): CydFieldPreset service layer (list/create/update/delete)"
```

---

### Task 3: API routes

**Files:**
- Create: `apps/dashboard/app/api/cyd-field-presets/route.ts`
- Create: `apps/dashboard/app/api/cyd-field-presets/[id]/route.ts`

**Interfaces:**
- Consumes: `listFieldPresets, createFieldPreset, updateFieldPreset, deleteFieldPreset` dari Task 2 (`@/lib/cyd-layout/field-preset-service`), `auth` dari `@/lib/auth`.
- Produces: `GET/POST /api/cyd-field-presets`, `PATCH/DELETE /api/cyd-field-presets/[id]` — dikonsumsi Task 5 (hooks).

- [ ] **Step 1: Buat route collection**

Buat `apps/dashboard/app/api/cyd-field-presets/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listFieldPresets, createFieldPreset } from '@/lib/cyd-layout/field-preset-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listFieldPresets())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  try {
    return NextResponse.json(await createFieldPreset(body), { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
```

- [ ] **Step 2: Buat route `[id]`**

Buat `apps/dashboard/app/api/cyd-field-presets/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { updateFieldPreset, deleteFieldPreset } from '@/lib/cyd-layout/field-preset-service'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  try {
    return NextResponse.json(await updateFieldPreset(id, body))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await deleteFieldPreset(id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx tsc --noEmit
```

Expected: no errors terkait file baru ini.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/app/api/cyd-field-presets
git commit -m "feat(dashboard): API routes CRUD CydFieldPreset"
```

---

### Task 4: Seed data (Ringkas + Detail)

**Files:**
- Create: `apps/dashboard/scripts/seed-cyd-field-presets.ts`
- Modify: `apps/dashboard/package.json`

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db`.

- [ ] **Step 1: Buat script seed idempoten**

Buat `apps/dashboard/scripts/seed-cyd-field-presets.ts`:

```ts
/**
 * Seed idempoten preset field CYD (Ringkas + Detail) — nilai persis dari
 * FIELD_PRESETS lama (lib/cyd-layout/types.ts) sebelum dipindah ke DB.
 * Aman dijalankan berulang: create-if-missing by name, tidak menimpa data yang sudah ada.
 *
 * Jalankan: pnpm --filter shopee-dashboard db:seed-cyd-presets
 */
import 'dotenv/config'
import { prisma } from '@/lib/db'

const PRESETS = [
  { name: 'Ringkas', fields: [['name'], ['state', 'progress'], ['progressBar']] },
  {
    name: 'Detail',
    fields: [
      ['name', 'type'],
      ['state', 'progress'],
      ['progressBar'],
      [{ id: 'timeLeft', label: 'Sisa' }, { id: 'eta', label: 'ETA' }],
      ['filename'],
    ],
  },
] as const

async function main() {
  for (const p of PRESETS) {
    const existing = await prisma.cydFieldPreset.findFirst({ where: { name: p.name } })
    if (existing) {
      console.log(`skip   ${p.name} (sudah ada)`)
      continue
    }
    await prisma.cydFieldPreset.create({ data: { name: p.name, fieldsJson: JSON.stringify(p.fields) } })
    console.log(`create ${p.name}`)
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
```

- [ ] **Step 2: Tambah script ke package.json**

Di `apps/dashboard/package.json`, tambahkan baris baru persis setelah baris `"db:seed-kalk-v2": "tsx scripts/seed-kalkulator-v2.ts",`:

```json
    "db:seed-cyd-presets": "tsx scripts/seed-cyd-field-presets.ts",
```

- [ ] **Step 3: Jalankan seed, verifikasi idempoten (jalankan 2x)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && pnpm db:seed-cyd-presets && pnpm db:seed-cyd-presets
```

Expected: run pertama `create Ringkas` + `create Detail`; run kedua `skip Ringkas (sudah ada)` + `skip Detail (sudah ada)`.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/scripts/seed-cyd-field-presets.ts apps/dashboard/package.json
git commit -m "feat(dashboard): seed script preset CYD Ringkas+Detail"
```

---

### Task 5: React Query hooks

**Files:**
- Create: `apps/dashboard/lib/hooks/use-cyd-field-presets.ts`

**Interfaces:**
- Consumes: `CydFieldPresetData` dari `@/lib/cyd-layout/field-preset-service` (type-only import), API routes dari Task 3.
- Produces: `useCydFieldPresets()`, `useCreateCydFieldPreset()`, `useUpdateCydFieldPreset()`, `useDeleteCydFieldPreset()` — dikonsumsi Task 6 & 7.

- [ ] **Step 1: Implementasi hooks**

Buat `apps/dashboard/lib/hooks/use-cyd-field-presets.ts`:

```ts
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CydFieldPresetData } from '@/lib/cyd-layout/field-preset-service'
import type { FieldRow } from '@/lib/cyd-layout/types'

const CYD_FIELD_PRESETS_KEY = ['cyd-field-presets'] as const

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  const contentLength = res.headers.get('content-length')
  if (res.status === 204 || contentLength === '0' || !res.body) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function useCydFieldPresets() {
  return useQuery({
    queryKey: CYD_FIELD_PRESETS_KEY,
    queryFn: () => apiFetch<CydFieldPresetData[]>('/api/cyd-field-presets'),
  })
}

export function useCreateCydFieldPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; fields: FieldRow[] }) =>
      apiFetch<CydFieldPresetData>('/api/cyd-field-presets', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CYD_FIELD_PRESETS_KEY }),
  })
}

export function useUpdateCydFieldPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; fields?: FieldRow[] }) =>
      apiFetch<CydFieldPresetData>(`/api/cyd-field-presets/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CYD_FIELD_PRESETS_KEY }),
  })
}

export function useDeleteCydFieldPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/cyd-field-presets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CYD_FIELD_PRESETS_KEY }),
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/lib/hooks/use-cyd-field-presets.ts
git commit -m "feat(dashboard): React Query hooks CydFieldPreset"
```

---

### Task 6: UI — Settings card (list + form builder)

**Files:**
- Create: `apps/dashboard/components/settings/CydFieldPresetCard.tsx`
- Modify: `apps/dashboard/app/(dashboard)/settings/page.tsx`
- Test: `apps/dashboard/components/settings/__tests__/CydFieldPresetCard.test.tsx`

**Interfaces:**
- Consumes: `useCydFieldPresets, useCreateCydFieldPreset, useUpdateCydFieldPreset, useDeleteCydFieldPreset` dari Task 5, `FieldId, FieldRow` dari `@/lib/cyd-layout/types`, `LAYOUT_LIMITS` dari `@/lib/cyd-layout/types`.

- [ ] **Step 1: Implementasi komponen**

Buat `apps/dashboard/components/settings/CydFieldPresetCard.tsx`. Pola list+form inline mengikuti `LaborPresetsSection.tsx`, dibungkus chrome top-level card seperti `CydDeviceCard.tsx`. Builder baris field: tiap baris array dropdown `FieldId` (max `LAYOUT_LIMITS.maxFieldsPerRow`=3) + input label opsional per field, baris bisa ditambah sampai `LAYOUT_LIMITS.maxRowsPerFieldsPageDefault`=8.

```tsx
'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCydFieldPresets, useCreateCydFieldPreset, useUpdateCydFieldPreset, useDeleteCydFieldPreset,
} from '@/lib/hooks/use-cyd-field-presets'
import { LAYOUT_LIMITS, type FieldId, type FieldRow } from '@/lib/cyd-layout/types'

const FIELD_ID_OPTIONS: { value: FieldId; label: string }[] = [
  { value: 'name', label: 'Nama printer' },
  { value: 'type', label: 'Tipe' },
  { value: 'state', label: 'Status' },
  { value: 'progress', label: 'Progress %' },
  { value: 'progressBar', label: 'Progress bar' },
  { value: 'timeLeft', label: 'Sisa waktu' },
  { value: 'eta', label: 'ETA' },
  { value: 'filename', label: 'Nama file' },
  { value: 'error', label: 'Error' },
]

interface BuilderField { id: FieldId; label: string }
type BuilderRow = BuilderField[]

const EMPTY_FIELD: BuilderField = { id: 'name', label: '' }

function rowsToFieldRows(rows: BuilderRow[]): FieldRow[] {
  return rows
    .filter((row) => row.length > 0)
    .map((row) => row.map((f) => (f.label.trim() ? { id: f.id, label: f.label.trim() } : f.id)))
}

function fieldRowsToBuilderRows(fields: FieldRow[]): BuilderRow[] {
  if (fields.length === 0) return [[{ ...EMPTY_FIELD }]]
  return fields.map((row) =>
    row.map((entry) => (typeof entry === 'string' ? { id: entry, label: '' } : { id: entry.id, label: entry.label ?? '' }))
  )
}

function previewRow(row: FieldRow[number]): string {
  return row.map((entry) => (typeof entry === 'string' ? entry : entry.label ?? entry.id)).join('+')
}

export function CydFieldPresetCard() {
  const qc = useQueryClient()
  const { data: presets, isLoading } = useCydFieldPresets()
  const createMut = useCreateCydFieldPreset()
  const updateMut = useUpdateCydFieldPreset()
  const deleteMut = useDeleteCydFieldPreset()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [rows, setRows] = useState<BuilderRow[]>([[{ ...EMPTY_FIELD }]])
  const [error, setError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  function resetForm() {
    setEditingId(null); setName(''); setRows([[{ ...EMPTY_FIELD }]]); setError(null)
  }

  function loadPreset(id: string, presetName: string, fields: FieldRow[]) {
    setEditingId(id); setName(presetName); setRows(fieldRowsToBuilderRows(fields)); setError(null)
  }

  function setFieldAt(rowIdx: number, fieldIdx: number, patch: Partial<BuilderField>) {
    setRows((rs) => rs.map((row, ri) => ri !== rowIdx ? row : row.map((f, fi) => fi === fieldIdx ? { ...f, ...patch } : f)))
  }

  function addFieldTo(rowIdx: number) {
    setRows((rs) => rs.map((row, ri) => ri === rowIdx && row.length < LAYOUT_LIMITS.maxFieldsPerRow ? [...row, { ...EMPTY_FIELD }] : row))
  }

  function removeFieldFrom(rowIdx: number, fieldIdx: number) {
    setRows((rs) => rs.map((row, ri) => ri !== rowIdx ? row : row.filter((_, fi) => fi !== fieldIdx)).filter((row) => row.length > 0))
  }

  function addRow() {
    setRows((rs) => rs.length < LAYOUT_LIMITS.maxRowsPerFieldsPageDefault ? [...rs, [{ ...EMPTY_FIELD }]] : rs)
  }

  function removeRow(rowIdx: number) {
    setRows((rs) => rs.length > 1 ? rs.filter((_, ri) => ri !== rowIdx) : rs)
  }

  async function handleSubmit() {
    setError(null)
    const fields = rowsToFieldRows(rows)
    if (!name.trim() || fields.length === 0) {
      setError('Isi nama preset dan minimal 1 baris field')
      return
    }
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, name: name.trim(), fields })
      } else {
        await createMut.mutateAsync({ name: name.trim(), fields })
      }
      resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  const saving = createMut.isPending || updateMut.isPending

  return (
    <div className="rounded-[5px] p-5 space-y-4 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">🧩 Field Preset CYD</div>
        <div className="text-xs mt-0.5 g-t4">Kombinasi informasi yang ditampilkan per-sel/per-halaman di layout CYD (Ringkas/Detail + custom).</div>
      </div>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1.5">
        {(presets ?? []).map((p) => (
          <div key={p.id} className="px-2 py-1.5 rounded-[5px]" style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs g-t2 flex-1 font-medium">{p.name}</span>
              <button onClick={() => loadPreset(p.id, p.name, p.fields)} className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">✎</button>
              <button
                onClick={() => deleteMut.mutate(p.id, {
                  onError: (e) => { setRowError(e instanceof Error ? e.message : 'Gagal'); qc.invalidateQueries({ queryKey: ['cyd-field-presets'] }) },
                  onSuccess: () => { setRowError(null); if (editingId === p.id) resetForm() },
                })}
                disabled={deleteMut.isPending}
                className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1 disabled:opacity-40"
              >✕</button>
            </div>
            <div className="text-[10px] g-t5 mt-0.5">{p.fields.map(previewRow).join(' · ')}</div>
          </div>
        ))}
        {(presets ?? []).length === 0 && !isLoading && (
          <div className="text-xs g-t5 text-center py-2">Belum ada preset.</div>
        )}
      </div>
      {rowError && <div className="text-xs text-red-400 mt-2">{rowError}</div>}

      <div>
        <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Nama preset</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Compact ETA"
          className="glass-input w-full h-9 rounded-[5px] px-3 text-sm" />
      </div>

      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex items-center gap-1.5 flex-wrap">
            {row.map((field, fieldIdx) => (
              <div key={fieldIdx} className="flex items-center gap-1">
                <select value={field.id} onChange={(e) => setFieldAt(rowIdx, fieldIdx, { id: e.target.value as FieldId })}
                  className="glass-input h-8 rounded-[5px] px-2 text-xs">
                  {FIELD_ID_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <input value={field.label} onChange={(e) => setFieldAt(rowIdx, fieldIdx, { label: e.target.value })}
                  placeholder="label (opsional)" className="glass-input h-8 w-28 rounded-[5px] px-2 text-xs" />
                <button onClick={() => removeFieldFrom(rowIdx, fieldIdx)} className="text-[10px] g-t4 hover:text-red-400 transition-colors">✕</button>
              </div>
            ))}
            {row.length < LAYOUT_LIMITS.maxFieldsPerRow && (
              <button onClick={() => addFieldTo(rowIdx)} className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">+ field</button>
            )}
            <button onClick={() => removeRow(rowIdx)} className="text-[10px] g-t5 hover:text-red-400 transition-colors ml-auto">hapus baris</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {rows.length < LAYOUT_LIMITS.maxRowsPerFieldsPageDefault && (
          <button onClick={addRow} className="text-xs px-2.5 py-1 rounded-md g-t4 transition-colors"
            style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            + baris
          </button>
        )}
        <button onClick={handleSubmit} disabled={saving}
          className="text-xs px-3 py-1.5 rounded-md text-white disabled:opacity-50 transition-colors"
          style={{ background: 'linear-gradient(135deg, #5055e8, #7c84f8)' }}>
          {editingId ? 'Update preset' : 'Simpan preset'}
        </button>
        {editingId && (
          <button onClick={resetForm} className="text-xs px-3 py-1.5 rounded-md g-t4 transition-colors"
            style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            Batal
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Wire ke halaman Settings**

Di `apps/dashboard/app/(dashboard)/settings/page.tsx`:

Tambah import setelah baris `import { CydDeviceCard } from "@/components/settings/CydDeviceCard"`:

```ts
import { CydFieldPresetCard } from "@/components/settings/CydFieldPresetCard"
```

Ubah blok tab `"monitoring"` dari:

```tsx
        {activeTab === "monitoring" && (
          <div className="space-y-4">
            <CydDeviceCard />
          </div>
        )}
```

menjadi:

```tsx
        {activeTab === "monitoring" && (
          <div className="space-y-4">
            <CydDeviceCard />
            <CydFieldPresetCard />
          </div>
        )}
```

- [ ] **Step 3: Tulis test dasar**

Buat `apps/dashboard/components/settings/__tests__/CydFieldPresetCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CydFieldPresetCard } from '../CydFieldPresetCard'

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('CydFieldPresetCard', () => {
  it('render daftar preset dari fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () => JSON.stringify([{ id: '1', name: 'Ringkas', fields: [['name']] }]),
    }) as unknown as typeof fetch
    renderWithClient(<CydFieldPresetCard />)
    await waitFor(() => expect(screen.getByText('Ringkas')).toBeInTheDocument())
  })

  it('tombol simpan disabled state tidak menyebabkan crash saat nama kosong', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, headers: { get: () => null }, text: async () => JSON.stringify([]),
    }) as unknown as typeof fetch
    renderWithClient(<CydFieldPresetCard />)
    await waitFor(() => expect(screen.getByText('Belum ada preset.')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Simpan preset'))
    await waitFor(() => expect(screen.getByText(/Isi nama preset/)).toBeInTheDocument())
  })
})
```

Cek dulu apakah `@testing-library/react` sudah jadi dependency (`grep '"@testing-library/react"' apps/dashboard/package.json`). Kalau belum ada, cek pola test komponen lain yang sudah ada di repo ini (`find apps/dashboard/components -name "*.test.tsx"`) dan ikuti library/pola yang SUDAH dipakai — jangan tambah dependency baru tanpa perlu.

- [ ] **Step 4: Jalankan test**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx vitest run components/settings/__tests__/CydFieldPresetCard.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/components/settings/CydFieldPresetCard.tsx apps/dashboard/components/settings/__tests__/CydFieldPresetCard.test.tsx "apps/dashboard/app/(dashboard)/settings/page.tsx"
git commit -m "feat(dashboard): UI kelola CydFieldPreset di Settings > Monitoring"
```

---

### Task 7: Migrasi 2 titik konsumsi ke hook, hapus const lama

**Files:**
- Modify: `apps/dashboard/components/cyd-layout/CellSettingsPanel.tsx`
- Modify: `apps/dashboard/app/(dashboard)/cyd-layout/page.tsx`
- Modify: `apps/dashboard/lib/cyd-layout/types.ts`
- Test: `apps/dashboard/components/cyd-layout/__tests__/PageTabs.test.tsx` (cek tidak ada regresi, TIDAK perlu diubah kecuali test-nya ternyata mengimpor `FIELD_PRESETS`)

**Interfaces:**
- Consumes: `useCydFieldPresets` dari Task 5.

- [ ] **Step 1: Cek pemakaian `FIELD_PRESETS`/`FieldPresetKey` lain sebelum hapus**

```bash
grep -rn "FIELD_PRESETS\|FieldPresetKey" apps/dashboard --include="*.ts" --include="*.tsx"
```

Catat semua hasil selain `types.ts`, `CellSettingsPanel.tsx`, dan `app/(dashboard)/cyd-layout/page.tsx` — kalau ada file lain yang belum ter-cover di plan ini, tangani sebelum lanjut ke step berikut (jangan hapus const kalau masih ada pemakai yang tidak ke-update).

- [ ] **Step 2: Update `CellSettingsPanel.tsx`**

Ganti import di baris 5-6 dari:

```ts
import type { LayoutCellOut, FieldPresetKey } from '@/lib/cyd-layout/types'
import { FIELD_PRESETS, LAYOUT_LIMITS } from '@/lib/cyd-layout/types'
```

menjadi:

```ts
import type { LayoutCellOut } from '@/lib/cyd-layout/types'
import { LAYOUT_LIMITS } from '@/lib/cyd-layout/types'
import { useCydFieldPresets } from '@/lib/hooks/use-cyd-field-presets'
```

Ganti blok baris 8-15 (definisi `CELL_OVERRIDE_PRESETS`/`PRESET_LABELS` module-level) — hapus keduanya, karena sekarang sumbernya dinamis dari hook, bukan const module-level.

Di dalam fungsi komponen `CellSettingsPanel`, tambahkan setelah baris `export function CellSettingsPanel({ ... }) {`:

```ts
  const { data: allPresets } = useCydFieldPresets()
  const cellOverridePresets = (allPresets ?? []).filter((p) => p.fields.length <= LAYOUT_LIMITS.maxRowsPerFieldsCellOverride)
```

Ganti `handlePresetChange` dari:

```ts
  function handlePresetChange(preset: FieldPresetKey) {
    if (!cell || ('type' in cell && cell.type === 'label')) return
    onUpdateCell({ ...cell, fields: FIELD_PRESETS[preset] })
  }
```

menjadi:

```ts
  function handlePresetChange(presetId: string) {
    if (!cell || ('type' in cell && cell.type === 'label')) return
    const preset = cellOverridePresets.find((p) => p.id === presetId)
    if (!preset) return
    onUpdateCell({ ...cell, fields: preset.fields })
  }
```

Ganti blok dropdown (sekitar baris 100-114) dari:

```tsx
                  <select
                    className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
                    onChange={(e) => handlePresetChange(e.target.value as FieldPresetKey)}
                  >
                    {CELL_OVERRIDE_PRESETS.map((key) => (
                      <option key={key} value={key}>{PRESET_LABELS[key]}</option>
                    ))}
                  </select>
                  {CELL_OVERRIDE_PRESETS.length < Object.keys(FIELD_PRESETS).length && (
                    <span className="g-t4 mt-1 block text-[10px] leading-relaxed">
                      Preset dengan baris lebih banyak cuma bisa jadi default halaman, bukan per-sel (batas firmware).
                    </span>
                  )}
```

menjadi:

```tsx
                  <select
                    className="glass-input mt-1 w-full rounded-[5px] px-2 py-1.5 text-xs"
                    onChange={(e) => handlePresetChange(e.target.value)}
                  >
                    {cellOverridePresets.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {(allPresets ?? []).length > cellOverridePresets.length && (
                    <span className="g-t4 mt-1 block text-[10px] leading-relaxed">
                      Preset dengan baris lebih banyak cuma bisa jadi default halaman, bukan per-sel (batas firmware).
                    </span>
                  )}
```

- [ ] **Step 3: Update `app/(dashboard)/cyd-layout/page.tsx`**

Ganti import baris 11 dari:

```ts
import { FIELD_PRESETS } from '@/lib/cyd-layout/types'
```

menjadi:

```ts
import { useCydFieldPresets } from '@/lib/hooks/use-cyd-field-presets'
```

Ubah `DEFAULT_CONFIG` (baris 14-19) — sekarang tidak bisa lagi jadi module-level const karena butuh data dari hook. Ganti jadi function:

```ts
function defaultConfig(defaultFields: LayoutPageOut['fields']): LayoutConfigOut {
  return {
    schemaVersion: 1,
    pages: [
      { id: 'rack', grid: { cols: 10, rows: 8 }, fields: defaultFields, durationSec: 0, cells: [] },
    ],
  }
}
```

Di dalam `export default function CydLayoutPage() {`, tambahkan sebelum `const [config, setConfig] = useState<LayoutConfigOut>(DEFAULT_CONFIG)`:

```ts
  const { data: fieldPresets } = useCydFieldPresets()
  const defaultFields = fieldPresets?.[0]?.fields ?? []
```

Ganti baris `const [config, setConfig] = useState<LayoutConfigOut>(DEFAULT_CONFIG)` menjadi:

```ts
  const [config, setConfig] = useState<LayoutConfigOut>(() => defaultConfig(defaultFields))
```

Catatan: `useState` inisial cuma jalan sekali saat mount pertama, sebelum `fieldPresets` mungkin sudah ke-load dari network — ini SAMA seperti behavior sekarang di mana user tetap bisa langsung pakai halaman sebelum data lain (printer list) selesai fetch, konsisten dengan pola `useEffect` fetch printer di baris 38-40 yang juga async setelah mount. Terima kondisi awal `defaultFields=[]` sampai query resolve; tidak perlu loading-gate tambahan (di luar scope, halaman sudah render sebelum banyak data lain siap).

Ganti baris `const nextPageNumberRef = useRef(DEFAULT_CONFIG.pages.length + 1)` menjadi:

```ts
  const nextPageNumberRef = useRef(2)
```

(`DEFAULT_CONFIG.pages.length` selalu bernilai 1 di kode lama karena config awal selalu 1 halaman — `defaultConfig()` juga selalu menghasilkan 1 halaman, jadi `2` di sini adalah nilai yang sama persis, cuma ditulis literal karena sumbernya sudah bukan const module-level.)

Cari fungsi `addPage()` (sekitar baris 128), ganti:

```ts
      pages: [...cfg.pages, { id: newId, grid: { cols: 10, rows: 8 }, fields: FIELD_PRESETS.ringkas, durationSec: 8, cells: [] }],
```

menjadi:

```ts
      pages: [...cfg.pages, { id: newId, grid: { cols: 10, rows: 8 }, fields: defaultFields, durationSec: 8, cells: [] }],
```

- [ ] **Step 4: Hapus `FIELD_PRESETS`/`FieldPresetKey` dari `types.ts`**

Di `apps/dashboard/lib/cyd-layout/types.ts`, hapus baris 40-52 (komentar + const `FIELD_PRESETS` + type `FieldPresetKey`). Sisa file (tipe `FieldId`, `FieldRow`, `LayoutCellOut`, dst, dan `LAYOUT_LIMITS`) TIDAK berubah.

- [ ] **Step 5: Typecheck full**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx tsc --noEmit
```

Expected: no errors — kalau ada import `FIELD_PRESETS`/`FieldPresetKey` yang kelewat dari Step 1, akan muncul di sini.

- [ ] **Step 6: Jalankan seluruh test cyd-layout**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx vitest run lib/cyd-layout components/cyd-layout
```

Expected: semua PASS. Kalau `PageTabs.test.tsx` gagal karena bergantung ke `FIELD_PRESETS`, sesuaikan test itu untuk pakai fixture `FieldRow[]` langsung (bukan import const yang sudah dihapus) — TIDAK boleh re-export `FIELD_PRESETS` cuma demi lolos test lama.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/components/cyd-layout/CellSettingsPanel.tsx "apps/dashboard/app/(dashboard)/cyd-layout/page.tsx" apps/dashboard/lib/cyd-layout/types.ts
git commit -m "refactor(dashboard): CYD layout editor pakai CydFieldPreset dari DB, hapus const FIELD_PRESETS"
```

(Kalau Step 6 memaksa perubahan di `PageTabs.test.tsx`, tambahkan file itu ke `git add` juga di commit ini.)

---

### Task 8: Verifikasi akhir + seed di lingkungan dev

**Files:** tidak ada file baru — task verifikasi.

- [ ] **Step 1: Full test suite dashboard**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx vitest run --passWithNoTests
```

Expected: semua PASS, 0 failed.

- [ ] **Step 2: Full typecheck**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Jalankan seed di DB dev**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && pnpm db:seed-cyd-presets
```

Expected: `create Ringkas`, `create Detail` (atau `skip` kalau sudah pernah dijalankan sebelumnya di sesi ini).

- [ ] **Step 4: Manual check halaman /settings?tab=monitoring dan /cyd-layout**

Kalau ada akses browser preview: buka `/settings?tab=monitoring`, pastikan card "Field Preset CYD" muncul berisi Ringkas+Detail; buka `/cyd-layout`, pilih sel printer, pastikan dropdown "Field preset" berisi preset yang sama (Ringkas saja untuk override-sel, Detail difilter karena 5 baris > batas 3). Kalau tidak ada akses browser di environment ini, laporkan eksplisit ke user bahwa ini belum diverifikasi visual — JANGAN klaim "sudah bekerja" tanpa verifikasi.
