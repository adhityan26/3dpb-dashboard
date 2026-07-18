# Slizebiz App 1a-1 (Free + admin-mini) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bangun `apps/saas` — aplikasi Slizebiz ber-auth dengan kalkulator penuh untuk user Free, entitlement komposit + primitif gating, dan admin-mini owner-only (edit Config harga/copy + lihat waitlist dari Cloudflare D1), deploy ke homelab.

**Architecture:** Next.js 16 App Router (pola `apps/dashboard`), Prisma 7 + Postgres (NextAuth tables + `Entitlement` + `Config`; **tanpa** tabel Waitlist — waitlist dibaca read-only dari Cloudflare D1 milik landing). Auth = magic-link NextAuth v5 + Resend, sesi database. Kalkulator memakai `@3pb/kalkulator-core` (`hitungKalkulasiV2`) + `defaultSettings` konstanta; UI hanya memformat (tak menghitung ulang). Gating dua-sumbu (login? + kapabilitas berbayar?) lewat `getEntitlement`/`can`/`requirePlan` (server) & `useEntitlement` (client); di 1a-1 semua user = Free, fitur Beli tampil 🔒 → modal "segera hadir". Deploy homelab: container `slizebiz` port 3200, DB `slizebiz` di `light-generator-postgres-1`.

**Tech Stack:** Next.js 16.2.3, React 19.2.4, NextAuth v5 beta (`next-auth@^5.0.0-beta.30`) + Resend provider, `@auth/prisma-adapter`, Prisma 7 + `@prisma/adapter-pg` + `pg`, `@tanstack/react-query`, Tailwind v4 (`@tailwindcss/postcss`), `next-themes`, `@3pb/kalkulator-core`, `@3pb/ui`, vitest 1.6.1.

## Global Constraints

- **Node 22 wajib.** Setiap perintah shell diawali `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`. Default shell mesin ini Node v10 (rusak).
- **Package name** `apps/saas` = **`@3pb/saas`** (`private: true`). Filter pnpm: `pnpm --filter @3pb/saas <script>`.
- **Deploy target = HOMELAB** (bukan VPS). Container `slizebiz`, port host **3200**→3000, network `homelab`, Docker host `192.168.88.113:2375`. DB = database baru **`slizebiz`** di container Postgres `light-generator-postgres-1`. VPS/`app.slizebiz.com` = go-public terpisah, **di luar plan ini**.
- **Waitlist = Cloudflare D1**, bukan Postgres app. DB_ID = `fc76ff99-d167-4570-a8ae-58923ab31e4d`, tabel `waitlist(id,email,interest,created_at)`. Admin baca read-only via CF API. **Tidak ada** model Prisma `Waitlist`.
- **Label margin** pakai `MARGIN_TIER_LABEL` dari kalkulator-core (`A→Kompetitif`, `B→Standard`, `C→Premium`). Key A/B/C tidak berubah; hanya tampilan pakai label.
- **Istilah kalkulator terkunci:** baris biaya = **"Biaya modal"** (bukan "HPP"/"floor"), baris minimum = **"Harga jual minimum"** (bukan "floor price"/"BEP"). "BEP" tidak dipakai.
- **Payment/subscription = 1c** (bukan sekarang). **Save/IndexedDB/PWA data = 1b.** Di 1a-1: entitlement tak pernah di-flip, semua user Free; `requirePlan` disediakan + di-test tapi belum menjaga API apa pun.
- **Sumber angka kalkulator = core**, UI hanya memformat (disiplin sama `RincianPanel` dashboard). Jangan hitung ulang di UI.
- **DRY, YAGNI, TDD, commit sering.** `packages/kalkulator-core`, `packages/ui`, `apps/dashboard`, `apps/landing` **tidak** disentuh (kecuali penambahan eksplisit yang disebut task).
- Test framework: **vitest** (`pnpm --filter @3pb/saas test`). CI root (`.github/workflows/ci.yml`) sudah workspace-wide via `pnpm turbo test` — otomatis mencakup `@3pb/saas` begitu package ada.

---

## File Structure

```
apps/saas/
  package.json                         # @3pb/saas, deps + scripts
  next.config.ts                       # standalone output, tracing root, transpilePackages
  postcss.config.mjs                   # @tailwindcss/postcss
  tsconfig.json                        # paths @/* → .
  vitest.config.ts                     # react plugin, node env, alias @
  next-env.d.ts
  .gitignore
  prisma.config.ts                     # schema + datasource dari env
  prisma/schema.prisma                 # NextAuth + Entitlement + Config
  Dockerfile                           # multi-stage monorepo (pola dashboard)
  docker-entrypoint.sh                 # prisma db push → start
  deploy.sh                            # build + docker run ke homelab
  .env.deploy.example                  # daftar env
  app/
    globals.css                        # import tailwind + @3pb/ui/glass.css
    layout.tsx                         # ThemeProvider + QueryProvider
    providers.tsx                      # TanStack Query client provider
    page.tsx                           # halaman kalkulator (Free)
    login/page.tsx                     # form email magic-link
    login/verify/page.tsx              # "cek email"
    admin/page.tsx                     # admin-mini (owner-only)
    api/auth/[...nextauth]/route.ts    # NextAuth handlers
    api/entitlement/route.ts           # GET entitlement user sesi
    api/admin/config/route.ts          # GET/PUT Config (owner-only)
    api/admin/waitlist/route.ts        # GET waitlist dari D1 (owner-only)
  lib/
    db.ts                              # PrismaClient + adapter-pg (mirror dashboard)
    auth.ts                            # NextAuth config (Resend + Prisma adapter)
    owner.ts                           # isOwner(email) via OWNER_EMAILS
    owner.test.ts
    entitlement.ts                     # getEntitlement/can/requirePlan/capabilities
    entitlement.test.ts
    config.ts                          # getConfig/getAllConfig/setConfig + DEFAULT_CONFIG
    config.test.ts
    kalkulator/default-settings.ts     # SettingsV2 + DEFAULT_MATERIAL + DEFAULT_MESIN_PER_JAM
    kalkulator/compute.ts              # buildInputV2 + fullView (format hasil core)
    kalkulator/compute.test.ts
    waitlist/cloudflare.ts             # fetchWaitlist(env) via CF API
    waitlist/cloudflare.test.ts
    hooks/use-entitlement.ts           # useEntitlement() TanStack Query
  components/
    Calculator.tsx                     # form input + hasil (client)
    UpgradeModal.tsx                   # modal "segera hadir" fitur Beli
    LockedBlock.tsx                    # blur + overlay login-gate
    admin/ConfigEditor.tsx             # form key-value Config
    admin/WaitlistTable.tsx            # tabel + ekspor CSV
```

---

### Task 1: Scaffold `apps/saas` (build hijau, halaman kosong)

**Files:**
- Create: `apps/saas/package.json`, `apps/saas/next.config.ts`, `apps/saas/postcss.config.mjs`, `apps/saas/tsconfig.json`, `apps/saas/vitest.config.ts`, `apps/saas/next-env.d.ts`, `apps/saas/.gitignore`
- Create: `apps/saas/app/globals.css`, `apps/saas/app/layout.tsx`, `apps/saas/app/providers.tsx`, `apps/saas/app/page.tsx`
- Test: `apps/saas/lib/smoke.test.ts`

**Interfaces:**
- Produces: paket workspace `@3pb/saas` yang build & test hijau; `app/globals.css` meng-import `@3pb/ui/glass.css`; `providers.tsx` mengekspor `Providers` (TanStack Query).

- [ ] **Step 1: Buat `apps/saas/package.json`**

```json
{
  "name": "@3pb/saas",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3200",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@3pb/kalkulator-core": "workspace:*",
    "@3pb/ui": "workspace:*",
    "@auth/prisma-adapter": "^2.11.1",
    "@prisma/adapter-pg": "^7.8.0",
    "@prisma/client": "^7.7.0",
    "@tanstack/react-query": "^5.96.2",
    "next": "16.2.3",
    "next-auth": "^5.0.0-beta.30",
    "next-themes": "^0.4.6",
    "pg": "^8.21.0",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/pg": "^8.20.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4.7.0",
    "dotenv": "^17.4.2",
    "eslint": "^9",
    "eslint-config-next": "16.2.3",
    "prisma": "^7.7.0",
    "tailwindcss": "^4",
    "tsx": "^4.21.0",
    "typescript": "^5",
    "vitest": "^1.6.1"
  }
}
```

- [ ] **Step 2: Buat config files**

`apps/saas/next.config.ts`:
```ts
import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  allowedDevOrigins: ["192.168.88.0/24"],
  transpilePackages: ["@3pb/kalkulator-core", "@3pb/ui"],
};

export default nextConfig;
```

`apps/saas/postcss.config.mjs`:
```js
const config = { plugins: ["@tailwindcss/postcss"] };
export default config;
```

`apps/saas/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/saas/vitest.config.ts`:
```ts
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

`apps/saas/next-env.d.ts`:
```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

`apps/saas/.gitignore`:
```
/node_modules
/.next/
/out/
next-env.d.ts
*.tsbuildinfo
.env
.env.local
.env.deploy
```

- [ ] **Step 3: Buat app shell**

`apps/saas/app/globals.css`:
```css
@import "tailwindcss";
@import "@3pb/ui/glass.css";
@custom-variant dark (&:is(.dark *));
html { font-family: var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { min-height: 100dvh; }
```

`apps/saas/app/providers.tsx`:
```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

`apps/saas/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Slizebiz — kalkulator harga jual produk 3D print",
  description: "Hitung biaya modal & harga jual produk 3D print-mu. Powered by 3D Printing Bandung.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning className={inter.variable}>
      <body className="bg-glass-page">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <Providers>{children}</Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

`apps/saas/app/page.tsx` (sementara — diganti Task 7):
```tsx
export default function Home() {
  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold g-t1">Slizebiz</h1>
    </main>
  );
}
```

- [ ] **Step 4: Tulis smoke test**

`apps/saas/lib/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultSettings } from "@3pb/kalkulator-core/../src/index"; // placeholder — see note

describe("smoke", () => {
  it("workspace linkage kalkulator-core", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Ganti isi test agar tidak meng-import path aneh — cukup:
```ts
import { describe, it, expect } from "vitest";
import { MARGIN_TIER_LABEL } from "@3pb/kalkulator-core";

describe("smoke", () => {
  it("dapat resolve @3pb/kalkulator-core", () => {
    expect(MARGIN_TIER_LABEL.B).toBe("Standard");
  });
});
```

- [ ] **Step 5: Install & jalankan test**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm install
pnpm --filter @3pb/saas test
```
Expected: `pnpm install` sukses (workspace mengenali `@3pb/saas`); test PASS (`MARGIN_TIER_LABEL.B === "Standard"`).

- [ ] **Step 6: Verifikasi build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas build
```
Expected: build sukses, menghasilkan `.next/standalone`. (Belum ada Prisma/DB, halaman statik — tidak butuh DATABASE_URL.)

- [ ] **Step 7: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas pnpm-lock.yaml
git commit -m "feat(saas): scaffold apps/saas — app shell, providers, build hijau"
```

---

### Task 2: Prisma schema + db client

**Files:**
- Create: `apps/saas/prisma/schema.prisma`, `apps/saas/prisma.config.ts`, `apps/saas/lib/db.ts`
- Test: (validasi via `prisma validate` + `prisma generate`, bukan unit test)

**Interfaces:**
- Produces: `prisma` (PrismaClient) dari `@/lib/db`; model `User`, `Account`, `Session`, `VerificationToken`, `Entitlement`, `Config`. `Entitlement` fields: `lifetimeOwned:boolean`, `subStatus:string` (`NONE|ACTIVE|EXPIRED`), `subExpiresAt:DateTime?`, `firstCloudMonthUsed:boolean`. `Config`: `key:string @id`, `value:string`.

- [ ] **Step 1: Tulis `apps/saas/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String       @id @default(cuid())
  name          String?
  email         String       @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  entitlement   Entitlement?
  createdAt     DateTime     @default(now())
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@unique([identifier, token])
}

model Entitlement {
  id                  String    @id @default(cuid())
  userId              String    @unique
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  lifetimeOwned       Boolean   @default(false)
  lifetimePurchasedAt DateTime?
  subStatus           String    @default("NONE")
  subStartedAt        DateTime?
  subExpiresAt        DateTime?
  firstCloudMonthUsed Boolean   @default(false)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
}

model Config {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Tulis `apps/saas/prisma.config.ts`**

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

- [ ] **Step 3: Tulis `apps/saas/lib/db.ts`** (mirror pola `apps/dashboard/lib/db.ts`)

```ts
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // Fallback mencegah crash saat import-time selama build; query runtime
  // akan fail-fast bila DATABASE_URL absen.
  const connectionString = process.env.DATABASE_URL ?? "postgresql://localhost/build_placeholder"
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter, log: ["error"] })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
```

- [ ] **Step 4: Validasi & generate**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis/apps/saas
pnpm exec prisma validate
pnpm exec prisma generate
```
Expected: `prisma validate` → "The schema is valid"; `prisma generate` → "Generated Prisma Client".

- [ ] **Step 5: Verifikasi build masih hijau**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas build
```
Expected: build sukses (prisma client ter-generate, `lib/db.ts` type-check lolos).

- [ ] **Step 6: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/prisma apps/saas/prisma.config.ts apps/saas/lib/db.ts
git commit -m "feat(saas): prisma schema (auth+entitlement+config) + db client"
```

---

### Task 3: Entitlement primitives (getEntitlement / capabilities / can / requirePlan)

**Files:**
- Create: `apps/saas/lib/entitlement.ts`
- Test: `apps/saas/lib/entitlement.test.ts`

**Interfaces:**
- Consumes: `prisma` dari `@/lib/db` (untuk `getEntitlement`).
- Produces:
  - `type Capability = 'paidCore' | 'cloud'`
  - `interface EntitlementLike { lifetimeOwned: boolean; subStatus: string }`
  - `capabilities(ent: EntitlementLike): { paidCore: boolean; cloud: boolean }`
  - `can(ent: EntitlementLike, cap: Capability): boolean`
  - `getEntitlement(userId: string): Promise<Entitlement>` (auto-create default bila absen)
  - `class PlanError extends Error { status = 403 }`
  - `requirePlan(ent: EntitlementLike, cap: Capability): void` (throw `PlanError` bila tak punya kapabilitas)

- [ ] **Step 1: Tulis failing test**

`apps/saas/lib/entitlement.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { capabilities, can, requirePlan, PlanError } from "@/lib/entitlement";

describe("capabilities", () => {
  it("Free (no lifetime, sub NONE) → tak ada kapabilitas", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "NONE" });
    expect(caps).toEqual({ paidCore: false, cloud: false });
  });

  it("lifetimeOwned → paidCore true, cloud false", () => {
    const caps = capabilities({ lifetimeOwned: true, subStatus: "NONE" });
    expect(caps).toEqual({ paidCore: true, cloud: false });
  });

  it("subStatus ACTIVE → paidCore & cloud true", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE" });
    expect(caps).toEqual({ paidCore: true, cloud: true });
  });

  it("subStatus EXPIRED → tak ada kapabilitas", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "EXPIRED" });
    expect(caps).toEqual({ paidCore: false, cloud: false });
  });
});

describe("can", () => {
  it("delegasi ke capabilities", () => {
    expect(can({ lifetimeOwned: true, subStatus: "NONE" }, "paidCore")).toBe(true);
    expect(can({ lifetimeOwned: true, subStatus: "NONE" }, "cloud")).toBe(false);
  });
});

describe("requirePlan", () => {
  it("lolos bila punya kapabilitas", () => {
    expect(() => requirePlan({ lifetimeOwned: false, subStatus: "ACTIVE" }, "cloud")).not.toThrow();
  });

  it("throw PlanError (status 403) bila tak punya", () => {
    try {
      requirePlan({ lifetimeOwned: false, subStatus: "NONE" }, "paidCore");
      throw new Error("seharusnya throw");
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as PlanError).status).toBe(403);
    }
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/entitlement.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/entitlement'`.

- [ ] **Step 3: Implementasi `apps/saas/lib/entitlement.ts`**

```ts
import { prisma } from "@/lib/db";
import type { Entitlement } from "@prisma/client";

export type Capability = "paidCore" | "cloud";

export interface EntitlementLike {
  lifetimeOwned: boolean;
  subStatus: string; // NONE | ACTIVE | EXPIRED
}

/** Kapabilitas turunan dari entitlement komposit (spec §6). */
export function capabilities(ent: EntitlementLike): { paidCore: boolean; cloud: boolean } {
  const active = ent.subStatus === "ACTIVE";
  return {
    paidCore: ent.lifetimeOwned || active,
    cloud: active,
  };
}

export function can(ent: EntitlementLike, cap: Capability): boolean {
  return capabilities(ent)[cap];
}

export class PlanError extends Error {
  status = 403;
  constructor(cap: Capability) {
    super(`Kapabilitas '${cap}' dibutuhkan`);
    this.name = "PlanError";
  }
}

/** Guard server untuk API berbayar (belum dipakai di 1a-1; siap 1b/1c). */
export function requirePlan(ent: EntitlementLike, cap: Capability): void {
  if (!can(ent, cap)) throw new PlanError(cap);
}

/** Ambil entitlement user; auto-create baris default aman bila belum ada. */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const existing = await prisma.entitlement.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.entitlement.create({ data: { userId } });
}
```

- [ ] **Step 4: Jalankan test — pastikan lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/entitlement.test.ts
```
Expected: PASS (semua case capabilities/can/requirePlan).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/entitlement.ts apps/saas/lib/entitlement.test.ts
git commit -m "feat(saas): primitif entitlement — capabilities/can/requirePlan (TDD)"
```

---

### Task 4: Owner allowlist + Auth magic-link (NextAuth v5 + Resend)

**Files:**
- Create: `apps/saas/lib/owner.ts`, `apps/saas/lib/owner.test.ts`, `apps/saas/lib/auth.ts`
- Create: `apps/saas/app/api/auth/[...nextauth]/route.ts`
- Create: `apps/saas/app/login/page.tsx`, `apps/saas/app/login/verify/page.tsx`

**Interfaces:**
- Consumes: `prisma` (`@/lib/db`).
- Produces:
  - `isOwner(email: string | null | undefined): boolean` (dari env `OWNER_EMAILS`, comma-separated, case-insensitive trim).
  - `auth`, `handlers`, `signIn`, `signOut` dari `@/lib/auth` (NextAuth v5, sesi database, Resend magic-link). Event `createUser` membuat `Entitlement` default.

- [ ] **Step 1: Tulis failing test owner**

`apps/saas/lib/owner.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isOwner } from "@/lib/owner";

describe("isOwner", () => {
  const orig = process.env.OWNER_EMAILS;
  beforeEach(() => { process.env.OWNER_EMAILS = "Owner@Slizebiz.com, admin@slizebiz.com"; });
  afterEach(() => { process.env.OWNER_EMAILS = orig; });

  it("cocok case-insensitive + trim", () => {
    expect(isOwner("owner@slizebiz.com")).toBe(true);
    expect(isOwner("ADMIN@SLIZEBIZ.COM")).toBe(true);
  });
  it("tolak email bukan owner", () => {
    expect(isOwner("user@gmail.com")).toBe(false);
  });
  it("tolak null/undefined/empty", () => {
    expect(isOwner(null)).toBe(false);
    expect(isOwner(undefined)).toBe(false);
    expect(isOwner("")).toBe(false);
  });
  it("OWNER_EMAILS kosong → tak ada owner", () => {
    process.env.OWNER_EMAILS = "";
    expect(isOwner("owner@slizebiz.com")).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/owner.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/owner'`.

- [ ] **Step 3: Implementasi `apps/saas/lib/owner.ts`**

```ts
/** Allowlist owner untuk /admin — dari env OWNER_EMAILS (comma-separated). */
export function isOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.OWNER_EMAILS ?? "";
  const list = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
```

- [ ] **Step 4: Jalankan test — pastikan lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/owner.test.ts
```
Expected: PASS.

- [ ] **Step 5: Implementasi `apps/saas/lib/auth.ts`**

```ts
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
    }),
  ],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/verify",
  },
  events: {
    // Auto-create entitlement default aman saat user pertama dibuat (spec §5/§6).
    async createUser({ user }) {
      if (user.id) {
        await prisma.entitlement.create({ data: { userId: user.id } }).catch(() => {});
      }
    },
  },
});
```

- [ ] **Step 6: Route handler NextAuth**

`apps/saas/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 7: Halaman login (magic-link) + verify**

`apps/saas/app/login/page.tsx`:
```tsx
import { signIn } from "@/lib/auth";
import { GlassButton, GlassInput } from "@3pb/ui";

export default function LoginPage() {
  async function sendLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;
    await signIn("resend", { email, redirectTo: "/" });
  }
  return (
    <main className="max-w-sm mx-auto p-6 mt-16">
      <h1 className="text-lg font-semibold g-t1 mb-1">Masuk Slizebiz</h1>
      <p className="text-[12px] g-t4 mb-4">Tanpa password — kami kirim link masuk via email.</p>
      <form action={sendLink} className="flex flex-col gap-3">
        <GlassInput type="email" name="email" placeholder="email@kamu.com" required />
        <GlassButton type="submit">Kirim link masuk</GlassButton>
      </form>
    </main>
  );
}
```

`apps/saas/app/login/verify/page.tsx`:
```tsx
export default function VerifyPage() {
  return (
    <main className="max-w-sm mx-auto p-6 mt-16 text-center">
      <h1 className="text-lg font-semibold g-t1 mb-2">Cek email kamu</h1>
      <p className="text-[13px] g-t4">Kami sudah mengirim link masuk. Buka email dan klik link-nya untuk melanjutkan.</p>
    </main>
  );
}
```

- [ ] **Step 8: Verifikasi build & test (DATABASE_URL placeholder)**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test
pnpm --filter @3pb/saas build
```
Expected: test PASS (owner + entitlement + smoke); build sukses. Auth route ter-compile; tidak butuh koneksi DB saat build (fallback di `db.ts`).

- [ ] **Step 9: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/owner.ts apps/saas/lib/owner.test.ts apps/saas/lib/auth.ts apps/saas/app/api/auth apps/saas/app/login
git commit -m "feat(saas): owner allowlist + magic-link auth (Resend + Prisma adapter, sesi DB)"
```

---

### Task 5: Config module (harga & copy, key-value + default)

**Files:**
- Create: `apps/saas/lib/config.ts`
- Test: `apps/saas/lib/config.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/db`).
- Produces:
  - `DEFAULT_CONFIG: Record<string, string>` — default konstanta (fallback bila key absen di DB). Keys: `price.beli`, `price.sub.owner`, `price.sub.standalone`, `copy.hero.headline`, `feature.pos.status`.
  - `getConfig(key: string): Promise<string>` — nilai DB atau default (atau "" bila tak ada default).
  - `getAllConfig(): Promise<Record<string, string>>` — merge default ⊕ DB.
  - `setConfig(key: string, value: string): Promise<void>` — upsert.
  - `parsePrice(value: string): number | null` — parse harga; non-numerik → null.

- [ ] **Step 1: Tulis failing test**

`apps/saas/lib/config.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    config: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { getConfig, getAllConfig, setConfig, parsePrice, DEFAULT_CONFIG } from "@/lib/config";

describe("parsePrice", () => {
  it("angka valid", () => { expect(parsePrice("150000")).toBe(150000); });
  it("dengan spasi", () => { expect(parsePrice(" 150000 ")).toBe(150000); });
  it("non-numerik → null", () => { expect(parsePrice("gratis")).toBeNull(); });
  it("kosong → null", () => { expect(parsePrice("")).toBeNull(); });
});

describe("getConfig", () => {
  beforeEach(() => vi.clearAllMocks());
  it("pakai nilai DB bila ada", async () => {
    (prisma.config.findUnique as any).mockResolvedValue({ key: "price.beli", value: "199000" });
    expect(await getConfig("price.beli")).toBe("199000");
  });
  it("fallback ke DEFAULT_CONFIG bila absen", async () => {
    (prisma.config.findUnique as any).mockResolvedValue(null);
    expect(await getConfig("copy.hero.headline")).toBe(DEFAULT_CONFIG["copy.hero.headline"]);
  });
  it("key tak dikenal & absen → string kosong", async () => {
    (prisma.config.findUnique as any).mockResolvedValue(null);
    expect(await getConfig("tak.ada")).toBe("");
  });
});

describe("getAllConfig", () => {
  beforeEach(() => vi.clearAllMocks());
  it("merge default ⊕ DB (DB menang)", async () => {
    (prisma.config.findMany as any).mockResolvedValue([{ key: "price.beli", value: "199000" }]);
    const all = await getAllConfig();
    expect(all["price.beli"]).toBe("199000");
    expect(all["copy.hero.headline"]).toBe(DEFAULT_CONFIG["copy.hero.headline"]);
  });
});

describe("setConfig", () => {
  beforeEach(() => vi.clearAllMocks());
  it("upsert key/value", async () => {
    await setConfig("price.beli", "250000");
    expect(prisma.config.upsert).toHaveBeenCalledWith({
      where: { key: "price.beli" },
      create: { key: "price.beli", value: "250000" },
      update: { value: "250000" },
    });
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/config.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/config'`.

- [ ] **Step 3: Implementasi `apps/saas/lib/config.ts`**

```ts
import { prisma } from "@/lib/db";

/** Default konstanta — dipakai bila key absen di DB (landing/teaser/modal tetap render). */
export const DEFAULT_CONFIG: Record<string, string> = {
  "price.beli": "",              // TBA (angka pricing ditunda — funnel §3.7)
  "price.sub.owner": "",
  "price.sub.standalone": "",
  "copy.hero.headline": "Hitung harga jual produk 3D print-mu dalam hitungan detik",
  "feature.pos.status": "segera-hadir",
};

/** Parse harga; kembalikan null bila non-numerik/kosong (biar caller fallback). */
export function parsePrice(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export async function getConfig(key: string): Promise<string> {
  const row = await prisma.config.findUnique({ where: { key } });
  if (row) return row.value;
  return DEFAULT_CONFIG[key] ?? "";
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const rows = await prisma.config.findMany();
  const merged: Record<string, string> = { ...DEFAULT_CONFIG };
  for (const r of rows) merged[r.key] = r.value;
  return merged;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
```

- [ ] **Step 4: Jalankan test — pastikan lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/config.test.ts
```
Expected: PASS (semua case parsePrice/getConfig/getAllConfig/setConfig).

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/config.ts apps/saas/lib/config.test.ts
git commit -m "feat(saas): Config module — getConfig/getAllConfig/setConfig + default (TDD)"
```

---

### Task 6: Kalkulator compute layer (default-settings + fullView, parity core)

**Files:**
- Create: `apps/saas/lib/kalkulator/default-settings.ts`, `apps/saas/lib/kalkulator/compute.ts`
- Test: `apps/saas/lib/kalkulator/compute.test.ts`

**Interfaces:**
- Consumes: `hitungKalkulasiV2`, tipe `SettingsV2`/`KalkulasiInputV2`/`HasilKalkulasiV2`/`MarginTier` dari `@3pb/kalkulator-core`.
- Produces:
  - `defaultSettings: SettingsV2`, `DEFAULT_MATERIAL`, `DEFAULT_MESIN_PER_JAM` (identik nilai landing).
  - `interface CalcInput { gramasi: number; durasiJam: number; tipe: "FDM" | "SLA"; hargaAktual?: { channelId: string; harga: number } }`
  - `buildInputV2(c: CalcInput): KalkulasiInputV2`
  - `compute(c: CalcInput): HasilKalkulasiV2`
  - `interface FullView { biayaModal: number; hargaJualMinimum: number; rekomendasi: number; channels: { channelId: string; nama: string; A: number; B: number; C: number; margin: number }[]; status: HasilKalkulasiV2["status"]; }`
  - `fullView(c: CalcInput): FullView` — semua angka dibulatkan (`Math.round`), channel nama dari `defaultSettings.channels`.

- [ ] **Step 1: Tulis failing test (parity + format)**

`apps/saas/lib/kalkulator/compute.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hitungKalkulasiV2 } from "@3pb/kalkulator-core";
import { buildInputV2, compute, fullView, defaultSettings } from "@/lib/kalkulator/compute";

const sample = { gramasi: 50, durasiJam: 3, tipe: "FDM" as const };

describe("compute parity", () => {
  it("compute == hitungKalkulasiV2(buildInputV2, defaultSettings)", () => {
    const direct = hitungKalkulasiV2(buildInputV2(sample), defaultSettings);
    expect(compute(sample)).toEqual(direct);
  });
});

describe("fullView", () => {
  it("biayaModal = round(hppTotal), hargaJualMinimum = round(floorPrice)", () => {
    const h = compute(sample);
    const v = fullView(sample);
    expect(v.biayaModal).toBe(Math.round(h.hppTotal));
    expect(v.hargaJualMinimum).toBe(Math.round(h.floorPrice));
  });
  it("rekomendasi = round(offline.B)", () => {
    const h = compute(sample);
    const off = h.hargaPerChannel.find((c) => c.channelId === "offline")!;
    expect(fullView(sample).rekomendasi).toBe(Math.round(off.B));
  });
  it("channels: offline + shopee dengan nama dari settings", () => {
    const v = fullView(sample);
    expect(v.channels.map((c) => c.channelId)).toEqual(["offline", "shopee"]);
    expect(v.channels[0].nama).toBe("Offline");
    expect(v.channels[1].nama).toBe("Shopee");
  });
  it("angka channel dibulatkan", () => {
    const v = fullView(sample);
    for (const c of v.channels) {
      expect(Number.isInteger(c.A)).toBe(true);
      expect(Number.isInteger(c.B)).toBe(true);
      expect(Number.isInteger(c.C)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/kalkulator/compute.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/kalkulator/compute'`.

- [ ] **Step 3: Buat `apps/saas/lib/kalkulator/default-settings.ts`**

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

- [ ] **Step 4: Implementasi `apps/saas/lib/kalkulator/compute.ts`**

```ts
import {
  hitungKalkulasiV2,
  type KalkulasiInputV2,
  type HasilKalkulasiV2,
} from "@3pb/kalkulator-core";
import { defaultSettings, DEFAULT_MATERIAL, DEFAULT_MESIN_PER_JAM } from "./default-settings";

export { defaultSettings };

export interface CalcInput {
  gramasi: number;
  durasiJam: number;
  tipe: "FDM" | "SLA";
  hargaAktual?: { channelId: string; harga: number };
}

export function buildInputV2(c: CalcInput): KalkulasiInputV2 {
  const m = DEFAULT_MATERIAL[c.tipe];
  return {
    plates: [{
      durasiJam: c.durasiJam,
      mesinPerJam: DEFAULT_MESIN_PER_JAM,
      mesinPerJamJual: DEFAULT_MESIN_PER_JAM,
      materials: [{
        gramasi: c.gramasi,
        hppPerGram: m.hppPerGram,
        jualPerGram: m.jualPerGram,
        failureRatePct: m.failureRatePct,
      }],
    }],
    batch: 1,
    komponen: [],
    labor: [],
    ...(c.hargaAktual ? { hargaAktual: c.hargaAktual } : {}),
  };
}

export function compute(c: CalcInput): HasilKalkulasiV2 {
  return hitungKalkulasiV2(buildInputV2(c), defaultSettings);
}

export interface FullView {
  biayaModal: number;
  hargaJualMinimum: number;
  rekomendasi: number;
  channels: { channelId: string; nama: string; A: number; B: number; C: number; margin: number }[];
  status: HasilKalkulasiV2["status"];
}

export function fullView(c: CalcInput): FullView {
  const h = compute(c);
  const r = Math.round;
  const namaOf = (id: string) => defaultSettings.channels.find((ch) => ch.id === id)?.nama ?? id;
  const off = h.hargaPerChannel.find((ch) => ch.channelId === "offline")!;
  return {
    biayaModal: r(h.hppTotal),
    hargaJualMinimum: r(h.floorPrice),
    rekomendasi: r(off.B),
    channels: h.hargaPerChannel.map((ch) => ({
      channelId: ch.channelId,
      nama: namaOf(ch.channelId),
      A: r(ch.A),
      B: r(ch.B),
      C: r(ch.C),
      margin: r(ch.margin),
    })),
    status: h.status,
  };
}
```

- [ ] **Step 5: Jalankan test — pastikan lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/kalkulator/compute.test.ts
```
Expected: PASS (parity + format).

- [ ] **Step 6: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/kalkulator
git commit -m "feat(saas): kalkulator compute layer — defaultSettings + fullView (parity core, TDD)"
```

---

### Task 7: Kalkulator UI Free — page, gating, UpgradeModal, entitlement hook + API

**Files:**
- Create: `apps/saas/app/api/entitlement/route.ts`
- Create: `apps/saas/lib/hooks/use-entitlement.ts`
- Create: `apps/saas/components/Calculator.tsx`, `apps/saas/components/LockedBlock.tsx`, `apps/saas/components/UpgradeModal.tsx`
- Modify: `apps/saas/app/page.tsx` (render Calculator + sesi)
- Modify: `apps/saas/app/globals.css` (tambah util `.locked-blur`, `.modal-surface`)
- Test: `apps/saas/components/calculator.test.tsx`

**Interfaces:**
- Consumes: `fullView`/`CalcInput` (`@/lib/kalkulator/compute`), `MARGIN_TIER_LABEL` (`@3pb/kalkulator-core`), `auth` (`@/lib/auth`), `getEntitlement`/`capabilities` (`@/lib/entitlement`), `GlassInput`/`GlassButton`/`GlassCard` (`@3pb/ui`).
- Produces:
  - API `GET /api/entitlement` → `{ authenticated: boolean; lifetimeOwned: boolean; subActive: boolean; can: { paidCore: boolean; cloud: boolean } }`.
  - `useEntitlement()` → objek sama (TanStack Query, key `["entitlement"]`).
  - `<Calculator authenticated={boolean} />` — form + hasil; blok margin/status/channel ter-blur bila `!authenticated`.

- [ ] **Step 1: API entitlement**

`apps/saas/app/api/entitlement/route.ts`:
```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement, capabilities } from "@/lib/entitlement";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({
      authenticated: false,
      lifetimeOwned: false,
      subActive: false,
      can: { paidCore: false, cloud: false },
    });
  }
  const ent = await getEntitlement(userId);
  return NextResponse.json({
    authenticated: true,
    lifetimeOwned: ent.lifetimeOwned,
    subActive: ent.subStatus === "ACTIVE",
    can: capabilities(ent),
  });
}
```

> Catatan: `session.user.id` tersedia dengan sesi database NextAuth v5 (adapter mengisi `user.id`). Tidak perlu callback tambahan.

- [ ] **Step 2: Hook useEntitlement**

`apps/saas/lib/hooks/use-entitlement.ts`:
```ts
"use client";
import { useQuery } from "@tanstack/react-query";

export interface EntitlementView {
  authenticated: boolean;
  lifetimeOwned: boolean;
  subActive: boolean;
  can: { paidCore: boolean; cloud: boolean };
}

const ANON: EntitlementView = {
  authenticated: false, lifetimeOwned: false, subActive: false,
  can: { paidCore: false, cloud: false },
};

export function useEntitlement() {
  return useQuery<EntitlementView>({
    queryKey: ["entitlement"],
    queryFn: async () => {
      const res = await fetch("/api/entitlement");
      if (!res.ok) return ANON;
      return res.json();
    },
    initialData: ANON,
  });
}
```

- [ ] **Step 3: CSS util untuk blur + modal**

Tambah ke `apps/saas/app/globals.css`:
```css
.locked-blur { filter: blur(5px); pointer-events: none; user-select: none; }
.modal-surface { background: #ffffff; border: 1px solid rgba(0,0,0,0.12); box-shadow: 0 24px 70px rgba(0,0,0,0.35); }
.dark .modal-surface { background: #14142c; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 24px 70px rgba(0,0,0,0.7); }
```

- [ ] **Step 4: LockedBlock + UpgradeModal**

`apps/saas/components/LockedBlock.tsx`:
```tsx
"use client";
import type { ReactNode } from "react";

export function LockedBlock({ locked, children }: { locked: boolean; children: ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative">
      <div className="locked-blur">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
        <div>
          <p className="text-[12px] g-t2 mb-2">Banding margin Kompetitif/Standard/Premium, cek untung/rugi vs harga pasar & harga per channel</p>
          <a href="/login" className="g-btn-primary rounded-[10px] px-4 h-9 inline-flex items-center text-sm font-medium">Login gratis untuk buka</a>
          <p className="text-[11px] g-t4 mt-1">tanpa password · link masuk via email</p>
        </div>
      </div>
    </div>
  );
}
```

`apps/saas/components/UpgradeModal.tsx`:
```tsx
"use client";
export function UpgradeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div className="modal-surface rounded-[16px] p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold g-t1 mb-1">Fitur Beli — segera hadir</div>
        <p className="text-[12px] g-t4 mb-3">Simpan hasil, multi-plate, labor & settings custom, master harga akan tersedia di paket Beli. Kami umumkan saat rilis.</p>
        <button className="g-btn-ghost rounded-[10px] px-4 h-9 text-sm w-full" onClick={onClose}>Tutup</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Calculator component**

`apps/saas/components/Calculator.tsx`:
```tsx
"use client";
import { useState } from "react";
import { MARGIN_TIER_LABEL, type MarginTier } from "@3pb/kalkulator-core";
import { fullView } from "@/lib/kalkulator/compute";
import { GlassCard, GlassInput } from "@3pb/ui";
import { LockedBlock } from "./LockedBlock";
import { UpgradeModal } from "./UpgradeModal";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
const TIERS: MarginTier[] = ["A", "B", "C"];

export function Calculator({ authenticated }: { authenticated: boolean }) {
  const [gramasi, setGramasi] = useState("50");
  const [durasi, setDurasi] = useState("3");
  const [tipe, setTipe] = useState<"FDM" | "SLA">("FDM");
  const [showUpgrade, setShowUpgrade] = useState(false);

  const g = Number(gramasi);
  const d = Number(durasi);
  const valid = Number.isFinite(g) && g > 0 && Number.isFinite(d) && d > 0;
  const view = valid ? fullView({ gramasi: g, durasiJam: d, tipe }) : null;

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-xl font-semibold g-t1 mb-4">Kalkulator harga jual</h1>
      <div className="grid md:grid-cols-2 gap-5">
        {/* Input */}
        <GlassCard className="p-4 flex flex-col gap-3">
          <label className="text-[12px] g-t3">Berat (gram)
            <GlassInput type="number" inputMode="decimal" value={gramasi}
              onChange={(e) => setGramasi(e.target.value)} className="w-full mt-1" />
          </label>
          <label className="text-[12px] g-t3">Durasi print (jam)
            <GlassInput type="number" inputMode="decimal" value={durasi}
              onChange={(e) => setDurasi(e.target.value)} className="w-full mt-1" />
          </label>
          <label className="text-[12px] g-t3">Jenis filament
            <select value={tipe} onChange={(e) => setTipe(e.target.value as "FDM" | "SLA")}
              className="glass-input rounded-[10px] px-3 h-10 text-sm w-full mt-1">
              <option value="FDM">FDM (PLA/PETG)</option>
              <option value="SLA">SLA (Resin)</option>
            </select>
          </label>
          <p className="text-[11px] g-t4">Printer: Default (Bambu P1P) · Printer & material custom di Beli 🔒</p>
        </GlassCard>

        {/* Hasil */}
        <GlassCard className="p-4">
          {!view ? (
            <p className="text-[12px] g-t4">Isi berat & durasi (angka &gt; 0) untuk lihat hasil.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <div className="text-[12px] g-t4">Biaya modal</div>
                <div className="text-lg font-semibold g-t1">{rupiah(view.biayaModal)}</div>
              </div>
              <div>
                <div className="text-[12px] g-t4">Harga jual minimum</div>
                <div className="text-base g-t2">{rupiah(view.hargaJualMinimum)}</div>
              </div>
              <div>
                <div className="text-[12px] g-t4">Rekomendasi harga jual · margin {MARGIN_TIER_LABEL.B}</div>
                <div className="text-2xl font-bold" style={{ color: "var(--g-accent)" }}>{rupiah(view.rekomendasi)}</div>
              </div>

              <LockedBlock locked={!authenticated}>
                <div className="flex flex-col gap-2 pt-2 border-t border-[color:var(--g-border)]">
                  <div className="text-[12px] g-t3 font-medium">Banding margin & channel</div>
                  {view.channels.map((ch) => (
                    <div key={ch.channelId} className="text-[12px] g-t2">
                      <div className="g-t4">{ch.nama}</div>
                      <div className="flex gap-3">
                        {TIERS.map((t) => (
                          <span key={t}>{MARGIN_TIER_LABEL[t]}: {rupiah(ch[t])}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="text-[11px] g-t4">Status: {view.status}</div>
                </div>
              </LockedBlock>

              <button className="text-[11px] g-t4 text-left underline" onClick={() => setShowUpgrade(true)}>
                Simpan hasil, multi-plate, labor & settings custom → Beli 🔒
              </button>
            </div>
          )}
        </GlassCard>
      </div>
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </main>
  );
}
```

- [ ] **Step 6: Wire page.tsx ke sesi**

`apps/saas/app/page.tsx`:
```tsx
import { auth } from "@/lib/auth";
import { Calculator } from "@/components/Calculator";

export default async function Home() {
  const session = await auth();
  return <Calculator authenticated={!!session?.user} />;
}
```

- [ ] **Step 7: Tulis test komponen (render + gating)**

`apps/saas/components/calculator.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Calculator } from "@/components/Calculator";

describe("Calculator", () => {
  it("anonim → blok banding ter-blur (locked-blur hadir) + CTA login", () => {
    const { container } = render(<Calculator authenticated={false} />);
    expect(container.querySelector(".locked-blur")).not.toBeNull();
    expect(screen.getByText(/Login gratis untuk buka/i)).toBeTruthy();
  });
  it("login → tak ada blur", () => {
    const { container } = render(<Calculator authenticated={true} />);
    expect(container.querySelector(".locked-blur")).toBeNull();
  });
  it("menampilkan label margin Standard untuk rekomendasi", () => {
    render(<Calculator authenticated={true} />);
    expect(screen.getByText(/margin Standard/i)).toBeTruthy();
  });
});
```

Tambah dev deps test DOM ke `apps/saas/package.json` (devDependencies): `"@testing-library/react": "^16.1.0"`, `"@testing-library/dom": "^10.4.0"`, `"jsdom": "^25.0.1"`. Set environment jsdom untuk file test komponen via komentar pragma di atas file test:
```tsx
// @vitest-environment jsdom
```
(Tambahkan baris pragma sebagai baris PERTAMA `calculator.test.tsx`.)

- [ ] **Step 8: Install dev deps & jalankan test**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm install
pnpm --filter @3pb/saas test
```
Expected: `pnpm install` menambah testing-library/jsdom; semua test PASS (compute, entitlement, owner, config, calculator).

- [ ] **Step 9: Verifikasi build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas build
```
Expected: build sukses (page async server component + client Calculator).

- [ ] **Step 10: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/app apps/saas/components apps/saas/lib/hooks apps/saas/package.json pnpm-lock.yaml
git commit -m "feat(saas): kalkulator UI Free — gating login-reveal, UpgradeModal, entitlement hook+API"
```

---

### Task 8: Admin-mini — waitlist dari Cloudflare D1 + Config editor (owner-only)

**Files:**
- Create: `apps/saas/lib/waitlist/cloudflare.ts`, `apps/saas/lib/waitlist/cloudflare.test.ts`
- Create: `apps/saas/app/api/admin/config/route.ts`, `apps/saas/app/api/admin/waitlist/route.ts`
- Create: `apps/saas/app/admin/page.tsx`, `apps/saas/components/admin/ConfigEditor.tsx`, `apps/saas/components/admin/WaitlistTable.tsx`

**Interfaces:**
- Consumes: `auth` (`@/lib/auth`), `isOwner` (`@/lib/owner`), `getAllConfig`/`setConfig` (`@/lib/config`).
- Produces:
  - `interface WaitlistRow { id: string; email: string; interest: string; created_at: string }`
  - `fetchWaitlist(): Promise<WaitlistRow[]>` — query D1 via CF API (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, DB_ID konstan). Melempar `Error` bila token absen/response gagal.
  - `toCSV(rows: WaitlistRow[]): string`
  - API `GET/PUT /api/admin/config`, `GET /api/admin/waitlist` — 403 non-owner.

- [ ] **Step 1: Tulis failing test cloudflare helper**

`apps/saas/lib/waitlist/cloudflare.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWaitlist, toCSV, type WaitlistRow } from "@/lib/waitlist/cloudflare";

const rows: WaitlistRow[] = [
  { id: "1", email: "a@x.com", interest: "beli", created_at: "2026-07-18T00:00:00Z" },
  { id: "2", email: "b@x.com", interest: "subscribe", created_at: "2026-07-18T01:00:00Z" },
];

describe("toCSV", () => {
  it("header + baris", () => {
    const csv = toCSV(rows);
    expect(csv.split("\n")[0]).toBe("id,email,interest,created_at");
    expect(csv).toContain("a@x.com");
  });
  it("escape koma/kutip di field", () => {
    const csv = toCSV([{ id: "1", email: 'x,"y"@z.com', interest: "beli", created_at: "t" }]);
    expect(csv).toContain('"x,""y""@z.com"');
  });
});

describe("fetchWaitlist", () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
    process.env.CLOUDFLARE_API_TOKEN = "tok";
  });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); });

  it("token absen → throw", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    await expect(fetchWaitlist()).rejects.toThrow(/token/i);
  });

  it("panggil CF API & kembalikan rows", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: [{ results: rows }] }),
    } as Response);
    const out = await fetchWaitlist();
    expect(out).toEqual(rows);
    const url = (spy.mock.calls[0][0] as string);
    expect(url).toContain("/accounts/acct/d1/database/fc76ff99-d167-4570-a8ae-58923ab31e4d/query");
  });

  it("response gagal → throw", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);
    await expect(fetchWaitlist()).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Jalankan test — pastikan gagal**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/waitlist/cloudflare.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/waitlist/cloudflare'`.

- [ ] **Step 3: Implementasi `apps/saas/lib/waitlist/cloudflare.ts`**

```ts
const D1_DATABASE_ID = "fc76ff99-d167-4570-a8ae-58923ab31e4d"; // slizebiz-waitlist (landing)

export interface WaitlistRow {
  id: string;
  email: string;
  interest: string;
  created_at: string;
}

/** Baca waitlist read-only dari Cloudflare D1 milik landing (spec amandemen #2). */
export async function fetchWaitlist(): Promise<WaitlistRow[]> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID tidak diset");
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN tidak diset");

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sql: "SELECT id, email, interest, created_at FROM waitlist ORDER BY created_at DESC",
    }),
  });
  if (!res.ok) throw new Error(`Cloudflare D1 query gagal: HTTP ${res.status}`);
  const data = (await res.json()) as { success?: boolean; result?: { results?: WaitlistRow[] }[] };
  if (!data.success) throw new Error("Cloudflare D1 query tidak sukses");
  return data.result?.[0]?.results ?? [];
}

function csvField(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCSV(rows: WaitlistRow[]): string {
  const header = "id,email,interest,created_at";
  const lines = rows.map((r) => [r.id, r.email, r.interest, r.created_at].map(csvField).join(","));
  return [header, ...lines].join("\n");
}
```

- [ ] **Step 4: Jalankan test — pastikan lolos**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test lib/waitlist/cloudflare.test.ts
```
Expected: PASS (toCSV + fetchWaitlist happy/error paths).

- [ ] **Step 5: API admin (owner-guarded)**

`apps/saas/app/api/admin/config/route.ts`:
```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { getAllConfig, setConfig } from "@/lib/config";

export async function GET() {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await getAllConfig());
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json()) as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    await setConfig(key, String(value));
  }
  return NextResponse.json(await getAllConfig());
}
```

`apps/saas/app/api/admin/waitlist/route.ts`:
```ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { fetchWaitlist } from "@/lib/waitlist/cloudflare";

export async function GET() {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    const rows = await fetchWaitlist();
    return NextResponse.json({ rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, rows: [] }, { status: 502 });
  }
}
```

- [ ] **Step 6: Halaman /admin (server guard) + komponen**

`apps/saas/app/admin/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { getAllConfig } from "@/lib/config";
import { fetchWaitlist, type WaitlistRow } from "@/lib/waitlist/cloudflare";
import { ConfigEditor } from "@/components/admin/ConfigEditor";
import { WaitlistTable } from "@/components/admin/WaitlistTable";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!isOwner(session?.user?.email)) redirect("/");

  const config = await getAllConfig();
  let rows: WaitlistRow[] = [];
  let waitlistError: string | null = null;
  try {
    rows = await fetchWaitlist();
  } catch (e) {
    waitlistError = (e as Error).message;
  }

  return (
    <main className="max-w-3xl mx-auto p-6 flex flex-col gap-6">
      <h1 className="text-xl font-semibold g-t1">Admin Slizebiz</h1>
      <section>
        <h2 className="text-sm font-medium g-t2 mb-2">Harga & copy (Config)</h2>
        <ConfigEditor initial={config} />
      </section>
      <section>
        <h2 className="text-sm font-medium g-t2 mb-2">Waitlist ({rows.length})</h2>
        {waitlistError
          ? <p className="text-[12px]" style={{ color: "var(--g-danger)" }}>Gagal baca waitlist: {waitlistError}</p>
          : <WaitlistTable rows={rows} />}
      </section>
    </main>
  );
}
```

`apps/saas/components/admin/ConfigEditor.tsx`:
```tsx
"use client";
import { useState } from "react";
import { GlassButton, GlassInput } from "@3pb/ui";

export function ConfigEditor({ initial }: { initial: Record<string, string> }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setSaving(true); setMsg("");
    const res = await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaving(false);
    setMsg(res.ok ? "Tersimpan." : "Gagal menyimpan.");
  }

  return (
    <div className="flex flex-col gap-2">
      {Object.keys(values).sort().map((key) => (
        <label key={key} className="text-[12px] g-t3 flex flex-col">
          {key}
          <GlassInput value={values[key]} onChange={(e) => setValues({ ...values, [key]: e.target.value })} className="w-full mt-1" />
        </label>
      ))}
      <div className="flex items-center gap-3 mt-1">
        <GlassButton onClick={save} disabled={saving}>{saving ? "Menyimpan…" : "Simpan"}</GlassButton>
        {msg && <span className="text-[12px] g-t4">{msg}</span>}
      </div>
    </div>
  );
}
```

`apps/saas/components/admin/WaitlistTable.tsx`:
```tsx
"use client";
import { toCSV, type WaitlistRow } from "@/lib/waitlist/cloudflare";

export function WaitlistTable({ rows }: { rows: WaitlistRow[] }) {
  function exportCsv() {
    const blob = new Blob([toCSV(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "waitlist.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  if (rows.length === 0) return <p className="text-[12px] g-t4">Belum ada waitlist.</p>;
  return (
    <div className="flex flex-col gap-2">
      <button className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px] self-start" onClick={exportCsv}>Ekspor CSV</button>
      <div className="overflow-x-auto">
        <table className="text-[12px] g-t2 w-full">
          <thead><tr className="g-t4 text-left"><th className="pr-4">Email</th><th className="pr-4">Minat</th><th>Tanggal</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td className="pr-4">{r.email}</td><td className="pr-4">{r.interest}</td><td>{r.created_at}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Jalankan seluruh test + build**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm --filter @3pb/saas test
pnpm --filter @3pb/saas build
```
Expected: semua test PASS; build sukses (halaman admin `force-dynamic`).

- [ ] **Step 8: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/lib/waitlist apps/saas/app/api/admin apps/saas/app/admin apps/saas/components/admin
git commit -m "feat(saas): admin-mini — Config editor + waitlist dari Cloudflare D1 (owner-only, TDD)"
```

---

### Task 9: Deploy homelab — Dockerfile, entrypoint, deploy.sh, env example

**Files:**
- Create: `apps/saas/Dockerfile`, `apps/saas/docker-entrypoint.sh`, `apps/saas/deploy.sh`, `apps/saas/.env.deploy.example`
- Modify: `apps/saas/.gitignore` (pastikan `.env.deploy` di-ignore — sudah dari Task 1)

**Interfaces:**
- Produces: image `slizebiz:latest` + skrip deploy ke Docker host homelab (container `slizebiz`, port 3200). **Tidak dijalankan** dalam task ini (deploy = GATED, butuh izin user & env produksi).

- [ ] **Step 1: `apps/saas/Dockerfile`** (pola `apps/dashboard/Dockerfile`, filter `@3pb/saas`)

```dockerfile
# ── Stage 1: Build (monorepo, pnpm via corepack) ─────────────────────────────
FROM node:22-alpine AS builder
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline

RUN pnpm --filter @3pb/saas exec prisma generate
RUN pnpm --filter @3pb/saas build

# ── Stage 2: Production runtime ──────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /repo/apps/saas/.next/standalone ./
COPY --from=builder /repo/apps/saas/.next/static ./apps/saas/.next/static
COPY --from=builder /repo/apps/saas/public ./apps/saas/public

COPY --from=builder /repo/apps/saas/prisma ./apps/saas/prisma
COPY --from=builder /repo/apps/saas/prisma.config.ts ./apps/saas/prisma.config.ts

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/saas/node_modules ./apps/saas/node_modules

COPY --from=builder /repo/apps/saas/docker-entrypoint.sh ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENTRYPOINT ["./docker-entrypoint.sh"]
```

> Catatan: `public/` mungkin belum ada. Buat placeholder `apps/saas/public/.gitkeep` agar `COPY` tidak gagal.

- [ ] **Step 2: Buat `apps/saas/public/.gitkeep`** (file kosong)

- [ ] **Step 3: `apps/saas/docker-entrypoint.sh`**

```sh
#!/bin/sh
set -e

cd /app/apps/saas

echo "[entrypoint] Pushing Prisma schema to database..."
npx prisma db push --accept-data-loss 2>&1 || echo "[entrypoint] Schema push failed (may already be in sync)"

echo "[entrypoint] Starting Next.js server..."
exec node /app/apps/saas/server.js
```

- [ ] **Step 4: `apps/saas/.env.deploy.example`**

```
# DB — database 'slizebiz' di Postgres homelab (light-generator-postgres-1)
DATABASE_URL=postgresql://USER:PASS@light-generator-postgres-1:5432/slizebiz
# Origin app (homelab dulu; app.slizebiz.com saat go-public)
NEXTAUTH_URL=http://192.168.88.113:3200
AUTH_SECRET=ganti-dengan-random-32-byte
AUTH_TRUST_HOST=true
# Magic-link email (Resend, domain terverifikasi)
RESEND_API_KEY=re_xxx
EMAIL_FROM=Slizebiz <halo@slizebiz.com>
# Admin allowlist (comma-separated)
OWNER_EMAILS=adhityanugraha.jtk@gmail.com
# Baca waitlist dari Cloudflare D1 (read-only)
CLOUDFLARE_ACCOUNT_ID=79cf4805a7bf203e238f754920441f28
CLOUDFLARE_API_TOKEN=cf_d1_read_token
```

- [ ] **Step 5: `apps/saas/deploy.sh`** (mirror `apps/dashboard/deploy.sh` disederhanakan — tanpa stl-service/shopee/authentik)

```bash
#!/bin/bash
# deploy.sh — Deploy slizebiz (apps/saas) ke Docker host homelab
# Usage: ./deploy.sh          → build dari kode lokal, lalu deploy
# Config via .env.deploy (gitignored) — lihat .env.deploy.example
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER_HOST="${DOCKER_HOST:-tcp://192.168.88.113:2375}"
CONTAINER="slizebiz"
LOCAL_IMAGE="slizebiz:latest"
export DOCKER_HOST

ENV_FILE="$(dirname "$0")/.env.deploy"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌  File .env.deploy tidak ditemukan. Copy dari .env.deploy.example dulu."
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

REQUIRED_VARS=(DATABASE_URL NEXTAUTH_URL AUTH_SECRET RESEND_API_KEY EMAIL_FROM OWNER_EMAILS)
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "❌  Env var '$var' kosong di .env.deploy"; exit 1
  fi
done

echo "🔨  Building $LOCAL_IMAGE di $DOCKER_HOST..."
docker build -t "$LOCAL_IMAGE" -f "$REPO_ROOT/apps/saas/Dockerfile" "$REPO_ROOT"

BUILD_DATE=$(date +%Y%m%d)
BUILD_HASH=$(git rev-parse --short=5 HEAD 2>/dev/null || echo "00000")
echo "🚀  Deploying $LOCAL_IMAGE → $CONTAINER (version: $BUILD_DATE.$BUILD_HASH)..."

docker stop "$CONTAINER" 2>/dev/null && echo "   stopped $CONTAINER" || true
docker rm   "$CONTAINER" 2>/dev/null && echo "   removed $CONTAINER" || true

docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network homelab \
  -p 3200:3000 \
  -e NEXT_PUBLIC_BUILD_DATE="$BUILD_DATE" \
  -e NEXT_PUBLIC_BUILD_HASH="$BUILD_HASH" \
  -e DATABASE_URL="$DATABASE_URL" \
  -e NEXTAUTH_URL="$NEXTAUTH_URL" \
  -e AUTH_SECRET="$AUTH_SECRET" \
  -e AUTH_TRUST_HOST="${AUTH_TRUST_HOST:-true}" \
  -e RESEND_API_KEY="$RESEND_API_KEY" \
  -e EMAIL_FROM="$EMAIL_FROM" \
  -e OWNER_EMAILS="$OWNER_EMAILS" \
  -e CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}" \
  -e CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}" \
  "$LOCAL_IMAGE"

echo "⏳  Menunggu container ready..."
sleep 3
if docker logs "$CONTAINER" 2>&1 | grep -q "Ready in"; then
  echo "✅  Deploy berhasil! Container '$CONTAINER' berjalan di :3200."
  docker logs "$CONTAINER" --tail 5
else
  echo "⚠️   Container jalan tapi belum terdeteksi Ready. Cek logs:"
  docker logs "$CONTAINER" --tail 10
fi
```

- [ ] **Step 6: Set executable bit**

Run:
```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
chmod +x apps/saas/deploy.sh apps/saas/docker-entrypoint.sh
```
Expected: tidak ada output (sukses).

- [ ] **Step 7: Validasi Dockerfile syntax (build tahap builder saja, opsional lokal)**

Run (verifikasi ringan — pastikan file ada & shell script valid):
```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
sh -n apps/saas/docker-entrypoint.sh && bash -n apps/saas/deploy.sh && echo "scripts OK"
```
Expected: `scripts OK` (tak ada syntax error). **Build image & deploy sesungguhnya = GATED**, dilakukan hanya atas permintaan user (butuh `.env.deploy` produksi + izin).

- [ ] **Step 8: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/Dockerfile apps/saas/docker-entrypoint.sh apps/saas/deploy.sh apps/saas/.env.deploy.example apps/saas/public/.gitkeep
git commit -m "chore(saas): deploy homelab — Dockerfile + entrypoint + deploy.sh + env example"
```

---

### Task 10: Verifikasi akhir + dokumentasi (CLAUDE.md map, README, seluruh suite)

**Files:**
- Create: `apps/saas/README.md`
- Modify: `CLAUDE.md` (root — tambah `apps/saas/` ke peta monorepo)

**Interfaces:**
- Consumes: seluruh hasil Task 1–9.
- Produces: dokumentasi + bukti `pnpm turbo test` & `pnpm turbo build` hijau workspace-wide.

- [ ] **Step 1: Tulis `apps/saas/README.md`**

```markdown
# apps/saas — Slizebiz App (Free live, 1a-1)

App SaaS Slizebiz: kalkulator harga jual 3D print untuk user Free + admin-mini.

## Jalankan lokal
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
pnpm --filter @3pb/saas dev   # http://localhost:3200
```
Butuh `.env` (lihat `.env.deploy.example`): `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAILS`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.

## Arsitektur
- Auth: magic-link (NextAuth v5 + Resend), sesi database.
- Data: Prisma/Postgres — NextAuth tables + `Entitlement` komposit + `Config`. **Tanpa** tabel Waitlist.
- Waitlist: dibaca read-only dari **Cloudflare D1** milik landing (`lib/waitlist/cloudflare.ts`).
- Kalkulator: `@3pb/kalkulator-core` `hitungKalkulasiV2` + `defaultSettings`; UI memformat, tak menghitung ulang (`lib/kalkulator/compute.ts`).
- Gating: `lib/entitlement.ts` (`getEntitlement`/`can`/`requirePlan`) + `lib/hooks/use-entitlement.ts`. Di 1a-1 semua Free; fitur Beli 🔒 modal segera-hadir.
- Admin-mini: `/admin` owner-only (`OWNER_EMAILS`) — edit Config + lihat/ekspor waitlist.

## Deploy (homelab, GATED)
`./deploy.sh` → container `slizebiz` port 3200 di Docker host homelab. Butuh `.env.deploy`. Jangan deploy tanpa diminta user.

## Batas fase
Payment/subscription = 1c. Save/IndexedDB/PWA data = 1b.
```

- [ ] **Step 2: Update peta monorepo di `CLAUDE.md` root**

Di bagian struktur monorepo (`apps/saas/ → (belum ada — Fase 1 SaaS ...)`), ganti baris menjadi:
```
apps/saas/             → app SaaS Slizebiz (Free live 1a-1): kalkulator Free + auth magic-link + admin-mini. Next.js 16, deploy homelab :3200. Waitlist dibaca dari Cloudflare D1 landing.
```

- [ ] **Step 3: Jalankan seluruh suite workspace**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm turbo test
```
Expected: semua package hijau — termasuk `@3pb/saas` (entitlement, owner, config, compute, cloudflare, calculator) + kalkulator-core 14 golden tetap hijau + landing/dashboard tak berubah.

- [ ] **Step 4: Build workspace**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm turbo build
```
Expected: semua build sukses.

- [ ] **Step 5: Commit**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git add apps/saas/README.md CLAUDE.md
git commit -m "docs(saas): README + peta monorepo CLAUDE.md (Fase 1a-1)"
```

---

## Self-Review

**1. Spec coverage** (fondasi spec + amandemen 2026-07-18):
- Scaffold `apps/saas` + Next 16 + Prisma → Task 1, 2 ✅
- Auth magic-link NextAuth v5 + Resend, sesi DB, reveal in-place → Task 4 (auth) + Task 7 (LockedBlock → /login) ✅
- Data model: NextAuth + Entitlement komposit + Config, TANPA Waitlist → Task 2 ✅ (amandemen #2 dihormati)
- Entitlement auto-create → Task 4 event `createUser` ✅; `getEntitlement` auto-create → Task 3 ✅
- Gating `useEntitlement`/`requirePlan`/`can` → Task 3 (server) + Task 7 (client hook + API) ✅
- Kalkulator PENUH Free (single-plate/material, profil default, margin label, per-channel, status, footer Beli 🔒) → Task 6 (compute) + Task 7 (UI) ✅
- MARGIN_TIER_LABEL dipakai → Task 7 ✅
- Admin-mini owner-only: Config CRUD + waitlist dari D1 read-only via CF API → Task 8 ✅ (amandemen #2)
- Deploy homelab :3200, DB slizebiz → Task 9 ✅ (amandemen #1)
- Error handling (auth fail, entitlement auto-create, Config fallback, teaser invalid input, admin non-owner, CF fail) → Task 3/5/7/8 (compute guard input `valid`, config fallback, admin redirect, CF try/catch) ✅
- Testing (parity, defaultSettings, gating, entitlement auto-create logic, admin guard) → Task 3/5/6/8 ✅
- PWA shell (spec §9): **DITUNDA** — amandemen memindah offline/PWA data ke 1b; shell manifest bukan bagian inti Free 1a-1 dan tidak disebut di argumen milestone. **Gap sengaja**: bila user ingin manifest+SW, tambah task 1b. (Dicatat agar reviewer sadar; bukan omission diam-diam.)

**2. Placeholder scan:** Tidak ada "TBD/TODO" di langkah kode. Nilai `price.*` di `DEFAULT_CONFIG` sengaja string kosong (pricing = TBA per funnel §3.7) — ini keputusan spec, bukan placeholder plan.

**3. Type consistency:** `EntitlementLike {lifetimeOwned, subStatus}` konsisten Task 3↔7 (API pakai `capabilities(ent)`). `CalcInput`/`FullView` Task 6 dipakai Task 7 (`fullView`). `WaitlistRow` Task 8 dipakai konsisten (lib+API+komponen). `MarginTier`/`MARGIN_TIER_LABEL` dari core. `session.user.id` (API entitlement) & `session.user.email` (owner guard) — keduanya disediakan NextAuth v5 sesi database.

Catatan implementer: NextAuth v5 beta kadang butuh augmentasi tipe `session.user.id`. Bila `tsc` mengeluh `Property 'id' does not exist`, tambah `apps/saas/types/next-auth.d.ts` dengan module augmentation (`declare module "next-auth" { interface Session { user: { id: string } & DefaultSession["user"] } }`). Sudah diantisipasi; bukan blok.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-18-fase1a1-app-slizebiz-free.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review antar task, iterasi cepat.

**2. Inline Execution** — eksekusi di sesi ini via executing-plans, batch dengan checkpoint.

**Which approach?**
