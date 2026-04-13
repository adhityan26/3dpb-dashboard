# Dark Theme + UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full-site dark theme (Slate Blue-Gray palette, 3-way toggle) and redesign SpoolCard to compact layout with color strip + weight progress bar + tap-to-action-sheet.

**Architecture:** `next-themes` manages theme state via `.dark` class on `<html>`. Tailwind v4's `@custom-variant dark (&:is(.dark *))` already in globals.css makes `dark:` utilities work automatically. ShadCN components use CSS variables and inherit dark mode for free — only hardcoded `gray-*`/`white` Tailwind classes in custom components need `dark:` equivalents added manually.

**Tech Stack:** Next.js 16 App Router, Tailwind v4, `next-themes` (new install), React 19, TypeScript, Prisma + SQLite

---

## File Map

**New files:**
- `components/ThemeToggle.tsx` — 3-way ☀️/💻/🌙 pill toggle
- `components/providers/ThemeProvider.tsx` — next-themes wrapper
- `components/filamen/SpoolActionSheet.tsx` — bottom sheet modal (Edit / Print / NFC)

**Modified files:**
- `package.json` — add `next-themes`
- `app/layout.tsx` — wrap with ThemeProvider
- `components/layout/TabNav.tsx` — add ThemeToggle + dark: nav colors
- `app/(auth)/layout.tsx` — `bg-gray-50` → `dark:bg-slate-900`
- `app/(dashboard)/layout.tsx` — `bg-gray-50` → `dark:bg-slate-900`
- `lib/filamen/types.ts` — add `usedWeight`, `initialWeight` to `SpoolData`
- `lib/filamen/spool-service.ts` — join `spoolmanSpool` in `listSpools()`
- `components/filamen/SpoolCard.tsx` — full redesign: compact + color strip + progress bar + tap handler
- `components/filamen/SpoolTab.tsx` — add `actionSheetSpool` state, render `SpoolActionSheet`, dark: toolbar
- `components/filamen/SpoolKpiBar.tsx` — dark: classes
- `components/filamen/FilamenTab.tsx` — dark: classes on sub-nav
- `components/filamen/AmsTab.tsx` — dark: classes
- `components/filamen/AmsVariantRow.tsx` — dark: classes
- `components/filamen/PrinterTab.tsx` — dark: classes
- `components/filamen/ScanModal.tsx` — dark: modal overlay + content
- `components/filamen/NfcLinkModal.tsx` — dark: modal
- `components/filamen/BatchPrintModal.tsx` — dark: modal
- `components/order/OrderRow.tsx` — `bg-green-50/40` → `dark:bg-green-950/40`, `bg-amber-50/40` → `dark:bg-amber-950/40`

---

## Task 1: Install next-themes + ThemeProvider + ThemeToggle

**Files:**
- Create: `components/providers/ThemeProvider.tsx`
- Create: `components/ThemeToggle.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Install next-themes**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npm install next-themes
```

Expected: `next-themes` added to `package.json` dependencies.

- [ ] **Step 2: Create ThemeProvider wrapper**

Create `components/providers/ThemeProvider.tsx`:

```tsx
"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
```

- [ ] **Step 3: Create ThemeToggle component**

Create `components/ThemeToggle.tsx`:

```tsx
"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

const OPTIONS = [
  { value: "light", icon: "☀️", label: "Light" },
  { value: "system", icon: "💻", label: "Auto" },
  { value: "dark", icon: "🌙", label: "Dark" },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — only render after mount
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-24 h-7" />

  return (
    <div className="flex items-center bg-white/10 rounded-full p-0.5 gap-0.5">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          title={opt.label}
          className={`px-2 py-1 rounded-full text-xs transition-colors ${
            theme === opt.value
              ? "bg-indigo-500 text-white"
              : "text-white/70 hover:text-white"
          }`}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Wrap app/layout.tsx with ThemeProvider**

Edit `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ReactQueryProvider } from "@/components/providers/ReactQueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shopee Dashboard — 3D Printing Bandung",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <SessionProvider>
            <ReactQueryProvider>{children}</ReactQueryProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Note: `suppressHydrationWarning` on `<html>` is required for next-themes — it modifies the `class` attribute on the server vs client.

- [ ] **Step 5: Add ThemeToggle to TabNav**

Edit `components/layout/TabNav.tsx` — import ThemeToggle, add to nav, add dark: classes:

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/ThemeToggle"

interface Tab {
  href: string
  label: string
  icon: string
  roles: string[]
}

const TABS: Tab[] = [
  { href: "/order",    label: "Order",    icon: "📦", roles: ["OWNER", "ADMIN", "TEST_USER"] },
  { href: "/iklan",    label: "Iklan",    icon: "📊", roles: ["OWNER", "TEST_USER"] },
  { href: "/analisa",  label: "Analisa",  icon: "📈", roles: ["OWNER", "TEST_USER"] },
  { href: "/produk",   label: "Produk",   icon: "🏷️", roles: ["OWNER", "ADMIN", "TEST_USER"] },
  { href: "/settings", label: "Settings", icon: "⚙️", roles: ["OWNER"] },
]

interface TabNavProps {
  role: string
  badges?: Record<string, number>
}

export function TabNav({ role, badges = {} }: TabNavProps) {
  const pathname = usePathname()
  const visibleTabs = TABS.filter((tab) => tab.roles.includes(role))

  return (
    <nav className="sticky top-0 z-50 bg-[#EE4D2D] dark:bg-slate-900 shadow-md">
      <div className="max-w-6xl mx-auto flex items-center overflow-x-auto">
        <div className="flex flex-1">
          {visibleTabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href)
            const key = tab.href.slice(1)
            const badgeCount = badges[key]

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-white dark:border-indigo-400 text-white dark:text-indigo-400"
                    : "border-transparent text-white/70 dark:text-slate-400 hover:text-white dark:hover:text-slate-200 hover:border-white/50 dark:hover:border-slate-500"
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {badgeCount != null && badgeCount > 0 && (
                  <Badge className="bg-white text-[#EE4D2D] dark:bg-indigo-500 dark:text-white text-xs px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center">
                    {badgeCount}
                  </Badge>
                )}
              </Link>
            )
          })}
        </div>
        <div className="px-3 py-1.5 flex-shrink-0">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
```

- [ ] **Step 6: Verify build passes**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add components/providers/ThemeProvider.tsx components/ThemeToggle.tsx app/layout.tsx components/layout/TabNav.tsx package.json package-lock.json
git commit -m "feat: add next-themes ThemeProvider, 3-way ThemeToggle in navbar"
```

---

## Task 2: Dark mode for layouts + FilamenTab sub-nav + auth layout

**Files:**
- Modify: `app/(auth)/layout.tsx`
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `components/filamen/FilamenTab.tsx`

- [ ] **Step 1: Update auth layout**

Edit `app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-4">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Update dashboard layout**

Edit `app/(dashboard)/layout.tsx` — change `bg-gray-50` to include dark variant:

```tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { TabNav } from "@/components/layout/TabNav"
import { countBelumCetak } from "@/lib/orders/service"
import { getAdsPerformance } from "@/lib/ads/service"
import { countPerluPerhatian } from "@/lib/products/service"

async function getBadges(): Promise<Record<string, number>> {
  const [orderResult, adsResult, productsResult] = await Promise.allSettled([
    countBelumCetak(),
    getAdsPerformance("7d"),
    countPerluPerhatian(),
  ])

  const badges: Record<string, number> = {}

  if (orderResult.status === "fulfilled") {
    badges.order = orderResult.value
  } else {
    console.warn("Failed to fetch order badge:", orderResult.reason)
  }

  if (adsResult.status === "fulfilled") {
    badges.iklan = adsResult.value.kpi.adsRugi
  } else {
    console.warn("Failed to fetch ads badge:", adsResult.reason)
  }

  if (productsResult.status === "fulfilled") {
    badges.produk = productsResult.value
  } else {
    console.warn("Failed to fetch products badge:", productsResult.reason)
  }

  return badges
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const badges = await getBadges()

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <TabNav role={session.user.role} badges={badges} />
      <main className="max-w-6xl mx-auto p-4">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3: Update FilamenTab sub-nav**

Edit `components/filamen/FilamenTab.tsx`:

```tsx
"use client"

import { useState } from "react"
import { SpoolTab } from "./SpoolTab"
import { AmsTab } from "./AmsTab"
import { PrinterTab } from "./PrinterTab"

type FilamenSubTab = "spool" | "ams" | "printer"

const TABS: { key: FilamenSubTab; label: string }[] = [
  { key: "spool", label: "Spool" },
  { key: "ams", label: "Urutan AMS" },
  { key: "printer", label: "Printer" },
]

export function FilamenTab() {
  const [active, setActive] = useState<FilamenSubTab>("spool")

  return (
    <div>
      <div className="flex border-b border-gray-200 dark:border-slate-700 mb-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === key
                ? "border-[#EE4D2D] dark:border-indigo-400 text-[#EE4D2D] dark:text-indigo-400"
                : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {active === "spool" && <SpoolTab />}
      {active === "ams" && <AmsTab />}
      {active === "printer" && <PrinterTab />}
    </div>
  )
}
```

- [ ] **Step 4: Update OrderRow for dark mode** (uses non-CSS-var bg colors)

Edit `components/order/OrderRow.tsx` — find the Card className:

```tsx
// Change:
<Card className={order.labelPrinted ? "bg-green-50/40" : "bg-amber-50/40"}>
// To:
<Card className={order.labelPrinted ? "bg-green-50/40 dark:bg-green-950/30" : "bg-amber-50/40 dark:bg-amber-950/30"}>
```

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/\(auth\)/layout.tsx app/\(dashboard\)/layout.tsx components/filamen/FilamenTab.tsx components/order/OrderRow.tsx
git commit -m "feat: dark mode for layouts, FilamenTab sub-nav, OrderRow"
```

---

## Task 3: Extend SpoolData with weight info from Spoolman

**Files:**
- Modify: `lib/filamen/types.ts`
- Modify: `lib/filamen/spool-service.ts`

- [ ] **Step 1: Add weight fields to SpoolData type**

Edit `lib/filamen/types.ts` — add two optional fields after `assignedSlotCount`:

```ts
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
  /** From linked SpoolmanSpool — grams used so far (null if no Spoolman record) */
  usedWeight: number | null
  /** From linked SpoolmanSpool — original full weight in grams (null if no record) */
  initialWeight: number | null
}
```

- [ ] **Step 2: Update spool-service to include Spoolman weight data**

Edit `lib/filamen/spool-service.ts` — update the type alias and `toSpoolData` + `listSpools`:

```ts
import { prisma } from '@/lib/db'
import type { SpoolData, SpoolStatus, SpoolsResponse } from './types'

type PrismaSpoolWithCount = NonNullable<Awaited<ReturnType<typeof prisma.spool.findUnique>>> & {
  _count?: { amsSlots: number }
  spoolmanSpool?: { usedWeight: number; initialWeight: number | null } | null
}

function toSpoolData(s: PrismaSpoolWithCount): SpoolData {
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
    usedWeight: s.spoolmanSpool?.usedWeight ?? null,
    initialWeight: s.spoolmanSpool?.initialWeight ?? null,
  }
}

export async function listSpools(): Promise<SpoolsResponse> {
  const spools = await prisma.spool.findMany({
    orderBy: [{ brand: 'asc' }, { colorName: 'asc' }, { createdAt: 'asc' }],
    include: {
      _count: { select: { amsSlots: true } },
      spoolmanSpool: { select: { usedWeight: true, initialWeight: true } },
    },
  })

  const byStatus = { new: 0, full: 0, mid: 0, low: 0, empty: 0 } as Record<SpoolStatus, number>
  for (const s of spools) byStatus[s.status as SpoolStatus]++

  return {
    spools: spools.map(toSpoolData),
    kpi: { total: spools.length, byStatus },
  }
}

// Keep all other functions unchanged (getSpoolByBarcode, getSpoolByNfc, createSpool, updateSpool, deleteSpool)
// They don't return weight data but that's fine — weight is only needed in the list view
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors (Prisma knows `spoolmanSpool` relation on `Spool`).

- [ ] **Step 4: Commit**

```bash
git add lib/filamen/types.ts lib/filamen/spool-service.ts
git commit -m "feat: extend SpoolData with usedWeight/initialWeight from Spoolman"
```

---

## Task 4: SpoolCard redesign — compact + color strip + progress bar

**Files:**
- Modify: `components/filamen/SpoolCard.tsx`

- [ ] **Step 1: Rewrite SpoolCard**

Replace entire content of `components/filamen/SpoolCard.tsx`:

```tsx
import type { SpoolData } from "@/lib/filamen/types"
import { SPOOL_STATUS_COLORS, SPOOL_STATUS_LABELS } from "@/lib/filamen/types"

interface SpoolCardProps {
  spool: SpoolData
  onEdit: (spool: SpoolData) => void
  onPrint: (spool: SpoolData) => void
  onTap?: (spool: SpoolData) => void
  selected?: boolean
  onSelect?: (spool: SpoolData) => void
}

export function SpoolCard({ spool, onEdit, onPrint, onTap, selected, onSelect }: SpoolCardProps) {
  const statusColor = SPOOL_STATUS_COLORS[spool.status]
  const statusLabel = SPOOL_STATUS_LABELS[spool.status]
  const isLow = spool.status === "low" || spool.status === "empty"

  // Weight progress: 0–1 representing remaining fraction
  const hasWeight = spool.initialWeight != null && spool.initialWeight > 0
  const remainingWeight = hasWeight
    ? Math.max(0, (spool.initialWeight ?? 0) - (spool.usedWeight ?? 0))
    : null
  const progressPct = hasWeight
    ? Math.round((remainingWeight! / spool.initialWeight!) * 100)
    : null

  return (
    <div
      className={`relative flex rounded-lg overflow-hidden border transition-colors cursor-pointer
        ${selected
          ? "ring-2 ring-[#EE4D2D] dark:ring-indigo-400 border-[#EE4D2D] dark:border-indigo-400"
          : isLow
            ? "border-orange-300 dark:border-orange-700"
            : "border-gray-200 dark:border-slate-700"
        }
        bg-white dark:bg-slate-800`}
      onClick={() => onTap?.(spool)}
    >
      {/* Selection checkbox */}
      {onSelect && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(spool) }}
          className={`absolute top-1.5 left-1.5 z-10 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            selected
              ? "bg-[#EE4D2D] dark:bg-indigo-500 border-[#EE4D2D] dark:border-indigo-500"
              : "bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-500 hover:border-[#EE4D2D] dark:hover:border-indigo-400"
          }`}
          aria-label={selected ? "Deselect" : "Select"}
        >
          {selected && <span className="text-white text-[9px] leading-none">✓</span>}
        </button>
      )}

      {/* Left color strip */}
      <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: spool.colorHex }} />

      {/* Content */}
      <div className="flex-1 px-2.5 py-2 min-w-0">
        {/* Top row: name + action icons */}
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-800 dark:text-slate-100 truncate leading-tight">
              {spool.colorName}
            </div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500 truncate">
              {spool.brand} · {spool.material}
            </div>
          </div>
          {/* Icon actions — stop propagation so they don't trigger onTap */}
          <div className="flex gap-1 flex-shrink-0 mt-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onPrint(spool) }}
              className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-[11px]"
              title="Print stiker"
            >
              🏷
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(spool) }}
              className="w-6 h-6 flex items-center justify-center rounded bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-[11px]"
              title="Edit spool"
            >
              ✏️
            </button>
          </div>
        </div>

        {/* Weight progress bar */}
        {hasWeight && progressPct !== null ? (
          <div className="mt-1.5 mb-1">
            <div className="h-1 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progressPct}%`, backgroundColor: statusColor }}
              />
            </div>
            <div className="flex justify-between items-center mt-0.5">
              <span className="text-[9px] text-gray-400 dark:text-slate-500">{remainingWeight}g sisa</span>
              <span
                className="text-[9px] font-semibold px-1 py-0.5 rounded"
                style={{
                  backgroundColor: statusColor + "22",
                  color: statusColor,
                }}
              >
                {statusLabel}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex justify-end">
            <span
              className="text-[9px] font-semibold px-1 py-0.5 rounded"
              style={{
                backgroundColor: statusColor + "22",
                color: statusColor,
              }}
            >
              {statusLabel}
            </span>
          </div>
        )}

        {/* NFC indicator */}
        {spool.nfcTagId && (
          <div className="text-[9px] text-gray-400 dark:text-slate-500 mt-0.5">📡 NFC</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add components/filamen/SpoolCard.tsx
git commit -m "feat: redesign SpoolCard — compact layout, color strip, weight progress bar"
```

---

## Task 5: SpoolActionSheet + SpoolTab integration

**Files:**
- Create: `components/filamen/SpoolActionSheet.tsx`
- Modify: `components/filamen/SpoolTab.tsx`

- [ ] **Step 1: Create SpoolActionSheet**

Create `components/filamen/SpoolActionSheet.tsx`:

```tsx
"use client"

import type { SpoolData } from "@/lib/filamen/types"

interface SpoolActionSheetProps {
  spool: SpoolData
  onEdit: (spool: SpoolData) => void
  onPrint: (spool: SpoolData) => void
  onScanNfc: () => void  // opens scan modal; user scans tag → NfcLinkModal handles the link
  onClose: () => void
}

export function SpoolActionSheet({ spool, onEdit, onPrint, onScanNfc, onClose }: SpoolActionSheetProps) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-800 rounded-t-2xl shadow-2xl pb-safe">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
          <div
            className="w-8 h-8 rounded-full border-2 border-gray-200 dark:border-slate-600 flex-shrink-0"
            style={{ backgroundColor: spool.colorHex }}
          />
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-slate-100">
              {spool.brand} {spool.colorName}
            </div>
            <div className="text-xs text-gray-400 dark:text-slate-500">{spool.material}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 space-y-2">
          <button
            onClick={() => { onEdit(spool); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 text-left transition-colors"
          >
            <span className="text-lg">✏️</span>
            <span className="text-sm font-medium text-gray-800 dark:text-slate-100">Edit info spool</span>
          </button>
          <button
            onClick={() => { onPrint(spool); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 text-left transition-colors"
          >
            <span className="text-lg">🏷</span>
            <span className="text-sm font-medium text-gray-800 dark:text-slate-100">Print stiker barcode</span>
          </button>
          <button
            onClick={() => { onScanNfc(); onClose() }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 text-left transition-colors"
          >
            <span className="text-lg">📡</span>
            <span className="text-sm font-medium text-gray-800 dark:text-slate-100">Link NFC tag</span>
          </button>
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center px-4 py-3 rounded-xl text-sm text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Update SpoolTab to wire SpoolActionSheet**

Edit `components/filamen/SpoolTab.tsx` — add `actionSheetSpool` state, import SpoolActionSheet, update SpoolCard props, add dark: classes to toolbar, render SpoolActionSheet:

```tsx
"use client"

import { useState, useMemo } from "react"
import { useSpools } from "@/lib/hooks/use-filamen"
import { SpoolKpiBar } from "./SpoolKpiBar"
import { SpoolCard } from "./SpoolCard"
import { SpoolForm } from "./SpoolForm"
import { SpoolAddPicker } from "./SpoolAddPicker"
import { ScanModal } from "./ScanModal"
import { NfcLinkModal } from "./NfcLinkModal"
import { SpoolActionSheet } from "./SpoolActionSheet"
import type { SpoolData, SpoolStatus } from "@/lib/filamen/types"
import { PrintModal } from "./PrintModal"
import { BatchPrintModal } from "./BatchPrintModal"

export function SpoolTab() {
  const { data, isLoading, isError } = useSpools()
  const [statusFilter, setStatusFilter] = useState<SpoolStatus | "all">("all")
  const [search, setSearch] = useState("")
  const [editingSpool, setEditingSpool] = useState<SpoolData | null>(null)
  const [printingSpool, setPrintingSpool] = useState<SpoolData | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [prefillNfc, setPrefillNfc] = useState<string | undefined>()
  const [showScanModal, setShowScanModal] = useState(false)
  const [nfcLinkTagId, setNfcLinkTagId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchPrint, setShowBatchPrint] = useState(false)
  const [actionSheetSpool, setActionSheetSpool] = useState<SpoolData | null>(null)

  function toggleSelect(spool: SpoolData) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(spool.id)) next.delete(spool.id)
      else next.add(spool.id)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!data) return []
    return data.spools.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false
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

  if (isLoading) return <div className="text-gray-400 dark:text-slate-500 py-8 text-center">Memuat spool...</div>
  if (isError) return <div className="text-red-500 py-8 text-center">Gagal memuat data spool.</div>
  if (!data) return null

  return (
    <div className="space-y-4">
      <SpoolKpiBar kpi={data.kpi} />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-[#EE4D2D] dark:bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-[#d44226] dark:hover:bg-indigo-700"
        >
          + Spool Baru
        </button>
        <button
          onClick={() => setShowScanModal(true)}
          className="border border-gray-300 dark:border-slate-600 text-sm px-3 py-1.5 rounded-md text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
        >
          📷 Scan / 📡 NFC
        </button>
        {selectedIds.size > 0 ? (
          <>
            <button
              onClick={() => setShowBatchPrint(true)}
              className="bg-[#EE4D2D] dark:bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-md hover:bg-[#d44226] dark:hover:bg-indigo-700"
            >
              🏷 Print {selectedIds.size} Stiker
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="border border-gray-300 dark:border-slate-600 text-sm px-3 py-1.5 rounded-md text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Batal pilih
            </button>
          </>
        ) : null}
        <div className="flex-1" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SpoolStatus | "all")}
          className="border border-gray-300 dark:border-slate-600 text-sm px-2 py-1.5 rounded-md text-gray-600 dark:text-slate-300 bg-white dark:bg-slate-800"
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
          className="border border-gray-300 dark:border-slate-600 text-sm px-2 py-1.5 rounded-md w-40 bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500"
        />
      </div>

      {/* Grouped grid */}
      {Array.from(grouped.entries()).map(([key, spools]) => {
        const { brand, colorName, material } = spools[0]
        const hasLow = spools.some((s) => s.status === "low" || s.status === "empty")
        return (
          <div key={key}>
            <div className={`text-xs uppercase tracking-widest mb-2 ${hasLow ? "text-orange-500" : "text-gray-400 dark:text-slate-500"}`}>
              {brand} {colorName} · {material}
              {hasLow && " ⚠️"}
              <span className="ml-2 text-gray-400 dark:text-slate-600">{spools.length} spool</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {spools.map((s) => (
                <SpoolCard
                  key={s.id}
                  spool={s}
                  onEdit={setEditingSpool}
                  onPrint={setPrintingSpool}
                  onTap={setActionSheetSpool}
                  selected={selectedIds.has(s.id)}
                  onSelect={toggleSelect}
                />
              ))}
            </div>
          </div>
        )
      })}

      {filtered.length === 0 && (
        <div className="text-gray-400 dark:text-slate-500 py-8 text-center">Tidak ada spool ditemukan.</div>
      )}

      {/* SpoolActionSheet — tap on card */}
      {actionSheetSpool && (
        <SpoolActionSheet
          spool={actionSheetSpool}
          onEdit={setEditingSpool}
          onPrint={setPrintingSpool}
          onScanNfc={() => setShowScanModal(true)}
          onClose={() => setActionSheetSpool(null)}
        />
      )}

      {showScanModal && (
        <ScanModal
          onFound={(spool) => { setShowScanModal(false); setEditingSpool(spool) }}
          onNotFound={(rawValue, type) => {
            setShowScanModal(false)
            if (type === "nfc") {
              setNfcLinkTagId(rawValue)
            } else {
              setPrefillNfc(undefined)
              setShowAddForm(true)
            }
          }}
          onClose={() => setShowScanModal(false)}
        />
      )}

      {nfcLinkTagId && (
        <NfcLinkModal
          nfcTagId={nfcLinkTagId}
          onLinked={(spool) => { setNfcLinkTagId(null); setEditingSpool(spool) }}
          onAddNew={() => {
            setPrefillNfc(nfcLinkTagId ?? undefined)
            setNfcLinkTagId(null)
            setShowAddForm(true)
          }}
          onClose={() => setNfcLinkTagId(null)}
        />
      )}

      {showAddForm && !editingSpool && (
        <SpoolAddPicker
          prefillNfcTagId={prefillNfc}
          onClose={() => { setShowAddForm(false); setPrefillNfc(undefined) }}
        />
      )}

      {editingSpool && (
        <SpoolForm
          spool={editingSpool}
          onClose={() => setEditingSpool(null)}
        />
      )}
      {printingSpool && (
        <PrintModal
          spool={printingSpool}
          onClose={() => setPrintingSpool(null)}
        />
      )}
      {showBatchPrint && data && (
        <BatchPrintModal
          spools={data.spools.filter((s) => selectedIds.has(s.id))}
          onClose={() => { setShowBatchPrint(false); setSelectedIds(new Set()) }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add components/filamen/SpoolActionSheet.tsx components/filamen/SpoolTab.tsx
git commit -m "feat: add SpoolActionSheet bottom sheet, wire tap-to-actions in SpoolTab"
```

---

## Task 6: Dark mode — Filament components

**Files:**
- Modify: `components/filamen/SpoolKpiBar.tsx`
- Modify: `components/filamen/AmsTab.tsx`
- Modify: `components/filamen/AmsVariantRow.tsx`
- Modify: `components/filamen/PrinterTab.tsx`
- Modify: `components/filamen/ScanModal.tsx`

- [ ] **Step 1: Update SpoolKpiBar**

Replace `components/filamen/SpoolKpiBar.tsx`:

```tsx
import type { SpoolsResponse } from "@/lib/filamen/types"
import { SPOOL_STATUS_LABELS, SPOOL_STATUS_COLORS } from "@/lib/filamen/types"

export function SpoolKpiBar({ kpi }: { kpi: SpoolsResponse["kpi"] }) {
  const items = [
    { key: "total", label: "Total Spool", value: kpi.total, color: "#94a3b8" },
    { key: "new", label: SPOOL_STATUS_LABELS.new, value: kpi.byStatus.new, color: SPOOL_STATUS_COLORS.new },
    { key: "full", label: SPOOL_STATUS_LABELS.full, value: kpi.byStatus.full, color: SPOOL_STATUS_COLORS.full },
    { key: "mid", label: SPOOL_STATUS_LABELS.mid, value: kpi.byStatus.mid, color: SPOOL_STATUS_COLORS.mid },
    { key: "low", label: SPOOL_STATUS_LABELS.low, value: kpi.byStatus.low, color: SPOOL_STATUS_COLORS.low },
    { key: "empty", label: SPOOL_STATUS_LABELS.empty, value: kpi.byStatus.empty, color: SPOOL_STATUS_COLORS.empty },
  ]

  return (
    <div className="grid grid-cols-6 gap-px bg-gray-200 dark:bg-slate-700 rounded-lg overflow-hidden">
      {items.map((item) => (
        <div key={item.key} className="bg-white dark:bg-slate-800 px-3 py-3 text-center">
          <div className="text-xl font-bold" style={{ color: item.color }}>
            {item.value}
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Update AmsTab**

In `components/filamen/AmsTab.tsx`, update the className strings:

- `text-gray-400 py-8 text-center` → `text-gray-400 dark:text-slate-500 py-8 text-center`
- inactive section button: `bg-white text-gray-600 border-gray-300 hover:bg-gray-50` → `bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700`
- sync button: `border border-gray-300 px-3 py-1.5 rounded-md text-gray-600 hover:bg-gray-50` → `border border-gray-300 dark:border-slate-600 px-3 py-1.5 rounded-md text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700`

Full replacement of `components/filamen/AmsTab.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useAms } from "@/lib/hooks/use-filamen"
import { useQueryClient } from "@tanstack/react-query"
import { AmsVariantRow } from "./AmsVariantRow"
import type { ProductType } from "@/lib/filamen/types"

export function AmsTab() {
  const { data, isLoading, isError } = useAms()
  const qc = useQueryClient()
  const [section, setSection] = useState<ProductType>("swoosh")
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/filamen/ams/sync', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Gagal sync')
      setSyncMsg(`✓ Sync selesai — ${json.upserted} slot diperbarui`)
      await qc.invalidateQueries({ queryKey: ['ams'] })
    } catch (e) {
      setSyncMsg(`✗ ${e instanceof Error ? e.message : 'Error'}`)
    } finally {
      setSyncing(false)
    }
  }

  if (isLoading) return <div className="text-gray-400 dark:text-slate-500 py-8 text-center">Memuat data AMS...</div>
  if (isError) return <div className="text-red-500 py-8 text-center">Gagal memuat data AMS.</div>
  if (!data) return null

  const variants = section === "swoosh" ? data.swoosh : data.clickers
  const lowCount = variants.filter((v) => v.hasLowSpool).length

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        {(["swoosh", "clickers"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              section === s
                ? "bg-[#EE4D2D] dark:bg-indigo-600 text-white border-[#EE4D2D] dark:border-indigo-600"
                : "bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
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
        <div className="flex-1" />
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-xs border border-gray-300 dark:border-slate-600 px-3 py-1.5 rounded-md text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : '↻ Sync Sheet'}
        </button>
      </div>
      {syncMsg && (
        <p className={`text-xs px-1 ${syncMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
          {syncMsg}
        </p>
      )}
      <div>
        {variants.map((variant) => (
          <AmsVariantRow key={variant.variantName} variant={variant} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update AmsVariantRow — add dark: classes**

In `components/filamen/AmsVariantRow.tsx`, apply these substitutions:

- Outer div border: `border-gray-200` → `border-gray-200 dark:border-slate-700`
- Header button bg: `bg-white hover:bg-gray-50` → `bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700`
- Arrow + text: `text-gray-400` → `text-gray-400 dark:text-slate-500`; `text-gray-800` → `text-gray-800 dark:text-slate-100`
- Expanded section: `border-t border-gray-100 bg-gray-50` → `border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900`
- Slot card: `p-3 rounded-lg border bg-white` → `p-3 rounded-lg border bg-white dark:bg-slate-800`; `border-gray-200` → `border-gray-200 dark:border-slate-700`
- Slot header text: `text-gray-400` → `text-gray-400 dark:text-slate-500`
- Assign button: `text-gray-400 hover:text-[#EE4D2D]` → `text-gray-400 dark:text-slate-500 hover:text-[#EE4D2D] dark:hover:text-indigo-400`

Also update the spool assignment modal overlay inside AmsVariantRow (find `fixed inset-0 z-50 bg-black/50` — keep as-is, overlay is fine) and the modal panel:
- `bg-white` → `bg-white dark:bg-slate-800`
- `border-gray-200` → `border-gray-200 dark:border-slate-700`
- `text-gray-*` → corresponding `dark:text-slate-*`
- `hover:bg-gray-*` → `dark:hover:bg-slate-*`

Read the full file and apply all the above substitutions. The pattern is systematic: every `bg-white` gets `dark:bg-slate-800`, every `bg-gray-50` gets `dark:bg-slate-900`, every `bg-gray-100` gets `dark:bg-slate-700`, every `text-gray-400/500` gets `dark:text-slate-500`, every `text-gray-700/800` gets `dark:text-slate-100/200`, every `border-gray-*` gets `dark:border-slate-700`.

- [ ] **Step 4: Update PrinterTab — add dark: classes**

In `components/filamen/PrinterTab.tsx`, apply the same systematic substitution:

- `bg-gray-50` → add `dark:bg-slate-900`
- `bg-white` → add `dark:bg-slate-800`
- `bg-gray-100` → add `dark:bg-slate-700`
- `text-gray-500/600/700/800` → add `dark:text-slate-300/400`
- `border-gray-100/200/300` → add `dark:border-slate-700/600`
- `hover:bg-gray-50/100` → add `dark:hover:bg-slate-700`
- `bg-green-50` → add `dark:bg-green-950/30`
- `text-green-600` → add `dark:text-green-400`
- `border-green-300` → add `dark:border-green-700`
- `bg-[#EE4D2D]` → add `dark:bg-indigo-600`
- `hover:bg-[#d44226]` → add `dark:hover:bg-indigo-700`
- inputs: add `dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600`

- [ ] **Step 5: Update ScanModal — add dark: classes to modal overlay and content**

Read `components/filamen/ScanModal.tsx` in full and add `dark:` classes to:
- Modal overlay: `fixed inset-0 bg-black/50` — keep (already dark)
- Modal panel `bg-white` → add `dark:bg-slate-800`
- `text-gray-*` → add `dark:text-slate-*`
- `border-gray-*` → add `dark:border-slate-*`
- `bg-gray-*` → add `dark:bg-slate-*`

- [ ] **Step 6: Update NfcLinkModal — add dark: classes**

In `components/filamen/NfcLinkModal.tsx`, apply:

```tsx
// Modal panel: bg-white → bg-white dark:bg-slate-800
// border-b → border-b dark:border-slate-700
// h2: text-gray-800 → text-gray-800 dark:text-slate-100
// nfcTagId p: text-gray-400 → text-gray-400 dark:text-slate-500
// close button: text-gray-400 hover:text-gray-600 → text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300
// search input: border-gray-300 → border-gray-300 dark:border-slate-600
//              add: bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-100
// empty state p: text-gray-400 → text-gray-400 dark:text-slate-500
// spool list button hover: hover:bg-gray-50 → hover:bg-gray-50 dark:hover:bg-slate-700
// spool name: text-gray-800 → text-gray-800 dark:text-slate-100
// spool meta: text-gray-400 → text-gray-400 dark:text-slate-500
```

- [ ] **Step 7: Update BatchPrintModal and remaining filament modals**

For `components/filamen/BatchPrintModal.tsx` and `components/filamen/SpoolForm.tsx` and `components/filamen/SpoolAddPicker.tsx`, apply the same systematic dark: class additions:
- Every `bg-white` → add `dark:bg-slate-800`
- Every `bg-gray-50/100` → add `dark:bg-slate-900/700`
- Every `text-gray-*` → add `dark:text-slate-*` (800→100, 600→300, 400→500)
- Every `border-gray-*` → add `dark:border-slate-700/600`
- Every `hover:bg-gray-*` → add `dark:hover:bg-slate-*`
- Every `bg-[#EE4D2D]` / `hover:bg-[#d44226]` → add `dark:bg-indigo-600 dark:hover:bg-indigo-700`
- Modal overlays `bg-black/50` — already dark-friendly, no change needed

- [ ] **Step 8: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add components/filamen/SpoolKpiBar.tsx components/filamen/AmsTab.tsx components/filamen/AmsVariantRow.tsx components/filamen/PrinterTab.tsx components/filamen/ScanModal.tsx components/filamen/NfcLinkModal.tsx components/filamen/BatchPrintModal.tsx components/filamen/SpoolForm.tsx components/filamen/SpoolAddPicker.tsx
git commit -m "feat: dark mode for all filament components"
```

---

## Task 7: Deploy

- [ ] **Step 1: Final build check**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npm run build 2>&1 | tail -30
```

Expected: Build successful, no errors.

- [ ] **Step 2: Build Docker image**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker build -t shopee-dashboard:latest . 2>&1 | tail -10
```

- [ ] **Step 3: Redeploy container**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker stop shopee-dashboard && \
DOCKER_HOST=tcp://192.168.88.113:2375 docker rm shopee-dashboard && \
DOCKER_HOST=tcp://192.168.88.113:2375 docker run -d \
  --name shopee-dashboard \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /opt/stacks/shopee-dashboard/data:/app/data \
  -e NEXTAUTH_SECRET="lQAh6t2fMZrjj9NT+dIPHa4o+kg6Ks9dzKg22oKWTEffuf56kqPhFUe9ajV2kOpV" \
  -e SHOPEE_MOCK_ADS=true \
  -e SHOPEE_MOCK_ANALYTICS=true \
  -e SHOPEE_BASE_URL=https://openplatform.sandbox.test-stable.shopee.sg \
  -e AUTH_TRUST_HOST=true \
  -e INTERNAL_NOTIFICATION_SECRET=iuhaskghajkshh23894jhsdfla \
  -e NEXTAUTH_URL=https://dashboard.3dprintingbandung.my.id \
  -e DATABASE_URL="file:./data/prod.db" \
  -e SHOPEE_PARTNER_ID=1231475 \
  -e SHOPEE_PARTNER_KEY=shpk6344726e51586e56436e52474a4d4464574b74546f5276515350554d636d \
  -e SHOPEE_SHOP_ID=227232616 \
  shopee-dashboard:latest
```

- [ ] **Step 4: Verify container is up**

```bash
sleep 6 && DOCKER_HOST=tcp://192.168.88.113:2375 docker logs shopee-dashboard --tail 10
```

Expected: `✓ Ready in 0ms`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete dark theme + UI polish — full site"
```
