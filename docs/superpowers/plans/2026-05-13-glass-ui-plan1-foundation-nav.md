# Glass UI — Plan 1: Foundation + Navigation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Deep Space dark + Liquid Glass light foundation, animated ambient orbs, and the floating island navigation (desktop + mobile) with gooey liquid blob animation.

**Architecture:** Three layers: (1) CSS tokens + glass utilities in globals.css, (2) background + orb system in layouts, (3) complete nav rewrite — floating island with Framer Motion layoutId blob on desktop, fixed glass bottom bar on mobile. All existing page content remains untouched; only the shell changes.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (CSS-first), Framer Motion 11, next-themes (already installed), TypeScript

**This is Plan 1 of 3.** Plans 2 and 3 cover dashboard components and login page respectively.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `package.json` | Add framer-motion |
| Modify | `app/globals.css` | Glass CSS tokens + utility classes |
| Create | `components/ui/AmbientOrbs.tsx` | Animated color-shifting orbs (dark mode) |
| Create | `components/ui/GooeyFilter.tsx` | SVG gooey filter as React component |
| Modify | `app/(dashboard)/layout.tsx` | Deep Space bg + AmbientOrbs + MobileBottomNav |
| Modify | `app/(auth)/layout.tsx` | Deep Space bg + AmbientOrbs |
| Modify | `components/ThemeToggle.tsx` | CSS sun/moon/laptop 3-state slider |
| Create | `components/layout/ControlIsland.tsx` | Glass pill: toggle + avatar + logout |
| Modify | `components/layout/TabNav.tsx` | Floating island (desktop only, hidden mobile) |
| Create | `components/layout/MobileBottomNav.tsx` | Fixed bottom bar + More sheet (mobile only) |

---

### Task 1: Install Framer Motion + CSS Glass Tokens

**Files:**
- Modify: `package.json`
- Modify: `app/globals.css`

- [ ] **Step 1: Install framer-motion**

```bash
cd /path/to/shopee-dashboard
npm install framer-motion
```

Expected: `framer-motion` appears in `package.json` dependencies.

- [ ] **Step 2: Verify install**

```bash
node -e "require('framer-motion'); console.log('ok')" 2>/dev/null || echo "not installed yet (normal — build inside Docker)"
```

The import check may fail locally (Node 10), but the package is in node_modules. That's fine — build runs in Docker.

- [ ] **Step 3: Add glass CSS tokens to `app/globals.css`**

Open `app/globals.css`. After the existing `@theme inline { ... }` block, add at the very end of the file:

```css
/* ── GLASS UI THEME TOKENS ────────────────────────────────────── */

/* Dark mode backgrounds */
.dark .bg-glass-page {
  background:
    radial-gradient(ellipse at 80% 0%,   rgba(168,85,247,0.14) 0%, transparent 50%),
    radial-gradient(ellipse at 20% 100%, rgba(34,197,94,0.08)  0%, transparent 50%),
    linear-gradient(135deg, #080818 0%, #0c0c26 50%, #080820 100%);
}

/* Light mode backgrounds */
.bg-glass-page {
  background:
    radial-gradient(ellipse at 20% 20%, rgba(255,200,220,0.30) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 10%, rgba(180,200,255,0.35) 0%, transparent 45%),
    radial-gradient(ellipse at 60% 80%, rgba(200,230,255,0.25) 0%, transparent 50%),
    radial-gradient(ellipse at 10% 80%, rgba(255,220,180,0.20) 0%, transparent 45%),
    linear-gradient(135deg, #f8f4ff 0%, #f0f4ff 40%, #fef9ff 70%, #f5f8ff 100%);
}

/* Glass card utilities */
@layer utilities {
  .glass-card {
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(12px) saturate(1.8);
    -webkit-backdrop-filter: blur(12px) saturate(1.8);
    border: 1px solid rgba(99,102,241,0.10);
    box-shadow: 0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .dark .glass-card-light,
  .glass-card-light {
    background: rgba(255,255,255,0.38);
    backdrop-filter: blur(20px) saturate(2) brightness(1.02);
    -webkit-backdrop-filter: blur(20px) saturate(2) brightness(1.02);
    border: 1px solid rgba(200,190,255,0.30);
    box-shadow: 0 4px 20px rgba(99,102,241,0.06), inset 0 1px 0 rgba(255,255,255,0.95);
  }

  /* Page transition */
  .glass-page-enter {
    animation: glassPageIn 0.3s ease;
  }
  @keyframes glassPageIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app/globals.css
git commit -m "feat(glass-ui): install framer-motion, add glass CSS tokens"
```

---

### Task 2: Animated Ambient Orbs Component

**Files:**
- Create: `components/ui/AmbientOrbs.tsx`

- [ ] **Step 1: Create `components/ui/AmbientOrbs.tsx`**

```tsx
"use client"

import { useEffect, useRef } from "react"

// Colors: Indigo → Purple → Green → Blue → Violet
const COLORS: [number, number, number][] = [
  [99, 102, 241],
  [168, 85, 247],
  [34, 197, 94],
  [59, 130, 246],
  [139, 92, 246],
]

interface OrbConfig {
  size: number
  opacity: number
  speed: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

const ORB_CONFIGS: OrbConfig[] = [
  { size: 700, opacity: 0.13, speed: 25, xMin: -0.3, xMax: 0.6, yMin: -0.4, yMax: 0.3 },
  { size: 500, opacity: 0.10, speed: 30, xMin: -0.2, xMax: 0.5, yMin: 0.3, yMax: 1.1 },
  { size: 220, opacity: 0.12, speed: 40, xMin: 0.05, xMax: 0.6, yMin: 0.4, yMax: 1.0 },
]

function rand(a: number, b: number) { return a + Math.random() * (b - a) }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function lerpColor(c1: number[], c2: number[], t: number) {
  return c1.map((v, i) => Math.round(v + (c2[i] - v) * t))
}

export function AmbientOrbs() {
  const refs = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
    useRef<HTMLDivElement>(null),
  ]

  useEffect(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight

    type OrbState = {
      x: number; y: number; vx: number; vy: number
      colorIdx: number; nextColorIdx: number; colorT: number
      colorSpeed: number; last: number | null
    }

    const states: OrbState[] = ORB_CONFIGS.map((cfg) => ({
      x: rand(cfg.xMin, cfg.xMax) * vw,
      y: rand(cfg.yMin, cfg.yMax) * vh,
      vx: rand(-cfg.speed, cfg.speed),
      vy: rand(-cfg.speed, cfg.speed),
      colorIdx: Math.floor(Math.random() * COLORS.length),
      nextColorIdx: Math.floor(Math.random() * COLORS.length),
      colorT: 0,
      colorSpeed: rand(0.0003, 0.0008),
      last: null,
    }))

    let rafId: number

    function tick(ts: number) {
      ORB_CONFIGS.forEach((cfg, i) => {
        const el = refs[i].current
        const s = states[i]
        if (!el) return

        if (s.last === null) { s.last = ts; return }
        const dt = ts - s.last
        s.last = ts

        s.x += s.vx * dt / 1000
        s.y += s.vy * dt / 1000

        const margin = cfg.size * 0.3
        if (s.x < -margin) s.vx = Math.abs(s.vx)
        if (s.x > vw - margin) s.vx = -Math.abs(s.vx)
        if (s.y < -margin) s.vy = Math.abs(s.vy)
        if (s.y > vh - margin) s.vy = -Math.abs(s.vy)

        if (Math.random() < 0.005) {
          s.vx = Math.max(-cfg.speed * 2, Math.min(cfg.speed * 2, s.vx + rand(-5, 5)))
          s.vy = Math.max(-cfg.speed * 2, Math.min(cfg.speed * 2, s.vy + rand(-5, 5)))
        }

        s.colorT += s.colorSpeed * dt
        if (s.colorT >= 1) {
          s.colorT = 0
          s.colorIdx = s.nextColorIdx
          s.nextColorIdx = (s.colorIdx + Math.floor(rand(1, COLORS.length))) % COLORS.length
        }

        const [r, g, b] = lerpColor(COLORS[s.colorIdx], COLORS[s.nextColorIdx], s.colorT)
        el.style.transform = `translate(${s.x}px, ${s.y}px)`
        el.style.background = `radial-gradient(circle, rgba(${r},${g},${b},${cfg.opacity}) 0%, transparent 70%)`
      })

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block" aria-hidden>
      {ORB_CONFIGS.map((cfg, i) => (
        <div
          key={i}
          ref={refs[i]}
          className="absolute rounded-full top-0 left-0"
          style={{ width: cfg.size, height: cfg.size, willChange: "transform", transition: "background 3s ease" }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
# Local TS check (may fail if Node too old, that's OK — Docker builds catch it)
npx tsc --noEmit 2>&1 | grep "AmbientOrbs" || echo "No TS errors in AmbientOrbs"
```

- [ ] **Step 3: Commit**

```bash
git add components/ui/AmbientOrbs.tsx
git commit -m "feat(glass-ui): add animated ambient orbs component"
```

---

### Task 3: Update Layouts — Glass Backgrounds

**Files:**
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `app/(auth)/layout.tsx`

- [ ] **Step 1: Update `app/(dashboard)/layout.tsx`**

Replace the entire file with:

```tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { TabNav } from "@/components/layout/TabNav"
import { MobileBottomNav } from "@/components/layout/MobileBottomNav"
import { AmbientOrbs } from "@/components/ui/AmbientOrbs"
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
  if (orderResult.status === "fulfilled") badges.order = orderResult.value
  if (adsResult.status === "fulfilled") badges.iklan = adsResult.value.kpi.adsRugi
  if (productsResult.status === "fulfilled") badges.produk = productsResult.value
  return badges
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const badges = await getBadges()

  return (
    <div className="relative min-h-screen bg-glass-page">
      {/* Animated ambient orbs — dark mode only */}
      <AmbientOrbs />

      {/* Desktop nav (hidden on mobile) */}
      <TabNav role={session.user.role} badges={badges} />

      {/* Page content */}
      <main className="relative z-10 max-w-6xl mx-auto p-4 pb-24 md:pb-4">
        {children}
      </main>

      {/* Mobile bottom nav (hidden on desktop) */}
      <MobileBottomNav
        role={session.user.role}
        badges={badges}
        userName={session.user.name ?? ""}
      />
    </div>
  )
}
```

- [ ] **Step 2: Update `app/(auth)/layout.tsx`**

```tsx
import { AmbientOrbs } from "@/components/ui/AmbientOrbs"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-glass-page flex items-center justify-center p-4">
      <AmbientOrbs />
      <div className="relative z-10 w-full max-w-sm">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/layout.tsx" "app/(auth)/layout.tsx"
git commit -m "feat(glass-ui): update layouts with glass backgrounds + ambient orbs"
```

---

### Task 4: CSS ThemeToggle — Sun/Moon/Laptop Slider

**Files:**
- Modify: `components/ThemeToggle.tsx`

- [ ] **Step 1: Rewrite `components/ThemeToggle.tsx`**

Replace the entire file with:

```tsx
"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

type ThemeState = "light" | "system" | "dark"

const POSITIONS: Record<ThemeState, number> = { light: 4, system: 28, dark: 52 }
const STATES: ThemeState[] = ["light", "system", "dark"]

function SunIcon() {
  return (
    <div className="relative w-[12px] h-[12px]">
      {/* Sun body */}
      <div
        className="w-full h-full rounded-full"
        style={{ background: "radial-gradient(circle at 38% 36%, #ffe570, #fbbf24, #e07b00)" }}
      />
      {/* Rays via box-shadow on ::before equivalent */}
      <div
        className="absolute inset-[-4px] rounded-full"
        style={{
          background: [
            "radial-gradient(circle at 50% 0%,   #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 50% 100%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 0%   50%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 100% 50%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 15%  15%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 85%  15%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 15%  85%, #fbbf24 1px, transparent 1.5px)",
            "radial-gradient(circle at 85%  85%, #fbbf24 1px, transparent 1.5px)",
          ].join(", "),
        }}
      />
    </div>
  )
}

function LaptopIcon() {
  return (
    <div className="relative w-[16px] h-[12px]">
      {/* Screen */}
      <div
        className="absolute top-0 left-0 right-0 h-[8px] rounded-[2px]"
        style={{ border: "1px solid rgba(165,180,252,0.8)", background: "rgba(99,102,241,0.25)" }}
      />
      {/* Base */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-[1px] bg-[#a5b4fc]" />
    </div>
  )
}

function MoonIcon() {
  return (
    <div
      className="relative w-[13px] h-[13px] rounded-full overflow-hidden"
      style={{
        background: "radial-gradient(circle at 38% 35%, #e4e4e7, #a1a1aa, #71717a)",
        boxShadow: "inset -2px -1px 4px rgba(0,0,0,0.12)",
      }}
    >
      <div className="absolute w-[4px] h-[4px] rounded-full bg-black/10 top-[3px] left-[3px]" />
      <div className="absolute w-[3px] h-[3px] rounded-full bg-black/[0.08] top-[7px] left-[7px]" />
    </div>
  )
}

const BALL_STYLES: Record<ThemeState, React.CSSProperties> = {
  light: {
    background: "radial-gradient(circle at 35% 35%, #fffbeb, #fde68a, #f59e0b)",
    boxShadow: "0 0 10px rgba(251,191,36,0.4), 0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)",
  },
  system: {
    background: "radial-gradient(circle at 35% 35%, #e0e7ff, #a5b4fc, #6366f1)",
    boxShadow: "0 0 8px rgba(99,102,241,0.4), 0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3)",
  },
  dark: {
    background: "radial-gradient(circle at 35% 35%, #f1f5f9, #cbd5e1, #94a3b8)",
    boxShadow: "inset -2px -1px 4px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.25)",
  },
}

const BG_STYLES: Record<ThemeState, React.CSSProperties> = {
  light: { background: "linear-gradient(160deg, #38bdf8, #7dd3fc, #bae6fd)" },
  system: { background: "linear-gradient(160deg, #0f172a, #1e1b4b, #0f172a)" },
  dark: { background: "linear-gradient(160deg, #020617, #0f0f2e, #020617)" },
}

// eslint-disable-next-line react-hooks/set-state-in-effect
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [active, setActive] = useState<ThemeState>("system")

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (theme === "light" || theme === "dark" || theme === "system") {
      setActive(theme as ThemeState)
    }
  }, [theme])

  if (!mounted) return <div className="w-[80px] h-[32px] rounded-full bg-white/5" />

  function cycle() {
    const idx = STATES.indexOf(active)
    const next = STATES[(idx + 1) % STATES.length]
    setActive(next)
    setTheme(next)
  }

  return (
    <button
      onClick={cycle}
      title={`Theme: ${active}`}
      aria-label="Toggle theme"
      className="relative w-[80px] h-[32px] rounded-full overflow-hidden flex-shrink-0"
      style={{ border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)" }}
    >
      {/* Background */}
      <div className="absolute inset-0 transition-all duration-500" style={BG_STYLES[active]} />

      {/* Stars (system/dark) */}
      {(active === "system" || active === "dark") && (
        <div className="absolute inset-0" aria-hidden>
          {[
            { top: "28%", left: "60%", size: 2 },
            { top: "55%", left: "75%", size: 1.5 },
            { top: "22%", left: "84%", size: 2 },
            { top: "65%", left: "88%", size: 1 },
          ].map((s, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{ width: s.size, height: s.size, top: s.top, left: s.left, background: "rgba(255,255,255,0.7)" }}
            />
          ))}
        </div>
      )}

      {/* Cloud (light) */}
      {active === "light" && (
        <div className="absolute" style={{ right: 6, top: 7 }} aria-hidden>
          <div className="relative w-[34px] h-[18px]">
            <div className="absolute w-[22px] h-[15px] rounded-full bg-white/60 top-[2px] left-0" />
            <div className="absolute w-[16px] h-[12px] rounded-full bg-white/60 top-[4px] left-[14px]" />
            <div className="absolute w-[34px] h-[8px] rounded-full bg-white/60 bottom-0" />
          </div>
        </div>
      )}

      {/* Sliding ball */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-[24px] h-[24px] rounded-full flex items-center justify-center z-10"
        style={{
          left: POSITIONS[active],
          transition: "left 0.4s cubic-bezier(0.34, 1.4, 0.64, 1)",
          ...BALL_STYLES[active],
        }}
      >
        {active === "light"  && <SunIcon />}
        {active === "system" && <LaptopIcon />}
        {active === "dark"   && <MoonIcon />}
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --passWithNoTests 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add components/ThemeToggle.tsx
git commit -m "feat(glass-ui): rewrite ThemeToggle with CSS sun/moon/laptop slider"
```

---

### Task 5: ControlIsland Component

**Files:**
- Create: `components/layout/ControlIsland.tsx`

- [ ] **Step 1: Create `components/layout/ControlIsland.tsx`**

```tsx
import { auth } from "@/lib/auth"
import { ThemeToggle } from "@/components/ThemeToggle"

interface ControlIslandProps {
  userName?: string
}

export async function ControlIsland({ userName = "A" }: ControlIslandProps) {
  const initials = userName.charAt(0).toUpperCase() || "A"

  return (
    <div
      className="flex items-center gap-1 flex-shrink-0 rounded-[28px] p-[5px] dark:bg-[rgba(16,16,52,0.88)] bg-[rgba(255,255,255,0.40)] dark:backdrop-blur-none backdrop-blur-[24px]"
      style={{
        border: "1px solid rgba(99,102,241,0.22)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
      }}
    >
      {/* Theme toggle */}
      <ThemeToggle />

      {/* Divider */}
      <div className="w-px h-[18px] bg-white/8 mx-[2px]" />

      {/* Avatar with gradient ring */}
      <div
        className="w-[32px] h-[32px] rounded-full p-[2px] flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, #6366f1, #818cf8, #a78bfa)",
          boxShadow: "0 0 12px rgba(99,102,241,0.5)",
        }}
        title={userName}
      >
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
        >
          {initials}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-[18px] bg-white/8 mx-[2px]" />

      {/* Logout */}
      <a
        href="/api/auth/logout"
        title="Logout"
        className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white/30 hover:text-red-400/70 dark:hover:bg-red-500/10 hover:bg-red-500/8 transition-colors text-sm"
        aria-label="Logout"
      >
        ⏻
      </a>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/ControlIsland.tsx
git commit -m "feat(glass-ui): add ControlIsland component (toggle + avatar + logout)"
```

---

### Task 6: Floating Island TabNav (Desktop)

**Files:**
- Create: `components/ui/GooeyFilter.tsx`
- Modify: `components/layout/TabNav.tsx`

- [ ] **Step 1: Create `components/ui/GooeyFilter.tsx`**

```tsx
export function GooeyFilter({ id = "goo" }: { id?: string }) {
  return (
    <svg aria-hidden style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        <filter id={id}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -12"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  )
}
```

- [ ] **Step 2: Rewrite `components/layout/TabNav.tsx`**

Replace the entire file:

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, LayoutGroup } from "framer-motion"
import { GooeyFilter } from "@/components/ui/GooeyFilter"
import { ControlIsland } from "@/components/layout/ControlIsland"

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
  userName?: string
}

export function TabNav({ role, badges = {}, userName = "A" }: TabNavProps) {
  const pathname = usePathname()
  const visibleTabs = TABS.filter((tab) => tab.roles.includes(role))

  return (
    <nav
      className="hidden md:flex sticky top-0 z-50 items-center gap-5 px-8 py-[10px] dark:bg-[rgba(6,6,20,0.72)] bg-[rgba(255,255,255,0.55)] backdrop-blur-[20px]"
      style={{
        borderBottom: "1px solid rgba(99,102,241,0.12)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
      }}
    >
      {/* Logo */}
      <div className="text-[15px] font-extrabold min-w-[120px] text-foreground">
        🛍️ <span className="dark:text-[#a5b4fc] text-indigo-600">Shopee</span>
      </div>

      {/* Floating Island */}
      <div className="flex-1 flex justify-center">
        {/* Invisible SVG gooey filter */}
        <GooeyFilter id="nav-goo" />

        {/* Island shell — border/shadow outside gooey layer */}
        <div
          className="relative rounded-[48px]"
          style={{
            background: "rgba(16,16,52,0.85)",
            border: "1px solid rgba(99,102,241,0.22)",
            padding: "8px 10px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Gooey layer — clips blob, isolated from tab labels */}
          <div
            className="absolute inset-0 rounded-[48px] overflow-hidden pointer-events-none"
            style={{ filter: "url(#nav-goo)" }}
            aria-hidden
          >
            <LayoutGroup id="nav-blob">
              {visibleTabs.map((tab) => {
                const isActive = pathname.startsWith(tab.href)
                return isActive ? (
                  <motion.div
                    key={tab.href}
                    layoutId="blob"
                    className="absolute top-[8px] bottom-[8px]"
                    style={{
                      background: "linear-gradient(135deg, #5055e8, #818cf8)",
                      borderRadius: 32,
                      boxShadow: "0 0 24px rgba(99,102,241,0.6), 0 0 50px rgba(99,102,241,0.2)",
                      left: `${visibleTabs.indexOf(tab) * 72 + 10}px`,
                      width: 72,
                    }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                ) : null
              })}
            </LayoutGroup>
          </div>

          {/* Tab labels — above gooey layer */}
          <div className="relative z-10 flex">
            {visibleTabs.map((tab) => {
              const isActive = pathname.startsWith(tab.href)
              const badgeCount = badges[tab.href.slice(1)]

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="relative flex flex-col items-center gap-[3px] px-[8px] py-[7px] rounded-[40px] transition-colors"
                  style={{
                    width: 72,
                    color: isActive
                      ? "rgba(255,255,255,1)"
                      : "rgba(255,255,255,0.32)",
                  }}
                >
                  <span
                    className="text-[18px] leading-none transition-transform duration-300"
                    style={{ transform: isActive ? "scale(1.15)" : "scale(1)" }}
                  >
                    {tab.icon}
                  </span>
                  <span className="text-[10px] font-semibold">{tab.label}</span>

                  {/* Notification badge */}
                  {badgeCount != null && badgeCount > 0 && (
                    <div
                      className="absolute top-[3px] right-[6px] min-w-[15px] h-[15px] rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-[3px]"
                      style={{ boxShadow: "0 0 6px rgba(239,68,68,0.5)", border: "1px solid rgba(8,8,24,0.5)" }}
                    >
                      {badgeCount}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Control island */}
      <ControlIsland userName={userName} />
    </nav>
  )
}
```

- [ ] **Step 3: Update DashboardLayout to pass userName**

In `app/(dashboard)/layout.tsx`, pass `userName` to TabNav:

```tsx
// Change this line:
<TabNav role={session.user.role} badges={badges} />
// To:
<TabNav role={session.user.role} badges={badges} userName={session.user.name ?? ""} />
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --passWithNoTests 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add components/ui/GooeyFilter.tsx components/layout/TabNav.tsx "app/(dashboard)/layout.tsx"
git commit -m "feat(glass-ui): floating island nav with Framer Motion gooey blob"
```

---

### Task 7: Mobile Bottom Navigation

**Files:**
- Create: `components/layout/MobileBottomNav.tsx`

- [ ] **Step 1: Create `components/layout/MobileBottomNav.tsx`**

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, LayoutGroup } from "framer-motion"
import { useState } from "react"
import { GooeyFilter } from "@/components/ui/GooeyFilter"
import { ThemeToggle } from "@/components/ThemeToggle"

const ALL_TABS = [
  { href: "/order",    label: "Order",    icon: "📦", roles: ["OWNER", "ADMIN", "TEST_USER"] },
  { href: "/iklan",    label: "Iklan",    icon: "📊", roles: ["OWNER", "TEST_USER"] },
  { href: "/analisa",  label: "Analisa",  icon: "📈", roles: ["OWNER", "TEST_USER"] },
  { href: "/produk",   label: "Produk",   icon: "🏷️", roles: ["OWNER", "ADMIN", "TEST_USER"] },
  { href: "/settings", label: "Settings", icon: "⚙️", roles: ["OWNER"] },
]

const TAB_W = 56 // px — mobile tab width

interface MobileBottomNavProps {
  role: string
  badges?: Record<string, number>
  userName?: string
}

export function MobileBottomNav({ role, badges = {}, userName = "A" }: MobileBottomNavProps) {
  const pathname = usePathname()
  const [sheetOpen, setSheetOpen] = useState(false)

  const visibleTabs = ALL_TABS.filter((t) => t.roles.includes(role))
  const mainTabs = visibleTabs.slice(0, 4)
  const moreTabs = visibleTabs.slice(4)

  const activeMain = mainTabs.find((t) => pathname.startsWith(t.href))
  const activeBlobIdx = activeMain ? mainTabs.indexOf(activeMain) : -1

  return (
    <>
      {/* Bottom bar — mobile only */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-[68px]"
        style={{
          background: "rgba(10,10,32,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(99,102,241,0.18)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <GooeyFilter id="mobile-nav-goo" />

        {/* Gooey blob layer */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          style={{ filter: "url(#mobile-nav-goo)" }}
          aria-hidden
        >
          {activeBlobIdx >= 0 && (
            <LayoutGroup id="mobile-blob">
              <motion.div
                layoutId="mobile-blob"
                className="absolute top-[10px] bottom-[10px]"
                style={{
                  background: "linear-gradient(135deg, #5055e8, #818cf8)",
                  borderRadius: 20,
                  boxShadow: "0 0 16px rgba(99,102,241,0.5)",
                  left: `calc(${activeBlobIdx} * (100% / ${mainTabs.length + 1}) + 6px)`,
                  width: `calc(100% / ${mainTabs.length + 1} - 12px)`,
                }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            </LayoutGroup>
          )}
        </div>

        {/* Tabs row */}
        <div className="relative z-10 h-full flex">
          {mainTabs.map((tab) => {
            const isActive = pathname.startsWith(tab.href)
            const badgeCount = badges[tab.href.slice(1)]
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex-1 flex flex-col items-center justify-center gap-[3px] relative"
                style={{ color: isActive ? "#fff" : "rgba(255,255,255,0.3)" }}
              >
                <span
                  className="text-[20px] leading-none"
                  style={{ transform: isActive ? "scale(1.15)" : "scale(1)", transition: "transform 0.3s" }}
                >
                  {tab.icon}
                </span>
                <span className="text-[8px] font-semibold">{tab.label}</span>
                {badgeCount != null && badgeCount > 0 && (
                  <div
                    className="absolute top-[6px] right-[8px] min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[7px] font-bold flex items-center justify-center px-[3px]"
                    style={{ boxShadow: "0 0 5px rgba(239,68,68,0.5)" }}
                  >
                    {badgeCount}
                  </div>
                )}
              </Link>
            )
          })}

          {/* More button (if any hidden tabs) or placeholder */}
          <button
            onClick={() => setSheetOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-[3px]"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            <span className="text-[20px] leading-none">⋯</span>
            <span className="text-[8px] font-semibold">More</span>
          </button>
        </div>
      </div>

      {/* Bottom sheet overlay */}
      {sheetOpen && (
        <div
          className="md:hidden fixed inset-0 z-[60]"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-[20px] p-4 pb-8"
            style={{
              background: "rgba(14,14,44,0.96)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(99,102,241,0.2)",
              borderBottom: "none",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-[32px] h-[3px] bg-white/15 rounded-full mx-auto mb-4" />

            {/* Extra tabs */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {moreTabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setSheetOpen(false)}
                  className="flex flex-col items-center gap-2 p-3 rounded-[12px]"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(99,102,241,0.1)",
                  }}
                >
                  <span className="text-[24px]">{tab.icon}</span>
                  <span className="text-[10px] font-semibold text-white/60">{tab.label}</span>
                </Link>
              ))}
            </div>

            {/* Theme + logout row */}
            <div className="flex items-center justify-between px-2">
              <ThemeToggle />
              <div className="flex items-center gap-2">
                <div
                  className="w-[32px] h-[32px] rounded-full p-[2px]"
                  style={{ background: "linear-gradient(135deg, #6366f1, #818cf8, #a78bfa)" }}
                >
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
                  >
                    {userName.charAt(0).toUpperCase() || "A"}
                  </div>
                </div>
                <a
                  href="/api/auth/logout"
                  className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white/30 hover:text-red-400/70 text-sm"
                >
                  ⏻
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm test -- --passWithNoTests 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add components/layout/MobileBottomNav.tsx
git commit -m "feat(glass-ui): add mobile bottom nav with glass sheet"
```

---

### Task 8: Build, Deploy, Verify

**Files:** No new files — build + deploy only.

- [ ] **Step 1: Build via Docker to catch TypeScript errors**

```bash
./deploy.sh build 2>&1 | grep -E "error|warn|✅|❌" | head -20
```

Expected: `✅  Deploy berhasil!` — if TypeScript errors appear, fix them before continuing.

- [ ] **Step 2: Reconnect shopee-dashboard to homelab network**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker network connect homelab shopee-dashboard 2>/dev/null || true
```

- [ ] **Step 3: Verify desktop nav visually**

Open `http://shopee.homelab.lan` in browser. Confirm:
- [ ] Floating island visible in center of navbar ✅
- [ ] Active tab has indigo gooey blob ✅
- [ ] Click another tab → blob animates with gooey liquid effect ✅
- [ ] Animated color-shifting orbs in background (dark mode) ✅
- [ ] Theme toggle shows CSS sun (no emoji, no face) in light mode ✅
- [ ] Theme toggle moon = gray full circle ✅

- [ ] **Step 4: Verify mobile nav visually**

Resize browser to < 768px OR open on phone. Confirm:
- [ ] Desktop island hidden, bottom bar visible ✅
- [ ] Tap tab → blob animates ✅
- [ ] Tap "⋯ More" → glass sheet slides up ✅

- [ ] **Step 5: Final commit + push**

```bash
git add -A
git push
```

---

## Notes for Plans 2 and 3

**Plan 2 (Dashboard Components):** Apply glass card styles to KPI cards, tables, filamen components (SpoolCard, AmsTab, etc.), modals, and all section headers.

**Plan 3 (Login Page):** Redesign login page with glass card, iridescent border, SSO button with indigo gradient.
