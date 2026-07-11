# Fase 0b-2a: Settings UI Kalkulator v2 + Carry-over Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UI settings untuk mengelola printer profile, material profile, komponen preset, labor preset, channel fee & margin (di halaman Settings dashboard internal), plus perbaikan carry-over dari final review 0b-1 — form kalkulator BELUM berubah (itu Fase 0b-2b).

**Architecture:** Aditif di UI: satu card baru `KalkulatorV2SettingsCard` (container) berisi 5 section component terpisah di `components/settings/kalkulator-v2/`, meniru gaya glass-card `KalkulatorSettingsCard.tsx` existing. Hooks TanStack Query baru di `use-kalkulator.ts` memakai helper `apiFetch` existing. Channel & margin diedit via PUT `/api/kalkulator/rates` existing (Config keys). Carry-over backend fixes (P2025→404, guard offline, dedup HELM_TIERS) dikerjakan duluan karena UI bergantung pada perilakunya.

**Tech Stack:** Next.js 16.2.3 App Router (client components), TanStack Query v5, Vitest, `@3pb/kalkulator-core` (`hitungMesinPerJam`, `HELM_TIER_DEFAULTS`, tipe `SettingsV2`/`LaborItem`).

## Global Constraints

- Node 22: awali SETIAP bash call `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`. Hook RTK transparan; output tertelan → binary langsung (`pnpm --filter shopee-dashboard exec vitest run <path>`).
- Sebelum menulis kode Next, baca guide relevan di `apps/dashboard/node_modules/next/dist/docs/` (AGENTS.md).
- **Form kalkulator (`KalkulasiForm`, `PlateTable`, `AksesoriSection`, `HasilPanel`) TIDAK disentuh** — masih jalur legacy sampai 0b-2b. Card settings lama (`KalkulatorSettingsCard`) juga TIDAK disentuh.
- UI meniru pola visual existing PERSIS: class `g-card`, `g-t1..g-t5`, `g-accent`, `g-label`, `glass-input`, tombol gradient `linear-gradient(135deg, #5055e8, #7c84f8)` — lihat `apps/dashboard/components/settings/KalkulatorSettingsCard.tsx` sebagai referensi gaya.
- Client component WAJIB `'use client'` di baris pertama. Types dari service di-import dengan `import type` (module server berisi prisma — type-only import aman untuk client bundle).
- Konvensi Indonesia (`nama`, `harga`). Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Branch baru `fase0b2a-settings-ui` dari `master` (Task 1 Step 1).
- Lint: hanya ERROR baru yang harus diperbaiki.

---

### Task 1: Carry-over fixes dari final review 0b-1 (TDD)

Tiga perbaikan backend kecil yang jadi fondasi UI: (a) DELETE id tak-ada harus 404 rapi (UI menampilkan toast error yang masuk akal), (b) `loadSettingsV2` menjamin channel `offline` selalu ada, (c) seed mengimpor `HELM_TIER_DEFAULTS` dari core (hapus duplikasi konstanta).

**Files:**
- Modify: `apps/dashboard/lib/kalkulator/profiles-service.ts` (4 fungsi delete + helper)
- Modify: `apps/dashboard/lib/kalkulator/settings-v2.ts`
- Modify: `apps/dashboard/scripts/seed-kalkulator-v2.ts`
- Modify: `apps/dashboard/app/api/kalkulator/printer-profiles/[id]/route.ts`, `material-profiles/[id]/route.ts`, `komponen-presets/[id]/route.ts`, `labor-presets/[id]/route.ts` (DELETE handler)
- Test: `apps/dashboard/lib/kalkulator/__tests__/profiles-service.test.ts`, `__tests__/settings-v2.test.ts`

**Interfaces:**
- Produces: semua fungsi `delete*` melempar `Error('NOT_FOUND')` untuk id tak dikenal (P2025), route DELETE membalas 404 `{ error: 'NOT_FOUND' }`; `loadSettingsV2().channels` SELALU memuat `{ id: 'offline', nama: 'Offline', feeMultiplier: 1 }`.

- [ ] **Step 1: Buat branch**

```bash
cd /Users/adhityatangahu/Documents/shopee-analysis
git checkout master && git pull && git checkout -b fase0b2a-settings-ui
```

- [ ] **Step 2: Failing tests**

Tambah di `apps/dashboard/lib/kalkulator/__tests__/profiles-service.test.ts` (import `deleteKomponenPreset` ikut ditambahkan ke import list dari `../profiles-service`):

```ts
describe('delete dengan id tak dikenal', () => {
  it('deleteKomponenPreset: P2025 → NOT_FOUND', async () => {
    const p2025 = Object.assign(new Error('No record found'), { code: 'P2025' })
    db.komponenPreset.delete.mockRejectedValue(p2025)
    await expect(deleteKomponenPreset('ghost')).rejects.toThrow('NOT_FOUND')
  })

  it('deletePrinterProfile non-default: P2025 → NOT_FOUND', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(null)
    const p2025 = Object.assign(new Error('No record found'), { code: 'P2025' })
    db.kalkPrinterProfile.delete.mockRejectedValue(p2025)
    await expect(deletePrinterProfile('ghost')).rejects.toThrow('NOT_FOUND')
  })
})
```

Tambah di `apps/dashboard/lib/kalkulator/__tests__/settings-v2.test.ts`:

```ts
  it('channel offline SELALU ada meski config hanya punya channel lain', async () => {
    mockFindMany.mockResolvedValue(rows({ 'kalk.channel.shopee': '1.2' }))
    const s = await loadSettingsV2()
    expect(s.channels[0]).toEqual({ id: 'offline', nama: 'Offline', feeMultiplier: 1 })
    expect(s.channels.map(c => c.id)).toEqual(['offline', 'shopee'])
  })
```

Run: `pnpm --filter shopee-dashboard exec vitest run lib/kalkulator/__tests__/profiles-service.test.ts lib/kalkulator/__tests__/settings-v2.test.ts`
Expected: 3 test baru FAIL.

- [ ] **Step 3: Implementasi**

Di `profiles-service.ts`, tambah helper privat (dekat bagian atas file, setelah import):

```ts
/** Terjemahkan Prisma P2025 (record tak ditemukan) jadi sentinel NOT_FOUND. */
async function deleteOrNotFound(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025') {
      throw new Error('NOT_FOUND')
    }
    throw err
  }
}
```

Ganti body 4 fungsi delete:

```ts
export async function deletePrinterProfile(id: string): Promise<void> {
  const existing = await prisma.kalkPrinterProfile.findUnique({ where: { id } })
  if (existing?.isDefault) throw new Error('DEFAULT_PROFILE')
  await deleteOrNotFound(() => prisma.kalkPrinterProfile.delete({ where: { id } }))
}

export async function deleteMaterialProfile(id: string): Promise<void> {
  await deleteOrNotFound(() => prisma.kalkMaterialProfile.delete({ where: { id } }))
}

export async function deleteKomponenPreset(id: string): Promise<void> {
  await deleteOrNotFound(() => prisma.komponenPreset.delete({ where: { id } }))
}

export async function deleteLaborPreset(id: string): Promise<void> {
  await deleteOrNotFound(() => prisma.laborPreset.delete({ where: { id } }))
}
```

Di 4 route DELETE (`printer-profiles/[id]`, `material-profiles/[id]`, `komponen-presets/[id]`, `labor-presets/[id]`): bungkus panggilan delete dengan try/catch yang memetakan `NOT_FOUND` → 404, `DEFAULT_PROFILE` → 400 (khusus printer), lainnya → 500. Contoh untuk material (pola sama untuk komponen & labor):

```ts
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    await deleteMaterialProfile(id)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error'
    if (msg === 'NOT_FOUND') return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
```

(Untuk printer: pertahankan mapping `DEFAULT_PROFILE` → 400 yang sudah ada, tambah cabang `NOT_FOUND` → 404.)

Di `settings-v2.ts`, PERTAHANKAN blok fallback lama `if (channels.length === 0) { ...offline+shopee... }` apa adanya, lalu tambahkan guard offline TEPAT SETELAHNYA:

```ts
  // offline wajib selalu ada (basis harga tanpa fee) — meski user mengisi
  // kalk.channel.* tanpa menyertakan offline
  if (!channels.some(c => c.id === 'offline')) {
    channels.unshift({ id: 'offline', nama: 'Offline', feeMultiplier: 1 })
  }
```

(Semantik: Config kosong → fallback penuh offline+shopee seperti sebelumnya; Config punya channel tapi tanpa offline → offline disisipkan di depan. Ketiga test lama harus tetap hijau — khususnya test "nilai channel non-angka dilewati" yang meng-assert `['offline']` saja.)

Di `scripts/seed-kalkulator-v2.ts`: hapus konstanta `HELM_TIERS` inline, ganti dengan:

```ts
import { HELM_TIER_DEFAULTS } from '@3pb/kalkulator-core'
```

dan loop-nya menjadi:

```ts
  for (const [tier, t] of Object.entries(HELM_TIER_DEFAULTS)) {
    const items = [
      { nama: 'Preparer (sanding + assembly)', jam: t.jamSanding + t.jamAssembly, ratePerJam: preparer },
      { nama: 'Finisher (painting)', jam: t.jamPainting, ratePerJam: finisher },
      { nama: 'Consumables finishing', flat: consumables },
    ]
    ...
  }
```

(Field `HELM_TIER_DEFAULTS`: `jamSanding/jamPainting/jamAssembly` — cek definisinya di `packages/kalkulator-core/src/types.ts`.)

- [ ] **Step 4: Run — semua PASS**

```bash
pnpm --filter shopee-dashboard exec vitest run lib/kalkulator/__tests__/profiles-service.test.ts lib/kalkulator/__tests__/settings-v2.test.ts lib/kalkulator/__tests__/profiles-routes.test.ts
pnpm --filter shopee-dashboard test
pnpm --filter shopee-dashboard db:seed-kalk-v2
```

Expected: semua test PASS; seed tetap idempoten (semua `skip`).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/kalkulator apps/dashboard/app/api/kalkulator apps/dashboard/scripts/seed-kalkulator-v2.ts
git commit -m "fix(kalkulator): DELETE 404 untuk id tak dikenal; offline channel selalu ada; seed pakai HELM_TIER_DEFAULTS core" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Hooks TanStack Query untuk profiles/presets/settings-v2

**Files:**
- Modify: `apps/dashboard/lib/hooks/use-kalkulator.ts` (append + 1 edit kecil `useUpdateRates`)

**Interfaces:**
- Consumes: endpoint 0b-1; `apiFetch` existing di file yang sama; tipe via `import type` dari `@/lib/kalkulator/profiles-service` dan `@3pb/kalkulator-core`.
- Produces (dipakai Task 3–5):

```ts
usePrinterProfiles(): UseQueryResult<PrinterProfileData[]>
useCreatePrinterProfile(): mutation<PrinterProfileInput>
useUpdatePrinterProfile(): mutation<{ id: string; input: Partial<PrinterProfileInput> }>
useDeletePrinterProfile(): mutation<string>
useSetDefaultPrinterProfile(): mutation<string>
useMaterialProfiles / useUpsertMaterialProfile(MaterialProfileInput) / useDeleteMaterialProfile(string)
useKomponenPresets / useUpsertKomponenPreset({nama,harga,isActive?}) / useDeleteKomponenPreset(string)
useLaborPresets / useUpsertLaborPreset({nama,items:LaborItem[]}) / useDeleteLaborPreset(string)
useSettingsV2(): UseQueryResult<SettingsV2>
```

- [ ] **Step 1: Tambah kode di `use-kalkulator.ts`**

Tambah ke import type paling atas:

```ts
import type {
  PrinterProfileData, PrinterProfileInput, MaterialProfileData, MaterialProfileInput,
  KomponenPresetData, LaborPresetData,
} from '@/lib/kalkulator/profiles-service'
import type { SettingsV2, LaborItem } from '@3pb/kalkulator-core'
```

Tambah query keys setelah `RATES_KEY`:

```ts
const PRINTER_PROFILES_KEY = ['kalkulator', 'printer-profiles'] as const
const MATERIAL_PROFILES_KEY = ['kalkulator', 'material-profiles'] as const
const KOMPONEN_PRESETS_KEY = ['kalkulator', 'komponen-presets'] as const
const LABOR_PRESETS_KEY = ['kalkulator', 'labor-presets'] as const
const SETTINGS_V2_KEY = ['kalkulator', 'settings-v2'] as const
```

Append di akhir file:

```ts
// ── Kalkulator v2: profiles, presets, settings ──────────────────────────────

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function usePrinterProfiles() {
  return useQuery({ queryKey: PRINTER_PROFILES_KEY, queryFn: () => apiFetch<PrinterProfileData[]>('/api/kalkulator/printer-profiles') })
}

export function useCreatePrinterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PrinterProfileInput) =>
      apiFetch<PrinterProfileData>('/api/kalkulator/printer-profiles', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTER_PROFILES_KEY }),
  })
}

export function useUpdatePrinterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<PrinterProfileInput> }) =>
      apiFetch<PrinterProfileData>(`/api/kalkulator/printer-profiles/${id}`, { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTER_PROFILES_KEY }),
  })
}

export function useDeletePrinterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/printer-profiles/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTER_PROFILES_KEY }),
  })
}

export function useSetDefaultPrinterProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/printer-profiles/${id}/default`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PRINTER_PROFILES_KEY }),
  })
}

export function useMaterialProfiles() {
  return useQuery({ queryKey: MATERIAL_PROFILES_KEY, queryFn: () => apiFetch<MaterialProfileData[]>('/api/kalkulator/material-profiles') })
}

export function useUpsertMaterialProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: MaterialProfileInput) =>
      apiFetch<MaterialProfileData>('/api/kalkulator/material-profiles', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MATERIAL_PROFILES_KEY }),
  })
}

export function useDeleteMaterialProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/material-profiles/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MATERIAL_PROFILES_KEY }),
  })
}

export function useKomponenPresets() {
  return useQuery({ queryKey: KOMPONEN_PRESETS_KEY, queryFn: () => apiFetch<KomponenPresetData[]>('/api/kalkulator/komponen-presets') })
}

export function useUpsertKomponenPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { nama: string; harga: number; isActive?: boolean }) =>
      apiFetch<KomponenPresetData>('/api/kalkulator/komponen-presets', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KOMPONEN_PRESETS_KEY }),
  })
}

export function useDeleteKomponenPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/komponen-presets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KOMPONEN_PRESETS_KEY }),
  })
}

export function useLaborPresets() {
  return useQuery({ queryKey: LABOR_PRESETS_KEY, queryFn: () => apiFetch<LaborPresetData[]>('/api/kalkulator/labor-presets') })
}

export function useUpsertLaborPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { nama: string; items: LaborItem[] }) =>
      apiFetch<LaborPresetData>('/api/kalkulator/labor-presets', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LABOR_PRESETS_KEY }),
  })
}

export function useDeleteLaborPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/kalkulator/labor-presets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LABOR_PRESETS_KEY }),
  })
}

export function useSettingsV2() {
  return useQuery({ queryKey: SETTINGS_V2_KEY, queryFn: () => apiFetch<SettingsV2>('/api/kalkulator/settings-v2') })
}
```

Edit `useUpdateRates` existing — channel/margin diedit lewat rates, jadi settings-v2 harus ikut segar:

```ts
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: RATES_KEY })
      qc.invalidateQueries({ queryKey: SETTINGS_V2_KEY })
    },
```

- [ ] **Step 2: Verifikasi kompilasi**

```bash
pnpm --filter shopee-dashboard exec tsc --noEmit 2>&1 | head -20 || true
pnpm --filter shopee-dashboard build
```

Expected: tidak ada error TS baru; build sukses. (Hooks belum dipakai — no-unused warning bisa muncul di lint, itu wajar sementara sampai Task 3–5; JANGAN tambah eslint-disable.)

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/lib/hooks/use-kalkulator.ts
git commit -m "feat(kalkulator): hooks TanStack Query untuk profiles/presets/settings-v2" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Container card + PrinterProfilesSection + pasang di halaman Settings

**Files:**
- Create: `apps/dashboard/components/settings/kalkulator-v2/KalkulatorV2SettingsCard.tsx`
- Create: `apps/dashboard/components/settings/kalkulator-v2/PrinterProfilesSection.tsx`
- Modify: `apps/dashboard/app/(dashboard)/settings/page.tsx` (import + render card)

**Interfaces:**
- Consumes: hooks Task 2; `hitungMesinPerJam` dari `@3pb/kalkulator-core` (preview live client-side).
- Produces: `<KalkulatorV2SettingsCard />` — container yang di Task 4–5 ditambahkan section lain (placeholder komentar `{/* SECTION_MATERIAL */}` dst. sebagai titik sisip).

- [ ] **Step 1: Container card**

File `apps/dashboard/components/settings/kalkulator-v2/KalkulatorV2SettingsCard.tsx`:

```tsx
'use client'

import { PrinterProfilesSection } from './PrinterProfilesSection'

export function KalkulatorV2SettingsCard() {
  return (
    <div className="rounded-[16px] p-5 space-y-6 g-card">
      <div>
        <div className="text-sm font-semibold g-t1">🧮 Kalkulator v2 — Profiles &amp; Presets</div>
        <div className="text-xs mt-0.5 g-t4">
          Printer, material, komponen, labor, dan channel — dipakai kalkulator HPP v2
        </div>
      </div>
      <PrinterProfilesSection />
      {/* SECTION_MATERIAL */}
      {/* SECTION_KOMPONEN */}
      {/* SECTION_LABOR */}
      {/* SECTION_CHANNEL */}
    </div>
  )
}
```

- [ ] **Step 2: PrinterProfilesSection**

File `apps/dashboard/components/settings/kalkulator-v2/PrinterProfilesSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { hitungMesinPerJam } from '@3pb/kalkulator-core'
import {
  usePrinterProfiles, useCreatePrinterProfile, useUpdatePrinterProfile,
  useDeletePrinterProfile, useSetDefaultPrinterProfile,
} from '@/lib/hooks/use-kalkulator'
import type { PrinterProfileData } from '@/lib/kalkulator/profiles-service'

const EMPTY = { nama: '', mesinPerJam: '', watt: '', tarifPerKwh: '', hargaPrinter: '', umurPakaiJam: '', maintenancePerJam: '' }

function num(v: string): number | undefined {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

export function PrinterProfilesSection() {
  const { data: profiles, isLoading } = usePrinterProfiles()
  const createMut = useCreatePrinterProfile()
  const updateMut = useUpdatePrinterProfile()
  const deleteMut = useDeletePrinterProfile()
  const setDefaultMut = useSetDefaultPrinterProfile()

  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const breakdown = {
    watt: num(form.watt), tarifPerKwh: num(form.tarifPerKwh),
    hargaPrinter: num(form.hargaPrinter), umurPakaiJam: num(form.umurPakaiJam),
    maintenancePerJam: num(form.maintenancePerJam),
  }
  const breakdownLengkap = breakdown.watt !== undefined && breakdown.tarifPerKwh !== undefined
    && breakdown.hargaPrinter !== undefined && breakdown.umurPakaiJam !== undefined
  const preview = breakdownLengkap
    ? hitungMesinPerJam({
        watt: breakdown.watt!, tarifPerKwh: breakdown.tarifPerKwh!,
        hargaPrinter: breakdown.hargaPrinter!, umurPakaiJam: breakdown.umurPakaiJam!,
        maintenancePerJam: breakdown.maintenancePerJam,
      })
    : undefined
  const mesinManual = num(form.mesinPerJam)
  const mesinFinal = mesinManual ?? preview

  function startEdit(p: PrinterProfileData) {
    setEditingId(p.id)
    setForm({
      nama: p.nama, mesinPerJam: String(p.mesinPerJam),
      watt: p.watt != null ? String(p.watt) : '', tarifPerKwh: p.tarifPerKwh != null ? String(p.tarifPerKwh) : '',
      hargaPrinter: p.hargaPrinter != null ? String(p.hargaPrinter) : '', umurPakaiJam: p.umurPakaiJam != null ? String(p.umurPakaiJam) : '',
      maintenancePerJam: p.maintenancePerJam != null ? String(p.maintenancePerJam) : '',
    })
  }

  async function handleSubmit() {
    setError(null)
    if (!form.nama.trim() || mesinFinal === undefined) {
      setError('Isi nama dan mesin/jam (langsung atau lengkapi breakdown)')
      return
    }
    // Selalu kirim mesinPerJam eksplisit — hindari recompute diam-diam di server
    const input = { nama: form.nama.trim(), mesinPerJam: mesinFinal, ...breakdown }
    try {
      if (editingId) await updateMut.mutateAsync({ id: editingId, input })
      else await createMut.mutateAsync(input)
      setForm(EMPTY)
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">🖨️ Printer Profile</div>
      <p className="text-xs g-t4 mb-2">Biaya mesin per jam per printer (listrik + depresiasi + maintenance). Profil default dipakai saat plate tidak memilih printer.</p>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1 mb-3">
        {(profiles ?? []).map(p => (
          <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px]"
               style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            <span className="text-xs g-t2 flex-1">
              {p.nama}
              {p.isDefault && (
                <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>default</span>
              )}
            </span>
            <span className="text-xs font-mono g-t1">Rp {Math.round(p.mesinPerJam)}/jam</span>
            <button onClick={() => startEdit(p)} className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">✎</button>
            {!p.isDefault && (
              <>
                <button onClick={() => setDefaultMut.mutate(p.id)} className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1"
                        title="Jadikan default">★</button>
                <button onClick={() => deleteMut.mutate(p.id)} className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1">✕</button>
              </>
            )}
          </div>
        ))}
        {(profiles ?? []).length === 0 && !isLoading && (
          <div className="text-xs g-t5 text-center py-2">Belum ada profil. Jalankan seed atau tambah manual.</div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 items-end">
        <div className="col-span-2">
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Nama printer</label>
          <input value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
            placeholder="Bambu Lab P1P" className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Mesin/jam (Rp)</label>
          <input type="number" min="0" value={form.mesinPerJam}
            onChange={e => setForm(f => ({ ...f, mesinPerJam: e.target.value }))}
            placeholder={preview !== undefined ? String(Math.round(preview)) : '4000'}
            className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
        </div>
      </div>

      <div className="mt-2">
        <div className="text-[10px] g-t5 mb-1">Atau hitung dari breakdown (kosongkan Mesin/jam untuk pakai hasil hitung):</div>
        <div className="grid grid-cols-5 gap-2">
          {([
            ['watt', 'Watt'], ['tarifPerKwh', 'Rp/kWh'], ['hargaPrinter', 'Harga printer'],
            ['umurPakaiJam', 'Umur (jam)'], ['maintenancePerJam', 'Maint./jam'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">{label}</label>
              <input type="number" min="0" value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="glass-input w-full h-9 rounded-[8px] px-2 text-xs" />
            </div>
          ))}
        </div>
        {preview !== undefined && (
          <div className="text-[10px] mt-1 g-t4">Hasil hitung: <span className="font-mono g-t1">Rp {Math.round(preview)}/jam</span></div>
        )}
      </div>

      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
      <div className="flex gap-2 mt-2">
        <button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}
          className="text-xs px-3 py-1.5 rounded-md text-white disabled:opacity-50 transition-colors"
          style={{ background: 'linear-gradient(135deg, #5055e8, #7c84f8)' }}>
          {editingId ? 'Update profil' : '+ Tambah profil'}
        </button>
        {editingId && (
          <button onClick={() => { setEditingId(null); setForm(EMPTY); setError(null) }}
            className="text-xs px-3 py-1.5 rounded-md g-t4 transition-colors"
            style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            Batal
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Pasang di halaman Settings**

Baca `apps/dashboard/app/(dashboard)/settings/page.tsx`, cari tempat `<KalkulatorSettingsCard />` dirender. Tambahkan import:

```tsx
import { KalkulatorV2SettingsCard } from '@/components/settings/kalkulator-v2/KalkulatorV2SettingsCard'
```

dan render `<KalkulatorV2SettingsCard />` TEPAT di bawah `<KalkulatorSettingsCard />` (ikuti wrapper/layout yang dipakai card lain di halaman itu — kalau tiap card dibungkus elemen grid/section, bungkus dengan pola yang sama).

- [ ] **Step 4: Verifikasi visual + build**

```bash
pnpm --filter shopee-dashboard build
pnpm --filter shopee-dashboard dev &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/settings   # 200/307 = halaman ter-render/redirect login
kill %1
```

Expected: build sukses; halaman settings tidak error (cek juga output dev server tidak ada error render).

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/settings/kalkulator-v2 "apps/dashboard/app/(dashboard)/settings/page.tsx"
git commit -m "feat(settings): card Kalkulator v2 + section printer profile" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: MaterialProfilesSection + KomponenPresetsSection

**Files:**
- Create: `apps/dashboard/components/settings/kalkulator-v2/MaterialProfilesSection.tsx`
- Create: `apps/dashboard/components/settings/kalkulator-v2/KomponenPresetsSection.tsx`
- Modify: `apps/dashboard/components/settings/kalkulator-v2/KalkulatorV2SettingsCard.tsx` (ganti placeholder)

**Interfaces:**
- Consumes: hooks Task 2.

- [ ] **Step 1: MaterialProfilesSection**

File `apps/dashboard/components/settings/kalkulator-v2/MaterialProfilesSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useMaterialProfiles, useUpsertMaterialProfile, useDeleteMaterialProfile } from '@/lib/hooks/use-kalkulator'

const EMPTY = { nama: '', tipe: 'FDM' as 'FDM' | 'SLA', hppPerGram: '', jualPerGram: '', failureRatePct: '12' }

export function MaterialProfilesSection() {
  const { data: materials, isLoading } = useMaterialProfiles()
  const upsertMut = useUpsertMaterialProfile()
  const deleteMut = useDeleteMaterialProfile()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    const hpp = parseFloat(form.hppPerGram)
    const jual = parseFloat(form.jualPerGram)
    const fail = parseFloat(form.failureRatePct)
    if (!form.nama.trim() || !Number.isFinite(hpp) || !Number.isFinite(jual) || !Number.isFinite(fail)) {
      setError('Lengkapi nama, HPP/gram, Jual/gram, dan failure rate')
      return
    }
    try {
      await upsertMut.mutateAsync({ nama: form.nama.trim(), tipe: form.tipe, hppPerGram: hpp, jualPerGram: jual, failureRatePct: fail })
      setForm(EMPTY)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">🧵 Material Profile</div>
      <p className="text-xs g-t4 mb-2">Harga default & failure rate per jenis material. Nama sama = update (upsert).</p>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1 mb-3">
        {(materials ?? []).map(m => (
          <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px]"
               style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: m.tipe === 'SLA' ? 'rgba(244,114,182,0.2)' : 'rgba(99,102,241,0.2)', color: m.tipe === 'SLA' ? '#f9a8d4' : '#a5b4fc' }}>
              {m.tipe}
            </span>
            <span className="text-xs g-t2 flex-1">{m.nama}</span>
            <span className="text-xs font-mono g-t1">Rp {m.hppPerGram} → {m.jualPerGram}/g</span>
            <span className="text-[10px] g-t4">fail {m.failureRatePct}%</span>
            <button onClick={() => setForm({ nama: m.nama, tipe: m.tipe as 'FDM' | 'SLA', hppPerGram: String(m.hppPerGram), jualPerGram: String(m.jualPerGram), failureRatePct: String(m.failureRatePct) })}
              className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">✎</button>
            <button onClick={() => deleteMut.mutate(m.id)} className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1">✕</button>
          </div>
        ))}
        {(materials ?? []).length === 0 && !isLoading && (
          <div className="text-xs g-t5 text-center py-2">Belum ada material profile.</div>
        )}
      </div>

      <div className="grid grid-cols-6 gap-2 items-end">
        <div className="col-span-2">
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Nama (PLA, PETG, …)</label>
          <input value={form.nama} onChange={e => setForm(f => ({ ...f, nama: e.target.value }))}
            placeholder="PLA" className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Tipe</label>
          <select value={form.tipe} onChange={e => setForm(f => ({ ...f, tipe: e.target.value as 'FDM' | 'SLA' }))}
            className="glass-input w-full h-9 rounded-[8px] px-2 text-sm">
            <option value="FDM">FDM</option>
            <option value="SLA">SLA</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">HPP/g</label>
          <input type="number" min="0" value={form.hppPerGram} onChange={e => setForm(f => ({ ...f, hppPerGram: e.target.value }))}
            placeholder="300" className="glass-input w-full h-9 rounded-[8px] px-2 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Jual/g</label>
          <input type="number" min="0" value={form.jualPerGram} onChange={e => setForm(f => ({ ...f, jualPerGram: e.target.value }))}
            placeholder="900" className="glass-input w-full h-9 rounded-[8px] px-2 text-sm" />
        </div>
        <div>
          <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Fail %</label>
          <input type="number" min="0" max="100" value={form.failureRatePct} onChange={e => setForm(f => ({ ...f, failureRatePct: e.target.value }))}
            className="glass-input w-full h-9 rounded-[8px] px-2 text-sm" />
        </div>
      </div>
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
      <button onClick={handleSubmit} disabled={upsertMut.isPending}
        className="mt-2 text-xs px-3 py-1.5 rounded-md text-white disabled:opacity-50 transition-colors"
        style={{ background: 'linear-gradient(135deg, #5055e8, #7c84f8)' }}>
        + Simpan material
      </button>
    </div>
  )
}
```

- [ ] **Step 2: KomponenPresetsSection**

File `apps/dashboard/components/settings/kalkulator-v2/KomponenPresetsSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useKomponenPresets, useUpsertKomponenPreset, useDeleteKomponenPreset } from '@/lib/hooks/use-kalkulator'

export function KomponenPresetsSection() {
  const { data: presets, isLoading } = useKomponenPresets()
  const upsertMut = useUpsertKomponenPreset()
  const deleteMut = useDeleteKomponenPreset()
  const [nama, setNama] = useState('')
  const [harga, setHarga] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    const h = parseFloat(harga)
    if (!nama.trim() || !Number.isFinite(h) || h < 0) {
      setError('Isi nama dan harga (angka ≥ 0)')
      return
    }
    try {
      await upsertMut.mutateAsync({ nama: nama.trim(), harga: h })
      setNama(''); setHarga('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">🧩 Komponen Preset</div>
      <p className="text-xs g-t4 mb-2">Biaya non-print siap pakai (gantungan, switch, label, magnet, …). Toggle nonaktif untuk menyembunyikan dari picker tanpa menghapus.</p>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1 mb-3">
        {(presets ?? []).map(k => (
          <div key={k.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px]"
               style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)', opacity: k.isActive ? 1 : 0.5 }}>
            <span className="text-xs g-t2 flex-1">{k.nama}</span>
            <span className="text-xs font-mono g-t1">Rp {k.harga}</span>
            <button
              onClick={() => upsertMut.mutate({ nama: k.nama, harga: k.harga, isActive: !k.isActive })}
              className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1"
              title={k.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
              {k.isActive ? '👁' : '🚫'}
            </button>
            <button onClick={() => { setNama(k.nama); setHarga(String(k.harga)) }}
              className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">✎</button>
            <button onClick={() => deleteMut.mutate(k.id)} className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1">✕</button>
          </div>
        ))}
        {(presets ?? []).length === 0 && !isLoading && (
          <div className="text-xs g-t5 text-center py-2">Belum ada preset.</div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] g-t4 uppercase tracking-wide">Nama</label>
          <input value={nama} onChange={e => setNama(e.target.value)}
            placeholder="Magnet 8mm" className="glass-input text-xs px-2 py-1.5 rounded-md w-36" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] g-t4 uppercase tracking-wide">Harga (Rp)</label>
          <input type="number" min="0" value={harga} onChange={e => setHarga(e.target.value)}
            placeholder="500" className="glass-input text-xs px-2 py-1.5 rounded-md w-24" />
        </div>
        <button onClick={handleSubmit} disabled={upsertMut.isPending}
          className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
          + Simpan
        </button>
      </div>
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 3: Ganti placeholder di container**

Di `KalkulatorV2SettingsCard.tsx`: import kedua section, ganti `{/* SECTION_MATERIAL */}` → `<MaterialProfilesSection />` dan `{/* SECTION_KOMPONEN */}` → `<KomponenPresetsSection />`.

- [ ] **Step 4: Build + commit**

```bash
pnpm --filter shopee-dashboard build
git add apps/dashboard/components/settings/kalkulator-v2
git commit -m "feat(settings): section material profile + komponen preset" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: LaborPresetsSection + ChannelsSection (channel, margin, reseller)

**Files:**
- Create: `apps/dashboard/components/settings/kalkulator-v2/LaborPresetsSection.tsx`
- Create: `apps/dashboard/components/settings/kalkulator-v2/ChannelsSection.tsx`
- Modify: `apps/dashboard/components/settings/kalkulator-v2/KalkulatorV2SettingsCard.tsx` (ganti 2 placeholder tersisa)

**Interfaces:**
- Consumes: hooks Task 2; `useUpdateRates` existing (channel & margin via Config keys `kalk.channel.<id>`, `kalk.margin.a/b/c`, `kalk.resellerBulk.multiplier`).

- [ ] **Step 1: LaborPresetsSection**

File `apps/dashboard/components/settings/kalkulator-v2/LaborPresetsSection.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useLaborPresets, useUpsertLaborPreset, useDeleteLaborPreset } from '@/lib/hooks/use-kalkulator'
import type { LaborItem } from '@3pb/kalkulator-core'

interface ItemRow { nama: string; jam: string; ratePerJam: string; flat: string }
const EMPTY_ROW: ItemRow = { nama: '', jam: '', ratePerJam: '', flat: '' }

function rowToItem(r: ItemRow): LaborItem | null {
  const jam = parseFloat(r.jam)
  const rate = parseFloat(r.ratePerJam)
  const flat = parseFloat(r.flat)
  const hasJamRate = Number.isFinite(jam) && jam > 0 && Number.isFinite(rate) && rate > 0
  const hasFlat = Number.isFinite(flat) && flat > 0
  if (!r.nama.trim() || (!hasJamRate && !hasFlat)) return null
  return {
    nama: r.nama.trim(),
    ...(hasJamRate && { jam, ratePerJam: rate }),
    ...(hasFlat && { flat }),
  }
}

function itemCost(i: LaborItem): number {
  return (i.jam ?? 0) * (i.ratePerJam ?? 0) + (i.flat ?? 0)
}

export function LaborPresetsSection() {
  const { data: presets, isLoading } = useLaborPresets()
  const upsertMut = useUpsertLaborPreset()
  const deleteMut = useDeleteLaborPreset()
  const [nama, setNama] = useState('')
  const [rows, setRows] = useState<ItemRow[]>([{ ...EMPTY_ROW }])
  const [error, setError] = useState<string | null>(null)

  function setRow(i: number, patch: Partial<ItemRow>) {
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  async function handleSubmit() {
    setError(null)
    const items = rows.map(rowToItem)
    if (!nama.trim() || items.length === 0 || items.some(i => i === null)) {
      setError('Isi nama preset dan tiap baris: nama + (jam × rate) atau biaya flat')
      return
    }
    try {
      await upsertMut.mutateAsync({ nama: nama.trim(), items: items as LaborItem[] })
      setNama(''); setRows([{ ...EMPTY_ROW }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    }
  }

  function loadPreset(presetNama: string, items: LaborItem[]) {
    setNama(presetNama)
    setRows(items.map(i => ({
      nama: i.nama, jam: i.jam != null ? String(i.jam) : '',
      ratePerJam: i.ratePerJam != null ? String(i.ratePerJam) : '', flat: i.flat != null ? String(i.flat) : '',
    })))
  }

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">🛠️ Labor Preset</div>
      <p className="text-xs g-t4 mb-2">Paket biaya tenaga kerja (menggantikan mode Helm — preset Helm MINIMAL–HEAVY hasil migrasi ada di sini). Nama sama = update.</p>

      {isLoading && <div className="text-xs g-t5 py-2">Memuat…</div>}
      <div className="space-y-1 mb-3">
        {(presets ?? []).map(p => (
          <div key={p.id} className="px-2 py-1.5 rounded-[6px]"
               style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xs g-t2 flex-1">{p.nama}</span>
              <span className="text-xs font-mono g-t1">Rp {Math.round(p.items.reduce((s, i) => s + itemCost(i), 0))}</span>
              <button onClick={() => loadPreset(p.nama, p.items)} className="text-[10px] g-t4 hover:text-indigo-300 transition-colors px-1">✎</button>
              <button onClick={() => deleteMut.mutate(p.id)} className="text-[10px] g-t4 hover:text-red-400 transition-colors px-1">✕</button>
            </div>
            <div className="text-[10px] g-t5 mt-0.5">
              {p.items.map(i => i.jam != null ? `${i.nama} ${i.jam}j×${i.ratePerJam}` : `${i.nama} flat ${i.flat}`).join(' · ')}
            </div>
          </div>
        ))}
        {(presets ?? []).length === 0 && !isLoading && (
          <div className="text-xs g-t5 text-center py-2">Belum ada preset.</div>
        )}
      </div>

      <div className="mb-2">
        <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">Nama preset</label>
        <input value={nama} onChange={e => setNama(e.target.value)}
          placeholder="Helm CUSTOM" className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-9 gap-1.5 items-center">
            <input value={r.nama} onChange={e => setRow(i, { nama: e.target.value })}
              placeholder="Sanding" className="glass-input col-span-3 h-8 rounded-[6px] px-2 text-xs" />
            <input type="number" min="0" step="0.25" value={r.jam} onChange={e => setRow(i, { jam: e.target.value })}
              placeholder="jam" className="glass-input col-span-1 h-8 rounded-[6px] px-2 text-xs" />
            <input type="number" min="0" value={r.ratePerJam} onChange={e => setRow(i, { ratePerJam: e.target.value })}
              placeholder="Rp/jam" className="glass-input col-span-2 h-8 rounded-[6px] px-2 text-xs" />
            <input type="number" min="0" value={r.flat} onChange={e => setRow(i, { flat: e.target.value })}
              placeholder="flat Rp" className="glass-input col-span-2 h-8 rounded-[6px] px-2 text-xs" />
            <button onClick={() => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs)}
              className="text-[10px] g-t4 hover:text-red-400 transition-colors col-span-1">✕</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <button onClick={() => setRows(rs => [...rs, { ...EMPTY_ROW }])}
          className="text-xs px-2.5 py-1 rounded-md g-t4 transition-colors"
          style={{ background: 'var(--g-inner)', border: '1px solid var(--g-inner-border)' }}>
          + baris
        </button>
        <button onClick={handleSubmit} disabled={upsertMut.isPending}
          className="text-xs px-3 py-1.5 rounded-md text-white disabled:opacity-50 transition-colors"
          style={{ background: 'linear-gradient(135deg, #5055e8, #7c84f8)' }}>
          Simpan preset
        </button>
      </div>
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 2: ChannelsSection**

File `apps/dashboard/components/settings/kalkulator-v2/ChannelsSection.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useSettingsV2, useUpdateRates } from '@/lib/hooks/use-kalkulator'

export function ChannelsSection() {
  const { data: settings, isLoading } = useSettingsV2()
  const updateMut = useUpdateRates()

  const [fees, setFees] = useState<Record<string, string>>({})
  const [margins, setMargins] = useState({ a: '', b: '', c: '', reseller: '' })
  const [newId, setNewId] = useState('')
  const [newFee, setNewFee] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    setFees(Object.fromEntries(settings.channels.map(c => [c.id, String(c.feeMultiplier)])))
    setMargins({
      a: String(settings.marginMultipliers.A), b: String(settings.marginMultipliers.B),
      c: String(settings.marginMultipliers.C), reseller: String(settings.resellerBulkMultiplier),
    })
  }, [settings])

  async function handleSave() {
    setError(null)
    const updates: { key: string; value: string }[] = []
    for (const [id, fee] of Object.entries(fees)) {
      if (id === 'offline') continue // offline selalu 1, tidak diedit
      if (fee.trim() !== '' && Number.isFinite(parseFloat(fee))) updates.push({ key: `kalk.channel.${id}`, value: fee.trim() })
    }
    if (margins.a) updates.push({ key: 'kalk.margin.a', value: margins.a })
    if (margins.b) updates.push({ key: 'kalk.margin.b', value: margins.b })
    if (margins.c) updates.push({ key: 'kalk.margin.c', value: margins.c })
    if (margins.reseller) updates.push({ key: 'kalk.resellerBulk.multiplier', value: margins.reseller })
    await updateMut.mutateAsync(updates)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleAddChannel() {
    setError(null)
    const id = newId.trim().toLowerCase()
    const fee = parseFloat(newFee)
    if (!/^[a-z0-9-]+$/.test(id) || id === 'offline') {
      setError('ID channel: huruf kecil/angka/strip, bukan "offline"')
      return
    }
    if (!Number.isFinite(fee) || fee <= 0) {
      setError('Fee multiplier harus angka > 0 (contoh: 1.2 = fee 20%)')
      return
    }
    await updateMut.mutateAsync([{ key: `kalk.channel.${id}`, value: String(fee) }])
    setNewId(''); setNewFee('')
  }

  if (isLoading) return <div className="text-xs g-t5 py-2">Memuat…</div>

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">🛒 Channel &amp; Margin</div>
      <p className="text-xs g-t4 mb-2">Fee multiplier per channel penjualan (1.2 = harga dinaikkan 20% untuk menutup fee marketplace). Offline selalu 1. Channel tersimpan sebagai Config <code className="font-mono">kalk.channel.*</code>.</p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {(settings?.channels ?? []).map(c => (
          <div key={c.id}>
            <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">{c.nama}</label>
            <input type="number" min="1" step="0.01" value={fees[c.id] ?? ''} disabled={c.id === 'offline'}
              onChange={e => setFees(f => ({ ...f, [c.id]: e.target.value }))}
              className="glass-input w-full h-9 rounded-[8px] px-3 text-sm disabled:opacity-50" />
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap items-end mb-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] g-t4 uppercase tracking-wide">Channel baru (id)</label>
          <input value={newId} onChange={e => setNewId(e.target.value)}
            placeholder="tokopedia" className="glass-input text-xs px-2 py-1.5 rounded-md w-28" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] g-t4 uppercase tracking-wide">Fee ×</label>
          <input type="number" min="1" step="0.01" value={newFee} onChange={e => setNewFee(e.target.value)}
            placeholder="1.1" className="glass-input text-xs px-2 py-1.5 rounded-md w-20" />
        </div>
        <button onClick={handleAddChannel} disabled={updateMut.isPending}
          className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
          + Tambah channel
        </button>
      </div>

      <div className="text-[10px] g-t5 mb-3">Margin tier & reseller bulk (dikali floor price):</div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {([['a', 'Margin A ×'], ['b', 'Margin B ×'], ['c', 'Margin C ×'], ['reseller', 'Reseller bulk ×']] as const).map(([key, label]) => (
          <div key={key}>
            <label className="block text-[10px] g-t4 uppercase tracking-wide mb-1">{label}</label>
            <input type="number" min="1" step="0.05" value={margins[key]}
              onChange={e => setMargins(m => ({ ...m, [key]: e.target.value }))}
              className="glass-input w-full h-9 rounded-[8px] px-3 text-sm" />
          </div>
        ))}
      </div>

      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
      <button onClick={handleSave} disabled={updateMut.isPending}
        className="text-xs px-4 py-1.5 rounded-md text-white disabled:opacity-50 transition-colors"
        style={{ background: saved ? 'rgba(52,211,153,0.3)' : 'linear-gradient(135deg, #5055e8, #7c84f8)' }}>
        {updateMut.isPending ? 'Menyimpan…' : saved ? '✓ Tersimpan' : 'Simpan channel & margin'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Ganti placeholder tersisa di container** (`<LaborPresetsSection />`, `<ChannelsSection />`).

- [ ] **Step 4: Build + commit**

```bash
pnpm --filter shopee-dashboard build
git add apps/dashboard/components/settings/kalkulator-v2
git commit -m "feat(settings): section labor preset + channel & margin" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Verifikasi akhir, smoke visual & docs

**Files:**
- Modify: `docs/kalkulator-formula.md` (blok Status)

- [ ] **Step 1: Verifikasi penuh**

```bash
pnpm turbo test
pnpm turbo lint
pnpm turbo build
```

Expected: semua test PASS (≥165: 131 dashboard incl. 3 test baru Task 1 + 34 core), lint tanpa ERROR baru, build sukses.

- [ ] **Step 2: Smoke dev**

```bash
pnpm --filter shopee-dashboard dev &
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/settings           # 200/307
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/kalkulator/settings-v2  # 401
kill %1
```

Periksa output dev server: tidak ada error render/hydration terkait `kalkulator-v2`.

- [ ] **Step 3: Update docs**

Di `docs/kalkulator-formula.md`, di dalam blok `> **Status:** ...`, ganti kalimat terakhir ("Menyusul Fase 0b-2: ...") menjadi:

```
**Fase 0b-2a selesai** — Settings UI live: card "Kalkulator v2 — Profiles & Presets" di halaman Settings (printer/material/komponen/labor/channel+margin). Menyusul Fase 0b-2b: form kalkulator pindah ke `hitungKalkulasiV2` + migrasi data helm/aksesori + drop kolom legacy.
```

- [ ] **Step 4: Commit penutup**

```bash
git add -A
git commit -m "docs: tandai Fase 0b-2a settings UI kalkulator v2 selesai" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Laporkan ke user** (tugas controller): ringkasan + opsi merge; ingatkan seed produksi tetap prasyarat saat deploy versi ini (card akan kosong sebelum seed).

---

## Catatan scope

- **Plan ini (0b-2a)**: settings UI + carry-over fixes. Kalkulasi HPP masih 100% jalur legacy.
- **Plan berikutnya (0b-2b)**: `KalkulasiInput` v2 (labor[], komponen unified, printerProfileId/materialProfileId per plate), service `buildHasil` → `hitungKalkulasiV2`, schema (KalkulasiLabor, kolom plate, hargaChannelJson), rework `KalkulasiForm`/`PlateTable`/`AksesoriSection`/`HasilPanel`/`PrintableQuote`, migrasi data kalkulasi lama (helm→labor, gantungan/switch/label→KomponenKustom), drop kolom legacy, bersihkan grup gantungan/switch/label/helm dari `KalkulatorSettingsCard` lama.
- Minor 0b-1 yang TIDAK masuk sini (tetap tercatat): upsert selalu 201 (kosmetik), race murni setDefault, clear breakdown via API (UI selalu kirim eksplisit sehingga tidak menggigit).
