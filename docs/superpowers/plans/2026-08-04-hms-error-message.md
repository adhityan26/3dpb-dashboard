# Pesan Error HMS Manusiawi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish sebuah field MQTT baru `error_message` (payload `3dpb/printers`) berisi deskripsi HMS Bambu Lab yang manusiawi, menggantikan kebutuhan konsumen (firmware CYD, sub-project B) untuk membaca string diagnostik mentah `error_msg`.

**Architecture:** `HmsLookup` (sudah ada, `hms.ts`) diberi fungsi baru `describeError()` yang membungkus `translate()` dengan fallback + pemotongan panjang. `Engine` me-resolve satu instance `HmsLookup` di constructor dan membagikannya ke `StateStore` (buat mengisi `last_error_message` tiap `upsertFromStatus()`) dan ke notifier (`handleStatus()`, pola lama tetap). `payload.ts` memetakan `last_error_message` ke field `error_message` pada `PrinterRow`.

**Tech Stack:** TypeScript, Vitest, pnpm workspace (`packages/printer-monitor-core`).

## Global Constraints

- Field `error_msg` lama (raw `print_error=N | mc_print_error_code=M`) TIDAK BOLEH berubah nilai maupun tipe di semua kasus — konsumen lain masih memakainya.
- `error_message` HANYA diisi kalau `state === 'error'`; selain itu string kosong `''`.
- Ambil HANYA entri HMS **pertama** (`translate(hms)[0]`) kalau ada lebih dari satu — tidak digabung.
- Fallback tanpa HMS: `"Print error (kode {printError})"` kalau `printError !== 0`; kalau tidak, `"Print error"` (kasus Moonraker hari ini, `hms: []` dan `printError: 0` selalu).
- Panjang maksimal `error_message` = 120 karakter; kalau lebih, potong ke 119 karakter + `"…"` (total tepat 120).
- `new StateStore()` (tanpa argumen) tetap harus valid — dipakai di test-test lama.

---

### Task 1: `describeError()` di `hms.ts`

**Files:**
- Modify: `packages/printer-monitor-core/src/hms.ts`
- Test: `packages/printer-monitor-core/src/__tests__/hms.test.ts`

**Interfaces:**
- Consumes: `HmsLookup` class (sudah ada, `translate(hms: HmsEntry[]): string[]`), `HmsEntry` dari `./types` (sudah ada, `{ attr: number; code: number }`).
- Produces: `export function describeError(hms: HmsEntry[], printError: number, lookup: HmsLookup): string` — dipakai Task 2.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan blok `describe('describeError', ...)` baru di akhir `packages/printer-monitor-core/src/__tests__/hms.test.ts` (setelah `describe('HmsLookup', ...)` yang sudah ada, tetap dalam file yang sama). Ubah baris import paling atas file dari:

```ts
import { HmsLookup, hmsKeyFor } from '../hms'
```

menjadi:

```ts
import { HmsLookup, hmsKeyFor, describeError } from '../hms'
```

Lalu tambahkan di akhir file:

```ts

describe('describeError', () => {
  it('pakai entri HMS pertama kalau ada', () => {
    const l = new HmsLookup({ '1201_8007': 'Extruder clogged.' })
    expect(describeError([{ attr: 0x12018007, code: 66 }], 0, l))
      .toBe('[1201_8007] Extruder clogged.')
  })

  it('ambil entri PERTAMA saja kalau HMS lebih dari 1 (tidak digabung)', () => {
    const l = new HmsLookup({
      '1201_8007': 'Extruder clogged.',
      '0c00_0100': 'Bed temperature abnormal.',
    })
    expect(describeError(
      [{ attr: 0x12018007, code: 66 }, { attr: 0x0c000100, code: 1 }], 0, l,
    )).toBe('[1201_8007] Extruder clogged.')
  })

  it('fallback kode print_error kalau HMS kosong tapi printError != 0', () => {
    const l = new HmsLookup({})
    expect(describeError([], 117473285, l)).toBe('Print error (kode 117473285)')
  })

  it('fallback generik kalau HMS kosong dan printError 0 (kasus Moonraker)', () => {
    const l = new HmsLookup({})
    expect(describeError([], 0, l)).toBe('Print error')
  })

  it('dipotong ke 120 karakter + ellipsis kalau lebih panjang', () => {
    const longDesc = 'A'.repeat(150)
    const l = new HmsLookup({ '1201_8007': longDesc })
    const result = describeError([{ attr: 0x12018007, code: 66 }], 0, l)
    expect(result.length).toBe(120)
    expect(result.endsWith('…')).toBe(true)
    expect(result.startsWith('[1201_8007] AAAA')).toBe(true)
  })
})
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd packages/printer-monitor-core && pnpm vitest run src/__tests__/hms.test.ts`
Expected: FAIL — `describeError` is not exported / not a function.

- [ ] **Step 3: Implementasi minimal**

Tambahkan di akhir `packages/printer-monitor-core/src/hms.ts` (setelah class `HmsLookup` yang sudah ada, `import type { HmsEntry } from './types'` di baris 2 sudah cukup, tidak perlu import baru):

```ts

const MAX_ERROR_MESSAGE_LEN = 120

export function describeError(hms: HmsEntry[], printError: number, lookup: HmsLookup): string {
  const translated = lookup.translate(hms)
  const raw = translated[0] ?? (printError !== 0 ? `Print error (kode ${printError})` : 'Print error')
  return raw.length > MAX_ERROR_MESSAGE_LEN ? raw.slice(0, MAX_ERROR_MESSAGE_LEN - 1) + '…' : raw
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd packages/printer-monitor-core && pnpm vitest run src/__tests__/hms.test.ts`
Expected: PASS — semua test termasuk 4 test lama + 5 test baru.

- [ ] **Step 5: Commit**

```bash
git add packages/printer-monitor-core/src/hms.ts packages/printer-monitor-core/src/__tests__/hms.test.ts
git commit -m "$(cat <<'EOF'
feat(printer-monitor-core): describeError() -- pesan HMS manusiawi + fallback

Bagian dari redesign notifikasi CYD (sub-project A, backend). Ambil
entri HMS pertama via HmsLookup.translate(), fallback kode print_error
kalau tak ada HMS, dipotong ke 120 karakter.
EOF
)"
```

---

### Task 2: Thread `error_message` lewat `StateStore` + `payload.ts`

**Files:**
- Modify: `packages/printer-monitor-core/src/types.ts:44-56` (interface `StoredState`), `packages/printer-monitor-core/src/types.ts:62-74` (interface `PrinterRow`)
- Modify: `packages/printer-monitor-core/src/state-store.ts` (seluruh file)
- Modify: `packages/printer-monitor-core/src/payload.ts` (seluruh file)
- Test: `packages/printer-monitor-core/src/__tests__/payload.test.ts`

**Interfaces:**
- Consumes: `describeError(hms, printError, lookup)` dari Task 1 (`../hms`); `HmsLookup` class (`../hms`); `NormalizedStatus.state`, `.hms`, `.printError` (sudah ada di `types.ts`).
- Produces: `StoredState.last_error_message: string`; `PrinterRow.error_message: string`; `StateStore` constructor baru `constructor(private hms: HmsLookup = new HmsLookup())` — dipakai Task 3.

- [ ] **Step 1: Tulis test yang gagal**

Di `packages/printer-monitor-core/src/__tests__/payload.test.ts`, ubah baris import paling atas dari:

```ts
import { describe, it, expect } from 'vitest'
import { StateStore } from '../state-store'
import { buildPrintersPayload } from '../payload'
import { normalizeBambu } from '../normalize-bambu'
import type { DeviceConfig } from '../types'
```

menjadi (tambah 1 baris import `HmsLookup`):

```ts
import { describe, it, expect } from 'vitest'
import { StateStore } from '../state-store'
import { buildPrintersPayload } from '../payload'
import { normalizeBambu } from '../normalize-bambu'
import { HmsLookup } from '../hms'
import type { DeviceConfig } from '../types'
```

Test PERTAMA di file ini (`'device tanpa data → OFFLINE, field default'`) memakai `.toEqual()` dengan objek literal LENGKAP — field baru WAJIB ditambahkan di situ juga atau test ini akan gagal (objek aktual akan punya field ekstra yang tak diharapkan `toEqual`). Ubah:

```ts
  it('device tanpa data → OFFLINE, field default', () => {
    const p = buildPrintersPayload([mars], new StateStore(), T0)
    expect(p.payload).toEqual([{
      id: 'mars',
      name: 'Mars', type: 'P1P', state: 'OFFLINE', progress: 0,
      remaining_min: 0, filename: '', error_msg: '', last_seen: null,
      nozzle_temp: 0, bed_temp: 0,
    }])
  })
```

menjadi:

```ts
  it('device tanpa data → OFFLINE, field default', () => {
    const p = buildPrintersPayload([mars], new StateStore(), T0)
    expect(p.payload).toEqual([{
      id: 'mars',
      name: 'Mars', type: 'P1P', state: 'OFFLINE', progress: 0,
      remaining_min: 0, filename: '', error_msg: '', error_message: '', last_seen: null,
      nozzle_temp: 0, bed_temp: 0,
    }])
  })
```

Lalu tambahkan 3 test baru di akhir `describe('StateStore + buildPrintersPayload', ...)` (sebelum penutup `})` terakhir file):

```ts

  it('error_message terisi dari HmsLookup kalau state error dgn entri HMS; error_msg lama tetap ada', () => {
    const hms = new HmsLookup({ '1201_8007': 'Extruder clogged.' })
    const store = new StateStore(hms)
    const s = normalizeBambu('mars', { print: {
      gcode_state: 'FAILED', print_error: 117473285, mc_print_error_code: '0',
      hms: [{ attr: 0x12018007, code: 66 }] } })
    store.upsertFromStatus(mars, s, 'error')
    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0].error_message).toBe('[1201_8007] Extruder clogged.')
    expect(p.payload[0].error_msg).toContain('print_error=117473285')
  })

  it('error_message fallback kode print_error kalau HMS kosong', () => {
    const store = new StateStore(new HmsLookup({}))
    const s = normalizeBambu('mars', { print: {
      gcode_state: 'FAILED', print_error: 5, mc_print_error_code: '0', hms: [] } })
    store.upsertFromStatus(mars, s, 'error')
    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0].error_message).toBe('Print error (kode 5)')
  })

  it('error_message kosong kalau state bukan error', () => {
    const store = new StateStore()
    const s = normalizeBambu('mars', { print: { gcode_state: 'RUNNING', mc_percent: 50 } })
    store.upsertFromStatus(mars, s, null)
    const p = buildPrintersPayload([mars], store, T0)
    expect(p.payload[0].error_message).toBe('')
  })
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd packages/printer-monitor-core && pnpm vitest run src/__tests__/payload.test.ts`
Expected: FAIL — `error_message` tidak ada di hasil `buildPrintersPayload` (undefined ≠ expected string), dan `StateStore` constructor belum menerima argumen `HmsLookup` (type error kalau dijalankan lewat `tsc`, atau diam-diam diabaikan runtime tapi assertion tetap gagal).

- [ ] **Step 3: Implementasi minimal**

`packages/printer-monitor-core/src/types.ts` — tambahkan `last_error_message: string` setelah `last_error_code: string` (baris 52):

```ts
export interface StoredState {
  name: string
  type: string
  last_state: string
  last_progress: number
  last_remaining_min: number
  last_task_id: string
  last_filename: string
  last_error_code: string
  last_error_message: string
  last_seen_at: string | null
  last_nozzle_temp: number
  last_bed_temp: number
}
```

Tambahkan `error_message: string` setelah `error_msg: string` (baris 70) di `PrinterRow`:

```ts
export interface PrinterRow {
  id: string
  name: string
  type: string
  state: string             // PrinterState | 'OFFLINE'
  progress: number
  remaining_min: number
  filename: string
  error_msg: string
  error_message: string
  last_seen: string | null
  nozzle_temp: number
  bed_temp: number
}
```

`packages/printer-monitor-core/src/state-store.ts` — ganti seluruh isi file jadi:

```ts
import type { DeviceConfig, NormalizedStatus, PrinterEventKind, StoredState } from './types'
import { storedStateFor } from './capture-event'
import { HmsLookup, describeError } from './hms'

export class StateStore {
  private m = new Map<string, StoredState>()
  constructor(private hms: HmsLookup = new HmsLookup()) {}
  get(id: string) { return this.m.get(id) }
  all() { return this.m }
  upsertFromStatus(device: DeviceConfig, s: NormalizedStatus, event: PrinterEventKind | null): StoredState {
    const row: StoredState = {
      name: device.name, type: device.type,
      last_state: storedStateFor(event, s),
      last_progress: s.progress,
      last_remaining_min: s.remainingMin,
      last_task_id: s.taskId,
      last_filename: s.file,
      last_error_code: s.errorDetails,
      last_error_message: s.state === 'error' ? describeError(s.hms, s.printError, this.hms) : '',
      last_seen_at: s.eventTime,
      last_nozzle_temp: s.nozzleTemp,
      last_bed_temp: s.bedTemp,
    }
    this.m.set(device.id, row)
    return row
  }
}
```

`packages/printer-monitor-core/src/payload.ts` — ganti seluruh isi file jadi:

```ts
import type { DeviceConfig, PrintersPayload } from './types'
import type { StateStore } from './state-store'

export const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000

export function buildPrintersPayload(
  devices: DeviceConfig[], store: StateStore, nowMs: number,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
): PrintersPayload {
  return {
    payload: devices.map((d) => {
      const r = store.get(d.id)
      const lastSeen = r?.last_seen_at ? Date.parse(r.last_seen_at) : null
      const isStale = lastSeen === null || nowMs - lastSeen > staleAfterMs
      return {
        id: d.id,
        name: d.name, type: d.type,
        state: isStale ? 'OFFLINE' : (r!.last_state || 'idle'),
        progress: r?.last_progress ?? 0,
        remaining_min: r?.last_remaining_min ?? 0,
        filename: r?.last_filename ?? '',
        error_msg: r?.last_error_code ?? '',
        error_message: r?.last_error_message ?? '',
        last_seen: r?.last_seen_at ?? null,
        nozzle_temp: r?.last_nozzle_temp ?? 0,
        bed_temp: r?.last_bed_temp ?? 0,
      }
    }),
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd packages/printer-monitor-core && pnpm vitest run src/__tests__/payload.test.ts src/__tests__/hms.test.ts`
Expected: PASS — semua test lama + 3 test baru di `payload.test.ts`.

- [ ] **Step 5: Jalankan seluruh suite package, pastikan tidak ada regresi**

Run: `cd packages/printer-monitor-core && pnpm vitest run`
Expected: PASS semua file test (termasuk `normalize-bambu.test.ts`, `capture-event.test.ts`, dll — belum ada yang menyentuh `StateStore`/`PrinterRow` di luar `payload.test.ts` jadi seharusnya tidak terdampak; kalau ada yang gagal karena field `error_message` yang hilang, cek apakah ada `toEqual` literal lain yang lolos dari pencarian di Step 1).

- [ ] **Step 6: Commit**

```bash
git add packages/printer-monitor-core/src/types.ts packages/printer-monitor-core/src/state-store.ts packages/printer-monitor-core/src/payload.ts packages/printer-monitor-core/src/__tests__/payload.test.ts
git commit -m "$(cat <<'EOF'
feat(printer-monitor-core): publish error_message manusiawi di payload MQTT

StoredState.last_error_message + PrinterRow.error_message (additive,
error_msg lama tak berubah) -- StateStore terima HmsLookup opsional
buat isi field ini via describeError() (Task sebelumnya) saat
state==error.
EOF
)"
```

---

### Task 3: `Engine` — resolve `HmsLookup` sekali, dibagi ke `StateStore` + notifier

**Files:**
- Modify: `packages/printer-monitor-core/src/engine.ts` (seluruh file)
- Test: `packages/printer-monitor-core/src/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: `StateStore` constructor `(hms?: HmsLookup)` dari Task 2; `HmsLookup` class + `EngineOpts.hms?: HmsLookup` (sudah ada).
- Produces: tidak ada interface baru buat task lain -- task terakhir di sub-project A.

- [ ] **Step 1: Tulis test yang gagal**

Di `packages/printer-monitor-core/src/__tests__/engine.test.ts`, ubah baris import paling atas dari:

```ts
import { describe, it, expect, vi } from 'vitest'
import { Engine, type Reporter, type Notifier } from '../engine'
import { normalizeBambu } from '../normalize-bambu'
import { BambuMqttConnector } from '../connectors/bambu-mqtt'
import type { DeviceConfig, PrintersPayload, PrinterEvent } from '../types'
```

menjadi (tambah 1 baris import `HmsLookup`):

```ts
import { describe, it, expect, vi } from 'vitest'
import { Engine, type Reporter, type Notifier } from '../engine'
import { normalizeBambu } from '../normalize-bambu'
import { BambuMqttConnector } from '../connectors/bambu-mqtt'
import { HmsLookup } from '../hms'
import type { DeviceConfig, PrintersPayload, PrinterEvent } from '../types'
```

Tambahkan test baru di akhir `describe('Engine', ...)` (sebelum `})` penutup terakhir), memverifikasi `error_message` mengalir end-to-end dari event error sampai `snapshot()`:

```ts

  it('event error dgn HMS → snapshot payload berisi error_message manusiawi (via HmsLookup ter-inject)', async () => {
    const published: PrintersPayload[] = []
    const reporter: Reporter = { publishStatus: (p) => void published.push(p), emitEvent: () => {} }
    const engine = new Engine({
      devices: [mars], connectors: [], reporters: [reporter],
      hms: new HmsLookup({ '1201_8007': 'Extruder clogged.' }),
      now: () => Date.parse('2026-07-16T01:00:00Z'),
    })
    await engine.handleStatus(normalizeBambu('mars', { print: {
      gcode_state: 'FAILED', print_error: 117473285, mc_print_error_code: '0',
      hms: [{ attr: 0x12018007, code: 66 }] } }))
    expect(published.at(-1)!.payload[0]).toMatchObject({
      state: 'error', error_message: '[1201_8007] Extruder clogged.',
    })
  })
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `cd packages/printer-monitor-core && pnpm vitest run src/__tests__/engine.test.ts`
Expected: FAIL — `error_message` di payload masih `''` (kosong), karena `Engine` belum membagikan `HmsLookup` yang di-inject ke `StateStore`-nya (`StateStore` internal `Engine` masih pakai default `new HmsLookup()` kosong, bukan yang diinject test).

- [ ] **Step 3: Implementasi minimal**

Ganti seluruh isi `packages/printer-monitor-core/src/engine.ts` jadi:

```ts
import type { DeviceConfig, NormalizedStatus, PrinterEvent, PrintersPayload } from './types'
import { captureEvent } from './capture-event'
import { StateStore } from './state-store'
import { buildPrintersPayload, DEFAULT_STALE_AFTER_MS } from './payload'
import { HmsLookup } from './hms'

export interface Connector {
  readonly deviceId: string
  start(onStatus: (s: NormalizedStatus) => void): void | Promise<void>
  stop(): void | Promise<void>
}
export interface Reporter {
  publishStatus(p: PrintersPayload): void | Promise<void>
  emitEvent(e: PrinterEvent): void | Promise<void>
}
export interface Notifier {
  notify(e: PrinterEvent, ctx: { printerName: string; hmsText: string[] }): void | Promise<void>
}
export interface EngineOpts {
  devices: DeviceConfig[]
  connectors: Connector[]
  reporters: Reporter[]
  notifiers?: Notifier[]
  hms?: HmsLookup
  staleAfterMs?: number
  republishIntervalMs?: number
  now?: () => number
}

export class Engine {
  private hms: HmsLookup
  private store: StateStore
  private timer: ReturnType<typeof setInterval> | null = null
  private deviceById: Map<string, DeviceConfig>
  constructor(private opts: EngineOpts) {
    this.deviceById = new Map(opts.devices.map((d) => [d.id, d]))
    this.hms = opts.hms ?? new HmsLookup()
    this.store = new StateStore(this.hms)
  }

  snapshot(): PrintersPayload {
    const now = this.opts.now?.() ?? Date.now()
    return buildPrintersPayload(this.opts.devices, this.store, now,
      this.opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS)
  }

  async handleStatus(s: NormalizedStatus): Promise<void> {
    const device = this.deviceById.get(s.deviceId)
    if (!device) return
    if (device.connector === 'bambu' && !s.gcodeState) return // gate If n8n

    const prev = this.store.get(device.id)
    const { event } = captureEvent(s, prev)
    this.store.upsertFromStatus(device, s, event)

    if (event) {
      const e: PrinterEvent = { deviceId: device.id, kind: event, status: s, prevState: prev?.last_state ?? 'idle' }
      const hmsText = this.hms.translate(s.hms)
      for (const r of this.opts.reporters) {
        try { await r.emitEvent(e) }
        catch (err) { console.error('[reporter]', err) }
      }
      for (const n of this.opts.notifiers ?? []) {
        try { await n.notify(e, { printerName: device.name, hmsText }) }
        catch (err) { console.error('[notifier]', err) }
      }
    }
    await this.publish()
  }

  private async publish(): Promise<void> {
    const p = this.snapshot()
    for (const r of this.opts.reporters) {
      try { await r.publishStatus(p) }
      catch (err) { console.error('[reporter]', err) }
    }
  }

  async start(): Promise<void> {
    for (const c of this.opts.connectors) await c.start((s) => void this.handleStatus(s))
    this.timer = setInterval(() => void this.publish(), this.opts.republishIntervalMs ?? 60_000)
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const c of this.opts.connectors) await c.stop()
  }
}
```

- [ ] **Step 4: Jalankan test, pastikan lolos**

Run: `cd packages/printer-monitor-core && pnpm vitest run src/__tests__/engine.test.ts`
Expected: PASS — semua test lama (5 test) + 1 test baru.

- [ ] **Step 5: Jalankan seluruh suite package + typecheck, pastikan tidak ada regresi**

Run: `cd packages/printer-monitor-core && pnpm vitest run && pnpm tsc --noEmit`
Expected: PASS semua test, tidak ada type error.

- [ ] **Step 6: Jalankan suite monorepo penuh (turbo) buat pastikan apps/agent yang konsumsi package ini juga tidak rusak**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis/.claude/worktrees/inspiring-turing-f985b5 && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm turbo test --filter=@3pb/printer-monitor-core --filter=agent`
Expected: PASS. `apps/agent/src/main/engine-manager.ts` tidak diubah kode-nya sama sekali (sudah inject `hms: new HmsLookup(hmsTable)` lewat `EngineOpts`, otomatis kepakai lewat `Engine` constructor yang baru) tapi tetap dijalankan test suite-nya buat jaga-jaga ada test yang assert bentuk internal `Engine`/`StateStore`.

- [ ] **Step 7: Commit**

```bash
git add packages/printer-monitor-core/src/engine.ts packages/printer-monitor-core/src/__tests__/engine.test.ts
git commit -m "$(cat <<'EOF'
refactor(printer-monitor-core): Engine bagikan 1 instance HmsLookup ke StateStore+notifier

Sebelumnya opts.hms ?? new HmsLookup() di-resolve ulang tiap event
HANYA buat notifier hmsText, StateStore internal Engine selalu pakai
default kosong -- HmsLookup custom yang diinject test/apps/agent tidak
pernah nyampe ke error_message payload. Sekarang di-resolve sekali di
constructor, dipakai bareng oleh keduanya.
EOF
)"
```

---

## Verifikasi akhir sub-project A

Setelah 3 task selesai:

1. `cd packages/printer-monitor-core && pnpm vitest run` — semua test PASS.
2. Konfirmasi manual (opsional tapi direkomendasikan sebelum lanjut ke sub-project B firmware): jalankan `apps/agent` di homelab seperti biasa, `mosquitto_sub -h <broker> -t 3dpb/printers -C 1` pas ada printer beneran error, cek field `error_message` di payload JSON berisi teks manusiawi (bukan `print_error=N | ...`) dan `error_msg` lama tetap ada.
