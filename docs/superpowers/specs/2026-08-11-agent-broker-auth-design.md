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

- **Generated once**, the first time the broker starts and no PIN is found in storage. Stored via the existing `credential-store.ts` (`safeStorage`, OS-level encryption) — the same mechanism already used for printer access codes, not a new storage location. `CredentialBlob` gains a new optional field `brokerPin?: string` (stored zero-padded, e.g. `"0042"` — as a string, not a number, so leading zeros survive). Generated with `crypto.randomInt(0, 10000)`, not `Math.random`.
- **Displayed in `DashboardScreen.tsx`**, right next to the existing "Alamat broker (ketik ini di setup WiFi CYD)" line — flows through the existing `agent:get-broker-info` IPC call (already polled every 5s), whose return shape gains a `pin` field. The user already manually transcribes IP:port into the CYD's setup screen today; the PIN becomes one more field copied in the same step, not a separate flow.
- **No "regenerate" UI in this pass** — no button in Settings/Dashboard. But see "Safe PIN bootstrap" below: even without a UI trigger, the underlying mechanism for ever clearing a stored PIN must be a narrow, field-scoped operation on the existing blob, never "delete the whole credential file." `credentials.enc` is a single blob holding `agentToken` and every paired printer's `DeviceSecret` — deleting the file to reset the PIN would also force the user through SaaS re-activation and re-pairing every printer, which is a wildly disproportionate reset for "I want a new PIN." Add a narrow `clearBrokerPin(blob): CredentialBlob` helper in `credential-store.ts` (pure function, no I/O) that a future regenerate action — or, until then, manual support guidance — calls before `saveCredentials()`, instead of touching the file directly.

## Safe PIN bootstrap (do not skip — real data-loss risk otherwise)

`loadCredentials()` (`credential-store.ts:22-34`) intentionally never throws: no file, `safeStorage` unavailable, and a corrupted/undecryptable file *all* collapse to the same `EMPTY_BLOB` return value. That's fine for its current only caller (`ipc.ts`'s user-triggered pairing flow, where an empty result just means "ask the user to pair again"). It is **not** fine for PIN bootstrap, which runs unattended on every startup: naively doing `if (!blob.brokerPin) { blob.brokerPin = generate(); await saveCredentials(blob) }` would, on a genuine decrypt failure of an *existing* file (corrupted write, OS keychain hiccup, etc.), silently overwrite that file with a blob containing only the new PIN — permanently destroying the user's `agentToken` and every paired printer's `DeviceSecret`. This is the first credential-store write path that runs automatically with no user action in the loop; every existing write is user-triggered (pairing, forgetting a device), so this class of bug hasn't existed here before.

The bootstrap logic must distinguish "genuinely first run" from "a file exists but couldn't be read," and only auto-persist in the first case. It must **also** check `safeStorage.isEncryptionAvailable()` itself before attempting to persist — `saveCredentials()` calls `safeStorage.encryptString()` unconditionally, which throws if encryption isn't available (e.g. Linux with no keyring). This is a real gap a second reviewer caught: a fresh install (`fileExists === false`) on such a machine would otherwise hit an unhandled throw inside broker startup, not just the corrupted-file case:

```
async function ensureBrokerPin(): Promise<string> {
  const fileExists = fs.existsSync(credentialFilePath()); // check BEFORE loadCredentials collapses the distinction
  const blob = await loadCredentials();
  if (blob.brokerPin) return blob.brokerPin;

  const pin = generatePin();
  const canPersist = fileExists === false && safeStorage.isEncryptionAvailable();
  if (!canPersist) {
    // Either a file exists but came back without a PIN (loadCredentials() cannot tell us
    // whether decrypt genuinely failed -- real agentToken/devices data at risk -- or the file
    // just predates this feature, so never assume the latter and overwrite), OR encryption
    // itself isn't available on this machine, so saveCredentials() would throw. Never log the
    // PIN value itself here -- only that bootstrap fell back to session-only mode.
    console.error("[broker] cannot safely persist a new PIN (existing unreadable file, or encryption unavailable) -- using a session-only PIN this run");
    return pin; // in-memory only for this run; CYD needs the PIN re-entered if this repeats
  }
  await saveCredentials({ ...blob, brokerPin: pin }); // blob is EMPTY_BLOB here, safe to write
  return pin;
}
```

The in-memory-only fallback means a genuinely corrupted credential file, or a machine without OS-level encryption, produces a new PIN on every restart (mildly annoying — CYD needs re-provisioning each time) instead of silently destroying the user's activation and every printer pairing, or crashing broker startup outright. That trade is correct. The PIN value itself must never be written to logs or debug output anywhere in this feature — only its presence/absence.

## Enforcement

`apps/agent/src/main/broker.ts`: `startBroker(port, pin)` takes the PIN as a parameter (resolved by `ensureBrokerPin()` in `bootstrap()`/`index.ts` before calling it) rather than loading credentials itself — keeps `broker.ts` free of an `electron` import, so its existing tests (real embedded-broker style, no electron mocking) keep working unchanged for the new auth tests too.

Add an `authenticate` handler to the `Aedes` instance before `server.listen()`. It:
1. Normalizes the source IP (`client.conn.remoteAddress`) to a loopback/non-loopback classification: strip the `::ffff:` IPv4-mapped-IPv6 prefix (so `::ffff:127.0.0.1` normalizes to `127.0.0.1`), **and separately treat the literal native IPv6 loopback `::1` as loopback too** — it does not share the `::ffff:` prefix and needs its own check, not just the strip. Anything not matching one of these two loopback forms is a plain non-loopback map key.
2. Check the (non-loopback) key against the rate-limit map. If a locked-out entry is found and `now < lockedUntil`, reject immediately — **do not compare the PIN, and do not touch the failure counter or `lockedUntil` for this rejection.** A lockout rejection must never extend its own lockout; only a genuine PIN comparison (step 4) affects the counter. This matters in practice: CYD's connect-retry loop fires every few seconds, so a real device that trips a lockout must be able to count down and reconnect once it expires, not get its window silently renewed by its own retries. If an entry is found but `now >= lockedUntil` (the cooldown has expired), treat it as a fresh start — delete the entry before proceeding to step 4 rather than reusing its stale count, so the client gets a full new 5-attempt budget, not an immediate re-lockout after one more failure.
3. **Loopback exemption:** if the normalized address matched loopback in step 1, skip rate-limiting entirely — still require the correct PIN (step 4), just never lock this address out. This is the Agent's own process (`MqttReporter`/`layout-publisher.ts`) reconnecting to itself; the LAN-stranger threat this spec defends against cannot originate from loopback, so there's no reason a transient local reconnect burst (e.g. right after a Sync restarts the Engine) should ever ratchet toward a lockout.
4. For non-loopback IPs: compare the presented `password` against the stored PIN. `username` is not checked for its value, but MQTT requires the CONNECT packet's username flag to be set for the password to be transmitted at all by most client libraries — the CYD firmware side must send a non-empty placeholder username alongside the real PIN as password (see "Coordination needed with CYD firmware" below).
5. On failure: increment that IP's failure counter, refresh `lockedUntil` to `now + 60s` once the count reaches 5, and reject.
6. On success: remove that IP's entry from the map entirely (not just reset to 0 — a stale expired entry left in the map is harmless either way, but removing keeps the map from growing unbounded across long uptimes with many transient reconnects) and accept.

**Accepted limitation, not fixed here:** this rate limit is per-source-IP, so an attacker who can present many distinct source IPs on the same LAN (e.g. from several machines, or spoofed source addresses if the network permits it) divides the ~33-hour single-IP brute-force bound by however many IPs they use — there is no global cross-IP attempt budget. Adding one would trade this away against a risk of a burst of legitimate reconnects (e.g. many CYDs during a network hiccup) tripping a shared budget and locking out everyone at once. For a LAN-only home/workshop threat model, an adversary who already controls multiple hosts on the customer's own network has capabilities well beyond what this PIN is meant to defend against — noted here as a conscious scope boundary, not an oversight.

## Internal call sites need updating too

Two places inside the Agent's own main process connect to its own broker at `mqtt://127.0.0.1:<port>` and, once `authenticate` is added, would otherwise be rejected like any unauthenticated client (mitigated in practice by the loopback rate-limit exemption above, but they still need to present the correct PIN — that exemption only means they can't get locked out, not that they're exempt from authenticating):

- `packages/printer-monitor-core/src/reporters/mqtt.ts` (`MqttReporter`, publishes printer status) — used for connecting to the embedded broker specifically (this same class is also reused for the internal homelab service's separate, unrelated broker, so the fix must be an optional credential, not a hardcoded requirement).
- `apps/agent/src/main/layout-publisher.ts` (`publishLayout`, publishes CYD layout config).

**No cross-package import is needed for either** — `packages/printer-monitor-core` never touches `credential-store.ts` or knows anything about PIN bootstrap. `MqttReporterOpts` (in `packages/printer-monitor-core`) simply gains a new optional field, e.g. `password?: string`, used in `connect()`'s `mqtt.connect(url, { password, ... })` call exactly like the existing `url` option — a plain constructor parameter, not a shared secret store. The PIN flows in from whoever constructs the reporter: `apps/agent/src/main/engine-manager.ts` (the only place inside this repo that constructs `MqttReporter` against the embedded broker) already has the PIN in scope from `ensureBrokerPin()`/`app-state.ts` by the time it builds the options object, and passes it straight through. `layout-publisher.ts` takes the same PIN as a function parameter, alongside the `brokerPort` it already receives, and adds it to `mqtt.connectAsync()`'s options the same way.

## Coordination needed with CYD firmware (separate repo, tracked here so it isn't silently forgotten)

The CYD firmware repo (`3pb-monitoring-display`) needs matching changes before this spec's Agent-side auth can go live without breaking existing deployed units:

- **New PIN field in the AP-mode captive portal provisioning UI**, alongside the existing broker IP:port field (per `docs/superpowers/specs/2026-07-18-cyd-wifi-provisioning-design.md` §3.3), saved to NVS the same way.
- **PubSubClient must send the PIN as the MQTT CONNECT password**, with a non-empty placeholder username (MQTT client libraries generally only transmit the password field when the username flag is set).
- **On-screen distinction between "wrong PIN" and "broker unreachable."** Today a failed connection is an undifferentiated silent retry loop; once wrong-PIN becomes a real failure mode a user can actually cause (typo during setup), the CYD screen needs to say so specifically rather than leaving the user guessing why the device never leaves "Menyambungkan...".
- **Rollout ordering risk:** an Agent updated to enforce auth will silently stop serving any CYD still running firmware without PIN support — that CYD keeps retrying forever with no way to know why. This needs either a coordinated release (firmware ships and existing units get re-provisioned before/alongside the Agent update that enables enforcement) or a temporary grace mode, decided with the firmware session before this ships — not something this spec can resolve unilaterally since the firmware repo and its release process belong to a different session/context.

## Testing

- `broker.ts`: unit tests using a real client connection (mirroring the existing `bambu-connector.test.ts` pattern of a real embedded broker, not a mock) — correct PIN connects, wrong PIN rejected, 5 failures from one non-loopback IP locks out further attempts (correct or not) for the cooldown window without extending it further, a different source IP is unaffected by another IP's lockout, cooldown expiring resets the counter to a fresh 5-attempt budget (not a partial one) and allows retry, and both `127.0.0.1` and native `::1` never get locked out regardless of failure count (still require the correct PIN, just never rate-limited).
- `credential-store.ts` / PIN bootstrap: PIN generated once and persisted on genuine first run (no file, encryption available); a second broker start reuses the stored PIN rather than generating a new one; a file that exists but fails to load produces an in-memory-only PIN and does **not** call `saveCredentials()`; encryption unavailable on a genuine first run (no file) also produces an in-memory-only PIN and does **not** call `saveCredentials()` (assert `saveCredentials` was never invoked in either fallback path, not just that the returned PIN differs).
- `MqttReporter` / `layout-publisher.ts`: verify the PIN is passed as `password` (with a placeholder `username`) when connecting to the embedded broker.
- `DashboardScreen.tsx`: PIN displayed alongside broker IP:port, sourced from the extended `agent:get-broker-info` IPC response.
