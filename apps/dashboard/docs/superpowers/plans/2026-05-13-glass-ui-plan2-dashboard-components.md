# Glass UI — Plan 2: Dashboard Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply glass UI styling to all dashboard content components — ShadCN cards, KPI bars, table rows, custom components (SpoolCard, SpoolKpiBar), page titles, and modals.

**Architecture:** Two-pronged approach: (1) Global CSS variable overrides in `globals.css` so ALL ShadCN `[data-slot="card"]` elements automatically get glass effect without touching each file; (2) Direct className updates for custom non-ShadCN components. Page titles get gradient text. Modals get glass backdrop.

**Tech Stack:** Tailwind v4 CSS variables, Next.js App Router, TypeScript

**This is Plan 2 of 3.** Plan 1 (nav/foundation) is already deployed. Plan 3 covers login page redesign.

---

## File Map

| Action | Path | What changes |
|---|---|---|
| Modify | `app/globals.css` | CSS variable override for `--card` → semi-transparent, `backdrop-filter` on `[data-slot="card"]`, table row/input glass styles |
| Create | `components/ui/GlassPageHeader.tsx` | Reusable gradient page title component |
| Modify | `app/(dashboard)/order/page.tsx` | Use GlassPageHeader |
| Modify | `app/(dashboard)/produk/page.tsx` | Use GlassPageHeader |
| Modify | `app/(dashboard)/iklan/page.tsx` | Use GlassPageHeader |
| Modify | `app/(dashboard)/analisa/page.tsx` | Use GlassPageHeader |
| Modify | `app/(dashboard)/settings/page.tsx` | Use GlassPageHeader |
| Modify | `components/order/OrderRow.tsx` | Glass status tints instead of solid amber/green |
| Modify | `components/products/ProductRow.tsx` | Glass status tints |
| Modify | `components/filamen/SpoolCard.tsx` | Replace `bg-white dark:bg-slate-800` with glass |
| Modify | `components/filamen/SpoolKpiBar.tsx` | Replace gray grid with glass |
| Modify | `components/filamen/ScanModal.tsx` | Glass modal backdrop |
| Modify | `components/filamen/NfcLinkModal.tsx` | Glass modal backdrop |
| Modify | `components/filamen/SpoolActionSheet.tsx` | Glass bottom sheet |

---

### Task 1: Global CSS Card + Component Overrides

**Files:**
- Modify: `app/globals.css`

The key insight: ShadCN Card renders `<div data-slot="card">`. By overriding CSS variables and adding `backdrop-filter` targeting this attribute, ALL cards get glass styling automatically with zero per-component changes.

- [ ] **Step 1: Read current globals.css end** (to understand where to append)

Read the last 50 lines of `app/globals.css` to confirm the `@layer utilities` block from Plan 1 is present.

- [ ] **Step 2: Append glass component overrides to `app/globals.css`**

Add at the very end of `app/globals.css`:

```css
/* ── GLASS UI: SHADCN CARD OVERRIDES ─────────────────────────────
   Target ALL ShadCN Card elements via data-slot attribute.
   This avoids per-component changes — all cards auto-get glass.
──────────────────────────────────────────────────────────────── */

/* Dark mode glass cards */
.dark [data-slot="card"] {
  background: rgba(255, 255, 255, 0.05) !important;
  backdrop-filter: blur(12px) saturate(1.8) !important;
  -webkit-backdrop-filter: blur(12px) saturate(1.8) !important;
  border: 1px solid rgba(99, 102, 241, 0.10) !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05) !important;
  --tw-ring-color: rgba(99,102,241,0.10);
}

/* Light mode liquid glass cards */
[data-slot="card"] {
  background: rgba(255, 255, 255, 0.38) !important;
  backdrop-filter: blur(20px) saturate(2) brightness(1.02) !important;
  -webkit-backdrop-filter: blur(20px) saturate(2) brightness(1.02) !important;
  border: 1px solid rgba(200, 190, 255, 0.30) !important;
  box-shadow: 0 4px 20px rgba(99,102,241,0.06), inset 0 1px 0 rgba(255,255,255,0.95) !important;
}

/* Status tints: glass-aware amber/green for order & product rows */
.dark .row-status-printed {
  background: rgba(16, 185, 129, 0.08) !important;
  border-color: rgba(16, 185, 129, 0.15) !important;
}
.dark .row-status-pending {
  background: rgba(245, 158, 11, 0.08) !important;
  border-color: rgba(245, 158, 11, 0.15) !important;
}
.row-status-printed {
  background: rgba(16, 185, 129, 0.06) !important;
  border-color: rgba(16, 185, 129, 0.12) !important;
}
.row-status-pending {
  background: rgba(245, 158, 11, 0.06) !important;
  border-color: rgba(245, 158, 11, 0.12) !important;
}

/* Glass input fields */
.dark input[type="text"],
.dark input[type="search"],
.dark input[type="email"],
.dark input[type="number"],
.dark textarea,
.dark select {
  background: rgba(255,255,255,0.06) !important;
  border-color: rgba(99,102,241,0.15) !important;
}

/* Glass modal backdrop */
.glass-modal-backdrop {
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

/* Glass modal panel dark */
.dark .glass-modal-panel {
  background: rgba(14, 14, 44, 0.92) !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  border: 1px solid rgba(99,102,241,0.2) !important;
}
/* Glass modal panel light */
.glass-modal-panel {
  background: rgba(255,255,255,0.75) !important;
  backdrop-filter: blur(24px) saturate(2) !important;
  -webkit-backdrop-filter: blur(24px) saturate(2) !important;
  border: 1px solid rgba(200,190,255,0.4) !important;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(glass-ui): global CSS card + modal glass overrides via data-slot"
```

---

### Task 2: GlassPageHeader Component + Apply to All Pages

**Files:**
- Create: `components/ui/GlassPageHeader.tsx`
- Modify: `app/(dashboard)/order/page.tsx`
- Modify: `app/(dashboard)/produk/page.tsx`
- Modify: `app/(dashboard)/iklan/page.tsx`
- Modify: `app/(dashboard)/analisa/page.tsx`
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Create `components/ui/GlassPageHeader.tsx`**

```tsx
interface GlassPageHeaderProps {
  title: string
  subtitle?: string
  children?: React.ReactNode  // right-side actions
}

export function GlassPageHeader({ title, subtitle, children }: GlassPageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-5 gap-4">
      <div>
        <h1
          className="text-[26px] font-extrabold mb-1"
          style={{
            background: "linear-gradient(135deg, var(--glass-title-from, #fff) 0%, var(--glass-title-to, #a5b4fc) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm dark:text-white/40 text-[rgba(30,27,75,0.45)]">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
    </div>
  )
}
```

Also append to `app/globals.css` the CSS variables for the title gradient:

```css
/* Page title gradient tokens */
:root {
  --glass-title-from: #1a1a2e;
  --glass-title-to:   #6366f1;
}
.dark {
  --glass-title-from: #ffffff;
  --glass-title-to:   #a5b4fc;
}
```

- [ ] **Step 2: Add GlassPageHeader to `app/(dashboard)/order/page.tsx`**

Read the file first. Find where the page content starts (after hooks). Add import and wrap the top-level page title area. The order page doesn't have an explicit page title — add one before the `<OrderKpiBar>`:

Add import at top:
```tsx
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
```

In the return JSX, before `<OrderKpiBar>`, add:
```tsx
<GlassPageHeader title="Order" subtitle="Kelola dan cetak label pesanan Shopee" />
```

- [ ] **Step 3: Add GlassPageHeader to `app/(dashboard)/produk/page.tsx`**

Add import, then before the product list content:
```tsx
<GlassPageHeader title="Produk" subtitle="Pantau produk aktif dan HPP" />
```

- [ ] **Step 4: Add GlassPageHeader to `app/(dashboard)/iklan/page.tsx`**

Add import, then before the ads content:
```tsx
<GlassPageHeader title="Iklan" subtitle="Performa iklan Shopee hari ini" />
```

- [ ] **Step 5: Add GlassPageHeader to `app/(dashboard)/analisa/page.tsx`**

Add import, then before analytics content:
```tsx
<GlassPageHeader title="Analisa" subtitle="Laporan penjualan & tren bisnis" />
```

- [ ] **Step 6: Add GlassPageHeader to `app/(dashboard)/settings/page.tsx`**

Add import, then before the settings cards:
```tsx
<GlassPageHeader title="Settings" subtitle="Konfigurasi sistem, notifikasi, dan printer" />
```

- [ ] **Step 7: Commit**

```bash
git add components/ui/GlassPageHeader.tsx app/globals.css \
  "app/(dashboard)/order/page.tsx" \
  "app/(dashboard)/produk/page.tsx" \
  "app/(dashboard)/iklan/page.tsx" \
  "app/(dashboard)/analisa/page.tsx" \
  "app/(dashboard)/settings/page.tsx"
git commit -m "feat(glass-ui): add GlassPageHeader + gradient titles on all dashboard pages"
```

---

### Task 3: OrderRow + ProductRow Status Glass Tints

**Files:**
- Modify: `components/order/OrderRow.tsx`
- Modify: `components/products/ProductRow.tsx`

- [ ] **Step 1: Read `components/order/OrderRow.tsx`**

Find the `<Card className={...}>` call. Currently:
```tsx
<Card className={order.labelPrinted ? "bg-green-50/40 dark:bg-green-950/30" : "bg-amber-50/40 dark:bg-amber-950/30"}>
```

Replace with:
```tsx
<Card className={order.labelPrinted ? "row-status-printed" : "row-status-pending"}>
```

The CSS classes `row-status-printed` and `row-status-pending` were defined in Task 1.

- [ ] **Step 2: Also update text colors inside OrderRow**

Find inline text classes like `text-gray-700`, `text-gray-500`, `text-gray-400` in `OrderRow.tsx`. Replace with dark-aware equivalents:
- `text-gray-700` → `text-gray-700 dark:text-slate-300`
- `text-gray-500` → `text-gray-500 dark:text-slate-400`
- `text-gray-400` → `text-gray-400 dark:text-slate-500`

- [ ] **Step 3: Read `components/products/ProductRow.tsx`**

Find the `<Card className={bgClass}>` where `bgClass` is:
```tsx
const bgClass = order.status === "NORMAL"
  ? "bg-green-50/40"
  : order.needsAttention
    ? "bg-amber-50/40"
    : ""
```

Wait — read the actual file first. The pattern is similar. Update `bgClass` logic to use:
```tsx
const bgClass = product.needsAttention ? "row-status-pending" : ""
```

Adjust based on actual logic in the file.

- [ ] **Step 4: Commit**

```bash
git add components/order/OrderRow.tsx components/products/ProductRow.tsx
git commit -m "feat(glass-ui): OrderRow + ProductRow use glass status tints"
```

---

### Task 4: SpoolCard + SpoolKpiBar Glass

**Files:**
- Modify: `components/filamen/SpoolCard.tsx`
- Modify: `components/filamen/SpoolKpiBar.tsx`

- [ ] **Step 1: Read `components/filamen/SpoolCard.tsx`**

Find the outermost div with:
```tsx
className={`relative flex rounded-lg overflow-hidden border transition-colors cursor-pointer
  ${selected ? "ring-2 ring-[#EE4D2D] dark:ring-indigo-400 ..." : isLow ? "..." : "border-gray-200 dark:border-slate-700"}
  bg-white dark:bg-slate-800`}
```

Replace `bg-white dark:bg-slate-800` with glass:
```tsx
className={`relative flex rounded-lg overflow-hidden border transition-colors cursor-pointer
  ${selected
    ? "ring-2 ring-indigo-400 border-indigo-400 bg-[rgba(99,102,241,0.12)] dark:bg-[rgba(99,102,241,0.1)] backdrop-blur-[12px]"
    : isLow
      ? "border-orange-300/60 dark:border-orange-700/60 bg-[rgba(245,158,11,0.06)] dark:bg-[rgba(245,158,11,0.05)] backdrop-blur-[12px]"
      : "border-[rgba(200,190,255,0.3)] dark:border-[rgba(99,102,241,0.12)] bg-[rgba(255,255,255,0.38)] dark:bg-[rgba(255,255,255,0.05)] backdrop-blur-[12px]"
  }`}
```

- [ ] **Step 2: Read `components/filamen/SpoolKpiBar.tsx`**

Currently:
```tsx
<div className="grid grid-cols-6 gap-px bg-gray-200 dark:bg-slate-700 rounded-lg overflow-hidden">
  {items.map((item) => (
    <div key={item.key} className="bg-white dark:bg-slate-800 px-3 py-3 text-center">
```

Replace with glass:
```tsx
<div className="grid grid-cols-6 gap-[1px] rounded-xl overflow-hidden"
     style={{ background: "rgba(99,102,241,0.08)" }}>
  {items.map((item) => (
    <div
      key={item.key}
      className="px-3 py-3 text-center backdrop-blur-[12px]"
      style={{
        background: "rgba(255,255,255,0.05)",
      }}
    >
```

Also update `text-gray-500 dark:text-slate-400` → `dark:text-slate-400 text-gray-500` (already correct, just ensure it's there).

- [ ] **Step 3: Commit**

```bash
git add components/filamen/SpoolCard.tsx components/filamen/SpoolKpiBar.tsx
git commit -m "feat(glass-ui): SpoolCard + SpoolKpiBar glass styling"
```

---

### Task 5: Modal Glass Styling

**Files:**
- Modify: `components/filamen/ScanModal.tsx`
- Modify: `components/filamen/NfcLinkModal.tsx`
- Modify: `components/filamen/SpoolActionSheet.tsx`

For each modal, the pattern is:
- Backdrop overlay: replace `bg-black/50` or similar → add class `glass-modal-backdrop`
- Modal panel: add class `glass-modal-panel` alongside existing classes

- [ ] **Step 1: Read `components/filamen/ScanModal.tsx`**

Find the backdrop div (fixed inset-0 bg-black/XX) and modal panel div.

**Backdrop**: Add `glass-modal-backdrop` class, remove/reduce the inline bg-black opacity.
Replace:
```tsx
className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
```
With:
```tsx
className="fixed inset-0 glass-modal-backdrop flex items-center justify-center z-50 p-4"
```

**Panel**: Find the main panel div with `bg-white dark:bg-slate-800` (or similar). Add `glass-modal-panel` class. Remove the explicit bg classes since `glass-modal-panel` handles them.

- [ ] **Step 2: Apply same pattern to `components/filamen/NfcLinkModal.tsx`**

Same changes: backdrop → `glass-modal-backdrop`, panel → `glass-modal-panel`.

- [ ] **Step 3: Apply to `components/filamen/SpoolActionSheet.tsx`**

This is a bottom sheet. Find the backdrop and sheet panel:
- Backdrop: `glass-modal-backdrop`
- Panel: `glass-modal-panel` + keep `rounded-t-2xl` and other structural classes

- [ ] **Step 4: Commit**

```bash
git add components/filamen/ScanModal.tsx components/filamen/NfcLinkModal.tsx components/filamen/SpoolActionSheet.tsx
git commit -m "feat(glass-ui): glass modal backdrop + panel for filamen modals"
```

---

### Task 6: Build, Deploy, Verify

- [ ] **Step 1: Build via Docker**

```bash
./deploy.sh build 2>&1 | grep -E "error|✅|❌|TypeScript" | head -20
```

Expected: `✅  Deploy berhasil!`

If TypeScript errors appear (likely in ProductRow.tsx from Step 3 adjustments), fix them before continuing.

- [ ] **Step 2: Reconnect to homelab network**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker network connect homelab shopee-dashboard 2>/dev/null || true
```

- [ ] **Step 3: Verify glass cards**

Open `http://shopee.homelab.lan/order` — confirm:
- [ ] Order KPI cards have glass effect (semi-transparent, blur visible) ✅
- [ ] Order rows have glass status tints (soft amber/green glass) ✅
- [ ] Page title "Order" has gradient text ✅

- [ ] **Step 4: Verify filamen section**

Open `http://shopee.homelab.lan` → Filamen tab:
- [ ] SpoolKpiBar has glass grid cells ✅
- [ ] SpoolCards have glass effect ✅

- [ ] **Step 5: Push**

```bash
git push
```
