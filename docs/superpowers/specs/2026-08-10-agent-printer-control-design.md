# Agent Desktop — Printer Control (Pause/Resume/Stop/Speed)

## Goal

Let a user pause, resume, stop, and adjust print speed directly from a printer card in `apps/agent`'s Dashboard, for both Bambu (MQTT) and Klipper/Moonraker (REST) printers.

## Scope

Agent Desktop only (`apps/agent` + `packages/printer-monitor-core`). CYD firmware control is explicitly out of scope for this spec — a separate sub-project, brainstormed independently, in a different repo (`3pb-monitoring-display`) with very different memory constraints.

Camera view is a separate spec, not covered here.

## Architecture

The read pipeline (`Connector.start()`/`stop()` → `Engine` → `Reporter`) is currently one-directional. This adds a parallel write path.

### New types (`packages/printer-monitor-core/src/engine.ts` + `types.ts`)

```ts
export type PrinterCommand =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'stop' }
  | { kind: 'setSpeedLevel'; level: 1 | 2 | 3 | 4 }   // Bambu: Silent/Standard/Sport/Ludicrous
  | { kind: 'setSpeedPercent'; percent: number }       // Moonraker: free percentage via M220

export type CommandResult = { ok: true } | { ok: false; message: string }
```

Speed is split into two command kinds (not one generic `value` field) so each connector only ever receives commands it can act on — a printer's UI only ever sends the kind that matches its own connector.

### `Connector` interface extension

```ts
export interface Connector {
  readonly deviceId: string
  start(onStatus: (s: NormalizedStatus) => void): void | Promise<void>
  stop(): void | Promise<void>
  sendCommand(cmd: PrinterCommand): Promise<CommandResult>   // NEW
}
```

### `Engine.sendCommand(deviceId, cmd)`

Looks up the connector for `deviceId` (new `connectorById` map built in the constructor, mirroring the existing `deviceById`), delegates to `connector.sendCommand(cmd)`. Device not currently monitored → `{ ok: false, message: 'device_not_found' }` without touching any connector.

### Connector implementations

**`BambuMqttConnector.sendCommand()`** — publishes to `device/<serial>/request`:

| kind | payload |
|---|---|
| `pause` | `{"print":{"sequence_id":"0","command":"pause"}}` |
| `resume` | `{"print":{"sequence_id":"0","command":"resume"}}` |
| `stop` | `{"print":{"sequence_id":"0","command":"stop"}}` |
| `setSpeedLevel` | `{"print":{"sequence_id":"0","command":"print_speed","param":"<level>"}}` |

MQTT publish is fire-and-forget (no application-level ack from the printer). If the client isn't currently connected, return `{ ok: false, message: 'printer_offline' }` immediately without attempting to publish. Otherwise resolve `{ ok: true }` once the publish succeeds at the transport layer — this confirms the command was *sent*, not that the printer *acted on it*. The actual effect shows up through the next normal status poll, same as every other status change in this system.

**`MoonrakerConnector.sendCommand()`** — synchronous HTTP:

| kind | request |
|---|---|
| `pause` | `POST /printer/print/pause` |
| `resume` | `POST /printer/print/resume` |
| `stop` | `POST /printer/print/cancel` |
| `setSpeedPercent` | `POST /printer/gcode/script` body `{"script":"M220 S<percent>"}` |

Resolve `{ ok: true }` only on a 2xx response. Non-2xx or a network/timeout error → `{ ok: false, message: <reason> }`.

**Command kinds a connector doesn't understand** (e.g. `setSpeedPercent` sent to a Bambu connector) — the UI never sends these in practice, since the Speed control variant is driven by `connector`, but each `sendCommand()` implementation must still handle it defensively: return `{ ok: false, message: 'unsupported_command' }` rather than throwing or silently no-op-ing.

### New field: `connector` on `PrinterRow`/`StoredState`

`PrinterRow` (the payload `DashboardScreen` reads via `agent:get-snapshot`, and the same shape published to MQTT for CYD) currently carries `type` (model string, e.g. `"P1S"`) but not which connector kind produced it. The renderer needs this to pick the right Speed control (dropdown vs. slider).

Add `connector: 'bambu' | 'moonraker'` as an **additive** field to `PrinterRow` and `StoredState`, sourced from `DeviceConfig.connector` (already known) and threaded through `state-store.ts`'s `upsertFromStatus()`. Same pattern already used for `nozzle_temp`/`bed_temp`/`error_message` — the CYD wire contract's existing fields are untouched, older firmware that doesn't know this field ignores it.

### New IPC channel

`agent:printer-command` (`main/ipc.ts` + `preload/index.ts`): renderer calls `window.agentApi.sendPrinterCommand(deviceId, cmd): Promise<CommandResult>`, which invokes `getEngine()?.sendCommand(deviceId, cmd) ?? { ok: false, message: 'engine_not_running' }`.

## UI (`DashboardScreen.tsx`)

### State → visible controls

Buttons change based on `PrinterRow.state` (lowercased), not a fixed always-shown set:

| state | controls |
|---|---|
| `running` | Pause, Speed control, Stop |
| `pause` / `paused` | Resume, Stop (no Speed — adjusting speed mid-pause isn't meaningful) |
| `error` | Resume, Stop (no Speed) |
| `idle` / `finish` / `offline` / anything else | none |

`error` shows Resume rather than Stop-only: a printer reporting a real Klipper/Bambu error isn't necessarily unrecoverable, and if Resume genuinely doesn't apply, the command just fails gracefully into the existing inline-error UI (see Command feedback below) rather than doing anything destructive. This mirrors CYD firmware's independent decision to show Resume+Stop on its own `error` classification (confirmed via cross-session relay 2026-08-10, `local_5fab98c6-1a47-4b43-ac65-8be641ab67c7`) — the two arrived at the same answer from different codebases, not by copying one implementation into the other.

Note: the common "AMS ran out"/`print_error≠0` case (e.g. printer "Uranus" P1S) is **not** a literal `error` state — Bambu genuinely reports `gcode_state=PAUSE` for it (confirmed via live MQTT capture, `packages/printer-monitor-core` commit `0b9f90f`). It already lands in the `pause` row above, which already shows Resume — no special-casing needed.

### Status badge color reflects `error_message`, not just literal `state`

Today `statusColorClass(state)` only looks at the literal state string, so a `pause`-with-`error_message` printer (Uranus case) renders with the same neutral "paused" color as a printer the user paused themselves — indistinguishable at a glance, even though the human-readable error text is already shown below the card.

Fix: if `error_message` is non-empty, use the `g-error` (red) badge color regardless of whether the literal state is `pause` or `error`. Otherwise fall back to the existing `statusColorClass` logic unchanged. This is a display-only derivation — it does not change `state` itself, and does not affect the button-visibility table above (which already treats `pause` and `error` identically).

### Speed control varies by `connector`

- **`bambu`**: 4 fixed options (Silent / Standard / Sport / Ludicrous), dropdown or segmented control, mapped to `setSpeedLevel` 1–4.
- **`moonraker`**: range slider, 20%–200%, step 10%, percent label, mapped to `setSpeedPercent`.

### Stop confirmation

Clicking Stop never sends the command directly — it opens a confirmation:

- **"Ya, batalkan"** — danger/red styling, with caption "Proses akan dihentikan, tidak bisa diulang kembali."
- **"Tidak"** — success/green styling.

High contrast is deliberate (user's explicit choice) even though it inverts the usual "danger = red confirm, cancel = neutral" convention. Only confirming "Ya" sends the `stop` command.

### Command feedback

Per-card local state: `idle | sending | { error: string }`.

- On any control click: disable all controls on that card, mark `sending`.
- On `{ ok: true }`: back to `idle`. No optimistic state update — the printer's actual new state shows up via the existing 5-second poll, same as the current Sync button's behavior.
- On `{ ok: false, message }`: show an inline `role="alert"` message in the existing `g-error` style, persists until the next action on that card (same pattern as the existing Sync error display).

## Testing

- `bambu-mqtt.test.ts` / `moonraker.test.ts`: `sendCommand()` payload/method per command kind, offline/network-failure → correct `CommandResult`.
- `engine.test.ts`: `sendCommand()` delegates to the right connector by `deviceId`; unknown device → `device_not_found`.
- `ipc.test.ts`: new `agent:printer-command` handler wiring.
- `DashboardScreen.test.tsx`: button visibility per state (running/paused/error/idle/offline/finish), Speed control variant per `connector`, Stop confirm flow (cancel leaves state untouched; confirm sends `stop`), controls disabled while `sending`, inline error display on failure, badge color driven by `error_message` presence independent of literal state.

## Out of scope

- CYD firmware control (separate sub-project/repo, separate brainstorm).
- Camera view (separate spec).
- Any change to the raw `state` value itself, or to what gets published to MQTT/CYD — only additive fields and display-only derivations.
