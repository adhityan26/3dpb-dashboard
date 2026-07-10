# Fase 0b-1: Backend Kalkulator v2 (Profiles, Presets, Settings) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyediakan fondasi data & API untuk adopsi formula v2 di dashboard internal — tabel + CRUD printer profile, material profile, komponen preset, labor preset, dan loader `SettingsV2` (channel fee via Config) — tanpa mengubah perilaku dashboard yang berjalan.

**Architecture:** Murni aditif. Empat tabel Prisma baru (prefix `Kalk*` untuk profile agar tidak bentrok dengan model `Printer` milik modul filamen) + seed idempoten dari nilai Config `kalk.*` existing. Service CRUD meniru pola `lib/filamen/printer-service.ts`; API routes meniru pola `app/api/kalkulator/rates/route.ts` (guard `auth()`). Channel fee TIDAK pakai tabel — pakai Config keys dinamis `kalk.channel.<id>` meniru pola `kalk.packing.*`, sehingga PUT `/api/kalkulator/rates` existing sudah bisa mengeditnya. UI settings & switch formula = plan terpisah (Fase 0b-2).

**Tech Stack:** Next.js 16.2.3 (App Router), Prisma 7 + PostgreSQL, Vitest, `@3pb/kalkulator-core` (tipe `SettingsV2`, `ChannelDef`, `LaborItem`, `hitungMesinPerJam`).

## Global Constraints

- **Zero behavior change**: tidak ada file existing yang berubah perilakunya; perubahan hanya menambah (schema, file baru, script seed). `hitungKalkulasi` wrapper, `rates.ts`, service kalkulasi, UI — tidak disentuh.
- Node 22: awali SETIAP bash call `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`. Hook RTK me-rewrite perintah — transparan; kalau output tertelan, jalankan binary langsung (`pnpm --filter shopee-dashboard exec vitest run ...`).
- Sebelum menulis kode Next apa pun, baca guide relevan di `apps/dashboard/node_modules/next/dist/docs/` (instruksi AGENTS.md).
- Schema hanya ADITIF (tabel baru saja — tidak mengubah/menghapus kolom existing). Terapkan dengan `prisma db push` (pola deploy repo ini), BUKAN `migrate dev`. **Sebelum push, cek `DATABASE_URL` di `apps/dashboard/.env` — kalau menunjuk ke Postgres homelab produksi (`light-generator-postgres-1` / host `192.168.88.x`), tetap aman karena aditif, tapi laporkan di report.**
- Seed HARUS idempoten (aman dijalankan berulang) dan tidak menimpa nilai yang sudah diedit user (create-if-missing, bukan overwrite).
- Konvensi penamaan Indonesia dipertahankan (`nama`, `harga`, `mesinPerJam`). Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Kerjakan di branch baru `fase0b1-kalkulator-v2-backend` dari `master` (buat di Task 1 Step 1).
- Test pattern: mock `@/lib/db` via `vi.mock` (contoh di `apps/dashboard/lib/bot/__tests__/kalkulator-route.test.ts`).

---

### Task 1: Schema Prisma — 4 tabel baru

**Files:**
- Modify: `apps/dashboard/prisma/schema.prisma` (append di bawah model `ResinHarga`, ~baris 276)

**Interfaces:**
- Produces: model Prisma `KalkPrinterProfile`, `KalkMaterialProfile`, `KomponenPreset`, `LaborPreset` — dipakai Task 2–5. Field persis seperti di bawah.

- [ ] **Step 1: Buat branch**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git checkout master && git pull && git checkout -b fase0b1-kalkulator-v2-backend
```

- [ ] **Step 2: Tambah model di schema.prisma**

Append setelah model `ResinHarga`:

```prisma
// ── Kalkulator v2: profiles & presets (Fase 0b) ──────────────────────────────

model KalkPrinterProfile {
  id                String   @id @default(cuid())
  nama              String   @unique
  mesinPerJam       Float
  // Input kalkulator bantu — disimpan agar bisa di-recompute saat tarif berubah
  watt              Float?
  tarifPerKwh       Float?
  hargaPrinter      Float?
  umurPakaiJam      Float?
  maintenancePerJam Float?
  isDefault         Boolean  @default(false)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model KalkMaterialProfile {
  id             String   @id @default(cuid())
  nama           String // 'PLA', 'PETG', 'ABS', 'TPU', 'Resin ABS-like', …
  tipe           String   @default("FDM") // "FDM" | "SLA"
  hppPerGram     Float
  jualPerGram    Float
  failureRatePct Float    @default(12)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([nama, tipe])
}

model KomponenPreset {
  id        String   @id @default(cuid())
  nama      String   @unique
  harga     Float
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model LaborPreset {
  id        String   @id @default(cuid())
  nama      String   @unique
  itemsJson String // JSON LaborItem[]: [{ nama, jam?, ratePerJam?, flat? }]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 3: Push schema + generate client**

```bash
grep -o 'DATABASE_URL=[^ ]*' apps/dashboard/.env | sed 's|://.*@|://***@|'   # catat targetnya di report
pnpm --filter shopee-dashboard exec prisma db push
pnpm --filter shopee-dashboard exec prisma generate
```

Expected: `db push` melaporkan 4 tabel baru dibuat, tanpa perubahan/drop pada tabel lain. Kalau `db push` menampilkan rencana DROP/ALTER pada tabel existing — STOP, jangan konfirmasi, report BLOCKED.

- [ ] **Step 4: Verifikasi tidak merusak apa pun**

```bash
pnpm --filter shopee-dashboard test
pnpm --filter shopee-dashboard build
```

Expected: 105 test PASS, build sukses.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/prisma/schema.prisma
git commit -m "feat(kalkulator): tabel KalkPrinterProfile, KalkMaterialProfile, KomponenPreset, LaborPreset" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Seed idempoten dari Config existing

**Files:**
- Create: `apps/dashboard/scripts/seed-kalkulator-v2.ts`
- Modify: `apps/dashboard/package.json` (tambah script)

**Interfaces:**
- Consumes: model Prisma Task 1; nilai Config `kalk.*` (default sama dengan `lib/kalkulator/rates.ts`).
- Produces: perintah `pnpm --filter shopee-dashboard db:seed-kalk-v2` — dijalankan juga saat deploy 0b-2 nanti. Baris data: 1 printer profile default, 2 material profile generik, 6 komponen preset, 4 labor preset helm, 2 Config channel.

- [ ] **Step 1: Tulis script**

File `apps/dashboard/scripts/seed-kalkulator-v2.ts`:

```ts
/**
 * Seed idempoten data kalkulator v2 dari nilai Config kalk.* existing.
 * Aman dijalankan berulang: create-if-missing, TIDAK menimpa data yang sudah ada
 * (kecuali upsert profile generik yang memang belum pernah diedit — pakai create-only).
 *
 * Jalankan: pnpm --filter shopee-dashboard db:seed-kalk-v2
 */
import { prisma } from '../lib/db'

async function configNum(key: string, fallback: number): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key } })
  const n = row ? parseFloat(row.value) : NaN
  return Number.isFinite(n) ? n : fallback
}

async function createIfMissing<T>(exists: () => Promise<T | null>, create: () => Promise<unknown>, label: string) {
  if (await exists()) {
    console.log(`skip   ${label} (sudah ada)`)
    return
  }
  await create()
  console.log(`create ${label}`)
}

async function main() {
  // 1. Printer profile default — dari kalk.mesin.perJam (P1P, hitungan manual user)
  const mesinPerJam = await configNum('kalk.mesin.perJam', 4000)
  await createIfMissing(
    () => prisma.kalkPrinterProfile.findFirst({ where: { isDefault: true } }),
    () => prisma.kalkPrinterProfile.create({
      data: { nama: 'Default (P1P)', mesinPerJam, isDefault: true },
    }),
    `printer profile Default (P1P) mesinPerJam=${mesinPerJam}`,
  )

  // 2. Material profile generik — dari rates FDM/SLA + failure rate global
  const failureRatePct = await configNum('kalk.failureRate.pct', 12)
  const materials = [
    { nama: 'FDM Generik', tipe: 'FDM', hppPerGram: await configNum('kalk.fdm.hppPerGram', 300), jualPerGram: await configNum('kalk.fdm.jualPerGram', 900) },
    { nama: 'SLA Generik', tipe: 'SLA', hppPerGram: await configNum('kalk.sla.hppPerGram', 1750), jualPerGram: await configNum('kalk.sla.jualPerGram', 3500) },
  ]
  for (const m of materials) {
    await createIfMissing(
      () => prisma.kalkMaterialProfile.findUnique({ where: { nama_tipe: { nama: m.nama, tipe: m.tipe } } }),
      () => prisma.kalkMaterialProfile.create({ data: { ...m, failureRatePct } }),
      `material profile ${m.nama}`,
    )
  }

  // 3. Komponen preset — dari gantungan/switch/label Config
  const komponen: { nama: string; harga: number }[] = [
    { nama: 'Gantungan kew-kew', harga: await configNum('kalk.gantungan.kew_kew', 900) },
    { nama: 'Gantungan ring', harga: await configNum('kalk.gantungan.ring', 800) },
    { nama: 'Gantungan rantai', harga: await configNum('kalk.gantungan.rantai', 350) },
    { nama: 'Gantungan tali', harga: await configNum('kalk.gantungan.tali', 400) },
    { nama: 'Switch', harga: await configNum('kalk.switch.perPcs', 2500) },
    { nama: 'Label', harga: await configNum('kalk.label.perLembar', 750) },
  ]
  for (const k of komponen) {
    await createIfMissing(
      () => prisma.komponenPreset.findUnique({ where: { nama: k.nama } }),
      () => prisma.komponenPreset.create({ data: k }),
      `komponen preset ${k.nama} (Rp${k.harga})`,
    )
  }

  // 4. Labor preset — helm tiers existing jadi preset bawaan
  const preparer = await configNum('kalk.preparer.perJam', 35000)
  const finisher = await configNum('kalk.finisher.perJam', 75000)
  const consumables = await configNum('kalk.helm.consumables.default', 55000)
  const HELM_TIERS: Record<string, { s: number; p: number; a: number }> = {
    MINIMAL: { s: 0.5, p: 0.5, a: 0.25 },
    LIGHT: { s: 1.5, p: 1.0, a: 0.5 },
    MEDIUM: { s: 2.5, p: 2.0, a: 0.75 },
    HEAVY: { s: 4.0, p: 3.5, a: 1.0 },
  }
  for (const [tier, t] of Object.entries(HELM_TIERS)) {
    const items = [
      { nama: 'Preparer (sanding + assembly)', jam: t.s + t.a, ratePerJam: preparer },
      { nama: 'Finisher (painting)', jam: t.p, ratePerJam: finisher },
      { nama: 'Consumables finishing', flat: consumables },
    ]
    await createIfMissing(
      () => prisma.laborPreset.findUnique({ where: { nama: `Helm ${tier}` } }),
      () => prisma.laborPreset.create({ data: { nama: `Helm ${tier}`, itemsJson: JSON.stringify(items) } }),
      `labor preset Helm ${tier}`,
    )
  }

  // 5. Channel fee — Config keys dinamis (pola kalk.packing.*)
  const adminEcommerce = await configNum('kalk.adminEcommerce', 1.2)
  const channels: { key: string; value: string }[] = [
    { key: 'kalk.channel.offline', value: '1' },
    { key: 'kalk.channel.shopee', value: String(adminEcommerce) },
  ]
  for (const c of channels) {
    await createIfMissing(
      () => prisma.config.findUnique({ where: { key: c.key } }),
      () => prisma.config.create({ data: c }),
      `config ${c.key}=${c.value}`,
    )
  }

  console.log('Seed kalkulator v2 selesai.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Registrasi script npm**

Di `apps/dashboard/package.json`, tambah di `scripts` (setelah `"db:seed"`):

```json
"db:seed-kalk-v2": "tsx scripts/seed-kalkulator-v2.ts",
```

- [ ] **Step 3: Jalankan dua kali (bukti idempoten)**

```bash
pnpm --filter shopee-dashboard db:seed-kalk-v2
pnpm --filter shopee-dashboard db:seed-kalk-v2
```

Expected: run pertama semua `create …`; run kedua semua `skip … (sudah ada)`. Laporkan output kedua run.

- [ ] **Step 4: Verifikasi isi via Prisma**

```bash
pnpm --filter shopee-dashboard exec tsx -e "
import { prisma } from './lib/db'
Promise.all([
  prisma.kalkPrinterProfile.count(),
  prisma.kalkMaterialProfile.count(),
  prisma.komponenPreset.count(),
  prisma.laborPreset.count(),
]).then(c => { console.log({ printer: c[0], material: c[1], komponen: c[2], labor: c[3] }); return prisma.\$disconnect() })
"
```

Expected: `{ printer: 1, material: 2, komponen: 6, labor: 4 }` (atau lebih kalau DB sudah pernah diisi manual).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/scripts/seed-kalkulator-v2.ts apps/dashboard/package.json
git commit -m "feat(kalkulator): seed idempoten profiles/presets v2 dari Config existing" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Service CRUD profiles & presets (TDD)

**Files:**
- Create: `apps/dashboard/lib/kalkulator/profiles-service.ts`
- Test: `apps/dashboard/lib/kalkulator/__tests__/profiles-service.test.ts`

**Interfaces:**
- Consumes: `hitungMesinPerJam`, tipe `LaborItem` dari `@3pb/kalkulator-core`; prisma dari `@/lib/db`.
- Produces (dipakai Task 5 routes & UI 0b-2):

```ts
interface PrinterProfileData { id: string; nama: string; mesinPerJam: number; watt: number | null; tarifPerKwh: number | null; hargaPrinter: number | null; umurPakaiJam: number | null; maintenancePerJam: number | null; isDefault: boolean }
interface PrinterProfileInput { nama: string; mesinPerJam?: number; watt?: number; tarifPerKwh?: number; hargaPrinter?: number; umurPakaiJam?: number; maintenancePerJam?: number }
listPrinterProfiles(): Promise<PrinterProfileData[]>
createPrinterProfile(input: PrinterProfileInput): Promise<PrinterProfileData>   // mesinPerJam langsung ATAU derive dari breakdown
updatePrinterProfile(id: string, input: Partial<PrinterProfileInput>): Promise<PrinterProfileData>
deletePrinterProfile(id: string): Promise<void>                                  // throw Error('DEFAULT_PROFILE') kalau isDefault
setDefaultPrinterProfile(id: string): Promise<void>

interface MaterialProfileData { id: string; nama: string; tipe: string; hppPerGram: number; jualPerGram: number; failureRatePct: number }
listMaterialProfiles(): Promise<MaterialProfileData[]>
upsertMaterialProfile(input: { nama: string; tipe: 'FDM' | 'SLA'; hppPerGram: number; jualPerGram: number; failureRatePct: number }): Promise<MaterialProfileData>
deleteMaterialProfile(id: string): Promise<void>

interface KomponenPresetData { id: string; nama: string; harga: number; isActive: boolean }
listKomponenPresets(): Promise<KomponenPresetData[]>
upsertKomponenPreset(input: { nama: string; harga: number; isActive?: boolean }): Promise<KomponenPresetData>
deleteKomponenPreset(id: string): Promise<void>

interface LaborPresetData { id: string; nama: string; items: LaborItem[] }
listLaborPresets(): Promise<LaborPresetData[]>
upsertLaborPreset(input: { nama: string; items: LaborItem[] }): Promise<LaborPresetData>  // throw Error('INVALID_ITEMS') kalau item tanpa nama atau tanpa (jam×ratePerJam) maupun flat
deleteLaborPreset(id: string): Promise<void>
```

- [ ] **Step 1: Tulis failing tests**

File `apps/dashboard/lib/kalkulator/__tests__/profiles-service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    kalkPrinterProfile: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    kalkMaterialProfile: { findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    komponenPreset: { findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    laborPreset: { findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(async (fns: unknown[]) => Promise.all(fns as Promise<unknown>[])),
  },
}))

import { prisma } from '@/lib/db'
import {
  createPrinterProfile, deletePrinterProfile, setDefaultPrinterProfile,
  upsertLaborPreset, listLaborPresets,
} from '../profiles-service'

const db = prisma as any
const row = (over = {}) => ({
  id: 'p1', nama: 'P1P', mesinPerJam: 4000, watt: null, tarifPerKwh: null,
  hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null, isDefault: false,
  createdAt: new Date(), updatedAt: new Date(), ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('createPrinterProfile', () => {
  it('pakai mesinPerJam langsung kalau diberikan', async () => {
    db.kalkPrinterProfile.create.mockResolvedValue(row())
    await createPrinterProfile({ nama: 'P1P', mesinPerJam: 4000 })
    expect(db.kalkPrinterProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mesinPerJam: 4000 }) })
    )
  })

  it('derive mesinPerJam dari breakdown kalau tidak diberikan', async () => {
    db.kalkPrinterProfile.create.mockResolvedValue(row())
    // 300W × Rp1500/kWh = 450; 6jt/6000jam = 1000; maintenance 50 → 1500
    await createPrinterProfile({ nama: 'X1C', watt: 300, tarifPerKwh: 1500, hargaPrinter: 6_000_000, umurPakaiJam: 6000, maintenancePerJam: 50 })
    expect(db.kalkPrinterProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mesinPerJam: 1500 }) })
    )
  })

  it('throw INVALID_INPUT kalau tidak ada mesinPerJam maupun breakdown lengkap', async () => {
    await expect(createPrinterProfile({ nama: 'Kosong' })).rejects.toThrow('INVALID_INPUT')
  })
})

describe('deletePrinterProfile', () => {
  it('menolak hapus profile default', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(row({ isDefault: true }))
    await expect(deletePrinterProfile('p1')).rejects.toThrow('DEFAULT_PROFILE')
    expect(db.kalkPrinterProfile.delete).not.toHaveBeenCalled()
  })

  it('hapus profile non-default', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(row({ isDefault: false }))
    db.kalkPrinterProfile.delete.mockResolvedValue(row())
    await deletePrinterProfile('p1')
    expect(db.kalkPrinterProfile.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
  })
})

describe('setDefaultPrinterProfile', () => {
  it('unset default lain lalu set target', async () => {
    db.kalkPrinterProfile.updateMany.mockResolvedValue({ count: 1 })
    db.kalkPrinterProfile.update.mockResolvedValue(row({ isDefault: true }))
    await setDefaultPrinterProfile('p2')
    expect(db.kalkPrinterProfile.updateMany).toHaveBeenCalledWith({ where: { isDefault: true }, data: { isDefault: false } })
    expect(db.kalkPrinterProfile.update).toHaveBeenCalledWith({ where: { id: 'p2' }, data: { isDefault: true } })
  })
})

describe('labor preset', () => {
  it('upsert menolak item tanpa biaya (tanpa jam×rate dan tanpa flat)', async () => {
    await expect(upsertLaborPreset({ nama: 'X', items: [{ nama: 'kosong' }] })).rejects.toThrow('INVALID_ITEMS')
  })

  it('upsert valid: serialize itemsJson', async () => {
    const items = [{ nama: 'Sanding', jam: 1, ratePerJam: 35000 }]
    db.laborPreset.upsert.mockResolvedValue({ id: 'l1', nama: 'X', itemsJson: JSON.stringify(items), createdAt: new Date(), updatedAt: new Date() })
    const out = await upsertLaborPreset({ nama: 'X', items })
    expect(out.items).toEqual(items)
    expect(db.laborPreset.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { nama: 'X' },
      create: expect.objectContaining({ itemsJson: JSON.stringify(items) }),
    }))
  })

  it('list mem-parse itemsJson; row korup dilewati dengan items kosong', async () => {
    db.laborPreset.findMany.mockResolvedValue([
      { id: 'l1', nama: 'OK', itemsJson: '[{"nama":"A","flat":100}]', createdAt: new Date(), updatedAt: new Date() },
      { id: 'l2', nama: 'Korup', itemsJson: '{bukan json', createdAt: new Date(), updatedAt: new Date() },
    ])
    const out = await listLaborPresets()
    expect(out[0].items).toEqual([{ nama: 'A', flat: 100 }])
    expect(out[1].items).toEqual([])
  })
})
```

- [ ] **Step 2: Jalankan — harus FAIL**

Run: `pnpm --filter shopee-dashboard exec vitest run lib/kalkulator/__tests__/profiles-service.test.ts`
Expected: FAIL — `Cannot find module '../profiles-service'`.

- [ ] **Step 3: Implementasi**

File `apps/dashboard/lib/kalkulator/profiles-service.ts`:

```ts
import { prisma } from '@/lib/db'
import { hitungMesinPerJam, type LaborItem } from '@3pb/kalkulator-core'

// ── Printer profile ──────────────────────────────────────────────────────────

export interface PrinterProfileData {
  id: string
  nama: string
  mesinPerJam: number
  watt: number | null
  tarifPerKwh: number | null
  hargaPrinter: number | null
  umurPakaiJam: number | null
  maintenancePerJam: number | null
  isDefault: boolean
}

export interface PrinterProfileInput {
  nama: string
  mesinPerJam?: number
  watt?: number
  tarifPerKwh?: number
  hargaPrinter?: number
  umurPakaiJam?: number
  maintenancePerJam?: number
}

type PrinterRow = PrinterProfileData & { createdAt: Date; updatedAt: Date }

function toPrinterData(r: PrinterRow): PrinterProfileData {
  const { createdAt, updatedAt, ...data } = r
  return data
}

/** mesinPerJam eksplisit menang; kalau tidak ada, derive dari breakdown lengkap. */
function resolveMesinPerJam(input: PrinterProfileInput): number {
  if (input.mesinPerJam !== undefined) return input.mesinPerJam
  if (input.watt !== undefined && input.tarifPerKwh !== undefined
      && input.hargaPrinter !== undefined && input.umurPakaiJam !== undefined) {
    return hitungMesinPerJam({
      watt: input.watt,
      tarifPerKwh: input.tarifPerKwh,
      hargaPrinter: input.hargaPrinter,
      umurPakaiJam: input.umurPakaiJam,
      maintenancePerJam: input.maintenancePerJam,
    })
  }
  throw new Error('INVALID_INPUT')
}

export async function listPrinterProfiles(): Promise<PrinterProfileData[]> {
  const rows = await prisma.kalkPrinterProfile.findMany({ orderBy: [{ isDefault: 'desc' }, { nama: 'asc' }] })
  return rows.map(toPrinterData)
}

export async function createPrinterProfile(input: PrinterProfileInput): Promise<PrinterProfileData> {
  const mesinPerJam = resolveMesinPerJam(input)
  const row = await prisma.kalkPrinterProfile.create({
    data: {
      nama: input.nama.trim(),
      mesinPerJam,
      watt: input.watt ?? null,
      tarifPerKwh: input.tarifPerKwh ?? null,
      hargaPrinter: input.hargaPrinter ?? null,
      umurPakaiJam: input.umurPakaiJam ?? null,
      maintenancePerJam: input.maintenancePerJam ?? null,
    },
  })
  return toPrinterData(row)
}

export async function updatePrinterProfile(id: string, input: Partial<PrinterProfileInput>): Promise<PrinterProfileData> {
  const existing = await prisma.kalkPrinterProfile.findUnique({ where: { id } })
  if (!existing) throw new Error('NOT_FOUND')
  const merged: PrinterProfileInput = {
    nama: input.nama ?? existing.nama,
    mesinPerJam: input.mesinPerJam,
    watt: input.watt ?? existing.watt ?? undefined,
    tarifPerKwh: input.tarifPerKwh ?? existing.tarifPerKwh ?? undefined,
    hargaPrinter: input.hargaPrinter ?? existing.hargaPrinter ?? undefined,
    umurPakaiJam: input.umurPakaiJam ?? existing.umurPakaiJam ?? undefined,
    maintenancePerJam: input.maintenancePerJam ?? existing.maintenancePerJam ?? undefined,
  }
  // Kalau caller tidak mengirim mesinPerJam eksplisit dan tidak ada breakdown lengkap,
  // pertahankan nilai lama.
  let mesinPerJam: number
  try {
    mesinPerJam = resolveMesinPerJam(merged)
  } catch {
    mesinPerJam = existing.mesinPerJam
  }
  const row = await prisma.kalkPrinterProfile.update({
    where: { id },
    data: {
      nama: merged.nama.trim(),
      mesinPerJam,
      watt: merged.watt ?? null,
      tarifPerKwh: merged.tarifPerKwh ?? null,
      hargaPrinter: merged.hargaPrinter ?? null,
      umurPakaiJam: merged.umurPakaiJam ?? null,
      maintenancePerJam: merged.maintenancePerJam ?? null,
    },
  })
  return toPrinterData(row)
}

export async function deletePrinterProfile(id: string): Promise<void> {
  const existing = await prisma.kalkPrinterProfile.findUnique({ where: { id } })
  if (existing?.isDefault) throw new Error('DEFAULT_PROFILE')
  await prisma.kalkPrinterProfile.delete({ where: { id } })
}

export async function setDefaultPrinterProfile(id: string): Promise<void> {
  await prisma.kalkPrinterProfile.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
  await prisma.kalkPrinterProfile.update({ where: { id }, data: { isDefault: true } })
}

// ── Material profile ─────────────────────────────────────────────────────────

export interface MaterialProfileData {
  id: string
  nama: string
  tipe: string
  hppPerGram: number
  jualPerGram: number
  failureRatePct: number
}

export interface MaterialProfileInput {
  nama: string
  tipe: 'FDM' | 'SLA'
  hppPerGram: number
  jualPerGram: number
  failureRatePct: number
}

export async function listMaterialProfiles(): Promise<MaterialProfileData[]> {
  const rows = await prisma.kalkMaterialProfile.findMany({ orderBy: [{ tipe: 'asc' }, { nama: 'asc' }] })
  return rows.map(({ createdAt, updatedAt, ...m }) => m)
}

export async function upsertMaterialProfile(input: MaterialProfileInput): Promise<MaterialProfileData> {
  const data = { ...input, nama: input.nama.trim() }
  const { createdAt, updatedAt, ...row } = await prisma.kalkMaterialProfile.upsert({
    where: { nama_tipe: { nama: data.nama, tipe: data.tipe } },
    create: data,
    update: { hppPerGram: data.hppPerGram, jualPerGram: data.jualPerGram, failureRatePct: data.failureRatePct },
  })
  return row
}

export async function deleteMaterialProfile(id: string): Promise<void> {
  await prisma.kalkMaterialProfile.delete({ where: { id } })
}

// ── Komponen preset ──────────────────────────────────────────────────────────

export interface KomponenPresetData {
  id: string
  nama: string
  harga: number
  isActive: boolean
}

export async function listKomponenPresets(): Promise<KomponenPresetData[]> {
  const rows = await prisma.komponenPreset.findMany({ orderBy: { nama: 'asc' } })
  return rows.map(({ createdAt, updatedAt, ...k }) => k)
}

export async function upsertKomponenPreset(input: { nama: string; harga: number; isActive?: boolean }): Promise<KomponenPresetData> {
  const nama = input.nama.trim()
  const { createdAt, updatedAt, ...row } = await prisma.komponenPreset.upsert({
    where: { nama },
    create: { nama, harga: input.harga, isActive: input.isActive ?? true },
    update: { harga: input.harga, ...(input.isActive !== undefined && { isActive: input.isActive }) },
  })
  return row
}

export async function deleteKomponenPreset(id: string): Promise<void> {
  await prisma.komponenPreset.delete({ where: { id } })
}

// ── Labor preset ─────────────────────────────────────────────────────────────

export interface LaborPresetData {
  id: string
  nama: string
  items: LaborItem[]
}

function parseItems(itemsJson: string): LaborItem[] {
  try {
    const parsed = JSON.parse(itemsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function validateItems(items: LaborItem[]): void {
  const valid = items.length > 0 && items.every(i =>
    i.nama?.trim() && (((i.jam ?? 0) > 0 && (i.ratePerJam ?? 0) > 0) || (i.flat ?? 0) > 0)
  )
  if (!valid) throw new Error('INVALID_ITEMS')
}

export async function listLaborPresets(): Promise<LaborPresetData[]> {
  const rows = await prisma.laborPreset.findMany({ orderBy: { nama: 'asc' } })
  return rows.map(r => ({ id: r.id, nama: r.nama, items: parseItems(r.itemsJson) }))
}

export async function upsertLaborPreset(input: { nama: string; items: LaborItem[] }): Promise<LaborPresetData> {
  validateItems(input.items)
  const nama = input.nama.trim()
  const itemsJson = JSON.stringify(input.items)
  const row = await prisma.laborPreset.upsert({
    where: { nama },
    create: { nama, itemsJson },
    update: { itemsJson },
  })
  return { id: row.id, nama: row.nama, items: parseItems(row.itemsJson) }
}

export async function deleteLaborPreset(id: string): Promise<void> {
  await prisma.laborPreset.delete({ where: { id } })
}
```

- [ ] **Step 4: Jalankan test — PASS**

Run: `pnpm --filter shopee-dashboard exec vitest run lib/kalkulator/__tests__/profiles-service.test.ts`
Expected: 9 test PASS.

- [ ] **Step 5: Full suite + commit**

```bash
pnpm --filter shopee-dashboard test
git add apps/dashboard/lib/kalkulator/profiles-service.ts apps/dashboard/lib/kalkulator/__tests__/profiles-service.test.ts
git commit -m "feat(kalkulator): service CRUD printer/material profile + komponen/labor preset" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Loader `SettingsV2` dari Config (TDD)

**Files:**
- Create: `apps/dashboard/lib/kalkulator/settings-v2.ts`
- Test: `apps/dashboard/lib/kalkulator/__tests__/settings-v2.test.ts`

**Interfaces:**
- Consumes: tipe `SettingsV2`, `ChannelDef` dari `@3pb/kalkulator-core`; prisma dari `@/lib/db`.
- Produces: `loadSettingsV2(): Promise<SettingsV2>` — dipakai service kalkulasi & UI di Fase 0b-2, dan route Task 5.

- [ ] **Step 1: Failing tests**

File `apps/dashboard/lib/kalkulator/__tests__/settings-v2.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ prisma: { config: { findMany: vi.fn() } } }))

import { prisma } from '@/lib/db'
import { loadSettingsV2 } from '../settings-v2'

const mockFindMany = (prisma as any).config.findMany
const rows = (obj: Record<string, string>) => Object.entries(obj).map(([key, value]) => ({ key, value }))

beforeEach(() => vi.clearAllMocks())

describe('loadSettingsV2', () => {
  it('default lengkap saat Config kosong (channel fallback offline+shopee dari adminEcommerce default)', async () => {
    mockFindMany.mockResolvedValue([])
    const s = await loadSettingsV2()
    expect(s.failureSpreadPct).toBe(50)
    expect(s.testLayerPct).toBe(5)
    expect(s.marginMultipliers).toEqual({ A: 1.1, B: 1.5, C: 2.0 })
    expect(s.resellerBulkMultiplier).toBe(1.05)
    expect(s.channels).toEqual([
      { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
      { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 },
    ])
  })

  it('membaca channel dinamis kalk.channel.* — offline selalu pertama, sisanya alfabetis', async () => {
    mockFindMany.mockResolvedValue(rows({
      'kalk.channel.tokopedia': '1.1',
      'kalk.channel.offline': '1',
      'kalk.channel.shopee': '1.25',
      'kalk.failureSpread.pct': '40',
    }))
    const s = await loadSettingsV2()
    expect(s.failureSpreadPct).toBe(40)
    expect(s.channels).toEqual([
      { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
      { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.25 },
      { id: 'tokopedia', nama: 'Tokopedia', feeMultiplier: 1.1 },
    ])
  })

  it('nilai channel non-angka dilewati', async () => {
    mockFindMany.mockResolvedValue(rows({
      'kalk.channel.offline': '1',
      'kalk.channel.rusak': 'abc',
    }))
    const s = await loadSettingsV2()
    expect(s.channels.map(c => c.id)).toEqual(['offline'])
  })
})
```

- [ ] **Step 2: Run — FAIL** (`Cannot find module '../settings-v2'`)

- [ ] **Step 3: Implementasi**

File `apps/dashboard/lib/kalkulator/settings-v2.ts`:

```ts
import { prisma } from '@/lib/db'
import type { SettingsV2, ChannelDef } from '@3pb/kalkulator-core'

const CHANNEL_PREFIX = 'kalk.channel.'

function capitalize(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

/**
 * SettingsV2 dari Config kalk.* — channel via key dinamis kalk.channel.<id>
 * (pola sama dengan kalk.packing.*; edit lewat PUT /api/kalkulator/rates existing).
 * failureRatePct global TIDAK ada di sini — di v2 failure rate milik material profile.
 */
export async function loadSettingsV2(): Promise<SettingsV2> {
  const configs = await prisma.config.findMany({ where: { key: { startsWith: 'kalk.' } } })
  const map = Object.fromEntries(configs.map(c => [c.key, c.value]))

  const channels: ChannelDef[] = []
  for (const [key, val] of Object.entries(map)) {
    if (!key.startsWith(CHANNEL_PREFIX)) continue
    const id = key.slice(CHANNEL_PREFIX.length)
    const feeMultiplier = parseFloat(val)
    if (!id || !Number.isFinite(feeMultiplier)) continue
    channels.push({ id, nama: capitalize(id), feeMultiplier })
  }
  channels.sort((a, b) => (a.id === 'offline' ? -1 : b.id === 'offline' ? 1 : a.id.localeCompare(b.id)))

  if (channels.length === 0) {
    const adminEcommerce = parseFloat(map['kalk.adminEcommerce'] ?? '1.2')
    channels.push(
      { id: 'offline', nama: 'Offline', feeMultiplier: 1 },
      { id: 'shopee', nama: 'Shopee', feeMultiplier: Number.isFinite(adminEcommerce) ? adminEcommerce : 1.2 },
    )
  }

  return {
    failureSpreadPct: parseFloat(map['kalk.failureSpread.pct'] ?? '50'),
    testLayerPct: parseFloat(map['kalk.testLayer.pct'] ?? '5'),
    marginMultipliers: {
      A: parseFloat(map['kalk.margin.a'] ?? '1.1'),
      B: parseFloat(map['kalk.margin.b'] ?? '1.5'),
      C: parseFloat(map['kalk.margin.c'] ?? '2.0'),
    },
    resellerBulkMultiplier: parseFloat(map['kalk.resellerBulk.multiplier'] ?? '1.05'),
    channels,
  }
}
```

- [ ] **Step 4: Run — PASS** (3 test)

- [ ] **Step 5: Full suite + commit**

```bash
pnpm --filter shopee-dashboard test
git add apps/dashboard/lib/kalkulator/settings-v2.ts apps/dashboard/lib/kalkulator/__tests__/settings-v2.test.ts
git commit -m "feat(kalkulator): loadSettingsV2 — SettingsV2 dari Config, channel dinamis kalk.channel.*" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: API routes profiles/presets/settings-v2

**Files:**
- Create: `apps/dashboard/app/api/kalkulator/printer-profiles/route.ts`
- Create: `apps/dashboard/app/api/kalkulator/printer-profiles/[id]/route.ts`
- Create: `apps/dashboard/app/api/kalkulator/printer-profiles/[id]/default/route.ts`
- Create: `apps/dashboard/app/api/kalkulator/material-profiles/route.ts`
- Create: `apps/dashboard/app/api/kalkulator/material-profiles/[id]/route.ts`
- Create: `apps/dashboard/app/api/kalkulator/komponen-presets/route.ts`
- Create: `apps/dashboard/app/api/kalkulator/komponen-presets/[id]/route.ts`
- Create: `apps/dashboard/app/api/kalkulator/labor-presets/route.ts`
- Create: `apps/dashboard/app/api/kalkulator/labor-presets/[id]/route.ts`
- Create: `apps/dashboard/app/api/kalkulator/settings-v2/route.ts`
- Test: `apps/dashboard/lib/kalkulator/__tests__/profiles-routes.test.ts`

**Interfaces:**
- Consumes: semua fungsi Task 3 + `loadSettingsV2` Task 4; `auth` dari `@/lib/auth`.
- Produces: endpoint untuk UI Fase 0b-2 — `GET/POST /api/kalkulator/printer-profiles`, `PUT/DELETE .../printer-profiles/[id]`, `PUT .../printer-profiles/[id]/default`, `GET/POST + DELETE[id]` untuk material-profiles / komponen-presets / labor-presets, `GET /api/kalkulator/settings-v2`.
- Channel fee TIDAK butuh route baru (edit via PUT `/api/kalkulator/rates` dengan key `kalk.channel.<id>`).

Catatan pola (ikuti `app/api/kalkulator/rates/route.ts`): setiap handler mulai dengan guard `auth()` → 401. Di Next 16, params route dinamis adalah Promise: `{ params }: { params: Promise<{ id: string }> }` lalu `const { id } = await params` — CEK dulu pola yang dipakai route existing `app/api/kalkulator/[id]/route.ts` dan tiru persis.

- [ ] **Step 1: Failing route tests**

File `apps/dashboard/lib/kalkulator/__tests__/profiles-routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
vi.mock('@/lib/kalkulator/profiles-service', () => ({
  listPrinterProfiles: vi.fn(), createPrinterProfile: vi.fn(),
  updatePrinterProfile: vi.fn(), deletePrinterProfile: vi.fn(), setDefaultPrinterProfile: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { GET, POST } from '@/app/api/kalkulator/printer-profiles/route'
import { DELETE } from '@/app/api/kalkulator/printer-profiles/[id]/route'
import { listPrinterProfiles, createPrinterProfile, deletePrinterProfile } from '@/lib/kalkulator/profiles-service'

const mockAuth = auth as any
const req = (body: unknown) => ({ json: async () => body } as any)
const ctx = (id: string) => ({ params: Promise.resolve({ id }) } as any)

beforeEach(() => { vi.clearAllMocks(); mockAuth.mockResolvedValue({ user: { name: 'a' } }) })

describe('printer-profiles routes', () => {
  it('401 tanpa session', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('GET mengembalikan list', async () => {
    ;(listPrinterProfiles as any).mockResolvedValue([{ id: 'p1', nama: 'P1P', mesinPerJam: 4000, isDefault: true }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json())[0].nama).toBe('P1P')
  })

  it('POST validasi nama wajib', async () => {
    const res = await POST(req({ mesinPerJam: 4000 }))
    expect(res.status).toBe(400)
  })

  it('POST INVALID_INPUT dari service → 400', async () => {
    ;(createPrinterProfile as any).mockRejectedValue(new Error('INVALID_INPUT'))
    const res = await POST(req({ nama: 'X' }))
    expect(res.status).toBe(400)
  })

  it('DELETE default profile → 400 DEFAULT_PROFILE', async () => {
    ;(deletePrinterProfile as any).mockRejectedValue(new Error('DEFAULT_PROFILE'))
    const res = await DELETE(req(undefined), ctx('p1'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('DEFAULT_PROFILE')
  })
})
```

- [ ] **Step 2: Run — FAIL** (module not found)

- [ ] **Step 3: Implementasi routes**

`apps/dashboard/app/api/kalkulator/printer-profiles/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listPrinterProfiles, createPrinterProfile } from '@/lib/kalkulator/profiles-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listPrinterProfiles())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.nama?.trim()) return NextResponse.json({ error: 'nama wajib diisi' }, { status: 400 })
  try {
    return NextResponse.json(await createPrinterProfile(body), { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'INVALID_INPUT') return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

`apps/dashboard/app/api/kalkulator/printer-profiles/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { updatePrinterProfile, deletePrinterProfile } from '@/lib/kalkulator/profiles-service'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    return NextResponse.json(await updatePrinterProfile(id, await req.json()))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    const status = msg === 'NOT_FOUND' ? 404 : msg === 'INVALID_INPUT' ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await deletePrinterProfile(id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    const status = msg === 'DEFAULT_PROFILE' ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
```

`apps/dashboard/app/api/kalkulator/printer-profiles/[id]/default/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setDefaultPrinterProfile } from '@/lib/kalkulator/profiles-service'

export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await setDefaultPrinterProfile(id)
  return new NextResponse(null, { status: 204 })
}
```

`apps/dashboard/app/api/kalkulator/material-profiles/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listMaterialProfiles, upsertMaterialProfile } from '@/lib/kalkulator/profiles-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listMaterialProfiles())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.nama?.trim()) return NextResponse.json({ error: 'nama wajib diisi' }, { status: 400 })
  if (body.tipe !== 'FDM' && body.tipe !== 'SLA') return NextResponse.json({ error: 'tipe harus FDM/SLA' }, { status: 400 })
  const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  if (!n(body.hppPerGram) || !n(body.jualPerGram) || !n(body.failureRatePct)) {
    return NextResponse.json({ error: 'hppPerGram/jualPerGram/failureRatePct harus angka ≥ 0' }, { status: 400 })
  }
  return NextResponse.json(await upsertMaterialProfile(body), { status: 201 })
}
```

`apps/dashboard/app/api/kalkulator/material-profiles/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deleteMaterialProfile } from '@/lib/kalkulator/profiles-service'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deleteMaterialProfile(id)
  return new NextResponse(null, { status: 204 })
}
```

`apps/dashboard/app/api/kalkulator/komponen-presets/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listKomponenPresets, upsertKomponenPreset } from '@/lib/kalkulator/profiles-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listKomponenPresets())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.nama?.trim()) return NextResponse.json({ error: 'nama wajib diisi' }, { status: 400 })
  if (typeof body.harga !== 'number' || !Number.isFinite(body.harga) || body.harga < 0) {
    return NextResponse.json({ error: 'harga harus angka ≥ 0' }, { status: 400 })
  }
  return NextResponse.json(await upsertKomponenPreset(body), { status: 201 })
}
```

`apps/dashboard/app/api/kalkulator/komponen-presets/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deleteKomponenPreset } from '@/lib/kalkulator/profiles-service'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deleteKomponenPreset(id)
  return new NextResponse(null, { status: 204 })
}
```

`apps/dashboard/app/api/kalkulator/labor-presets/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { listLaborPresets, upsertLaborPreset } from '@/lib/kalkulator/profiles-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await listLaborPresets())
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  if (!body?.nama?.trim()) return NextResponse.json({ error: 'nama wajib diisi' }, { status: 400 })
  try {
    return NextResponse.json(await upsertLaborPreset(body), { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'INVALID_ITEMS') return NextResponse.json({ error: 'INVALID_ITEMS' }, { status: 400 })
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

`apps/dashboard/app/api/kalkulator/labor-presets/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { deleteLaborPreset } from '@/lib/kalkulator/profiles-service'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await deleteLaborPreset(id)
  return new NextResponse(null, { status: 204 })
}
```

`apps/dashboard/app/api/kalkulator/settings-v2/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadSettingsV2 } from '@/lib/kalkulator/settings-v2'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await loadSettingsV2())
}
```

- [ ] **Step 4: Run test — PASS** (5 test) lalu full suite + build

```bash
pnpm --filter shopee-dashboard exec vitest run lib/kalkulator/__tests__/profiles-routes.test.ts
pnpm --filter shopee-dashboard test
pnpm --filter shopee-dashboard build
```

Expected: build sukses — route baru muncul di output build.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/api/kalkulator apps/dashboard/lib/kalkulator/__tests__/profiles-routes.test.ts
git commit -m "feat(kalkulator): API routes printer/material profile, komponen/labor preset, settings-v2" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verifikasi akhir & dokumentasi

**Files:**
- Modify: `docs/kalkulator-formula.md` (update blok Status)
- Modify: `CLAUDE.md` (root — tambah 1 baris perintah seed di section Perintah)

**Interfaces:**
- Consumes: semua task sebelumnya.

- [ ] **Step 1: Verifikasi penuh dari root**

```bash
pnpm turbo test
pnpm turbo lint
pnpm turbo build
```

Expected: test ≥ 152 PASS total (135 existing + 17 baru), lint tanpa ERROR baru, build sukses.

- [ ] **Step 2: Smoke API headless**

```bash
pnpm --filter shopee-dashboard dev &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/kalkulator/printer-profiles   # expected: 401 (auth guard jalan)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/kalkulator/settings-v2        # expected: 401
kill %1
```

(401 = route ter-register + guard bekerja; akses ber-session diverifikasi manual di 0b-2.)

- [ ] **Step 3: Update docs**

Di `docs/kalkulator-formula.md`, ganti blok `> **Status:** …` di atas menjadi:

```markdown
> **Status:** Fase 0 selesai (formula di `packages/kalkulator-core`; legacy `hitungKalkulasi` = wrapper di atas `hitungKalkulasiV2`). **Fase 0b-1 selesai** — backend v2 internal siap: tabel `KalkPrinterProfile`/`KalkMaterialProfile`/`KomponenPreset`/`LaborPreset` (+seed `db:seed-kalk-v2`), `loadSettingsV2()` (channel via Config `kalk.channel.<id>`), API CRUD di `/api/kalkulator/{printer-profiles,material-profiles,komponen-presets,labor-presets,settings-v2}`. Menyusul Fase 0b-2: UI settings + form kalkulator pindah ke v2 + migrasi data helm/aksesori + drop kolom legacy.
```

Di `CLAUDE.md` root, section Perintah, tambah setelah baris `pnpm --filter @3pb/kalkulator-core test`:

```bash
pnpm --filter shopee-dashboard db:seed-kalk-v2   # seed profiles/presets kalkulator v2 (idempoten)
```

- [ ] **Step 4: Commit penutup**

```bash
git add -A
git commit -m "docs: tandai Fase 0b-1 backend kalkulator v2 selesai" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Laporkan ke user** — ringkasan + tawarkan merge/PR; ingatkan bahwa saat deploy nanti perlu jalankan seed sekali di production (`db push` otomatis via entrypoint, seed manual).

---

## Catatan scope

- **Plan ini (0b-1)**: fondasi data & API, murni aditif, dashboard tidak berubah perilaku. Kolom legacy (gantungan/switch/label/helm) TIDAK disentuh.
- **Plan berikutnya (0b-2)**: hooks TanStack Query + settings cards UI (printer/material/komponen/labor/channel), `KalkulasiForm` & `HasilPanel` & `PlateTable` pindah ke `hitungKalkulasiV2` (labor section generik, komponen preset picker, printer dropdown dari profile), perubahan `KalkulasiInput` + service `buildHasil` ke v2, migrasi data kalkulasi existing (helm→`KalkulasiLabor`, gantungan/switch/label→`KomponenKustom`), drop kolom legacy, dan update bot route bila perlu.
