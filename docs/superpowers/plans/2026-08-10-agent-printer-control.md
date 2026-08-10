# Agent Desktop Printer Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pause, resume, stop, and adjust print speed from a printer card in `apps/agent`'s Dashboard, for both Bambu (MQTT) and Klipper/Moonraker (REST) printers.

**Architecture:** Add a write path alongside the existing read-only `Connector`/`Engine` pipeline in `packages/printer-monitor-core`: a new `sendCommand()` method on `Connector`, delegated by `Engine.sendCommand(deviceId, cmd)`, exposed to the renderer via a new IPC channel. `DashboardScreen.tsx` gains a `PrinterControls` component per card whose buttons/Speed-widget change with printer state and connector brand, plus a Stop confirmation and a status-badge fix.

**Tech Stack:** TypeScript, Vitest, React (renderer), Electron IPC, `mqtt` v5 (Bambu), `fetch` (Moonraker REST), `@3pb/ui` Glass components.

## Global Constraints

- Speed for Bambu: 4 fixed levels — `1=Silent, 2=Standard, 3=Sport, 4=Ludicrous` — sent as MQTT `print_speed` command with `param` = level as a string.
- Speed for Moonraker: free percentage via G-code `M220 S<percent>`, UI range `20–200`, step `10`.
- Stop confirmation copy (exact): title "Batalkan print?", body "Proses akan dihentikan, tidak bisa diulang kembali.", buttons "Tidak" (green, `#10b981`) and "Ya, batalkan" (red, `#ef4444`).
- Button visibility by lowercased `state`: `running` → Pause+Speed+Stop; `pause`/`paused`/`error` → Resume+Stop (no Speed); anything else → no controls.
- Status badge color must reflect `error_message` presence (use `g-error`), not just literal `state` — without changing `state` itself or the button-visibility rule above.
- No optimistic state updates — command success just clears the sending indicator; the printer's new state shows up via the existing 5-second poll.
- Full spec: `docs/superpowers/specs/2026-08-10-agent-printer-control-design.md`.

---

### Task 1: Command types + `connector` field on `PrinterRow`

**Files:**
- Modify: `packages/printer-monitor-core/src/types.ts`
- Modify: `packages/printer-monitor-core/src/payload.ts`
- Test: `packages/printer-monitor-core/src/__tests__/payload.test.ts`

**Interfaces:**
- Produces: `PrinterCommand` (union type), `CommandResult` (union type), `PrinterRow.connector: ConnectorKind` — all consumed by every later task.

- [ ] **Step 1: Write the failing tests**

In `packages/printer-monitor-core/src/__tests__/payload.test.ts`, update the very first test (currently asserts an exact object via `toEqual` without a `connector` field — it will now fail because the real output gains a field the expectation doesn't have) and add one more:

```ts
  it('device tanpa data → OFFLINE, field default', () => {
    const p = buildPrintersPayload([mars], new StateStore(), T0)
    expect(p.payload).toEqual([{
      id: 'mars',
      name: 'Mars', type: 'P1P', state: 'OFFLINE', progress: 0,
      remaining_min: 0, filename: '', error_msg: '', error_message: '', last_seen: null,
      nozzle_temp: 0, bed_temp: 0, connector: 'bambu',
    }])
  })
```

Add a new test right after it:

```ts
  it('connector mengalir dari DeviceConfig.connector -- moonraker device tampil connector:"moonraker"', () => {
    const p = buildPrintersPayload([gany], new StateStore(), T0)
    expect(p.payload[0].connector).toBe('moonraker')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/printer-monitor-core && pnpm exec vitest run src/__tests__/payload.test.ts`
Expected: FAIL — the first test fails a `toEqual` mismatch (actual object missing `connector`); the new test fails because `p.payload[0].connector` is `undefined`.

- [ ] **Step 3: Add the command/result types and the `connector` field**

In `packages/printer-monitor-core/src/types.ts`, add near the top (after the existing `ConnectorKind` export):

```ts
export type PrinterCommand =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'stop' }
  | { kind: 'setSpeedLevel'; level: 1 | 2 | 3 | 4 }   // Bambu: Silent/Standard/Sport/Ludicrous
  | { kind: 'setSpeedPercent'; percent: number }       // Moonraker: free percentage via M220

export type CommandResult = { ok: true } | { ok: false; message: string }
```

In the same file, add `connector: ConnectorKind` to the `PrinterRow` interface (after the existing `type: string` line):

```ts
export interface PrinterRow {
  id: string
  name: string
  type: string
  connector: ConnectorKind
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

In `packages/printer-monitor-core/src/payload.ts`, add `connector: d.connector,` to the mapped object (the `DeviceConfig` object `d` already carries `.connector` — no need to route it through `StateStore`):

```ts
      return {
        id: d.id,
        name: d.name, type: d.type, connector: d.connector,
        state: isStale ? 'OFFLINE' : (r!.last_state || 'idle'),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/printer-monitor-core && pnpm exec vitest run src/__tests__/payload.test.ts`
Expected: PASS (all tests in the file, including the ones updated above)

- [ ] **Step 5: Run the full package suite (catches any other exact-shape assertion elsewhere)**

Run: `cd packages/printer-monitor-core && pnpm exec vitest run`
Expected: PASS. If any other test does an exact `toEqual` on a `PrinterRow`-shaped object, add `connector: 'bambu'` (or `'moonraker'`, matching that test's device) to its expectation.

- [ ] **Step 6: Commit**

```bash
git add packages/printer-monitor-core/src/types.ts packages/printer-monitor-core/src/payload.ts packages/printer-monitor-core/src/__tests__/payload.test.ts
git commit -m "feat(printer-monitor-core): add PrinterCommand/CommandResult types + connector field on PrinterRow"
```

---

### Task 2: Write-command channel — `Connector.sendCommand()`, `Engine.sendCommand()`, Bambu + Moonraker implementations

This is one task because the `Connector` interface change and its two concrete implementers (`BambuMqttConnector`, `MoonrakerConnector`) must land together — the package does not compile with the interface changed but only one implementer updated.

**Files:**
- Modify: `packages/printer-monitor-core/src/engine.ts`
- Modify: `packages/printer-monitor-core/src/connectors/bambu-mqtt.ts`
- Modify: `packages/printer-monitor-core/src/connectors/moonraker.ts`
- Test: `packages/printer-monitor-core/src/__tests__/engine.test.ts`
- Test: `packages/printer-monitor-core/src/__tests__/bambu-connector.test.ts`
- Test: `packages/printer-monitor-core/src/__tests__/moonraker-connector.test.ts`

**Interfaces:**
- Consumes: `PrinterCommand`, `CommandResult` from Task 1.
- Produces: `Connector.sendCommand(cmd: PrinterCommand): Promise<CommandResult>`, `Engine.sendCommand(deviceId: string, cmd: PrinterCommand): Promise<CommandResult>` — both consumed by Task 3 (IPC handler).

- [ ] **Step 1: Write the failing `Engine.sendCommand` tests**

In `packages/printer-monitor-core/src/__tests__/engine.test.ts`, the two existing mock connectors (`badConnector`, `goodConnector` inside the `"satu connector gagal start()"` test) are plain object literals assigned to `Connector[]` — once the interface gains `sendCommand`, TypeScript will reject them for missing it. Update both:

```ts
    const badConnector = {
      deviceId: 'mars',
      start: () => { throw new Error('bambu device mars butuh serial+accessCode') },
      stop: async () => {},
      sendCommand: async () => ({ ok: true as const }),
    }
    const goodConnector = {
      deviceId: 'jupiter',
      start: async () => { startedIds.push('jupiter') },
      stop: async () => {},
      sendCommand: async () => ({ ok: true as const }),
    }
```

Then add a new `describe` block at the end of the file, before the final closing `})`:

```ts
  describe('sendCommand', () => {
    it('delegasikan ke connector yang cocok deviceId', async () => {
      const calls: unknown[] = []
      const connector = {
        deviceId: 'mars',
        start: async () => {},
        stop: async () => {},
        sendCommand: async (cmd: unknown) => { calls.push(cmd); return { ok: true as const } },
      }
      const reporter: Reporter = { publishStatus: () => {}, emitEvent: () => {} }
      const engine = new Engine({ devices: [mars], connectors: [connector], reporters: [reporter] })
      const result = await engine.sendCommand('mars', { kind: 'pause' })
      expect(result).toEqual({ ok: true })
      expect(calls).toEqual([{ kind: 'pause' }])
    })

    it("device tak dimonitor -> {ok:false, message:'device_not_found'}, tak panggil connector mana pun", async () => {
      const connector = { deviceId: 'mars', start: async () => {}, stop: async () => {}, sendCommand: vi.fn() }
      const reporter: Reporter = { publishStatus: () => {}, emitEvent: () => {} }
      const engine = new Engine({ devices: [mars], connectors: [connector], reporters: [reporter] })
      const result = await engine.sendCommand('unknown-device', { kind: 'stop' })
      expect(result).toEqual({ ok: false, message: 'device_not_found' })
      expect(connector.sendCommand).not.toHaveBeenCalled()
    })
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/printer-monitor-core && pnpm exec vitest run src/__tests__/engine.test.ts`
Expected: FAIL to even compile/run — `Engine.sendCommand` doesn't exist yet, and (once you also try building) the two updated mock connectors above are the fix for a `Connector[]` type error that appears the moment Step 3 changes the interface. Right now, before Step 3, the file fails simply because `engine.sendCommand` is not a function.

- [ ] **Step 3: Implement `Connector.sendCommand()` + `Engine.sendCommand()`**

In `packages/printer-monitor-core/src/engine.ts`, update the type import at the top:

```ts
import type { CommandResult, DeviceConfig, NormalizedStatus, PrinterCommand, PrinterEvent, PrintersPayload } from './types'
```

Extend the `Connector` interface:

```ts
export interface Connector {
  readonly deviceId: string
  start(onStatus: (s: NormalizedStatus) => void): void | Promise<void>
  stop(): void | Promise<void>
  sendCommand(cmd: PrinterCommand): Promise<CommandResult>
}
```

In the `Engine` class, add a `connectorById` map (mirrors the existing `deviceById`) and the new method:

```ts
export class Engine {
  private hms: HmsLookup
  private store: StateStore
  private timer: ReturnType<typeof setInterval> | null = null
  private deviceById: Map<string, DeviceConfig>
  private connectorById: Map<string, Connector>
  constructor(private opts: EngineOpts) {
    this.deviceById = new Map(opts.devices.map((d) => [d.id, d]))
    this.connectorById = new Map(opts.connectors.map((c) => [c.deviceId, c]))
    this.hms = opts.hms ?? new HmsLookup()
    this.store = new StateStore(this.hms)
  }

  async sendCommand(deviceId: string, cmd: PrinterCommand): Promise<CommandResult> {
    const connector = this.connectorById.get(deviceId)
    if (!connector) return { ok: false, message: 'device_not_found' }
    return connector.sendCommand(cmd)
  }

  snapshot(): PrintersPayload {
```

(the `snapshot()` method and everything below it stays exactly as-is — this only adds the constructor field and the new method above it)

- [ ] **Step 4: Run to verify Engine tests pass**

Run: `cd packages/printer-monitor-core && pnpm exec vitest run src/__tests__/engine.test.ts`
Expected: PASS (all tests, including the two updated mock connectors compiling cleanly now)

- [ ] **Step 5: Write the failing `BambuMqttConnector.sendCommand` tests**

In `packages/printer-monitor-core/src/__tests__/bambu-connector.test.ts`, add a new `describe` block after the existing `describe('BambuMqttConnector', ...)` block (reusing the shared `aedes`/`port`/`mars` from the file's top-level `beforeAll`/`afterAll`):

```ts
describe('BambuMqttConnector.sendCommand', () => {
  it('pause -> publish command pause ke topic request', async () => {
    const received: string[] = []
    const sub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
    await new Promise<void>((res) => sub.on('connect', () => res()))
    await sub.subscribeAsync('device/SER1/request')
    sub.on('message', (_t, msg) => received.push(msg.toString()))

    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start(() => {})
    await new Promise((r) => setTimeout(r, 100))

    const result = await c.sendCommand({ kind: 'pause' })
    await new Promise((r) => setTimeout(r, 100))

    expect(result).toEqual({ ok: true })
    const pauseMsg = received.find((m) => JSON.parse(m).print?.command === 'pause')
    expect(pauseMsg).toBeTruthy()

    await c.stop()
    sub.end()
  })

  it('setSpeedLevel -> command print_speed dengan param level (string)', async () => {
    const received: string[] = []
    const sub = mqtt.connect(`mqtt://127.0.0.1:${port}`)
    await new Promise<void>((res) => sub.on('connect', () => res()))
    await sub.subscribeAsync('device/SER1/request')
    sub.on('message', (_t, msg) => received.push(msg.toString()))

    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start(() => {})
    await new Promise((r) => setTimeout(r, 100))

    await c.sendCommand({ kind: 'setSpeedLevel', level: 3 })
    await new Promise((r) => setTimeout(r, 100))

    const speedMsg = received.find((m) => JSON.parse(m).print?.command === 'print_speed')
    expect(speedMsg).toBeTruthy()
    expect(JSON.parse(speedMsg!).print.param).toBe('3')

    await c.stop()
    sub.end()
  })

  it('belum connect -> {ok:false, message:"printer_offline"}, tak publish apa pun', async () => {
    const c = new BambuMqttConnector(mars, { urlOverride: 'mqtt://127.0.0.1:1' })
    const result = await c.sendCommand({ kind: 'stop' })
    expect(result).toEqual({ ok: false, message: 'printer_offline' })
    await c.stop()
  })

  it('command kind yang tak didukung Bambu (mis. setSpeedPercent, punya Moonraker) -> unsupported_command', async () => {
    const c = new BambuMqttConnector(mars, { urlOverride: `mqtt://127.0.0.1:${port}` })
    await c.start(() => {})
    await new Promise((r) => setTimeout(r, 100))
    const result = await c.sendCommand({ kind: 'setSpeedPercent', percent: 100 })
    expect(result).toEqual({ ok: false, message: 'unsupported_command' })
    await c.stop()
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd packages/printer-monitor-core && pnpm exec vitest run src/__tests__/bambu-connector.test.ts`
Expected: FAIL — `c.sendCommand` is not a function.

- [ ] **Step 7: Implement `BambuMqttConnector.sendCommand()`**

In `packages/printer-monitor-core/src/connectors/bambu-mqtt.ts`, update the type import and add the method to the class:

```ts
import type { CommandResult, DeviceConfig, NormalizedStatus, PrinterCommand } from '../types'
```

```ts
  async sendCommand(cmd: PrinterCommand): Promise<CommandResult> {
    if (!this.client?.connected) return { ok: false, message: 'printer_offline' }
    const requestTopic = `device/${this.device.serial}/request`
    let payload: Record<string, unknown>
    switch (cmd.kind) {
      case 'pause':
        payload = { print: { sequence_id: '0', command: 'pause' } }
        break
      case 'resume':
        payload = { print: { sequence_id: '0', command: 'resume' } }
        break
      case 'stop':
        payload = { print: { sequence_id: '0', command: 'stop' } }
        break
      case 'setSpeedLevel':
        payload = { print: { sequence_id: '0', command: 'print_speed', param: String(cmd.level) } }
        break
      default:
        return { ok: false, message: 'unsupported_command' }
    }
    try {
      await this.client.publishAsync(requestTopic, JSON.stringify(payload))
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'publish_failed' }
    }
  }
```

Add this method inside the `BambuMqttConnector` class, after `start()` and before `stop()`.

- [ ] **Step 8: Run to verify it passes**

Run: `cd packages/printer-monitor-core && pnpm exec vitest run src/__tests__/bambu-connector.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing `MoonrakerConnector.sendCommand` tests**

In `packages/printer-monitor-core/src/__tests__/moonraker-connector.test.ts`, add after the existing `describe('MoonrakerConnector', ...)` block:

```ts
describe('MoonrakerConnector.sendCommand', () => {
  it('pause -> POST /printer/print/pause', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'pause' })
    expect(result).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.88.40/printer/print/pause', { method: 'POST' })
  })

  it('setSpeedPercent -> POST /printer/gcode/script dengan M220 S<persen>', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'setSpeedPercent', percent: 120 })
    expect(result).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.88.40/printer/gcode/script', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script: 'M220 S120' }),
    })
  })

  it('respons non-2xx -> {ok:false, message berisi status code}', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 500 }))
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'stop' })
    expect(result).toEqual({ ok: false, message: 'moonraker_500' })
  })

  it('fetch throw (network error) -> {ok:false, message dari error}', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED') })
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'resume' })
    expect(result).toEqual({ ok: false, message: 'ECONNREFUSED' })
  })

  it('command kind yang tak didukung Moonraker (mis. setSpeedLevel, punya Bambu) -> unsupported_command', async () => {
    const fetchImpl = vi.fn()
    const c = new MoonrakerConnector(gany, { fetchImpl: fetchImpl as unknown as typeof fetch })
    const result = await c.sendCommand({ kind: 'setSpeedLevel', level: 2 })
    expect(result).toEqual({ ok: false, message: 'unsupported_command' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 10: Run to verify it fails**

Run: `cd packages/printer-monitor-core && pnpm exec vitest run src/__tests__/moonraker-connector.test.ts`
Expected: FAIL — `c.sendCommand` is not a function.

- [ ] **Step 11: Implement `MoonrakerConnector.sendCommand()`**

In `packages/printer-monitor-core/src/connectors/moonraker.ts`, update the type import and add the method:

```ts
import type { CommandResult, DeviceConfig, NormalizedStatus, PrinterCommand } from '../types'
```

```ts
  async sendCommand(cmd: PrinterCommand): Promise<CommandResult> {
    const f = this.opts.fetchImpl ?? fetch
    let url: string
    let init: RequestInit
    switch (cmd.kind) {
      case 'pause':
        url = `http://${this.device.ip}/printer/print/pause`
        init = { method: 'POST' }
        break
      case 'resume':
        url = `http://${this.device.ip}/printer/print/resume`
        init = { method: 'POST' }
        break
      case 'stop':
        url = `http://${this.device.ip}/printer/print/cancel`
        init = { method: 'POST' }
        break
      case 'setSpeedPercent':
        url = `http://${this.device.ip}/printer/gcode/script`
        init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ script: `M220 S${cmd.percent}` }) }
        break
      default:
        return { ok: false, message: 'unsupported_command' }
    }
    try {
      const res = await f(url, init)
      if (!res.ok) return { ok: false, message: `moonraker_${res.status}` }
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'network_error' }
    }
  }
```

Add this method inside the `MoonrakerConnector` class, after `start()` and before `stop()`.

- [ ] **Step 12: Run to verify it passes**

Run: `cd packages/printer-monitor-core && pnpm exec vitest run src/__tests__/moonraker-connector.test.ts`
Expected: PASS

- [ ] **Step 13: Run the full package suite + typecheck**

Run: `cd packages/printer-monitor-core && pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 14: Commit**

```bash
git add packages/printer-monitor-core/src/engine.ts packages/printer-monitor-core/src/connectors/bambu-mqtt.ts packages/printer-monitor-core/src/connectors/moonraker.ts packages/printer-monitor-core/src/__tests__/engine.test.ts packages/printer-monitor-core/src/__tests__/bambu-connector.test.ts packages/printer-monitor-core/src/__tests__/moonraker-connector.test.ts
git commit -m "feat(printer-monitor-core): add sendCommand write path to Connector/Engine + both connector implementations"
```

---

### Task 3: IPC channel — `agent:printer-command`

**Files:**
- Modify: `apps/agent/src/main/ipc.ts`
- Modify: `apps/agent/src/preload/index.ts`
- Test: `apps/agent/src/main/ipc.test.ts`

**Interfaces:**
- Consumes: `Engine.sendCommand(deviceId, cmd)` from Task 2, `getEngine()` from `apps/agent/src/main/app-state.ts` (already used elsewhere in `ipc.ts`).
- Produces: `window.agentApi.sendPrinterCommand(deviceId: string, cmd: PrinterCommand): Promise<CommandResult>`, consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

In `apps/agent/src/main/ipc.test.ts`, add near the end of the file, after the last existing `describe` block:

```ts
describe("agent:printer-command", () => {
  it("engine belum jalan -> {ok:false, message:'engine_not_running'}", async () => {
    registerIpcHandlers();
    setEngine(null);
    const result = await handlers["agent:printer-command"]({}, "mars", { kind: "pause" });
    expect(result).toEqual({ ok: false, message: "engine_not_running" });
  });

  it("delegasikan ke Engine.sendCommand dengan deviceId+cmd yang dioper apa adanya", async () => {
    registerIpcHandlers();
    const sendCommand = vi.fn().mockResolvedValue({ ok: true });
    setEngine({ snapshot: () => ({ payload: [] }), sendCommand } as any);
    const result = await handlers["agent:printer-command"]({}, "mars", { kind: "setSpeedLevel", level: 3 });
    expect(sendCommand).toHaveBeenCalledWith("mars", { kind: "setSpeedLevel", level: 3 });
    expect(result).toEqual({ ok: true });
    setEngine(null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/agent && pnpm exec vitest run src/main/ipc.test.ts`
Expected: FAIL — `handlers["agent:printer-command"]` is `undefined`, calling it throws.

- [ ] **Step 3: Implement the IPC handler**

In `apps/agent/src/main/ipc.ts`, add a type import at the top (alongside the existing imports):

```ts
import type { CommandResult, PrinterCommand } from "@3pb/printer-monitor-core";
```

Add the new handler at the end of `registerIpcHandlers()`, right after the existing `agent:get-broker-info` handler and before the function's closing brace:

```ts
  // Kirim command kontrol (pause/resume/stop/speed) ke printer tertentu -- device yang tak
  // lagi dimonitor Engine balikin device_not_found lewat Engine.sendCommand sendiri; di sini
  // cuma jaga kasus Engine belum pernah start sama sekali (mis. belum ada device dipasangkan).
  ipcMain.handle("agent:printer-command", async (_event, deviceId: string, cmd: PrinterCommand): Promise<CommandResult> => {
    const engine = getEngine();
    if (!engine) return { ok: false, message: "engine_not_running" };
    return engine.sendCommand(deviceId, cmd);
  });
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/agent && pnpm exec vitest run src/main/ipc.test.ts`
Expected: PASS

- [ ] **Step 5: Expose it in preload**

In `apps/agent/src/preload/index.ts`, update the type import line to add `PrinterCommand`/`CommandResult`:

```ts
import type { PrintersPayload, PrinterCommand, CommandResult } from "@3pb/printer-monitor-core";
```

Add to the `agentApi` object, after `getActivationState`:

```ts
  sendPrinterCommand: (deviceId: string, cmd: PrinterCommand): Promise<CommandResult> =>
    ipcRenderer.invoke("agent:printer-command", deviceId, cmd),
```

(no dedicated test file for `preload/index.ts` — matches the existing convention in this codebase, where preload is thin 1:1 wiring covered indirectly by the IPC handler tests above and by the renderer tests in Task 4/5 that mock `window.agentApi`)

- [ ] **Step 6: Typecheck**

Run: `cd apps/agent && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/main/ipc.ts apps/agent/src/preload/index.ts apps/agent/src/main/ipc.test.ts
git commit -m "feat(agent): add agent:printer-command IPC channel"
```

---

### Task 4: `PrinterControls` component

**Files:**
- Create: `apps/agent/src/renderer/components/PrinterControls.tsx`
- Test: `apps/agent/src/renderer/components/PrinterControls.test.tsx`

**Interfaces:**
- Consumes: `window.agentApi.sendPrinterCommand` from Task 3, `PrinterCommand`/`CommandResult` types, `GlassButton`/`GlassCard` from `@3pb/ui`.
- Produces: `export function PrinterControls({ deviceId: string; state: string; connector: string }): JSX.Element | null` — consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

Create `apps/agent/src/renderer/components/PrinterControls.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PrinterControls } from "./PrinterControls";

beforeEach(() => {
  (globalThis as any).window.agentApi = {
    sendPrinterCommand: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe("PrinterControls", () => {
  it("state running + connector bambu -> tampilkan Pause, dropdown speed 4 level, Stop", () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    expect(screen.getByRole("button", { name: /pause/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeTruthy();
    expect(screen.getByLabelText(/kecepatan print/i).tagName).toBe("SELECT");
    expect(screen.queryByRole("button", { name: /resume/i })).toBeNull();
  });

  it("state running + connector moonraker -> tampilkan slider persen, bukan dropdown", () => {
    render(<PrinterControls deviceId="ganymede" state="running" connector="moonraker" />);
    const slider = screen.getByLabelText(/kecepatan print/i);
    expect(slider.tagName).toBe("INPUT");
    expect(slider.getAttribute("type")).toBe("range");
    expect(slider.getAttribute("min")).toBe("20");
    expect(slider.getAttribute("max")).toBe("200");
    expect(slider.getAttribute("step")).toBe("10");
  });

  it("state paused -> Resume + Stop, TANPA kontrol speed (Pause hilang)", () => {
    render(<PrinterControls deviceId="mars" state="pause" connector="bambu" />);
    expect(screen.getByRole("button", { name: /resume/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull();
    expect(screen.queryByLabelText(/kecepatan print/i)).toBeNull();
  });

  it("state error -> Resume + Stop juga (bukan Stop-only)", () => {
    render(<PrinterControls deviceId="mars" state="error" connector="bambu" />);
    expect(screen.getByRole("button", { name: /resume/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^stop$/i })).toBeTruthy();
  });

  it("state idle/finish/offline -> tak render apa pun", () => {
    const { container: c1 } = render(<PrinterControls deviceId="mars" state="idle" connector="bambu" />);
    expect(c1.firstChild).toBeNull();
    const { container: c2 } = render(<PrinterControls deviceId="mars" state="finish" connector="bambu" />);
    expect(c2.firstChild).toBeNull();
    const { container: c3 } = render(<PrinterControls deviceId="mars" state="OFFLINE" connector="bambu" />);
    expect(c3.firstChild).toBeNull();
  });

  it("klik Pause -> panggil sendPrinterCommand dgn {kind:'pause'}", async () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect((window as any).agentApi.sendPrinterCommand).toHaveBeenCalledWith("mars", { kind: "pause" }));
  });

  it("ganti pilihan speed Bambu -> kirim setSpeedLevel dengan level yang dipilih", async () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.change(screen.getByLabelText(/kecepatan print/i), { target: { value: "3" } });
    await waitFor(() =>
      expect((window as any).agentApi.sendPrinterCommand).toHaveBeenCalledWith("mars", { kind: "setSpeedLevel", level: 3 }),
    );
  });

  it("geser slider Moonraker lalu lepas (mouseUp) -> kirim setSpeedPercent, BUKAN tiap tick onChange", async () => {
    render(<PrinterControls deviceId="ganymede" state="running" connector="moonraker" />);
    const slider = screen.getByLabelText(/kecepatan print/i);
    fireEvent.change(slider, { target: { value: "150" } });
    expect((window as any).agentApi.sendPrinterCommand).not.toHaveBeenCalled();
    fireEvent.mouseUp(slider, { target: { value: "150" } });
    await waitFor(() =>
      expect((window as any).agentApi.sendPrinterCommand).toHaveBeenCalledWith("ganymede", { kind: "setSpeedPercent", percent: 150 }),
    );
  });

  it("klik Stop -> muncul dialog konfirmasi, BELUM kirim command", () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    expect(screen.getByText(/proses akan dihentikan/i)).toBeTruthy();
    expect((window as any).agentApi.sendPrinterCommand).not.toHaveBeenCalled();
  });

  it("dialog Stop -> klik Tidak menutup dialog, TAK kirim command", () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^tidak$/i }));
    expect(screen.queryByText(/proses akan dihentikan/i)).toBeNull();
    expect((window as any).agentApi.sendPrinterCommand).not.toHaveBeenCalled();
  });

  it("dialog Stop -> klik 'Ya, batalkan' kirim {kind:'stop'} dan menutup dialog", async () => {
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    fireEvent.click(screen.getByRole("button", { name: /ya, batalkan/i }));
    await waitFor(() => expect((window as any).agentApi.sendPrinterCommand).toHaveBeenCalledWith("mars", { kind: "stop" }));
    expect(screen.queryByText(/proses akan dihentikan/i)).toBeNull();
  });

  it("command gagal (ok:false) -> tampilkan pesan error inline", async () => {
    (window as any).agentApi.sendPrinterCommand.mockResolvedValue({ ok: false, message: "printer_offline" });
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/offline/i);
  });

  it("sendPrinterCommand reject (IPC error) -> tak crash, tampilkan pesan error generik", async () => {
    (window as any).agentApi.sendPrinterCommand.mockRejectedValue(new Error("ipc boom"));
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });

  it("saat sending, semua tombol disabled (cegah double-klik)", async () => {
    let resolveSend: (v: unknown) => void = () => {};
    (window as any).agentApi.sendPrinterCommand.mockReturnValue(new Promise((r) => { resolveSend = r; }));
    render(<PrinterControls deviceId="mars" state="running" connector="bambu" />);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect((screen.getByRole("button", { name: /pause/i }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: /^stop$/i }) as HTMLButtonElement).disabled).toBe(true);
    resolveSend({ ok: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/agent && pnpm exec vitest run src/renderer/components/PrinterControls.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `PrinterControls.tsx`**

Create `apps/agent/src/renderer/components/PrinterControls.tsx`:

```tsx
import { useState } from "react";
import { GlassButton, GlassCard } from "@3pb/ui";
import type { CommandResult, PrinterCommand } from "@3pb/printer-monitor-core";

type Feedback = { kind: "idle" } | { kind: "sending" } | { kind: "error"; message: string };

// Selama sending: semua tombol di kartu ini disabled (cegah double-klik). Sukses -> balik ke
// idle TANPA update state optimistik -- status printer yang sebenarnya muncul lewat polling
// 5 detik yang sudah ada di DashboardScreen, sama seperti tombol Sync.
function commandErrorMessage(message: string): string {
  switch (message) {
    case "printer_offline":
      return "Printer sedang offline -- perintah tak terkirim.";
    case "device_not_found":
    case "engine_not_running":
      return "Device belum termonitor -- coba Sync dulu.";
    case "unsupported_command":
      return "Perintah tak didukung printer ini.";
    default:
      return "Gagal kirim perintah -- coba lagi.";
  }
}

const SPEED_LEVEL_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Silent", 2: "Standard", 3: "Sport", 4: "Ludicrous",
};

/**
 * Kontrol Pause/Resume/Stop/Speed per kartu printer di DashboardScreen. Tombol yang tampil
 * berubah sesuai `state` (bukan selalu tampil semua-disabled) -- lihat spec
 * docs/superpowers/specs/2026-08-10-agent-printer-control-design.md §UI.
 */
export function PrinterControls({
  deviceId,
  state,
  connector,
}: {
  deviceId: string;
  state: string;
  connector: string;
}) {
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [speedLevel, setSpeedLevel] = useState<1 | 2 | 3 | 4>(2);
  const [speedPercent, setSpeedPercent] = useState(100);

  const s = state.toLowerCase();
  const busy = feedback.kind === "sending";

  async function send(cmd: PrinterCommand) {
    setFeedback({ kind: "sending" });
    try {
      const result: CommandResult = await window.agentApi.sendPrinterCommand(deviceId, cmd);
      if (result.ok) setFeedback({ kind: "idle" });
      else setFeedback({ kind: "error", message: commandErrorMessage(result.message) });
    } catch {
      setFeedback({ kind: "error", message: "Gagal kirim perintah -- coba lagi." });
    }
  }

  const showRunningControls = s === "running";
  const showPausedControls = s === "pause" || s === "paused" || s === "error";
  if (!showRunningControls && !showPausedControls) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        {showRunningControls && (
          <GlassButton onClick={() => void send({ kind: "pause" })} disabled={busy} className="text-xs px-3 h-8">
            Pause
          </GlassButton>
        )}
        {showPausedControls && (
          <GlassButton onClick={() => void send({ kind: "resume" })} disabled={busy} className="text-xs px-3 h-8">
            Resume
          </GlassButton>
        )}

        {showRunningControls && connector === "bambu" && (
          <select
            aria-label="Kecepatan print"
            className="glass-input rounded-[5px] px-2 h-8 text-xs flex-1"
            value={speedLevel}
            disabled={busy}
            onChange={(e) => {
              const level = Number(e.target.value) as 1 | 2 | 3 | 4;
              setSpeedLevel(level);
              void send({ kind: "setSpeedLevel", level });
            }}
          >
            {([1, 2, 3, 4] as const).map((level) => (
              <option key={level} value={level}>{SPEED_LEVEL_LABELS[level]}</option>
            ))}
          </select>
        )}
        {showRunningControls && connector === "moonraker" && (
          <div className="flex items-center gap-2 flex-1">
            <input
              type="range"
              aria-label="Kecepatan print (persen)"
              min={20}
              max={200}
              step={10}
              value={speedPercent}
              disabled={busy}
              onChange={(e) => setSpeedPercent(Number(e.target.value))}
              onMouseUp={(e) => void send({ kind: "setSpeedPercent", percent: Number((e.target as HTMLInputElement).value) })}
              onTouchEnd={(e) => void send({ kind: "setSpeedPercent", percent: Number((e.target as HTMLInputElement).value) })}
              className="flex-1"
            />
            <span className="g-t3 text-xs w-10 text-right">{speedPercent}%</span>
          </div>
        )}

        <GlassButton
          onClick={() => setConfirmingStop(true)}
          disabled={busy}
          className="text-xs px-3 h-8 ml-auto"
          style={{ color: "#ef4444" }}
        >
          Stop
        </GlassButton>
      </div>

      {feedback.kind === "error" && (
        <p role="alert" className="g-error mt-1 text-xs">
          {feedback.message}
        </p>
      )}

      {confirmingStop && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50" role="dialog" aria-modal="true">
          <GlassCard className="p-4 max-w-xs w-full mx-4">
            <p className="g-t1 text-sm font-medium mb-1">Batalkan print?</p>
            <p className="g-t3 text-xs mb-4">Proses akan dihentikan, tidak bisa diulang kembali.</p>
            <div className="flex gap-2">
              <GlassButton
                onClick={() => setConfirmingStop(false)}
                className="flex-1 text-xs"
                style={{ background: "#10b981", color: "#fff" }}
              >
                Tidak
              </GlassButton>
              <GlassButton
                onClick={() => {
                  setConfirmingStop(false);
                  void send({ kind: "stop" });
                }}
                className="flex-1 text-xs"
                style={{ background: "#ef4444", color: "#fff" }}
              >
                Ya, batalkan
              </GlassButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/agent && pnpm exec vitest run src/renderer/components/PrinterControls.test.tsx`
Expected: PASS (all 15 tests)

- [ ] **Step 5: Typecheck**

Run: `cd apps/agent && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/renderer/components/PrinterControls.tsx apps/agent/src/renderer/components/PrinterControls.test.tsx
git commit -m "feat(agent): add PrinterControls component (pause/resume/stop/speed per state)"
```

---

### Task 5: Wire `PrinterControls` into `DashboardScreen` + status-badge fix

**Files:**
- Modify: `apps/agent/src/renderer/screens/DashboardScreen.tsx`
- Test: `apps/agent/src/renderer/screens/DashboardScreen.test.tsx`

**Interfaces:**
- Consumes: `PrinterControls` from Task 4, `PrinterRow.connector` from Task 1.

- [ ] **Step 1: Write the failing tests**

In `apps/agent/src/renderer/screens/DashboardScreen.test.tsx`, first update the shared default mock in the top-level `beforeEach` (the `getSnapshot` mock) to include the new `connector` field, so every pre-existing test keeps working against a realistic payload shape:

```ts
    getSnapshot: vi.fn().mockResolvedValue({ payload: [{ id: "abc1234567", name: "Printer A", type: "bambu", connector: "bambu", state: "running", progress: 45, remaining_min: 30, filename: "box.gcode", error_msg: "", last_seen: "2026-07-29T10:00:00Z", nozzle_temp: 219, bed_temp: 60 }] }),
```

Then add these new tests at the end of the `describe("DashboardScreen", ...)` block, right before its closing `});`:

```tsx
  it("kartu printer render PrinterControls -- deviceId/state/connector dari payload dioper ke bawah", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", connector: "bambu", state: "running", progress: 45, remaining_min: 30, filename: "box.gcode", error_msg: "", error_message: "", last_seen: null, nozzle_temp: 219, bed_temp: 60 }],
    });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^stop$/i })).toBeTruthy());
    expect(screen.getByRole("button", { name: /pause/i })).toBeTruthy();
    expect(screen.getByLabelText(/kecepatan print/i).tagName).toBe("SELECT");
  });

  it("state pause TAPI error_message ada -> badge status warna error, bukan info netral (kasus AMS habis/Uranus)", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", connector: "bambu", state: "pause", progress: 30, remaining_min: 10, filename: "box.gcode", error_msg: "x", error_message: "AMS filament ran out.", last_seen: null, nozzle_temp: 219, bed_temp: 60 }],
    });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/pause — 30%/i)).toBeTruthy());
    expect(screen.getByText(/pause — 30%/i).className).toContain("g-error");
  });

  it("state pause TANPA error_message -> badge status tetap warna info netral (pause manual biasa, bukan regresi)", async () => {
    (window as any).agentApi.getSnapshot.mockResolvedValue({
      payload: [{ id: "abc1234567", name: "Printer A", type: "P1S", connector: "bambu", state: "pause", progress: 30, remaining_min: 10, filename: "box.gcode", error_msg: "", error_message: "", last_seen: null, nozzle_temp: 219, bed_temp: 60 }],
    });
    render(<DashboardScreen />);
    await waitFor(() => expect(screen.getByText(/pause — 30%/i)).toBeTruthy());
    expect(screen.getByText(/pause — 30%/i).className).toContain("g-info");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/agent && pnpm exec vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: FAIL — no `PrinterControls` rendered yet (no "Pause"/"Stop" buttons, no speed select), and the badge color assertions fail (still using plain `statusColorClass(p.state)`).

- [ ] **Step 3: Wire it in**

In `apps/agent/src/renderer/screens/DashboardScreen.tsx`, add the import:

```tsx
import { PrinterControls } from "../components/PrinterControls";
```

Change the status badge's class expression from `statusColorClass(p.state)` to derive from `error_message` presence first:

```tsx
              <span className={`flex-shrink-0 text-sm ${statusColorClass(p.error_message ? "error" : p.state)}`}>
                {p.state} — {p.progress}%
              </span>
```

(only the `statusColorClass(...)` argument changes — the displayed text `{p.state} — {p.progress}%` stays exactly as-is, still showing the raw `state` value; only the color is derived differently)

Add `<PrinterControls>` after the temperature row and before the existing `error_message` paragraph:

```tsx
            <div className="mt-2 flex items-center justify-between">
              <span className="g-t3 text-xs">
                Nozzle {p.nozzle_temp}°C · Bed {p.bed_temp}°C
              </span>
            </div>
            <PrinterControls deviceId={p.id} state={p.state} connector={p.connector} />
            {p.error_message && (
              <p role="alert" className="g-error mt-2 text-xs">
                {p.error_message}
              </p>
            )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/agent && pnpm exec vitest run src/renderer/screens/DashboardScreen.test.tsx`
Expected: PASS. If any *pre-existing* test in this file now fails because `PrinterControls` renders extra buttons that collide with an existing query, narrow that pre-existing query (e.g. scope it with `within(...)` on the specific card, or make the name regex more specific) rather than deleting coverage -- do not change `PrinterControls`' own behavior to work around it.

- [ ] **Step 5: Run the full apps/agent suite + typecheck**

Run: `cd apps/agent && pnpm exec vitest run && pnpm exec tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/renderer/screens/DashboardScreen.tsx apps/agent/src/renderer/screens/DashboardScreen.test.tsx
git commit -m "feat(agent): wire PrinterControls into DashboardScreen + status-badge reflects error_message"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full monorepo test suite**

Run: `pnpm turbo test`
Expected: all packages pass (note: `bambu-connector.test.ts`'s very first pre-existing test has shown occasional flakiness unrelated to this feature in the past -- if only that one test fails, re-run it in isolation before treating it as a regression).

- [ ] **Step 2: Typecheck both touched apps**

Run: `pnpm --filter @3pb/agent exec tsc --noEmit && pnpm --filter @3pb/printer-monitor-core exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build of apps/agent (main+preload+renderer)**

Run: `cd apps/agent && pnpm exec electron-vite build`
Expected: builds cleanly. Clean up afterwards: `rm -rf apps/agent/out` (build artifact, not meant to be committed).

- [ ] **Step 4: Manual smoke check against the spec**

Re-read `docs/superpowers/specs/2026-08-10-agent-printer-control-design.md` section by section and confirm each requirement has a corresponding implemented+tested behavior:
- Command types + connector field (Task 1) ✓
- Connector/Engine write path, both brands (Task 2) ✓
- IPC channel (Task 3) ✓
- State-driven button visibility, Speed variant per connector, Stop confirmation copy/colors, command feedback (Task 4/5) ✓
- Status badge reflects `error_message` (Task 5) ✓

- [ ] **Step 5: Commit if step 3's build left any stray tracked-file changes (it shouldn't -- `out/` is gitignored)**

Run: `git status --short apps/agent packages/printer-monitor-core` -- expect no output. If there is output, investigate before proceeding (do not blindly commit).
