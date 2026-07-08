# LG Orders Landing Sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Light Generator order intake (Sanity pending) into the `/landing` CMS sidebar as a new "LG Orders" section, showing all Sanity orders with a confirmed/unconfirmed flag, while removing the duplicate panel from `/light-generator`.

**Architecture:** New `GET /api/light-generator/sanity-orders` replaces the old `sanity-pending` endpoint — it returns all Sanity LG orders annotated with `isConfirmed: boolean`. Badge count flows through the existing `/api/cms/counts` route. `LgOrdersManager` component follows the `StravaOrdersManager` pattern. `/light-generator` page drops `PendingSanityPanel`.

**Tech Stack:** Next.js 16 App Router, React Query, Sanity `@sanity/client`, Prisma 7, Tailwind + existing component library (`CollectionList`, `Button`)

---

## File Map

**New files:**
- `app/api/light-generator/sanity-orders/route.ts` — replaces `sanity-pending`; returns all Sanity LG orders + `isConfirmed`
- `components/cms/LgOrdersManager.tsx` — new CMS section component

**Modified files:**
- `lib/light-generator/sanity-helpers.ts` — add `fetchAllSanityLgOrders()` + `countUnconfirmedSanityLgOrders()`
- `lib/light-generator/types.ts` — add `SanityLgOrderWithConfirmed` type
- `lib/hooks/use-light-generator.ts` — replace `useSanityPending` with `useSanityOrders`; update `useConfirmLgOrder` invalidation key
- `lib/sanity/types.ts` — add `lgOrdersPending: number` to `CmsCounts`
- `app/api/cms/counts/route.ts` — add `lgOrdersPending` via `countUnconfirmedSanityLgOrders()`
- `components/cms/CMSSidebar.tsx` — add `lg-orders` nav item with badge
- `app/(dashboard)/landing/page.tsx` — add `lg-orders` case
- `app/(dashboard)/light-generator/page.tsx` — remove `PendingSanityPanel` + related imports

**Deleted files:**
- `app/api/light-generator/sanity-pending/route.ts`

---

## Task 1: Add Sanity helpers — fetchAllSanityLgOrders + countUnconfirmedSanityLgOrders

**Files:**
- Modify: `lib/light-generator/sanity-helpers.ts`
- Modify: `lib/light-generator/types.ts`

- [ ] **Step 1: Add `SanityLgOrderWithConfirmed` type to `lib/light-generator/types.ts`**

Open `lib/light-generator/types.ts` and append at the end:

```typescript
export type SanityLgOrderWithConfirmed = SanityLgOrder & { isConfirmed: boolean }
```

- [ ] **Step 2: Add `fetchAllSanityLgOrders` to `lib/light-generator/sanity-helpers.ts`**

Append after `fetchSanityPendingOrders`:

```typescript
/** Fetch ALL Sanity LG orders regardless of status */
export async function fetchAllSanityLgOrders(): Promise<SanityLgOrder[]> {
  return sanityRead.fetch<SanityLgOrder[]>(
    `*[_type == "lightGeneratorOrder"] | order(submittedAt desc) {
      _id, orderId, status, customerName, customerContact, customerNotes,
      size, shape, shapeRatio, shadowDiameter, shadowOffsetX, shadowOffsetY, supportStems,
      silhouetteImage { asset { _ref } },
      floorInsertImage { asset { _ref } },
      submittedAt
    }`,
  )
}
```

- [ ] **Step 3: Add `countUnconfirmedSanityLgOrders` to `lib/light-generator/sanity-helpers.ts`**

Append after `fetchAllSanityLgOrders`. This helper is used by `/api/cms/counts` for the badge number. It needs a Prisma import — add `import { prisma } from "@/lib/db"` at the top of the file if not already present.

```typescript
/**
 * Count Sanity LG orders that have NOT yet been confirmed (copied to local DB).
 * Used for the badge count in /api/cms/counts.
 */
export async function countUnconfirmedSanityLgOrders(): Promise<number> {
  const { prisma } = await import("@/lib/db")
  const sanityOrders = await sanityRead.fetch<Array<{ orderId: string }>>(
    `*[_type == "lightGeneratorOrder"]{ orderId }`,
  )
  if (sanityOrders.length === 0) return 0
  const confirmed = await prisma.lightGeneratorOrder.count({
    where: { id: { in: sanityOrders.map((o) => o.orderId) } },
  })
  return sanityOrders.length - confirmed
}
```

Note: using a dynamic `import("@/lib/db")` keeps the Sanity-only helpers free of Prisma at the module level (build-time safety). Alternatively add `import { prisma } from "@/lib/db"` at the top of the file — either works since this file only runs server-side.

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | grep "sanity-helpers\|types" | head -20
```

Expected: no errors on those files.

- [ ] **Step 5: Commit**

```bash
git add lib/light-generator/sanity-helpers.ts lib/light-generator/types.ts
git commit -m "feat(lg): add fetchAllSanityLgOrders + countUnconfirmedSanityLgOrders helpers"
```

---

## Task 2: New sanity-orders API route + delete sanity-pending

**Files:**
- Create: `app/api/light-generator/sanity-orders/route.ts`
- Delete: `app/api/light-generator/sanity-pending/route.ts`

- [ ] **Step 1: Create `app/api/light-generator/sanity-orders/route.ts`**

```typescript
import { auth } from "@/lib/auth"
import { fetchAllSanityLgOrders } from "@/lib/light-generator/sanity-helpers"
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"
import type { SanityLgOrderWithConfirmed } from "@/lib/light-generator/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sanityOrders = await fetchAllSanityLgOrders()
  if (sanityOrders.length === 0) return NextResponse.json([])

  const confirmed = await prisma.lightGeneratorOrder.findMany({
    where: { id: { in: sanityOrders.map((o) => o.orderId) } },
    select: { id: true },
  })
  const confirmedSet = new Set(confirmed.map((r) => r.id))

  const result: SanityLgOrderWithConfirmed[] = sanityOrders.map((o) => ({
    ...o,
    isConfirmed: confirmedSet.has(o.orderId),
  }))

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Delete the old sanity-pending route**

```bash
rm /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard/app/api/light-generator/sanity-pending/route.ts
rmdir /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard/app/api/light-generator/sanity-pending
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (the old route is gone, the new one compiles).

- [ ] **Step 4: Commit**

```bash
git add app/api/light-generator/sanity-orders/
git rm app/api/light-generator/sanity-pending/route.ts
git commit -m "feat(lg): replace sanity-pending with sanity-orders (all orders + isConfirmed flag)"
```

---

## Task 3: Update hooks — useSanityOrders replaces useSanityPending

**Files:**
- Modify: `lib/hooks/use-light-generator.ts`

- [ ] **Step 1: Replace `LG_PENDING_SANITY_KEY` with `LG_SANITY_ORDERS_KEY`**

In `lib/hooks/use-light-generator.ts`, find:

```typescript
const LG_PENDING_SANITY_KEY = ["lg-sanity-pending"] as const
```

Replace with:

```typescript
const LG_SANITY_ORDERS_KEY = ["lg-sanity-orders"] as const
```

- [ ] **Step 2: Replace `fetchSanityPending` fetcher with `fetchSanityOrders`**

Find:

```typescript
async function fetchSanityPending(): Promise<SanityLgOrder[]> {
  const res = await fetch("/api/light-generator/sanity-pending")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
```

Replace with:

```typescript
async function fetchSanityOrders(): Promise<SanityLgOrderWithConfirmed[]> {
  const res = await fetch("/api/light-generator/sanity-orders")
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
```

Also update the import at the top — add `SanityLgOrderWithConfirmed` to the import from `@/lib/light-generator/types`:

```typescript
import type { LgOrder, SanityLgOrder, SanityLgOrderWithConfirmed } from "@/lib/light-generator/types"
```

- [ ] **Step 3: Replace `useSanityPending` hook with `useSanityOrders`**

Find:

```typescript
export function useSanityPending() {
  return useQuery({
    queryKey: LG_PENDING_SANITY_KEY,
    queryFn: fetchSanityPending,
  })
}
```

Replace with:

```typescript
export function useSanityOrders() {
  return useQuery({
    queryKey: LG_SANITY_ORDERS_KEY,
    queryFn: fetchSanityOrders,
  })
}
```

- [ ] **Step 4: Update `useConfirmLgOrder` invalidation key**

In `useConfirmLgOrder`, find:

```typescript
onSuccess: () => {
  qc.invalidateQueries({ queryKey: LG_PENDING_SANITY_KEY })
  qc.invalidateQueries({ queryKey: ["lg-orders"] })
},
```

Replace with:

```typescript
onSuccess: () => {
  qc.invalidateQueries({ queryKey: LG_SANITY_ORDERS_KEY })
  qc.invalidateQueries({ queryKey: ["lg-orders"] })
},
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | grep "use-light-generator" | head -10
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/hooks/use-light-generator.ts
git commit -m "feat(lg): replace useSanityPending with useSanityOrders hook"
```

---

## Task 4: Add lgOrdersPending to /api/cms/counts

**Files:**
- Modify: `lib/sanity/types.ts`
- Modify: `app/api/cms/counts/route.ts`

- [ ] **Step 1: Add `lgOrdersPending` to `CmsCounts` in `lib/sanity/types.ts`**

Find the `CmsCounts` interface (currently around line 136):

```typescript
export interface CmsCounts {
  gallery: number
  testimonials: number
  faq: number
  stravaOrdersNew: number
  waitlist: number
}
```

Replace with:

```typescript
export interface CmsCounts {
  gallery: number
  testimonials: number
  faq: number
  stravaOrdersNew: number
  waitlist: number
  lgOrdersPending: number
}
```

- [ ] **Step 2: Update `app/api/cms/counts/route.ts` to include lgOrdersPending**

Current file:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import type { CmsCounts } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const counts = await sanityRead.fetch<CmsCounts>(Q.counts)
  return NextResponse.json(counts)
}
```

Replace with:

```typescript
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { sanityRead } from "@/lib/sanity/client"
import { Q } from "@/lib/sanity/queries"
import { countUnconfirmedSanityLgOrders } from "@/lib/light-generator/sanity-helpers"
import type { CmsCounts } from "@/lib/sanity/types"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [sanityCounts, lgOrdersPending] = await Promise.all([
    sanityRead.fetch<Omit<CmsCounts, "lgOrdersPending">>(Q.counts),
    countUnconfirmedSanityLgOrders(),
  ])

  const counts: CmsCounts = { ...sanityCounts, lgOrdersPending }
  return NextResponse.json(counts)
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | grep "counts\|CmsCounts" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/sanity/types.ts app/api/cms/counts/route.ts
git commit -m "feat(lg): add lgOrdersPending to /api/cms/counts"
```

---

## Task 5: Create LgOrdersManager component

**Files:**
- Create: `components/cms/LgOrdersManager.tsx`

- [ ] **Step 1: Create `components/cms/LgOrdersManager.tsx`**

```typescript
"use client"

import Link from "next/link"
import { useState } from "react"
import { useSanityOrders, useConfirmLgOrder } from "@/lib/hooks/use-light-generator"
import { CollectionList } from "./shared/CollectionList"
import type { SanityLgOrderWithConfirmed } from "@/lib/light-generator/types"

export function LgOrdersManager() {
  const { data: items = [], isLoading } = useSanityOrders()
  const confirm = useConfirmLgOrder()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const pendingCount = items.filter((i) => !i.isConfirmed).length

  function handleConfirm(orderId: string) {
    setConfirming(orderId)
    setFeedback((f) => ({ ...f, [orderId]: "" }))
    confirm.mutate(orderId, {
      onSuccess: () => {
        setConfirming(null)
      },
      onError: (err) => {
        setFeedback((f) => ({ ...f, [orderId]: `❌ ${err.message}` }))
        setConfirming(null)
      },
    })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-white">🔦 Light Generator Orders</h2>
          <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            {items.length} total{pendingCount > 0 ? ` · ${pendingCount} menunggu konfirmasi` : " · semua terkonfirmasi"}
          </p>
        </div>
        <Link
          href="/light-generator"
          className="text-[11px] font-medium transition-opacity hover:opacity-80"
          style={{ color: "rgba(165,180,252,0.8)" }}
        >
          Lihat semua →
        </Link>
      </div>

      <CollectionList
        items={items}
        emptyMessage="Tidak ada order dari landing page."
        columns={[
          {
            key: "id",
            label: "Order ID",
            width: "160px",
            render: (item: SanityLgOrderWithConfirmed) => (
              <span className="text-[11px] font-mono text-white/70">{item.orderId}</span>
            ),
          },
          {
            key: "customer",
            label: "Pelanggan",
            width: "160px",
            render: (item: SanityLgOrderWithConfirmed) => (
              <div>
                <div className="text-[12px] text-white/80">{item.customerName}</div>
                <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {item.customerContact}
                </div>
              </div>
            ),
          },
          {
            key: "config",
            label: "Config",
            render: (item: SanityLgOrderWithConfirmed) => (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {item.size} · {item.shape}
              </div>
            ),
          },
          {
            key: "date",
            label: "Tanggal",
            width: "90px",
            render: (item: SanityLgOrderWithConfirmed) => (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {new Date(item.submittedAt).toLocaleDateString("id-ID")}
              </div>
            ),
          },
          {
            key: "action",
            label: "",
            width: "120px",
            render: (item: SanityLgOrderWithConfirmed) => {
              if (item.isConfirmed) {
                return (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full"
                    style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                  >
                    ✅ Confirmed
                  </span>
                )
              }
              const fb = feedback[item.orderId]
              if (fb) {
                return <span className="text-[10px]">{fb}</span>
              }
              return (
                <button
                  onClick={() => handleConfirm(item.orderId)}
                  disabled={confirming === item.orderId}
                  className="text-[11px] font-semibold px-3 py-1 rounded-[6px] transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: "rgba(99,102,241,0.25)", color: "#a5b4fc" }}
                >
                  {confirming === item.orderId ? "..." : "Confirm"}
                </button>
              )
            },
          },
        ]}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | grep "LgOrdersManager" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/cms/LgOrdersManager.tsx
git commit -m "feat(lg): add LgOrdersManager CMS component"
```

---

## Task 6: Wire LgOrdersManager into CMSSidebar + landing page

**Files:**
- Modify: `components/cms/CMSSidebar.tsx`
- Modify: `app/(dashboard)/landing/page.tsx`

- [ ] **Step 1: Add `lg-orders` to `CmsSection` type in `components/cms/CMSSidebar.tsx`**

Find:

```typescript
type CmsSection =
  | "site-settings" | "gallery" | "testimonials" | "faq"
  | "strava-orders" | "waitlist" | "generator" | "faceshell"
```

Replace with:

```typescript
type CmsSection =
  | "site-settings" | "gallery" | "testimonials" | "faq"
  | "strava-orders" | "waitlist" | "generator" | "faceshell"
  | "lg-orders"
```

- [ ] **Step 2: Add `lg-orders` nav item to `NAV_ITEMS` in `components/cms/CMSSidebar.tsx`**

In the `NAV_ITEMS` array, add after the `faceshell` entry:

```typescript
{
  section: "lg-orders",
  icon: "🔦",
  label: "LG Orders",
  badge: (c) => c?.lgOrdersPending ?? null,
  badgeVariant: "alert",
},
```

- [ ] **Step 3: Update `CmsSection` type in `app/(dashboard)/landing/page.tsx`**

Find:

```typescript
type CmsSection =
  | "site-settings" | "gallery" | "testimonials" | "faq"
  | "strava-orders" | "waitlist" | "generator" | "faceshell"
```

Replace with:

```typescript
type CmsSection =
  | "site-settings" | "gallery" | "testimonials" | "faq"
  | "strava-orders" | "waitlist" | "generator" | "faceshell"
  | "lg-orders"
```

Also update `validSections`:

```typescript
const validSections: CmsSection[] = [
  "site-settings", "gallery", "testimonials", "faq",
  "strava-orders", "waitlist", "generator", "faceshell", "lg-orders",
]
```

- [ ] **Step 4: Add `LgOrdersManager` import + render case in `app/(dashboard)/landing/page.tsx`**

Add import at the top:

```typescript
import { LgOrdersManager } from "@/components/cms/LgOrdersManager"
```

In the render section, add after the `faceshell` case:

```typescript
{activeSection === "lg-orders" && <LgOrdersManager />}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/cms/CMSSidebar.tsx "app/(dashboard)/landing/page.tsx"
git commit -m "feat(lg): add LG Orders section to landing CMS sidebar"
```

---

## Task 7: Remove PendingSanityPanel from /light-generator page

**Files:**
- Modify: `app/(dashboard)/light-generator/page.tsx`

- [ ] **Step 1: Remove imports for `useSanityPending` and `useConfirmLgOrder`**

Find the import line:

```typescript
import { useLgOrders, useSanityPending, useConfirmLgOrder } from "@/lib/hooks/use-light-generator"
```

Replace with:

```typescript
import { useLgOrders } from "@/lib/hooks/use-light-generator"
```

- [ ] **Step 2: Remove the `PendingSanityPanel` component entirely**

Delete the entire `PendingSanityPanel` function — from `function PendingSanityPanel()` down through its closing `}`. It spans approximately lines 26–108 of the current file.

- [ ] **Step 3: Remove `<PendingSanityPanel />` usage**

Find in `LightGeneratorPageInner`:

```typescript
<PendingSanityPanel />
```

Delete that line.

- [ ] **Step 4: Remove unused imports**

Check if `SanityLgOrder` is still used anywhere in the file. If it's only used in `PendingSanityPanel` (which is now deleted), update the type import:

Find:

```typescript
import type { LgOrder, SanityLgOrder, LgStatus } from "@/lib/light-generator/types"
```

Replace with:

```typescript
import type { LgOrder, LgStatus } from "@/lib/light-generator/types"
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/light-generator/page.tsx"
git commit -m "feat(lg): remove PendingSanityPanel from operator page (moved to Landing sidebar)"
```

---

## Task 8: Build + deploy

- [ ] **Step 1: Full TypeScript + build check**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully` — `/landing`, `/light-generator`, `/api/light-generator/sanity-orders`, `/api/cms/counts` all listed as routes.

- [ ] **Step 2: Docker build**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker build -t shopee-dashboard:latest . 2>&1 | tail -10
```

Expected: `Successfully tagged shopee-dashboard:latest`

- [ ] **Step 3: Deploy**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker stop shopee-dashboard 2>/dev/null
DOCKER_HOST=tcp://192.168.88.113:2375 docker rm shopee-dashboard 2>/dev/null
DOCKER_HOST=tcp://192.168.88.113:2375 docker run -d \
  --name shopee-dashboard \
  --network homelab \
  -p 3100:3000 \
  --env-file .env.deploy \
  shopee-dashboard:latest
```

- [ ] **Step 4: Smoke test**

```bash
# Container running
DOCKER_HOST=tcp://192.168.88.113:2375 docker inspect shopee-dashboard --format='{{.State.Status}}'
# Expected: running
```

Manual checks:
1. Open `https://dashboard.3dprinting.my.id/landing` → sidebar shows **🔦 LG Orders** item
2. Click LG Orders → list renders (empty or with orders)
3. Open `https://dashboard.3dprinting.my.id/light-generator` → **no** pending Sanity panel at top
4. If a Sanity LG order exists: badge number appears on LG Orders sidebar item

- [ ] **Step 5: Final commit if any tweaks needed**

```bash
git add -p
git commit -m "fix(lg): post-deploy adjustments"
```

---

## Self-Review

**Spec coverage:**
| Spec requirement | Task |
|---|---|
| New `GET /api/light-generator/sanity-orders` (all + isConfirmed) | Task 2 |
| Delete `sanity-pending` route | Task 2 |
| `fetchAllSanityLgOrders` helper | Task 1 |
| `countUnconfirmedSanityLgOrders` helper | Task 1 |
| `SanityLgOrderWithConfirmed` type | Task 1 |
| `useSanityOrders` replaces `useSanityPending` | Task 3 |
| `lgOrdersPending` in `/api/cms/counts` | Task 4 |
| `CmsCounts.lgOrdersPending` type | Task 4 |
| `LgOrdersManager` component | Task 5 |
| `CMSSidebar` `lg-orders` item + badge | Task 6 |
| `/landing` page wired to `LgOrdersManager` | Task 6 |
| Remove `PendingSanityPanel` from `/light-generator` | Task 7 |
| "Lihat semua →" link to `/light-generator` | Task 5 |
| Confirmed orders show ✅ flag (not hidden) | Task 5 |
| Badge = unconfirmed count only | Tasks 4 + 6 |

All spec requirements covered. ✅
