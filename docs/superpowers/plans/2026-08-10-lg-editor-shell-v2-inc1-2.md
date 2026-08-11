# LG Editor Shell v2 — Increment 1 & 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route baru `/light-generator/[id]/v2` berbentuk editor shell (top bar + rail + canvas tab + inspector + status strip) dengan autosave, preview pipeline debounced/abortable, estimasi filament live, dan badge STL-stale berbasis hash — tanpa menyentuh perilaku halaman v1.

**Architecture:** Komponen v2 hidup di `components/light-generator/editor-v2/`; definisi parameter & estimasi diekstrak ke modul shared yang di-import v1 (perubahan v1 = import-only). Satu config object jadi single source of truth di halaman v2; hook `useLgAutosave` (PATCH debounce 1 s) dan `useLgPreview` (debounce 500 ms + AbortController + guard request-id + chained check-islands) menjadi pipeline-nya. Hash config saat generate disimpan server-side di kolom Prisma baru.

**Tech Stack:** Next.js 16 (client components), shadcn/ui, TanStack Query (hooks existing), vitest + renderToStaticMarkup, Prisma.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-lg-editor-shell-v2-design.md`.
- **v1 (`app/(dashboard)/light-generator/[id]/page.tsx` + komponen existing) tidak berubah perilaku** — hanya boleh: (a) mengganti sumber import ke modul shared baru, (b) menambah SATU `<Link>` "Coba editor v2 →" di header v1. Test existing v1 harus tetap hijau tanpa diedit.
- Baca `apps/dashboard/AGENTS.md` + `node_modules/next/dist/docs/` sebelum menulis kode Next; baca `docs/ui-page-layout.md` — halaman v2 WAJIB dibungkus `PageShell` dengan `title`.
- Debounce autosave 1000 ms; debounce preview 500 ms; in-flight preview di-abort; respons basi dibuang via nomor urut.
- STL tidak pernah auto-generate. Stale = `hashLgConfig(currentConfig) !== order.generatedConfigHash`.
- Komentar kode & pesan commit Bahasa Inggris; copy UI boleh Indonesia.
- Node 22: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"`. `git add` path spesifik, JANGAN `-A`.
- Sebelum test suite penuh di worktree baru: `pnpm install --prefer-offline && pnpm --filter shopee-dashboard exec prisma generate`.

---

### Task 1: Ekstrak definisi parameter ke modul shared

**Files:**
- Create: `apps/dashboard/components/light-generator/config-params.ts`
- Modify: `apps/dashboard/components/light-generator/LgConfigEditor.tsx` (hapus definisi lokal, import dari modul baru — TIDAK ada perubahan lain)
- Test: existing `apps/dashboard/components/light-generator/__tests__/LgConfigEditor.test.tsx` (JANGAN diedit — regression gate)

**Interfaces:**
- Produces: `export interface ParamDef { key: string; label: string; help: string; type: "number" | "boolean"; min?: number; max?: number; step?: number; autoable?: boolean }`; `export const SECTIONS: { title: string; params: ParamDef[] }[]`; `export const RECESS_PARAMS: ParamDef[]`; `export const SHAPE_OPTIONS`, `export const COVER_OPTIONS` — konten PERSIS sama dengan yang sekarang ada di `LgConfigEditor.tsx` (interface ParamDef ~baris 32-41, SHAPE_OPTIONS ~43, SECTIONS ~51-116+, COVER_OPTIONS & RECESS_PARAMS setelahnya). Pindahkan verbatim, jangan ubah satu nilai pun.

- [ ] **Step 1: Buat `config-params.ts`** — cut definisi `ParamDef`, `SHAPE_OPTIONS`, `COVER_OPTIONS`, `RECESS_PARAMS`, `SECTIONS` dari `LgConfigEditor.tsx` verbatim, tambahkan `export` di depan masing-masing. Header komentar: `// Shared parameter definitions for the LG config editors (v1 form + v2 inspector).`

- [ ] **Step 2: Update import di `LgConfigEditor.tsx`**

```tsx
import {
  type ParamDef,
  SECTIONS,
  RECESS_PARAMS,
  SHAPE_OPTIONS,
  COVER_OPTIONS,
} from "./config-params"
```

- [ ] **Step 3: Run regression test**

Run: `pnpm --filter shopee-dashboard exec vitest run components/light-generator`
Expected: semua PASS tanpa mengedit test.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/components/light-generator/config-params.ts apps/dashboard/components/light-generator/LgConfigEditor.tsx
git commit -m "refactor(dashboard): extract LG param definitions to shared config-params module"
```

---

### Task 2: Util hash config + ekstrak estimasi

**Files:**
- Create: `apps/dashboard/lib/light-generator/config-hash.ts`
- Create: `apps/dashboard/lib/light-generator/estimate.ts` (pindahan `shapeFactors` + `computeObjectInfo` dari `LgGeneratePanel.tsx` verbatim, plus konstanta `PLA_PLUS_DENSITY`, `STENCIL_SOLID_FRACTION`)
- Modify: `apps/dashboard/components/light-generator/LgGeneratePanel.tsx` (import dari modul baru; hapus definisi lokal — tidak ada perubahan lain)
- Test: `apps/dashboard/lib/light-generator/__tests__/config-hash.test.ts`

**Interfaces:**
- Produces: `export function stableStringify(obj: unknown): string` (key di-sort rekursif); `export function hashLgConfig(config: Record<string, unknown>): string` (djb2 hex dari stableStringify); `export function computeObjectInfo(config: Record<string, unknown>)` (signature & return sama persis seperti di LgGeneratePanel sekarang).

- [ ] **Step 1: Write the failing test**

```ts
// apps/dashboard/lib/light-generator/__tests__/config-hash.test.ts
import { describe, it, expect } from 'vitest'
import { stableStringify, hashLgConfig } from '../config-hash'

describe('hashLgConfig', () => {
  it('same content different key order -> same hash', () => {
    expect(hashLgConfig({ a: 1, b: { c: 2, d: 3 } }))
      .toBe(hashLgConfig({ b: { d: 3, c: 2 }, a: 1 }))
  })
  it('different content -> different hash', () => {
    expect(hashLgConfig({ a: 1 })).not.toBe(hashLgConfig({ a: 2 }))
  })
  it('stableStringify sorts keys recursively', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter shopee-dashboard exec vitest run lib/light-generator/__tests__/config-hash.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `config-hash.ts`**

```ts
// Stable stringify + tiny non-crypto hash for STL staleness comparison.
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj)
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify((obj as Record<string, unknown>)[k])}`).join(",")}}`
}

export function hashLgConfig(config: Record<string, unknown>): string {
  const s = stableStringify(config)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}
```

- [ ] **Step 4: Buat `estimate.ts`** — pindahkan `PLA_PLUS_DENSITY`, `STENCIL_SOLID_FRACTION`, `shapeFactors`, `computeObjectInfo` dari `LgGeneratePanel.tsx` verbatim dengan `export` pada `computeObjectInfo` (helper lain boleh non-export). Update `LgGeneratePanel.tsx` jadi `import { computeObjectInfo } from "@/lib/light-generator/estimate"`.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter shopee-dashboard exec vitest run lib/light-generator components/light-generator`
Expected: PASS semua (termasuk regression v1).

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/lib/light-generator/config-hash.ts apps/dashboard/lib/light-generator/estimate.ts apps/dashboard/lib/light-generator/__tests__/config-hash.test.ts apps/dashboard/components/light-generator/LgGeneratePanel.tsx
git commit -m "feat(dashboard): config hash util + extract filament estimate to shared module"
```

---

### Task 3: Kolom `generatedConfigHash` + generate route menyimpannya

**Files:**
- Modify: `apps/dashboard/prisma/schema.prisma` (model `LightGeneratorOrder` — cek nama persis di file; tambah `generatedConfigHash String?`)
- Modify: `apps/dashboard/app/api/light-generator/orders/[id]/generate/route.ts` (setelah STL sukses ditulis/diupload, update order: `generatedConfigHash: hashLgConfig(effectiveConfig)` — gunakan config yang BENAR-BENAR dikirim ke service, sebelum strip flooring)
- Modify: `apps/dashboard/lib/light-generator/types.ts` (interface `LgOrder` + field `generatedConfigHash: string | null`)
- Test: `apps/dashboard/lib/light-generator/__tests__/config-hash.test.ts` (tambah 1 test determinisme pada objek config realistis)

**Interfaces:**
- Consumes: `hashLgConfig` (Task 2).
- Produces: `order.generatedConfigHash: string | null` tersedia di respons GET order (route existing return seluruh row prisma — verifikasi; kalau route memilih field eksplisit, tambahkan field ini).

- [ ] **Step 1: Tambah field di schema.prisma** pada model order light generator:

```prisma
  generatedConfigHash String?
```

- [ ] **Step 2: Regenerate client**

Run: `pnpm --filter shopee-dashboard exec prisma generate`
Expected: sukses. (DB push terjadi di entrypoint deploy; lokal test tidak menyentuh DB.)

- [ ] **Step 3: Update generate route** — di titik sukses (setelah stlPath disimpan), tambahkan pada `prisma.<model>.update` data: `generatedConfigHash: hashLgConfig(configSent)` di mana `configSent` = object config final yang dikirim ke stl-service (variabel existing di route; JANGAN hash hasil strip berbeda antara preview/generate — pakai config pra-strip yang sama dengan yang di-hash client, yaitu merged config dari request).

- [ ] **Step 4: Tambah test determinisme**

```ts
  it('hash stable for realistic config', () => {
    const cfg = { outer_radius: 100, cover_type: 'top', user: null, nested: { a: [1, 2] } }
    expect(hashLgConfig(cfg)).toBe(hashLgConfig(JSON.parse(JSON.stringify(cfg))))
  })
```

- [ ] **Step 5: Run + commit**

Run: `pnpm --filter shopee-dashboard test` → PASS.

```bash
git add apps/dashboard/prisma/schema.prisma "apps/dashboard/app/api/light-generator/orders/[id]/generate/route.ts" apps/dashboard/lib/light-generator/types.ts apps/dashboard/lib/light-generator/__tests__/config-hash.test.ts
git commit -m "feat(dashboard): persist generatedConfigHash on STL generate for staleness detection"
```

---

### Task 4: Hook autosave `useLgAutosave`

**Files:**
- Create: `apps/dashboard/lib/hooks/use-lg-autosave.ts`
- Test: `apps/dashboard/lib/hooks/__tests__/use-lg-autosave.test.ts`

**Interfaces:**
- Produces: `export type AutosaveStatus = "idle" | "saving" | "saved" | "error"`; `export function createAutosaver(save: (config: Record<string, unknown>) => Promise<void>, delayMs?: number): { push(config: Record<string, unknown>): void; flush(): Promise<void>; dispose(): void; readonly status: AutosaveStatus; onStatus(cb: (s: AutosaveStatus) => void): void }` (pure, testable dengan fake timers); `export function useLgAutosave(orderId: string): { push(config: Record<string, unknown>): void; status: AutosaveStatus; savedAt: Date | null }` — React wrapper yang PATCH `/api/light-generator/orders/${orderId}` body `{ configJsonOperator: JSON.stringify(config) }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/dashboard/lib/hooks/__tests__/use-lg-autosave.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createAutosaver } from '../use-lg-autosave'

describe('createAutosaver', () => {
  it('debounces rapid pushes into one save with the last value', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(undefined)
    const a = createAutosaver(save, 1000)
    a.push({ v: 1 }); a.push({ v: 2 }); a.push({ v: 3 })
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ v: 3 })
    vi.useRealTimers()
  })
  it('status transitions idle -> saving -> saved', async () => {
    vi.useFakeTimers()
    const seen: string[] = []
    const a = createAutosaver(async () => {}, 100)
    a.onStatus(s => seen.push(s))
    a.push({})
    await vi.advanceTimersByTimeAsync(100)
    expect(seen).toEqual(['saving', 'saved'])
    vi.useRealTimers()
  })
  it('save rejection -> error status', async () => {
    vi.useFakeTimers()
    const seen: string[] = []
    const a = createAutosaver(async () => { throw new Error('x') }, 100)
    a.onStatus(s => seen.push(s))
    a.push({})
    await vi.advanceTimersByTimeAsync(100)
    expect(seen.at(-1)).toBe('error')
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run to verify FAIL** — `pnpm --filter shopee-dashboard exec vitest run lib/hooks/__tests__/use-lg-autosave.test.ts`

- [ ] **Step 3: Implement**

```ts
"use client"
import { useEffect, useMemo, useState } from "react"

export type AutosaveStatus = "idle" | "saving" | "saved" | "error"

export function createAutosaver(
  save: (config: Record<string, unknown>) => Promise<void>,
  delayMs = 1000,
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Record<string, unknown> | null = null
  let status: AutosaveStatus = "idle"
  const listeners = new Set<(s: AutosaveStatus) => void>()
  const setStatus = (s: AutosaveStatus) => { status = s; listeners.forEach(l => l(s)) }

  async function run() {
    if (!pending) return
    const cfg = pending
    pending = null
    setStatus("saving")
    try { await save(cfg); setStatus("saved") } catch { setStatus("error") }
  }

  return {
    push(config: Record<string, unknown>) {
      pending = config
      if (timer) clearTimeout(timer)
      timer = setTimeout(run, delayMs)
    },
    async flush() { if (timer) clearTimeout(timer); await run() },
    dispose() { if (timer) clearTimeout(timer) },
    get status() { return status },
    onStatus(cb: (s: AutosaveStatus) => void) { listeners.add(cb) },
  }
}

export function useLgAutosave(orderId: string) {
  const [status, setStatus] = useState<AutosaveStatus>("idle")
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const autosaver = useMemo(() => createAutosaver(async (config) => {
    const res = await fetch(`/api/light-generator/orders/${orderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ configJsonOperator: JSON.stringify(config) }),
    })
    if (!res.ok) throw new Error(`save failed: ${res.status}`)
  }), [orderId])
  useEffect(() => {
    autosaver.onStatus(s => { setStatus(s); if (s === "saved") setSavedAt(new Date()) })
    return () => autosaver.dispose()
  }, [autosaver])
  return { push: autosaver.push.bind(autosaver), status, savedAt }
}
```

- [ ] **Step 4: Run to verify PASS**, lalu commit:

```bash
git add apps/dashboard/lib/hooks/use-lg-autosave.ts apps/dashboard/lib/hooks/__tests__/use-lg-autosave.test.ts
git commit -m "feat(dashboard): debounced autosave hook for LG editor v2"
```

---

### Task 5: Hook preview pipeline `useLgPreview`

**Files:**
- Create: `apps/dashboard/lib/hooks/use-lg-preview.ts`
- Test: `apps/dashboard/lib/hooks/__tests__/use-lg-preview.test.ts`

**Interfaces:**
- Consumes: endpoint existing `POST /api/light-generator/orders/[id]/preview` (body JSON config → PNG blob) dan `POST .../check-islands` (cek signature persis di route file; sesuaikan body).
- Produces: `export function createPreviewRunner(fetchPreview: (config, signal) => Promise<Blob>, delayMs?: number)` dengan `request(config): void`, callback `onResult({ url, latencyMs, seq })`, abort otomatis in-flight, guard seq (hasil lama dibuang). `export function useLgPreview(orderId: string): { pngUrl: string | null; status: "idle"|"loading"|"ready"|"error"; latencyMs: number | null; islands: { hasFloating: boolean } | null; request(config: Record<string, unknown>): void }` — setelah preview sukses otomatis panggil check-islands (chained) dengan config yang sama.

- [ ] **Step 1: Write the failing test**

```ts
// apps/dashboard/lib/hooks/__tests__/use-lg-preview.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createPreviewRunner } from '../use-lg-preview'

function blob() { return new Blob(["x"], { type: "image/png" }) }

describe('createPreviewRunner', () => {
  it('debounces and only fetches the last config', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockResolvedValue(blob())
    const r = createPreviewRunner(fetcher, 500)
    r.request({ a: 1 }); r.request({ a: 2 })
    await vi.advanceTimersByTimeAsync(500)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toEqual({ a: 2 })
    vi.useRealTimers()
  })
  it('aborts in-flight request when a new one starts', async () => {
    vi.useFakeTimers()
    const aborted: boolean[] = []
    const fetcher = vi.fn().mockImplementation((_cfg, signal: AbortSignal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => { aborted.push(true); reject(new DOMException('aborted', 'AbortError')) })
        setTimeout(() => resolve(blob()), 5000)
      }))
    const r = createPreviewRunner(fetcher, 100)
    r.request({ a: 1 })
    await vi.advanceTimersByTimeAsync(100)   // fetch 1 in flight
    r.request({ a: 2 })
    await vi.advanceTimersByTimeAsync(100)   // fetch 2 starts, fetch 1 aborted
    expect(aborted).toHaveLength(1)
    vi.useRealTimers()
  })
  it('drops stale responses (seq guard)', async () => {
    vi.useFakeTimers()
    const results: number[] = []
    let call = 0
    const fetcher = vi.fn().mockImplementation(() => {
      call++
      const delay = call === 1 ? 3000 : 100   // first slower than second
      return new Promise(resolve => setTimeout(() => resolve(blob()), delay))
    })
    const r = createPreviewRunner(fetcher, 0)
    r.onResult(({ seq }) => results.push(seq))
    r.request({ a: 1 })
    await vi.advanceTimersByTimeAsync(1)
    r.request({ a: 2 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(results).toEqual([2])   // only the latest lands
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement**

```ts
"use client"
import { useEffect, useMemo, useRef, useState } from "react"

type PreviewResult = { url: string; latencyMs: number; seq: number }

export function createPreviewRunner(
  fetchPreview: (config: Record<string, unknown>, signal: AbortSignal) => Promise<Blob>,
  delayMs = 500,
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null
  let seq = 0
  let latestDelivered = 0
  const resultCbs = new Set<(r: PreviewResult) => void>()
  const errorCbs = new Set<(e: unknown) => void>()

  async function run(config: Record<string, unknown>) {
    controller?.abort()
    controller = new AbortController()
    const mySeq = ++seq
    const t0 = Date.now()
    try {
      const b = await fetchPreview(config, controller.signal)
      if (mySeq < seq || mySeq <= latestDelivered) return  // stale
      latestDelivered = mySeq
      resultCbs.forEach(cb => cb({ url: URL.createObjectURL(b), latencyMs: Date.now() - t0, seq: mySeq }))
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return
      if (mySeq === seq) errorCbs.forEach(cb => cb(e))
    }
  }

  return {
    request(config: Record<string, unknown>) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => run(config), delayMs)
    },
    onResult(cb: (r: PreviewResult) => void) { resultCbs.add(cb) },
    onError(cb: (e: unknown) => void) { errorCbs.add(cb) },
    dispose() { if (timer) clearTimeout(timer); controller?.abort() },
  }
}

export function useLgPreview(orderId: string) {
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [latencyMs, setLatencyMs] = useState<number | null>(null)
  const [islands, setIslands] = useState<{ hasFloating: boolean } | null>(null)
  const lastConfig = useRef<Record<string, unknown> | null>(null)

  const runner = useMemo(() => createPreviewRunner(async (config, signal) => {
    const res = await fetch(`/api/light-generator/orders/${orderId}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config }),
      signal,
    })
    if (!res.ok) throw new Error(`preview ${res.status}`)
    return res.blob()
  }, 500), [orderId])

  useEffect(() => {
    runner.onResult(async ({ url, latencyMs }) => {
      setPngUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url })
      setLatencyMs(latencyMs)
      setStatus("ready")
      // Chained island check with the same config (fire-and-forget)
      try {
        const res = await fetch(`/api/light-generator/orders/${orderId}/check-islands`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config: lastConfig.current }),
        })
        if (res.ok) {
          const j = await res.json()
          setIslands({ hasFloating: !!(j.has_floating_islands ?? j.hasFloatingIslands) })
        }
      } catch { /* island check is advisory */ }
    })
    runner.onError(() => setStatus("error"))
    return () => runner.dispose()
  }, [runner, orderId])

  return {
    pngUrl, status, latencyMs, islands,
    request(config: Record<string, unknown>) {
      lastConfig.current = config
      setStatus("loading")
      runner.request(config)
    },
  }
}
```

CATATAN implementer: verifikasi bentuk body & respons route preview/check-islands existing (`app/api/light-generator/orders/[id]/preview/route.ts`, `.../check-islands` kalau ada — kalau check-islands belum ada route dashboard-nya, cek `lib/stl-service.ts stlCheckIslands` dan route pemanggilnya; sesuaikan URL/body/parse di hook agar cocok, dan sesuaikan test HANYA kalau signature runner berubah).

- [ ] **Step 4: Run to verify PASS**, commit:

```bash
git add apps/dashboard/lib/hooks/use-lg-preview.ts apps/dashboard/lib/hooks/__tests__/use-lg-preview.test.ts
git commit -m "feat(dashboard): debounced abortable preview pipeline hook for LG editor v2"
```

---

### Task 6: Inspector v2 (accordion + search + JSON)

**Files:**
- Create: `apps/dashboard/components/light-generator/editor-v2/LgInspector.tsx`
- Create: `apps/dashboard/components/light-generator/editor-v2/filter-params.ts`
- Test: `apps/dashboard/components/light-generator/editor-v2/__tests__/LgInspector.test.tsx`, `.../filter-params.test.ts`

**Interfaces:**
- Consumes: `SECTIONS`, `RECESS_PARAMS`, `COVER_OPTIONS`, `SHAPE_OPTIONS`, `ParamDef` (Task 1).
- Produces: `export function filterSections(sections: typeof SECTIONS, query: string)` — pure: query kosong → semua; selain itu match case-insensitive pada `key` ATAU `label`, section tanpa match disembunyikan. `export function LgInspector({ config, onChange }: { config: Record<string, unknown>; onChange(next: Record<string, unknown>): void })` — render: input search, accordions (shadcn `Accordion type="multiple"` default semua terbuka) per section hasil filter; tiap param pakai renderer slider+number/switch (pola markup sama dengan LgConfigEditor section renderer — salin polanya, state dari props `config`, perubahan via `onChange({ ...config, [key]: value })`); section kondisional cover (bottom→LED Pillar, top→LED Recess) mengikuti aturan v1; bagian bawah: accordion "Raw JSON" (collapsed default) berisi textarea + tombol Apply (logika parse/merge sama seperti `applyJsonDraft` v1, error inline).

- [ ] **Step 1: Write the failing tests**

```ts
// filter-params.test.ts
import { describe, it, expect } from 'vitest'
import { filterSections } from '../filter-params'
import { SECTIONS } from '../../config-params'

describe('filterSections', () => {
  it('empty query returns all sections', () => {
    expect(filterSections(SECTIONS, '')).toHaveLength(SECTIONS.length)
  })
  it('matches by key', () => {
    const out = filterSections(SECTIONS, 'n_stencil_theta')
    expect(out).toHaveLength(1)
    expect(out[0].params.map(p => p.key)).toEqual(['n_stencil_theta'])
  })
  it('matches by label case-insensitive', () => {
    const out = filterSections(SECTIONS, 'outer radius')
    expect(out.some(s => s.params.some(p => p.key === 'outer_radius'))).toBe(true)
  })
})
```

```tsx
// LgInspector.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LgInspector } from '../LgInspector'

describe('LgInspector', () => {
  it('renders all section titles and the search input', () => {
    const html = renderToStaticMarkup(<LgInspector config={{}} onChange={() => {}} />)
    expect(html).toContain('Size / Geometry')
    expect(html).toContain('cari parameter')
    expect(html).toContain('Raw JSON')
  })
  it('cover top hides pillar section, shows recess', () => {
    const html = renderToStaticMarkup(<LgInspector config={{ cover_type: 'top' }} onChange={() => {}} />)
    expect(html).toContain('Recess radius')
    expect(html).not.toContain('Pillar outer radius')
  })
})
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement `filter-params.ts`**

```ts
import type { SECTIONS as SectionsType } from "../config-params"

export function filterSections(
  sections: typeof SectionsType,
  query: string,
) {
  const q = query.trim().toLowerCase()
  if (!q) return sections
  return sections
    .map(s => ({ ...s, params: s.params.filter(p =>
      p.key.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)) }))
    .filter(s => s.params.length > 0)
}
```

- [ ] **Step 4: Implement `LgInspector.tsx`** — komponen client; struktur:

```tsx
"use client"
import { useState } from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
// ...Label, Slider, Switch, Select, Button seperti LgConfigEditor
import { SECTIONS, RECESS_PARAMS, COVER_OPTIONS, SHAPE_OPTIONS, type ParamDef } from "../config-params"
import { filterSections } from "./filter-params"
```

Render param number: baris label + readout + `Slider` + `Input` (salin markup dari renderer section LgConfigEditor, ganti `getNum/setValue` dengan turunan dari props). Cover select + invert switch + bottom-frame ikut di section "Cover" (pindahkan pola dari v1). JSON accordion: textarea + Apply → `JSON.parse`, validasi object, `onChange({ ...config, ...parsed })`, error state inline. Placeholder search: `cari parameter…`.

- [ ] **Step 5: Run tests → PASS**, commit:

```bash
git add apps/dashboard/components/light-generator/editor-v2/ 
git commit -m "feat(dashboard): LG editor v2 inspector with accordion sections, param search, JSON editor"
```

---

### Task 7: Shell v2 — halaman `/v2`, top bar, rail, canvas 2D, status strip

**Files:**
- Create: `apps/dashboard/app/(dashboard)/light-generator/[id]/v2/page.tsx`
- Create: `apps/dashboard/components/light-generator/editor-v2/LgEditorShell.tsx` (top bar + grid layout + status strip; menerima children slot)
- Create: `apps/dashboard/components/light-generator/editor-v2/LgCanvas2D.tsx`
- Modify: `apps/dashboard/app/(dashboard)/light-generator/[id]/page.tsx` (tambah SATU Link "Coba editor v2 →" di header — satu-satunya sentuhan v1)
- Test: `apps/dashboard/components/light-generator/editor-v2/__tests__/LgEditorShell.test.tsx`

**Interfaces:**
- Consumes: `useLgOrder`, `useUpdateLgOrder`, `useGenerateLgStl` (hooks existing di `lib/hooks/use-light-generator.ts`), `useLgAutosave` (Task 4), `useLgPreview` (Task 5), `LgInspector` (Task 6), `hashLgConfig` (Task 2), `computeObjectInfo` (Task 2), `PageShell`.
- Produces: halaman v2 fungsional: edit param → autosave + preview refresh otomatis; badge stale; tab bar `Shadow | Wall (θ,z) | 3D` dengan Wall & 3D = stub "Segera — increment berikutnya".

- [ ] **Step 1: Write the failing test**

```tsx
// LgEditorShell.test.tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LgEditorShell } from '../LgEditorShell'

describe('LgEditorShell', () => {
  it('renders top bar, tabs, status strip, and stale badge when stale', () => {
    const html = renderToStaticMarkup(
      <LgEditorShell
        orderId="LG-1"
        customerName="Budi"
        status="paid"
        saveStatus="saved"
        savedAt={null}
        isStale={true}
        estimate={{ weight: "48 g", height: "40 mm" }}
        preview={{ latencyMs: 1200, islands: { hasFloating: false } }}
        activeTab="shadow"
        onTabChange={() => {}}
        onGenerate={() => {}}
        generating={false}
        inspector={<div>INSPECTOR</div>}
        canvas={<div>CANVAS</div>}
        rail={<div>RAIL</div>}
      />)
    expect(html).toContain('LG-1')
    expect(html).toContain('Shadow')
    expect(html).toContain('Wall')
    expect(html).toContain('3D')
    expect(html).toContain('STL stale')
    expect(html).toContain('INSPECTOR')
    expect(html).toContain('CANVAS')
    expect(html).toContain('48 g')
  })
  it('no stale badge when not stale', () => {
    const html = renderToStaticMarkup(
      <LgEditorShell orderId="LG-1" customerName="B" status="paid" saveStatus="idle" savedAt={null}
        isStale={false} estimate={null} preview={{ latencyMs: null, islands: null }}
        activeTab="shadow" onTabChange={() => {}} onGenerate={() => {}} generating={false}
        inspector={null} canvas={null} rail={null} />)
    expect(html).not.toContain('STL stale')
  })
})
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement `LgEditorShell.tsx`** — presentational murni (props di test = kontraknya): top bar (Link back ke `/light-generator/${orderId}` label "← v1", id, customer, badge status, indikator save "Saving… / Saved HH:MM", tombol Generate STL + badge `STL stale` bila `isStale`), grid `grid-cols-[260px_minmax(0,1fr)_340px]` (rail | tengah | inspector), tab bar (3 tombol, `activeTab`/`onTabChange`), status strip bawah (latency `preview.latencyMs`, islands ✓/⚠, estimate). Tanpa fetch — semua dari props.

- [ ] **Step 4: Implement `LgCanvas2D.tsx`**

```tsx
"use client"
export function LgCanvas2D({ pngUrl, loading }: { pngUrl: string | null; loading: boolean }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-[#16181d]">
      {pngUrl
        ? <img src={pngUrl} alt="Shadow preview" className={`h-full w-full object-contain ${loading ? "opacity-60" : ""}`} />
        : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Belum ada preview — ubah parameter untuk memicu</div>}
      {loading && (
        <span className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">updating…</span>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Implement `v2/page.tsx`** — client page (pola `use(params)` seperti v1): state `config` (merged customer+operator saat load, seperti v1), setiap `onChange`: `setConfig(next)`, `autosave.push(next)`, `preview.request(next)`. `isStale = order.generatedConfigHash != null ? hashLgConfig(config) !== order.generatedConfigHash : !!order.stlPath`. Generate pakai `useGenerateLgStl(id)` lalu `refetch()`. Bungkus `PageShell` dengan `title={order.id + " · editor v2"}`. Tab Wall/3D render placeholder Card "Segera — increment berikutnya". Rail: ringkasan customer + 2 thumbnail `LgImageSlot` + status dropdown (pakai PATCH existing).

- [ ] **Step 6: Tambah link di v1 header** (satu-satunya edit v1): setelah Badge status di header, `<Link href={`/light-generator/${order.id}/v2`} className="text-xs text-muted-foreground underline">Coba editor v2 →</Link>`.

- [ ] **Step 7: Run all tests + typecheck route**

Run: `pnpm --filter shopee-dashboard test` → PASS; `pnpm --filter shopee-dashboard exec tsc --noEmit 2>&1 | grep editor-v2` → tanpa error baru.

- [ ] **Step 8: Commit**

```bash
git add "apps/dashboard/app/(dashboard)/light-generator/[id]/v2/page.tsx" apps/dashboard/components/light-generator/editor-v2/ "apps/dashboard/app/(dashboard)/light-generator/[id]/page.tsx"
git commit -m "feat(dashboard): LG editor shell v2 page - top bar, rail, canvas, inspector, status strip, autosave + live preview"
```

---

### Task 8: Verifikasi manual via dev server (wajib sebelum selesai)

**Files:** — (verifikasi saja)

- [ ] **Step 1:** Jalankan dev server (preview tool / `.claude/launch.json`), buka `/light-generator/<id-order-nyata>/v2`.
- [ ] **Step 2:** Cek: edit slider → indikator "Saving…" lalu "Saved"; preview PNG ter-refresh sekali (bukan per keystroke); badge stale muncul setelah edit; klik Generate → timer jalan → selesai → badge stale hilang; link switcher dua arah bekerja; halaman v1 tampil & berperilaku persis seperti sebelumnya.
- [ ] **Step 3:** Screenshot untuk bukti; catat isu kecil sebagai findings (jangan perbaiki di luar scope tanpa dicatat).

## Self-review checklist (sudah dijalankan penulis plan)

- Spec coverage inc-1: route /v2 ✓ topbar ✓ rail ✓ inspector+search ✓ status strip ✓ tab stub ✓ switcher ✓ autosave ✓; inc-2: canvas Shadow ✓ debounce+abort+seq ✓ shimmer ✓ filament live ✓ stale hash ✓ chained islands ✓.
- Increment 3–6 (padding ring, Wall/stems, centroids, 3D r3f) — plan terpisah menyusul.
- Type consistency: `hashLgConfig`/`createAutosaver`/`createPreviewRunner`/`filterSections` konsisten di semua task.
