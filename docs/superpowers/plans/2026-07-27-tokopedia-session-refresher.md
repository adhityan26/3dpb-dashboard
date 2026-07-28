# Tokopedia Session Refresher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Docker service that automatically refreshes the Tokopedia Seller Center session cookie (via TikTok-delegated login) before it expires, notifying via WhatsApp on failure, with VNC access for manual recovery.

**Architecture:** New `services/tokopedia-session-refresher/` package (Node.js/TS, mirrors `services/printer-monitor`), running Playwright against a persistent browser profile inside a Docker container that also runs Xvfb+x11vnc+noVNC for manual access. A small, backward-compatible auth change to `apps/dashboard`'s existing Tokopedia session API lets this headless service call it.

**Tech Stack:** Node.js 22, TypeScript, Playwright, Vitest, pnpm workspace (`services/*` already registered in `pnpm-workspace.yaml`).

Spec: `docs/superpowers/specs/2026-07-27-tokopedia-session-refresher-design.md`

## Global Constraints

- Node 22 (repo `.nvmrc`), pnpm `10.12.1` (root `package.json` `packageManager` field).
- No Tokopedia username/password stored anywhere — only the browser profile's TikTok session and the resulting Tokopedia cookies.
- `apps/dashboard`'s `/api/tokopedia/session` request/response shapes (`POST` body `{cookies: {name,value}[]}` → `{ok:true, sellerId, appId, updatedAt, tokenExpiry}`; `GET` → `{exists, sellerId?, updatedAt?, tokenExpiry?, expired?}`) must NOT change — only the auth check gains an additional accepted path (`X-Internal-Token` header), existing NextAuth-session behavior is untouched.
- `git add <path spesifik>` only — never `git add -A` (repo-wide rule, see `CLAUDE.md`).
- `services/*` is already a valid pnpm workspace glob — no `pnpm-workspace.yaml` change needed.
- wa-omni send endpoint shape is UNKNOWN until Task 4's exploration step — do not hardcode a guessed shape before that.
- Tokopedia+TikTok login flow selectors are UNKNOWN until Task 6's exploration step — do not hardcode selectors before that.

---

### Task 1: Scaffold service package + scheduler decision logic

**Files:**
- Create: `services/tokopedia-session-refresher/package.json`
- Create: `services/tokopedia-session-refresher/tsconfig.json`
- Create: `services/tokopedia-session-refresher/vitest.config.ts`
- Create: `services/tokopedia-session-refresher/src/config.ts`
- Create: `services/tokopedia-session-refresher/src/scheduler.ts`
- Test: `services/tokopedia-session-refresher/src/scheduler.test.ts`

**Interfaces:**
- Produces: `loadConfig(): RefresherConfig` (types: `{dashboardUrl: string; internalServiceToken: string; checkIntervalHours: number; refreshThresholdHours: number; notifyCooldownHours: number; browserProfileDir: string; waOmniEndpoint: string; waOmniToken: string; waOmniTargetNumber: string}`), `shouldRefresh(tokenExpiryMs: number | null, nowMs: number, thresholdHours: number): boolean` — both consumed by Task 7 (`main.ts`).

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@3pb/tokopedia-session-refresher",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "dev": "tsx watch src/main.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "playwright": "^1.48.0",
    "tsx": "^4.19.2"
  },
  "devDependencies": { "typescript": "^5", "vitest": "^1.6.1", "@types/node": "^22" }
}
```

- [ ] **Step 2: Create tsconfig.json**

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

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', globals: true },
})
```

- [ ] **Step 4: Install dependencies**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
pnpm install --filter @3pb/tokopedia-session-refresher
```

Expected: installs succeed, `services/tokopedia-session-refresher/node_modules` created (or hoisted to root, depending on pnpm config — either is fine).

- [ ] **Step 5: Write the failing test for `shouldRefresh`**

Create `services/tokopedia-session-refresher/src/scheduler.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldRefresh } from './scheduler'

describe('shouldRefresh', () => {
  const HOUR = 60 * 60 * 1000

  it('token null (belum pernah ada sesi) -> true (perlu refresh)', () => {
    expect(shouldRefresh(null, Date.now(), 24)).toBe(true)
  })

  it('token sudah lewat expiry -> true', () => {
    const now = Date.now()
    expect(shouldRefresh(now - HOUR, now, 24)).toBe(true)
  })

  it('token masih jauh dari threshold -> false', () => {
    const now = Date.now()
    expect(shouldRefresh(now + 48 * HOUR, now, 24)).toBe(false)
  })

  it('token pas di bawah threshold -> true', () => {
    const now = Date.now()
    expect(shouldRefresh(now + 12 * HOUR, now, 24)).toBe(true)
  })

  it('token pas di atas threshold -> false', () => {
    const now = Date.now()
    expect(shouldRefresh(now + 25 * HOUR, now, 24)).toBe(false)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd services/tokopedia-session-refresher && npx vitest run src/scheduler.test.ts
```

Expected: FAIL with `Cannot find module './scheduler'` (or similar — file doesn't exist yet).

- [ ] **Step 7: Implement config.ts**

Create `services/tokopedia-session-refresher/src/config.ts`:

```ts
export interface RefresherConfig {
  dashboardUrl: string
  internalServiceToken: string
  checkIntervalHours: number
  refreshThresholdHours: number
  notifyCooldownHours: number
  browserProfileDir: string
  waOmniEndpoint: string
  waOmniToken: string
  waOmniTargetNumber: string
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} wajib diisi (env var kosong)`)
  return v
}

function envNumber(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function loadConfig(): RefresherConfig {
  return {
    dashboardUrl: requireEnv('DASHBOARD_URL'),
    internalServiceToken: requireEnv('INTERNAL_SERVICE_TOKEN'),
    checkIntervalHours: envNumber('CHECK_INTERVAL_HOURS', 4),
    refreshThresholdHours: envNumber('REFRESH_THRESHOLD_HOURS', 24),
    notifyCooldownHours: envNumber('NOTIFY_COOLDOWN_HOURS', 6),
    browserProfileDir: process.env.BROWSER_PROFILE_DIR ?? '/data/browser-profile',
    waOmniEndpoint: requireEnv('WA_OMNI_ENDPOINT'),
    waOmniToken: requireEnv('WA_OMNI_TOKEN'),
    waOmniTargetNumber: requireEnv('WA_OMNI_TARGET_NUMBER'),
  }
}
```

- [ ] **Step 8: Implement scheduler.ts**

Create `services/tokopedia-session-refresher/src/scheduler.ts`:

```ts
export function shouldRefresh(tokenExpiryMs: number | null, nowMs: number, thresholdHours: number): boolean {
  if (tokenExpiryMs == null) return true
  const thresholdMs = thresholdHours * 60 * 60 * 1000
  return tokenExpiryMs - nowMs <= thresholdMs
}
```

- [ ] **Step 9: Run test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd services/tokopedia-session-refresher && npx vitest run src/scheduler.test.ts
```

Expected: PASS, 5/5 tests.

- [ ] **Step 10: Commit**

```bash
git add services/tokopedia-session-refresher/package.json services/tokopedia-session-refresher/tsconfig.json services/tokopedia-session-refresher/vitest.config.ts services/tokopedia-session-refresher/src/config.ts services/tokopedia-session-refresher/src/scheduler.ts services/tokopedia-session-refresher/src/scheduler.test.ts pnpm-lock.yaml
git commit -m "feat(tokopedia-refresher): scaffold service package + shouldRefresh decision logic"
```

---

### Task 2: Notification cooldown logic

**Files:**
- Create: `services/tokopedia-session-refresher/src/notify.ts`
- Test: `services/tokopedia-session-refresher/src/notify.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `shouldNotify(lastNotifiedAtMs: number | null, nowMs: number, cooldownHours: number): boolean` — consumed by Task 7 (`main.ts`). (`sendFailureNotification` is added to this same file in Task 4.)

- [ ] **Step 1: Write the failing test**

Create `services/tokopedia-session-refresher/src/notify.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldNotify } from './notify'

describe('shouldNotify', () => {
  const HOUR = 60 * 60 * 1000

  it('belum pernah notify -> true', () => {
    expect(shouldNotify(null, Date.now(), 6)).toBe(true)
  })

  it('notify terakhir masih dalam cooldown -> false', () => {
    const now = Date.now()
    expect(shouldNotify(now - 2 * HOUR, now, 6)).toBe(false)
  })

  it('notify terakhir sudah lewat cooldown -> true', () => {
    const now = Date.now()
    expect(shouldNotify(now - 7 * HOUR, now, 6)).toBe(true)
  })

  it('notify terakhir pas di batas cooldown -> false (belum lewat)', () => {
    const now = Date.now()
    expect(shouldNotify(now - 6 * HOUR, now, 6)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd services/tokopedia-session-refresher && npx vitest run src/notify.test.ts
```

Expected: FAIL with `Cannot find module './notify'`.

- [ ] **Step 3: Implement shouldNotify in notify.ts**

Create `services/tokopedia-session-refresher/src/notify.ts`:

```ts
export function shouldNotify(lastNotifiedAtMs: number | null, nowMs: number, cooldownHours: number): boolean {
  if (lastNotifiedAtMs == null) return true
  const cooldownMs = cooldownHours * 60 * 60 * 1000
  return nowMs - lastNotifiedAtMs > cooldownMs
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd services/tokopedia-session-refresher && npx vitest run src/notify.test.ts
```

Expected: PASS, 4/4 tests.

- [ ] **Step 5: Commit**

```bash
git add services/tokopedia-session-refresher/src/notify.ts services/tokopedia-session-refresher/src/notify.test.ts
git commit -m "feat(tokopedia-refresher): shouldNotify cooldown logic"
```

---

### Task 3: Dashboard API — accept internal-service token alongside session auth

**Files:**
- Modify: `apps/dashboard/app/api/tokopedia/session/route.ts`
- Test: `apps/dashboard/app/api/tokopedia/session/__tests__/route.test.ts`
- Modify: `apps/dashboard/.env.example` (if it exists; create it with just this one line if it doesn't — check with `ls apps/dashboard/.env.example` first)

**Interfaces:**
- Produces: `GET`/`POST /api/tokopedia/session` now also accept header `X-Internal-Token: <value>` matching `process.env.INTERNAL_SERVICE_TOKEN` as an alternative to a logged-in session — consumed by Task 7 (`main.ts`, via HTTP calls, not a TS import).

**IMPORTANT:** work on this task in the `apps/dashboard` app, NOT in the new `services/` package. This task is in the EXISTING dashboard app.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/app/api/tokopedia/session/__tests__/route.test.ts` (new directory):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.fn()
const mockSaveSession = vi.fn()
const mockGetSessionStatus = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: () => mockAuth() }))
vi.mock('@/lib/tokopedia/session', () => ({
  saveSession: (cookies: unknown) => mockSaveSession(cookies),
  getSessionStatus: () => mockGetSessionStatus(),
}))

import { GET, POST } from '../route'

const ORIGINAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN

beforeEach(() => {
  mockAuth.mockReset(); mockSaveSession.mockReset(); mockGetSessionStatus.mockReset()
  process.env.INTERNAL_SERVICE_TOKEN = 'test-secret-token'
})

afterEach(() => {
  process.env.INTERNAL_SERVICE_TOKEN = ORIGINAL_TOKEN
})

function reqWithHeader(headerValue?: string): Request {
  const headers = new Headers()
  if (headerValue !== undefined) headers.set('X-Internal-Token', headerValue)
  return new Request('http://localhost/api/tokopedia/session', { headers })
}

describe('GET /api/tokopedia/session auth', () => {
  it('tanpa session dan tanpa header -> 401', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(reqWithHeader() as never)
    expect(res.status).toBe(401)
  })

  it('dengan session user -> lolos, panggil getSessionStatus (perilaku lama)', async () => {
    mockAuth.mockResolvedValue({ user: { id: '1' } })
    mockGetSessionStatus.mockResolvedValue({ exists: false })
    const res = await GET(reqWithHeader() as never)
    expect(res.status).toBe(200)
    expect(mockGetSessionStatus).toHaveBeenCalled()
  })

  it('tanpa session tapi header token cocok -> lolos', async () => {
    mockAuth.mockResolvedValue(null)
    mockGetSessionStatus.mockResolvedValue({ exists: false })
    const res = await GET(reqWithHeader('test-secret-token') as never)
    expect(res.status).toBe(200)
  })

  it('tanpa session, header token salah -> 401', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await GET(reqWithHeader('wrong-token') as never)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/tokopedia/session auth', () => {
  it('tanpa session dan tanpa header -> 401', async () => {
    mockAuth.mockResolvedValue(null)
    const req = new Request('http://localhost/api/tokopedia/session', {
      method: 'POST', body: JSON.stringify({ cookies: [] }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('header token cocok -> lolos, panggil saveSession', async () => {
    mockAuth.mockResolvedValue(null)
    mockSaveSession.mockResolvedValue({ sellerId: 's1', appId: 'a1', updatedAt: 'now', tokenExpiry: null })
    const headers = new Headers({ 'X-Internal-Token': 'test-secret-token' })
    const req = new Request('http://localhost/api/tokopedia/session', {
      method: 'POST', headers, body: JSON.stringify({ cookies: [{ name: 'SELLER_TOKEN', value: 'x' }] }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(200)
    expect(mockSaveSession).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx vitest run app/api/tokopedia/session/__tests__/route.test.ts
```

Expected: FAIL — current `GET`/`POST` don't check `X-Internal-Token` at all, so the "header token cocok -> lolos" tests fail with 401 instead of 200/200.

- [ ] **Step 3: Implement the auth accommodation**

Read the current full file first (`apps/dashboard/app/api/tokopedia/session/route.ts`) to confirm it still matches this plan's assumption (verbatim shown in the design spec's investigation — reproduced here for the edit). Replace its full content with:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { saveSession, getSessionStatus } from "@/lib/tokopedia/session"

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const session = await auth()
  if (session?.user) return true
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN
  const headerToken = req.headers.get("X-Internal-Token")
  return !!internalToken && !!headerToken && headerToken === internalToken
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await req.json().catch(() => null) as { cookies?: unknown } | null
  if (!body || !Array.isArray(body.cookies)) {
    return NextResponse.json({ error: "cookies harus berupa array dari EditThisCookies" }, { status: 400 })
  }
  try {
    const meta = await saveSession(body.cookies as { name: string; value: string }[])
    return NextResponse.json({ ok: true, ...meta })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal menyimpan session" }, { status: 400 })
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await getSessionStatus())
}
```

Note: `GET`'s signature changes from `export async function GET()` (no params) to `export async function GET(req: NextRequest)` — this is required so it can read the header. Next.js route handlers accept an optional `NextRequest` param on `GET`; this is a valid, standard signature.

- [ ] **Step 4: Run test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx vitest run app/api/tokopedia/session/__tests__/route.test.ts
```

Expected: PASS, 6/6 tests.

- [ ] **Step 5: Run full dashboard test suite + typecheck to confirm no regression**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd apps/dashboard && npx vitest run --passWithNoTests --exclude "**/.claude/**" && npx tsc --noEmit
```

Expected: all tests pass; typecheck shows only the pre-existing baseline errors unrelated to this change (VitestUtils/HookCleanupCallback issues in unrelated test files — check the count matches what existed before this change, don't just accept a higher number).

- [ ] **Step 6: Add INTERNAL_SERVICE_TOKEN documentation**

Check `ls apps/dashboard/.env.example`. If it exists, add a line: `INTERNAL_SERVICE_TOKEN=` with a comment above it: `# Shared secret for service-to-service calls (e.g. tokopedia-session-refresher) — generate with: openssl rand -hex 32`. If `.env.example` doesn't exist in `apps/dashboard`, skip this step (don't invent a new file convention not already used in this repo — check `apps/dashboard/.env.deploy.example` too, which the root `CLAUDE.md`/dashboard docs reference, and add the line there instead if that's the actual convention file).

- [ ] **Step 7: Commit**

```bash
git add "apps/dashboard/app/api/tokopedia/session/route.ts" "apps/dashboard/app/api/tokopedia/session/__tests__/route.test.ts"
git commit -m "feat(dashboard): accept X-Internal-Token header on Tokopedia session API for service-to-service calls"
```

(If Step 6 modified an env example file, add that path to this commit too.)

---

### Task 4: wa-omni send API — exploration + notification sender

**Files:**
- Modify: `services/tokopedia-session-refresher/src/notify.ts` (add `sendFailureNotification`)
- Test: `services/tokopedia-session-refresher/src/notify.test.ts` (add tests for the new function, mocking `fetch`)

**Interfaces:**
- Consumes: `RefresherConfig` fields `waOmniEndpoint`, `waOmniToken`, `waOmniTargetNumber` (Task 1).
- Produces: `sendFailureNotification(cfg: Pick<RefresherConfig, 'waOmniEndpoint' | 'waOmniToken' | 'waOmniTargetNumber'>, message: string): Promise<void>` — consumed by Task 7 (`main.ts`).

**This task starts with a live exploration step — do not write `sendFailureNotification`'s HTTP-calling code before completing Step 1.**

- [ ] **Step 1: Discover the wa-omni send endpoint**

The read endpoint is confirmed: `GET http://192.168.88.92:3020/api/conversations/${conversationId}` with bearer token `181fc281b1b8a737351f25869edd01cf9d8a4efd35c8f63b3b96450e1c8145dd` (from user's global CLAUDE.md config — treat this as a real working credential, not a placeholder). The send endpoint shape is NOT confirmed. Do this exploration:

```bash
# List available routes if the service exposes any self-documentation:
curl -s -H "Authorization: Bearer 181fc281b1b8a737351f25869edd01cf9d8a4efd35c8f63b3b96450e1c8145dd" http://192.168.88.92:3020/api/docs
curl -s -H "Authorization: Bearer 181fc281b1b8a737351f25869edd01cf9d8a4efd35c8f63b3b96450e1c8145dd" http://192.168.88.92:3020/api
curl -s -H "Authorization: Bearer 181fc281b1b8a737351f25869edd01cf9d8a4efd35c8f63b3b96450e1c8145dd" http://192.168.88.92:3020/openapi.json
```

If none of those return anything useful, check the actual wa-omni source running on VM `.92` (per the vault `3dprintingbandung`, path `/app/projects/wa-omni` on that VM — if you have SSH/kubectl-style access to inspect it, read its route definitions directly; otherwise try the conventional guess and verify by actually sending a real test message to the target number and confirming receipt):

```bash
curl -s -X POST http://192.168.88.92:3020/api/messages/send \
  -H "Authorization: Bearer 181fc281b1b8a737351f25869edd01cf9d8a4efd35c8f63b3b96450e1c8145dd" \
  -H "Content-Type: application/json" \
  -d '{"to": "<NOMOR_ADHITYA_DENGAN_KODE_NEGARA_TANPA_PLUS>", "message": "Test: tokopedia-session-refresher exploration"}'
```

**STOP and report back the actual discovered shape (endpoint path, request body field names, auth header format) before continuing to Step 2** — do not guess past this point. If sending a live test message isn't something you can safely do without asking (it will actually send a WhatsApp message to a real person), ask the human for the exact endpoint/shape or for explicit permission before firing the test request.

- [ ] **Step 2: Write the test using the discovered shape**

Add to `services/tokopedia-session-refresher/src/notify.test.ts` (append, using the ACTUAL discovered endpoint/body shape from Step 1 — the shape below is illustrative only, replace field names to match what Step 1 found):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shouldNotify, sendFailureNotification } from './notify'

describe('sendFailureNotification', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('mengirim POST ke wa-omni dengan nomor tujuan dan pesan', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    await sendFailureNotification(
      { waOmniEndpoint: 'http://192.168.88.92:3020', waOmniToken: 'tok123', waOmniTargetNumber: '628123456789' },
      'Refresh gagal, perlu login manual via VNC',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('192.168.88.92:3020')
    expect(opts.method).toBe('POST')
    expect(opts.headers.Authorization).toBe('Bearer tok123')
  })

  it('response non-ok -> throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    await expect(sendFailureNotification(
      { waOmniEndpoint: 'http://192.168.88.92:3020', waOmniToken: 'tok123', waOmniTargetNumber: '628123456789' },
      'pesan',
    )).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd services/tokopedia-session-refresher && npx vitest run src/notify.test.ts
```

Expected: FAIL — `sendFailureNotification` not exported yet.

- [ ] **Step 4: Implement sendFailureNotification using the discovered shape**

Append to `services/tokopedia-session-refresher/src/notify.ts` — adapt this skeleton to the EXACT shape discovered in Step 1 (endpoint path, body field names):

```ts
export async function sendFailureNotification(
  cfg: { waOmniEndpoint: string; waOmniToken: string; waOmniTargetNumber: string },
  message: string,
): Promise<void> {
  const res = await fetch(`${cfg.waOmniEndpoint}/api/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.waOmniToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: cfg.waOmniTargetNumber, message }),
  })
  if (!res.ok) throw new Error(`wa-omni send gagal: HTTP ${res.status}`)
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd services/tokopedia-session-refresher && npx vitest run src/notify.test.ts
```

Expected: PASS, all tests in the file (4 from Task 2 + 2 new).

- [ ] **Step 6: Commit**

```bash
git add services/tokopedia-session-refresher/src/notify.ts services/tokopedia-session-refresher/src/notify.test.ts
git commit -m "feat(tokopedia-refresher): sendFailureNotification via wa-omni"
```

---

### Task 5: Dockerfile — Playwright + Xvfb + x11vnc + noVNC

**Files:**
- Create: `services/tokopedia-session-refresher/Dockerfile`
- Create: `services/tokopedia-session-refresher/docker-entrypoint.sh`

**Interfaces:**
- Produces: a buildable image that runs the Node process AND exposes a VNC-viewable browser display — consumed by Task 7's deploy step and by Task 6's live-exploration workflow (you'll build and run this image locally/on the homelab to do the exploration in Task 6).

- [ ] **Step 1: Create the Dockerfile**

```dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-jammy
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb x11vnc novnc websockify \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY services/tokopedia-session-refresher ./services/tokopedia-session-refresher
RUN pnpm install --frozen-lockfile --filter @3pb/tokopedia-session-refresher...

ENV DISPLAY=:99
ENV BROWSER_PROFILE_DIR=/data/browser-profile

COPY services/tokopedia-session-refresher/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 6080
ENTRYPOINT ["/app/docker-entrypoint.sh"]
```

- [ ] **Step 2: Create the entrypoint script**

```sh
#!/bin/bash
set -e

echo "[entrypoint] Starting Xvfb on display $DISPLAY..."
Xvfb $DISPLAY -screen 0 1280x800x24 &
sleep 1

echo "[entrypoint] Starting x11vnc..."
x11vnc -display $DISPLAY -forever -nopw -quiet -rfbport 5900 &
sleep 1

echo "[entrypoint] Starting noVNC on :6080..."
websockify --web=/usr/share/novnc 6080 localhost:5900 &

echo "[entrypoint] Starting tokopedia-session-refresher..."
cd /app
exec pnpm --filter @3pb/tokopedia-session-refresher start
```

- [ ] **Step 3: Build the image locally to verify it builds**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd /Users/adhityatangahu/Documents/shopee-analysis
docker build -f services/tokopedia-session-refresher/Dockerfile -t tokopedia-session-refresher:dev .
```

Expected: build succeeds (this will fail at container RUN time since `main.ts` doesn't exist until Task 7 and env vars aren't set — that's fine, this step only verifies the IMAGE BUILDS, not that it runs correctly yet).

- [ ] **Step 4: Commit**

```bash
git add services/tokopedia-session-refresher/Dockerfile services/tokopedia-session-refresher/docker-entrypoint.sh
git commit -m "feat(tokopedia-refresher): Dockerfile with Playwright + Xvfb + x11vnc + noVNC"
```

---

### Task 6: refresh.ts — Playwright login automation (live exploration required)

**Files:**
- Create: `services/tokopedia-session-refresher/src/refresh.ts`

**Interfaces:**
- Consumes: `RefresherConfig.browserProfileDir`, `RefresherConfig.dashboardUrl`, `RefresherConfig.internalServiceToken` (Task 1).
- Produces: `refreshTokopediaSession(cfg: Pick<RefresherConfig, 'browserProfileDir' | 'dashboardUrl' | 'internalServiceToken'>): Promise<{success: true} | {success: false; error: string}>` — consumed by Task 7 (`main.ts`).

**This task cannot be written from a static code sample — the exact Tokopedia Seller Center login page structure and the TikTok-login redirect flow must be observed live.** Do NOT write `refresh.ts`'s Playwright automation code before completing Step 1.

- [ ] **Step 1: Explore the login flow via Playwright's built-in inspector**

Run this from `services/tokopedia-session-refresher` (adjust the URL if the actual seller login page differs — start from `https://seller.tokopedia.com/login` or whatever URL `TokopediaSessionCard.tsx`'s instructions/comments reference, check that file first for the exact URL users are told to visit):

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd services/tokopedia-session-refresher
npx playwright codegen --target javascript -o /tmp/tokopedia-login-recording.js https://seller.tokopedia.com/login
```

This opens an interactive browser (needs a display — run this on a machine with a GUI, e.g. locally on the Mac, not inside the headless container). Manually:
1. Click "Login with TikTok" (or whatever the actual button text/selector is).
2. If a TikTok session is already active in that browser profile, observe whether it completes automatically or needs one more confirmation click.
3. Confirm the flow lands back on Tokopedia Seller Center with the seller dashboard visible (logged in).
4. Close the recorder.

Read the generated `/tmp/tokopedia-login-recording.js` — it contains the exact selectors and navigation steps Playwright recorded. Use this as the basis for Step 2, translating the recorded actions into `refresh.ts`. Also note: after landing on the dashboard, cookies are readable via `context.cookies()` — confirm `SELLER_TOKEN` and `oec_seller_id_unified_seller_env` (the two cookies `saveSession()` in `apps/dashboard/lib/tokopedia/session.ts` requires) are present in the recorded session's cookie jar before writing Step 2 — if they're missing, the login flow isn't fully complete and needs another observed step.

- [ ] **Step 2: Implement refresh.ts using the observed flow**

Write `services/tokopedia-session-refresher/src/refresh.ts` using Playwright's `chromium.launchPersistentContext()` (so the profile — including TikTok's login state — persists across runs) and the exact selectors/URL found in Step 1. Structure:

```ts
import { chromium } from 'playwright'

export async function refreshTokopediaSession(
  cfg: { browserProfileDir: string; dashboardUrl: string; internalServiceToken: string },
): Promise<{ success: true } | { success: false; error: string }> {
  const context = await chromium.launchPersistentContext(cfg.browserProfileDir, {
    headless: false, // false so the always-on Xvfb+VNC display shows it live
  })
  try {
    const page = await context.newPage()
    // TODO-FOR-IMPLEMENTER: replace the URL and selector below with the exact
    // values recorded in Task 6 Step 1's playwright codegen session.
    await page.goto('https://seller.tokopedia.com/login', { waitUntil: 'networkidle' })
    await page.click('text=Login with TikTok') // placeholder selector — MUST be replaced with the recorded one
    await page.waitForURL('**/seller.tokopedia.com/**', { timeout: 30_000 })

    const cookies = await context.cookies()
    const hasSellerToken = cookies.some((c) => c.name === 'SELLER_TOKEN')
    if (!hasSellerToken) {
      return { success: false, error: 'Login selesai tapi SELLER_TOKEN tidak ditemukan di cookie — flow mungkin belum lengkap' }
    }

    const res = await fetch(`${cfg.dashboardUrl}/api/tokopedia/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': cfg.internalServiceToken },
      body: JSON.stringify({ cookies: cookies.map((c) => ({ name: c.name, value: c.value })) }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { success: false, error: `Dashboard menolak sesi baru: HTTP ${res.status} ${body}` }
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await context.close()
  }
}
```

**This code contains one explicit placeholder** (`text=Login with TikTok` selector) that you, the implementer, MUST replace with the real selector recorded in Step 1 before this task is considered done — do not leave the placeholder text in the final committed code. This is the one place in this plan where a "TODO" is acceptable to write transiently during the exploration step, but it must be resolved before Step 3.

- [ ] **Step 3: Manual end-to-end verification via the running container + VNC**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
docker run --rm -p 6080:6080 \
  -e DASHBOARD_URL=http://<dashboard-reachable-address>:3100 \
  -e INTERNAL_SERVICE_TOKEN=<matching-token> \
  -e CHECK_INTERVAL_HOURS=4 -e REFRESH_THRESHOLD_HOURS=24 -e NOTIFY_COOLDOWN_HOURS=6 \
  -e WA_OMNI_ENDPOINT=http://192.168.88.92:3020 -e WA_OMNI_TOKEN=<token> -e WA_OMNI_TARGET_NUMBER=<nomor> \
  -v tokopedia-refresher-profile-dev:/data/browser-profile \
  tokopedia-session-refresher:dev
```

Open `http://localhost:6080/vnc.html` in a real browser, watch the automated login happen live, confirm it completes and the dashboard's `GET /api/tokopedia/session` (with the matching `X-Internal-Token` header) now shows a fresh `tokenExpiry`. Report the actual observed result — do not claim success without watching this run through VNC at least once.

- [ ] **Step 4: Commit**

```bash
git add services/tokopedia-session-refresher/src/refresh.ts
git commit -m "feat(tokopedia-refresher): refreshTokopediaSession via Playwright TikTok login"
```

---

### Task 7: main.ts wiring + deploy script

**Files:**
- Create: `services/tokopedia-session-refresher/src/main.ts`
- Create: `services/tokopedia-session-refresher/deploy.sh`

**Interfaces:**
- Consumes: `loadConfig` (Task 1), `shouldRefresh` (Task 1), `shouldNotify`, `sendFailureNotification` (Tasks 2, 4), `refreshTokopediaSession` (Task 6).

- [ ] **Step 1: Implement main.ts**

```ts
import { loadConfig } from './config'
import { shouldRefresh } from './scheduler'
import { shouldNotify, sendFailureNotification } from './notify'
import { refreshTokopediaSession } from './refresh'

async function getTokenExpiryMs(dashboardUrl: string, internalServiceToken: string): Promise<number | null> {
  const res = await fetch(`${dashboardUrl}/api/tokopedia/session`, {
    headers: { 'X-Internal-Token': internalServiceToken },
  })
  if (!res.ok) throw new Error(`Gagal baca status sesi: HTTP ${res.status}`)
  const status = (await res.json()) as { tokenExpiry?: string | null }
  return status.tokenExpiry ? new Date(status.tokenExpiry).getTime() : null
}

async function tick(cfg: ReturnType<typeof loadConfig>, lastNotifiedAtMs: number | null): Promise<number | null> {
  const now = Date.now()
  try {
    const tokenExpiryMs = await getTokenExpiryMs(cfg.dashboardUrl, cfg.internalServiceToken)
    if (!shouldRefresh(tokenExpiryMs, now, cfg.refreshThresholdHours)) {
      console.log(`[tick] Token masih valid, skip refresh.`)
      return lastNotifiedAtMs
    }
    console.log(`[tick] Token dekat/sudah expired, menjalankan refresh...`)
    const result = await refreshTokopediaSession(cfg)
    if (result.success) {
      console.log(`[tick] Refresh sukses.`)
      return null // reset notify state on success
    }
    console.error(`[tick] Refresh gagal: ${result.error}`)
    if (shouldNotify(lastNotifiedAtMs, now, cfg.notifyCooldownHours)) {
      await sendFailureNotification(cfg, `Refresh sesi Tokopedia gagal: ${result.error}. Perlu login manual via VNC.`)
      return now
    }
    return lastNotifiedAtMs
  } catch (err) {
    console.error(`[tick] Error tak terduga:`, err)
    return lastNotifiedAtMs
  }
}

async function main() {
  const cfg = loadConfig()
  let lastNotifiedAtMs: number | null = null
  console.log(`[main] tokopedia-session-refresher started. check every ${cfg.checkIntervalHours}h, threshold ${cfg.refreshThresholdHours}h.`)
  while (true) {
    lastNotifiedAtMs = await tick(cfg, lastNotifiedAtMs)
    await new Promise((resolve) => setTimeout(resolve, cfg.checkIntervalHours * 60 * 60 * 1000))
  }
}

main().catch((err) => {
  console.error('[main] Fatal error:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Typecheck**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd services/tokopedia-session-refresher && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Create deploy.sh**

```bash
#!/bin/bash
# deploy.sh — Deploy tokopedia-session-refresher ke Docker host homelab
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DOCKER_HOST="${DOCKER_HOST:-tcp://192.168.88.113:2375}"
CONTAINER="tokopedia-session-refresher"
IMAGE="tokopedia-session-refresher:latest"

echo "🔨  Building image..."
DOCKER_HOST="$DOCKER_HOST" docker build -f "$REPO_ROOT/services/tokopedia-session-refresher/Dockerfile" -t "$IMAGE" "$REPO_ROOT"

echo "🛑  Stopping old container (if any)..."
DOCKER_HOST="$DOCKER_HOST" docker rm -f "$CONTAINER" 2>/dev/null || true

echo "🚀  Starting container..."
DOCKER_HOST="$DOCKER_HOST" docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network homelab \
  -p 6080:6080 \
  -v tokopedia-refresher-profile:/data/browser-profile \
  --env-file "$REPO_ROOT/services/tokopedia-session-refresher/.env.deploy" \
  "$IMAGE"

echo "✅  Deployed. VNC: http://192.168.88.113:6080/vnc.html"
```

- [ ] **Step 4: Create .env.deploy.example documenting required vars**

```
DASHBOARD_URL=http://shopee-dashboard:3000
INTERNAL_SERVICE_TOKEN=
CHECK_INTERVAL_HOURS=4
REFRESH_THRESHOLD_HOURS=24
NOTIFY_COOLDOWN_HOURS=6
WA_OMNI_ENDPOINT=http://192.168.88.92:3020
WA_OMNI_TOKEN=
WA_OMNI_TARGET_NUMBER=
```

Save as `services/tokopedia-session-refresher/.env.deploy.example` (real `.env.deploy` stays gitignored, same pattern as `apps/dashboard/.env.deploy.example`/`.env.deploy` — check `apps/dashboard/.gitignore` for the exact pattern used and add the equivalent line for this service's `.env.deploy` if not already covered by a repo-wide `.env.deploy` glob).

- [ ] **Step 5: Commit**

```bash
chmod +x services/tokopedia-session-refresher/deploy.sh
git add services/tokopedia-session-refresher/src/main.ts services/tokopedia-session-refresher/deploy.sh services/tokopedia-session-refresher/.env.deploy.example
git commit -m "feat(tokopedia-refresher): main.ts scheduler wiring + deploy script"
```

- [ ] **Step 6: Run the full new-service test suite one final time**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
cd services/tokopedia-session-refresher && npx vitest run
```

Expected: all tests across `scheduler.test.ts` and `notify.test.ts` pass.
