# Printer Monitor Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Service standalone (core portabel + daemon Docker + TUI) yang menggantikan seluruh workflow printer n8n: subscribe 9 printer Bambu via LAN-MQTT + Snapmaker U1 via Moonraker, normalize → state-machine event → aggregate → publish retained `3dpb/printers` (kontrak CYD identik), siap cutover.

**Architecture:** `packages/printer-monitor-core` = engine TS murni (connectors pluggable, pipeline normalize/captureEvent/HMS/aggregate, reporter pluggable) — lihat spec `docs/superpowers/specs/2026-07-16-printer-monitor-design.md`. `services/printer-monitor` = shell internal: config file lokal (registry dashboard menyusul Fase 2), daemon + TUI status. Zero internet: HMS codes.json di-vendor.

**Tech Stack:** TypeScript strict ESM (pola `packages/kalkulator-core`: `"type":"module"`, exports `./src/index.ts`, noEmit), vitest ^1.6.1, mqtt ^5, aedes (dev, broker in-memory utk test), tsx (runtime daemon), Docker node:22-alpine.

## Global Constraints

- **Node 22 wajib** — setiap shell: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"` (default shell mesin = Node v10 rusak).
- pnpm strict: semua dependency dideklarasikan eksplisit di package.json masing-masing (phantom dep tidak resolve).
- Kontrak payload `3dpb/printers` (WAJIB persis, dari spec §2): `{"payload":[{name,type,state,progress,remaining_min,filename,error_msg,last_seen}]}` — object JSON dengan array (BUKAN string), retained.
- State: lowercase `running|pause|finish|error|idle` + `OFFLINE` (uppercase) saat stale. Staleness default **10 menit**. Pushall keepalive default **5 menit**. Moonraker poll default **60 detik**.
- Topic default service: status `3dpb/printers-v2` (validasi paralel dgn n8n), events `3dpb/printer-events`. Cutover ke `3dpb/printers` HANYA via runbook + persetujuan user.
- **JANGAN** deploy, **JANGAN** menonaktifkan workflow n8n, **JANGAN** menyentuh broker produksi `.113` selain subscribe read-only — semua gated perintah user (runbook Task 13).
- Test: `pnpm --filter <pkg> test` per package; `pnpm turbo test` di akhir tiap task harus tetap hijau (135 test existing + baru).
- Secrets (`ip`/`accessCode`) TIDAK di-commit: `config.json` gitignored, hanya `config.example.json` yang di-commit.

## File Structure

```
packages/printer-monitor-core/
  package.json, tsconfig.json
  src/index.ts                 # re-export publik
  src/types.ts                 # DeviceConfig, NormalizedStatus, PrinterRow, dst
  src/normalize-bambu.ts       # port n8n "Normalize Message"
  src/normalize-moonraker.ts   # port n8n ganymede "Parse Status"
  src/capture-event.ts         # port n8n "Capture Event" (state machine)
  src/hms.ts + src/hms-codes.json  # lookup vendored (zero-internet)
  src/state-store.ts           # in-memory StoredState per device
  src/payload.ts               # buildPrintersPayload (staleness→OFFLINE)
  src/engine.ts                # orkestrasi + interface Connector/Reporter/Notifier
  src/connectors/bambu-mqtt.ts # LAN-MQTT TLS 8883 + pushall keepalive
  src/connectors/moonraker.ts  # HTTP poll
  src/reporters/mqtt.ts        # publish retained + events
  src/notifiers/telegram.ts, src/notifiers/pushover.ts  # opsional, off default
  src/__tests__/*.test.ts + src/__tests__/fixtures/*.json

services/printer-monitor/
  package.json, tsconfig.json
  src/config.ts                # load + validasi config.json (skip device belum lengkap)
  src/main.ts                  # daemon: config → connectors → Engine → MqttReporter
  src/render.ts                # renderTable murni (unit-testable)
  src/status.ts                # TUI: subscribe MQTT → renderTable loop
  src/__tests__/*.test.ts
  config.example.json          # 10 printer (serial terisi, ip/accessCode kosong)
  Dockerfile
  scripts/parity-check.ts      # diff 3dpb/printers (n8n) vs 3dpb/printers-v2 (service)

docs/runbooks/printer-monitor-cutover.md
pnpm-workspace.yaml            # + services/*
.gitignore                     # + services/printer-monitor/config.json
```

---

### Task 1: Scaffold core + types + `normalizeBambu`

**Files:**
- Create: `packages/printer-monitor-core/package.json`, `tsconfig.json`, `src/index.ts`, `src/types.ts`, `src/normalize-bambu.ts`
- Test: `packages/printer-monitor-core/src/__tests__/normalize-bambu.test.ts`
- Modify: (tidak ada)

**Interfaces:**
- Consumes: —
- Produces: semua tipe di `types.ts` (dipakai SEMUA task berikutnya) + `normalizeBambu(deviceId: string, message: unknown): NormalizedStatus`.

- [ ] **Step 1: Scaffold package**

`packages/printer-monitor-core/package.json`:
```json
{
  "name": "@3pb/printer-monitor-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "dependencies": { "mqtt": "^5.10.1" },
  "devDependencies": { "typescript": "^5", "vitest": "^1.6.1", "aedes": "^0.51.3" }
}
```

`packages/printer-monitor-core/tsconfig.json` (samakan kalkulator-core + JSON):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src"]
}
```
Tambah devDependency `@types/node": "^22"` ke package.json di atas.

Jalankan: `pnpm install` (root). Expected: lockfile update tanpa error.

- [ ] **Step 2: Tulis `src/types.ts`**

```ts
export type ConnectorKind = 'bambu' | 'moonraker'

export interface DeviceConfig {
  id: string            // slug unik, mis. 'mars'
  name: string          // tampil di payload, mis. 'Mars'
  type: string          // model, mis. 'P1P' — sumber kolom `type` payload
  connector: ConnectorKind
  ip: string
  serial?: string       // wajib utk bambu (topic device/<serial>/report)
  accessCode?: string   // wajib utk bambu (password MQTT user 'bblp')
}

export type PrinterState = 'running' | 'pause' | 'finish' | 'error' | 'idle'

export interface HmsEntry { attr: number; code: number }

export interface NormalizedStatus {
  deviceId: string
  state: PrinterState
  gcodeState: string        // mentah uppercase; '' jika tidak ada di message
  progress: number
  file: string
  taskId: string
  remainingMin: number
  printError: number
  mcPrintErrorCode: string
  failReason: string
  hms: HmsEntry[]
  errorDetails: string      // gaya n8n Capture Event: "hms=... | print_error=N | mc_print_error_code=M"
  eventTime: string         // ISO
}

export type PrinterEventKind = 'started' | 'error' | 'finished'

export interface PrinterEvent {
  deviceId: string
  kind: PrinterEventKind
  status: NormalizedStatus
  prevState: string
}

export interface StoredState {
  name: string
  type: string
  last_state: string
  last_progress: number
  last_remaining_min: number
  last_task_id: string
  last_filename: string
  last_error_code: string
  last_seen_at: string | null
}

// Kontrak CYD — JANGAN diubah (spec §2)
export interface PrinterRow {
  name: string
  type: string
  state: string             // PrinterState | 'OFFLINE'
  progress: number
  remaining_min: number
  filename: string
  error_msg: string
  last_seen: string | null
}
export interface PrintersPayload { payload: PrinterRow[] }
```

- [ ] **Step 3: Tulis failing test normalize (sample Bambu nyata)**

`src/__tests__/normalize-bambu.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeBambu } from '../normalize-bambu'

const running = {
  print: {
    upgrade_state: { sn: '01S00A2C0502433' },
    gcode_state: 'RUNNING', mc_percent: 42, mc_remaining_time: 58,
    subtask_name: 'Nike_Crocs_1.3', task_id: '12345',
    print_error: 0, mc_print_error_code: '0', fail_reason: '0', hms: [],
  },
}

describe('normalizeBambu (port n8n Normalize Message)', () => {
  it('memetakan report RUNNING', () => {
    const s = normalizeBambu('mars', running)
    expect(s).toMatchObject({
      deviceId: 'mars', state: 'running', gcodeState: 'RUNNING',
      progress: 42, remainingMin: 58, file: 'Nike_Crocs_1.3', taskId: '12345',
      printError: 0, mcPrintErrorCode: '0', failReason: '0',
      errorDetails: 'print_error=0 | mc_print_error_code=0',
    })
    expect(Date.parse(s.eventTime)).not.toBeNaN()
  })

  it('STATE_MAP: FINISH→finish, PAUSED→pause, FAILED→error, PREPARE→running, unknown→idle', () => {
    const st = (g: string) => normalizeBambu('x', { print: { ...running.print, gcode_state: g } }).state
    expect(st('FINISH')).toBe('finish'); expect(st('PAUSED')).toBe('pause')
    expect(st('FAILED')).toBe('error'); expect(st('PREPARE')).toBe('running')
    expect(st('WEIRD')).toBe('idle')
  })

  it('gcode_state absen → gcodeState "" dan state idle (gate If n8n dievaluasi caller)', () => {
    const s = normalizeBambu('x', { print: { mc_percent: 1 } })
    expect(s.gcodeState).toBe(''); expect(s.state).toBe('idle')
  })

  it('file fallback: subtask_name > basename(gcode_file) > basename(file)', () => {
    const s = normalizeBambu('x', { print: { gcode_state: 'IDLE', gcode_file: '/data/dir/part.gcode.3mf' } })
    expect(s.file).toBe('part.gcode.3mf')
  })

  it('errorDetails gaya Capture Event: HMS + print_error desimal', () => {
    const s = normalizeBambu('x', {
      print: { gcode_state: 'RUNNING', print_error: 117473285, mc_print_error_code: '0',
        hms: [{ attr: 0x0c000100, code: 0x00010004 }] },
    })
    expect(s.errorDetails).toBe(
      'hms=code=65540, attr=201326848 | print_error=117473285 | mc_print_error_code=0')
  })
})
```

- [ ] **Step 4: Run test — harus FAIL**

Run: `pnpm --filter @3pb/printer-monitor-core test`
Expected: FAIL — `Cannot find module '../normalize-bambu'`.

- [ ] **Step 5: Implement `src/normalize-bambu.ts`** (port setia; errorDetails = versi Capture Event karena itulah yang tersimpan di kolom & payload)

```ts
import type { HmsEntry, NormalizedStatus, PrinterState } from './types'

const STATE_MAP: Record<string, PrinterState> = {
  RUNNING: 'running', PAUSE: 'pause', PAUSED: 'pause',
  FINISH: 'finish', FAILED: 'error', IDLE: 'idle', PREPARE: 'running',
}

const basename = (p: string) => p.split('/').pop() ?? ''

export function buildErrorDetails(hms: HmsEntry[], printError: number, mcPrintErrorCode: string): string {
  const hmsText = hms.map((h) => `hms=code=${h.code}, attr=${h.attr}`).join(' | ')
  return [hmsText, `print_error=${printError}`, `mc_print_error_code=${mcPrintErrorCode}`]
    .filter(Boolean).join(' | ')
}

export function normalizeBambu(deviceId: string, message: unknown): NormalizedStatus {
  const raw = ((message as Record<string, unknown>)?.print ?? {}) as Record<string, unknown>
  const gcodeState = String(raw.gcode_state ?? '').toUpperCase()
  const hms = Array.isArray(raw.hms) ? (raw.hms as HmsEntry[]) : []
  const printError = Number(raw.print_error ?? 0)
  const mcPrintErrorCode = String(raw.mc_print_error_code ?? '0')
  const file =
    (raw.subtask_name as string) ||
    (raw.gcode_file ? basename(String(raw.gcode_file)) : '') ||
    (raw.file ? basename(String(raw.file)) : '')

  return {
    deviceId,
    state: STATE_MAP[gcodeState] ?? 'idle',
    gcodeState,
    progress: Number(raw.mc_percent ?? raw.percent ?? 0),
    file,
    taskId: String(raw.task_id ?? ''),
    remainingMin: Number(raw.mc_remaining_time ?? raw.remain_time ?? 0),
    printError,
    mcPrintErrorCode,
    failReason: String(raw.fail_reason ?? '0'),
    hms,
    errorDetails: buildErrorDetails(hms, printError, mcPrintErrorCode),
    eventTime: new Date().toISOString(),
  }
}
```

`src/index.ts`:
```ts
export * from './types'
export * from './normalize-bambu'
```

- [ ] **Step 6: Run test — PASS**, lalu `pnpm turbo test` tetap hijau.

- [ ] **Step 7: Commit**
```bash
git add pnpm-lock.yaml packages/printer-monitor-core
git commit -m "feat(printer-monitor): core scaffold + types + normalizeBambu (port n8n Normalize Message)"
```

---

### Task 2: State machine `captureEvent`

**Files:**
- Create: `packages/printer-monitor-core/src/capture-event.ts`
- Test: `packages/printer-monitor-core/src/__tests__/capture-event.test.ts`
- Modify: `packages/printer-monitor-core/src/index.ts` (tambah `export * from './capture-event'`)

**Interfaces:**
- Consumes: `NormalizedStatus`, `StoredState`, `PrinterEventKind` (Task 1).
- Produces: `captureEvent(current: NormalizedStatus, prev?: Pick<StoredState,'last_state'|'last_task_id'|'last_progress'>): { event: PrinterEventKind | null; finalState: string }` dan `storedStateFor(event, current): string` (mapping penyimpanan: finished→'finish', error→'error', selain itu `current.state` — port kolom `last_state` node "Update row(s)").

- [ ] **Step 1: Failing test** — `src/__tests__/capture-event.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { captureEvent, storedStateFor } from '../capture-event'
import { normalizeBambu } from '../normalize-bambu'

const mk = (over: Record<string, unknown>) =>
  normalizeBambu('x', { print: { gcode_state: 'IDLE', print_error: 0, mc_print_error_code: '0', fail_reason: '0', ...over } })

describe('captureEvent (port n8n Capture Event)', () => {
  it('idle→running = started (termasuk prev undefined)', () => {
    const cur = mk({ gcode_state: 'RUNNING' })
    expect(captureEvent(cur, undefined).event).toBe('started')
    expect(captureEvent(cur, { last_state: 'idle', last_task_id: '', last_progress: 0 }).event).toBe('started')
  })
  it('running→running = tidak ada event', () => {
    expect(captureEvent(mk({ gcode_state: 'RUNNING' }),
      { last_state: 'running', last_task_id: '', last_progress: 10 }).event).toBeNull()
  })
  it('any→error = error (hanya via FAILED, bukan print_error!=0)', () => {
    expect(captureEvent(mk({ gcode_state: 'FAILED' }),
      { last_state: 'running', last_task_id: '', last_progress: 50 }).event).toBe('error')
    expect(captureEvent(mk({ gcode_state: 'RUNNING', print_error: 123 }),
      { last_state: 'running', last_task_id: '', last_progress: 50 }).event).toBeNull()
  })
  it('running→idle bersih & progress>=99 = finished, finalState=finished', () => {
    const r = captureEvent(mk({ gcode_state: 'IDLE', mc_percent: 100 }),
      { last_state: 'running', last_task_id: 't', last_progress: 98 })
    expect(r.event).toBe('finished'); expect(r.finalState).toBe('finished')
  })
  it('running→idle dgn print_error != 0 = BUKAN finished', () => {
    expect(captureEvent(mk({ gcode_state: 'IDLE', mc_percent: 100, print_error: 5 }),
      { last_state: 'running', last_task_id: 't', last_progress: 98 }).event).toBeNull()
  })
  it('finished→idle = tidak ada event', () => {
    expect(captureEvent(mk({ gcode_state: 'IDLE' }),
      { last_state: 'finished', last_task_id: 't', last_progress: 100 }).event).toBeNull()
  })
})

describe('storedStateFor (port kolom last_state "Update row(s)")', () => {
  it('finished→finish, error→error, else state normalized', () => {
    const cur = mk({ gcode_state: 'RUNNING' })
    expect(storedStateFor('finished', cur)).toBe('finish')
    expect(storedStateFor('error', cur)).toBe('error')
    expect(storedStateFor(null, cur)).toBe('running')
  })
})
```

- [ ] **Step 2: Run — FAIL** (`Cannot find module '../capture-event'`).

- [ ] **Step 3: Implement `src/capture-event.ts`**:
```ts
import type { NormalizedStatus, PrinterEventKind, StoredState } from './types'

export interface CaptureResult { event: PrinterEventKind | null; finalState: string }

type Prev = Pick<StoredState, 'last_state' | 'last_task_id' | 'last_progress'>

export function captureEvent(current: NormalizedStatus, prev?: Prev): CaptureResult {
  const prevState = prev?.last_state ?? 'idle'
  let event: PrinterEventKind | null = null

  if (prevState !== 'running' && current.state === 'running') event = 'started'
  else if (prevState !== 'error' && current.state === 'error') event = 'error'
  else if (
    prevState === 'running' && current.state === 'idle' &&
    current.printError === 0 && current.mcPrintErrorCode === '0' && current.failReason === '0' &&
    (current.progress >= 99 || current.remainingMin === 0)
  ) event = 'finished'
  else if (prevState === 'finished' && current.state === 'idle') event = null

  return { event, finalState: event === 'finished' ? 'finished' : current.state }
}

export function storedStateFor(event: PrinterEventKind | null, current: NormalizedStatus): string {
  if (event === 'finished') return 'finish'
  if (event === 'error') return 'error'
  return current.state
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(printer-monitor): captureEvent state machine (port n8n Capture Event)"`

---

### Task 3: `normalizeMoonraker`

**Files:**
- Create: `packages/printer-monitor-core/src/normalize-moonraker.ts`
- Test: `packages/printer-monitor-core/src/__tests__/normalize-moonraker.test.ts`
- Modify: `src/index.ts` (export)

**Interfaces:**
- Consumes: `NormalizedStatus` (Task 1).
- Produces: `normalizeMoonraker(deviceId: string, body: unknown): NormalizedStatus` — state **lowercase** (standarisasi spec §10; n8n lama uppercase).

- [ ] **Step 1: Failing test**:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeMoonraker } from '../normalize-moonraker'

const body = (ps: Record<string, unknown>, progress = 0.4) => ({
  result: { status: { print_stats: ps, virtual_sdcard: { progress }, display_status: { progress } } },
})

describe('normalizeMoonraker (port ganymede Parse Status, casing distandarkan lowercase)', () => {
  it('printing → running + remaining dari elapsed/progress', () => {
    const s = normalizeMoonraker('ganymede',
      body({ state: 'printing', print_duration: 1200, filename: 'benchy.gcode' }, 0.4))
    expect(s).toMatchObject({
      deviceId: 'ganymede', state: 'running', progress: 40,
      remainingMin: 30, file: 'benchy.gcode', errorDetails: '', gcodeState: 'PRINTING',
    })
  })
  it('stateMap: standby→idle, complete→finish, cancelled→idle, paused→pause, error→error, unknown→idle', () => {
    const st = (x: string) => normalizeMoonraker('g', body({ state: x })).state
    expect(st('standby')).toBe('idle'); expect(st('complete')).toBe('finish')
    expect(st('cancelled')).toBe('idle'); expect(st('paused')).toBe('pause')
    expect(st('error')).toBe('error'); expect(st('zzz')).toBe('idle')
  })
  it('remaining 0 saat progress 0 atau 100', () => {
    expect(normalizeMoonraker('g', body({ state: 'printing', print_duration: 100 }, 0)).remainingMin).toBe(0)
    expect(normalizeMoonraker('g', body({ state: 'complete', print_duration: 100 }, 1)).remainingMin).toBe(0)
  })
})
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement `src/normalize-moonraker.ts`**:
```ts
import type { NormalizedStatus, PrinterState } from './types'

const STATE_MAP: Record<string, PrinterState> = {
  printing: 'running', standby: 'idle', complete: 'finish',
  error: 'error', cancelled: 'idle', paused: 'pause',
}

export function normalizeMoonraker(deviceId: string, body: unknown): NormalizedStatus {
  const status = ((body as any)?.result?.status ?? {}) as Record<string, any>
  const ps = status.print_stats ?? {}
  const vs = status.virtual_sdcard ?? {}
  const ds = status.display_status ?? {}

  const rawState = String(ps.state ?? 'standby').toLowerCase()
  const state = STATE_MAP[rawState] ?? 'idle'
  const progress = Math.round((vs.progress ?? ds.progress ?? 0) * 100)
  const elapsed = Number(ps.print_duration ?? 0)
  const remainingMin = progress > 0 && progress < 100
    ? Math.round((elapsed / (progress / 100) - elapsed) / 60) : 0

  return {
    deviceId, state, gcodeState: rawState.toUpperCase(),
    progress, file: String(ps.filename ?? ''), taskId: '',
    remainingMin, printError: 0, mcPrintErrorCode: '0', failReason: '0',
    hms: [], errorDetails: '', eventTime: new Date().toISOString(),
  }
}
```

- [ ] **Step 4: Run — PASS. Step 5: Commit** — `feat(printer-monitor): normalizeMoonraker (port ganymede Parse Status)`

---

### Task 4: `HmsLookup` (vendored, zero-internet)

**Files:**
- Create: `packages/printer-monitor-core/src/hms.ts`, `src/hms-codes.json` (vendored)
- Test: `src/__tests__/hms.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `HmsEntry` (Task 1).
- Produces: `class HmsLookup { constructor(table?: Record<string,string>); translate(hms: HmsEntry[]): string[] }` + `hmsKeyFor(e: HmsEntry): string`.

**Konteks penting:** codes.json (suchmememanyskill/bambu-error-codes) berkey `XXXX_YYYY` = split hex dari **attr** saja (mis. attr `0x12018007` → `1201_8007`). Derivasi n8n lama (hex16 concat attr+code) kemungkinan tak pernah match — kita perbaiki. Coverage parsial (268 entri) → fallback string mentah. Lookup hanya dipakai notifikasi; payload `error_msg` tetap kode mentah (paritas).

- [ ] **Step 1: Vendor codes.json**
```bash
curl -s https://raw.githubusercontent.com/suchmememanyskill/bambu-error-codes/main/codes.json \
  -o packages/printer-monitor-core/src/hms-codes.json
node -e "const j=require('./packages/printer-monitor-core/src/hms-codes.json');console.log(Object.keys(j).length)"
```
Expected: `268` (atau lebih jika upstream nambah).

- [ ] **Step 2: Failing test**:
```ts
import { describe, it, expect } from 'vitest'
import { HmsLookup, hmsKeyFor } from '../hms'

describe('HmsLookup', () => {
  it('hmsKeyFor split attr jadi XXXX_YYYY lowercase', () => {
    expect(hmsKeyFor({ attr: 0x12018007, code: 1 })).toBe('1201_8007')
  })
  it('translate pakai deskripsi kalau key ada (tabel injeksi)', () => {
    const l = new HmsLookup({ '1201_8007': 'Extruder clogged.' })
    expect(l.translate([{ attr: 0x12018007, code: 66 }]))
      .toEqual(['[1201_8007] Extruder clogged.'])
  })
  it('fallback string mentah kalau tidak ada', () => {
    const l = new HmsLookup({})
    expect(l.translate([{ attr: 0x0c000100, code: 65540 }]))
      .toEqual(['hms=code=65540, attr=201326848'])
  })
  it('tabel default (vendored) punya entri & bisa translate 1201_8007', () => {
    const l = new HmsLookup()
    expect(l.translate([{ attr: 0x12018007, code: 0 }])[0]).toMatch(/^\[1201_8007\] /)
  })
})
```

- [ ] **Step 3: Run — FAIL. Step 4: Implement `src/hms.ts`**:
```ts
import { readFileSync } from 'node:fs'
import type { HmsEntry } from './types'

const h4 = (n: number) => (n >>> 0).toString(16).padStart(4, '0')

export function hmsKeyFor(e: HmsEntry): string {
  const attr = e.attr >>> 0
  return `${h4(attr >>> 16)}_${h4(attr & 0xffff)}`
}

let bundled: Record<string, string> | null = null
function loadBundled(): Record<string, string> {
  if (!bundled) {
    bundled = JSON.parse(readFileSync(new URL('./hms-codes.json', import.meta.url), 'utf8'))
  }
  return bundled!
}

export class HmsLookup {
  private table: Record<string, string>
  constructor(table?: Record<string, string>) {
    this.table = table ?? loadBundled()
  }
  translate(hms: HmsEntry[]): string[] {
    return hms.map((e) => {
      const key = hmsKeyFor(e)
      const desc = this.table[key] ?? this.table[key.toUpperCase()]
      return desc ? `[${key}] ${desc}` : `hms=code=${e.code}, attr=${e.attr}`
    })
  }
}
```

- [ ] **Step 5: Run — PASS. Step 6: Commit** — `feat(printer-monitor): HMS lookup vendored (zero-internet) + key derivation fix`

---

### Task 5: `StateStore` + `buildPrintersPayload`

**Files:**
- Create: `src/state-store.ts`, `src/payload.ts`
- Test: `src/__tests__/payload.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `NormalizedStatus`, `StoredState`, `DeviceConfig`, `PrintersPayload`, `storedStateFor` (Task 1–2).
- Produces:
  - `class StateStore { get(id): StoredState|undefined; upsertFromStatus(device: DeviceConfig, s: NormalizedStatus, event: PrinterEventKind|null): StoredState; all(): Map<string,StoredState> }`
  - `buildPrintersPayload(devices: DeviceConfig[], store: StateStore, nowMs: number, staleAfterMs?: number): PrintersPayload` (default staleAfterMs = 600_000).

- [ ] **Step 1: Failing test** (termasuk paritas terhadap payload retained nyata):
```ts
import { describe, it, expect } from 'vitest'
import { StateStore } from '../state-store'
import { buildPrintersPayload } from '../payload'
import { normalizeBambu } from '../normalize-bambu'
import type { DeviceConfig } from '../types'

const mars: DeviceConfig = { id: 'mars', name: 'Mars', type: 'P1P', connector: 'bambu', ip: '10.0.0.9', serial: '01S00A2C0502433', accessCode: 'x' }
const gany: DeviceConfig = { id: 'ganymede', name: 'Ganymede', type: 'U1', connector: 'moonraker', ip: '192.168.88.40' }

const T0 = Date.parse('2026-07-16T00:50:00.000Z')

describe('StateStore + buildPrintersPayload', () => {
  it('device tanpa data → OFFLINE, field default', () => {
    const p = buildPrintersPayload([mars], new StateStore(), T0)
    expect(p.payload).toEqual([{
      name: 'Mars', type: 'P1P', state: 'OFFLINE', progress: 0,
      remaining_min: 0, filename: '', error_msg: '', last_seen: null,
    }])
  })

  it('fresh → state tersimpan; stale >10 menit → OFFLINE tapi field lain dipertahankan', () => {
    const store = new StateStore()
    const s = normalizeBambu('mars', { print: {
      gcode_state: 'FINISH', mc_percent: 100, mc_remaining_time: 0,
      subtask_name: 'Nike_Crocs_1.3 (flame)_5 color.gcode.3mf',
      print_error: 0, mc_print_error_code: '0', fail_reason: '0', hms: [] } })
    store.upsertFromStatus(mars, { ...s, eventTime: new Date(T0).toISOString() }, null)

    const fresh = buildPrintersPayload([mars], store, T0 + 5 * 60_000)
    expect(fresh.payload[0]).toMatchObject({
      name: 'Mars', type: 'P1P', state: 'finish', progress: 100, remaining_min: 0,
      filename: 'Nike_Crocs_1.3 (flame)_5 color.gcode.3mf',
      error_msg: 'print_error=0 | mc_print_error_code=0',
      last_seen: new Date(T0).toISOString(),
    })

    const stale = buildPrintersPayload([mars], store, T0 + 11 * 60_000)
    expect(stale.payload[0].state).toBe('OFFLINE')
    expect(stale.payload[0].progress).toBe(100) // data terakhir dipertahankan (paritas n8n)
  })

  it('urutan payload = urutan devices config; payload adalah array (bukan string)', () => {
    const p = buildPrintersPayload([gany, mars], new StateStore(), T0)
    expect(p.payload.map((r) => r.name)).toEqual(['Ganymede', 'Mars'])
    expect(Array.isArray(p.payload)).toBe(true)
  })

  it('upsert dgn event finished menyimpan last_state=finish (via storedStateFor)', () => {
    const store = new StateStore()
    const cur = normalizeBambu('mars', { print: { gcode_state: 'IDLE', mc_percent: 100 } })
    store.upsertFromStatus(mars, cur, 'finished')
    expect(store.get('mars')!.last_state).toBe('finish')
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

`src/state-store.ts`:
```ts
import type { DeviceConfig, NormalizedStatus, PrinterEventKind, StoredState } from './types'
import { storedStateFor } from './capture-event'

export class StateStore {
  private m = new Map<string, StoredState>()
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
      last_seen_at: s.eventTime,
    }
    this.m.set(device.id, row)
    return row
  }
}
```

`src/payload.ts`:
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
        name: d.name, type: d.type,
        state: isStale ? 'OFFLINE' : (r!.last_state || 'idle'),
        progress: r?.last_progress ?? 0,
        remaining_min: r?.last_remaining_min ?? 0,
        filename: r?.last_filename ?? '',
        error_msg: r?.last_error_code ?? '',
        last_seen: r?.last_seen_at ?? null,
      }
    }),
  }
}
```

- [ ] **Step 4: Run — PASS. Step 5: Commit** — `feat(printer-monitor): StateStore + buildPrintersPayload (staleness→OFFLINE, kontrak CYD)`

---

### Task 6: `Engine` (orkestrasi)

**Files:**
- Create: `src/engine.ts`
- Test: `src/__tests__/engine.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: semua Task 1–5.
- Produces (dipakai Task 7–12):
```ts
export interface Connector { readonly deviceId: string; start(onStatus: (s: NormalizedStatus) => void): void | Promise<void>; stop(): void | Promise<void> }
export interface Reporter { publishStatus(p: PrintersPayload): void | Promise<void>; emitEvent(e: PrinterEvent): void | Promise<void> }
export interface Notifier { notify(e: PrinterEvent, ctx: { printerName: string; hmsText: string[] }): void | Promise<void> }
export interface EngineOpts {
  devices: DeviceConfig[]; connectors: Connector[]; reporters: Reporter[];
  notifiers?: Notifier[]; hms?: HmsLookup;
  staleAfterMs?: number; republishIntervalMs?: number; now?: () => number
}
export class Engine {
  constructor(opts: EngineOpts)
  start(): Promise<void>       // start connectors + interval republish (default 60_000ms)
  stop(): Promise<void>
  handleStatus(s: NormalizedStatus): Promise<void>  // public utk test
  snapshot(): PrintersPayload
}
```

- [ ] **Step 1: Failing test** (fake connector/reporter/notifier + clock injeksi):
```ts
import { describe, it, expect, vi } from 'vitest'
import { Engine, type Reporter, type Notifier } from '../engine'
import { normalizeBambu } from '../normalize-bambu'
import type { DeviceConfig, PrintersPayload, PrinterEvent } from '../types'

const mars: DeviceConfig = { id: 'mars', name: 'Mars', type: 'P1P', connector: 'bambu', ip: 'x', serial: 's', accessCode: 'a' }
const mk = (g: string, extra: Record<string, unknown> = {}) =>
  normalizeBambu('mars', { print: { gcode_state: g, print_error: 0, mc_print_error_code: '0', fail_reason: '0', ...extra } })

function makeEngine() {
  const published: PrintersPayload[] = []
  const events: PrinterEvent[] = []
  const notified: string[] = []
  const reporter: Reporter = { publishStatus: (p) => void published.push(p), emitEvent: (e) => void events.push(e) }
  const notifier: Notifier = { notify: (e) => void notified.push(e.kind) }
  const engine = new Engine({
    devices: [mars], connectors: [], reporters: [reporter], notifiers: [notifier],
    now: () => Date.parse('2026-07-16T01:00:00Z'),
  })
  return { engine, published, events, notified }
}

describe('Engine', () => {
  it('status masuk → publish payload; transisi idle→running → event started + notifier', async () => {
    const { engine, published, events, notified } = makeEngine()
    await engine.handleStatus(mk('RUNNING'))
    expect(published).toHaveLength(1)
    expect(published[0].payload[0]).toMatchObject({ name: 'Mars', state: 'running' })
    expect(events.map((e) => e.kind)).toEqual(['started'])
    expect(notified).toEqual(['started'])
  })

  it('status tanpa gcode_state di-skip (gate If n8n)', async () => {
    const { engine, published } = makeEngine()
    await engine.handleStatus(normalizeBambu('mars', { print: { mc_percent: 3 } }))
    expect(published).toHaveLength(0)
  })

  it('running→idle progress 100 → finished; payload menampilkan finish', async () => {
    const { engine, events, published } = makeEngine()
    await engine.handleStatus(mk('RUNNING', { mc_percent: 50 }))
    await engine.handleStatus(mk('IDLE', { mc_percent: 100 }))
    expect(events.map((e) => e.kind)).toEqual(['started', 'finished'])
    expect(published.at(-1)!.payload[0].state).toBe('finish')
  })

  it('start() menjadwalkan republish periodik (staleness bisa berubah tanpa message)', async () => {
    vi.useFakeTimers()
    const { engine, published } = makeEngine()
    await engine.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(published.length).toBeGreaterThanOrEqual(1)
    await engine.stop()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement `src/engine.ts`**:
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
  private store = new StateStore()
  private timer: ReturnType<typeof setInterval> | null = null
  private deviceById: Map<string, DeviceConfig>
  constructor(private opts: EngineOpts) {
    this.deviceById = new Map(opts.devices.map((d) => [d.id, d]))
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
      const hmsText = (this.opts.hms ?? new HmsLookup()).translate(s.hms)
      for (const r of this.opts.reporters) await r.emitEvent(e)
      for (const n of this.opts.notifiers ?? []) {
        try { await n.notify(e, { printerName: device.name, hmsText }) }
        catch (err) { console.error('[notifier]', err) }
      }
    }
    await this.publish()
  }

  private async publish(): Promise<void> {
    const p = this.snapshot()
    for (const r of this.opts.reporters) await r.publishStatus(p)
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

- [ ] **Step 4: Run — PASS (semua test core). Step 5: Commit** — `feat(printer-monitor): Engine orkestrasi (pipeline + republish periodik)`

---

### Task 7: `MqttReporter`

**Files:**
- Create: `src/reporters/mqtt.ts`
- Test: `src/__tests__/mqtt-reporter.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `Reporter`, `PrintersPayload`, `PrinterEvent` (Task 6).
- Produces: `class MqttReporter implements Reporter { constructor(opts: { url: string; statusTopic?: string; eventsTopic?: string }); connect(): Promise<void>; close(): Promise<void> }` — default topics `3dpb/printers-v2` & `3dpb/printer-events`; status **retained**, event non-retained.

- [ ] **Step 1: Failing test dgn broker aedes in-memory**:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:net'
import Aedes from 'aedes'
import mqtt from 'mqtt'
import { MqttReporter } from '../reporters/mqtt'

let server: Server, port: number, aedes: InstanceType<typeof Aedes>

beforeAll(async () => {
  aedes = new Aedes()
  server = createServer(aedes.handle)
  await new Promise<void>((res) => server.listen(0, () => res()))
  port = (server.address() as { port: number }).port
})
afterAll(async () => { aedes.close(); server.close() })

describe('MqttReporter', () => {
  it('publishStatus retained ke statusTopic; emitEvent non-retained ke eventsTopic', async () => {
    const url = `mqtt://127.0.0.1:${port}`
    const rep = new MqttReporter({ url })
    await rep.connect()
    await rep.publishStatus({ payload: [] })
    await rep.emitEvent({ deviceId: 'mars', kind: 'started', prevState: 'idle', status: {} as never })
    await rep.close()

    // retained harus terkirim ke subscriber baru
    const sub = mqtt.connect(url)
    const got = await new Promise<{ topic: string; retain: boolean; body: string }>((res) => {
      sub.subscribe('3dpb/printers-v2')
      sub.on('message', (topic, msg, pkt) => res({ topic, retain: pkt.retain, body: msg.toString() }))
    })
    expect(got.topic).toBe('3dpb/printers-v2')
    expect(got.retain).toBe(true)
    expect(JSON.parse(got.body)).toEqual({ payload: [] })
    sub.end()
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement `src/reporters/mqtt.ts`**:
```ts
import mqtt, { type MqttClient } from 'mqtt'
import type { Reporter } from '../engine'
import type { PrinterEvent, PrintersPayload } from '../types'

export interface MqttReporterOpts { url: string; statusTopic?: string; eventsTopic?: string }

export class MqttReporter implements Reporter {
  private client: MqttClient | null = null
  private statusTopic: string
  private eventsTopic: string
  constructor(private opts: MqttReporterOpts) {
    this.statusTopic = opts.statusTopic ?? '3dpb/printers-v2'
    this.eventsTopic = opts.eventsTopic ?? '3dpb/printer-events'
  }
  connect(): Promise<void> {
    return new Promise((res, rej) => {
      this.client = mqtt.connect(this.opts.url, { reconnectPeriod: 5000 })
      this.client.once('connect', () => res())
      this.client.once('error', rej)
    })
  }
  async publishStatus(p: PrintersPayload): Promise<void> {
    await this.client?.publishAsync(this.statusTopic, JSON.stringify(p), { retain: true })
  }
  async emitEvent(e: PrinterEvent): Promise<void> {
    await this.client?.publishAsync(this.eventsTopic, JSON.stringify(e))
  }
  async close(): Promise<void> { await this.client?.endAsync() }
}
```

- [ ] **Step 4: Run — PASS. Step 5: Commit** — `feat(printer-monitor): MqttReporter (retained status + events)`

---

### Task 8: `BambuMqttConnector` (+ pushall keepalive)

**Files:**
- Create: `src/connectors/bambu-mqtt.ts`
- Test: `src/__tests__/bambu-connector.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `Connector` (Task 6), `normalizeBambu` (Task 1), `DeviceConfig`.
- Produces: `class BambuMqttConnector implements Connector { constructor(device: DeviceConfig, opts?: { pushallIntervalMs?: number; urlOverride?: string }) }`. Default URL `mqtts://<ip>:8883` user `bblp` pass `accessCode` `rejectUnauthorized:false`; `urlOverride` untuk test (plain mqtt). Subscribe `device/<serial>/report`; pushall on-connect + tiap interval (default 300_000ms) ke `device/<serial>/request` payload `{"pushing":{"sequence_id":"0","command":"pushall","version":1,"push_target":1},"user_id":"3dpb"}`.

- [ ] **Step 1: Failing test** (aedes; verifikasi subscribe, pushall on-connect, emit status ternormalisasi, skip JSON invalid):
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:net'
import Aedes from 'aedes'
import { BambuMqttConnector } from '../connectors/bambu-mqtt'
import type { DeviceConfig, NormalizedStatus } from '../types'

let server: Server, port: number, aedes: InstanceType<typeof Aedes>
beforeAll(async () => {
  aedes = new Aedes()
  server = createServer(aedes.handle)
  await new Promise<void>((res) => server.listen(0, () => res()))
  port = (server.address() as { port: number }).port
})
afterAll(async () => { aedes.close(); server.close() })

const mars: DeviceConfig = { id: 'mars', name: 'Mars', type: 'P1P', connector: 'bambu', ip: '127.0.0.1', serial: 'SER1', accessCode: 'code' }

describe('BambuMqttConnector', () => {
  it('subscribe report, kirim pushall on-connect, emit NormalizedStatus', async () => {
    const pushalls: string[] = []
    aedes.subscribe('device/SER1/request', (pkt, cb) => { pushalls.push(pkt.payload.toString()); cb() }, () => {})

    const got: NormalizedStatus[] = []
    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start((s) => void got.push(s))

    aedes.publish({ cmd: 'publish', topic: 'device/SER1/report', qos: 0, dup: false, retain: false,
      payload: Buffer.from(JSON.stringify({ print: { gcode_state: 'RUNNING', mc_percent: 7 } })) }, () => {})
    await new Promise((r) => setTimeout(r, 200))
    await c.stop()

    expect(pushalls.length).toBeGreaterThanOrEqual(1)
    expect(JSON.parse(pushalls[0]).pushing.command).toBe('pushall')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ deviceId: 'mars', state: 'running', progress: 7 })
  })

  it('payload non-JSON di-skip tanpa crash', async () => {
    const got: NormalizedStatus[] = []
    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start((s) => void got.push(s))
    aedes.publish({ cmd: 'publish', topic: 'device/SER1/report', qos: 0, dup: false, retain: false,
      payload: Buffer.from('bukan json') }, () => {})
    await new Promise((r) => setTimeout(r, 200))
    await c.stop()
    expect(got).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement `src/connectors/bambu-mqtt.ts`**:
```ts
import mqtt, { type MqttClient } from 'mqtt'
import type { Connector } from '../engine'
import type { DeviceConfig, NormalizedStatus } from '../types'
import { normalizeBambu } from '../normalize-bambu'

const PUSHALL = JSON.stringify({
  pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 },
  user_id: '3dpb',
})

export interface BambuConnectorOpts { pushallIntervalMs?: number; urlOverride?: string }

export class BambuMqttConnector implements Connector {
  readonly deviceId: string
  private client: MqttClient | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(private device: DeviceConfig, private opts: BambuConnectorOpts = {}) {
    if (!device.serial || !device.accessCode) throw new Error(`bambu device ${device.id} butuh serial+accessCode`)
    this.deviceId = device.id
  }

  start(onStatus: (s: NormalizedStatus) => void): Promise<void> {
    const url = this.opts.urlOverride ?? `mqtts://${this.device.ip}:8883`
    return new Promise((res, rej) => {
      this.client = mqtt.connect(url, {
        username: 'bblp', password: this.device.accessCode,
        rejectUnauthorized: false, reconnectPeriod: 5000,
      })
      const reportTopic = `device/${this.device.serial}/report`
      const requestTopic = `device/${this.device.serial}/request`
      const pushall = () => this.client?.publish(requestTopic, PUSHALL)

      this.client.on('connect', () => {
        this.client!.subscribe(reportTopic)
        pushall()
      })
      this.client.once('connect', () => {
        this.timer = setInterval(pushall, this.opts.pushallIntervalMs ?? 300_000)
        res()
      })
      this.client.once('error', (e) => rej(e))
      this.client.on('message', (_t, msg) => {
        try { onStatus(normalizeBambu(this.device.id, JSON.parse(msg.toString()))) }
        catch { /* frame non-JSON: abaikan */ }
      })
    })
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.client?.endAsync()
    this.client = null
  }
}
```

- [ ] **Step 4: Run — PASS. Step 5: Commit** — `feat(printer-monitor): BambuMqttConnector (LAN 8883 + pushall keepalive)`

---

### Task 9: `MoonrakerConnector`

**Files:**
- Create: `src/connectors/moonraker.ts`
- Test: `src/__tests__/moonraker-connector.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `Connector`, `normalizeMoonraker`, `DeviceConfig`.
- Produces: `class MoonrakerConnector implements Connector { constructor(device: DeviceConfig, opts?: { pollIntervalMs?: number; fetchImpl?: typeof fetch }) }` — GET `http://<ip>/printer/objects/query?print_stats&virtual_sdcard&display_status` tiap 60_000ms default; fetch gagal → skip tick (staleness yang menandai OFFLINE).

- [ ] **Step 1: Failing test** (fake timers + fetch stub):
```ts
import { describe, it, expect, vi } from 'vitest'
import { MoonrakerConnector } from '../connectors/moonraker'
import type { DeviceConfig, NormalizedStatus } from '../types'

const gany: DeviceConfig = { id: 'ganymede', name: 'Ganymede', type: 'U1', connector: 'moonraker', ip: '192.168.88.40' }
const okBody = { result: { status: { print_stats: { state: 'printing', print_duration: 600, filename: 'a.gcode' }, virtual_sdcard: { progress: 0.5 }, display_status: { progress: 0.5 } } } }

describe('MoonrakerConnector', () => {
  it('poll on-start + tiap interval; URL benar; emit NormalizedStatus', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(okBody)))
    const got: NormalizedStatus[] = []
    const c = new MoonrakerConnector(gany, { pollIntervalMs: 60_000, fetchImpl: fetchImpl as unknown as typeof fetch })
    await c.start((s) => void got.push(s))
    await vi.advanceTimersByTimeAsync(60_000)
    await c.stop()
    vi.useRealTimers()

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://192.168.88.40/printer/objects/query?print_stats&virtual_sdcard&display_status')
    expect(got.length).toBe(2) // on-start + 1 tick
    expect(got[0]).toMatchObject({ deviceId: 'ganymede', state: 'running', progress: 50 })
  })

  it('fetch gagal → tidak emit, tidak crash', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('down') })
    const got: NormalizedStatus[] = []
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    await c.start((s) => void got.push(s))
    await c.stop()
    expect(got).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement `src/connectors/moonraker.ts`**:
```ts
import type { Connector } from '../engine'
import type { DeviceConfig, NormalizedStatus } from '../types'
import { normalizeMoonraker } from '../normalize-moonraker'

export interface MoonrakerConnectorOpts { pollIntervalMs?: number; fetchImpl?: typeof fetch }

export class MoonrakerConnector implements Connector {
  readonly deviceId: string
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(private device: DeviceConfig, private opts: MoonrakerConnectorOpts = {}) {
    this.deviceId = device.id
  }
  async start(onStatus: (s: NormalizedStatus) => void): Promise<void> {
    const f = this.opts.fetchImpl ?? fetch
    const url = `http://${this.device.ip}/printer/objects/query?print_stats&virtual_sdcard&display_status`
    const tick = async () => {
      try {
        const res = await f(url)
        onStatus(normalizeMoonraker(this.device.id, await res.json()))
      } catch { /* printer/moonraker mati: staleness yang menandai OFFLINE */ }
    }
    await tick()
    this.timer = setInterval(() => void tick(), this.opts.pollIntervalMs ?? 60_000)
  }
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
```

- [ ] **Step 4: Run — PASS. Step 5: Commit** — `feat(printer-monitor): MoonrakerConnector (HTTP poll Klipper/Snapmaker)`

---

### Task 10: Notifiers Telegram + Pushover (opsional, off default)

**Files:**
- Create: `src/notifiers/telegram.ts`, `src/notifiers/pushover.ts`
- Test: `src/__tests__/notifiers.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `Notifier`, `PrinterEvent` (Task 6).
- Produces:
  - `class TelegramNotifier implements Notifier { constructor(opts: { botToken: string; chatIds: string[]; fetchImpl?: typeof fetch }) }` — kirim MarkdownV2 (template port dari n8n: 🟢 PRINT STARTED / 🔴 PRINT ERROR dgn HMS terjemah / ✅ Print finished + jam WIB).
  - `class PushoverNotifier implements Notifier { constructor(opts: { token: string; user: string; fetchImpl?: typeof fetch }) }` — HANYA event `error` (paritas n8n).
  - `escapeMdV2(s: string): string` (util, dites).

- [ ] **Step 1: Failing test**:
```ts
import { describe, it, expect, vi } from 'vitest'
import { TelegramNotifier, escapeMdV2 } from '../notifiers/telegram'
import { PushoverNotifier } from '../notifiers/pushover'
import { normalizeBambu } from '../normalize-bambu'
import type { PrinterEvent } from '../types'

const ev = (kind: PrinterEvent['kind']): PrinterEvent => ({
  deviceId: 'mars', kind, prevState: 'running',
  status: normalizeBambu('mars', { print: { gcode_state: 'FAILED', subtask_name: 'file_a.3mf', task_id: 't1', mc_percent: 40 } }),
})

describe('escapeMdV2', () => {
  it('escape karakter reserved', () => {
    expect(escapeMdV2('a_b*c[d')).toBe('a\\_b\\*c\\[d')
  })
})

describe('TelegramNotifier', () => {
  it('POST sendMessage per chatId dgn template sesuai event', async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = []
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      return new Response('{}')
    })
    const n = new TelegramNotifier({ botToken: 'TOK', chatIds: ['1', '2'], fetchImpl: fetchImpl as unknown as typeof fetch })
    await n.notify(ev('error'), { printerName: 'Mars', hmsText: ['[1201_8007] Extruder clogged.'] })
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toBe('https://api.telegram.org/botTOK/sendMessage')
    expect(String(calls[0].body.text)).toContain('PRINT ERROR')
    expect(String(calls[0].body.text)).toContain('Extruder clogged')
    expect(calls[0].body.parse_mode).toBe('MarkdownV2')
  })
})

describe('PushoverNotifier', () => {
  it('kirim hanya utk error', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'))
    const n = new PushoverNotifier({ token: 't', user: 'u', fetchImpl: fetchImpl as unknown as typeof fetch })
    await n.notify(ev('started'), { printerName: 'Mars', hmsText: [] })
    expect(fetchImpl).not.toHaveBeenCalled()
    await n.notify(ev('error'), { printerName: 'Mars', hmsText: [] })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.pushover.net/1/messages.json', expect.anything())
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

`src/notifiers/telegram.ts`:
```ts
import type { Notifier } from '../engine'
import type { PrinterEvent } from '../types'

export const escapeMdV2 = (s: string) => s.replace(/([_*[\]()~`>#+=|{}.!-])/g, '\\$1')

export interface TelegramOpts { botToken: string; chatIds: string[]; fetchImpl?: typeof fetch }

function template(e: PrinterEvent, printerName: string, hmsText: string[]): string {
  const s = e.status
  const esc = escapeMdV2
  if (e.kind === 'started') {
    return `🟢 *PRINT STARTED*\n\n🖨 *Printer* : ${esc(printerName)}\n📄 *File*    : \`${esc(s.file || '-')}\`\n🆔 *Task*    : ${esc(s.taskId || '-')}\n\n📊 *Progress* : ${esc(String(s.progress))}%`
  }
  if (e.kind === 'error') {
    const details = hmsText.length ? hmsText.join('\n') : s.errorDetails
    return `🔴 *PRINT ERROR*\n\n🖨 *Printer* : ${esc(printerName)}\n📄 *File*    : \`${esc(s.file || '-')}\`\n🆔 *Task*    : ${esc(s.taskId || '-')}\n\n⚠️ *Details* : ${esc(details)}`
  }
  const wib = new Date(Date.parse(s.eventTime) + 7 * 3600_000).toISOString().slice(11, 16)
  return `✅ Print finished\nPrinter: ${esc(printerName)}\nFile: ${esc(s.file || '-')}\nTask ID: ${esc(s.taskId || '-')}\nFinished at: ${wib} WIB`
}

export class TelegramNotifier implements Notifier {
  constructor(private opts: TelegramOpts) {}
  async notify(e: PrinterEvent, ctx: { printerName: string; hmsText: string[] }): Promise<void> {
    const f = this.opts.fetchImpl ?? fetch
    const text = template(e, ctx.printerName, ctx.hmsText)
    for (const chatId of this.opts.chatIds) {
      await f(`https://api.telegram.org/bot${this.opts.botToken}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
      })
    }
  }
}
```

`src/notifiers/pushover.ts`:
```ts
import type { Notifier } from '../engine'
import type { PrinterEvent } from '../types'

export interface PushoverOpts { token: string; user: string; fetchImpl?: typeof fetch }

export class PushoverNotifier implements Notifier {
  constructor(private opts: PushoverOpts) {}
  async notify(e: PrinterEvent, ctx: { printerName: string; hmsText: string[] }): Promise<void> {
    if (e.kind !== 'error') return
    const f = this.opts.fetchImpl ?? fetch
    const message = `${ctx.printerName}: PRINT ERROR — ${ctx.hmsText.join(' | ') || e.status.errorDetails}`
    await f('https://api.pushover.net/1/messages.json', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: this.opts.token, user: this.opts.user, message }),
    })
  }
}
```

- [ ] **Step 4: Run — PASS. Step 5: Commit** — `feat(printer-monitor): notifiers Telegram+Pushover (opsional, off default)`

---

### Task 11: Service `services/printer-monitor` — config + daemon

**Files:**
- Modify: `pnpm-workspace.yaml` (tambah `  - services/*` di list `packages:`), `.gitignore` (tambah `services/printer-monitor/config.json`)
- Create: `services/printer-monitor/package.json`, `tsconfig.json`, `src/config.ts`, `src/main.ts`, `config.example.json`
- Test: `services/printer-monitor/src/__tests__/config.test.ts`

**Interfaces:**
- Consumes: seluruh export core (Engine, connectors, MqttReporter, notifiers).
- Produces: `loadConfig(raw: unknown): { config: AppConfig; skipped: { id: string; reason: string }[] }` dan `buildFromConfig(config: AppConfig): { engine: Engine; reporter: MqttReporter }` (dipakai main.ts & test); tipe `AppConfig`.

- [ ] **Step 1: Scaffold**

`pnpm-workspace.yaml` — packages jadi:
```yaml
packages:
  - apps/*
  - packages/*
  - services/*
```

`services/printer-monitor/package.json`:
```json
{
  "name": "@3pb/printer-monitor",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "dev": "tsx watch src/main.ts",
    "status": "tsx src/status.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@3pb/printer-monitor-core": "workspace:*",
    "mqtt": "^5.10.1",
    "tsx": "^4.19.2"
  },
  "devDependencies": { "typescript": "^5", "vitest": "^1.6.1", "@types/node": "^22" }
}
```

`tsconfig.json`: sama dgn core (strict, ESNext, bundler, noEmit, resolveJsonModule, types vitest/globals+node).

`config.example.json` (serial dari spec §2; ip/accessCode **diisi manual** — device belum lengkap akan di-skip dgn warning):
```json
{
  "broker": { "url": "mqtt://192.168.88.113:1883" },
  "topics": { "status": "3dpb/printers-v2", "events": "3dpb/printer-events" },
  "staleAfterMs": 600000,
  "pushallIntervalMs": 300000,
  "moonrakerPollMs": 60000,
  "republishIntervalMs": 60000,
  "notifications": null,
  "devices": [
    { "id": "jupiter", "name": "Jupiter", "type": "X1C", "connector": "bambu", "serial": "00M09D562001206", "ip": "", "accessCode": "" },
    { "id": "moon", "name": "Moon", "type": "P2S", "connector": "bambu", "serial": "22E8BJ612404007", "ip": "", "accessCode": "" },
    { "id": "uranus", "name": "Uranus", "type": "P1S", "connector": "bambu", "serial": "01P00C572300783", "ip": "", "accessCode": "" },
    { "id": "neptune", "name": "Neptune", "type": "P1S", "connector": "bambu", "serial": "01P00C572502172", "ip": "", "accessCode": "" },
    { "id": "saturn", "name": "Saturn", "type": "P1S", "connector": "bambu", "serial": "01P09C4B2000180", "ip": "", "accessCode": "" },
    { "id": "mars", "name": "Mars", "type": "P1P", "connector": "bambu", "serial": "01S00A2C0502433", "ip": "", "accessCode": "" },
    { "id": "mercury", "name": "Mercury", "type": "A1Mini", "connector": "bambu", "serial": "03090A481400312", "ip": "", "accessCode": "" },
    { "id": "venus", "name": "Venus", "type": "A1", "connector": "bambu", "serial": "03919E462800737", "ip": "", "accessCode": "" },
    { "id": "earth", "name": "Earth", "type": "A1", "connector": "bambu", "serial": "03919D562403184", "ip": "", "accessCode": "" },
    { "id": "ganymede", "name": "Ganymede", "type": "U1", "connector": "moonraker", "ip": "192.168.88.40" }
  ]
}
```
CATATAN dalam file runbook: urutan devices = urutan payload n8n saat ini (paritas tampilan CYD). Verifikasi serial Mercury saat mengisi (spec §10).

- [ ] **Step 2: Failing test `src/__tests__/config.test.ts`**:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadConfig } from '../config'

const example = JSON.parse(readFileSync(new URL('../../config.example.json', import.meta.url), 'utf8'))

describe('loadConfig', () => {
  it('config.example.json valid; device bambu tanpa ip/accessCode di-SKIP dgn alasan, moonraker jalan', () => {
    const { config, skipped } = loadConfig(example)
    expect(config.broker.url).toBe('mqtt://192.168.88.113:1883')
    expect(config.devices.map((d) => d.id)).toEqual(['ganymede']) // hanya yg lengkap
    expect(skipped).toHaveLength(9)
    expect(skipped[0]).toMatchObject({ id: 'jupiter', reason: expect.stringContaining('ip') })
  })
  it('device bambu lengkap ikut jalan', () => {
    const raw = { ...example, devices: [{ ...example.devices[5], ip: '10.0.0.9', accessCode: 'x' }] }
    const { config, skipped } = loadConfig(raw)
    expect(config.devices.map((d) => d.id)).toEqual(['mars'])
    expect(skipped).toHaveLength(0)
  })
  it('broker.url wajib', () => {
    expect(() => loadConfig({ devices: [] })).toThrow(/broker\.url/)
  })
})
```

- [ ] **Step 3: Run — FAIL. Step 4: Implement `src/config.ts`**:
```ts
import type { DeviceConfig } from '@3pb/printer-monitor-core'

export interface AppConfig {
  broker: { url: string }
  topics: { status: string; events: string }
  staleAfterMs: number
  pushallIntervalMs: number
  moonrakerPollMs: number
  republishIntervalMs: number
  notifications: null | {
    telegram?: { botToken: string; chatIds: string[] }
    pushover?: { token: string; user: string }
  }
  devices: DeviceConfig[]
}

export function loadConfig(raw: unknown): { config: AppConfig; skipped: { id: string; reason: string }[] } {
  const r = (raw ?? {}) as Record<string, any>
  if (!r.broker?.url) throw new Error('config: broker.url wajib diisi')

  const skipped: { id: string; reason: string }[] = []
  const devices: DeviceConfig[] = []
  for (const d of r.devices ?? []) {
    if (!d.id || !d.name || !d.connector) { skipped.push({ id: d.id ?? '?', reason: 'field id/name/connector kurang' }); continue }
    if (d.connector === 'bambu' && (!d.ip || !d.serial || !d.accessCode)) {
      skipped.push({ id: d.id, reason: 'bambu butuh ip+serial+accessCode (isi manual di config.json)' }); continue
    }
    if (d.connector === 'moonraker' && !d.ip) { skipped.push({ id: d.id, reason: 'moonraker butuh ip' }); continue }
    devices.push(d as DeviceConfig)
  }

  return {
    config: {
      broker: { url: String(r.broker.url) },
      topics: { status: r.topics?.status ?? '3dpb/printers-v2', events: r.topics?.events ?? '3dpb/printer-events' },
      staleAfterMs: r.staleAfterMs ?? 600_000,
      pushallIntervalMs: r.pushallIntervalMs ?? 300_000,
      moonrakerPollMs: r.moonrakerPollMs ?? 60_000,
      republishIntervalMs: r.republishIntervalMs ?? 60_000,
      notifications: r.notifications ?? null,
      devices,
    },
    skipped,
  }
}
```

- [ ] **Step 5: Implement `src/main.ts`** (wiring — dites lewat loadConfig + smoke manual):
```ts
import { readFileSync } from 'node:fs'
import {
  Engine, BambuMqttConnector, MoonrakerConnector, MqttReporter,
  TelegramNotifier, PushoverNotifier, type Connector, type Notifier,
} from '@3pb/printer-monitor-core'
import { loadConfig, type AppConfig } from './config'

export function buildFromConfig(config: AppConfig): { engine: Engine; reporter: MqttReporter } {
  const reporter = new MqttReporter({ url: config.broker.url, statusTopic: config.topics.status, eventsTopic: config.topics.events })
  const connectors: Connector[] = config.devices.map((d) =>
    d.connector === 'bambu'
      ? new BambuMqttConnector(d, { pushallIntervalMs: config.pushallIntervalMs })
      : new MoonrakerConnector(d, { pollIntervalMs: config.moonrakerPollMs }))
  const notifiers: Notifier[] = []
  if (config.notifications?.telegram) notifiers.push(new TelegramNotifier(config.notifications.telegram))
  if (config.notifications?.pushover) notifiers.push(new PushoverNotifier(config.notifications.pushover))
  const engine = new Engine({
    devices: config.devices, connectors, reporters: [reporter], notifiers,
    staleAfterMs: config.staleAfterMs, republishIntervalMs: config.republishIntervalMs,
  })
  return { engine, reporter }
}

async function main() {
  const path = process.env.CONFIG_PATH ?? new URL('../config.json', import.meta.url).pathname
  const { config, skipped } = loadConfig(JSON.parse(readFileSync(path, 'utf8')))
  for (const s of skipped) console.warn(`[config] SKIP device ${s.id}: ${s.reason}`)
  console.log(`[printer-monitor] ${config.devices.length} device aktif → ${config.broker.url} topic ${config.topics.status}`)

  const { engine, reporter } = buildFromConfig(config)
  await reporter.connect()
  await engine.start()

  const shutdown = async () => { await engine.stop(); await reporter.close(); process.exit(0) }
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) void main()
```

- [ ] **Step 6: `pnpm install` (registrasi workspace baru) → run test service — PASS; `pnpm turbo test` hijau.**
- [ ] **Step 7: Commit** — `feat(printer-monitor): service shell — config loader (skip device belum lengkap) + daemon wiring; workspace + services/*`

---

### Task 12: TUI `status`

**Files:**
- Create: `services/printer-monitor/src/render.ts`, `src/status.ts`
- Test: `services/printer-monitor/src/__tests__/render.test.ts`

**Interfaces:**
- Consumes: `PrintersPayload` (core).
- Produces: `renderTable(p: PrintersPayload, nowMs: number): string` (murni, tanpa ANSI clear — clear dilakukan status.ts).

- [ ] **Step 1: Failing test**:
```ts
import { describe, it, expect } from 'vitest'
import { renderTable } from '../render'

const T0 = Date.parse('2026-07-16T01:00:00Z')
const payload = { payload: [
  { name: 'Mars', type: 'P1P', state: 'running', progress: 42, remaining_min: 58, filename: 'nike.3mf', error_msg: '', last_seen: new Date(T0 - 30_000).toISOString() },
  { name: 'Jupiter', type: 'X1C', state: 'OFFLINE', progress: 100, remaining_min: 0, filename: 'old.3mf', error_msg: 'hms=...', last_seen: new Date(T0 - 3 * 3600_000).toISOString() },
] }

describe('renderTable', () => {
  it('menampilkan baris per printer: nama, state, progress-bar, sisa, umur last_seen', () => {
    const out = renderTable(payload, T0)
    expect(out).toContain('Mars'); expect(out).toContain('P1P')
    expect(out).toContain('running'); expect(out).toContain('42%')
    expect(out).toContain('58m'); expect(out).toContain('30s ago')
    expect(out).toContain('Jupiter'); expect(out).toContain('OFFLINE'); expect(out).toContain('3h ago')
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

`src/render.ts`:
```ts
import type { PrintersPayload } from '@3pb/printer-monitor-core'

const COLOR: Record<string, string> = {
  running: '\x1b[32m', pause: '\x1b[33m', finish: '\x1b[36m',
  error: '\x1b[31m', idle: '\x1b[2m', OFFLINE: '\x1b[31;2m',
}
const R = '\x1b[0m'

export function age(nowMs: number, iso: string | null): string {
  if (!iso) return '-'
  const s = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

const bar = (pct: number) => {
  const filled = Math.round(pct / 10)
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${pct}%`
}

export function renderTable(p: PrintersPayload, nowMs: number): string {
  const lines = [
    `  ${'PRINTER'.padEnd(10)} ${'TYPE'.padEnd(7)} ${'STATE'.padEnd(8)} ${'PROGRESS'.padEnd(17)} ${'SISA'.padEnd(6)} ${'SEEN'.padEnd(9)} FILE`,
  ]
  for (const r of p.payload) {
    const c = COLOR[r.state] ?? ''
    lines.push(
      `  ${r.name.padEnd(10)} ${r.type.padEnd(7)} ${c}${r.state.padEnd(8)}${R} ${bar(r.progress).padEnd(17)} ${(r.remaining_min + 'm').padEnd(6)} ${age(nowMs, r.last_seen).padEnd(9)} ${r.filename}`,
    )
  }
  return lines.join('\n')
}
```

`src/status.ts`:
```ts
import mqtt from 'mqtt'
import type { PrintersPayload } from '@3pb/printer-monitor-core'
import { renderTable } from './render'

const url = process.env.BROKER_URL ?? 'mqtt://192.168.88.113:1883'
const topic = process.env.STATUS_TOPIC ?? '3dpb/printers-v2'

const client = mqtt.connect(url)
client.on('connect', () => {
  client.subscribe(topic)
  console.log(`subscribe ${topic} @ ${url} — menunggu payload retained…`)
})
client.on('message', (_t, msg) => {
  try {
    const p = JSON.parse(msg.toString()) as PrintersPayload
    process.stdout.write('\x1b[2J\x1b[H') // clear
    console.log(`printer-monitor status — ${new Date().toLocaleTimeString('id-ID')}  (${topic})\n`)
    console.log(renderTable(p, Date.now()))
  } catch { /* abaikan frame rusak */ }
})
```

- [ ] **Step 4: Run — PASS. Step 5: Commit** — `feat(printer-monitor): TUI status (subscribe MQTT, tabel ANSI live)`

---

### Task 13: Dockerfile + parity-check + runbook cutover

**Files:**
- Create: `services/printer-monitor/Dockerfile`, `services/printer-monitor/scripts/parity-check.ts`, `docs/runbooks/printer-monitor-cutover.md`

**Interfaces:**
- Consumes: payload topic n8n `3dpb/printers` & service `3dpb/printers-v2`.
- Produces: artefak operasional; TIDAK ada kode yang dikonsumsi task lain.

- [ ] **Step 1: `Dockerfile`** (build context = root repo, pola dashboard):
```dockerfile
FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/printer-monitor-core ./packages/printer-monitor-core
COPY services/printer-monitor ./services/printer-monitor
RUN pnpm install --frozen-lockfile --filter @3pb/printer-monitor...
ENV CONFIG_PATH=/data/config.json
CMD ["pnpm", "--filter", "@3pb/printer-monitor", "start"]
```
Verifikasi build lokal: `docker build -f services/printer-monitor/Dockerfile -t printer-monitor:dev .` → Expected: image built (TIDAK di-run / di-deploy).

- [ ] **Step 2: `scripts/parity-check.ts`**:
```ts
import mqtt from 'mqtt'
import type { PrinterRow, PrintersPayload } from '@3pb/printer-monitor-core'

const url = process.env.BROKER_URL ?? 'mqtt://192.168.88.113:1883'
const A = process.env.TOPIC_A ?? '3dpb/printers'      // n8n
const B = process.env.TOPIC_B ?? '3dpb/printers-v2'   // service

// Field yang dibandingkan strict; last_seen & progress wajar berbeda timing.
const KEYS: (keyof PrinterRow)[] = ['name', 'type', 'state', 'filename']

const got: Record<string, PrintersPayload> = {}
const client = mqtt.connect(url)
client.on('connect', () => client.subscribe([A, B]))
client.on('message', (topic, msg) => {
  const raw = JSON.parse(msg.toString())
  const payload = typeof raw.payload === 'string' ? JSON.parse(raw.payload) : raw.payload // n8n jalur ganymede publish string
  got[topic] = { payload }
  if (got[A] && got[B]) compare()
})

function compare() {
  const byName = (p: PrintersPayload) => new Map(p.payload.map((r) => [r.name, r]))
  const a = byName(got[A]), b = byName(got[B])
  let diffs = 0
  for (const [name, ra] of a) {
    const rb = b.get(name)
    if (!rb) { console.log(`❌ ${name}: tidak ada di ${B}`); diffs++; continue }
    for (const k of KEYS) {
      // state OFFLINE bisa beda timing; hanya bandingkan kalau dua-duanya bukan OFFLINE
      if (k === 'state' && (ra.state === 'OFFLINE' || rb.state === 'OFFLINE')) continue
      if (String(ra[k]) !== String(rb[k])) { console.log(`❌ ${name}.${k}: "${ra[k]}" vs "${rb[k]}"`); diffs++ }
    }
  }
  for (const name of b.keys()) if (!a.has(name)) { console.log(`❌ ${name}: tidak ada di ${A}`); diffs++ }
  console.log(diffs === 0 ? '✅ PARITAS OK' : `⚠️ ${diffs} beda`)
  client.end(); process.exit(diffs === 0 ? 0 : 1)
}

setTimeout(() => { console.error('timeout: retained tidak lengkap di kedua topic'); process.exit(2) }, 15_000)
```
Tambah script `"parity": "tsx scripts/parity-check.ts"` di package.json service.

- [ ] **Step 3: Runbook `docs/runbooks/printer-monitor-cutover.md`** — isi lengkap:

```markdown
# Runbook: Cutover printer monitoring n8n → printer-monitor

SEMUA langkah eksekusi produksi GATED persetujuan user. Jangan jalankan tanpa perintah.

## 0. Prasyarat
- `cp services/printer-monitor/config.example.json services/printer-monitor/config.json`
- Isi `ip` + `accessCode` per printer Bambu (Bambu Handy → Settings → LAN Only Mode; ip dari router).
  VERIFIKASI serial Mercury: keepalive n8n `03090A481400312` vs spec lama `0309DA4B1400312`.
- Urutan `devices` di config = urutan payload n8n (paritas tampilan CYD).

## 1. Jalan paralel (aman — topic beda: 3dpb/printers-v2)
- Lokal: `CONFIG_PATH=./config.json pnpm --filter @3pb/printer-monitor start`
- Pantau: `pnpm --filter @3pb/printer-monitor status`
- Device yang belum diisi ip/accessCode akan SKIP dgn warning — isi bertahap sambil test.

## 2. Verifikasi paritas
- `pnpm --filter @3pb/printer-monitor parity` → harus `✅ PARITAS OK`
  (state OFFLINE di-skip karena beda timing; last_seen/progress memang beda wajar)
- Biarkan >15 menit: pastikan tidak ada printer online yang jadi OFFLINE
  (bukti pushall keepalive bekerja).

## 3. Deploy container di .113 (gated user)
docker build -f services/printer-monitor/Dockerfile -t printer-monitor:latest .
docker save / transfer sesuai pola deploy dashboard, lalu di host .113:
docker run -d --name printer-monitor --restart unless-stopped \
  -v /path/ke/config-dir:/data printer-monitor:latest
(config.json berisi secrets HANYA di host, jangan commit)

## 4. Cutover (gated user)
1. Edit config produksi: `topics.status` → `3dpb/printers`; restart container.
2. Nonaktifkan workflow n8n (API key di ~/Documents/Project/homelab-n8n/.env):
   for id in 8fEOjLQIcRr2L0CR BAFoxWvahVFczG1O BKnv5gm1WmiB2suF CwvB8ASXcbF4vJtQ \
             WSzpRGkzgndIJ6bp hbcSJX7QG2F99r8c lc6hNYpe5oIsy24r rik0nP0XDWli1Hxy \
             ztVHpVIF0D6aPsMF ksdhKpThxvQPtRPj th9fghY5V3rmqfyo; do
     curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" \
       "$N8N_HOST/api/v1/workflows/$id/deactivate" | head -c 100; echo
   done
   # PDrDhaHe8G3olC2H (Jupiter) & jwJykB3Imez41hsQ (HMS refresh) sudah off.
3. Verifikasi CYD menampilkan status (payload sekarang dari service).
4. Jupiter: pastikan ip+accessCode terisi di config → hidup lagi via service (perbaikan bug beku-sejak-Mei).

## 5. Rollback
- Re-activate workflow n8n: sama seperti atas tapi endpoint `/activate`.
- Kembalikan `topics.status` service ke `3dpb/printers-v2`, restart.
- Retained lama n8n akan menimpa begitu ada message baru.
```

- [ ] **Step 4: `pnpm turbo test` hijau + docker build OK. Step 5: Commit** — `feat(printer-monitor): Dockerfile + parity-check + runbook cutover n8n`

---

## Self-Review (dijalankan penulis plan)

1. **Spec coverage:** §2 kontrak payload → Task 5; §3 core+connectors+reporter → Task 1–9; §4 broker murni (tanpa licensing) → tidak ada kode limit ✓; §6 komponen → Task 1–10 (StateStore in-memory; persist adapter = seam, YAGNI Fase 1); §7 internal zero-internet → HMS vendored (Task 4), notifications off default (Task 11 `notifications: null`); §9 migrasi → Task 13; §10 risiko (serial Mercury, payload string ganymede, casing) → runbook + parity-check menangani string payload + test casing; §12 testing → tiap task TDD. Registry dashboard & Supabase = Fase 2/3 (di luar plan ini, sesuai spec §11).
2. **Placeholder scan:** tidak ada TBD/TODO; semua step berisi kode/perintah konkret.
3. **Type consistency:** `NormalizedStatus`/`StoredState`/`PrinterRow` konsisten Task 1→12; `storedStateFor` dipakai StateStore (Task 5) sesuai definisi Task 2; `Connector.start(onStatus)` konsisten Task 6/8/9.
