# Slizebiz Landing (Fase 1a-0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Situs marketing statik `www.slizebiz.com` — landing + teaser kalkulator client-side + waitlist — sebagai Next.js static export yang di-deploy ke Cloudflare Pages (waitlist → Cloudflare D1).

**Architecture:** App baru `apps/landing` (Next 16, `output: 'export'`, nol SSR) + package baru `packages/ui` (tema Glass diekstrak dari dashboard). Teaser menghitung di browser via `@3pb/kalkulator-core` + konstanta `defaultSettings`. Satu Cloudflare Pages Function (`functions/api/waitlist.ts`) menulis email waitlist ke D1. Situs terpisah total dari aplikasi ber-auth (`app.slizebiz.com`, VPS, fase lain).

**Tech Stack:** Next.js 16.2.3, React 19.2.4, Tailwind v4 (`@tailwindcss/postcss`), next-themes, TypeScript 5, vitest 1.6.1, `@3pb/kalkulator-core` (workspace), Cloudflare Pages + D1 + `wrangler`.

## Global Constraints

- Node 22 wajib: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` di setiap shell (shell default Node v10 rusak).
- Test: `pnpm --filter <pkg> exec vitest run <path>` (bypass hook RTK yang bisa menelan output). Suite penuh: `pnpm turbo test`.
- **JANGAN sentuh** `apps/dashboard`, `packages/kalkulator-core`, `apps/saas` (belum ada). Hanya buat `apps/landing` + `packages/ui`.
- `apps/landing` **WAJIB `output: 'export'`** (statik) — tanpa route server/SSR/middleware/`next-auth`. Interaktivitas hanya client component.
- Teaser **tidak menghitung ulang** — semua angka dari `hitungKalkulasiV2` (core). Konstanta `defaultSettings` = nilai seed produksi (di §Task 3, verbatim).
- Nilai default (jangan ubah): FDM hpp 300 / jual 900 / failure 12; SLA hpp 1750 / jual 3500 / failure 12; mesinPerJam 4000; margin A/B/C 1.1/1.5/2.0; resellerBulk 1.05; failureSpread 50; testLayer 5; channel offline 1.0 / shopee 1.2.
- Istilah UI: **"Biaya modal"** (bukan HPP/floor), **"Harga jual minimum"** (bukan BEP/floor). Blok lanjutan (margin A/B/C, status, per-channel) = **preview terkunci "segera hadir di app" + CTA waitlist** (landing tanpa auth).
- Domain: `www.slizebiz.com`; tombol Masuk/Buka-app → `https://app.slizebiz.com` dengan badge "segera hadir".
- Nama package: `@3pb/ui`. Nama app internal: `@3pb/landing` (folder `apps/landing`).
- Commit bahasa Indonesia, akhiri: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Spec sumber: `docs/superpowers/specs/2026-07-16-fase1a-landing-design.md` + funnel `2026-07-16-fase1a-funnel-ux-design.md` §5/§7.

---

## File Structure

```
packages/ui/
  package.json              @3pb/ui — exports ./glass.css + ./src/index.ts
  tsconfig.json
  src/index.ts              re-export primitives
  src/glass.css             tema Glass (tokens --g-* + util .g-*/.glass-input/.bg-glass-page/.glass-card) — plain CSS
  src/GlassCard.tsx
  src/GlassInput.tsx
  src/GlassButton.tsx
apps/landing/
  package.json              @3pb/landing
  next.config.ts            output:'export', transpilePackages, outputFileTracingRoot
  postcss.config.mjs
  tsconfig.json
  app/layout.tsx            html, next-themes, font Inter, metadata
  app/globals.css           @import tailwindcss + @import @3pb/ui glass.css + .bg-glass-page body
  app/page.tsx              rakit semua section
  app/privasi/page.tsx      kebijakan privasi minimal
  lib/default-settings.ts   defaultSettings (SettingsV2) + DEFAULT_MATERIAL + DEFAULT_MESIN_PER_JAM
  lib/teaser.ts             TeaserInput, buildTeaserInputV2, computeTeaser, teaserView (pure)
  lib/teaser.test.ts        parity vs hitungKalkulasiV2
  lib/content.ts            copy + konstanta harga "segera hadir" (funnel §7)
  components/Navbar.tsx  Hero.tsx  Teaser.tsx  ValueProps.tsx  TierCompare.tsx  Faq.tsx  Footer.tsx  WaitlistForm.tsx
  functions/_lib/validate.ts        validateWaitlist (pure)
  functions/_lib/validate.test.ts
  functions/api/waitlist.ts         Pages Function → D1
  functions/tsconfig.json
  wrangler.toml             binding D1
  schema.sql                DDL tabel waitlist
  README.md                 catatan deploy
```

---

### Task 1: `packages/ui` — tema Glass + primitives

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/glass.css`, `packages/ui/src/index.ts`, `packages/ui/src/GlassCard.tsx`, `packages/ui/src/GlassInput.tsx`, `packages/ui/src/GlassButton.tsx`
- Reference (port dari, JANGAN edit): `apps/dashboard/app/globals.css:165-457`

**Interfaces:**
- Produces: import `"@3pb/ui/glass.css"` (side-effect CSS); `import { GlassCard, GlassInput, GlassButton } from '@3pb/ui'`. Primitives = thin wrapper `<div>`/`<input>`/`<button>` yang menempel class Glass + meneruskan props.

- [ ] **Step 1: package.json**

```json
{
  "name": "@3pb/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./glass.css": "./src/glass.css"
  },
  "peerDependencies": { "react": "^19", "react-dom": "^19" },
  "devDependencies": { "typescript": "^5", "@types/react": "^19" }
}
```

- [ ] **Step 2: tsconfig.json** (extends root; JSX untuk primitives)

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "jsx": "react-jsx", "strict": true, "skipLibCheck": true, "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: src/glass.css** — port tokens + util sebagai **plain CSS** (tanpa `@layer`/`@apply` supaya berdiri sendiri). Salin nilai token light+dark dari dashboard `globals.css` (lihat referensi), bentuk:

```css
/* Glass UI theme — diekstrak dari apps/dashboard/app/globals.css. Plain CSS, tanpa Tailwind @layer. */
:root {
  --g-card: rgba(0,0,0,0.025); --g-card-border: rgba(0,0,0,0.09);
  --g-inner: rgba(0,0,0,0.03); --g-inner-border: rgba(0,0,0,0.07);
  --g-row-border: rgba(0,0,0,0.05); --g-dashed: rgba(0,0,0,0.1); --g-hover: rgba(99,102,241,0.06);
  --g-t1: rgba(0,0,0,0.87); --g-t2: rgba(0,0,0,0.65); --g-t3: rgba(0,0,0,0.45);
  --g-t4: rgba(0,0,0,0.35); --g-t5: rgba(0,0,0,0.25);
  --g-accent: rgba(80,85,232,0.7); --g-label: rgba(0,0,0,0.55);
  --g-btn-ghost-bg: rgba(0,0,0,0.04); --g-btn-ghost-border: rgba(0,0,0,0.1); --g-btn-ghost-text: rgba(0,0,0,0.6);
}
.dark {
  --g-card: rgba(255,255,255,0.03); --g-card-border: rgba(255,255,255,0.07);
  --g-inner: rgba(255,255,255,0.025); --g-inner-border: rgba(255,255,255,0.06);
  --g-row-border: rgba(255,255,255,0.04); --g-dashed: rgba(255,255,255,0.1); --g-hover: rgba(99,102,241,0.06);
  --g-t1: rgba(255,255,255,0.9); --g-t2: rgba(255,255,255,0.6); --g-t3: rgba(255,255,255,0.4);
  --g-t4: rgba(255,255,255,0.25); --g-t5: rgba(255,255,255,0.18);
  --g-accent: rgba(165,180,252,0.6); --g-label: rgba(255,255,255,0.6);
  --g-btn-ghost-bg: rgba(255,255,255,0.07); --g-btn-ghost-border: rgba(255,255,255,0.12); --g-btn-ghost-text: rgba(255,255,255,0.7);
}
.g-card { background: var(--g-card); border: 1px solid var(--g-card-border); }
.g-inner { background: var(--g-inner); border: 1px solid var(--g-inner-border); }
.g-t1{color:var(--g-t1)} .g-t2{color:var(--g-t2)} .g-t3{color:var(--g-t3)} .g-t4{color:var(--g-t4)} .g-t5{color:var(--g-t5)}
.g-accent{color:var(--g-accent)} .g-label{color:var(--g-label)}
.g-btn-ghost { background: var(--g-btn-ghost-bg); border: 1px solid var(--g-btn-ghost-border); color: var(--g-btn-ghost-text); }
.glass-card { background: rgba(255,255,255,0.05); backdrop-filter: blur(12px) saturate(1.8); -webkit-backdrop-filter: blur(12px) saturate(1.8); border: 1px solid rgba(99,102,241,0.10); box-shadow: 0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05); }
.glass-input { background: rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.12); color: rgba(0,0,0,0.85); transition: border-color .2s, box-shadow .2s; caret-color: #6366f1; }
.glass-input::placeholder { color: rgba(0,0,0,0.3); }
.glass-input:focus { outline: none; border-color: rgba(99,102,241,0.5); box-shadow: 0 0 0 3px rgba(99,102,241,0.10); }
.dark .glass-input { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1); color: #fff; caret-color: #a5b4fc; }
.dark .glass-input::placeholder { color: rgba(255,255,255,0.25); }
.dark .glass-input:focus { border-color: rgba(99,102,241,0.5); box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
.bg-glass-page { background: radial-gradient(ellipse at 20% 20%, rgba(255,200,220,0.30) 0%, transparent 50%), radial-gradient(ellipse at 80% 10%, rgba(180,200,255,0.35) 0%, transparent 45%), radial-gradient(ellipse at 60% 80%, rgba(200,230,255,0.25) 0%, transparent 50%), radial-gradient(ellipse at 10% 80%, rgba(255,220,180,0.20) 0%, transparent 45%), linear-gradient(135deg, #f8f4ff 0%, #f0f4ff 40%, #fef9ff 70%, #f5f8ff 100%); }
.dark .bg-glass-page { background: radial-gradient(ellipse at 80% 0%, rgba(168,85,247,0.14) 0%, transparent 50%), radial-gradient(ellipse at 20% 100%, rgba(34,197,94,0.08) 0%, transparent 50%), linear-gradient(135deg, #080818 0%, #0c0c26 50%, #080820 100%); }
```

- [ ] **Step 4: primitives** — thin wrappers.

`src/GlassCard.tsx`:
```tsx
import type { HTMLAttributes } from 'react'
export function GlassCard({ className = '', ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`g-card rounded-[14px] ${className}`} {...p} />
}
```
`src/GlassInput.tsx`:
```tsx
import type { InputHTMLAttributes } from 'react'
export function GlassInput({ className = '', ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`glass-input rounded-[10px] px-3 h-10 text-sm ${className}`} {...p} />
}
```
`src/GlassButton.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react'
export function GlassButton({ className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`g-btn-ghost rounded-[10px] px-4 h-10 text-sm font-medium transition-colors ${className}`} {...p} />
}
```
`src/index.ts`:
```ts
export { GlassCard } from './GlassCard'
export { GlassInput } from './GlassInput'
export { GlassButton } from './GlassButton'
```

- [ ] **Step 5: Verifikasi typecheck**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm install
pnpm --filter @3pb/ui exec tsc --noEmit
```
Expected: nol error.

- [ ] **Step 6: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "feat(ui): packages/ui — tema Glass (glass.css) + primitives GlassCard/Input/Button"
```

---

### Task 2: `apps/landing` scaffold — Next static export + tema

**Files:**
- Create: `apps/landing/package.json`, `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder)

**Interfaces:**
- Consumes: `@3pb/ui/glass.css`, `@3pb/kalkulator-core` (Task 3+).
- Produces: app statik yang build ke `apps/landing/out/`. Layout menyediakan `next-themes` (class `.dark`) + font Inter (`--font-inter`).

- [ ] **Step 1: package.json**

```json
{
  "name": "@3pb/landing",
  "version": "0.1.0",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build", "test": "vitest run --passWithNoTests" },
  "dependencies": {
    "@3pb/kalkulator-core": "workspace:*",
    "@3pb/ui": "workspace:*",
    "next": "16.2.3",
    "next-themes": "^0.4.6",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4", "tailwindcss": "^4",
    "@types/node": "^20", "@types/react": "^19", "@types/react-dom": "^19",
    "eslint": "^9", "eslint-config-next": "16.2.3", "typescript": "^5",
    "vitest": "^1.6.1", "@vitejs/plugin-react": "^4.7.0"
  }
}
```

- [ ] **Step 2: next.config.ts** (static export + monorepo)

```ts
import path from "path";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "export",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@3pb/kalkulator-core", "@3pb/ui"],
  images: { unoptimized: true },
};
export default nextConfig;
```

- [ ] **Step 3: postcss.config.mjs**

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

- [ ] **Step 4: tsconfig.json** (pola Next)

```json
{
  "compilerOptions": {
    "target": "ES2022", "lib": ["dom", "dom.iterable", "esnext"], "allowJs": true,
    "skipLibCheck": true, "strict": true, "noEmit": true, "esModuleInterop": true,
    "module": "esnext", "moduleResolution": "bundler", "resolveJsonModule": true,
    "isolatedModules": true, "jsx": "preserve", "incremental": true,
    "plugins": [{ "name": "next" }], "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "functions"]
}
```

- [ ] **Step 5: app/globals.css**

```css
@import "tailwindcss";
@import "@3pb/ui/glass.css";
@custom-variant dark (&:is(.dark *));
html { font-family: var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { min-height: 100dvh; }
```

- [ ] **Step 6: app/layout.tsx** (next-themes + Inter)

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const metadata: Metadata = {
  title: "Slizebiz — kalkulator harga jual produk 3D print",
  description: "Hitung biaya modal & harga jual produk 3D print-mu dalam hitungan detik. Powered by 3D Printing Bandung.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={inter.variable}>
      <body className="bg-glass-page">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 7: app/page.tsx** (placeholder sementara)

```tsx
export default function Home() {
  return <main className="min-h-dvh flex items-center justify-center"><h1 className="text-2xl font-bold g-t1">slizebiz</h1></main>;
}
```

- [ ] **Step 8: Verifikasi build statik**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm install
pnpm --filter @3pb/landing build
ls apps/landing/out/index.html
```
Expected: build sukses, `out/index.html` ada (bukti export statik). Tak ada error "output: export" incompat.

- [ ] **Step 9: Commit**

```bash
git add apps/landing pnpm-lock.yaml
git commit -m "feat(landing): scaffold apps/landing — Next static export + tema Glass + next-themes"
```

---

### Task 3: `defaultSettings` + teaser compute (TDD)

**Files:**
- Create: `apps/landing/lib/default-settings.ts`, `apps/landing/lib/teaser.ts`, `apps/landing/lib/teaser.test.ts`
- Create: `apps/landing/vitest.config.ts`

**Interfaces:**
- Consumes: `hitungKalkulasiV2`, tipe `SettingsV2`/`KalkulasiInputV2`/`HasilKalkulasiV2` dari `@3pb/kalkulator-core`.
- Produces:
  - `defaultSettings: SettingsV2`
  - `DEFAULT_MATERIAL: Record<'FDM'|'SLA', { hppPerGram; jualPerGram; failureRatePct }>`, `DEFAULT_MESIN_PER_JAM = 4000`
  - `TeaserInput = { gramasi: number; durasiJam: number; tipe: 'FDM'|'SLA' }`
  - `buildTeaserInputV2(t: TeaserInput): KalkulasiInputV2`
  - `computeTeaser(t: TeaserInput): HasilKalkulasiV2`
  - `teaserView(t: TeaserInput): { biayaModal; hargaJualMinimum; rekomendasi; offlineABC: [number,number,number]; shopeeABC: [number,number,number] }` (semua sudah `Math.round`)

- [ ] **Step 1: vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["lib/**/*.test.ts"] } });
```

- [ ] **Step 2: Tulis failing test** `lib/teaser.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { hitungKalkulasiV2 } from "@3pb/kalkulator-core";
import { defaultSettings, buildTeaserInputV2, teaserView } from "./teaser";

const INPUT = { gramasi: 100, durasiJam: 2, tipe: "FDM" as const };

describe("teaser parity", () => {
  it("teaserView == hitungKalkulasiV2 (teaser hanya memformat, tak hitung ulang)", () => {
    const h = hitungKalkulasiV2(buildTeaserInputV2(INPUT), defaultSettings);
    const off = h.hargaPerChannel.find(c => c.channelId === "offline")!;
    const shop = h.hargaPerChannel.find(c => c.channelId === "shopee")!;
    const v = teaserView(INPUT);
    expect(v.biayaModal).toBe(Math.round(h.hppTotal));
    expect(v.hargaJualMinimum).toBe(Math.round(h.floorPrice));
    expect(v.rekomendasi).toBe(Math.round(off.B));
    expect(v.offlineABC).toEqual([Math.round(off.A), Math.round(off.B), Math.round(off.C)]);
    expect(v.shopeeABC).toEqual([Math.round(shop.A), Math.round(shop.B), Math.round(shop.C)]);
  });
  it("nilai wajar (biaya modal > 0, harga minimum > biaya modal)", () => {
    const v = teaserView(INPUT);
    expect(v.biayaModal).toBeGreaterThan(0);
    expect(v.hargaJualMinimum).toBeGreaterThan(v.biayaModal);
    expect(v.offlineABC[2]).toBeGreaterThan(v.offlineABC[0]); // C > A
  });
});
```

- [ ] **Step 3: Run → FAIL**

```bash
pnpm --filter @3pb/landing exec vitest run lib/teaser.test.ts
```
Expected: FAIL (module `./teaser` belum ada).

- [ ] **Step 4: Implementasi** `lib/default-settings.ts`

```ts
import type { SettingsV2 } from "@3pb/kalkulator-core";

export const defaultSettings: SettingsV2 = {
  failureSpreadPct: 50,
  testLayerPct: 5,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 },
  resellerBulkMultiplier: 1.05,
  channels: [
    { id: "offline", nama: "Offline", feeMultiplier: 1 },
    { id: "shopee", nama: "Shopee", feeMultiplier: 1.2 },
  ],
};

export const DEFAULT_MATERIAL = {
  FDM: { hppPerGram: 300, jualPerGram: 900, failureRatePct: 12 },
  SLA: { hppPerGram: 1750, jualPerGram: 3500, failureRatePct: 12 },
} as const;

export const DEFAULT_MESIN_PER_JAM = 4000; // Bambu P1P — sekaligus mesin acuan harga
```

`lib/teaser.ts`:
```ts
import { hitungKalkulasiV2, type KalkulasiInputV2, type HasilKalkulasiV2 } from "@3pb/kalkulator-core";
import { defaultSettings, DEFAULT_MATERIAL, DEFAULT_MESIN_PER_JAM } from "./default-settings";
export { defaultSettings };

export interface TeaserInput { gramasi: number; durasiJam: number; tipe: "FDM" | "SLA" }

export function buildTeaserInputV2(t: TeaserInput): KalkulasiInputV2 {
  const m = DEFAULT_MATERIAL[t.tipe];
  return {
    plates: [{
      durasiJam: t.durasiJam,
      mesinPerJam: DEFAULT_MESIN_PER_JAM,
      mesinPerJamJual: DEFAULT_MESIN_PER_JAM,
      materials: [{ gramasi: t.gramasi, hppPerGram: m.hppPerGram, jualPerGram: m.jualPerGram, failureRatePct: m.failureRatePct }],
    }],
    batch: 1,
    komponen: [],
    labor: [],
  };
}

export function computeTeaser(t: TeaserInput): HasilKalkulasiV2 {
  return hitungKalkulasiV2(buildTeaserInputV2(t), defaultSettings);
}

export interface TeaserView {
  biayaModal: number; hargaJualMinimum: number; rekomendasi: number;
  offlineABC: [number, number, number]; shopeeABC: [number, number, number];
}
export function teaserView(t: TeaserInput): TeaserView {
  const h = computeTeaser(t);
  const off = h.hargaPerChannel.find(c => c.channelId === "offline")!;
  const shop = h.hargaPerChannel.find(c => c.channelId === "shopee")!;
  const r = Math.round;
  return {
    biayaModal: r(h.hppTotal),
    hargaJualMinimum: r(h.floorPrice),
    rekomendasi: r(off.B),
    offlineABC: [r(off.A), r(off.B), r(off.C)],
    shopeeABC: [r(shop.A), r(shop.B), r(shop.C)],
  };
}
```

- [ ] **Step 5: Run → PASS**

```bash
pnpm --filter @3pb/landing exec vitest run lib/teaser.test.ts
```
Expected: PASS 2/2, output bersih.

- [ ] **Step 6: Commit**

```bash
git add apps/landing/lib apps/landing/vitest.config.ts
git commit -m "feat(landing): defaultSettings + teaser compute (parity ke hitungKalkulasiV2, TDD)"
```

---

### Task 4: Komponen Teaser (client UI)

**Files:**
- Create: `apps/landing/components/Teaser.tsx`

**Interfaces:**
- Consumes: `teaserView`, `TeaserInput` (Task 3); `GlassCard`, `GlassInput` (`@3pb/ui`). Menerima prop `onWaitlist: (interest: 'beli'|'subscribe') => void` (dipicu tombol overlay/footer → dibuka WaitlistForm di Task 6/7).
- Produces: `<Teaser onWaitlist={...} />` (client component).

- [ ] **Step 1: Implementasi** `components/Teaser.tsx` — form interaktif + hasil. `"use client"`. Format Rupiah `Rp x.xxx`.

```tsx
"use client";
import { useState, useMemo } from "react";
import { GlassCard, GlassInput } from "@3pb/ui";
import { teaserView, type TeaserInput } from "@/lib/teaser";

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export function Teaser({ onWaitlist }: { onWaitlist: (i: "beli" | "subscribe") => void }) {
  const [gramasi, setGramasi] = useState(100);
  const [durasi, setDurasi] = useState(2);
  const [tipe, setTipe] = useState<"FDM" | "SLA">("FDM");
  const view = useMemo(() => {
    if (gramasi <= 0 || durasi <= 0) return null;
    try { return teaserView({ gramasi, durasiJam: durasi, tipe }); } catch { return null; }
  }, [gramasi, durasi, tipe]);

  return (
    <GlassCard className="p-5 grid gap-5 md:grid-cols-2">
      {/* INPUT */}
      <div className="space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide g-accent">Berat (gram)</label>
          <GlassInput type="number" min={0} value={gramasi || ""} onChange={e => setGramasi(+e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide g-accent">Durasi print (jam)</label>
          <GlassInput type="number" min={0} step={0.1} value={durasi || ""} onChange={e => setDurasi(+e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide g-accent">Jenis filament</label>
          <div className="flex gap-2 mt-1">
            {(["FDM", "SLA"] as const).map(t => (
              <button key={t} onClick={() => setTipe(t)}
                className="flex-1 h-10 rounded-[10px] text-sm font-semibold"
                style={tipe === t ? { background: "rgba(99,102,241,0.25)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.5)" } : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t3)" }}>
                {t}
              </button>
            ))}
          </div>
          <p className="text-[10px] g-t5 mt-1">Printer & material custom ada di app (segera).</p>
        </div>
      </div>

      {/* HASIL */}
      <div className="space-y-2">
        {!view ? <p className="g-t4 text-sm">Isi berat & durasi.</p> : (
          <>
            <Row label="Biaya modal" value={rp(view.biayaModal)} sub="material + listrik + depresiasi + buffer gagal" />
            <Row label="Harga jual minimum" value={rp(view.hargaJualMinimum)} sub="di bawah ini rugi" />
            <div className="rounded-[10px] p-3" style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(165,180,252,0.7)" }}>Rekomendasi harga jual</div>
              <div className="text-2xl font-bold" style={{ color: "#a5b4fc" }}>{rp(view.rekomendasi)}</div>
              <div className="text-[11px] g-t4">margin standar (B)</div>
            </div>
            {/* Preview terkunci */}
            <div className="relative rounded-[10px] p-3 overflow-hidden" style={{ border: "1px solid var(--g-inner-border)" }}>
              <div style={{ filter: "blur(5px)", opacity: 0.5 }} className="space-y-1 select-none pointer-events-none">
                <div className="text-xs g-t2">Margin A · B · C — Offline {view.offlineABC.map(rp).join(" · ")}</div>
                <div className="text-xs g-t2">Shopee {view.shopeeABC.map(rp).join(" · ")}</div>
                <div className="text-xs g-t2">Status vs harga pasar · untung/rugi</div>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
                <p className="text-[11px] g-t2 mb-2">Banding margin A/B/C, untung/rugi vs harga pasar & per channel — <b>segera hadir di app</b></p>
                <button onClick={() => onWaitlist("beli")} className="h-8 px-4 rounded-[8px] text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg,#5055e8,#7c84f8)" }}>Beri tahu saya saat rilis</button>
              </div>
            </div>
            <button onClick={() => onWaitlist("beli")} className="text-[11px] g-t4 underline">Simpan, multi-plate, labor & settings custom → di app, segera</button>
          </>
        )}
      </div>
    </GlassCard>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <div><div className="text-sm g-t2">{label}</div>{sub && <div className="text-[10px] g-t5">{sub}</div>}</div>
      <div className="text-lg font-semibold g-t1">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Verifikasi build + typecheck**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter @3pb/landing exec tsc --noEmit
```
Expected: nol error. (Render manual di dev server saat Task 7.)

- [ ] **Step 3: Commit**

```bash
git add apps/landing/components/Teaser.tsx
git commit -m "feat(landing): komponen Teaser — kalkulator client-side + preview terkunci CTA waitlist"
```

---

### Task 5: Konten + section landing (Navbar/Hero/ValueProps/TierCompare/Faq/Footer)

**Files:**
- Create: `apps/landing/lib/content.ts`, `apps/landing/components/Navbar.tsx`, `Hero.tsx`, `ValueProps.tsx`, `TierCompare.tsx`, `Faq.tsx`, `Footer.tsx`

**Interfaces:**
- Consumes: `@3pb/ui`. `TierCompare`/`Hero` menerima `onWaitlist: (i:'beli'|'subscribe')=>void`.
- Produces: section components dirakit di Task 7. `content.ts` mengekspor `CONTENT` (copy) + `TIERS` (array `{ id; nama; harga; fitur: string[]; interest?: 'beli'|'subscribe' }`).

- [ ] **Step 1: content.ts** — semua copy & harga (build-time; harga = "Segera hadir").

```ts
export const APP_URL = "https://app.slizebiz.com";
export const CONTENT = {
  brand: "slizebiz",
  poweredBy: "powered by 3D Printing Bandung",
  heroHeadline: "Tahu harga jual produk 3D print-mu dalam hitungan detik",
  heroSub: "Hitung biaya modal, harga jual minimum, dan rekomendasi harga — gratis, tanpa daftar.",
  valueProps: [
    { icon: "🎯", title: "Harga akurat", desc: "Material, buffer gagal, listrik + depresiasi mesin ikut dihitung — bukan cuma tebak." },
    { icon: "🏷️", title: "Per channel", desc: "Rekomendasi harga untuk offline & marketplace, sekali klik." },
    { icon: "💾", title: "Simpan & kelola", desc: "Simpan kalkulasi, multi-plate, labor & settings custom — di app (segera)." },
  ],
  faq: [
    { q: "Perlu bayar untuk coba?", a: "Tidak. Kalkulator teaser gratis dan tanpa daftar." },
    { q: "Data saya aman?", a: "Teaser tidak menyimpan apa pun. Waitlist hanya menyimpan email untuk kabar rilis." },
    { q: "Kapan app rilis?", a: "Sedang dibangun. Masuk waitlist untuk diberi tahu duluan." },
  ],
} as const;

export const TIERS = [
  { id: "free", nama: "Free", harga: "Rp 0", fitur: ["Kalkulator dasar", "Margin A/B/C + status", "Tanpa simpan"] },
  { id: "beli", nama: "Beli", harga: "Segera hadir", interest: "beli" as const, highlight: true,
    fitur: ["Miliki aplikasinya — selamanya", "Semua fitur inti, offline", "Simpan, multi-plate, labor, settings"] },
  { id: "subscribe", nama: "Subscribe", harga: "Segera hadir", interest: "subscribe" as const,
    fitur: ["Sync antar device (cloud)", "OCR & share invoice", "Butuh langganan"] },
];
```

- [ ] **Step 2: Section components** — presentational, pakai token Glass. Contoh `Navbar.tsx`:

```tsx
import { CONTENT, APP_URL } from "@/lib/content";
export function Navbar() {
  return (
    <nav className="flex items-center justify-between px-5 py-4 max-w-5xl mx-auto w-full">
      <span className="font-bold text-lg g-t1">{CONTENT.brand}</span>
      <div className="flex items-center gap-4 text-sm">
        <a href="#harga" className="g-t3 hover:g-t1">Harga</a>
        <a href="#faq" className="g-t3 hover:g-t1">FAQ</a>
        <a href={APP_URL} className="g-btn-ghost rounded-[8px] px-3 py-1.5 text-xs" title="Segera hadir">Masuk <span className="g-t5">· segera</span></a>
      </div>
    </nav>
  );
}
```
`Hero.tsx` (eyebrow powered-by, headline, sub, CTA scroll ke `#teaser`), `ValueProps.tsx` (map `CONTENT.valueProps` jadi 3 GlassCard), `TierCompare.tsx` (map `TIERS`; kartu `highlight` diberi border aksen; kartu dengan `interest` → tombol "Beri tahu saya saat rilis" `onClick={() => onWaitlist(interest)}`; section id `harga`), `Faq.tsx` (map `CONTENT.faq` jadi `<details>`; id `faq`), `Footer.tsx` (brand + poweredBy + link `Privasi` [→ `/privasi`], `Ketentuan`/`Refund` [span "segera"], `Kontak`). Semua ≤ ~40 baris; ikuti pola Navbar.

- [ ] **Step 3: Verifikasi typecheck**

```bash
pnpm --filter @3pb/landing exec tsc --noEmit
```
Expected: nol error.

- [ ] **Step 4: Commit**

```bash
git add apps/landing/lib/content.ts apps/landing/components/
git commit -m "feat(landing): konten + section Navbar/Hero/ValueProps/TierCompare/Faq/Footer"
```

---

### Task 6: Waitlist — Pages Function + D1 + validasi (TDD)

**Files:**
- Create: `apps/landing/functions/_lib/validate.ts`, `apps/landing/functions/_lib/validate.test.ts`, `apps/landing/functions/api/waitlist.ts`, `apps/landing/functions/tsconfig.json`, `apps/landing/schema.sql`, `apps/landing/components/WaitlistForm.tsx`
- Modify: `apps/landing/package.json` (devDep `@cloudflare/workers-types`)

**Interfaces:**
- Produces:
  - `validateWaitlist(body: unknown): { ok: true; email: string; interest: string } | { ok: false; error: string }`
  - Endpoint `POST /api/waitlist` (body `{ email, interest }`) → `200 {ok:true}` | `400 {error}` | `500 {error}`.
  - `<WaitlistForm interest="beli"|"subscribe" onDone?={() => void} />` (client) POST ke `/api/waitlist`.

- [ ] **Step 1: Tulis failing test** `functions/_lib/validate.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { validateWaitlist } from "./validate";

describe("validateWaitlist", () => {
  it("email valid + interest beli → ok", () => {
    expect(validateWaitlist({ email: "A@B.com ", interest: "beli" })).toEqual({ ok: true, email: "a@b.com", interest: "beli" });
  });
  it("email invalid → error", () => {
    expect(validateWaitlist({ email: "bukan-email", interest: "beli" })).toEqual({ ok: false, error: "email tidak valid" });
  });
  it("interest invalid → error", () => {
    expect(validateWaitlist({ email: "a@b.com", interest: "xxx" })).toEqual({ ok: false, error: "minat tidak valid" });
  });
  it("body kosong → error", () => {
    expect(validateWaitlist(null)).toEqual({ ok: false, error: "email tidak valid" });
  });
});
```

- [ ] **Step 2: Run → FAIL**

```bash
pnpm --filter @3pb/landing exec vitest run functions/_lib/validate.test.ts
```
Expected: FAIL (module belum ada). Catatan: perluas `include` di `vitest.config.ts` → `["lib/**/*.test.ts", "functions/**/*.test.ts"]`.

- [ ] **Step 3: Implementasi** `functions/_lib/validate.ts`

```ts
export function validateWaitlist(body: unknown):
  { ok: true; email: string; interest: string } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const interest = b.interest;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "email tidak valid" };
  if (interest !== "beli" && interest !== "subscribe") return { ok: false, error: "minat tidak valid" };
  return { ok: true, email, interest };
}
```

- [ ] **Step 4: Run → PASS**

```bash
pnpm --filter @3pb/landing exec vitest run functions/_lib/validate.test.ts
```
Expected: PASS 4/4.

- [ ] **Step 5: Pages Function** `functions/api/waitlist.ts`

```ts
import { validateWaitlist } from "../_lib/validate";
interface Env { DB: D1Database }
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: unknown;
  try { body = await ctx.request.json(); } catch { return json({ error: "format tidak valid" }, 400); }
  const v = validateWaitlist(body);
  if (!v.ok) return json({ error: v.error }, 400);
  try {
    await ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO waitlist (id, email, interest, created_at) VALUES (?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), v.email, v.interest, new Date().toISOString()).run();
  } catch { return json({ error: "gagal menyimpan, coba lagi" }, 500); }
  return json({ ok: true });
};
```

`functions/tsconfig.json`:
```json
{ "compilerOptions": { "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler", "types": ["@cloudflare/workers-types"], "strict": true, "skipLibCheck": true, "noEmit": true }, "include": ["."] }
```

`schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS waitlist (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  interest   TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(email, interest)
);
```

Tambah `@cloudflare/workers-types` ke devDependencies `apps/landing/package.json`, lalu `pnpm install`.

- [ ] **Step 6: WaitlistForm** `components/WaitlistForm.tsx`

```tsx
"use client";
import { useState } from "react";
import { GlassInput } from "@3pb/ui";
export function WaitlistForm({ interest, onDone }: { interest: "beli" | "subscribe"; onDone?: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function submit() {
    setState("loading"); setMsg("");
    try {
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, interest }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setState("done"); onDone?.(); }
      else { setState("error"); setMsg(data.error ?? "gagal, coba lagi"); }
    } catch { setState("error"); setMsg("gagal, coba lagi"); }
  }
  if (state === "done") return <p className="text-sm g-t2">✅ Terdaftar! Kami email saat rilis.</p>;
  return (
    <div className="space-y-2">
      <GlassInput type="email" placeholder="email@kamu.com" value={email} onChange={e => setEmail(e.target.value)} className="w-full" />
      <label className="flex items-start gap-2 text-[10px] g-t4">
        <input type="checkbox" required /> Setuju email disimpan sesuai <a href="/privasi" className="underline">Kebijakan Privasi</a>.
      </label>
      <button onClick={submit} disabled={state === "loading"} className="w-full h-9 rounded-[8px] text-sm font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#5055e8,#7c84f8)" }}>
        {state === "loading" ? "..." : "Daftar waitlist"}
      </button>
      {state === "error" && <p className="text-[11px] text-red-400">{msg}</p>}
    </div>
  );
}
```

- [ ] **Step 7: Verifikasi**

```bash
pnpm --filter @3pb/landing exec vitest run functions/_lib/validate.test.ts
pnpm --filter @3pb/landing exec tsc --noEmit
```
Expected: test PASS, typecheck app nol error. (Fungsi Worker diuji end-to-end via `wrangler pages dev` di Task 7/deploy — dicatat, bukan diblokir di sini.)

- [ ] **Step 8: Commit**

```bash
git add apps/landing/functions apps/landing/schema.sql apps/landing/components/WaitlistForm.tsx apps/landing/package.json apps/landing/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(landing): waitlist — Pages Function → D1 + validasi (TDD) + WaitlistForm"
```

---

### Task 7: Rakit halaman + Privasi + modal waitlist

**Files:**
- Modify: `apps/landing/app/page.tsx`
- Create: `apps/landing/app/privasi/page.tsx`, `apps/landing/components/WaitlistModal.tsx`

**Interfaces:**
- Consumes: semua section (Task 5), `Teaser` (Task 4), `WaitlistForm` (Task 6).
- Produces: landing utuh dengan state `waitlist` (interest aktif) yang membuka `WaitlistModal`.

- [ ] **Step 1: WaitlistModal** `components/WaitlistModal.tsx` (client) — overlay berisi `WaitlistForm`, tutup saat selesai/klik luar.

```tsx
"use client";
import { WaitlistForm } from "./WaitlistForm";
export function WaitlistModal({ interest, onClose }: { interest: "beli" | "subscribe"; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="glass-card rounded-[16px] p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="text-sm font-semibold g-t1 mb-1">Beri tahu saya saat rilis</div>
        <p className="text-[11px] g-t4 mb-3">Minat: {interest === "beli" ? "Beli (miliki app)" : "Subscribe (cloud)"}. Kami email saat fitur ini rilis.</p>
        <WaitlistForm interest={interest} onDone={() => setTimeout(onClose, 1500)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: page.tsx** — rakit + state waitlist (`"use client"` di page karena butuh state; section tetap server-safe komponen biasa).

```tsx
"use client";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Teaser } from "@/components/Teaser";
import { ValueProps } from "@/components/ValueProps";
import { TierCompare } from "@/components/TierCompare";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";
import { WaitlistModal } from "@/components/WaitlistModal";

export default function Home() {
  const [wl, setWl] = useState<"beli" | "subscribe" | null>(null);
  return (
    <main className="min-h-dvh">
      <Navbar />
      <div className="max-w-5xl mx-auto px-5 space-y-16 py-8">
        <Hero />
        <section id="teaser"><Teaser onWaitlist={setWl} /></section>
        <ValueProps />
        <TierCompare onWaitlist={setWl} />
        <Faq />
      </div>
      <Footer />
      {wl && <WaitlistModal interest={wl} onClose={() => setWl(null)} />}
    </main>
  );
}
```

- [ ] **Step 3: app/privasi/page.tsx** — kebijakan privasi minimal (funnel §10.2), statik.

```tsx
export const metadata = { title: "Kebijakan Privasi — Slizebiz" };
export default function Privasi() {
  return (
    <main className="max-w-2xl mx-auto px-5 py-12 space-y-4 g-t2 text-sm leading-relaxed">
      <h1 className="text-xl font-bold g-t1">Kebijakan Privasi</h1>
      <p className="text-[11px] g-t5">Template ringkas — akan disempurnakan. Berlaku hukum Republik Indonesia (UU PDP).</p>
      <p><b className="g-t1">Data yang dikumpulkan.</b> Hanya alamat email dan pilihan minat (beli/subscribe) yang kamu kirim lewat form waitlist, untuk memberi tahu saat produk rilis.</p>
      <p><b className="g-t1">Penyimpanan.</b> Disimpan di Cloudflare D1. Tidak dijual atau dibagikan ke pihak ketiga untuk pemasaran.</p>
      <p><b className="g-t1">Teaser kalkulator.</b> Perhitungan berjalan di browser-mu dan tidak dikirim atau disimpan di server kami.</p>
      <p><b className="g-t1">Hak kamu.</b> Minta hapus email dari waitlist kapan saja via kontak di footer.</p>
      <p><a href="/" className="g-accent underline">← Kembali</a></p>
    </main>
  );
}
```

- [ ] **Step 4: Verifikasi build statik penuh**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter @3pb/landing build
ls apps/landing/out/index.html apps/landing/out/privasi/index.html
```
Expected: build sukses, kedua HTML ada.

- [ ] **Step 5: Verifikasi manual (dev server)**

Jalankan preview (browser pane / `next dev`), cek: teaser menghitung saat input berubah; angka masuk akal; klik "Beri tahu saya saat rilis" → modal muncul; toggle FDM/SLA mengubah hasil; light/dark (next-themes) tampil benar. Screenshot bukti.

- [ ] **Step 6: Commit**

```bash
git add apps/landing/app apps/landing/components/WaitlistModal.tsx
git commit -m "feat(landing): rakit landing utuh + modal waitlist + halaman Privasi"
```

---

### Task 8: Deploy config (Cloudflare) + CI + verifikasi akhir

**Files:**
- Create: `apps/landing/wrangler.toml`, `apps/landing/README.md`
- Modify: `.github/workflows/ci.yml` (jika perlu — `pnpm turbo test/build` sudah workspace-wide; verifikasi apps/landing ikut)

**Interfaces:** —

- [ ] **Step 1: wrangler.toml** (binding D1; `database_id` diisi setelah `wrangler d1 create`)

```toml
name = "slizebiz-landing"
compatibility_date = "2024-11-01"
pages_build_output_dir = "out"

[[d1_databases]]
binding = "DB"
database_name = "slizebiz-waitlist"
database_id = "PLACEHOLDER-isi-setelah-d1-create"
```

- [ ] **Step 2: README.md** — langkah deploy (dijalankan user; butuh akun Cloudflare + DNS slizebiz.com di Cloudflare).

````markdown
# Slizebiz Landing — deploy Cloudflare Pages

Prasyarat: akun Cloudflare, domain `slizebiz.com` memakai nameserver Cloudflare, `npx wrangler login`.

1. Buat D1 + tabel:
   ```
   npx wrangler d1 create slizebiz-waitlist        # salin database_id → wrangler.toml
   npx wrangler d1 execute slizebiz-waitlist --remote --file apps/landing/schema.sql
   ```
2. Build: `pnpm --filter @3pb/landing build` (hasil `apps/landing/out`).
3. Deploy: `npx wrangler pages deploy apps/landing/out --project-name slizebiz-landing`
   (atau hubungkan repo via Cloudflare Pages Git integration: build command `pnpm --filter @3pb/landing build`, output dir `apps/landing/out`, root `/`).
4. Custom domain: tambah `www.slizebiz.com` di Pages project; apex `slizebiz.com` → redirect ke `www`.
5. Cek waitlist: `npx wrangler d1 execute slizebiz-waitlist --remote --command "SELECT * FROM waitlist"`.

Uji lokal fungsi + D1: `npx wrangler pages dev apps/landing/out --d1 DB=slizebiz-waitlist`.
````

- [ ] **Step 3: CI — pastikan apps/landing ikut**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm turbo test
pnpm turbo build
```
Expected: semua package (dashboard + kalkulator-core + ui + landing) hijau; landing build export OK. Jika workflow root belum menyertakan pattern baru, verifikasi glob `apps/*` sudah mencakup (turbo otomatis). Tambah catatan bila perlu.

- [ ] **Step 4: Lint (tanpa error baru)**

```bash
pnpm --filter @3pb/landing exec eslint . || true   # baseline nol untuk app baru
pnpm --filter @3pb/ui exec tsc --noEmit
```
Expected: apps/landing (app baru) nol error lint; jika ada, perbaiki.

- [ ] **Step 5: Commit**

```bash
git add apps/landing/wrangler.toml apps/landing/README.md .github/workflows/ci.yml
git commit -m "chore(landing): wrangler.toml + README deploy + CI workspace-wide"
```

- [ ] **Step 6: Deploy (GATED — user)**

Deploy nyata ke Cloudflare butuh akun user + DNS. Ikuti README Step 1–4 saat user siap. **Jangan** deploy tanpa perintah user. Setelah live: verifikasi `www.slizebiz.com` render, submit 1 email waitlist uji, cek masuk D1, lalu (nanti) trigger chip vault 3DPB.

---

## Self-Review

- **Spec coverage:** §2 arsitektur→Task 2/8; §3 monorepo→Task 1/2; §4 landing→Task 5/7; §5 teaser→Task 3/4; §6 waitlist→Task 6; §7 deploy→Task 8; §8 privasi→Task 7; §10 testing→Task 3/6 + build gates. ✓
- **Placeholder scan:** `database_id` placeholder di wrangler.toml = sengaja (diisi user saat `d1 create`), didokumentasikan di README. Section Task 5 Step 2 menyebut "ikuti pola Navbar" tapi memberi kode Navbar penuh + daftar isi tiap section — bukan placeholder logika. ✓
- **Type consistency:** `TeaserView`/`teaserView`/`teaserView().offlineABC` konsisten Task 3↔4; `validateWaitlist` signature konsisten Task 6 (test↔impl↔function); `onWaitlist: (i:'beli'|'subscribe')=>void` konsisten Task 4/5/7. ✓
- **YAGNI:** tanpa auth/SSR/PWA/Prisma (semua di fase app). `@3pb/ui` hanya 3 primitive + CSS. ✓
