# FilamentHarga Moving Average Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Otomatis hitung `hargaPerGram` di FilamentHarga catalog dari moving average harga beli spool (PO), dengan tombol manual recompute di Settings dan auto-trigger saat PO diterima.

**Architecture:** Fungsi `recomputeFilamentHarga()` di service layer menghitung `AVG(Spool.hargaBeli) / 1000` per `brand+material` lalu upsert ke `FilamentHarga`. Dipanggil otomatis di akhir `receivePO()`, dan via API endpoint `POST /api/kalkulator/filament-harga/recompute` untuk trigger manual. UI menampilkan badge `spoolCount` per row di `KalkulatorSettingsCard`.

**Tech Stack:** Prisma (SQLite), Next.js App Router, TypeScript, React, Tanstack Query

---

## File Map

| File | Perubahan |
|------|-----------|
| `prisma/schema.prisma` | Tambah `spoolCount Int @default(0)` ke `FilamentHarga` |
| `prisma/migrations/20260524000001_filament_harga_spool_count/migration.sql` | Migration SQL |
| `lib/kalkulator/types.ts` | Tambah `spoolCount: number` ke `FilamentHargaData` |
| `lib/kalkulator/service.ts` | Tambah `recomputeFilamentHarga()`, update `upsertFilamentHarga` |
| `lib/po/service.ts` | Panggil `recomputeFilamentHarga()` setelah `receivePO()` |
| `app/api/kalkulator/filament-harga/recompute/route.ts` | Buat endpoint POST baru |
| `lib/hooks/use-kalkulator.ts` | Tambah `useRecomputeFilamentHarga()` hook |
| `components/settings/KalkulatorSettingsCard.tsx` | Tambah tabel FilamentHarga + badge spoolCount + tombol recompute |

---

## Task 1: Prisma Schema & Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260524000001_filament_harga_spool_count/migration.sql`

- [ ] **Step 1: Update schema.prisma**

Cari model `FilamentHarga` dan tambah field `spoolCount`:
```prisma
model FilamentHarga {
  id           String @id @default(cuid())
  brand        String
  material     String
  hargaPerGram Float
  spoolCount   Int    @default(0)
  @@unique([brand, material])
}
```

- [ ] **Step 2: Buat migration file**

Buat directory dan file `prisma/migrations/20260524000001_filament_harga_spool_count/migration.sql`:
```sql
ALTER TABLE "FilamentHarga" ADD COLUMN "spoolCount" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 3: Apply migration ke dev DB**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx prisma generate
```

Expected: `Generated Prisma Client` tanpa error. (Migration di-apply via `db push` di production, tidak perlu `migrate deploy` manual di dev.)

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260524000001_filament_harga_spool_count/
git commit -m "feat(db): add spoolCount to FilamentHarga"
```

---

## Task 2: Update Types & Service — recomputeFilamentHarga

**Files:**
- Modify: `lib/kalkulator/types.ts`
- Modify: `lib/kalkulator/service.ts`

- [ ] **Step 1: Update `FilamentHargaData` type**

Di `lib/kalkulator/types.ts`, update interface:
```ts
export interface FilamentHargaData {
  id: string
  brand: string
  material: string
  hargaPerGram: number
  spoolCount: number   // 0 = manual input, >0 = auto-computed dari spool
}
```

- [ ] **Step 2: Update `listFilamentHarga` di service.ts**

`lib/kalkulator/service.ts` — `listFilamentHarga` sudah return semua field dari Prisma, tidak perlu perubahan karena Prisma akan otomatis include `spoolCount`.

Verify dengan membaca fungsi:
```ts
export async function listFilamentHarga(): Promise<FilamentHargaData[]> {
  return prisma.filamentHarga.findMany({ orderBy: [{ brand: 'asc' }, { material: 'asc' }] })
}
```
Ini sudah return `spoolCount` karena Prisma include semua field by default.

- [ ] **Step 3: Update `upsertFilamentHarga` — preserve spoolCount for manual edits**

Ganti implementasi `upsertFilamentHarga` di `lib/kalkulator/service.ts`:
```ts
export async function upsertFilamentHarga(brand: string, material: string, hargaPerGram: number): Promise<FilamentHargaData> {
  return prisma.filamentHarga.upsert({
    where: { brand_material: { brand, material } },
    create: { brand, material, hargaPerGram, spoolCount: 0 },
    update: { hargaPerGram, spoolCount: 0 }, // manual edit resets spoolCount ke 0
  })
}
```

- [ ] **Step 4: Tambah `recomputeFilamentHarga()` di service.ts**

Tambah fungsi baru setelah `deleteFilamentHarga`:
```ts
export async function recomputeFilamentHarga(
  pairs?: { brand: string; material: string }[]
): Promise<number> {
  // Fetch semua spool dengan hargaBeli (dari PO)
  const spools = await prisma.spool.findMany({
    where: {
      hargaBeli: { not: null },
      ...(pairs && pairs.length > 0 && {
        OR: pairs.map(p => ({ brand: p.brand, material: p.material }))
      })
    },
    select: { brand: true, material: true, hargaBeli: true },
  })

  if (spools.length === 0) return 0

  // Group by brand + material
  const groups = new Map<string, { total: number; count: number; brand: string; material: string }>()
  for (const s of spools) {
    const key = `${s.brand}||${s.material}`
    const g = groups.get(key) ?? { total: 0, count: 0, brand: s.brand, material: s.material }
    g.total += s.hargaBeli!
    g.count++
    groups.set(key, g)
  }

  // Upsert FilamentHarga per group
  let updated = 0
  for (const g of groups.values()) {
    const hargaPerGram = Math.round(g.total / g.count / 1000 * 10) / 10 // 1 desimal
    await prisma.filamentHarga.upsert({
      where: { brand_material: { brand: g.brand, material: g.material } },
      update: { hargaPerGram, spoolCount: g.count },
      create: { brand: g.brand, material: g.material, hargaPerGram, spoolCount: g.count },
    })
    updated++
  }
  return updated
}
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/kalkulator/types.ts lib/kalkulator/service.ts
git commit -m "feat(service): add recomputeFilamentHarga moving average function"
```

---

## Task 3: Auto-trigger di receivePO

**Files:**
- Modify: `lib/po/service.ts`

- [ ] **Step 1: Import recomputeFilamentHarga**

Di `lib/po/service.ts`, tambah import di baris paling atas:
```ts
import { recomputeFilamentHarga } from '@/lib/kalkulator/service'
```

- [ ] **Step 2: Panggil recomputeFilamentHarga setelah transaction di receivePO**

Cari fungsi `receivePO` di `lib/po/service.ts`. Setelah blok `await prisma.$transaction([...])`, tambah:
```ts
  // Recompute FilamentHarga moving average untuk brand+material yang baru diterima
  const affectedPairs = po.items
    .filter(i => i.isFilament && i.brand && i.material)
    .map(i => ({ brand: i.brand!, material: i.material! }))
  if (affectedPairs.length > 0) {
    await recomputeFilamentHarga(affectedPairs)
  }
```

Fungsi `receivePO` yang sudah diupdate:
```ts
export async function receivePO(id: string): Promise<void> {
  const po = await getPO(id)
  if (!po) throw new Error('PO not found')
  if (po.status === 'RECEIVED') throw new Error('Already received')

  const allItemsTotal = po.items.reduce((s, i) => s + i.total, 0)

  const spoolsToCreate = []
  for (const item of po.items.filter(i => i.isFilament && i.brand && i.material)) {
    const qty = Math.floor(item.qty)
    const ongkirShare = allItemsTotal > 0 ? po.ongkir * (item.total / allItemsTotal) : 0
    const effectiveTotal = item.total + ongkirShare
    const hargaBeli = qty > 0 ? Math.round(effectiveTotal / qty) : null

    for (let i = 0; i < qty; i++) {
      spoolsToCreate.push({
        brand: item.brand!,
        material: item.material!,
        colorName: item.colorName ?? 'Unknown',
        colorHex: '#808080',
        status: 'new',
        notes: `PO: ${po.nomor ?? po.id} - ${item.namaProduct}`,
        catalogId: item.filamentCatalogId ?? null,
        hargaBeli,
      })
    }
  }

  await prisma.$transaction([
    ...spoolsToCreate.map(s => prisma.spool.create({ data: s })),
    prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'RECEIVED' },
    }),
  ])

  // Recompute FilamentHarga moving average untuk brand+material yang baru diterima
  const affectedPairs = po.items
    .filter(i => i.isFilament && i.brand && i.material)
    .map(i => ({ brand: i.brand!, material: i.material! }))
  if (affectedPairs.length > 0) {
    await recomputeFilamentHarga(affectedPairs)
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add lib/po/service.ts
git commit -m "feat(po): auto-recompute FilamentHarga after PO received"
```

---

## Task 4: API Endpoint — Manual Recompute

**Files:**
- Create: `app/api/kalkulator/filament-harga/recompute/route.ts`

- [ ] **Step 1: Buat file route**

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { recomputeFilamentHarga } from '@/lib/kalkulator/service'

export async function POST() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const updated = await recomputeFilamentHarga() // no filter = recompute semua
  return NextResponse.json({ updated })
}
```

- [ ] **Step 2: Test endpoint**

```bash
# Dari terminal, dengan cookie session (atau gunakan curl dengan auth)
# Cukup verify TypeScript saja di sini
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 3: Tambah hook di use-kalkulator.ts**

Di `lib/hooks/use-kalkulator.ts`, tambah hook baru setelah `useDeleteFilamentHarga`:
```ts
export function useRecomputeFilamentHarga() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number }>('/api/kalkulator/filament-harga/recompute', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: FILAMENT_KEY }),
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/kalkulator/filament-harga/recompute/route.ts lib/hooks/use-kalkulator.ts
git commit -m "feat(api): add FilamentHarga manual recompute endpoint and hook"
```

---

## Task 5: UI — KalkulatorSettingsCard

**Files:**
- Modify: `components/settings/KalkulatorSettingsCard.tsx`

Read file ini dulu sebelum edit. Tambah section FilamentHarga di bawah konten yang sudah ada.

- [ ] **Step 1: Tambah imports**

Di `KalkulatorSettingsCard.tsx`, tambah imports:
```ts
import { useFilamentHarga, useUpsertFilamentHarga, useDeleteFilamentHarga, useRecomputeFilamentHarga } from '@/lib/hooks/use-kalkulator'
import type { FilamentHargaData } from '@/lib/kalkulator/types'
```

- [ ] **Step 2: Tambah state untuk form tambah FilamentHarga**

Di dalam komponen, tambah state:
```ts
const { data: filamentHargaList } = useFilamentHarga()
const upsertFilamentHarga = useUpsertFilamentHarga()
const deleteFilamentHarga = useDeleteFilamentHarga()
const recompute = useRecomputeFilamentHarga()
const [fhBrand, setFhBrand] = useState('')
const [fhMaterial, setFhMaterial] = useState('')
const [fhHarga, setFhHarga] = useState('')
const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null)
```

- [ ] **Step 3: Tambah section FilamentHarga di return JSX**

Tambah section ini di dalam return, di bawah konten yang sudah ada (sebelum closing `</div>`):

```tsx
{/* ── FilamentHarga Catalog ── */}
<div style={innerStyle} className="space-y-3">
  <div className="flex items-center justify-between">
    <div className="text-xs font-semibold g-t2">🧵 Harga Filamen per Gram</div>
    <button
      onClick={async () => {
        setRecomputeMsg(null)
        const res = await recompute.mutateAsync()
        setRecomputeMsg(`✓ ${res.updated} rate diperbarui dari spool`)
        setTimeout(() => setRecomputeMsg(null), 4000)
      }}
      disabled={recompute.isPending}
      className="text-xs px-2.5 py-1 rounded-md transition-colors"
      style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc" }}
    >
      {recompute.isPending ? "Menghitung..." : "🔄 Hitung ulang dari PO"}
    </button>
  </div>
  {recomputeMsg && <div className="text-xs text-green-400">{recomputeMsg}</div>}
  <p className="text-xs g-t4">
    Rate ini dipakai di kalkulator HPP per plate. Auto-update saat PO diterima (moving average dari harga beli spool).
  </p>

  {/* Table */}
  <div className="space-y-1">
    {(filamentHargaList ?? []).map((f: FilamentHargaData) => (
      <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px]"
           style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
        <span className="text-xs g-t2 flex-1">{f.brand} · {f.material}</span>
        <span className="text-xs font-mono g-t1">Rp {f.hargaPerGram}/g</span>
        {f.spoolCount > 0 ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
            ⚡ {f.spoolCount} spool
          </span>
        ) : (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full g-t5"
                style={{ background: "var(--g-inner)", border: "1px solid var(--g-inner-border)" }}>
            ✏️ manual
          </span>
        )}
        <button
          onClick={() => deleteFilamentHarga.mutate(f.id)}
          className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1"
        >✕</button>
      </div>
    ))}
    {(filamentHargaList ?? []).length === 0 && (
      <div className="text-xs g-t5 text-center py-2">Belum ada data. Receive PO atau tambah manual.</div>
    )}
  </div>

  {/* Form tambah manual */}
  <div className="flex gap-2 flex-wrap items-end pt-1">
    <div className="flex flex-col gap-1">
      <label className="text-[10px] g-t4 uppercase tracking-wide">Brand</label>
      <input value={fhBrand} onChange={e => setFhBrand(e.target.value)}
        placeholder="eSUN" className="glass-input text-xs px-2 py-1.5 rounded-md w-24" />
    </div>
    <div className="flex flex-col gap-1">
      <label className="text-[10px] g-t4 uppercase tracking-wide">Material</label>
      <input value={fhMaterial} onChange={e => setFhMaterial(e.target.value)}
        placeholder="PLA+" className="glass-input text-xs px-2 py-1.5 rounded-md w-24" />
    </div>
    <div className="flex flex-col gap-1">
      <label className="text-[10px] g-t4 uppercase tracking-wide">Rp/gram</label>
      <input type="number" value={fhHarga} onChange={e => setFhHarga(e.target.value)}
        placeholder="280" className="glass-input text-xs px-2 py-1.5 rounded-md w-20" />
    </div>
    <button
      onClick={async () => {
        if (!fhBrand.trim() || !fhMaterial.trim() || !fhHarga) return
        await upsertFilamentHarga.mutateAsync({ brand: fhBrand.trim(), material: fhMaterial.trim(), hargaPerGram: parseFloat(fhHarga) })
        setFhBrand(''); setFhMaterial(''); setFhHarga('')
      }}
      disabled={upsertFilamentHarga.isPending || !fhBrand || !fhMaterial || !fhHarga}
      className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
    >
      + Tambah
    </button>
  </div>
</div>
```

Note: `innerStyle` sudah ada di komponen ini (lihat komponen existing). Kalau tidak ada, tambah:
```ts
const innerStyle: React.CSSProperties = {
  background: "var(--g-inner)",
  border: "1px solid var(--g-inner-border)",
  borderRadius: "0.5rem",
  padding: "0.75rem",
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add components/settings/KalkulatorSettingsCard.tsx
git commit -m "feat(ui): add FilamentHarga catalog with spoolCount badge and recompute button"
```

---

## Task 6: Deploy ke Homelab

**Files:** none (deploy only)

- [ ] **Step 1: Build & deploy**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis/shopee-dashboard
./deploy.sh 2>&1 | tail -15
```

Expected: Container up, schema synced via `prisma db push`.

- [ ] **Step 2: Verify**

```bash
docker -H tcp://192.168.88.113:2375 logs --tail 10 shopee-dashboard
```

Expected: `Your database is now in sync with your Prisma schema`.

- [ ] **Step 3: Smoke test**

1. Buka Settings → scroll ke "Harga Filamen per Gram"
2. Klik "🔄 Hitung ulang dari PO" → lihat berapa rate diperbarui
3. Receive sebuah PO filamen → cek FilamentHarga otomatis terupdate
