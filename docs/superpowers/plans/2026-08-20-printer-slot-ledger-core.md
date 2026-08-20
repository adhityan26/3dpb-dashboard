# Printer Slot Ledger — Sub-project 1: Core Ledger & Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current static `Entitlement.printerSlots` device-count
gate with a `SlotGrant` ledger whose capacity is computed live from
multiple independent, time-bounded grant sources, and enforce it (with
FIFO oldest-wins suspension for over-capacity devices) at the two places
that currently or will read device capacity.

**Architecture:** A new `apps/saas/lib/printer-slots/capacity.ts` module
computes capacity/eligibility on every call (never cached). It replaces
the `Entitlement.printerSlots` read inside the existing, carefully
race-proofed `createDevice()` transaction in `apps/saas/lib/devices/
service.ts`, and gates the `/api/agent/layout` telemetry route so
suspended devices' cells are stripped from what the CYD screens receive.

**Tech Stack:** Next.js 16 (`apps/saas`), Prisma + `@prisma/adapter-pg`,
Vitest (mocked-Prisma unit tests + `describe.skipIf` real-Postgres
integration tests), `pnpm --filter @3pb/saas`.

**Spec:** `docs/superpowers/specs/2026-08-20-printer-slot-ledger-core-design.md`

## Global Constraints

- No Prisma migration history exists in this app — deploy uses `prisma db
  push` only (`apps/saas/package.json` `db:push` script). A bare field
  rename in `schema.prisma` is interpreted by `db push` as drop+add,
  which would silently discard existing `Payment.tier` values. Task 1
  below documents the exact manual SQL the user must run against
  production **before** `db push`, consistent with this project's
  established pattern of the user running production DB steps themselves
  (never run this against production from an agent session).
- Any Prisma query issued while a `$transaction` callback holds the
  `Entitlement` row lock (`SELECT ... FOR UPDATE`) must use the `tx`
  client, never the global `prisma` singleton — a second connection
  checked out from the pool while another transaction holds a lock on
  the same logical resource risks connection-pool starvation. This is
  already documented at length in `apps/saas/lib/devices/service.ts`
  lines 49-93 and must be preserved exactly when Task 3 wires the new
  ledger into that transaction.
- `Device.createdAt` (existing column) is the FIFO ordering key — no new
  column is added to `Device`.
- Eligibility/capacity is always computed live, never stored as a flag.
- `Payment.tier` → `productType` is the only field rename in this app's
  history; every other usage of the string `tier` in `apps/saas` belongs
  to the unrelated kalkulator margin-tier concept and must not be touched.

---

### Task 1: Schema migration — `SlotGrant`, `CydVariant`, `Payment` columns, drop `Entitlement.printerSlots`

**Files:**
- Modify: `apps/saas/prisma/schema.prisma`
- Modify: `apps/saas/lib/payment/service.ts:49`
- Test: `apps/saas/lib/payment/service.test.ts`

**Interfaces:**
- Produces: `Payment.productType: String`, `Payment.quantity: Int?`,
  `Payment.shippingAddress/shippingCost/shippingStatus: String?/Int?`,
  `Payment.cydVariantId: String?`; `CydVariant` model (`id, label, price,
  slotBonus, active, createdAt`); `SlotGrantSource` enum (`CYD_PURCHASE |
  SLOT_PURCHASE | SUBSCRIBE | PROMO`); `SlotGrant` model (`id, userId,
  source, paymentId?, quantity, active, validFrom?, validUntil?,
  createdAt`) — all consumed by Task 2 onward.

- [ ] **Step 1: Write the failing test**

Add to `apps/saas/lib/payment/service.test.ts` (inside the existing
`describe("createOrReuseCheckout"`, block, following the file's existing
`vi.mock("@/lib/db", ...)` pattern):

```typescript
it("creates a Payment with productType BELI", async () => {
  // ... use the same mockPrisma.payment.create / findFirst setup as the
  // existing "creates a new pending payment" test in this file, but
  // assert on the data passed to payment.create:
  await createOrReuseCheckout("user-1");
  expect(mockPrisma.payment.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ productType: "BELI" }) })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts -t "productType BELI"`
Expected: FAIL — `data` object has `tier: "beli"`, not `productType:
"BELI"` (property doesn't exist / value mismatch).

- [ ] **Step 3: Edit the Prisma schema**

In `apps/saas/prisma/schema.prisma`, replace the `Payment` model (find it
via `model Payment {`) with:

```prisma
model Payment {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  productType     String    // "BELI" | "CYD" | "SLOT_PURCHASE" | "SUBSCRIBE"
  quantity        Int?      // CYD units, or slot count; null for BELI/SUBSCRIBE
  displayPrice    Int
  amount          Int
  uniqueCode      Int
  qrPayload       String
  status          String    @default("PENDING")
  paidMarkedAt    DateTime?
  proofKey        String?
  proofType       String?
  verifiedAt      DateTime?
  verifiedBy      String?
  shippingAddress String?
  shippingCost    Int?
  shippingStatus  String?
  cydVariantId    String?
  createdAt       DateTime  @default(now())

  slotGrant  SlotGrant?
  cydVariant CydVariant? @relation(fields: [cydVariantId], references: [id])
  @@index([status, createdAt])
}

model CydVariant {
  id        String   @id @default(cuid())
  label     String
  price     Int
  slotBonus Int      @default(10)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())

  payments Payment[]
}

enum SlotGrantSource {
  CYD_PURCHASE
  SLOT_PURCHASE
  SUBSCRIBE
  PROMO
}

model SlotGrant {
  id         String          @id @default(cuid())
  userId     String
  source     SlotGrantSource
  paymentId  String?         @unique
  payment    Payment?        @relation(fields: [paymentId], references: [id])
  quantity   Int
  active     Boolean         @default(true)
  validFrom  DateTime?
  validUntil DateTime?
  createdAt  DateTime        @default(now())

  @@index([userId])
}
```

In the `Entitlement` model, delete the `printerSlots Int?` line entirely.

- [ ] **Step 4: Update the one existing `tier` write site**

In `apps/saas/lib/payment/service.ts`, line 49, change:

```typescript
data: { userId, tier: "beli", displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING" },
```

to:

```typescript
data: { userId, productType: "BELI", displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING" },
```

- [ ] **Step 5: Regenerate the Prisma client and typecheck**

Run: `pnpm --filter @3pb/saas exec prisma generate && pnpm --filter @3pb/saas typecheck`
Expected: both succeed with no errors referencing `tier` or
`printerSlots` (Task 3 fixes the one remaining reference in
`lib/devices/service.ts` — a typecheck failure there at this point is
expected and resolved in Task 3, not this one; if it's the *only*
remaining error, that's correct progress for this step).

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts`
Expected: PASS, full file (not just the new test) — confirms the rename
didn't break the existing suite.

- [ ] **Step 7: Document the production migration SQL (do not run it)**

Add a comment block at the top of `apps/saas/prisma/schema.prisma`, above
the `Payment` model:

```prisma
// PRODUCTION DEPLOY NOTE (2026-08-20 printer-slot-ledger migration):
// `db push` cannot detect a column rename — it will DROP `tier` and ADD
// `productType` as empty, discarding existing values. Before running
// `db:push` against production, run manually against the production DB:
//   ALTER TABLE "Payment" RENAME COLUMN "tier" TO "productType";
//   UPDATE "Payment" SET "productType" = 'BELI' WHERE "productType" = 'beli';
// Then `db:push` will see the columns already match and add only the new
// SlotGrant/CydVariant tables and Payment's new nullable columns.
```

- [ ] **Step 8: Commit**

```bash
git add apps/saas/prisma/schema.prisma apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts
git commit -m "feat(saas): add SlotGrant/CydVariant models, rename Payment.tier to productType"
```

---

### Task 2: `lib/printer-slots/capacity.ts` — capacity & eligibility

**Files:**
- Create: `apps/saas/lib/printer-slots/capacity.ts`
- Test: `apps/saas/lib/printer-slots/capacity.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`; `getConfigInt` from `@/lib/config`
  (existing, signature `getConfigInt(key: string, fallback: number):
  Promise<number>` — reads the `"printer.defaultSlots"` Config key,
  default `1`, already used by `lib/devices/service.ts` today).
- Produces: `getCapacity(userId: string, opts?: { client?: SlotGrantDbClient; baseline?: number }): Promise<number>`
  and `getEligibleDevices(userId: string, opts?: { client?: SlotGrantDbClient; baseline?: number }): Promise<Device[]>`
  (full `Device` rows, oldest-first, sliced to capacity) — consumed by
  Task 3 (`createDevice`/`getDeviceLimit`) and Task 4 (layout filter).

- [ ] **Step 1: Write the failing tests**

Create `apps/saas/lib/printer-slots/capacity.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    slotGrant: { findMany: vi.fn() },
    device: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/config", () => ({ getConfigInt: vi.fn() }));

import { prisma } from "@/lib/db";
import { getConfigInt } from "@/lib/config";
import { getCapacity, getEligibleDevices } from "./capacity";

const mockPrisma = prisma as unknown as {
  slotGrant: { findMany: ReturnType<typeof vi.fn> };
  device: { findMany: ReturnType<typeof vi.fn> };
};
const mockGetConfigInt = getConfigInt as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetConfigInt.mockResolvedValue(1);
});

describe("getCapacity", () => {
  it("returns just the baseline when no grants exist", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([]);
    await expect(getCapacity("u1")).resolves.toBe(1);
  });

  it("sums multiple active grants on top of the baseline", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([{ quantity: 10 }, { quantity: 2 }]);
    await expect(getCapacity("u1")).resolves.toBe(13);
  });

  it("uses a passed-in baseline instead of querying Config", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([{ quantity: 5 }]);
    await expect(getCapacity("u1", { baseline: 1 })).resolves.toBe(6);
    expect(mockGetConfigInt).not.toHaveBeenCalled();
  });

  it("excludes expired grants from the query window (validUntil in the past)", async () => {
    // The Prisma where-clause itself does this filtering; this test verifies
    // getCapacity passes a validUntil filter referencing "now" to findMany.
    mockPrisma.slotGrant.findMany.mockResolvedValue([]);
    await getCapacity("u1");
    const where = mockPrisma.slotGrant.findMany.mock.calls[0][0].where;
    expect(where.active).toBe(true);
    expect(where.OR).toEqual(
      expect.arrayContaining([{ validUntil: null }, expect.objectContaining({ validUntil: expect.any(Object) })])
    );
  });
});

describe("getEligibleDevices", () => {
  const devices = [
    { id: "d1", createdAt: new Date("2026-01-01") },
    { id: "d2", createdAt: new Date("2026-02-01") },
    { id: "d3", createdAt: new Date("2026-03-01") },
  ];

  it("returns all devices when under capacity", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([{ quantity: 5 }]);
    mockPrisma.device.findMany.mockResolvedValue(devices);
    const result = await getEligibleDevices("u1");
    expect(result.map((d) => d.id)).toEqual(["d1", "d2", "d3"]);
  });

  it("keeps only the oldest N devices when over capacity (FIFO)", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([]); // capacity = baseline = 1
    mockPrisma.device.findMany.mockResolvedValue(devices);
    const result = await getEligibleDevices("u1");
    expect(result.map((d) => d.id)).toEqual(["d1"]);
  });

  it("orders the device query oldest-first", async () => {
    mockPrisma.slotGrant.findMany.mockResolvedValue([]);
    mockPrisma.device.findMany.mockResolvedValue([]);
    await getEligibleDevices("u1");
    expect(mockPrisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/printer-slots/capacity.test.ts`
Expected: FAIL — `./capacity` module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/saas/lib/printer-slots/capacity.ts`:

```typescript
import { prisma } from "@/lib/db";
import { getConfigInt } from "@/lib/config";
import type { Device, Prisma } from "@prisma/client";

/** Client Prisma yang cukup buat fungsi di file ini -- `prisma` global ATAU `tx` interactive transaction. */
type SlotGrantDbClient = Pick<Prisma.TransactionClient, "slotGrant" | "device">;

interface CapacityOpts {
  client?: SlotGrantDbClient;
  /**
   * Kalau dikasih, dipakai apa adanya TANPA query Config lagi -- WAJIB dipassing oleh caller
   * yang manggil ini di dalam transaksi/row-lock (lihat createDevice di lib/devices/service.ts):
   * query Config lewat client `prisma` global di dalam window row-lock berisiko starvation
   * connection-pool, alasan yang sama persis kenapa getConfigInt di sana dipanggil SEBELUM
   * $transaction dibuka.
   */
  baseline?: number;
}

async function resolveBaseline(opts: CapacityOpts): Promise<number> {
  if (opts.baseline !== undefined) return opts.baseline;
  return getConfigInt("printer.defaultSlots", 1);
}

export async function getCapacity(userId: string, opts: CapacityOpts = {}): Promise<number> {
  const client = opts.client ?? prisma;
  const now = new Date();
  const baseline = await resolveBaseline(opts);
  const grants = await client.slotGrant.findMany({
    where: {
      userId,
      active: true,
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }],
    },
  });
  return baseline + grants.reduce((sum, g) => sum + g.quantity, 0);
}

export async function getEligibleDevices(userId: string, opts: CapacityOpts = {}): Promise<Device[]> {
  const client = opts.client ?? prisma;
  const capacity = await getCapacity(userId, opts);
  const devices = await client.device.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return devices.slice(0, capacity);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/printer-slots/capacity.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/printer-slots/capacity.ts apps/saas/lib/printer-slots/capacity.test.ts
git commit -m "feat(saas): add printer-slot capacity/eligibility ledger computation"
```

---

### Task 3: Wire the ledger into `createDevice`/`getDeviceLimit`, replacing `Entitlement.printerSlots`

**Files:**
- Modify: `apps/saas/lib/devices/service.ts:44-47` (`getDeviceLimit`) and
  `:94-122` (`createDevice`)
- Test: `apps/saas/lib/devices/service.test.ts`
- Test: `apps/saas/lib/devices/service.integration.test.ts`

**Interfaces:**
- Consumes: `getCapacity` from `@/lib/printer-slots/capacity` (Task 2).
- Produces: `getDeviceLimit`/`createDevice` unchanged external signatures
  and unchanged error contract (`SlotLimitExceeded` from
  `./errors`, already handled by `app/api/devices/route.ts`'s existing
  catch block — no route or error-class changes needed).

- [ ] **Step 1: Write the failing test**

Add to `apps/saas/lib/devices/service.test.ts`. Read the existing file
first to match its exact `mockTx(count, limit)` helper and `$transaction`
mocking style before writing this — the shape below is illustrative of
what must change (the count/limit mock becomes a count/slotGrant mock):

```typescript
it("computes the limit from SlotGrant rows, not Entitlement.printerSlots", async () => {
  // Arrange: entitlement row exists but has no printerSlots-equivalent field anymore;
  // tx.slotGrant.findMany returns grants summing to +9 on top of baseline 1 => capacity 10.
  const tx = mockTx({ deviceCount: 3, slotGrants: [{ quantity: 9 }] });
  mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
  mockGetConfigInt.mockResolvedValue(1);

  const device = await createDevice("u1", { label: "Ender 3", printerType: "FDM" });

  expect(device).toBeDefined();
  expect(tx.slotGrant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "u1" }) }));
});

it("throws SlotLimitExceeded using the ledger-computed capacity, not printerSlots", async () => {
  const tx = mockTx({ deviceCount: 1, slotGrants: [] }); // capacity = baseline = 1, count already 1
  mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx));
  mockGetConfigInt.mockResolvedValue(1);

  await expect(createDevice("u1", { label: "X", printerType: "FDM" })).rejects.toThrow("SlotLimitExceeded");
});
```

Update `mockTx` in this file to also stub `slotGrant: { findMany: vi.fn().mockResolvedValue(slotGrants ?? []) }` alongside its existing `entitlement`/`device` stubs, keyed off a new `slotGrants` parameter.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/devices/service.test.ts`
Expected: FAIL — `mockTx` doesn't yet accept `slotGrants`, and
`createDevice` still reads `entitlement.printerSlots` (which no longer
exists on the `Entitlement` type after Task 1's migration, so this is
also a compile error until Step 3 below).

- [ ] **Step 3: Update `getDeviceLimit` and `createDevice`**

In `apps/saas/lib/devices/service.ts`, add the import:

```typescript
import { getCapacity } from "@/lib/printer-slots/capacity";
```

Replace `getDeviceLimit` (lines 44-47):

```typescript
export async function getDeviceLimit(userId: string): Promise<number> {
  return getCapacity(userId);
}
```

In `createDevice` (lines 94-122), replace:

```typescript
  const fallbackLimit = await getConfigInt("printer.defaultSlots", 1);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "Entitlement" ("id", "userId", "updatedAt") VALUES (${crypto.randomUUID()}, ${userId}, now()) ON CONFLICT ("userId") DO NOTHING`;
    await tx.$queryRaw`SELECT 1 FROM "Entitlement" WHERE "userId" = ${userId} FOR UPDATE`;
    const entitlement = await tx.entitlement.findUnique({ where: { userId } });
    const limit = entitlement?.printerSlots ?? fallbackLimit;
    const count = await tx.device.count({ where: { userId } });
    if (count >= limit) throw new SlotLimitExceeded(limit);
```

with:

```typescript
  const baseline = await getConfigInt("printer.defaultSlots", 1);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`INSERT INTO "Entitlement" ("id", "userId", "updatedAt") VALUES (${crypto.randomUUID()}, ${userId}, now()) ON CONFLICT ("userId") DO NOTHING`;
    await tx.$queryRaw`SELECT 1 FROM "Entitlement" WHERE "userId" = ${userId} FOR UPDATE`;
    const capacity = await getCapacity(userId, { client: tx, baseline });
    const count = await tx.device.count({ where: { userId } });
    if (count >= capacity) throw new SlotLimitExceeded(capacity);
```

The `Entitlement` row-lock stays exactly as-is — it still serves as the
per-user mutex serializing concurrent `createDevice` calls, even though
the capacity value it guards now comes from `SlotGrant` rows rather than
`Entitlement.printerSlots` directly. `getConfigInt` still runs before
`$transaction` opens, for the same connection-pool-starvation reason
documented in the surrounding comment (unchanged).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/devices/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend the integration test**

Read `apps/saas/lib/devices/service.integration.test.ts` first to match
its existing `beforeAll`/`afterAll` fixture setup. Add a test that
creates a real `SlotGrant` row (via the real `prisma` client, not
mocked) with `quantity: 2`, `active: true`, no `validFrom`/`validUntil`,
attached to the throwaway test user, then asserts `createDevice` allows
creating baseline+2 devices and rejects the next one with
`SlotLimitExceeded` — proving the real Postgres row-lock still correctly
serializes concurrent calls now that capacity is ledger-derived (reuse
the file's existing `Promise.allSettled` concurrent-call pattern for
this).

Run: `DATABASE_URL=<local test db> pnpm --filter @3pb/saas exec vitest run lib/devices/service.integration.test.ts`
Expected: PASS (skipped entirely if `DATABASE_URL` unset, same as today).

- [ ] **Step 6: Commit**

```bash
git add apps/saas/lib/devices/service.ts apps/saas/lib/devices/service.test.ts apps/saas/lib/devices/service.integration.test.ts
git commit -m "feat(saas): gate device pairing on ledger-computed capacity instead of Entitlement.printerSlots"
```

---

### Task 4: Filter `/api/agent/layout` to eligible devices only (FIFO suspension takes effect)

**Files:**
- Modify: `apps/saas/app/api/agent/layout/route.ts`
- Modify: `apps/saas/lib/printer-slots/capacity.ts` (add one export)
- Test: `apps/saas/app/api/agent/layout/route.test.ts` (create if it
  doesn't already exist — check first)

**Interfaces:**
- Consumes: `getEligibleDevices` (Task 2); `getLayoutOrNull` from
  `@/lib/cyd-layout/service` (existing, returns `LayoutConfigOut | null`
  with shape `{ schemaVersion, pages: [{ cells: [{ printer?: string,
  type?: string, ... }] }] }` — cells with a `printer` field reference a
  `Device.shortCode`, per `apps/saas/lib/devices/service.ts:151-171`'s
  `deleteDevice` cleanup logic which filters on the same field).
- Produces: filtered `LayoutConfigOut` returned by the route — this is
  the terminal task in the enforcement chain; nothing later depends on
  it.

**Design note (deviation from the spec's literal wording, confirmed
correct by reading the real code):** the spec described this as "the
device status/telemetry endpoint... check `device.id ∈ eligible set`...
return `capacity_exceeded` instead of the payload," written before
confirming the endpoint's real shape. `/api/agent/layout` actually
returns one multi-device layout (a grid of cells, each optionally
referencing a device by `shortCode`), not a single device's status. A
blanket per-endpoint rejection would hide *eligible* devices' cells
along with suspended ones, which is wrong. The correct mechanism at this
granularity is **per-cell filtering**: strip only the cells referencing
an ineligible device, leave eligible ones untouched. This preserves the
spec's intent (suspended devices never reach live monitoring data)
without discarding data for devices that are still within capacity.

- [ ] **Step 1: Add `getEligibleShortCodes` to `capacity.ts`**

Append to `apps/saas/lib/printer-slots/capacity.ts`:

```typescript
export async function getEligibleShortCodes(userId: string, opts: CapacityOpts = {}): Promise<Set<string>> {
  const client = opts.client ?? prisma;
  const capacity = await getCapacity(userId, opts);
  const devices = await client.device.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { shortCode: true },
  });
  return new Set(devices.slice(0, capacity).map((d) => d.shortCode));
}
```

(`SlotGrantDbClient`'s `device` pick already includes `findMany` with a
`select` option — no type change needed there.)

Add a test to `apps/saas/lib/printer-slots/capacity.test.ts` mirroring
the existing `getEligibleDevices` FIFO test, asserting
`getEligibleShortCodes` returns a `Set` of the oldest devices'
`shortCode`s rather than `id`s, run RED→GREEN the same way as Task 2.

- [ ] **Step 2: Write the failing route test**

First check whether `apps/saas/app/api/agent/layout/route.test.ts`
already exists — if so, read it and add to it; if not, create it
following the mocked-`@/lib/agent-auth`/`@/lib/cyd-layout/service`
pattern used by sibling agent-route tests under `apps/saas/app/api/
agent/`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent-auth", () => ({ requireAgentToken: vi.fn() }));
vi.mock("@/lib/cyd-layout/service", () => ({ getLayoutOrNull: vi.fn() }));
vi.mock("@/lib/printer-slots/capacity", () => ({ getEligibleShortCodes: vi.fn() }));

import { requireAgentToken } from "@/lib/agent-auth";
import { getLayoutOrNull } from "@/lib/cyd-layout/service";
import { getEligibleShortCodes } from "@/lib/printer-slots/capacity";
import { GET } from "./route";

const mockRequireAgentToken = requireAgentToken as ReturnType<typeof vi.fn>;
const mockGetLayoutOrNull = getLayoutOrNull as ReturnType<typeof vi.fn>;
const mockGetEligibleShortCodes = getEligibleShortCodes as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

it("strips cells referencing a suspended (ineligible) device", async () => {
  mockRequireAgentToken.mockResolvedValue({ userId: "u1" });
  mockGetEligibleShortCodes.mockResolvedValue(new Set(["eligible-1"]));
  mockGetLayoutOrNull.mockResolvedValue({
    schemaVersion: 1,
    pages: [
      {
        id: "page-1",
        grid: { cols: 2, rows: 2 },
        fields: [],
        durationSec: 5,
        cells: [
          { printer: "eligible-1", x: 0, y: 0 },
          { printer: "suspended-1", x: 1, y: 0 },
        ],
      },
    ],
  });

  const res = await GET(new Request("http://x/api/agent/layout"));
  const body = await res.json();

  expect(body.pages[0].cells).toEqual([{ printer: "eligible-1", x: 0, y: 0 }]);
});

it("leaves non-printer cells (type-only) untouched", async () => {
  mockRequireAgentToken.mockResolvedValue({ userId: "u1" });
  mockGetEligibleShortCodes.mockResolvedValue(new Set());
  mockGetLayoutOrNull.mockResolvedValue({
    schemaVersion: 1,
    pages: [{ id: "page-1", grid: { cols: 2, rows: 2 }, fields: [], durationSec: 5, cells: [{ type: "clock", x: 0, y: 0 }] }],
  });

  const res = await GET(new Request("http://x/api/agent/layout"));
  const body = await res.json();

  expect(body.pages[0].cells).toEqual([{ type: "clock", x: 0, y: 0 }]);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run app/api/agent/layout/route.test.ts`
Expected: FAIL — the route doesn't filter cells yet.

- [ ] **Step 4: Implement the filter in the route**

Replace the full content of `apps/saas/app/api/agent/layout/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requireAgentToken } from "@/lib/agent-auth";
import { getLayoutOrNull } from "@/lib/cyd-layout/service";
import { getEligibleShortCodes } from "@/lib/printer-slots/capacity";

export async function GET(req: Request) {
  const result = await requireAgentToken(req);
  if (result instanceof NextResponse) return result;
  const layout = await getLayoutOrNull(result.userId);
  if (!layout) return NextResponse.json({ error: "no_layout" }, { status: 404 });

  const eligible = await getEligibleShortCodes(result.userId);
  const filtered = {
    ...layout,
    pages: layout.pages.map((page) => ({
      ...page,
      cells: page.cells.filter((cell) => !("printer" in cell) || eligible.has(cell.printer as string)),
    })),
  };
  return NextResponse.json(filtered);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run app/api/agent/layout/route.test.ts lib/printer-slots/capacity.test.ts`
Expected: PASS, both files.

- [ ] **Step 6: Commit**

```bash
git add apps/saas/app/api/agent/layout/route.ts apps/saas/lib/printer-slots/capacity.ts apps/saas/lib/printer-slots/capacity.test.ts apps/saas/app/api/agent/layout/route.test.ts
git commit -m "feat(saas): strip suspended devices' cells from agent layout telemetry"
```

---

### Task 5: One-off script for admin-issued PROMO grants

**Files:**
- Create: `apps/saas/scripts/grant-promo-slot.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`; `SlotGrant` model (Task 1).
- Produces: nothing consumed by other tasks — a standalone CLI script,
  the accepted minimal substitute for an admin UI (per spec's explicit
  scope decision).

- [ ] **Step 1: Write the script**

Create `apps/saas/scripts/grant-promo-slot.ts`:

```typescript
import "dotenv/config";
import { prisma } from "../lib/db";

/**
 * Pemberian grant PROMO manual oleh admin (bukan lewat UI -- lihat spec
 * sub-project 1 §"CYD Product Variants" & §PROMO exception: admin action
 * cukup script sampai ada kebutuhan nyata utk UI).
 *
 * Usage:
 *   pnpm --filter @3pb/saas exec tsx scripts/grant-promo-slot.ts <userId> <quantity> [validFromISO] [validUntilISO]
 */
async function main() {
  const [userId, quantityStr, validFromStr, validUntilStr] = process.argv.slice(2);
  if (!userId || !quantityStr) {
    console.error("Usage: grant-promo-slot.ts <userId> <quantity> [validFromISO] [validUntilISO]");
    process.exit(1);
  }
  const quantity = Number(quantityStr);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    console.error(`quantity harus bilangan bulat positif, dapat: ${quantityStr}`);
    process.exit(1);
  }

  const grant = await prisma.slotGrant.create({
    data: {
      userId,
      source: "PROMO",
      quantity,
      validFrom: validFromStr ? new Date(validFromStr) : undefined,
      validUntil: validUntilStr ? new Date(validUntilStr) : undefined,
    },
  });
  console.log(`Grant PROMO dibuat: ${grant.id} (+${quantity} slot untuk user ${userId})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm --filter @3pb/saas typecheck`
Expected: PASS (no test for a one-off script — nothing else in this repo
tests `scripts/*.mjs`/`scripts/*.ts` either, consistent with existing
convention).

- [ ] **Step 3: Commit**

```bash
git add apps/saas/scripts/grant-promo-slot.ts
git commit -m "feat(saas): add one-off script for admin-issued PROMO slot grants"
```

---

## Self-Review Notes (completed by the plan author, not a task)

**Spec coverage:** Data model (Task 1), capacity/eligibility logic (Task
2), FIFO enforcement at the pairing point (Task 3), FIFO enforcement at
the telemetry point (Task 4, adapted from the spec's per-device framing
to the real per-cell layout shape — documented inline), PROMO admin path
(Task 5). `CydVariant` seeding is intentionally deferred to sub-project
3's plan, which is the first consumer of variant data — an empty catalog
table is harmless until then.

**Deviations from the spec, both discovered by reading the real code
during planning rather than assumed:**
1. The spec assumed `Entitlement.printerSlots` was inert; it is actually
   read live inside `createDevice()`'s race-proofed transaction. Task 3
   replaces that read in place rather than adding parallel new
   enforcement, preserving the exact lock structure.
2. The spec assumed a per-device telemetry endpoint; `/api/agent/layout`
   is actually per-user multi-device. Task 4 filters at cell granularity
   instead of rejecting the whole response.
3. The spec's `getCapacity`/`getEligibleDeviceIds` signatures took no
   client/baseline parameters. Task 2's actual signatures add both,
   required to preserve `createDevice`'s documented connection-pool-
   starvation avoidance (Config must be read before the transaction
   opens, then passed in — not re-queried through the global client
   while the row lock is held).

**Type consistency:** `getCapacity`/`getEligibleDevices`/
`getEligibleShortCodes` all share the same `CapacityOpts` shape across
Tasks 2 and 4. `SlotLimitExceeded` (existing class, unchanged) is reused
in Task 3 rather than introducing a new error type — its constructor
already takes the numeric limit, which now carries the ledger-computed
value instead of the old static one; no caller-visible change.
