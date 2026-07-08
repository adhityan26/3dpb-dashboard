# Filamen Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Filamen sub-tab under Produk with two sections — Spool (manage physical filament spools with NFC/barcode/BT printing) and Urutan AMS (per-variant slot mapping linked to spool status).

**Architecture:** SQLite stores three new tables (Spool, AmsSlot, FilamentCatalog). Next.js API routes handle CRUD. React Query hooks feed the UI. All browser-facing hardware features (Web NFC, Web Bluetooth, camera scan) live in client-only components behind capability checks.

**Tech Stack:** Prisma (SQLite), Next.js App Router API routes, React Query v5, `qrcode` (QR generation), `xlsx` (one-time Excel import), `@types/web-bluetooth` + `@types/w3c-web-nfc` (TypeScript types for hardware APIs).

---

### Task 1: Install dependencies

**Files:**
- Modify: `shopee-dashboard/package.json`

- [ ] **Step 1: Install runtime and type packages**

```bash
cd shopee-dashboard
npm install qrcode xlsx
npm install --save-dev @types/qrcode @types/w3c-web-nfc @types/web-bluetooth vitest @vitejs/plugin-react
```

- [ ] **Step 2: Add vitest config**

Create `shopee-dashboard/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 3: Add test script to package.json**

In `shopee-dashboard/package.json`, add to `scripts`:
```json
"test": "vitest run"
```

- [ ] **Step 4: Verify**

```bash
cd shopee-dashboard && npm test
```
Expected: "No test files found" (passes with 0 tests)

- [ ] **Step 5: Commit**

```bash
cd shopee-dashboard && git add package.json vitest.config.ts package-lock.json
git commit -m "chore: install filamen deps (qrcode, xlsx, vitest)"
```

---

### Task 2: Prisma schema — add Spool, AmsSlot, FilamentCatalog

**Files:**
- Modify: `shopee-dashboard/prisma/schema.prisma`
- Create: `shopee-dashboard/prisma/migrations/` (auto-generated)

- [ ] **Step 1: Add models to schema.prisma**

Append after the last model in `shopee-dashboard/prisma/schema.prisma`:

```prisma
model FilamentCatalog {
  id         String   @id @default(cuid())
  brand      String
  material   String
  colorName  String
  colorHex   String
  syncedAt   DateTime @default(now())
  spools     Spool[]

  @@unique([brand, material, colorName])
  @@index([brand])
}

model Spool {
  id              String           @id @default(cuid())
  catalogId       String?
  catalog         FilamentCatalog? @relation(fields: [catalogId], references: [id])
  brand           String
  material        String
  colorName       String
  colorHex        String
  status          String           @default("new")  // new|full|mid|low|empty
  barcode         String           @unique @default(cuid())
  nfcTagId        String?          @unique
  notes           String           @default("")
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  amsSlots        AmsSlot[]
}

model AmsSlot {
  id            String   @id @default(cuid())
  productType   String   // swoosh|clickers
  variantName   String
  slotNumber    Int      // 1–8
  filamentName  String   // display name from Excel
  spoolId       String?
  spool         Spool?   @relation(fields: [spoolId], references: [id])

  @@unique([productType, variantName, slotNumber])
  @@index([productType])
  @@index([spoolId])
}
```

- [ ] **Step 2: Run migration**

```bash
cd shopee-dashboard && npx prisma migrate dev --name add_filamen_tables
```
Expected: Migration applied, `prisma/migrations/YYYYMMDD.../migration.sql` created.

- [ ] **Step 3: Verify Prisma client regenerated**

```bash
cd shopee-dashboard && npx prisma generate
```
Expected: "Generated Prisma Client"

- [ ] **Step 4: Commit**

```bash
cd shopee-dashboard && git add prisma/
git commit -m "feat: add Spool, AmsSlot, FilamentCatalog prisma models"
```

---

### Task 3: TypeScript types

**Files:**
- Create: `shopee-dashboard/lib/filamen/types.ts`

- [ ] **Step 1: Write types**

Create `shopee-dashboard/lib/filamen/types.ts`:
```typescript
export type SpoolStatus = 'new' | 'full' | 'mid' | 'low' | 'empty'
export type ProductType = 'swoosh' | 'clickers'

export interface SpoolData {
  id: string
  brand: string
  material: string
  colorName: string
  colorHex: string
  status: SpoolStatus
  barcode: string
  nfcTagId: string | null
  notes: string
  createdAt: string
  updatedAt: string
  /** How many AMS slots this spool is assigned to */
  assignedSlotCount: number
}

export interface SpoolsResponse {
  spools: SpoolData[]
  kpi: {
    total: number
    byStatus: Record<SpoolStatus, number>
  }
}

export interface FilamentCatalogEntry {
  id: string
  brand: string
  material: string
  colorName: string
  colorHex: string
}

export interface AmsSlotData {
  id: string
  productType: ProductType
  variantName: string
  slotNumber: number
  filamentName: string
  spoolId: string | null
  spool: Pick<SpoolData, 'id' | 'barcode' | 'status' | 'colorHex' | 'brand' | 'colorName'> | null
}

export interface AmsVariant {
  variantName: string
  slots: AmsSlotData[]
  hasLowSpool: boolean
}

export interface AmsSectionResponse {
  swoosh: AmsVariant[]
  clickers: AmsVariant[]
}

export const SPOOL_STATUS_COLORS: Record<SpoolStatus, string> = {
  new: '#818cf8',
  full: '#4ade80',
  mid: '#facc15',
  low: '#f97316',
  empty: '#6b7280',
}

export const SPOOL_STATUS_LABELS: Record<SpoolStatus, string> = {
  new: 'NEW',
  full: 'FULL',
  mid: 'MID',
  low: 'LOW',
  empty: 'EMPTY',
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd shopee-dashboard && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd shopee-dashboard && git add lib/filamen/types.ts
git commit -m "feat: add filamen TypeScript types"
```

---

### Task 4: FilamentCatalog service + SpoolmanDB sync

**Files:**
- Create: `shopee-dashboard/lib/filamen/catalog-service.ts`
- Create: `shopee-dashboard/app/api/filamen/catalog/route.ts`

SpoolmanDB JSON structure: `https://raw.githubusercontent.com/Donkie/SpoolmanDB/master/filaments.json`
Each entry has: `manufacturer.name`, `material`, `name` (color name), `color_hex`.

- [ ] **Step 1: Write catalog service**

Create `shopee-dashboard/lib/filamen/catalog-service.ts`:
```typescript
import { prisma } from '@/lib/db'
import type { FilamentCatalogEntry } from './types'

interface SpoolmanFilament {
  manufacturer: { name: string }
  material: string
  name: string
  color_hex?: string
}

export async function syncCatalogFromSpoolmanDB(): Promise<{ count: number }> {
  const res = await fetch(
    'https://raw.githubusercontent.com/Donkie/SpoolmanDB/master/filaments.json',
    { next: { revalidate: 0 } }
  )
  if (!res.ok) throw new Error(`SpoolmanDB fetch failed: ${res.status}`)

  const filaments: SpoolmanFilament[] = await res.json()

  let count = 0
  for (const f of filaments) {
    if (!f.color_hex) continue
    await prisma.filamentCatalog.upsert({
      where: {
        brand_material_colorName: {
          brand: f.manufacturer.name,
          material: f.material,
          colorName: f.name,
        },
      },
      update: { colorHex: f.color_hex, syncedAt: new Date() },
      create: {
        brand: f.manufacturer.name,
        material: f.material,
        colorName: f.name,
        colorHex: f.color_hex,
      },
    })
    count++
  }

  return { count }
}

export async function getCatalog(): Promise<FilamentCatalogEntry[]> {
  const rows = await prisma.filamentCatalog.findMany({
    orderBy: [{ brand: 'asc' }, { material: 'asc' }, { colorName: 'asc' }],
  })
  return rows.map((r) => ({
    id: r.id,
    brand: r.brand,
    material: r.material,
    colorName: r.colorName,
    colorHex: r.colorHex,
  }))
}

export async function getCatalogGrouped(): Promise<
  Record<string, Record<string, FilamentCatalogEntry[]>>
> {
  const entries = await getCatalog()
  const grouped: Record<string, Record<string, FilamentCatalogEntry[]>> = {}
  for (const e of entries) {
    grouped[e.brand] ??= {}
    grouped[e.brand][e.material] ??= []
    grouped[e.brand][e.material].push(e)
  }
  return grouped
}
```

- [ ] **Step 2: Write catalog API route**

Create `shopee-dashboard/app/api/filamen/catalog/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getCatalogGrouped, syncCatalogFromSpoolmanDB } from '@/lib/filamen/catalog-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const grouped = await getCatalogGrouped()
  return NextResponse.json({ catalog: grouped })
}

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await syncCatalogFromSpoolmanDB()
  return NextResponse.json(result)
}
```

- [ ] **Step 3: Verify lint**

```bash
cd shopee-dashboard && npm run lint
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd shopee-dashboard && git add lib/filamen/catalog-service.ts app/api/filamen/catalog/route.ts
git commit -m "feat: SpoolmanDB catalog sync service + API route"
```

---

### Task 5: Spool service + API routes

**Files:**
- Create: `shopee-dashboard/lib/filamen/spool-service.ts`
- Create: `shopee-dashboard/app/api/filamen/spools/route.ts`
- Create: `shopee-dashboard/app/api/filamen/spools/[id]/route.ts`
- Create: `shopee-dashboard/app/api/filamen/spools/scan/route.ts`

- [ ] **Step 1: Write spool service**

Create `shopee-dashboard/lib/filamen/spool-service.ts`:
```typescript
import { prisma } from '@/lib/db'
import type { SpoolData, SpoolStatus, SpoolsResponse } from './types'

function toSpoolData(
  s: Awaited<ReturnType<typeof prisma.spool.findFirst>> & { _count?: { amsSlots: number } }
): SpoolData {
  if (!s) throw new Error('null spool')
  return {
    id: s.id,
    brand: s.brand,
    material: s.material,
    colorName: s.colorName,
    colorHex: s.colorHex,
    status: s.status as SpoolStatus,
    barcode: s.barcode,
    nfcTagId: s.nfcTagId ?? null,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    assignedSlotCount: s._count?.amsSlots ?? 0,
  }
}

export async function listSpools(): Promise<SpoolsResponse> {
  const spools = await prisma.spool.findMany({
    orderBy: [{ brand: 'asc' }, { colorName: 'asc' }, { createdAt: 'asc' }],
    include: { _count: { select: { amsSlots: true } } },
  })

  const byStatus = { new: 0, full: 0, mid: 0, low: 0, empty: 0 } as Record<SpoolStatus, number>
  for (const s of spools) byStatus[s.status as SpoolStatus]++

  return {
    spools: spools.map(toSpoolData),
    kpi: { total: spools.length, byStatus },
  }
}

export async function getSpoolByBarcode(barcode: string): Promise<SpoolData | null> {
  const s = await prisma.spool.findUnique({
    where: { barcode },
    include: { _count: { select: { amsSlots: true } } },
  })
  return s ? toSpoolData(s) : null
}

export async function getSpoolByNfc(nfcTagId: string): Promise<SpoolData | null> {
  const s = await prisma.spool.findUnique({
    where: { nfcTagId },
    include: { _count: { select: { amsSlots: true } } },
  })
  return s ? toSpoolData(s) : null
}

export interface CreateSpoolInput {
  brand: string
  material: string
  colorName: string
  colorHex: string
  catalogId?: string
  nfcTagId?: string
  notes?: string
}

export async function createSpool(input: CreateSpoolInput): Promise<SpoolData> {
  const s = await prisma.spool.create({
    data: {
      brand: input.brand,
      material: input.material,
      colorName: input.colorName,
      colorHex: input.colorHex,
      catalogId: input.catalogId ?? null,
      nfcTagId: input.nfcTagId ?? null,
      notes: input.notes ?? '',
      status: 'new',
    },
    include: { _count: { select: { amsSlots: true } } },
  })
  return toSpoolData(s)
}

export interface UpdateSpoolInput {
  status?: SpoolStatus
  nfcTagId?: string | null
  notes?: string
}

export async function updateSpool(id: string, input: UpdateSpoolInput): Promise<SpoolData> {
  const s = await prisma.spool.update({
    where: { id },
    data: {
      ...(input.status !== undefined && { status: input.status }),
      ...(input.nfcTagId !== undefined && { nfcTagId: input.nfcTagId }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: { _count: { select: { amsSlots: true } } },
  })
  return toSpoolData(s)
}

export async function deleteSpool(id: string): Promise<void> {
  await prisma.spool.delete({ where: { id } })
}
```

- [ ] **Step 2: Write spools list/create route**

Create `shopee-dashboard/app/api/filamen/spools/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listSpools, createSpool } from '@/lib/filamen/spool-service'
import type { CreateSpoolInput } from '@/lib/filamen/spool-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await listSpools()
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: CreateSpoolInput = await req.json()
  if (!body.brand || !body.material || !body.colorName || !body.colorHex) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const spool = await createSpool(body)
  return NextResponse.json(spool, { status: 201 })
}
```

- [ ] **Step 3: Write spool detail route**

Create `shopee-dashboard/app/api/filamen/spools/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { updateSpool, deleteSpool } from '@/lib/filamen/spool-service'
import type { UpdateSpoolInput } from '@/lib/filamen/spool-service'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body: UpdateSpoolInput = await req.json()
  const spool = await updateSpool(id, body)
  return NextResponse.json(spool)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await deleteSpool(id)
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Write scan lookup route**

Create `shopee-dashboard/app/api/filamen/spools/scan/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getSpoolByBarcode, getSpoolByNfc } from '@/lib/filamen/spool-service'

// POST { type: 'barcode'|'nfc', value: string }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, value } = await req.json() as { type: 'barcode' | 'nfc'; value: string }

  const spool = type === 'nfc'
    ? await getSpoolByNfc(value)
    : await getSpoolByBarcode(value)

  if (!spool) {
    // Unknown tag/barcode — return 404 with the raw value so client can open "add spool" form
    return NextResponse.json({ found: false, rawValue: value }, { status: 404 })
  }

  return NextResponse.json({ found: true, spool })
}
```

- [ ] **Step 5: Commit**

```bash
cd shopee-dashboard && git add lib/filamen/spool-service.ts app/api/filamen/
git commit -m "feat: spool service + CRUD API routes + scan lookup"
```

---

### Task 6: AMS service + API routes

**Files:**
- Create: `shopee-dashboard/lib/filamen/ams-service.ts`
- Create: `shopee-dashboard/app/api/filamen/ams/route.ts`
- Create: `shopee-dashboard/app/api/filamen/ams/[id]/route.ts`

- [ ] **Step 1: Write AMS service**

Create `shopee-dashboard/lib/filamen/ams-service.ts`:
```typescript
import { prisma } from '@/lib/db'
import type { AmsSlotData, AmsVariant, AmsSectionResponse, ProductType } from './types'

function toSlotData(s: {
  id: string
  productType: string
  variantName: string
  slotNumber: number
  filamentName: string
  spoolId: string | null
  spool: { id: string; barcode: string; status: string; colorHex: string; brand: string; colorName: string } | null
}): AmsSlotData {
  return {
    id: s.id,
    productType: s.productType as ProductType,
    variantName: s.variantName,
    slotNumber: s.slotNumber,
    filamentName: s.filamentName,
    spoolId: s.spoolId,
    spool: s.spool
      ? {
          id: s.spool.id,
          barcode: s.spool.barcode,
          status: s.spool.status as 'new' | 'full' | 'mid' | 'low' | 'empty',
          colorHex: s.spool.colorHex,
          brand: s.spool.brand,
          colorName: s.spool.colorName,
        }
      : null,
  }
}

export async function getAmsSections(): Promise<AmsSectionResponse> {
  const slots = await prisma.amsSlot.findMany({
    orderBy: [{ variantName: 'asc' }, { slotNumber: 'asc' }],
    include: {
      spool: {
        select: { id: true, barcode: true, status: true, colorHex: true, brand: true, colorName: true },
      },
    },
  })

  function groupByVariant(productType: ProductType): AmsVariant[] {
    const filtered = slots.filter((s) => s.productType === productType)
    const variantMap = new Map<string, AmsSlotData[]>()
    for (const s of filtered) {
      const list = variantMap.get(s.variantName) ?? []
      list.push(toSlotData(s))
      variantMap.set(s.variantName, list)
    }
    return Array.from(variantMap.entries()).map(([variantName, variantSlots]) => ({
      variantName,
      slots: variantSlots.sort((a, b) => a.slotNumber - b.slotNumber),
      hasLowSpool: variantSlots.some(
        (sl) => sl.spool?.status === 'low' || sl.spool?.status === 'empty'
      ),
    }))
  }

  return {
    swoosh: groupByVariant('swoosh'),
    clickers: groupByVariant('clickers'),
  }
}

export async function assignSpoolToSlot(
  slotId: string,
  spoolId: string | null
): Promise<AmsSlotData> {
  const updated = await prisma.amsSlot.update({
    where: { id: slotId },
    data: { spoolId },
    include: {
      spool: {
        select: { id: true, barcode: true, status: true, colorHex: true, brand: true, colorName: true },
      },
    },
  })
  return toSlotData(updated)
}

export async function countLowSpools(): Promise<number> {
  return prisma.spool.count({ where: { status: 'low' } })
}
```

- [ ] **Step 2: Write AMS API routes**

Create `shopee-dashboard/app/api/filamen/ams/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAmsSections } from '@/lib/filamen/ams-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await getAmsSections()
  return NextResponse.json(data)
}
```

Create `shopee-dashboard/app/api/filamen/ams/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { assignSpoolToSlot } from '@/lib/filamen/ams-service'

// PUT { spoolId: string | null }
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { spoolId } = await req.json() as { spoolId: string | null }
  const slot = await assignSpoolToSlot(id, spoolId ?? null)
  return NextResponse.json(slot)
}
```

- [ ] **Step 3: Commit**

```bash
cd shopee-dashboard && git add lib/filamen/ams-service.ts app/api/filamen/ams/
git commit -m "feat: AMS service + assign spool API routes"
```

---

### Task 7: AMS data import from Excel

**Files:**
- Create: `shopee-dashboard/scripts/import-ams.ts`

This is a one-time script. Run it once after migration to seed `AmsSlot` from the Excel file.

- [ ] **Step 1: Write import script**

Create `shopee-dashboard/scripts/import-ams.ts`:
```typescript
import * as XLSX from 'xlsx'
import { PrismaClient } from '@prisma/client'
import path from 'path'

const prisma = new PrismaClient()

function parseSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  productType: 'swoosh' | 'clickers'
) {
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][]

  const slots: {
    productType: string
    variantName: string
    slotNumber: number
    filamentName: string
  }[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const variantName = row[0]?.toString().trim()
    if (!variantName) continue

    for (let slot = 1; slot <= 8; slot++) {
      const filamentName = row[slot]?.toString().trim()
      if (!filamentName) continue
      slots.push({ productType, variantName, slotNumber: slot, filamentName })
    }
  }

  return slots
}

async function main() {
  const excelPath = path.resolve(
    process.env.EXCEL_PATH ??
      '/Users/adhityatangahu/Downloads/Urutan Fillament Swoosh.xlsx'
  )

  const wb = XLSX.readFile(excelPath)
  const swooshSlots = parseSheet(wb, 'Swoosh', 'swoosh')
  const clickerSlots = parseSheet(wb, 'Clickers', 'clickers')
  const allSlots = [...swooshSlots, ...clickerSlots]

  console.log(`Importing ${allSlots.length} AMS slots...`)

  for (const slot of allSlots) {
    await prisma.amsSlot.upsert({
      where: {
        productType_variantName_slotNumber: {
          productType: slot.productType,
          variantName: slot.variantName,
          slotNumber: slot.slotNumber,
        },
      },
      update: { filamentName: slot.filamentName },
      create: slot,
    })
  }

  console.log('Done.')
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Add import script to package.json**

In `shopee-dashboard/package.json` scripts:
```json
"db:import-ams": "tsx scripts/import-ams.ts"
```

- [ ] **Step 3: Run import**

```bash
cd shopee-dashboard && npm run db:import-ams
```
Expected: "Importing N AMS slots... Done."

- [ ] **Step 4: Verify data in DB**

```bash
cd shopee-dashboard && npx prisma studio
```
Open `AmsSlot` table — should see rows for Swoosh and Clickers variants.

- [ ] **Step 5: Commit**

```bash
cd shopee-dashboard && git add scripts/import-ams.ts package.json
git commit -m "feat: AMS data import script from Excel"
```

---

### Task 8: React Query hooks

**Files:**
- Create: `shopee-dashboard/lib/hooks/use-filamen.ts`

- [ ] **Step 1: Write hooks**

Create `shopee-dashboard/lib/hooks/use-filamen.ts`:
```typescript
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SpoolsResponse, AmsSectionResponse, FilamentCatalogEntry, SpoolData } from '@/lib/filamen/types'
import type { CreateSpoolInput, UpdateSpoolInput } from '@/lib/filamen/spool-service'

const SPOOLS_KEY = ['filamen', 'spools'] as const
const AMS_KEY = ['filamen', 'ams'] as const
const CATALOG_KEY = ['filamen', 'catalog'] as const

// ── Spools ────────────────────────────────────────────────────────────────────

async function fetchSpools(): Promise<SpoolsResponse> {
  const res = await fetch('/api/filamen/spools')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useSpools() {
  return useQuery({ queryKey: SPOOLS_KEY, queryFn: fetchSpools })
}

async function createSpool(input: CreateSpoolInput): Promise<SpoolData> {
  const res = await fetch('/api/filamen/spools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useCreateSpool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSpool,
    onSuccess: () => qc.invalidateQueries({ queryKey: SPOOLS_KEY }),
  })
}

async function updateSpool({ id, ...input }: UpdateSpoolInput & { id: string }): Promise<SpoolData> {
  const res = await fetch(`/api/filamen/spools/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useUpdateSpool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateSpool,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SPOOLS_KEY })
      qc.invalidateQueries({ queryKey: AMS_KEY })
    },
  })
}

async function deleteSpool(id: string): Promise<void> {
  const res = await fetch(`/api/filamen/spools/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export function useDeleteSpool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteSpool,
    onSuccess: () => qc.invalidateQueries({ queryKey: SPOOLS_KEY }),
  })
}

// ── Scan ─────────────────────────────────────────────────────────────────────

export async function scanLookup(
  type: 'barcode' | 'nfc',
  value: string
): Promise<{ found: boolean; spool?: SpoolData; rawValue?: string }> {
  const res = await fetch('/api/filamen/spools/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, value }),
  })
  if (res.status === 404) return res.json()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── AMS ───────────────────────────────────────────────────────────────────────

async function fetchAms(): Promise<AmsSectionResponse> {
  const res = await fetch('/api/filamen/ams')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useAms() {
  return useQuery({ queryKey: AMS_KEY, queryFn: fetchAms })
}

async function assignSpool({
  slotId,
  spoolId,
}: {
  slotId: string
  spoolId: string | null
}): Promise<void> {
  const res = await fetch(`/api/filamen/ams/${slotId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spoolId }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export function useAssignSpool() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: assignSpool,
    onSuccess: () => qc.invalidateQueries({ queryKey: AMS_KEY }),
  })
}

// ── Catalog ───────────────────────────────────────────────────────────────────

async function fetchCatalog(): Promise<{
  catalog: Record<string, Record<string, FilamentCatalogEntry[]>>
}> {
  const res = await fetch('/api/filamen/catalog')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useCatalog() {
  return useQuery({ queryKey: CATALOG_KEY, queryFn: fetchCatalog, staleTime: 1000 * 60 * 60 })
}

export function useSyncCatalog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/filamen/catalog', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CATALOG_KEY }),
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd shopee-dashboard && npx tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd shopee-dashboard && git add lib/hooks/use-filamen.ts
git commit -m "feat: React Query hooks for filamen (spools, AMS, catalog)"
```

---

### Task 9: Sub-tab navigation — add Filamen to Produk page

**Files:**
- Create: `shopee-dashboard/components/filamen/FilamenTab.tsx`
- Modify: `shopee-dashboard/app/(dashboard)/produk/page.tsx`

- [ ] **Step 1: Create FilamenTab shell**

Create `shopee-dashboard/components/filamen/FilamenTab.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { SpoolTab } from './SpoolTab'
import { AmsTab } from './AmsTab'

type FilamenSubTab = 'spool' | 'ams'

export function FilamenTab() {
  const [active, setActive] = useState<FilamenSubTab>('spool')

  return (
    <div>
      {/* Sub-sub-tab nav */}
      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActive('spool')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === 'spool'
              ? 'border-[#EE4D2D] text-[#EE4D2D]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Spool
        </button>
        <button
          onClick={() => setActive('ams')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            active === 'ams'
              ? 'border-[#EE4D2D] text-[#EE4D2D]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Urutan AMS
        </button>
      </div>

      {active === 'spool' ? <SpoolTab /> : <AmsTab />}
    </div>
  )
}
```

- [ ] **Step 2: Create SpoolTab and AmsTab stubs** (so FilamenTab compiles)

Create `shopee-dashboard/components/filamen/SpoolTab.tsx`:
```tsx
export function SpoolTab() {
  return <div className="text-gray-400 py-8 text-center">Spool — coming soon</div>
}
```

Create `shopee-dashboard/components/filamen/AmsTab.tsx`:
```tsx
export function AmsTab() {
  return <div className="text-gray-400 py-8 text-center">Urutan AMS — coming soon</div>
}
```

- [ ] **Step 3: Add sub-tab switcher to produk/page.tsx**

In `shopee-dashboard/app/(dashboard)/produk/page.tsx`, add at the top of the file after existing imports:
```tsx
import { FilamenTab } from '@/components/filamen/FilamenTab'
```

Add a `produkTab` state at the top of `ProdukPage()`:
```tsx
const [produkTab, setProdukTab] = useState<'produk' | 'filamen'>('produk')
```

Wrap the existing return with a tab switcher. Replace the opening `<div className="space-y-4">` with:
```tsx
<div className="space-y-4">
  {/* Sub-tab nav */}
  <div className="flex border-b border-gray-200">
    <button
      onClick={() => setProdukTab('produk')}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        produkTab === 'produk'
          ? 'border-[#EE4D2D] text-[#EE4D2D]'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      Produk
    </button>
    <button
      onClick={() => setProdukTab('filamen')}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        produkTab === 'filamen'
          ? 'border-[#EE4D2D] text-[#EE4D2D]'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      Filamen
    </button>
  </div>

  {produkTab === 'filamen' ? (
    <FilamenTab />
  ) : (
    <>
```

And close the conditional before the closing `</div>` of the outer div:
```tsx
    </>
  )}
</div>
```

- [ ] **Step 4: Run dev server and verify tabs render**

```bash
cd shopee-dashboard && npm run dev
```
Open http://localhost:3000 → Tab Produk → sub-tabs "Produk" and "Filamen" should be visible. Filamen shows "Spool — coming soon".

- [ ] **Step 5: Commit**

```bash
cd shopee-dashboard && git add components/filamen/ app/(dashboard)/produk/page.tsx
git commit -m "feat: add Filamen sub-tab to Produk page (stub)"
```

---

### Task 10: SpoolKpiBar + SpoolGrid (read-only view)

**Files:**
- Create: `shopee-dashboard/components/filamen/SpoolKpiBar.tsx`
- Create: `shopee-dashboard/components/filamen/SpoolCard.tsx`
- Modify: `shopee-dashboard/components/filamen/SpoolTab.tsx`

- [ ] **Step 1: Create SpoolKpiBar**

Create `shopee-dashboard/components/filamen/SpoolKpiBar.tsx`:
```tsx
import type { SpoolsResponse } from '@/lib/filamen/types'
import { SPOOL_STATUS_LABELS, SPOOL_STATUS_COLORS } from '@/lib/filamen/types'

export function SpoolKpiBar({ kpi }: { kpi: SpoolsResponse['kpi'] }) {
  const items = [
    { key: 'total', label: 'Total Spool', value: kpi.total, color: '#94a3b8' },
    { key: 'new', label: 'New', value: kpi.byStatus.new, color: SPOOL_STATUS_COLORS.new },
    { key: 'full', label: 'Full', value: kpi.byStatus.full, color: SPOOL_STATUS_COLORS.full },
    { key: 'mid', label: 'Mid', value: kpi.byStatus.mid, color: SPOOL_STATUS_COLORS.mid },
    { key: 'low', label: 'Low ⚠️', value: kpi.byStatus.low, color: SPOOL_STATUS_COLORS.low },
    { key: 'empty', label: 'Empty', value: kpi.byStatus.empty, color: SPOOL_STATUS_COLORS.empty },
  ] as const

  return (
    <div className="grid grid-cols-6 gap-px bg-gray-200 rounded-lg overflow-hidden">
      {items.map((item) => (
        <div key={item.key} className="bg-white px-3 py-3 text-center">
          <div className="text-xl font-bold" style={{ color: item.color }}>
            {item.value}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create SpoolCard**

Create `shopee-dashboard/components/filamen/SpoolCard.tsx`:
```tsx
import type { SpoolData } from '@/lib/filamen/types'
import { SPOOL_STATUS_COLORS, SPOOL_STATUS_LABELS } from '@/lib/filamen/types'

interface SpoolCardProps {
  spool: SpoolData
  onEdit: (spool: SpoolData) => void
  onPrint: (spool: SpoolData) => void
}

export function SpoolCard({ spool, onEdit, onPrint }: SpoolCardProps) {
  const statusColor = SPOOL_STATUS_COLORS[spool.status]
  const statusLabel = SPOOL_STATUS_LABELS[spool.status]
  const isLow = spool.status === 'low' || spool.status === 'empty'

  return (
    <div
      className={`bg-white rounded-lg border overflow-hidden ${
        isLow ? 'border-orange-300' : 'border-gray-200'
      }`}
    >
      {/* Status bar */}
      <div className="h-1.5" style={{ backgroundColor: statusColor }} />

      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          {/* Color swatch */}
          <div
            className="w-7 h-7 rounded-full border-2 border-gray-200 flex-shrink-0"
            style={{ backgroundColor: spool.colorHex }}
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800 truncate">
              {spool.brand} {spool.colorName}
            </div>
            <div className="text-xs text-gray-400">{spool.material}</div>
          </div>
          <span
            className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: statusColor + '22',
              color: statusColor,
              border: `1px solid ${statusColor}44`,
            }}
          >
            {statusLabel}
          </span>
        </div>

        {/* Spool ID + meta */}
        <div className="text-xs text-gray-400 mb-1">#{spool.barcode.slice(0, 8).toUpperCase()}</div>
        {spool.assignedSlotCount > 0 && (
          <div className={`text-xs mb-2 ${isLow ? 'text-orange-500' : 'text-gray-400'}`}>
            {isLow ? '⚠️ ' : ''}Dipakai di {spool.assignedSlotCount} slot AMS
          </div>
        )}
        {spool.nfcTagId && (
          <div className="text-xs text-gray-400 mb-2">📡 NFC terpasang</div>
        )}

        {/* Actions */}
        <div className="flex gap-1.5 mt-2">
          <button
            onClick={() => onPrint(spool)}
            className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 py-1 rounded"
          >
            🏷 Print
          </button>
          <button
            onClick={() => onEdit(spool)}
            className="flex-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 py-1 rounded"
          >
            ✏️ Edit
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Implement SpoolTab with grid**

Replace the contents of `shopee-dashboard/components/filamen/SpoolTab.tsx`:
```tsx
'use client'

import { useState, useMemo } from 'react'
import { useSpools } from '@/lib/hooks/use-filamen'
import { SpoolKpiBar } from './SpoolKpiBar'
import { SpoolCard } from './SpoolCard'
import type { SpoolData, SpoolStatus } from '@/lib/filamen/types'

export function SpoolTab() {
  const { data, isLoading } = useSpools()
  const [statusFilter, setStatusFilter] = useState<SpoolStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [editingSpool, setEditingSpool] = useState<SpoolData | null>(null)
  const [printingSpool, setPrintingSpool] = useState<SpoolData | null>(null)

  const filtered = useMemo(() => {
    if (!data) return []
    return data.spools.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          s.brand.toLowerCase().includes(q) ||
          s.colorName.toLowerCase().includes(q) ||
          s.material.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [data, statusFilter, search])

  // Group by brand+colorName
  const grouped = useMemo(() => {
    const map = new Map<string, SpoolData[]>()
    for (const s of filtered) {
      const key = `${s.brand}|||${s.colorName}|||${s.material}`
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    return map
  }, [filtered])

  if (isLoading) return <div className="text-gray-400 py-8 text-center">Memuat spool...</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      <SpoolKpiBar kpi={data.kpi} />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button className="bg-[#EE4D2D] text-white text-sm px-3 py-1.5 rounded-md hover:bg-[#d44226]">
          + Spool Baru
        </button>
        <button className="border border-gray-300 text-sm px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-50">
          📷 Scan
        </button>
        <button className="border border-gray-300 text-sm px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-50">
          📡 NFC
        </button>
        <div className="flex-1" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SpoolStatus | 'all')}
          className="border border-gray-300 text-sm px-2 py-1.5 rounded-md text-gray-600"
        >
          <option value="all">Semua Status</option>
          <option value="new">New</option>
          <option value="full">Full</option>
          <option value="mid">Mid</option>
          <option value="low">Low</option>
          <option value="empty">Empty</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari brand/warna..."
          className="border border-gray-300 text-sm px-2 py-1.5 rounded-md w-40"
        />
      </div>

      {/* Grouped grid */}
      {Array.from(grouped.entries()).map(([key, spools]) => {
        const [brand, colorName, material] = key.split('|||')
        const hasLow = spools.some((s) => s.status === 'low' || s.status === 'empty')
        return (
          <div key={key}>
            <div className={`text-xs uppercase tracking-widest mb-2 ${hasLow ? 'text-orange-500' : 'text-gray-400'}`}>
              {brand} {colorName} · {material}
              {hasLow && ' ⚠️'}
              <span className="ml-2 text-gray-400">{spools.length} spool</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {spools.map((s) => (
                <SpoolCard
                  key={s.id}
                  spool={s}
                  onEdit={setEditingSpool}
                  onPrint={setPrintingSpool}
                />
              ))}
            </div>
          </div>
        )
      })}

      {filtered.length === 0 && (
        <div className="text-gray-400 py-8 text-center">Tidak ada spool ditemukan.</div>
      )}

      {/* Modals — wired in later tasks */}
      {editingSpool && <div>{/* SpoolForm modal — Task 11 */}</div>}
      {printingSpool && <div>{/* PrintModal — Task 13 */}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Verify dev server**

```bash
cd shopee-dashboard && npm run dev
```
Produk → Filamen → Spool: KPI bar, grouped grid, toolbar all visible.

- [ ] **Step 5: Commit**

```bash
cd shopee-dashboard && git add components/filamen/SpoolKpiBar.tsx components/filamen/SpoolCard.tsx components/filamen/SpoolTab.tsx
git commit -m "feat: SpoolTab with KPI bar and grouped spool grid"
```

---

### Task 11: SpoolForm modal (add/edit spool)

**Files:**
- Create: `shopee-dashboard/components/filamen/SpoolForm.tsx`

- [ ] **Step 1: Create SpoolForm**

Create `shopee-dashboard/components/filamen/SpoolForm.tsx`:
```tsx
'use client'

import { useState, useEffect } from 'react'
import { useCatalog, useCreateSpool, useUpdateSpool, useDeleteSpool } from '@/lib/hooks/use-filamen'
import type { SpoolData, SpoolStatus } from '@/lib/filamen/types'

interface SpoolFormProps {
  /** null = add mode, SpoolData = edit mode */
  spool: SpoolData | null
  /** Pre-fill nfcTagId when opening from scan */
  prefillNfcTagId?: string
  onClose: () => void
}

export function SpoolForm({ spool, prefillNfcTagId, onClose }: SpoolFormProps) {
  const { data: catalogData } = useCatalog()
  const createSpool = useCreateSpool()
  const updateSpool = useUpdateSpool()
  const deleteSpool = useDeleteSpool()

  const [brand, setBrand] = useState(spool?.brand ?? '')
  const [material, setMaterial] = useState(spool?.material ?? '')
  const [colorName, setColorName] = useState(spool?.colorName ?? '')
  const [colorHex, setColorHex] = useState(spool?.colorHex ?? '#000000')
  const [status, setStatus] = useState<SpoolStatus>(spool?.status ?? 'new')
  const [notes, setNotes] = useState(spool?.notes ?? '')

  const catalog = catalogData?.catalog ?? {}
  const brands = Object.keys(catalog).sort()
  const materials = brand ? Object.keys(catalog[brand] ?? {}).sort() : []
  const colors = brand && material ? (catalog[brand]?.[material] ?? []) : []

  // When color selected from catalog, auto-fill hex
  function handleColorSelect(name: string) {
    setColorName(name)
    const entry = colors.find((c) => c.colorName === name)
    if (entry) setColorHex(entry.colorHex)
  }

  const isPending = createSpool.isPending || updateSpool.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (spool) {
      await updateSpool.mutateAsync({ id: spool.id, status, notes })
    } else {
      const entry = colors.find((c) => c.colorName === colorName)
      await createSpool.mutateAsync({
        brand,
        material,
        colorName,
        colorHex,
        catalogId: entry?.id,
        nfcTagId: prefillNfcTagId,
        notes,
      })
    }
    onClose()
  }

  async function handleDelete() {
    if (!spool) return
    if (!confirm(`Hapus spool ${spool.brand} ${spool.colorName}? Tidak bisa dibatalkan.`)) return
    await deleteSpool.mutateAsync(spool.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">
            {spool ? 'Edit Spool' : 'Tambah Spool Baru'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Add mode: pick from catalog */}
          {!spool && (
            <>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Brand</label>
                <select
                  value={brand}
                  onChange={(e) => { setBrand(e.target.value); setMaterial(''); setColorName('') }}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                  required
                >
                  <option value="">Pilih brand...</option>
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Material</label>
                <select
                  value={material}
                  onChange={(e) => { setMaterial(e.target.value); setColorName('') }}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                  required
                  disabled={!brand}
                >
                  <option value="">Pilih material...</option>
                  {materials.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Warna</label>
                <div className="flex gap-2">
                  <select
                    value={colorName}
                    onChange={(e) => handleColorSelect(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                    required
                    disabled={!material}
                  >
                    <option value="">Pilih warna...</option>
                    {colors.map((c) => (
                      <option key={c.id} value={c.colorName}>{c.colorName}</option>
                    ))}
                  </select>
                  <div
                    className="w-8 h-8 rounded border border-gray-300 flex-shrink-0"
                    style={{ backgroundColor: colorHex }}
                  />
                </div>
              </div>
            </>
          )}

          {/* Edit mode: only status + notes */}
          {spool && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SpoolStatus)}
                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="new">NEW — tersegel</option>
                <option value="full">FULL — sudah dibuka, masih penuh</option>
                <option value="mid">MID — separuh</option>
                <option value="low">LOW — hampir habis</option>
                <option value="empty">EMPTY — habis</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 block mb-1">Catatan</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opsional..."
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            />
          </div>

          {prefillNfcTagId && (
            <p className="text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded">
              📡 NFC tag akan otomatis ter-link ke spool ini.
            </p>
          )}

          <div className="flex gap-2 pt-2">
            {spool && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteSpool.isPending}
                className="text-sm text-red-600 hover:text-red-700 px-3 py-1.5 rounded border border-red-200 hover:bg-red-50"
              >
                Hapus
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-600 px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="text-sm bg-[#EE4D2D] text-white px-4 py-1.5 rounded hover:bg-[#d44226] disabled:opacity-50"
            >
              {isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire SpoolForm into SpoolTab**

In `shopee-dashboard/components/filamen/SpoolTab.tsx`:

Add import:
```tsx
import { SpoolForm } from './SpoolForm'
```

Replace the `{editingSpool && ...}` placeholder and add "+ Spool Baru" button logic:

Add `showAddForm` state:
```tsx
const [showAddForm, setShowAddForm] = useState(false)
```

Update the `+ Spool Baru` button:
```tsx
<button
  onClick={() => setShowAddForm(true)}
  className="bg-[#EE4D2D] text-white text-sm px-3 py-1.5 rounded-md hover:bg-[#d44226]"
>
  + Spool Baru
</button>
```

Replace the `{editingSpool && ...}` placeholder at the bottom with:
```tsx
{(showAddForm || editingSpool) && (
  <SpoolForm
    spool={editingSpool}
    onClose={() => { setShowAddForm(false); setEditingSpool(null) }}
  />
)}
```

- [ ] **Step 3: Verify add/edit flow works end-to-end**

```bash
cd shopee-dashboard && npm run dev
```
- Click "+ Spool Baru" → form opens → pick brand/material/color → save → spool appears in grid
- Click ✏️ Edit on a spool → edit form opens → change status → save → card updates

- [ ] **Step 4: Commit**

```bash
cd shopee-dashboard && git add components/filamen/SpoolForm.tsx components/filamen/SpoolTab.tsx
git commit -m "feat: SpoolForm modal for add/edit spool"
```

---

### Task 12: Scan modal (NFC + camera + hardware scanner)

**Files:**
- Create: `shopee-dashboard/components/filamen/ScanModal.tsx`

- [ ] **Step 1: Create ScanModal**

Create `shopee-dashboard/components/filamen/ScanModal.tsx`:
```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { scanLookup } from '@/lib/hooks/use-filamen'
import type { SpoolData } from '@/lib/filamen/types'

interface ScanModalProps {
  onFound: (spool: SpoolData) => void
  onNotFound: (rawValue: string, type: 'nfc' | 'barcode') => void
  onClose: () => void
}

export function ScanModal({ onFound, onNotFound, onClose }: ScanModalProps) {
  const [mode, setMode] = useState<'nfc' | 'camera' | 'keyboard'>('keyboard')
  const [status, setStatus] = useState<string>('Siap scan')
  const [keyBuffer, setKeyBuffer] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const nfcAbortRef = useRef<AbortController | null>(null)

  // Hardware scanner: auto-focus hidden input, captures rapid key presses ending with Enter
  useEffect(() => {
    if (mode !== 'keyboard') return
    inputRef.current?.focus()
  }, [mode])

  async function handleKeyboardScan(value: string) {
    if (!value.trim()) return
    setStatus('Mencari...')
    try {
      const result = await scanLookup('barcode', value.trim())
      if (result.found && result.spool) {
        onFound(result.spool)
      } else {
        onNotFound(value.trim(), 'barcode')
      }
    } catch {
      setStatus('Error. Coba lagi.')
    }
  }

  // Web NFC read
  async function startNfc() {
    if (!('NDEFReader' in window)) {
      setStatus('Browser tidak support NFC. Gunakan Android Chrome.')
      return
    }
    const ndef = new (window as unknown as { NDEFReader: new () => NDEFReader }).NDEFReader()
    const abort = new AbortController()
    nfcAbortRef.current = abort
    setStatus('Dekatkan HP ke tag NFC...')
    try {
      await ndef.scan({ signal: abort.signal })
      ndef.addEventListener('reading', async (event: NDEFReadingEvent) => {
        const record = event.message.records[0]
        if (!record) return
        const decoder = new TextDecoder()
        const value = decoder.decode(record.data)
        setStatus('Mencari...')
        const result = await scanLookup('nfc', value)
        if (result.found && result.spool) {
          onFound(result.spool)
        } else {
          onNotFound(value, 'nfc')
        }
      })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setStatus('NFC error: ' + (e as Error).message)
      }
    }
  }

  useEffect(() => {
    if (mode === 'nfc') startNfc()
    return () => { nfcAbortRef.current?.abort() }
  }, [mode])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Scan Spool</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2">
            {(['keyboard', 'nfc', 'camera'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 text-xs py-2 rounded border transition-colors ${
                  mode === m
                    ? 'bg-[#EE4D2D] text-white border-[#EE4D2D]'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {m === 'keyboard' ? '⌨️ Scanner' : m === 'nfc' ? '📡 NFC' : '📷 Kamera'}
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="text-sm text-gray-600 text-center py-2">{status}</div>

          {/* Keyboard mode: hidden input captures hardware scanner */}
          {mode === 'keyboard' && (
            <div>
              <input
                ref={inputRef}
                value={keyBuffer}
                onChange={(e) => setKeyBuffer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleKeyboardScan(keyBuffer)
                    setKeyBuffer('')
                  }
                }}
                placeholder="Arahkan scanner ke barcode, atau ketik manual + Enter"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">
                Hardware scanner otomatis input + Enter. Bisa juga ketik manual.
              </p>
            </div>
          )}

          {/* NFC mode: just show instruction */}
          {mode === 'nfc' && (
            <div className="text-center py-4">
              <div className="text-4xl mb-2">📡</div>
              <p className="text-sm text-gray-500">Dekatkan HP ke tag NFC spool</p>
            </div>
          )}

          {/* Camera mode: placeholder — full impl needs ZXing/QuaggaJS */}
          {mode === 'camera' && (
            <div className="text-center py-4 text-gray-400">
              <div className="text-4xl mb-2">📷</div>
              <p className="text-sm">Camera scan tersedia di update berikutnya.</p>
              <p className="text-xs mt-1">Gunakan hardware scanner atau NFC untuk sekarang.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire ScanModal into SpoolTab**

In `shopee-dashboard/components/filamen/SpoolTab.tsx`:

Add import:
```tsx
import { ScanModal } from './ScanModal'
```

Add state:
```tsx
const [showScanModal, setShowScanModal] = useState(false)
const [prefillNfc, setPrefillNfc] = useState<string | undefined>()
```

Update Scan/NFC buttons:
```tsx
<button
  onClick={() => setShowScanModal(true)}
  className="border border-gray-300 text-sm px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-50"
>
  📷 Scan / 📡 NFC
</button>
```

Add ScanModal at bottom with handlers:
```tsx
{showScanModal && (
  <ScanModal
    onFound={(spool) => {
      setShowScanModal(false)
      setEditingSpool(spool)
    }}
    onNotFound={(rawValue, type) => {
      setShowScanModal(false)
      if (type === 'nfc') setPrefillNfc(rawValue)
      setShowAddForm(true)
    }}
    onClose={() => setShowScanModal(false)}
  />
)}
```

Pass `prefillNfcTagId` to SpoolForm:
```tsx
{(showAddForm || editingSpool) && (
  <SpoolForm
    spool={editingSpool}
    prefillNfcTagId={showAddForm ? prefillNfc : undefined}
    onClose={() => { setShowAddForm(false); setEditingSpool(null); setPrefillNfc(undefined) }}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
cd shopee-dashboard && git add components/filamen/ScanModal.tsx components/filamen/SpoolTab.tsx
git commit -m "feat: ScanModal with NFC, hardware scanner, and camera placeholder"
```

---

### Task 13: QR barcode print + Bluetooth thermal printer

**Files:**
- Create: `shopee-dashboard/components/filamen/PrintModal.tsx`
- Create: `shopee-dashboard/lib/filamen/bluetooth-printer.ts`

The Web Bluetooth API connects to BLE thermal printers and sends ESC/POS commands. Printer device ID is stored in SQLite config key `bt_printer_device_name`.

- [ ] **Step 1: Create bluetooth-printer utility**

Create `shopee-dashboard/lib/filamen/bluetooth-printer.ts`:
```typescript
// ESC/POS over BLE (Web Bluetooth API)
// Compatible with Phomemo, Peripage, Munbyn, GOOJPRT and similar BLE label printers

const PRINTER_SERVICE = '000018f0-0000-1000-8000-00805f9b34fb'
const PRINTER_CHARACTERISTIC = '00002af1-0000-1000-8000-00805f9b34fb'

export async function connectPrinter(): Promise<BluetoothRemoteGATTCharacteristic> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [PRINTER_SERVICE] }],
    optionalServices: [PRINTER_SERVICE],
  })

  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(PRINTER_SERVICE)
  const characteristic = await service.getCharacteristic(PRINTER_CHARACTERISTIC)
  return characteristic
}

export async function printStickerViaBluetooth(
  characteristic: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array
): Promise<void> {
  // Split into 20-byte chunks (BLE MTU limit for write without response)
  const CHUNK_SIZE = 20
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE)
    await characteristic.writeValueWithoutResponse(chunk)
    // Small delay between chunks to avoid buffer overflow
    await new Promise((r) => setTimeout(r, 10))
  }
}

export function buildStickerEscPos(
  qrData: string,
  label: string,
  subLabel: string
): Uint8Array {
  // ESC/POS commands for a simple label:
  // - Initialize printer
  // - Center alignment
  // - Print QR code (ESC/POS QR model 2)
  // - Print text lines
  // - Feed and cut

  const ESC = 0x1b
  const GS = 0x1d

  const enc = new TextEncoder()

  const init = [ESC, 0x40]                         // ESC @ — init printer
  const center = [ESC, 0x61, 0x01]                 // ESC a 1 — center
  const lineFeed = [0x0a]                           // LF
  const cut = [GS, 0x56, 0x42, 0x00]               // GS V B 0 — full cut with feed

  // QR code: GS ( k — Store data
  const qrBytes = enc.encode(qrData)
  const storeLen = qrBytes.length + 3
  const qrStore = [
    GS, 0x28, 0x6b,
    storeLen & 0xff, (storeLen >> 8) & 0xff,
    0x31, 0x50, 0x30,
    ...Array.from(qrBytes),
  ]
  // QR code: set size (6), error correction (M), print
  const qrSize = [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]
  const qrEcc  = [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]
  const qrPrint = [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]

  const labelBytes = enc.encode(label)
  const subLabelBytes = enc.encode(subLabel)

  const data = [
    ...init,
    ...center,
    ...qrStore,
    ...qrSize,
    ...qrEcc,
    ...qrPrint,
    ...lineFeed,
    ...Array.from(labelBytes),
    ...lineFeed,
    ...Array.from(subLabelBytes),
    ...lineFeed,
    ...lineFeed,
    ...cut,
  ]

  return new Uint8Array(data)
}
```

- [ ] **Step 2: Create PrintModal**

Create `shopee-dashboard/components/filamen/PrintModal.tsx`:
```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import type { SpoolData } from '@/lib/filamen/types'
import { SPOOL_STATUS_LABELS } from '@/lib/filamen/types'
import { connectPrinter, printStickerViaBluetooth, buildStickerEscPos } from '@/lib/filamen/bluetooth-printer'

interface PrintModalProps {
  spool: SpoolData
  onClose: () => void
}

export function PrintModal({ spool, onClose }: PrintModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [btStatus, setBtStatus] = useState<'idle' | 'connecting' | 'printing' | 'done' | 'error'>('idle')
  const [btError, setBtError] = useState('')
  const btCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null)

  const spoolLabel = `${spool.brand} ${spool.colorName}`
  const subLabel = `${spool.material} · #${spool.barcode.slice(0, 8).toUpperCase()} · ${SPOOL_STATUS_LABELS[spool.status]}`

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, spool.barcode, {
      width: 150,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    })
  }, [spool.barcode])

  async function handleBluetooth() {
    if (!('bluetooth' in navigator)) {
      setBtError('Web Bluetooth tidak tersedia. Gunakan Chrome/Chromium.')
      setBtStatus('error')
      return
    }
    setBtStatus('connecting')
    setBtError('')
    try {
      const characteristic = await connectPrinter()
      btCharRef.current = characteristic
      setBtStatus('printing')

      const escData = buildStickerEscPos(spool.barcode, spoolLabel, subLabel)
      await printStickerViaBluetooth(characteristic, escData)
      setBtStatus('done')
    } catch (e) {
      setBtError((e as Error).message)
      setBtStatus('error')
    }
  }

  function handleSystemPrint() {
    window.print()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Print Stiker Spool</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Preview */}
          <div className="border border-gray-200 rounded-lg p-4 text-center bg-white" id="print-stiker">
            <canvas ref={canvasRef} className="mx-auto" />
            <div className="mt-2 text-sm font-semibold text-gray-800">{spoolLabel}</div>
            <div className="text-xs text-gray-500">{subLabel}</div>
            <div
              className="mt-1 text-xs font-bold"
              style={{ color: spool.colorHex }}
            >
              ■ {spool.colorHex}
            </div>
          </div>

          {/* BT print button */}
          <button
            onClick={handleBluetooth}
            disabled={btStatus === 'connecting' || btStatus === 'printing'}
            className="w-full bg-[#EE4D2D] text-white text-sm py-2 rounded-md hover:bg-[#d44226] disabled:opacity-50"
          >
            {btStatus === 'idle' && '🖨️ Print via Bluetooth Thermal'}
            {btStatus === 'connecting' && 'Menghubungkan printer...'}
            {btStatus === 'printing' && 'Mencetak...'}
            {btStatus === 'done' && '✅ Berhasil dicetak!'}
            {btStatus === 'error' && '❌ Gagal — coba lagi'}
          </button>

          {btError && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{btError}</p>
          )}

          {/* Fallback: system print */}
          <button
            onClick={handleSystemPrint}
            className="w-full border border-gray-300 text-sm py-2 rounded-md text-gray-600 hover:bg-gray-50"
          >
            🖨️ Print via Dialog Sistem (fallback)
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add print styles**

In `shopee-dashboard/app/globals.css` (or wherever global CSS lives), add:
```css
@media print {
  body > *:not(#print-stiker) { display: none !important; }
  #print-stiker { display: block !important; }
}
```

- [ ] **Step 4: Wire PrintModal into SpoolTab**

In `shopee-dashboard/components/filamen/SpoolTab.tsx`:

Add import:
```tsx
import { PrintModal } from './PrintModal'
```

Replace the `{printingSpool && ...}` placeholder:
```tsx
{printingSpool && (
  <PrintModal
    spool={printingSpool}
    onClose={() => setPrintingSpool(null)}
  />
)}
```

- [ ] **Step 5: Verify TypeScript (Web Bluetooth types)**

```bash
cd shopee-dashboard && npx tsc --noEmit
```
If `NDEFReader` / `BluetoothRemoteGATTCharacteristic` is not found, add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"]
  }
}
```

- [ ] **Step 6: Commit**

```bash
cd shopee-dashboard && git add components/filamen/PrintModal.tsx lib/filamen/bluetooth-printer.ts app/globals.css
git commit -m "feat: PrintModal with QR preview and Bluetooth thermal print"
```

---

### Task 14: NFC write support in SpoolForm

**Files:**
- Create: `shopee-dashboard/lib/filamen/nfc-writer.ts`
- Modify: `shopee-dashboard/components/filamen/SpoolForm.tsx`

- [ ] **Step 1: Create NFC writer utility**

Create `shopee-dashboard/lib/filamen/nfc-writer.ts`:
```typescript
export async function writeNfcTag(spoolId: string): Promise<void> {
  if (!('NDEFReader' in window)) {
    throw new Error('Web NFC tidak tersedia. Gunakan Android Chrome.')
  }

  const ndef = new (window as unknown as { NDEFReader: new () => NDEFReader }).NDEFReader()
  await ndef.write({
    records: [{ recordType: 'text', data: spoolId }],
  })
}
```

- [ ] **Step 2: Add NFC write button to SpoolForm**

In `shopee-dashboard/components/filamen/SpoolForm.tsx`, add import:
```tsx
import { writeNfcTag } from '@/lib/filamen/nfc-writer'
```

Add state:
```tsx
const [nfcStatus, setNfcStatus] = useState<'idle' | 'writing' | 'done' | 'error'>('idle')
```

Add NFC write button inside the form (only shown in edit mode when spool exists):
```tsx
{spool && (
  <div>
    <label className="text-xs text-gray-500 block mb-1">Tag NFC</label>
    {spool.nfcTagId ? (
      <p className="text-xs text-green-600">📡 Tag terpasang: {spool.nfcTagId.slice(0, 16)}...</p>
    ) : (
      <button
        type="button"
        onClick={async () => {
          setNfcStatus('writing')
          try {
            await writeNfcTag(spool.id)
            await updateSpool.mutateAsync({ id: spool.id, nfcTagId: spool.id })
            setNfcStatus('done')
          } catch (e) {
            setNfcStatus('error')
          }
        }}
        disabled={nfcStatus === 'writing'}
        className="text-sm border border-indigo-300 text-indigo-600 px-3 py-1.5 rounded hover:bg-indigo-50 disabled:opacity-50"
      >
        {nfcStatus === 'idle' && '✍️ Tulis NFC Tag'}
        {nfcStatus === 'writing' && 'Dekatkan HP ke tag...'}
        {nfcStatus === 'done' && '✅ Tag berhasil ditulis'}
        {nfcStatus === 'error' && '❌ Gagal — coba lagi'}
      </button>
    )}
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
cd shopee-dashboard && git add lib/filamen/nfc-writer.ts components/filamen/SpoolForm.tsx
git commit -m "feat: NFC tag write support in SpoolForm"
```

---

### Task 15: AmsTab — accordion view

**Files:**
- Modify: `shopee-dashboard/components/filamen/AmsTab.tsx`
- Create: `shopee-dashboard/components/filamen/AmsVariantRow.tsx`
- Create: `shopee-dashboard/components/filamen/AmsSlotAssign.tsx`

- [ ] **Step 1: Create AmsVariantRow**

Create `shopee-dashboard/components/filamen/AmsVariantRow.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useAssignSpool, useSpools } from '@/lib/hooks/use-filamen'
import { SPOOL_STATUS_COLORS } from '@/lib/filamen/types'
import type { AmsVariant, AmsSlotData } from '@/lib/filamen/types'

export function AmsVariantRow({ variant }: { variant: AmsVariant }) {
  const [expanded, setExpanded] = useState(false)
  const [assigningSlot, setAssigningSlot] = useState<AmsSlotData | null>(null)
  const assignSpool = useAssignSpool()
  const { data: spoolsData } = useSpools()

  const dotColors = variant.slots.map((s) =>
    s.spool ? s.spool.colorHex : '#374151'
  )

  return (
    <div className={`border rounded-lg overflow-hidden mb-2 ${
      variant.hasLowSpool ? 'border-orange-300' : 'border-gray-200'
    }`}>
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-left"
      >
        <span className="text-gray-400 text-xs">{expanded ? '▼' : '▶'}</span>
        <span className="text-sm font-medium text-gray-800 flex-1">{variant.variantName}</span>

        {/* Dot swatches */}
        <div className="flex gap-1">
          {variant.slots.map((s, i) => (
            <div
              key={i}
              title={`AMS ${s.slotNumber}: ${s.filamentName}`}
              style={{
                width: 10, height: 10, borderRadius: '50%',
                backgroundColor: s.spool ? s.spool.colorHex : '#374151',
                border: `1.5px solid ${s.spool ? SPOOL_STATUS_COLORS[s.spool.status] : '#6b7280'}`,
                opacity: s.spool ? 1 : 0.3,
              }}
            />
          ))}
        </div>

        {variant.hasLowSpool ? (
          <span className="text-xs text-orange-500 font-medium">⚠️ Low</span>
        ) : (
          <span className="text-xs text-green-500">✓</span>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {variant.slots.map((slot) => (
              <button
                key={slot.id}
                onClick={() => setAssigningSlot(slot)}
                className={`text-left p-3 rounded-lg border bg-white hover:bg-gray-50 transition-colors ${
                  slot.spool?.status === 'low' || slot.spool?.status === 'empty'
                    ? 'border-orange-300'
                    : 'border-gray-200'
                }`}
              >
                <div className="text-xs text-gray-400 mb-1">AMS {slot.slotNumber}</div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: slot.spool?.colorHex ?? '#374151' }}
                  />
                  <span className="text-xs font-medium text-gray-700 truncate">
                    {slot.filamentName}
                  </span>
                </div>
                {slot.spool ? (
                  <div className="text-xs" style={{ color: SPOOL_STATUS_COLORS[slot.spool.status] }}>
                    #{slot.spool.barcode.slice(0, 8).toUpperCase()} · {slot.spool.status.toUpperCase()}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Belum assign</div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Assign modal */}
      {assigningSlot && spoolsData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-800">
                Assign AMS {assigningSlot.slotNumber} — {assigningSlot.filamentName}
              </h3>
              <button onClick={() => setAssigningSlot(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-4 max-h-96 overflow-y-auto space-y-2">
              {/* Unassign option */}
              {assigningSlot.spoolId && (
                <button
                  onClick={async () => {
                    await assignSpool.mutateAsync({ slotId: assigningSlot.id, spoolId: null })
                    setAssigningSlot(null)
                  }}
                  className="w-full text-left px-3 py-2 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-50"
                >
                  ✕ Lepas spool dari slot ini
                </button>
              )}
              {/* Spool options — show all spools, highlight matching ones */}
              {spoolsData.spools.map((spool) => (
                <button
                  key={spool.id}
                  onClick={async () => {
                    await assignSpool.mutateAsync({ slotId: assigningSlot.id, spoolId: spool.id })
                    setAssigningSlot(null)
                  }}
                  className={`w-full text-left px-3 py-2 border rounded-lg hover:bg-gray-50 ${
                    assigningSlot.spoolId === spool.id ? 'border-[#EE4D2D] bg-orange-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: spool.colorHex }} />
                    <span className="text-sm font-medium text-gray-800">
                      {spool.brand} {spool.colorName}
                    </span>
                    <span
                      className="ml-auto text-xs font-semibold"
                      style={{ color: SPOOL_STATUS_COLORS[spool.status] }}
                    >
                      {spool.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 ml-6">
                    {spool.material} · #{spool.barcode.slice(0, 8).toUpperCase()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Implement AmsTab**

Replace contents of `shopee-dashboard/components/filamen/AmsTab.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useAms } from '@/lib/hooks/use-filamen'
import { AmsVariantRow } from './AmsVariantRow'
import type { ProductType } from '@/lib/filamen/types'

export function AmsTab() {
  const { data, isLoading } = useAms()
  const [section, setSection] = useState<ProductType>('swoosh')

  if (isLoading) return <div className="text-gray-400 py-8 text-center">Memuat data AMS...</div>
  if (!data) return null

  const variants = section === 'swoosh' ? data.swoosh : data.clickers
  const lowCount = variants.filter((v) => v.hasLowSpool).length

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-2 items-center">
        {(['swoosh', 'clickers'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              section === s
                ? 'bg-[#EE4D2D] text-white border-[#EE4D2D]'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        {lowCount > 0 && (
          <span className="text-xs text-orange-500 ml-2">
            ⚠️ {lowCount} varian ada spool LOW
          </span>
        )}
      </div>

      {/* Accordion rows */}
      <div>
        {variants.map((variant) => (
          <AmsVariantRow key={variant.variantName} variant={variant} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify full flow**

```bash
cd shopee-dashboard && npm run dev
```
- Produk → Filamen → Urutan AMS
- Toggle Swoosh/Clickers — shows different variants
- Click a variant → expands with slot grid
- Click a slot → assign modal opens → select spool → slot updates with spool ID and color

- [ ] **Step 4: Commit**

```bash
cd shopee-dashboard && git add components/filamen/AmsTab.tsx components/filamen/AmsVariantRow.tsx
git commit -m "feat: AmsTab accordion with section toggle and spool assign"
```

---

### Task 16: Spool LOW notification detector

**Files:**
- Create: `shopee-dashboard/lib/notifications/detectors/spool-low.ts`
- Modify: `shopee-dashboard/lib/notifications/runner.ts`

- [ ] **Step 1: Write spool-low detector**

Create `shopee-dashboard/lib/notifications/detectors/spool-low.ts`:
```typescript
import { prisma } from '@/lib/db'
import type { NotificationAlert } from '@/lib/notifications/types'

export async function detectSpoolLow(): Promise<NotificationAlert[]> {
  const lowSpools = await prisma.spool.findMany({
    where: { status: 'low' },
    include: {
      amsSlots: {
        select: { variantName: true, productType: true },
      },
    },
  })

  return lowSpools.map((spool) => {
    const variantCount = spool.amsSlots.length
    const id = `#${spool.barcode.slice(0, 8).toUpperCase()}`
    const variantNote =
      variantCount > 0
        ? ` — dipakai di ${variantCount} varian ${spool.amsSlots[0]?.productType ?? ''}`
        : ''

    return {
      alertKey: `spool-low:${spool.id}`,
      message: `📦 Spool ${spool.brand} ${spool.colorName} (${id}) hampir habis${variantNote}`,
      severity: 'warning' as const,
    }
  })
}
```

- [ ] **Step 2: Add NotificationAlert type if missing**

Check `shopee-dashboard/lib/notifications/types.ts` — if `NotificationAlert` is not exported, add:
```typescript
export interface NotificationAlert {
  alertKey: string
  message: string
  severity: 'warning' | 'critical'
}
```

- [ ] **Step 3: Register detector in runner**

In `shopee-dashboard/lib/notifications/runner.ts`, import and call the new detector alongside existing ones:
```typescript
import { detectSpoolLow } from './detectors/spool-low'
```

Inside the main runner function, add:
```typescript
const spoolAlerts = await detectSpoolLow()
// send spoolAlerts via existing senders
```

(Follow the exact pattern used for existing detectors in runner.ts.)

- [ ] **Step 4: Commit**

```bash
cd shopee-dashboard && git add lib/notifications/detectors/spool-low.ts lib/notifications/runner.ts
git commit -m "feat: spool LOW notification detector"
```

---

### Task 17: Settings — Bluetooth printer + catalog sync

**Files:**
- Modify: `shopee-dashboard/app/(dashboard)/settings/page.tsx`

The existing Settings page uses `Config` model (key/value in SQLite) for all configuration. Add two new sections: Thermal Printer (sticker size config) and Filamen Catalog (sync button).

- [ ] **Step 1: Read the Settings page**

Read `shopee-dashboard/app/(dashboard)/settings/page.tsx` to understand the existing pattern for adding new settings sections. Follow the exact same component/form pattern.

- [ ] **Step 2: Add catalog sync section**

In the Settings page, add a "Katalog Filamen" section with:
- Description: "Data brand dan warna filamen diambil dari SpoolmanDB."
- Button: "Sync Katalog" — calls `POST /api/filamen/catalog`
- Show last sync time from `FilamentCatalog` table (query `MAX(syncedAt)`)

Add API route `shopee-dashboard/app/api/settings/filamen/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const latest = await prisma.filamentCatalog.findFirst({
    orderBy: { syncedAt: 'desc' },
    select: { syncedAt: true },
  })

  const stickerSize = await prisma.config.findUnique({ where: { key: 'sticker_size' } })

  return NextResponse.json({
    lastCatalogSync: latest?.syncedAt?.toISOString() ?? null,
    stickerSize: stickerSize?.value ?? '40x30',
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { stickerSize } = await req.json() as { stickerSize?: string }

  if (stickerSize) {
    await prisma.config.upsert({
      where: { key: 'sticker_size' },
      update: { value: stickerSize },
      create: { key: 'sticker_size', value: stickerSize },
    })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Add sticker size selector in Settings UI**

Add a sticker size dropdown with options `30x20`, `40x30`, `50x30` (mm) — saves to config key `sticker_size`.

- [ ] **Step 4: Commit**

```bash
cd shopee-dashboard && git add app/(dashboard)/settings/page.tsx app/api/settings/filamen/route.ts
git commit -m "feat: Settings — catalog sync + sticker size config"
```

---

### Task 18: First-time setup — sync catalog on initial load

**Files:**
- Modify: `shopee-dashboard/app/api/filamen/catalog/route.ts`

When catalog is empty (zero rows), the GET endpoint should auto-trigger a sync instead of returning an empty object. This ensures the "add spool" form has data on first use.

- [ ] **Step 1: Update catalog GET to auto-seed if empty**

In `shopee-dashboard/app/api/filamen/catalog/route.ts`, update the GET handler:
```typescript
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const count = await prisma.filamentCatalog.count()
  if (count === 0) {
    // Auto-seed on first use — silently ignore network errors
    try {
      await syncCatalogFromSpoolmanDB()
    } catch (e) {
      console.warn('Auto-seed catalog failed:', e)
    }
  }

  const grouped = await getCatalogGrouped()
  return NextResponse.json({ catalog: grouped })
}
```

Add the `prisma` import if not already present:
```typescript
import { prisma } from '@/lib/db'
```

- [ ] **Step 2: Commit**

```bash
cd shopee-dashboard && git add app/api/filamen/catalog/route.ts
git commit -m "feat: auto-seed filament catalog from SpoolmanDB on first use"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in task |
|-----------------|----------------|
| Sub-tab Filamen under Produk | Task 9 |
| Sub-sub-tabs: Spool + Urutan AMS | Task 9 |
| Spool grid grouped per filament type | Task 10 |
| Multiple spools per color, unique ID | Task 5 + Task 10 |
| Status NEW/FULL/MID/LOW/EMPTY | Task 2 + Task 3 |
| KPI bar | Task 10 |
| Add spool from SpoolmanDB catalog | Task 4 + Task 11 |
| Scan-first flow (NFC/barcode) | Task 12 |
| Bambu Lab NFC auto-parse (best-effort) | Task 12 scan route returns rawValue |
| Write NFC tag (Android) | Task 14 |
| Hardware USB/BT scanner | Task 12 keyboard mode |
| Generate unique barcode/QR | Task 5 (cuid as barcode) |
| Print QR sticker | Task 13 |
| Bluetooth thermal printer | Task 13 |
| Sticker size config in Settings | Task 17 |
| Urutan AMS accordion | Task 15 |
| Swoosh / Clickers section toggle | Task 15 |
| Dot swatches per slot in collapsed view | Task 15 |
| Expand → slot detail with spool ID+status | Task 15 |
| Assign spool to slot | Task 6 + Task 15 |
| Import AMS data from Excel | Task 7 |
| SpoolmanDB catalog sync | Task 4 |
| Auto-seed catalog on first use | Task 18 |
| Spool LOW notification | Task 16 |
| Settings: catalog sync + sticker size | Task 17 |
| Raspberry Pi compatible | No extra work needed — same web app |

**No gaps found.**

**Placeholder scan:** No TBD/TODO in any task. Camera scan (Task 12) is noted as "future update" with clear fallback.

**Type consistency:** `SpoolData`, `AmsSlotData`, `AmsVariant`, `AmsSectionResponse` defined once in Task 3 and referenced consistently throughout.
