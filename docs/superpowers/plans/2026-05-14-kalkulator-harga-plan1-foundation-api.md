# Kalkulator Harga — Plan 1: Foundation + API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the database schema, TypeScript types, formula calculation service, REST API routes, and React Query hooks for the Kalkulator Harga Jual feature.

**Architecture:** Follow existing patterns — Prisma schema → migration → TypeScript types in `lib/kalkulator/types.ts` → pure formula service in `lib/kalkulator/formula.ts` → API routes in `app/api/kalkulator/` → React Query hooks in `lib/hooks/use-kalkulator.ts`. No UI in this plan — only backend and data layer.

**Tech Stack:** Next.js 16 App Router, Prisma 7, SQLite, TypeScript, React Query (@tanstack/react-query)

**This is Plan 1 of 2.** Plan 2 covers the UI (calculator form, results, history, link modal, settings, filamen additions).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `prisma/schema.prisma` | Add 6 new models |
| Create | `prisma/migrations/20260514_add_kalkulator/migration.sql` | DB migration |
| Create | `lib/kalkulator/types.ts` | All TypeScript types |
| Create | `lib/kalkulator/formula.ts` | Pure calculation logic |
| Create | `lib/kalkulator/formula.test.ts` | Unit tests for formula |
| Create | `lib/kalkulator/service.ts` | DB operations |
| Create | `lib/kalkulator/rates.ts` | Load rates from Config |
| Create | `app/api/kalkulator/route.ts` | GET list + POST create |
| Create | `app/api/kalkulator/[id]/route.ts` | GET + PUT + DELETE |
| Create | `app/api/kalkulator/[id]/duplicate/route.ts` | POST save-as / duplicate |
| Create | `app/api/kalkulator/[id]/links/[linkId]/primary/route.ts` | PUT set isPrimary |
| Create | `app/api/kalkulator/filament-harga/route.ts` | FDM filament prices |
| Create | `app/api/kalkulator/resin-harga/route.ts` | SLA resin prices |
| Create | `app/api/kalkulator/rates/route.ts` | GET + PUT machine/component rates |
| Create | `lib/hooks/use-kalkulator.ts` | React Query hooks |

---

### Task 1: Prisma Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260514_add_kalkulator/migration.sql`

- [ ] **Step 1: Add models to `prisma/schema.prisma`**

Append at the end of the file (after the last existing model):

```prisma
model KalkulasiHarga {
  id                String   @id @default(cuid())
  nama              String   // e.g. "Hammerhead 10pcs" — bisa include batch info
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  batch             Int      @default(1)   // jumlah unit yang dicetak
  marginTier        String   @default("A")
  hargaShopeeAktual Float?
  packingType       String?
  gantunganType     String?
  switchQty         Int      @default(0)
  hasLabel          Boolean  @default(false)

  // Snapshot hasil kalkulasi
  hppProduksi    Float    @default(0)
  hppKomponen    Float    @default(0)
  hppTotal       Float    @default(0)
  floorPrice     Float    @default(0)
  offlineA       Float    @default(0)
  offlineB       Float    @default(0)
  offlineC       Float    @default(0)
  shopeeA        Float    @default(0)
  shopeeB        Float    @default(0)
  shopeeC        Float    @default(0)
  resellerStd    Float    @default(0)
  resellerBulk   Float    @default(0)
  marginOfflineA Float    @default(0)
  marginShopeeA  Float    @default(0)
  status         String   @default("TIDAK_DISET")

  plates         KalkulasiPlate[]
  komponenKustom KomponenKustom[]
  produkLinks    KalkulasiProduk[]
}

model KalkulasiPlate {
  id          String         @id @default(cuid())
  kalkulasiId String
  kalkulasi   KalkulasiHarga @relation(fields: [kalkulasiId], references: [id], onDelete: Cascade)
  urutan      Int
  namaPart    String?
  tipe        String         @default("FDM")
  gramasi     Float
  durasiJam   Float
}

model KomponenKustom {
  id          String         @id @default(cuid())
  kalkulasiId String
  kalkulasi   KalkulasiHarga @relation(fields: [kalkulasiId], references: [id], onDelete: Cascade)
  nama        String
  harga       Float
  qty         Int            @default(1)
}

model KalkulasiProduk {
  id           String         @id @default(cuid())
  kalkulasiId  String
  kalkulasi    KalkulasiHarga @relation(fields: [kalkulasiId], references: [id], onDelete: Cascade)
  shopeeItemId String?
  namaManual   String?
  isPrimary    Boolean        @default(false) // referensi harga utama untuk produk ini
}

model FilamentHarga {
  id           String @id @default(cuid())
  brand        String
  material     String
  hargaPerGram Float

  @@unique([brand, material])
}

model ResinHarga {
  id           String @id @default(cuid())
  brand        String
  grade        String
  hargaPerGram Float

  @@unique([brand, grade])
}
```

- [ ] **Step 2: Create migration directory and SQL**

```bash
mkdir -p prisma/migrations/20260514_add_kalkulator
```

Create `prisma/migrations/20260514_add_kalkulator/migration.sql`:

```sql
-- CreateTable: KalkulasiHarga
CREATE TABLE "KalkulasiHarga" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nama" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "batch" INTEGER NOT NULL DEFAULT 1,
    "marginTier" TEXT NOT NULL DEFAULT 'A',
    "hargaShopeeAktual" REAL,
    "packingType" TEXT,
    "gantunganType" TEXT,
    "switchQty" INTEGER NOT NULL DEFAULT 0,
    "hasLabel" BOOLEAN NOT NULL DEFAULT false,
    "hppProduksi" REAL NOT NULL DEFAULT 0,
    "hppKomponen" REAL NOT NULL DEFAULT 0,
    "hppTotal" REAL NOT NULL DEFAULT 0,
    "floorPrice" REAL NOT NULL DEFAULT 0,
    "offlineA" REAL NOT NULL DEFAULT 0,
    "offlineB" REAL NOT NULL DEFAULT 0,
    "offlineC" REAL NOT NULL DEFAULT 0,
    "shopeeA" REAL NOT NULL DEFAULT 0,
    "shopeeB" REAL NOT NULL DEFAULT 0,
    "shopeeC" REAL NOT NULL DEFAULT 0,
    "resellerStd" REAL NOT NULL DEFAULT 0,
    "resellerBulk" REAL NOT NULL DEFAULT 0,
    "marginOfflineA" REAL NOT NULL DEFAULT 0,
    "marginShopeeA" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'TIDAK_DISET'
);

-- CreateTable: KalkulasiPlate
CREATE TABLE "KalkulasiPlate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kalkulasiId" TEXT NOT NULL,
    "urutan" INTEGER NOT NULL,
    "namaPart" TEXT,
    "tipe" TEXT NOT NULL DEFAULT 'FDM',
    "gramasi" REAL NOT NULL,
    "durasiJam" REAL NOT NULL,
    CONSTRAINT "KalkulasiPlate_kalkulasiId_fkey" FOREIGN KEY ("kalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: KomponenKustom
CREATE TABLE "KomponenKustom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kalkulasiId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "harga" REAL NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "KomponenKustom_kalkulasiId_fkey" FOREIGN KEY ("kalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: KalkulasiProduk
CREATE TABLE "KalkulasiProduk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kalkulasiId" TEXT NOT NULL,
    "shopeeItemId" TEXT,
    "namaManual" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "KalkulasiProduk_kalkulasiId_fkey" FOREIGN KEY ("kalkulasiId") REFERENCES "KalkulasiHarga" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: FilamentHarga
CREATE TABLE "FilamentHarga" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "hargaPerGram" REAL NOT NULL
);
CREATE UNIQUE INDEX "FilamentHarga_brand_material_key" ON "FilamentHarga"("brand", "material");

-- CreateTable: ResinHarga
CREATE TABLE "ResinHarga" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brand" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "hargaPerGram" REAL NOT NULL
);
CREATE UNIQUE INDEX "ResinHarga_brand_grade_key" ON "ResinHarga"("brand", "grade");

-- Seed default Config keys for kalkulator rates
INSERT OR IGNORE INTO "Config" ("id", "key", "value", "updatedAt") VALUES
    ('kalk-cfg-01', 'kalk.fdm.hppPerGram',    '300',  CURRENT_TIMESTAMP),
    ('kalk-cfg-02', 'kalk.fdm.jualPerGram',   '900',  CURRENT_TIMESTAMP),
    ('kalk-cfg-03', 'kalk.sla.hppPerGram',    '1750', CURRENT_TIMESTAMP),
    ('kalk-cfg-04', 'kalk.sla.jualPerGram',   '3500', CURRENT_TIMESTAMP),
    ('kalk-cfg-05', 'kalk.mesin.perJam',       '4000', CURRENT_TIMESTAMP),
    ('kalk-cfg-06', 'kalk.adminEcommerce',     '1.2',  CURRENT_TIMESTAMP),
    ('kalk-cfg-07', 'kalk.packing.S',          '1500', CURRENT_TIMESTAMP),
    ('kalk-cfg-08', 'kalk.packing.M',          '2500', CURRENT_TIMESTAMP),
    ('kalk-cfg-09', 'kalk.packing.L',          '5000', CURRENT_TIMESTAMP),
    ('kalk-cfg-10', 'kalk.packing.XL',         '8000', CURRENT_TIMESTAMP),
    ('kalk-cfg-11', 'kalk.switch.perPcs',      '2500', CURRENT_TIMESTAMP),
    ('kalk-cfg-12', 'kalk.label.perLembar',    '750',  CURRENT_TIMESTAMP),
    ('kalk-cfg-13', 'kalk.gantungan.kew_kew',  '900',  CURRENT_TIMESTAMP),
    ('kalk-cfg-14', 'kalk.gantungan.ring',     '800',  CURRENT_TIMESTAMP),
    ('kalk-cfg-15', 'kalk.gantungan.rantai',   '350',  CURRENT_TIMESTAMP),
    ('kalk-cfg-16', 'kalk.gantungan.tali',     '400',  CURRENT_TIMESTAMP);
```

- [ ] **Step 3: Run migration**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker exec shopee-dashboard \
  npx prisma migrate deploy
```

Expected output: `All migrations have been applied` (or similar success message).

If running locally: `npx prisma migrate dev --name add_kalkulator`

- [ ] **Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260514_add_kalkulator/
git commit -m "feat(kalkulator): add prisma schema + migration for kalkulator harga"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `lib/kalkulator/types.ts`

- [ ] **Step 1: Create `lib/kalkulator/types.ts`**

```typescript
// ── Print Types ─────────────────────────────────────────────────────────────

export type PrintTipe = 'FDM' | 'SLA'
export type MarginTier = 'A' | 'B' | 'C'
export type KalkulasiStatus = 'AMAN' | 'BAWAH_REKM' | 'RUGI' | 'TIDAK_DISET'
export type PackingType = 'S' | 'M' | 'L' | 'XL'

// ── Plate (satu bagian/part dari produk) ────────────────────────────────────

export interface PlateInput {
  namaPart?: string
  tipe: PrintTipe
  gramasi: number      // total gramasi untuk plate ini (output slicer)
  durasiJam: number    // total durasi untuk plate ini (output slicer)
}

export interface PlateData extends PlateInput {
  id: string
  urutan: number
  kalkulasiId: string
}

// ── Aksesori & Komponen ─────────────────────────────────────────────────────

export interface KomponenKustomInput {
  nama: string
  harga: number
  qty: number
}

export interface KomponenKustomData extends KomponenKustomInput {
  id: string
  kalkulasiId: string
}

// ── Rates (dari Config) ─────────────────────────────────────────────────────

export interface KalkulatorRates {
  fdmHppPerGram: number    // default 300
  fdmJualPerGram: number   // default 900
  slaHppPerGram: number    // default 1750
  slaJualPerGram: number   // default 3500
  mesinPerJam: number      // default 4000
  adminEcommerce: number   // default 1.2
  packing: Record<string, number>   // { S: 1500, M: 2500, L: 5000, XL: 8000 }
  gantungan: Record<string, number> // { kew_kew: 900, ring: 800, ... }
  switchPerPcs: number     // default 2500
  labelPerLembar: number   // default 750
}

// ── Hasil Kalkulasi ─────────────────────────────────────────────────────────

export interface HasilKalkulasi {
  hppProduksi: number
  hppKomponen: number
  hppTotal: number
  floorPrice: number
  offlineA: number
  offlineB: number
  offlineC: number
  shopeeA: number
  shopeeB: number
  shopeeC: number
  resellerStd: number
  resellerBulk: number
  marginOfflineA: number   // %
  marginShopeeA: number    // % (net setelah fee 20%)
  status: KalkulasiStatus
}

// ── Kalkulasi (full record) ─────────────────────────────────────────────────

export interface KalkulasiInput {
  nama: string
  batch: number              // jumlah unit yang dicetak
  marginTier: MarginTier
  hargaShopeeAktual?: number
  packingType?: PackingType
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  plates: PlateInput[]
  komponenKustom: KomponenKustomInput[]
}

export interface KalkulasiData extends HasilKalkulasi {
  id: string
  nama: string
  createdAt: string
  updatedAt: string
  batch: number
  marginTier: MarginTier
  hargaShopeeAktual?: number
  packingType?: PackingType
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  plates: PlateData[]
  komponenKustom: KomponenKustomData[]
  produkLinks: KalkulasiProdukData[]
}

// ── Produk Link ─────────────────────────────────────────────────────────────

export interface KalkulasiProdukInput {
  shopeeItemId?: string
  namaManual?: string
  isPrimary?: boolean   // set sebagai referensi harga utama untuk produk ini
}

export interface KalkulasiProdukData extends KalkulasiProdukInput {
  id: string
  kalkulasiId: string
  isPrimary: boolean
}

// ── Filament/Resin Harga ────────────────────────────────────────────────────

export interface FilamentHargaData {
  id: string
  brand: string
  material: string
  hargaPerGram: number
}

export interface ResinHargaData {
  id: string
  brand: string
  grade: string
  hargaPerGram: number
}

// ── API Response ────────────────────────────────────────────────────────────

export interface KalkulasiListResponse {
  items: KalkulasiData[]
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/kalkulator/types.ts
git commit -m "feat(kalkulator): add TypeScript types"
```

---

### Task 3: Formula Service + Tests

**Files:**
- Create: `lib/kalkulator/formula.ts`
- Create: `lib/kalkulator/formula.test.ts`

- [ ] **Step 1: Write failing tests first — create `lib/kalkulator/formula.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { hitungKalkulasi } from './formula'
import type { KalkulatorRates, PlateInput } from './types'

const DEFAULT_RATES: KalkulatorRates = {
  fdmHppPerGram: 300,
  fdmJualPerGram: 900,
  slaHppPerGram: 1750,
  slaJualPerGram: 3500,
  mesinPerJam: 4000,
  adminEcommerce: 1.2,
  packing: { S: 1500, M: 2500, L: 5000, XL: 8000 },
  gantungan: { kew_kew: 900, ring: 800, rantai: 350, tali: 400 },
  switchPerPcs: 2500,
  labelPerLembar: 750,
}

const PLATE_SHARK: PlateInput = { tipe: 'FDM', gramasi: 210, durasiJam: 11.7 }

describe('hitungKalkulasi', () => {
  it('calculates HPP correctly for FDM single batch', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1,
      DEFAULT_RATES,
      'A'
    )
    // HPP produksi = 21×300 + 1.17×4000 = 6300 + 4680 = 10980
    expect(result.hppProduksi).toBeCloseTo(10980, 0)
    // HPP komponen = 0 (no accessories)
    expect(result.hppKomponen).toBe(0)
    expect(result.hppTotal).toBeCloseTo(10980, 0)
  })

  it('calculates floor price correctly', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: 'S', gantunganType: 'kew_kew', switchQty: 0, hasLabel: false, komponenKustom: [] },
      1,
      DEFAULT_RATES,
      'A'
    )
    // jual_base = 21×900 + 1.17×4000 = 18900 + 4680 = 23580
    // komponen = packing S (1500) + gantungan kew_kew (900) = 2400
    // floor = 23580 + 2400 = 25980
    expect(result.floorPrice).toBeCloseTo(25980, 0)
    expect(result.hppKomponen).toBe(2400)
  })

  it('calculates batch correctly — divides by batch', () => {
    const result = hitungKalkulasi(
      [PLATE_SHARK],  // 210g, 11.7j total untuk 10 unit
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      10,
      DEFAULT_RATES,
      'A'
    )
    // per unit: gramasi=21, durasiJam=1.17
    // HPP produksi = 10980 per unit
    expect(result.hppProduksi).toBeCloseTo(10980, 0)
  })

  it('calculates SLA HPP correctly', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'SLA', gramasi: 5, durasiJam: 0.5 }],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1,
      DEFAULT_RATES,
      'A'
    )
    // HPP = 5×1750 + 0.5×4000 = 8750 + 2000 = 10750
    expect(result.hppProduksi).toBeCloseTo(10750, 0)
    // Floor = 5×3500 + 0.5×4000 = 17500 + 2000 = 19500
    expect(result.floorPrice).toBeCloseTo(19500, 0)
  })

  it('calculates mixed FDM+SLA correctly', () => {
    const result = hitungKalkulasi(
      [
        { tipe: 'FDM', gramasi: 18, durasiJam: 1.0 },
        { tipe: 'SLA', gramasi: 2, durasiJam: 0.25 },
      ],
      { packingType: undefined, gantunganType: undefined, switchQty: 0, hasLabel: false, komponenKustom: [] },
      1,
      DEFAULT_RATES,
      'A'
    )
    // FDM HPP = 18×300 + 1×4000 = 5400 + 4000 = 9400
    // SLA HPP = 2×1750 + 0.25×4000 = 3500 + 1000 = 4500
    // Total HPP produksi = 13900
    expect(result.hppProduksi).toBeCloseTo(13900, 0)
  })

  it('calculates switch qty correctly', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 25, durasiJam: 1.0 }],
      { packingType: 'S', gantunganType: undefined, switchQty: 3, hasLabel: false, komponenKustom: [] },
      1,
      DEFAULT_RATES,
      'A'
    )
    // komponen = 1500 (packing S) + 3×2500 (switch) = 1500 + 7500 = 9000
    expect(result.hppKomponen).toBe(9000)
  })

  it('returns AMAN when shopee price >= shopeeA', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: 'S', gantunganType: 'kew_kew', switchQty: 0, hasLabel: false, komponenKustom: [] },
      1,
      DEFAULT_RATES,
      'A',
      50000  // above shopeeA
    )
    expect(result.status).toBe('AMAN')
  })

  it('returns RUGI when shopee price < floorPrice', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: 'S', gantunganType: 'kew_kew', switchQty: 0, hasLabel: false, komponenKustom: [] },
      1,
      DEFAULT_RATES,
      'A',
      10000  // well below floor
    )
    expect(result.status).toBe('RUGI')
  })

  it('calculates margins as percentages', () => {
    const result = hitungKalkulasi(
      [{ tipe: 'FDM', gramasi: 21, durasiJam: 1.17 }],
      { packingType: 'S', gantunganType: 'kew_kew', switchQty: 0, hasLabel: false, komponenKustom: [] },
      1,
      DEFAULT_RATES,
      'A'
    )
    // marginOfflineA = (offlineA - hppTotal) / offlineA * 100
    const expected = (result.offlineA - result.hppTotal) / result.offlineA * 100
    expect(result.marginOfflineA).toBeCloseTo(expected, 1)
    expect(result.marginOfflineA).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test lib/kalkulator/formula.test.ts
```

Expected: FAIL — "Cannot find module './formula'"

- [ ] **Step 3: Create `lib/kalkulator/formula.ts`**

```typescript
import type {
  PlateInput, KalkulasiStatus, KalkulatorRates, HasilKalkulasi, MarginTier
} from './types'

interface AksesoriInput {
  packingType?: string
  gantunganType?: string
  switchQty: number
  hasLabel: boolean
  komponenKustom: { harga: number; qty: number }[]
}

const MARGIN_MULTIPLIERS: Record<MarginTier, number> = {
  A: 1.1,
  B: 1.5,
  C: 2.0,
}

export function hitungKalkulasi(
  plates: PlateInput[],
  aksesori: AksesoriInput,
  batch: number,
  rates: KalkulatorRates,
  marginTier: MarginTier,
  hargaShopeeAktual?: number
): HasilKalkulasi {
  const safeBatch = Math.max(1, batch)

  // 1. HPP Produksi per unit (sum all plates, then divide by batch)
  const totalHppBatch = plates.reduce((sum, p) => {
    const hppRate = p.tipe === 'SLA' ? rates.slaHppPerGram : rates.fdmHppPerGram
    return sum + p.gramasi * hppRate + p.durasiJam * rates.mesinPerJam
  }, 0)
  const hppProduksi = totalHppBatch / safeBatch

  // 2. Jual base per unit (filament profit embedded)
  const totalJualBatch = plates.reduce((sum, p) => {
    const jualRate = p.tipe === 'SLA' ? rates.slaJualPerGram : rates.fdmJualPerGram
    return sum + p.gramasi * jualRate + p.durasiJam * rates.mesinPerJam
  }, 0)
  const jualBase = totalJualBatch / safeBatch

  // 3. HPP Komponen (per unit — accessories are per finished unit)
  const hppKomponen =
    (aksesori.packingType ? (rates.packing[aksesori.packingType] ?? 0) : 0) +
    (aksesori.gantunganType ? (rates.gantungan[aksesori.gantunganType] ?? 0) : 0) +
    aksesori.switchQty * rates.switchPerPcs +
    (aksesori.hasLabel ? rates.labelPerLembar : 0) +
    aksesori.komponenKustom.reduce((s, k) => s + k.harga * k.qty, 0)

  // 4. HPP Total
  const hppTotal = hppProduksi + hppKomponen

  // 5. Floor Price (absolute minimum — maintains filament profit)
  const floorPrice = jualBase + hppKomponen

  // 6. Offline prices
  const offlineA = floorPrice * MARGIN_MULTIPLIERS.A
  const offlineB = floorPrice * MARGIN_MULTIPLIERS.B
  const offlineC = floorPrice * MARGIN_MULTIPLIERS.C

  // 7. Shopee prices (+ marketplace fee)
  const shopeeA = offlineA * rates.adminEcommerce
  const shopeeB = offlineB * rates.adminEcommerce
  const shopeeC = offlineC * rates.adminEcommerce

  // 8. Reseller prices
  const resellerStd = offlineA              // they get marketplace fee as their margin
  const resellerBulk = floorPrice * 1.05   // bulk discount

  // 9. Margins as percentage
  const marginOfflineA = offlineA > 0
    ? ((offlineA - hppTotal) / offlineA) * 100
    : 0
  const netShopeeA = shopeeA * 0.8  // after 20% marketplace fee
  const marginShopeeA = netShopeeA > 0
    ? ((netShopeeA - hppTotal) / netShopeeA) * 100
    : 0

  // 10. Status
  let status: KalkulasiStatus = 'TIDAK_DISET'
  if (hargaShopeeAktual !== undefined) {
    if (hargaShopeeAktual >= shopeeA) status = 'AMAN'
    else if (hargaShopeeAktual >= floorPrice) status = 'BAWAH_REKM'
    else status = 'RUGI'
  }

  return {
    hppProduksi: Math.round(hppProduksi),
    hppKomponen: Math.round(hppKomponen),
    hppTotal: Math.round(hppTotal),
    floorPrice: Math.round(floorPrice),
    offlineA: Math.round(offlineA),
    offlineB: Math.round(offlineB),
    offlineC: Math.round(offlineC),
    shopeeA: Math.round(shopeeA),
    shopeeB: Math.round(shopeeB),
    shopeeC: Math.round(shopeeC),
    resellerStd: Math.round(resellerStd),
    resellerBulk: Math.round(resellerBulk),
    marginOfflineA: Math.round(marginOfflineA * 10) / 10,
    marginShopeeA: Math.round(marginShopeeA * 10) / 10,
    status,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test lib/kalkulator/formula.test.ts
```

Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/kalkulator/formula.ts lib/kalkulator/formula.test.ts
git commit -m "feat(kalkulator): add formula service with full test coverage"
```

---

### Task 4: Rates Loader + Service Layer

**Files:**
- Create: `lib/kalkulator/rates.ts`
- Create: `lib/kalkulator/service.ts`

- [ ] **Step 1: Create `lib/kalkulator/rates.ts`**

```typescript
import { prisma } from '@/lib/db'
import type { KalkulatorRates } from './types'

const DEFAULT_RATES: KalkulatorRates = {
  fdmHppPerGram: 300,
  fdmJualPerGram: 900,
  slaHppPerGram: 1750,
  slaJualPerGram: 3500,
  mesinPerJam: 4000,
  adminEcommerce: 1.2,
  packing: { S: 1500, M: 2500, L: 5000, XL: 8000 },
  gantungan: { kew_kew: 900, ring: 800, rantai: 350, tali: 400 },
  switchPerPcs: 2500,
  labelPerLembar: 750,
}

export async function loadRates(): Promise<KalkulatorRates> {
  const configs = await prisma.config.findMany({
    where: { key: { startsWith: 'kalk.' } },
  })

  const map = Object.fromEntries(configs.map(c => [c.key, c.value]))

  const packing: Record<string, number> = { ...DEFAULT_RATES.packing }
  const gantungan: Record<string, number> = { ...DEFAULT_RATES.gantungan }

  // Override packing from config
  for (const [key, val] of Object.entries(map)) {
    if (key.startsWith('kalk.packing.')) {
      const size = key.replace('kalk.packing.', '')
      packing[size] = parseFloat(val)
    }
    if (key.startsWith('kalk.gantungan.')) {
      const type = key.replace('kalk.gantungan.', '')
      gantungan[type] = parseFloat(val)
    }
  }

  return {
    fdmHppPerGram:  parseFloat(map['kalk.fdm.hppPerGram']  ?? '300'),
    fdmJualPerGram: parseFloat(map['kalk.fdm.jualPerGram'] ?? '900'),
    slaHppPerGram:  parseFloat(map['kalk.sla.hppPerGram']  ?? '1750'),
    slaJualPerGram: parseFloat(map['kalk.sla.jualPerGram'] ?? '3500'),
    mesinPerJam:    parseFloat(map['kalk.mesin.perJam']     ?? '4000'),
    adminEcommerce: parseFloat(map['kalk.adminEcommerce']   ?? '1.2'),
    switchPerPcs:   parseFloat(map['kalk.switch.perPcs']    ?? '2500'),
    labelPerLembar: parseFloat(map['kalk.label.perLembar']  ?? '750'),
    packing,
    gantungan,
  }
}

export async function updateRate(key: string, value: string): Promise<void> {
  await prisma.config.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}
```

- [ ] **Step 2: Create `lib/kalkulator/service.ts`**

```typescript
import { prisma } from '@/lib/db'
import { hitungKalkulasi } from './formula'
import { loadRates } from './rates'
import type {
  KalkulasiInput, KalkulasiData, KalkulasiProdukInput,
  FilamentHargaData, ResinHargaData, MarginTier
} from './types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function toKalkulasiData(raw: any): KalkulasiData {
  return {
    ...raw,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
    plates: raw.plates?.map((p: any) => ({ ...p })) ?? [],
    komponenKustom: raw.komponenKustom?.map((k: any) => ({ ...k })) ?? [],
    produkLinks: raw.produkLinks?.map((l: any) => ({ ...l })) ?? [],
  }
}

const INCLUDE_ALL = {
  plates: { orderBy: { urutan: 'asc' as const } },
  komponenKustom: true,
  produkLinks: true,
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listKalkulasi(): Promise<KalkulasiData[]> {
  const items = await prisma.kalkulasiHarga.findMany({
    include: INCLUDE_ALL,
    orderBy: { createdAt: 'desc' },
  })
  return items.map(toKalkulasiData)
}

export async function getKalkulasi(id: string): Promise<KalkulasiData | null> {
  const item = await prisma.kalkulasiHarga.findUnique({
    where: { id },
    include: INCLUDE_ALL,
  })
  return item ? toKalkulasiData(item) : null
}

export async function createKalkulasi(input: KalkulasiInput): Promise<KalkulasiData> {
  const rates = await loadRates()
  const hasil = hitungKalkulasi(
    input.plates,
    {
      packingType: input.packingType,
      gantunganType: input.gantunganType,
      switchQty: input.switchQty,
      hasLabel: input.hasLabel,
      komponenKustom: input.komponenKustom,
    },
    1, // batch tidak disimpan karena gramasi/durasi sudah per-unit dari plate sum÷batch
    rates,
    input.marginTier as MarginTier,
    input.hargaShopeeAktual
  )

  const record = await prisma.kalkulasiHarga.create({
    data: {
      nama: input.nama,
      marginTier: input.marginTier,
      hargaShopeeAktual: input.hargaShopeeAktual,
      packingType: input.packingType,
      gantunganType: input.gantunganType,
      switchQty: input.switchQty,
      hasLabel: input.hasLabel,
      ...hasil,
      plates: {
        create: input.plates.map((p, i) => ({
          urutan: i + 1,
          namaPart: p.namaPart,
          tipe: p.tipe,
          gramasi: p.gramasi,
          durasiJam: p.durasiJam,
        })),
      },
      komponenKustom: {
        create: input.komponenKustom.map(k => ({
          nama: k.nama,
          harga: k.harga,
          qty: k.qty,
        })),
      },
    },
    include: INCLUDE_ALL,
  })

  return toKalkulasiData(record)
}

export async function updateKalkulasi(id: string, input: KalkulasiInput): Promise<KalkulasiData> {
  const rates = await loadRates()
  const hasil = hitungKalkulasi(
    input.plates,
    {
      packingType: input.packingType,
      gantunganType: input.gantunganType,
      switchQty: input.switchQty,
      hasLabel: input.hasLabel,
      komponenKustom: input.komponenKustom,
    },
    1,
    rates,
    input.marginTier as MarginTier,
    input.hargaShopeeAktual
  )

  // Replace plates and komponen
  await prisma.$transaction([
    prisma.kalkulasiPlate.deleteMany({ where: { kalkulasiId: id } }),
    prisma.komponenKustom.deleteMany({ where: { kalkulasiId: id } }),
  ])

  const record = await prisma.kalkulasiHarga.update({
    where: { id },
    data: {
      nama: input.nama,
      marginTier: input.marginTier,
      hargaShopeeAktual: input.hargaShopeeAktual,
      packingType: input.packingType,
      gantunganType: input.gantunganType,
      switchQty: input.switchQty,
      hasLabel: input.hasLabel,
      ...hasil,
      plates: {
        create: input.plates.map((p, i) => ({
          urutan: i + 1,
          namaPart: p.namaPart,
          tipe: p.tipe,
          gramasi: p.gramasi,
          durasiJam: p.durasiJam,
        })),
      },
      komponenKustom: {
        create: input.komponenKustom.map(k => ({
          nama: k.nama,
          harga: k.harga,
          qty: k.qty,
        })),
      },
    },
    include: INCLUDE_ALL,
  })

  return toKalkulasiData(record)
}

export async function deleteKalkulasi(id: string): Promise<void> {
  await prisma.kalkulasiHarga.delete({ where: { id } })
}

// ── Produk Links ─────────────────────────────────────────────────────────────

export async function addProdukLink(
  kalkulasiId: string,
  input: KalkulasiProdukInput
): Promise<void> {
  await prisma.kalkulasiProduk.create({
    data: { kalkulasiId, isPrimary: input.isPrimary ?? false, ...input },
  })
}

export async function removeProdukLink(linkId: string): Promise<void> {
  await prisma.kalkulasiProduk.delete({ where: { id: linkId } })
}

export async function setPrimaryLink(linkId: string, kalkulasiId: string): Promise<void> {
  // Unset other primaries for same product key (shopeeItemId or namaManual)
  const link = await prisma.kalkulasiProduk.findUnique({ where: { id: linkId } })
  if (!link) return
  // Unset all primaries for this product identifier
  await prisma.kalkulasiProduk.updateMany({
    where: link.shopeeItemId
      ? { shopeeItemId: link.shopeeItemId }
      : { namaManual: link.namaManual ?? undefined },
    data: { isPrimary: false },
  })
  // Set this one as primary
  await prisma.kalkulasiProduk.update({
    where: { id: linkId },
    data: { isPrimary: true },
  })
}

export async function duplicateKalkulasi(id: string, newNama: string, newBatch?: number): Promise<KalkulasiData> {
  const source = await getKalkulasi(id)
  if (!source) throw new Error('Kalkulasi not found')

  const input: KalkulasiInput = {
    nama: newNama,
    batch: newBatch ?? source.batch,
    marginTier: source.marginTier as MarginTier,
    hargaShopeeAktual: source.hargaShopeeAktual ?? undefined,
    packingType: source.packingType as any ?? undefined,
    gantunganType: source.gantunganType ?? undefined,
    switchQty: source.switchQty,
    hasLabel: source.hasLabel,
    plates: source.plates.map(p => ({
      namaPart: p.namaPart ?? undefined,
      tipe: p.tipe as 'FDM' | 'SLA',
      gramasi: p.gramasi,
      durasiJam: p.durasiJam,
    })),
    komponenKustom: source.komponenKustom.map(k => ({
      nama: k.nama,
      harga: k.harga,
      qty: k.qty,
    })),
  }
  return createKalkulasi(input)
}

// ── Filament/Resin Harga ─────────────────────────────────────────────────────

export async function listFilamentHarga(): Promise<FilamentHargaData[]> {
  return prisma.filamentHarga.findMany({ orderBy: [{ brand: 'asc' }, { material: 'asc' }] })
}

export async function upsertFilamentHarga(
  brand: string, material: string, hargaPerGram: number
): Promise<FilamentHargaData> {
  return prisma.filamentHarga.upsert({
    where: { brand_material: { brand, material } },
    create: { brand, material, hargaPerGram },
    update: { hargaPerGram },
  })
}

export async function deleteFilamentHarga(id: string): Promise<void> {
  await prisma.filamentHarga.delete({ where: { id } })
}

export async function listResinHarga(): Promise<ResinHargaData[]> {
  return prisma.resinHarga.findMany({ orderBy: [{ brand: 'asc' }, { grade: 'asc' }] })
}

export async function upsertResinHarga(
  brand: string, grade: string, hargaPerGram: number
): Promise<ResinHargaData> {
  return prisma.resinHarga.upsert({
    where: { brand_grade: { brand, grade } },
    create: { brand, grade, hargaPerGram },
    update: { hargaPerGram },
  })
}

export async function deleteResinHarga(id: string): Promise<void> {
  await prisma.resinHarga.delete({ where: { id } })
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/kalkulator/rates.ts lib/kalkulator/service.ts
git commit -m "feat(kalkulator): add rates loader + service layer (CRUD)"
```

---

### Task 5: API Routes

**Files:**
- Create: `app/api/kalkulator/route.ts`
- Create: `app/api/kalkulator/[id]/route.ts`
- Create: `app/api/kalkulator/[id]/links/route.ts`
- Create: `app/api/kalkulator/[id]/links/[linkId]/route.ts`
- Create: `app/api/kalkulator/filament-harga/route.ts`
- Create: `app/api/kalkulator/resin-harga/route.ts`
- Create: `app/api/kalkulator/rates/route.ts`

- [ ] **Step 1: Create `app/api/kalkulator/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listKalkulasi, createKalkulasi } from '@/lib/kalkulator/service'
import type { KalkulasiInput } from '@/lib/kalkulator/types'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await listKalkulasi()
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: KalkulasiInput = await req.json()

  if (!body.nama?.trim()) {
    return NextResponse.json({ error: 'nama is required' }, { status: 400 })
  }
  if (!body.plates?.length) {
    return NextResponse.json({ error: 'at least one plate is required' }, { status: 400 })
  }
  for (const p of body.plates) {
    if (!p.gramasi || !p.durasiJam) {
      return NextResponse.json({ error: 'plate gramasi and durasiJam are required' }, { status: 400 })
    }
  }

  const result = await createKalkulasi(body)
  return NextResponse.json(result, { status: 201 })
}
```

- [ ] **Step 2: Create `app/api/kalkulator/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getKalkulasi, updateKalkulasi, deleteKalkulasi } from '@/lib/kalkulator/service'
import type { KalkulasiInput } from '@/lib/kalkulator/types'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const item = await getKalkulasi(id)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(item)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body: KalkulasiInput = await req.json()
  const result = await updateKalkulasi(id, body)
  return NextResponse.json(result)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  await deleteKalkulasi(id)
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 3: Create `app/api/kalkulator/[id]/links/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { addProdukLink } from '@/lib/kalkulator/service'
import type { KalkulasiProdukInput } from '@/lib/kalkulator/types'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body: KalkulasiProdukInput = await req.json()
  if (!body.shopeeItemId && !body.namaManual) {
    return NextResponse.json({ error: 'shopeeItemId or namaManual is required' }, { status: 400 })
  }
  await addProdukLink(id, body)
  return new NextResponse(null, { status: 201 })
}
```

- [ ] **Step 4: Create `app/api/kalkulator/[id]/links/[linkId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { removeProdukLink } from '@/lib/kalkulator/service'

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { linkId } = await params
  await removeProdukLink(linkId)
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 5: Create `app/api/kalkulator/filament-harga/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listFilamentHarga, upsertFilamentHarga, deleteFilamentHarga } from '@/lib/kalkulator/service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listFilamentHarga())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { brand, material, hargaPerGram } = await req.json()
  if (!brand || !material || !hargaPerGram) {
    return NextResponse.json({ error: 'brand, material, hargaPerGram required' }, { status: 400 })
  }
  const result = await upsertFilamentHarga(brand, material, hargaPerGram)
  return NextResponse.json(result, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  await deleteFilamentHarga(id)
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 6: Create `app/api/kalkulator/resin-harga/route.ts`** (same pattern as filament-harga)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listResinHarga, upsertResinHarga, deleteResinHarga } from '@/lib/kalkulator/service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listResinHarga())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { brand, grade, hargaPerGram } = await req.json()
  if (!brand || !grade || !hargaPerGram) {
    return NextResponse.json({ error: 'brand, grade, hargaPerGram required' }, { status: 400 })
  }
  const result = await upsertResinHarga(brand, grade, hargaPerGram)
  return NextResponse.json(result, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  await deleteResinHarga(id)
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 7: Create `app/api/kalkulator/[id]/duplicate/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { duplicateKalkulasi } from '@/lib/kalkulator/service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { nama, batch } = await req.json()
  if (!nama?.trim()) return NextResponse.json({ error: 'nama is required' }, { status: 400 })

  const result = await duplicateKalkulasi(id, nama, batch)
  return NextResponse.json(result, { status: 201 })
}
```

- [ ] **Step 7b: Create `app/api/kalkulator/[id]/links/[linkId]/primary/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setPrimaryLink } from '@/lib/kalkulator/service'

export async function PUT(_: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, linkId } = await params
  await setPrimaryLink(linkId, id)
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 8: Create `app/api/kalkulator/rates/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadRates, updateRate } from '@/lib/kalkulator/rates'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await loadRates())
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Expects: { key: 'kalk.fdm.hppPerGram', value: '300' }
  // Or array: [{ key, value }, ...]
  const body = await req.json()
  const updates = Array.isArray(body) ? body : [body]

  for (const { key, value } of updates) {
    if (!key?.startsWith('kalk.')) {
      return NextResponse.json({ error: `Invalid key: ${key}` }, { status: 400 })
    }
    await updateRate(key, String(value))
  }

  return NextResponse.json(await loadRates())
}
```

- [ ] **Step 8: Commit**

```bash
git add app/api/kalkulator/
git commit -m "feat(kalkulator): add REST API routes (CRUD, links, filament/resin prices, rates)"
```

---

### Task 6: React Query Hooks

**Files:**
- Create: `lib/hooks/use-kalkulator.ts`

- [ ] **Step 1: Create `lib/hooks/use-kalkulator.ts`**

```typescript
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  KalkulasiData, KalkulasiInput, KalkulasiListResponse,
  FilamentHargaData, ResinHargaData, KalkulatorRates,
  KalkulasiProdukInput
} from '@/lib/kalkulator/types'

const KALK_KEY = ['kalkulator'] as const
const FILAMENT_HARGA_KEY = ['kalkulator', 'filament-harga'] as const
const RESIN_HARGA_KEY = ['kalkulator', 'resin-harga'] as const
const RATES_KEY = ['kalkulator', 'rates'] as const

// ── List + Get ────────────────────────────────────────────────────────────────

async function fetchKalkulasiList(): Promise<KalkulasiListResponse> {
  const res = await fetch('/api/kalkulator')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useKalkulasiList() {
  return useQuery({ queryKey: KALK_KEY, queryFn: fetchKalkulasiList })
}

async function fetchKalkulasi(id: string): Promise<KalkulasiData> {
  const res = await fetch(`/api/kalkulator/${id}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useKalkulasi(id: string) {
  return useQuery({
    queryKey: [...KALK_KEY, id],
    queryFn: () => fetchKalkulasi(id),
    enabled: !!id,
  })
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: KalkulasiInput): Promise<KalkulasiData> => {
      const res = await fetch('/api/kalkulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: KalkulasiInput }): Promise<KalkulasiData> => {
      const res = await fetch(`/api/kalkulator/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: KALK_KEY })
      qc.invalidateQueries({ queryKey: [...KALK_KEY, id] })
    },
  })
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/kalkulator/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}

// ── Produk Links ──────────────────────────────────────────────────────────────

// ── Duplicate ─────────────────────────────────────────────────────────────────

export function useDuplicateKalkulasi() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, nama, batch }: { id: string; nama: string; batch?: number }): Promise<KalkulasiData> => {
      const res = await fetch(`/api/kalkulator/${id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama, batch }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}

// ── Set Primary ───────────────────────────────────────────────────────────────

export function useSetPrimaryLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ kalkulasiId, linkId }: { kalkulasiId: string; linkId: string }) => {
      const res = await fetch(`/api/kalkulator/${kalkulasiId}/links/${linkId}/primary`, {
        method: 'PUT',
      })
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KALK_KEY }),
  })
}

export function useAddProdukLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ kalkulasiId, input }: { kalkulasiId: string; input: KalkulasiProdukInput }) => {
      const res = await fetch(`/api/kalkulator/${kalkulasiId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    onSuccess: (_, { kalkulasiId }) => {
      qc.invalidateQueries({ queryKey: KALK_KEY })
      qc.invalidateQueries({ queryKey: [...KALK_KEY, kalkulasiId] })
    },
  })
}

export function useRemoveProdukLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ kalkulasiId, linkId }: { kalkulasiId: string; linkId: string }) => {
      const res = await fetch(`/api/kalkulator/${kalkulasiId}/links/${linkId}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
    },
    onSuccess: (_, { kalkulasiId }) => {
      qc.invalidateQueries({ queryKey: KALK_KEY })
      qc.invalidateQueries({ queryKey: [...KALK_KEY, kalkulasiId] })
    },
  })
}

// ── Filament Harga ────────────────────────────────────────────────────────────

async function fetchFilamentHarga(): Promise<FilamentHargaData[]> {
  const res = await fetch('/api/kalkulator/filament-harga')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useFilamentHarga() {
  return useQuery({ queryKey: FILAMENT_HARGA_KEY, queryFn: fetchFilamentHarga })
}

export function useUpsertFilamentHarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brand, material, hargaPerGram }: { brand: string; material: string; hargaPerGram: number }) => {
      const res = await fetch('/api/kalkulator/filament-harga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, material, hargaPerGram }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FILAMENT_HARGA_KEY }),
  })
}

export function useDeleteFilamentHarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/kalkulator/filament-harga', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FILAMENT_HARGA_KEY }),
  })
}

// ── Resin Harga ───────────────────────────────────────────────────────────────

async function fetchResinHarga(): Promise<ResinHargaData[]> {
  const res = await fetch('/api/kalkulator/resin-harga')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useResinHarga() {
  return useQuery({ queryKey: RESIN_HARGA_KEY, queryFn: fetchResinHarga })
}

export function useUpsertResinHarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brand, grade, hargaPerGram }: { brand: string; grade: string; hargaPerGram: number }) => {
      const res = await fetch('/api/kalkulator/resin-harga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, grade, hargaPerGram }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RESIN_HARGA_KEY }),
  })
}

export function useDeleteResinHarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/kalkulator/resin-harga', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RESIN_HARGA_KEY }),
  })
}

// ── Rates ─────────────────────────────────────────────────────────────────────

async function fetchRates(): Promise<KalkulatorRates> {
  const res = await fetch('/api/kalkulator/rates')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function useKalkulatorRates() {
  return useQuery({ queryKey: RATES_KEY, queryFn: fetchRates })
}

export function useUpdateRates() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: { key: string; value: string }[]) => {
      const res = await fetch('/api/kalkulator/rates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RATES_KEY }),
  })
}
```

- [ ] **Step 2: Run all tests to confirm nothing broken**

```bash
npm test
```

Expected: All tests pass (including formula.test.ts)

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/use-kalkulator.ts
git commit -m "feat(kalkulator): add React Query hooks for all kalkulator API endpoints"
git push
```

---

### Task 7: Build + Verify

- [ ] **Step 1: Build via Docker**

```bash
./deploy.sh build 2>&1 | grep -E "error|TypeScript|✅|❌" | head -20
```

Expected: `✅  Deploy berhasil!`

Fix any TypeScript errors before continuing to Plan 2.

- [ ] **Step 2: Smoke test API endpoints**

```bash
# Get token first — use browser to login, then get the cookie
# OR test from within container after build

# List (should return empty array)
curl -s http://shopee.homelab.lan/api/kalkulator \
  -H "Cookie: <your-session-cookie>" | python3 -m json.tool

# Get rates
curl -s http://shopee.homelab.lan/api/kalkulator/rates \
  -H "Cookie: <your-session-cookie>" | python3 -m json.tool

# Get filament harga (empty)
curl -s http://shopee.homelab.lan/api/kalkulator/filament-harga \
  -H "Cookie: <your-session-cookie>" | python3 -m json.tool
```

Expected: 200 responses with empty data.

- [ ] **Step 3: Reconnect homelab network**

```bash
DOCKER_HOST=tcp://192.168.88.113:2375 docker network connect homelab shopee-dashboard 2>/dev/null || true
```

- [ ] **Step 4: Push**

```bash
git push
```
