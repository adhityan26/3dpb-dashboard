# Glass UI Theme — Design Spec

**Date:** 2026-05-12
**Status:** Approved

---

## Goal

Full-site visual redesign menggunakan Deep Space glassmorphism untuk dark mode dan Apple Liquid Glass untuk light mode. Tema di-apply ke seluruh halaman: navbar, cards, table, modals, login page, dan filamen section.

---

## Color Palette

### Dark Mode — Deep Space
```
Background:  linear-gradient(135deg, #080818 → #0c0c26 → #080820)
Accent:      #6366f1 (Indigo)
Accent soft: #818cf8, #a5b4fc
Text:        #ffffff → rgba(255,255,255,0.32) (inactive)
```

### Light Mode — Liquid Glass
```
Background:  radial gradients pink/lavender/blue/mint overlay
             + linear-gradient(135deg, #f8f4ff → #f0f4ff → #fef9ff)
Accent:      #6366f1 (same indigo, adapts to light context)
Text:        #1a1a2e → rgba(30,27,75,0.38) (inactive)
```

---

## Ambient Orbs (Dark Mode)

3 orbs bergerak random via JS `requestAnimationFrame`:

| Orb | Size | Opacity | Speed |
|---|---|---|---|
| orb1 | 700px | 0.13 | 25px/s |
| orb2 | 500px | 0.10 | 30px/s |
| orb3 | 220px | 0.12 | 40px/s |

**Warna cycling:** Indigo → Purple → Green → Blue → Violet → kembali (smooth lerp 3s)

Bounce off screen edges. Implementasi: `position: fixed`, `will-change: transform`, `transition: background 3s ease`.

---

## Glass Effect Levels

### Medium Glass (dipakai di semua komponen)
```css
background: rgba(255,255,255,0.05);        /* dark */
background: rgba(255,255,255,0.38);        /* light */
backdrop-filter: blur(12px) saturate(1.8);
border: 1px solid rgba(99,102,241,0.10);   /* dark */
border: 1px solid rgba(200,190,255,0.30);  /* light */
box-shadow: 0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
```

### Liquid Glass Cards (Light Mode only)
```css
background: rgba(255,255,255,0.38);
backdrop-filter: blur(20px) saturate(2) brightness(1.02);
/* Iridescent border via ::before conic-gradient mask */
/* Specular highlight via ::after radial-gradient top-left corner */
```

---

## Navigation — Desktop (Floating Island)

**Structure:** `Logo | [floating island nav] | [control island]`

### Floating Island
```css
background: rgba(16,16,52,0.85);           /* dark */
background: rgba(255,255,255,0.40);        /* light */
backdrop-filter: blur(24px) saturate(2);
border-radius: 48px;
padding: 8px 10px;
border: 1px solid rgba(99,102,241,0.22);
box-shadow: 0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08);
```

Light mode tambahan: iridescent conic-gradient border via `::before` + `::after` shimmer overlay.

### Tab item
- Width: `72px`, flex column (icon top, label bottom)
- Icon: `18px`, scale `1.15` when active
- Label: `10px`, `font-weight: 600`
- Active: `color: #fff` (dark) / `color: rgba(30,27,75,0.9)` (light)
- Inactive: `color: rgba(255,255,255,0.32)` (dark) / `rgba(30,27,75,0.38)` (light)

### Active Blob (Liquid Indicator)
```css
height: 44px;
border-radius: 32px;   /* match island 48px - padding 8px ≈ 40px, less for gooey */
background: linear-gradient(135deg, #5055e8, #818cf8);   /* dark */
background: linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.28)); /* light */
/* Dark: box-shadow glow indigo */
/* Light: border 1px rgba(120,100,255,0.3) + softer shadow */
```

**Animation:** CSS `filter: url(#goo)` — SVG gooey filter:
```xml
<filter id="goo">
  <feGaussianBlur stdDeviation="8"/>
  <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -12"/>
  <feComposite operator="atop"/>
</filter>
```

Transition: `left 0.5s cubic-bezier(0.34,1.3,0.64,1), width 0.5s cubic-bezier(0.34,1.3,0.64,1)`

**Implementasi:** Framer Motion `layoutId` di production untuk physics-based spring.

---

## Navigation — Mobile (Bottom Nav)

**Breakpoint:** `< 768px`

### Top header (mobile)
```
🛍️ Shopee | [controls: theme toggle + avatar + logout]
```

### Bottom bar
```css
position: fixed; bottom: 0;
background: rgba(10,10,32,0.92);
backdrop-filter: blur(24px);
border-top: 1px solid rgba(99,102,241,0.18);
height: 68px;
```

- Max 4 tab items + "⋯ More" button
- Active indicator: indigo line di atas tab + glass pill background
- **More button** → bottom sheet naik dengan glass background, grid 3 kolom untuk menu tambahan
- Liquid blob animation sama persis dengan desktop (gooey filter)

---

## Control Island (Right Side of Navbar)

```css
background: rgba(16,16,52,0.88);   /* dark */
background: rgba(255,255,255,0.40); /* light */
backdrop-filter: blur(24px);
border-radius: 28px;
padding: 5px 6px;
```

**Contents:** `[Theme Toggle] | [divider] | [Avatar] | [divider] | [Logout]`

### Theme Toggle — 3-State Slider
Shape: pill container `80×32px`, sliding ball `24×24px` ball

| State | Ball content | Background |
|---|---|---|
| Light | CSS sun (circle + 8 rays, no face) | Sky blue gradient |
| System | CSS laptop (screen + base) | Deep space gradient + stars |
| Dark | CSS gray full moon (circle + craters) | Near-black + stars |

Ball transition: `left 0.4s cubic-bezier(0.34,1.4,0.64,1)`

Sun: pure CSS, kuning tanpa emoji, 8 rays via `box-shadow` radial points
Moon: full circle `#a1a1aa`, abu-abu, dengan 2 crater via `::before`/`::after`

### Avatar
- 32×32px, `border-radius: 50%`
- Gradient ring: `background: linear-gradient(135deg, #6366f1, #818cf8, #a78bfa)`
- Inner: `background: linear-gradient(135deg, #4f46e5, #7c3aed)`
- `box-shadow: 0 0 12px rgba(99,102,241,0.5)`

### Logout Button
- 32×32px, `border-radius: 50%`
- Default: `color: rgba(255,255,255,0.3)`, subtle border
- Hover: merah `rgba(239,68,68,0.1)` background + `rgba(239,68,68,0.2)` border

---

## KPI Cards

```css
border-radius: 16-18px;
background: rgba(255,255,255,0.05);   /* dark */
background: rgba(255,255,255,0.38);   /* light */
backdrop-filter: blur(12px);
border: 1px solid rgba(99,102,241,0.10);
box-shadow: 0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
```

Accent bar: `28×2px`, gradient indigo → violet, glow `box-shadow`.

Light mode: hover → slight `translateY(-2px)` + iridescent border animates.

---

## Table / List

```css
border-radius: 16px;
background: rgba(255,255,255,0.03);  /* dark */
background: rgba(255,255,255,0.35);  /* light */
backdrop-filter: blur(12px);
border: 1px solid rgba(99,102,241,0.08);
```

Row hover: `background: rgba(99,102,241,0.05)` (dark) / `rgba(255,255,255,0.4)` (light)

Status dots dengan glow:
- Green: `#10b981` + `box-shadow: 0 0 6px rgba(16,185,129,0.5)`
- Amber: `#f59e0b`
- Indigo: `#6366f1` + glow

---

## Page Title Typography

```css
/* Dark */
background: linear-gradient(135deg, #ffffff 0%, #a5b4fc 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;

/* Light */
background: linear-gradient(135deg, #1a1a2e 0%, #6366f1 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

---

## Login Page

Glass card centered:
```css
background: rgba(255,255,255,0.05);  /* dark */
backdrop-filter: blur(20px);
border: 1px solid rgba(99,102,241,0.20);
border-radius: 14px;
box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08);
```

SSO button: indigo gradient (`#6366f1 → #818cf8`) + glow shadow
Credentials fallback: outline glass button

---

## Page Transition (Tab Switch)

Client-side navigation — tidak ada full reload.

Content area: `animation: fadeSlide 0.3s ease` on mount
```css
@keyframes fadeSlide {
  from { opacity:0; transform: translateY(8px); }
  to   { opacity:1; transform: translateY(0); }
}
```

---

## Technology

- **Tailwind v4** — `dark:` utilities, `@custom-variant dark (&:is(.dark *))`
- **Framer Motion** — `layoutId` untuk liquid blob animation, `AnimatePresence` untuk page transitions
- **next-themes** — sudah terpasang, `attribute="class"`, `defaultTheme="system"`
- **CSS custom properties** — token warna per komponen

---

## Scope

Semua halaman: Order, Iklan, Analisa, Produk, Filamen (SpoolCard, AmsTab, dll), Settings, Login

Login page: redesign ke glass card, auto-redirect jika sudah login.

---

## Out of Scope

- Custom Tailwind theme config (pakai inline atau CSS vars)
- Animation untuk mobile swipe gesture
- GSAP / Three.js effects
