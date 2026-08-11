# Agent Desktop — Broker Authentication

## Goal

Close the "anyone on the customer's LAN can connect to the embedded MQTT broker" hole in `apps/agent` (go-public-readiness audit blocker #2) with a single shared PIN, without adding setup steps for the user.

## Scope

In scope: authenticating connections to the Agent's embedded Aedes broker (`apps/agent/src/main/broker.ts`) — both the physical CYD device(s) over LAN and the Agent's own internal MQTT publishers.

Out of scope:
- Per-topic authorization (ACL) — once a client presents the right PIN it can publish/subscribe anywhere, same as today. The threat this spec closes is "a stranger can connect at all," not "an already-connected device can do too much." ACL becomes relevant when the CYD command-channel (Pause/Resume/Stop from a physical CYD, relayed from the firmware session) gets built — a separate future spec.
- Multi-device CYD support (multiple physical units, each with its own layout and printer subset — e.g. "Kamar" showing 2 printers, "Ruang Tamu" showing 3 others). Confirmed via `CydLayout.userId @id` in `apps/saas/prisma/schema.prisma:127` that layout config is one row per account today, not per physical device. Noted by the user as a real future need, tracked separately, not blocking or shaped by this spec — the single-shared-PIN design below works identically regardless of how many physical CYDs exist.
- TLS. A shared PIN over plain MQTT is the right tradeoff for a LAN-only home/workshop broker — TLS would require certificate distribution to a device with no browser and a tiny on-screen keyboard, solving a threat (network eavesdropping) this product's threat model doesn't prioritize over setup simplicity.

## PIN design

**4-digit numeric PIN** (0000–9999, 10,000 possibilities) — short enough to type comfortably on the CYD's on-screen keyboard. The data behind this broker (printer status, layout) isn't highly sensitive and the connection is LAN-only by nature, so the low entropy is an accepted, deliberate tradeoff (user's explicit call) — offset by the rate limiting below, not by a longer PIN.

**Rate limiting makes the short PIN practical to accept:** track failed `authenticate` attempts per source IP in-memory (a `Map<string, {count, lockedUntil}>` in `broker.ts`, no persistence needed — resets on Agent restart). After 5 failed attempts within 60 seconds from the same IP, reject all further connection attempts from that IP for 60 seconds, regardless of whether the PIN presented is correct. At that ceiling, brute-forcing all 10,000 combinations from a single source takes on the order of tens of hours (10,000 ÷ 5 attempts ≈ 2,000 lockout cycles × 60s ≈ 33 hours minimum) — not bulletproof, but enough to deter casual LAN snooping, which is the actual threat this closes. A legitimate device that mistypes the PIN 5 times in a row waits out one 60-second cooldown and retries — an acceptable, self-resolving inconvenience.

## Token lifecycle

- **Generated once**, the first time the broker starts and no PIN is found in storage. Stored via the existing `credential-store.ts` (`safeStorage`, OS-level encryption) — the same mechanism already used for printer access codes, not a new storage location.
- **Displayed in `DashboardScreen.tsx`**, right next to the existing "Alamat broker (ketik ini di setup WiFi CYD)" line — the user already manually transcribes IP:port into the CYD's setup screen today; the PIN becomes one more field copied in the same step, not a separate flow.
- **No "regenerate" UI in this pass.** If the PIN needs to change (suspected compromise), deleting the stored credential and restarting the Agent regenerates it — an acceptable manual escape hatch for a scenario expected to be rare, avoiding UI for it now.

## Enforcement

`apps/agent/src/main/broker.ts`: add an `authenticate` handler to the `Aedes` instance before `server.listen()`. It:
1. Checks the source IP against the rate-limit map; if locked out, reject immediately (no PIN comparison).
2. Compares the presented `password` against the stored PIN. `username` is not checked (MQTT requires the field to exist, but this design gives it no meaning — any value is accepted).
3. On failure, increments that IP's failure counter (starting/refreshing the 60s window) and rejects.
4. On success, clears that IP's failure counter and accepts.

## Internal call sites need updating too

Two places inside the Agent's own main process connect to its own broker at `mqtt://127.0.0.1:<port>` and, once `authenticate` is added, would otherwise be rejected like any unauthenticated client:

- `packages/printer-monitor-core/src/reporters/mqtt.ts` (`MqttReporter`, publishes printer status) — used for connecting to the embedded broker specifically (this same class is also reused for the internal homelab service's separate, unrelated broker, so the fix must be an optional credential, not a hardcoded requirement).
- `apps/agent/src/main/layout-publisher.ts` (`publishLayout`, publishes CYD layout config).

Both need the stored PIN passed as MQTT `password` when connecting to the local broker.

## Testing

- `broker.ts`: unit tests using a real client connection (mirroring the existing `bambu-connector.test.ts` pattern of a real embedded broker, not a mock) — correct PIN connects, wrong PIN rejected, 5 failures from one IP locks out further attempts (correct or not) for the cooldown window, a different source IP is unaffected by another IP's lockout, cooldown expiring allows retry.
- `MqttReporter` / `layout-publisher.ts`: verify the PIN is passed as `password` when connecting to the embedded broker.
- `DashboardScreen.tsx`: PIN displayed alongside broker IP:port.
- `credential-store.ts`: PIN generated once and persisted; a second broker start reuses the stored PIN rather than generating a new one.
