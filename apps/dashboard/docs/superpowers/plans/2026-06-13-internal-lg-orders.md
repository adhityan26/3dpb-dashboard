# Internal Light Generator Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator create a Light Generator order without a customer, for internal experimentation, then run it through the existing upload → config → generate → download flow.

**Architecture:** Add an `isInternal` flag to `LightGeneratorOrder`. A new service function seeds a blank internal order with default config. The LG tab on the Order page lists internal orders and a "create" button that navigates to the existing detail page `/light-generator/[id]` — the editor is reused unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7 (PostgreSQL), TanStack Query, Vitest.

**DRY notes:** Default config lives in ONE place (`DEFAULT_LG_CONFIG` in `lib/light-generator/types.ts`). The detail-page editor is reused as-is (no duplication). The generate guard is a single prop on `LgGeneratePanel`, not duplicated logic.

---

## File Structure

- `prisma/schema.prisma` — add `isInternal Boolean @default(false)` to `LightGeneratorOrder`. (Applied in prod by `prisma db push` in `docker-entrypoint.sh`; no migration file.)
- `lib/light-generator/types.ts` — add `isInternal: boolean` to `LgOrder`; add `DEFAULT_LG_CONFIG` constant.
- `lib/light-generator/service.ts` — `serializeOrder` includes `isInternal`; new `createInternalLgOrder()`; `listLgOrders` gains `internal?` filter; `countLgPendingOrders` excludes internal.
- `lib/__tests__/light-generator/service.test.ts` — unit tests (prisma mocked).
- `app/api/light-generator/orders/route.ts` — add `POST`; extend `GET` with `?internal`.
- `lib/hooks/use-light-generator.ts` — `useLgOrders(status?, internal?)`; new `useCreateInternalLgOrder()`.
- `app/(dashboard)/order/page.tsx` — replace `LightGeneratorOrderView` placeholder with real list + create button.
- `components/light-generator/LgGeneratePanel.tsx` — accept `hasSilhouette` prop; disable Generate + show hint when false.
- `app/(dashboard)/light-generator/[id]/page.tsx` — pass `hasSilhouette={!!order.imagePath}` to `LgGeneratePanel`.

---

## Task 1: Schema — add `isInternal` flag

**Files:**
- Modify: `prisma/schema.prisma` (model `LightGeneratorOrder`, after `additionalImagePath`)

- [ ] **Step 1: Add the field**

In `prisma/schema.prisma`, inside `model LightGeneratorOrder`, add the field right after the `additionalImagePath` line:

```prisma
  additionalImagePath String?         // MinIO key: orders/{id}/additional.png
  isInternal          Boolean  @default(false)  // operator-created, no customer/Sanity
  createdAt           DateTime @default(now())
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 3: Apply to local dev DB (if one is configured)**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema." (Skip if no local DB / `DATABASE_URL` unset — prod applies this on deploy via `docker-entrypoint.sh`.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(lg): add isInternal flag to LightGeneratorOrder"
```

---

## Task 2: Types — `isInternal` on `LgOrder` + `DEFAULT_LG_CONFIG`

**Files:**
- Modify: `lib/light-generator/types.ts`

- [ ] **Step 1: Add `isInternal` to the `LgOrder` interface**

In `lib/light-generator/types.ts`, find the `LgOrder` interface and add `isInternal` (place it next to `sanityDocId`):

```typescript
export interface LgOrder {
  id: string
  sanityDocId: string | null
  isInternal: boolean
  status: string
  // ... rest unchanged
}
```

- [ ] **Step 2: Add the `DEFAULT_LG_CONFIG` constant**

At the end of `lib/light-generator/types.ts`, add a single shared default config used to seed internal orders. Keys are the snake_case generator params the STL service accepts (matching `LgConfigEditor` field keys):

```typescript
/**
 * Default generator config for operator-created (internal) orders.
 * Single source of truth — seeds the order's configJson so the editor
 * opens with sane values instead of blank fields.
 */
export const DEFAULT_LG_CONFIG = {
  outer_radius: 100,
  base_radius: 100,
  shell_height: null,        // null = auto
  shell_thickness: 3,
  base_thickness: 2,
  casing_lift: 0,
  floor_half_size: 600,
  shadow_offset_x: 0,
  shadow_offset_y: 0,
  light_x: 0,
  light_y: 0,
  light_z_offset: 10,
  edge_smooth_sigma: 2,
  shadow_threshold: 0,
  n_stencil_theta: 2048,
  n_stencil_z: 64,
  support_stems: true,
  stem_width: 2,
  min_bridge_mm: 1.2,
} as const
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in files not yet updated (e.g. `service.ts` `serializeOrder` missing `isInternal`) — those are fixed in Task 3. No errors in `types.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add lib/light-generator/types.ts
git commit -m "feat(lg): add isInternal to LgOrder and DEFAULT_LG_CONFIG"
```

---

## Task 3: Service — create + filter + count

**Files:**
- Modify: `lib/light-generator/service.ts`
- Test: `lib/__tests__/light-generator/service.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/light-generator/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    lightGeneratorOrder: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import {
  createInternalLgOrder,
  listLgOrders,
  countLgPendingOrders,
} from '@/lib/light-generator/service'
import { DEFAULT_LG_CONFIG } from '@/lib/light-generator/types'

const mockPrisma = prisma as any

function fakeRow(over: Record<string, unknown> = {}) {
  return {
    id: 'LG-INT-20260613-0001',
    sanityDocId: null,
    isInternal: true,
    status: 'submitted',
    statusNote: null,
    customerName: 'Internal',
    customerContact: '-',
    notesCustomer: null,
    configJson: JSON.stringify(DEFAULT_LG_CONFIG),
    imagePath: '',
    configJsonOperator: null,
    stlPath: null,
    notesOperator: null,
    additionalImagePath: null,
    createdAt: new Date('2026-06-13T00:00:00Z'),
    updatedAt: new Date('2026-06-13T00:00:00Z'),
    ...over,
  }
}

describe('createInternalLgOrder()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an internal order with default config and placeholder fields', async () => {
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(0)
    mockPrisma.lightGeneratorOrder.create.mockImplementation(({ data }: any) => fakeRow(data))

    const result = await createInternalLgOrder()

    const arg = mockPrisma.lightGeneratorOrder.create.mock.calls[0][0].data
    expect(arg.isInternal).toBe(true)
    expect(arg.customerName).toBe('Internal')
    expect(arg.customerContact).toBe('-')
    expect(arg.imagePath).toBe('')
    expect(arg.sanityDocId).toBeNull()
    expect(arg.status).toBe('submitted')
    expect(JSON.parse(arg.configJson)).toEqual(DEFAULT_LG_CONFIG)
    expect(arg.id).toMatch(/^LG-INT-\d{8}-\d{4}$/)
    expect(result.isInternal).toBe(true)
  })

  it('uses a trimmed label as customerName when provided', async () => {
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(2)
    mockPrisma.lightGeneratorOrder.create.mockImplementation(({ data }: any) => fakeRow(data))

    await createInternalLgOrder('  Test Naruto  ')
    const arg = mockPrisma.lightGeneratorOrder.create.mock.calls[0][0].data
    expect(arg.customerName).toBe('Test Naruto')
    expect(arg.id).toMatch(/-0003$/)
  })

  it('falls back to "Internal" for a blank label', async () => {
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(0)
    mockPrisma.lightGeneratorOrder.create.mockImplementation(({ data }: any) => fakeRow(data))

    await createInternalLgOrder('   ')
    expect(mockPrisma.lightGeneratorOrder.create.mock.calls[0][0].data.customerName).toBe('Internal')
  })
})

describe('listLgOrders() internal filter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns only internal orders when internal=true', async () => {
    mockPrisma.lightGeneratorOrder.findMany.mockResolvedValue([fakeRow()])
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(1)

    await listLgOrders({ internal: true })
    const where = mockPrisma.lightGeneratorOrder.findMany.mock.calls[0][0].where
    expect(where.isInternal).toBe(true)
  })

  it('excludes internal orders by default', async () => {
    mockPrisma.lightGeneratorOrder.findMany.mockResolvedValue([])
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(0)

    await listLgOrders({})
    const where = mockPrisma.lightGeneratorOrder.findMany.mock.calls[0][0].where
    expect(where.isInternal).toBe(false)
  })
})

describe('countLgPendingOrders()', () => {
  beforeEach(() => vi.clearAllMocks())

  it('excludes internal orders from the pending count', async () => {
    mockPrisma.lightGeneratorOrder.count.mockResolvedValue(3)
    await countLgPendingOrders()
    const where = mockPrisma.lightGeneratorOrder.count.mock.calls[0][0].where
    expect(where.isInternal).toBe(false)
    expect(where.status).toEqual({ in: ['submitted', 'paid'] })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/__tests__/light-generator/service.test.ts`
Expected: FAIL — `createInternalLgOrder is not exported` and `where.isInternal` undefined.

- [ ] **Step 3: Implement the service changes**

In `lib/light-generator/service.ts`:

(a) Add `isInternal` to the `serializeOrder` parameter type and pass-through. The function spreads `...o`, so only the type annotation needs the field. Update the param type object — add after `sanityDocId: string | null`:

```typescript
function serializeOrder(o: {
  id: string
  sanityDocId: string | null
  isInternal: boolean
  status: string
  // ... rest unchanged
```

(b) Update the imports at the top of the file:

```typescript
import { prisma } from "@/lib/db"
import type { LgOrder } from "./types"
import { DEFAULT_LG_CONFIG } from "./types"
```

(c) Change `listLgOrders` to filter by internal. Replace the existing function:

```typescript
export async function listLgOrders(opts: {
  status?: string
  internal?: boolean
  limit?: number
  offset?: number
}): Promise<{ orders: LgOrder[]; total: number }> {
  const where: { status?: string; isInternal: boolean } = {
    isInternal: opts.internal === true,
  }
  if (opts.status) where.status = opts.status
  const [orders, total] = await Promise.all([
    prisma.lightGeneratorOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: opts.limit ?? 100,
      skip: opts.offset ?? 0,
    }),
    prisma.lightGeneratorOrder.count({ where }),
  ])
  return { orders: orders.map(serializeOrder), total }
}
```

(d) Change `countLgPendingOrders` to exclude internal:

```typescript
export async function countLgPendingOrders(): Promise<number> {
  return prisma.lightGeneratorOrder.count({
    where: { isInternal: false, status: { in: ["submitted", "paid"] } },
  })
}
```

(e) Add `createInternalLgOrder` at the end of the file:

```typescript
function pad(n: number, width: number): string {
  return String(n).padStart(width, "0")
}

/**
 * Create a blank internal (operator-authored) order for experimentation.
 * No customer, no Sanity sync. Seeded with DEFAULT_LG_CONFIG and an empty
 * imagePath (set when the operator uploads a silhouette).
 */
export async function createInternalLgOrder(label?: string): Promise<LgOrder> {
  const now = new Date()
  const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`
  const prefix = `LG-INT-${ymd}-`
  const todayCount = await prisma.lightGeneratorOrder.count({
    where: { id: { startsWith: prefix } },
  })
  const id = `${prefix}${pad(todayCount + 1, 4)}`

  const row = await prisma.lightGeneratorOrder.create({
    data: {
      id,
      isInternal: true,
      sanityDocId: null,
      status: "submitted",
      customerName: label?.trim() || "Internal",
      customerContact: "-",
      configJson: JSON.stringify(DEFAULT_LG_CONFIG),
      imagePath: "",
    },
  })
  return serializeOrder(row)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/__tests__/light-generator/service.test.ts`
Expected: PASS (3 + 2 + 1 = 6 tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/light-generator/service.ts lib/__tests__/light-generator/service.test.ts
git commit -m "feat(lg): createInternalLgOrder + internal filter on list/count"
```

---

## Task 4: API — POST create + GET internal filter

**Files:**
- Modify: `app/api/light-generator/orders/route.ts`

- [ ] **Step 1: Replace the route file**

Replace the entire contents of `app/api/light-generator/orders/route.ts`:

```typescript
import { auth } from "@/lib/auth"
import { listLgOrders, createInternalLgOrder } from "@/lib/light-generator/service"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? undefined
  const internal = searchParams.get("internal") === "true"
  const limit = Number(searchParams.get("limit") ?? "100")
  const offset = Number(searchParams.get("offset") ?? "0")

  try {
    const result = await listLgOrders({ status, internal, limit, offset })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let label: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    if (typeof body?.label === "string") label = body.label
  } catch {
    // empty/invalid body is fine — label stays undefined
  }

  try {
    const order = await createInternalLgOrder(label)
    return NextResponse.json(order, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors in `route.ts`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/light-generator/orders/route.ts"
git commit -m "feat(lg): POST create internal order + GET internal filter"
```

---

## Task 5: Hooks — `useLgOrders(status, internal)` + `useCreateInternalLgOrder`

**Files:**
- Modify: `lib/hooks/use-light-generator.ts`

- [ ] **Step 1: Update the query key and fetcher to include `internal`**

In `lib/hooks/use-light-generator.ts`, replace the `LG_ORDERS_KEY` definition and `fetchOrders` function:

```typescript
const LG_ORDERS_KEY = (status?: string, internal?: boolean) =>
  ["lg-orders", status ?? "all", internal ? "internal" : "customer"] as const
```

```typescript
async function fetchOrders(status?: string, internal?: boolean): Promise<{ orders: LgOrder[]; total: number }> {
  const params = new URLSearchParams({ limit: "200" })
  if (status) params.set("status", status)
  if (internal) params.set("internal", "true")
  const res = await fetch(`/api/light-generator/orders?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Update `useLgOrders` to pass `internal`**

Replace the existing `useLgOrders`:

```typescript
export function useLgOrders(status?: string, internal?: boolean) {
  return useQuery({
    queryKey: LG_ORDERS_KEY(status, internal),
    queryFn: () => fetchOrders(status, internal),
  })
}
```

- [ ] **Step 3: Add the create mutation**

After `useLgOrder` (before `useSanityOrders`), add:

```typescript
export function useCreateInternalLgOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (label?: string) => {
      const res = await fetch("/api/light-generator/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(label ? { label } : {}),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<LgOrder>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lg-orders"] })
    },
  })
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors. (Existing `useLgOrders(status)` callers still compile — `internal` is optional.)

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/use-light-generator.ts
git commit -m "feat(lg): useCreateInternalLgOrder + internal arg on useLgOrders"
```

---

## Task 6: Generate guard — disable Generate until silhouette uploaded

**Files:**
- Modify: `components/light-generator/LgGeneratePanel.tsx`
- Modify: `app/(dashboard)/light-generator/[id]/page.tsx`

- [ ] **Step 1: Add `hasSilhouette` to the panel props**

In `components/light-generator/LgGeneratePanel.tsx`, update the props interface:

```typescript
interface LgGeneratePanelProps {
  orderId: string
  config: Record<string, unknown>
  initialStlReady?: boolean
  hasSilhouette?: boolean
}
```

And the destructure (default `true` so existing usage is unaffected):

```typescript
export function LgGeneratePanel({ orderId, config, initialStlReady, hasSilhouette = true }: LgGeneratePanelProps) {
```

- [ ] **Step 2: Disable the Generate + Preview buttons and show a hint**

In the same file, find the Generate STL button block and replace the two action buttons (Generate STL + Shadow Preview) plus add a hint. The buttons currently read `disabled={isPending}` — change both to also require a silhouette, and add a hint line above the button row:

```tsx
{!hasSilhouette && (
  <p className="text-sm text-amber-600">Upload silhouette dulu sebelum generate.</p>
)}

<div className="flex flex-wrap items-center gap-3">
  <Button onClick={handleGenerateStl} disabled={isPending || !hasSilhouette}>
    {isPending ? "Working..." : "Generate STL"}
  </Button>
  <Button variant="outline" onClick={handleShadowPreview} disabled={isPending || !hasSilhouette}>
    <Eye className="size-4 mr-1" />
    Shadow Preview
  </Button>
  {stlReady && (
    <a href={`/api/light-generator/orders/${orderId}/stl`} download>
      <Button variant="outline" size="sm">
        <Download className="size-4 mr-1" />
        Download STL
      </Button>
    </a>
  )}
</div>
```

- [ ] **Step 3: Pass `hasSilhouette` from the detail page**

In `app/(dashboard)/light-generator/[id]/page.tsx`, find the `<LgGeneratePanel ... />` usage and add the prop:

```tsx
<LgGeneratePanel
  orderId={id}
  config={mergedConfig}
  initialStlReady={!!order.stlPath}
  hasSilhouette={!!order.imagePath}
/>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/light-generator/LgGeneratePanel.tsx "app/(dashboard)/light-generator/[id]/page.tsx"
git commit -m "feat(lg): disable generate until silhouette uploaded"
```

---

## Task 7: UI — internal order list + create button in the LG tab

**Files:**
- Modify: `app/(dashboard)/order/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `app/(dashboard)/order/page.tsx`, add (alongside existing imports):

```typescript
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLgOrders, useCreateInternalLgOrder } from "@/lib/hooks/use-light-generator"
import { Badge } from "@/components/ui/badge"
```

(If any of these are already imported, do not duplicate — keep one import.)

- [ ] **Step 2: Replace the `LightGeneratorOrderView` placeholder**

Replace the entire `LightGeneratorOrderView` function:

```tsx
function LightGeneratorOrderView() {
  const router = useRouter()
  const { data, isLoading } = useLgOrders(undefined, true)
  const createMut = useCreateInternalLgOrder()

  async function handleCreate() {
    const order = await createMut.mutateAsync(undefined)
    router.push(`/light-generator/${order.id}`)
  }

  const orders = data?.orders ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Order internal (eksperimen)</h2>
        <Button size="sm" onClick={handleCreate} disabled={createMut.isPending}>
          {createMut.isPending ? "Membuat..." : "+ Buat Order Internal"}
        </Button>
      </div>

      {createMut.isError && (
        <p className="text-sm text-destructive">
          Gagal membuat order: {createMut.error instanceof Error ? createMut.error.message : "Unknown error"}
        </p>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">Memuat...</p>
      ) : orders.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          Belum ada order internal. Klik &quot;Buat Order Internal&quot; untuk mulai.
        </p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/light-generator/${o.id}`}
              className="flex items-center gap-3 rounded-md border px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <span className="font-mono text-sm">{o.id}</span>
              <Badge variant="outline" className="capitalize">{o.status}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(o.createdAt).toLocaleDateString("id-ID")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2b: Confirm `useRouter` is allowed here**

`app/(dashboard)/order/page.tsx` already starts with `"use client"` (it uses `useState`). No change needed — just verify the directive is present at the top.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: No errors.

Run: `npm run build`
Expected: Build succeeds (route `/order` compiles).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/order/page.tsx"
git commit -m "feat(lg): internal order list + create button in LG order tab"
```

---

## Task 8: Full verification + deploy

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass (including the new `service.test.ts`).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Deploy**

Run: `bash deploy.sh`
Expected: Build + deploy succeeds; `docker-entrypoint.sh` runs `prisma db push` and adds the `isInternal` column.

- [ ] **Step 4: Smoke test (manual)**

1. Open the dashboard → Order page → "Light Generator" tab.
2. Click "+ Buat Order Internal" → should navigate to `/light-generator/LG-INT-YYYYMMDD-0001`.
3. Generate button should be disabled with the "Upload silhouette dulu" hint.
4. Upload a silhouette → Generate enables → Generate STL → Download STL works.
5. Return to the Order page LG tab → the new order appears in the list.
6. Confirm the customer-order pending badge in CMS/landing did NOT increment.

- [ ] **Step 5: Commit any final touch-ups** (only if smoke test surfaced a fix)

```bash
git add -A
git commit -m "fix(lg): smoke-test follow-ups for internal orders"
```
