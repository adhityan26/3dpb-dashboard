# Dashboard `/api/v1/*` Auth + Cored/Red Color-Match Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close go-public-readiness audit items #1 (`/api/v1/*` fully unauthenticated) and #6 ("Cored" false-matching "red") in `apps/dashboard`.

**Architecture:** A2 is a standalone regex fix with a regression test. A1 adds a `requireApiV1Token` guard (byte-for-byte the same shape as the existing `requireBotToken`) checked against a new `API_V1_TOKEN` env var, applied as the first statement in every `/api/v1/*` route handler — 6 files, 10 exported HTTP methods total (spool: GET+POST, spool/[id]: GET+PATCH, spool/[id]/use: PUT, filament: GET+POST, vendor: GET+POST, info: GET).

**Tech Stack:** Next.js App Router route handlers, Prisma, Vitest.

## Global Constraints

- New auth guard function is named `requireApiV1Token`, lives at `apps/dashboard/lib/api-v1/auth.ts`, and checks env var `API_V1_TOKEN` (NOT `BOT_API_TOKEN` — the user explicitly chose a separate, independently-rotatable token).
- Unauthorized requests return exactly `NextResponse.json({ error: "Unauthorized" }, { status: 401 })` — this exact shape, matching every other guarded route in this codebase (verified against `apps/dashboard/app/api/bot/kalkulator/route.ts`'s convention).
- The guard is the **first statement** in every handler body, before any `await req.json()` or Prisma call — an unauthenticated request must never reach the database or have its body parsed.
- `API_V1_TOKEN` must be added to `apps/dashboard/deploy.sh`'s `REQUIRED_VARS` array (hard-fail deploy if unset) — not optional/soft-checked.
- No behavior change for any already-authenticated request — this plan only adds a guard clause and fixes one regex; no other logic in these 6 route files or `catalog-mapper.ts` is touched.

---

### Task 1: `requireApiV1Token` helper

**Files:**
- Create: `apps/dashboard/lib/api-v1/auth.ts`
- Test: `apps/dashboard/lib/api-v1/__tests__/auth.test.ts`

**Interfaces:**
- Produces: `requireApiV1Token(req: { headers: { get(name: string): string | null } }): boolean` — used by every task 2/3 route handler.

- [ ] **Step 1: Write the failing test**

Create `apps/dashboard/lib/api-v1/__tests__/auth.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest"
import { requireApiV1Token } from "../auth"

function reqWith(auth: string | null) {
  return { headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? auth : null) } }
}

const ORIGINAL = process.env.API_V1_TOKEN
afterEach(() => { process.env.API_V1_TOKEN = ORIGINAL })

describe("requireApiV1Token", () => {
  it("returns true for a matching bearer token", () => {
    process.env.API_V1_TOKEN = "secret123"
    expect(requireApiV1Token(reqWith("Bearer secret123"))).toBe(true)
  })
  it("returns false for a wrong token", () => {
    process.env.API_V1_TOKEN = "secret123"
    expect(requireApiV1Token(reqWith("Bearer nope"))).toBe(false)
  })
  it("returns false when the header is missing", () => {
    process.env.API_V1_TOKEN = "secret123"
    expect(requireApiV1Token(reqWith(null))).toBe(false)
  })
  it("returns false when the header is malformed (no Bearer prefix)", () => {
    process.env.API_V1_TOKEN = "secret123"
    expect(requireApiV1Token(reqWith("secret123"))).toBe(false)
  })
  it("returns false when API_V1_TOKEN is unset", () => {
    delete process.env.API_V1_TOKEN
    expect(requireApiV1Token(reqWith("Bearer anything"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/dashboard && npx vitest run lib/api-v1/__tests__/auth.test.ts`
Expected: FAIL — `../auth` module not found.

- [ ] **Step 3: Write minimal implementation**

Create `apps/dashboard/lib/api-v1/auth.ts`:

```typescript
/** Constant-time string comparison to avoid timing leaks on the token. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verify the bearer token on a /api/v1/* request.
 * Returns true only when Authorization: "Bearer <token>" matches API_V1_TOKEN
 * and the env var is set. Unset env → always false (never open access).
 */
export function requireApiV1Token(req: { headers: { get(name: string): string | null } }): boolean {
  const expected = process.env.API_V1_TOKEN
  if (!expected) return false
  const header = req.headers.get("authorization")
  if (!header || !header.startsWith("Bearer ")) return false
  const token = header.slice("Bearer ".length)
  return timingSafeEqual(token, expected)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/dashboard && npx vitest run lib/api-v1/__tests__/auth.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/api-v1/auth.ts apps/dashboard/lib/api-v1/__tests__/auth.test.ts
git commit -m "feat(dashboard): requireApiV1Token auth guard for /api/v1/*"
```

---

### Task 2: Guard the spool routes (3 files, 5 methods)

**Files:**
- Modify: `apps/dashboard/app/api/v1/spool/route.ts`
- Modify: `apps/dashboard/app/api/v1/spool/[id]/route.ts`
- Modify: `apps/dashboard/app/api/v1/spool/[id]/use/route.ts`
- Test: `apps/dashboard/app/api/v1/spool/__tests__/route.test.ts`
- Test: `apps/dashboard/app/api/v1/spool/[id]/__tests__/route.test.ts`
- Test: `apps/dashboard/app/api/v1/spool/[id]/use/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `requireApiV1Token` from `@/lib/api-v1/auth` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `apps/dashboard/app/api/v1/spool/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    spoolmanSpool: { findMany: vi.fn(), create: vi.fn() },
    spoolmanFilament: { findUnique: vi.fn() },
    spool: { create: vi.fn() },
  },
}))
vi.mock('@/lib/api-v1/auth', () => ({ requireApiV1Token: vi.fn() }))

import { prisma } from '@/lib/db'
import { requireApiV1Token } from '@/lib/api-v1/auth'
import { GET, POST } from '../route'

const mockToken = vi.mocked(requireApiV1Token)
const mockFindMany = vi.mocked(prisma.spoolmanSpool.findMany)
const mockFilamentFind = vi.mocked(prisma.spoolmanFilament.findUnique)

const req = (query = '', body?: unknown) => ({
  url: `https://dash.test/api/v1/spool${query}`,
  headers: { get: () => 'Bearer t' },
  json: async () => body,
}) as unknown as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
  mockFindMany.mockResolvedValue([])
})

describe('GET /api/v1/spool — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET(req(''))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('200 dengan token valid', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(200)
    expect(mockFindMany).toHaveBeenCalled()
  })
})

describe('POST /api/v1/spool — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await POST(req('', { filament_id: 1 }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mockFilamentFind).not.toHaveBeenCalled()
  })
})
```

Create `apps/dashboard/app/api/v1/spool/[id]/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    spoolmanSpool: { findUnique: vi.fn(), update: vi.fn() },
    spool: { update: vi.fn() },
  },
}))
vi.mock('@/lib/api-v1/auth', () => ({ requireApiV1Token: vi.fn() }))

import { prisma } from '@/lib/db'
import { requireApiV1Token } from '@/lib/api-v1/auth'
import { GET, PATCH } from '../route'

const mockToken = vi.mocked(requireApiV1Token)
const mockFindUnique = vi.mocked(prisma.spoolmanSpool.findUnique)

const req = (body?: unknown) => ({
  headers: { get: () => 'Bearer t' },
  json: async () => body,
}) as unknown as NextRequest
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
})

describe('GET /api/v1/spool/{id} — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET(req(), ctx('1'))
    expect(res.status).toBe(401)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/v1/spool/{id} — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await PATCH(req({ initial_weight: 500 }), ctx('1'))
    expect(res.status).toBe(401)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})
```

Create `apps/dashboard/app/api/v1/spool/[id]/use/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: {
    spoolmanSpool: { findUnique: vi.fn(), update: vi.fn() },
    spool: { update: vi.fn() },
  },
}))
vi.mock('@/lib/api-v1/auth', () => ({ requireApiV1Token: vi.fn() }))

import { prisma } from '@/lib/db'
import { requireApiV1Token } from '@/lib/api-v1/auth'
import { PUT } from '../route'

const mockToken = vi.mocked(requireApiV1Token)
const mockFindUnique = vi.mocked(prisma.spoolmanSpool.findUnique)

const req = (body?: unknown) => ({
  headers: { get: () => 'Bearer t' },
  json: async () => body,
}) as unknown as NextRequest
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
})

describe('PUT /api/v1/spool/{id}/use — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await PUT(req({ use_weight: 10 }), ctx('1'))
    expect(res.status).toBe(401)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/dashboard && npx vitest run app/api/v1/spool`
Expected: FAIL — all "401" assertions fail because the routes currently always execute normally (no guard yet), so `mockFindUnique`/`mockFindMany` WERE called and status codes aren't 401.

- [ ] **Step 3: Add the guard to each handler**

In `apps/dashboard/app/api/v1/spool/route.ts`, add the import and guard. Change the top import line:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
```

to:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiV1Token } from '@/lib/api-v1/auth'
```

Then change:

```typescript
// GET /api/v1/spool?lot_nr={lotNr}
export async function GET(req: NextRequest) {
  const lotNr = req.nextUrl.searchParams.get('lot_nr')
```

to:

```typescript
// GET /api/v1/spool?lot_nr={lotNr}
export async function GET(req: NextRequest) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const lotNr = req.nextUrl.searchParams.get('lot_nr')
```

And change:

```typescript
// POST /api/v1/spool — create new spool, also create Spool in our system
export async function POST(req: NextRequest) {
  const body = await req.json()
```

to:

```typescript
// POST /api/v1/spool — create new spool, also create Spool in our system
export async function POST(req: NextRequest) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
```

In `apps/dashboard/app/api/v1/spool/[id]/route.ts`, add the same import, then change:

```typescript
// GET /api/v1/spool/{id} — fetch single spool
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
```

to:

```typescript
// GET /api/v1/spool/{id} — fetch single spool
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
```

(Note: `_req` is renamed to `req` since the guard now uses it — the leading underscore convention marked it as intentionally-unused, which is no longer true.)

And change:

```typescript
// PATCH /api/v1/spool/{id} — update existing spool
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
```

to:

```typescript
// PATCH /api/v1/spool/{id} — update existing spool
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
```

In `apps/dashboard/app/api/v1/spool/[id]/use/route.ts`, add the same import, then change:

```typescript
// PUT /api/v1/spool/{id}/use — add to used_weight (Spoolman consumption tracking)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
```

to:

```typescript
// PUT /api/v1/spool/{id}/use — add to used_weight (Spoolman consumption tracking)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run app/api/v1/spool`
Expected: PASS, all tests including the new 401 assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/api/v1/spool
git commit -m "feat(dashboard): require API_V1_TOKEN on spool routes"
```

---

### Task 3: Guard the filament, vendor, and info routes (3 files, 5 methods)

**Files:**
- Modify: `apps/dashboard/app/api/v1/filament/route.ts`
- Modify: `apps/dashboard/app/api/v1/vendor/route.ts`
- Modify: `apps/dashboard/app/api/v1/info/route.ts`
- Test: `apps/dashboard/app/api/v1/filament/__tests__/route.test.ts`
- Test: `apps/dashboard/app/api/v1/vendor/__tests__/route.test.ts`
- Test: `apps/dashboard/app/api/v1/info/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `requireApiV1Token` from `@/lib/api-v1/auth` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `apps/dashboard/app/api/v1/filament/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: { spoolmanFilament: { findMany: vi.fn(), create: vi.fn() } },
}))
vi.mock('@/lib/api-v1/auth', () => ({ requireApiV1Token: vi.fn() }))

import { prisma } from '@/lib/db'
import { requireApiV1Token } from '@/lib/api-v1/auth'
import { GET, POST } from '../route'

const mockToken = vi.mocked(requireApiV1Token)
const mockFindMany = vi.mocked(prisma.spoolmanFilament.findMany)
const mockCreate = vi.mocked(prisma.spoolmanFilament.create)

const req = (query = '', body?: unknown) => ({
  url: `https://dash.test/api/v1/filament${query}`,
  headers: { get: () => 'Bearer t' },
  json: async () => body,
}) as unknown as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
  mockFindMany.mockResolvedValue([])
})

describe('GET /api/v1/filament — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET(req(''))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('200 dengan token valid', async () => {
    const res = await GET(req(''))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/v1/filament — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await POST(req('', { name: 'x' }))
    expect(res.status).toBe(401)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
```

Create `apps/dashboard/app/api/v1/vendor/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  prisma: { spoolmanVendor: { findMany: vi.fn(), upsert: vi.fn() } },
}))
vi.mock('@/lib/api-v1/auth', () => ({ requireApiV1Token: vi.fn() }))

import { prisma } from '@/lib/db'
import { requireApiV1Token } from '@/lib/api-v1/auth'
import { GET, POST } from '../route'

const mockToken = vi.mocked(requireApiV1Token)
const mockFindMany = vi.mocked(prisma.spoolmanVendor.findMany)
const mockUpsert = vi.mocked(prisma.spoolmanVendor.upsert)

const req = (query = '', body?: unknown) => ({
  url: `https://dash.test/api/v1/vendor${query}`,
  headers: { get: () => 'Bearer t' },
  json: async () => body,
}) as unknown as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  mockToken.mockReturnValue(true)
  mockFindMany.mockResolvedValue([])
})

describe('GET /api/v1/vendor — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET(req(''))
    expect(res.status).toBe(401)
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/vendor — auth', () => {
  it('401 tanpa token yang valid, DB tidak disentuh', async () => {
    mockToken.mockReturnValue(false)
    const res = await POST(req('', { name: 'x' }))
    expect(res.status).toBe(401)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
```

Create `apps/dashboard/app/api/v1/info/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/api-v1/auth', () => ({ requireApiV1Token: vi.fn() }))

import { requireApiV1Token } from '@/lib/api-v1/auth'
import { GET } from '../route'

const mockToken = vi.mocked(requireApiV1Token)

beforeEach(() => { vi.clearAllMocks() })

describe('GET /api/v1/info — auth', () => {
  it('401 tanpa token yang valid', async () => {
    mockToken.mockReturnValue(false)
    const res = await GET({ headers: { get: () => null } } as never)
    expect(res.status).toBe(401)
  })

  it('200 dengan token valid', async () => {
    mockToken.mockReturnValue(true)
    const res = await GET({ headers: { get: () => 'Bearer t' } } as never)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/dashboard && npx vitest run app/api/v1/filament app/api/v1/vendor app/api/v1/info`
Expected: FAIL — routes have no guard yet, so 401 assertions fail, and `info/route.ts`'s `GET()` currently takes no arguments at all (calling it with a fake request object will still pass today since the extra arg is just ignored, but the 401 assertion fails since there's no guard to reject it).

- [ ] **Step 3: Add the guard to each handler**

In `apps/dashboard/app/api/v1/filament/route.ts`, add the import:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireApiV1Token } from '@/lib/api-v1/auth'
```

Then change:

```typescript
// GET /api/v1/filament?external_id={id}
export async function GET(req: NextRequest) {
  const externalId = req.nextUrl.searchParams.get('external_id')
```

to:

```typescript
// GET /api/v1/filament?external_id={id}
export async function GET(req: NextRequest) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const externalId = req.nextUrl.searchParams.get('external_id')
```

And change:

```typescript
// POST /api/v1/filament
export async function POST(req: NextRequest) {
  const body = await req.json()
```

to:

```typescript
// POST /api/v1/filament
export async function POST(req: NextRequest) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
```

In `apps/dashboard/app/api/v1/vendor/route.ts`, add the same import, then change:

```typescript
// GET /api/v1/vendor?name={name}
export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')
```

to:

```typescript
// GET /api/v1/vendor?name={name}
export async function GET(req: NextRequest) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const name = req.nextUrl.searchParams.get('name')
```

And change:

```typescript
// POST /api/v1/vendor
export async function POST(req: NextRequest) {
  const body = await req.json()
```

to:

```typescript
// POST /api/v1/vendor
export async function POST(req: NextRequest) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
```

Replace the full content of `apps/dashboard/app/api/v1/info/route.ts` (currently takes zero arguments — needs to accept a request now to read the header):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireApiV1Token } from '@/lib/api-v1/auth'

// GET /api/v1/info — Spoolman-compatible server info
export async function GET(req: NextRequest) {
  if (!requireApiV1Token(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    version: '0.19.1',
    debug_mode: false,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run app/api/v1/filament app/api/v1/vendor app/api/v1/info`
Expected: PASS, all tests including the new 401 assertions.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/app/api/v1/filament apps/dashboard/app/api/v1/vendor apps/dashboard/app/api/v1/info
git commit -m "feat(dashboard): require API_V1_TOKEN on filament, vendor, info routes"
```

---

### Task 4: `API_V1_TOKEN` in deploy config

**Files:**
- Modify: `apps/dashboard/deploy.sh`
- Modify: `apps/dashboard/.env.deploy.example`
- Modify: `apps/dashboard/.env.production.example`

**Interfaces:** None — configuration/documentation only, no code interface.

- [ ] **Step 1: Add to `REQUIRED_VARS` in `deploy.sh`**

Change:

```bash
REQUIRED_VARS=(
  DATABASE_URL NEXTAUTH_URL NEXTAUTH_SECRET
  SHOPEE_PARTNER_ID SHOPEE_PARTNER_KEY SHOPEE_SHOP_ID
  INTERNAL_NOTIFICATION_SECRET
  AUTHENTIK_CLIENT_ID AUTHENTIK_CLIENT_SECRET AUTHENTIK_ISSUER
)
```

to:

```bash
REQUIRED_VARS=(
  DATABASE_URL NEXTAUTH_URL NEXTAUTH_SECRET
  SHOPEE_PARTNER_ID SHOPEE_PARTNER_KEY SHOPEE_SHOP_ID
  INTERNAL_NOTIFICATION_SECRET
  AUTHENTIK_CLIENT_ID AUTHENTIK_CLIENT_SECRET AUTHENTIK_ISSUER
  API_V1_TOKEN
)
```

- [ ] **Step 2: Document in `.env.deploy.example`**

In `apps/dashboard/.env.deploy.example`, after the `# Auth` section (after the `NEXTAUTH_SECRET=...` line), add:

```
# /api/v1/* (Spoolman-compatible API) auth token — generate with: openssl rand -hex 32
API_V1_TOKEN=ganti_dengan_random_string_panjang
```

- [ ] **Step 3: Document in `.env.production.example`**

In `apps/dashboard/.env.production.example`, after the `# ── NextAuth ──...` block (after the `AUTH_TRUST_HOST=true` line), add:

```

# ── /api/v1/* (Spoolman-compatible API) ─────────────────────────────────────
# Bearer token required on every /api/v1/* request. Generate: openssl rand -hex 32
API_V1_TOKEN=GANTI_DENGAN_RANDOM_STRING_PANJANG
```

- [ ] **Step 4: Verify deploy.sh still parses correctly**

Run: `cd apps/dashboard && bash -n deploy.sh`
Expected: no output (syntax OK). This does NOT run the script (which requires a real `.env.deploy` and Docker host) — it only checks the shell syntax is valid.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/deploy.sh apps/dashboard/.env.deploy.example apps/dashboard/.env.production.example
git commit -m "chore(dashboard): require API_V1_TOKEN in deploy config"
```

---

### Task 5: Fix "Cored" matching "red" in catalog-mapper.ts

**Files:**
- Modify: `apps/dashboard/lib/filamen/catalog-mapper.ts`
- Test: `apps/dashboard/lib/filamen/__tests__/catalog-mapper.test.ts` (new — this module currently has zero test coverage)

**Interfaces:** None new — `resolveFilamentToCatalog`'s signature is unchanged.

- [ ] **Step 1: Write the failing tests**

Create `apps/dashboard/lib/filamen/__tests__/catalog-mapper.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { resolveFilamentToCatalog } from '../catalog-mapper'
import type { FilamentCatalogEntry } from '../types'

let nextId = 1
const entry = (brand: string, colorName: string): FilamentCatalogEntry => ({
  id: String(nextId++),
  brand,
  material: 'PLA',
  colorName,
  colorHex: '#000000',
})

const CATALOG: FilamentCatalogEntry[] = [
  entry('eSUN', 'Red'),
  entry('eSUN', 'Blue'),
  entry('eSUN', 'Cored'),
]

describe('resolveFilamentToCatalog — word-boundary color matching', () => {
  it('"Esun Cored" TIDAK match entri colorName "Red" (substring "red" di dalam "Cored")', () => {
    const result = resolveFilamentToCatalog('Esun Cored', CATALOG)
    expect(result?.colorName).toBe('Cored')
  })

  it('exact match colorName tetap jalan', () => {
    const result = resolveFilamentToCatalog('Esun Red', CATALOG)
    expect(result?.colorName).toBe('Red')
  })

  it('substring legit di arah colorName.includes(q) tetap jalan (query lebih pendek dari colorName)', () => {
    const catalog: FilamentCatalogEntry[] = [entry('eSUN', 'Fire Engine Red')]
    const result = resolveFilamentToCatalog('Esun Engine', catalog)
    expect(result?.colorName).toBe('Fire Engine Red')
  })

  it('query mengandung nama warna sebagai frasa utuh (bukan substring huruf) tetap match', () => {
    const catalog: FilamentCatalogEntry[] = [entry('eSUN', 'Blue')]
    const result = resolveFilamentToCatalog('Esun Dark Blue', catalog)
    expect(result?.colorName).toBe('Blue')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/dashboard && npx vitest run lib/filamen/__tests__/catalog-mapper.test.ts`
Expected: FAIL on the first test — `resolveFilamentToCatalog('Esun Cored', CATALOG)` currently returns the `'Red'` entry (since `q.includes(e.colorName.toLowerCase())` → `'cored'.includes('red')` → `true`), not `'Cored'`.

- [ ] **Step 3: Implement the fix**

In `apps/dashboard/lib/filamen/catalog-mapper.ts`, add a helper function after the imports (before `BRAND_MATCHERS`):

```typescript
import type { FilamentCatalogEntry } from './types'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Brand prefix → matcher function
```

Then change:

```typescript
  // Partial: colorName contains query OR query contains colorName
  const partials = byBrand.filter(
    (e) => e.colorName.toLowerCase().includes(q) || q.includes(e.colorName.toLowerCase())
  )
```

to:

```typescript
  // Partial: colorName contains query, OR colorName appears as a whole word/phrase
  // inside query (NOT an unbounded substring — "Cored" must not match colorName "Red"
  // just because "cored".includes("red") is true).
  const partials = byBrand.filter((e) => {
    const colorNameLower = e.colorName.toLowerCase()
    if (colorNameLower.includes(q)) return true
    const boundaryPattern = new RegExp(`(^|\\s)${escapeRegExp(colorNameLower)}($|\\s)`)
    return boundaryPattern.test(q)
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/dashboard && npx vitest run lib/filamen/__tests__/catalog-mapper.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/filamen/catalog-mapper.ts apps/dashboard/lib/filamen/__tests__/catalog-mapper.test.ts
git commit -m "fix(dashboard): word-boundary color matching, Cored no longer matches Red"
```

---

### Task 6: Final verification

**Files:** none (verification-only).

- [ ] **Step 1: Full apps/dashboard test suite**

Run: `export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && cd apps/dashboard && npx vitest run`
Expected: all tests pass, including all new tests from Tasks 1, 2, 3, 5.

- [ ] **Step 2: Typecheck**

Run: `cd apps/dashboard && npx tsc --noEmit`
Expected: 0 errors. In particular, confirm `apps/dashboard/app/api/v1/spool/[id]/route.ts`'s renamed `_req` → `req` parameter (Task 2) didn't break anything, and `info/route.ts`'s `GET(req: NextRequest)` signature change (Task 3) is consistent with Next.js's route handler typing (no `noUnusedParameters` violation, since `req` is now used).

- [ ] **Step 3: Build**

Run: `cd apps/dashboard && npx next build`
Expected: build succeeds.

- [ ] **Step 4: Grep for any /api/v1 handler missing the guard**

Run: `grep -L "requireApiV1Token" apps/dashboard/app/api/v1/*/route.ts apps/dashboard/app/api/v1/*/*/route.ts apps/dashboard/app/api/v1/*/*/*/route.ts 2>/dev/null`
Expected: no output — every route file under `/api/v1/` contains at least one call to `requireApiV1Token`. (This grep pattern covers `info/route.ts` and `spool/route.ts`, `filament/route.ts`, `vendor/route.ts` at one level deep, `spool/[id]/route.ts` at two levels, and `spool/[id]/use/route.ts` at three levels — matching this repo's actual directory depths.)

- [ ] **Step 5: Confirm the guard runs before any DB access, per file**

Manually read each of the 6 route files' handler bodies (already modified in Tasks 2/3) and confirm the `requireApiV1Token(req)` line appears strictly before the first `await prisma.*` call or `await req.json()` call in each function. This was true by construction (Tasks 2/3 inserted the guard as the very first statement), but re-confirm here since it's the single most important correctness property this whole plan exists to guarantee.

- [ ] **Step 6: Commit (only if any fixups were needed in Steps 1–5)**

```bash
git add -A -- apps/dashboard
git commit -m "fix(dashboard): final verification fixups for /api/v1 auth + color-match fix"
```

If Steps 1–5 all pass clean with no fixups needed, skip this commit — there's nothing to commit.
