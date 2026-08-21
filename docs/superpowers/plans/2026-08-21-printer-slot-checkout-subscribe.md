# Printer Slot Ledger — Sub-project 4: Checkout Subscribe Bulanan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user subscribe monthly (prepaid, manual renewal) for +5 printer-monitoring slots — at a discounted price if they already own Pro (`lifetimeOwned`) — with automated WA/email reminders before the subscription lapses.

**Architecture:** A new `createOrReuseSubscribeCheckout` service function (mirroring `createSlotCheckout`/`createOrReuseCydCheckout`) creates a `Payment` with `productType: "SUBSCRIBE"`, pricing itself from one of two existing Config keys (`price.sub.owner` if `lifetimeOwned`, else `price.sub.standalone`) — no new Config keys needed, these were already stubbed in `DEFAULT_CONFIG` from an earlier planning phase and left empty/unused. `activate()`'s existing switch gains a `case "SUBSCRIBE"` that creates a period-bounded `SlotGrant` (continuing from the current `subExpiresAt` if not yet lapsed, else starting now) and updates `Entitlement.subStatus`/`subExpiresAt`. A genuinely new piece of infrastructure — BullMQ + the homelab's shared Redis — runs a daily sweep that WA/emails users within 3 days of expiry, wired into the Next.js server via `instrumentation.ts` (a real pattern already used by `apps/dashboard`, though with a simple interval poll rather than BullMQ).

**Tech Stack:** Next.js 16 (`apps/saas`), Prisma, Vitest, BullMQ + ioredis (new dependencies for this app — `ioredis` already used by `apps/dashboard`, `bullmq` is new to the whole monorepo), the existing QRIS-static + unique-code checkout pattern.

**Spec:** `docs/superpowers/specs/2026-08-20-printer-slot-checkout-subscribe-design.md`

## Global Constraints

- Subscribe does **not** gate on `paidCore` — unlike `/beli/slot` and `/beli/cyd`, this is itself a path TO `paidCore` (via the `cloud`/`subStatus` route), not an add-on requiring it first.
- No `AlreadyOwned`-style exclusivity — a user can subscribe even while already owning lifetime Pro (that's exactly when the discount applies), and can renew while already `ACTIVE` (early renewal, continuing the period rather than restarting it).
- Renewal must be gapless: if `subExpiresAt` is still in the future at activation time, the new `SlotGrant`'s `validFrom` continues from the OLD `subExpiresAt` (not `now`) — no lost days, no overlap.
- Every activation creates a NEW `SlotGrant` row (append-only ledger, matching sub-project 1's design) — never update a prior grant row in place.
- Discount pricing is read fresh at EVERY checkout creation (not cached/locked at first subscribe) — this is what makes "discount applies starting the next checkout after buying Pro" work with zero extra logic, already the explicit, user-confirmed design decision from brainstorming.
- The reminder sweep runs once daily, sends at most once per expiry cycle (tracked via `Entitlement.reminderSentForExpiry`, a new field this plan adds), and never blocks the rest of the sweep if one user's send fails.
- `subStatus` is a historical marker ("has ever subscribed"), never itself sufficient to prove current validity — `capabilities()` must check `subExpiresAt` live, exactly like sub-project 1's `getCapacity` checks grant `validUntil` live. This principle is not yet correctly implemented in the current code (see Task 1) — fixing it is in scope for this plan, not a pre-existing correct behavior to preserve.

## Deviations From Assumptions, Found by Reading the Real Code During Planning

1. **`capabilities()` (`apps/saas/lib/entitlement.ts`) does NOT currently check `subExpiresAt` at all** — it only checks `subStatus === "ACTIVE"` as a bare boolean. Since nothing before this plan ever sets `subStatus`, this was latent/unreachable, but once Task 3 starts setting `subStatus: "ACTIVE"` on activation, a lapsed subscriber would keep `paidCore`/`cloud` forever unless this is fixed. Task 1 fixes it.
2. **The Config keys already exist, under different names than assumed while writing the spec.** `DEFAULT_CONFIG` already has `"price.sub.owner": ""` and `"price.sub.standalone": ""` (stubbed since an early 2026-07-16 planning phase, never wired to anything). This plan reuses these exact keys rather than introducing `price.subMonthly`/`price.subMonthlyForOwner` as earlier design language implied — same purpose, already-established naming.
3. **`activate()` already has the exact insertion marker for this case**: the comment `// SUBSCRIBE (sub-project 4) adds its own case here.` sits directly above `default: throw` in the current code (confirmed by reading the file) — Task 3 replaces that comment.
4. **`SlotGrantSource` enum already includes `SUBSCRIBE`** — no schema change needed there. `SlotGrant.validFrom`/`validUntil` already exist (added in sub-project 1, unused by BELI/SLOT_PURCHASE/CYD_PURCHASE's permanent grants) — this plan is the first to actually populate them.
5. **No BullMQ usage exists anywhere in this monorepo** (confirmed via repo-wide grep) — `apps/dashboard` has only a stubbed, never-activated `Queue` reference. This plan's Task 5 is a genuinely new pattern for this codebase, though `apps/dashboard/lib/redis.ts` establishes the `REDIS_URL` env var convention (default `redis://light-generator-redis-1:6379`) this plan follows, and `apps/dashboard/instrumentation.ts` establishes the Next.js boot-hook guard pattern (`NEXT_RUNTIME !== "nodejs"`, `NEXT_PHASE === "phase-production-build"`) this plan mirrors.

---

### Task 1: `capabilities()` live-expiry check

**Files:**
- Modify: `apps/saas/lib/entitlement.ts`
- Modify: `apps/saas/lib/entitlement.test.ts`

**Interfaces:**
- Produces: `EntitlementLike` gains a required `subExpiresAt: Date | null` field; `capabilities(ent: EntitlementLike, now?: Date)` — the new optional `now` parameter defaults to `new Date()`, consumed by no other task directly (every real caller already passes a full Prisma `Entitlement` row, which already has `subExpiresAt`).

- [ ] **Step 1: Write the failing tests**

Read `apps/saas/lib/entitlement.test.ts` first to match its exact existing test style, then add:

```typescript
describe("capabilities — subscription expiry", () => {
  const NOW = new Date("2026-08-21T00:00:00Z");
  const FUTURE = new Date("2026-09-01T00:00:00Z");
  const PAST = new Date("2026-08-01T00:00:00Z");

  it("subStatus ACTIVE with subExpiresAt in the future -> cloud and paidCore true", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE", subExpiresAt: FUTURE }, NOW);
    expect(caps).toEqual({ paidCore: true, cloud: true });
  });

  it("subStatus ACTIVE with subExpiresAt in the past -> cloud and paidCore false (unless lifetimeOwned)", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE", subExpiresAt: PAST }, NOW);
    expect(caps).toEqual({ paidCore: false, cloud: false });
  });

  it("lapsed subscription does not affect paidCore for a separate lifetimeOwned user", () => {
    const caps = capabilities({ lifetimeOwned: true, subStatus: "ACTIVE", subExpiresAt: PAST }, NOW);
    expect(caps).toEqual({ paidCore: true, cloud: false });
  });

  it("subStatus ACTIVE with subExpiresAt null is treated as active (defensive default)", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE", subExpiresAt: null }, NOW);
    expect(caps).toEqual({ paidCore: true, cloud: true });
  });

  it("defaults now to the real current time when not passed", () => {
    const caps = capabilities({ lifetimeOwned: false, subStatus: "ACTIVE", subExpiresAt: new Date(Date.now() + 60_000) });
    expect(caps.cloud).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/entitlement.test.ts -t "subscription expiry"`
Expected: FAIL — `capabilities` doesn't accept/require `subExpiresAt` yet, and doesn't check it.

- [ ] **Step 3: Implement the fix**

In `apps/saas/lib/entitlement.ts`, replace:

```typescript
export interface EntitlementLike {
  lifetimeOwned: boolean;
  subStatus: string; // NONE | ACTIVE | EXPIRED
}

/** Kapabilitas turunan dari entitlement komposit (spec §6). */
export function capabilities(ent: EntitlementLike): { paidCore: boolean; cloud: boolean } {
  const active = ent.subStatus === "ACTIVE";
  return {
    paidCore: ent.lifetimeOwned || active,
    cloud: active,
  };
}
```

with:

```typescript
export interface EntitlementLike {
  lifetimeOwned: boolean;
  subStatus: string; // NONE | ACTIVE -- "ACTIVE" cuma penanda historis ("pernah subscribe"),
  // validitas SEKARANG selalu dicek live lewat subExpiresAt di bawah, bukan lewat status ini
  // sendiri -- prinsip sama seperti getCapacity() live-cek validUntil grant (sub-project 1),
  // supaya tidak butuh job terpisah buat "matiin" status pas lapse.
  subExpiresAt: Date | null;
}

/** Kapabilitas turunan dari entitlement komposit (spec §6). subExpiresAt null + ACTIVE dianggap
 * aktif tanpa batas waktu -- default defensif untuk kasus admin set manual tanpa expiry. */
export function capabilities(ent: EntitlementLike, now = new Date()): { paidCore: boolean; cloud: boolean } {
  const active = ent.subStatus === "ACTIVE" && (ent.subExpiresAt === null || ent.subExpiresAt > now);
  return {
    paidCore: ent.lifetimeOwned || active,
    cloud: active,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/entitlement.test.ts`
Expected: PASS, full file. If any OTHER test file constructs a minimal `EntitlementLike`-shaped object literal without `subExpiresAt` (e.g. in `session-auth.test.ts`, `agent-auth.test.ts`, or route tests that mock `getEntitlement`), it will now fail to typecheck or fail at runtime — grep for `subStatus:` across `apps/saas` test files and add `subExpiresAt: null` (or an appropriate date) to any bare literal you find.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm --filter @3pb/saas exec vitest run`
Expected: PASS, no regressions (this confirms Step 4's grep-and-fix was complete).

Run: `pnpm --filter @3pb/saas typecheck`
Expected: no new errors beyond the already-known pre-existing unrelated ones.

- [ ] **Step 6: Commit**

```bash
git add apps/saas/lib/entitlement.ts apps/saas/lib/entitlement.test.ts
git commit -m "fix(saas): capabilities() checks subExpiresAt live instead of trusting subStatus alone"
```

(Include any other test files touched in Step 4's grep-and-fix in this same commit.)

---

### Task 2: `createOrReuseSubscribeCheckout` service function + API route

**Files:**
- Modify: `apps/saas/lib/payment/service.ts`
- Modify: `apps/saas/lib/payment/service.test.ts`
- Create: `apps/saas/app/api/beli/subscribe/checkout/route.ts`
- Test: `apps/saas/app/api/beli/subscribe/checkout/route.test.ts`

**Interfaces:**
- Consumes: `getEntitlement` (already imported in `service.ts` for the BELI checkout path).
- Produces: `createOrReuseSubscribeCheckout(userId: string, now?: Date): Promise<Payment>` (throws `PriceNotSet | QrisNotSet | CodePoolExhausted`) — consumed by Task 4's checkout UI via the new route. `POST /api/beli/subscribe/checkout` (no body), response `{id, amount, qrPayload, displayPrice}`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/saas/lib/payment/service.test.ts`:

```typescript
describe("createOrReuseSubscribeCheckout", () => {
  it("uses price.sub.standalone when the user does not own lifetime Pro", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.sub.standalone": "50000", "price.sub.owner": "35000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));

    const p = await createOrReuseSubscribeCheckout("u1", NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", productType: "SUBSCRIBE", displayPrice: 50000 }) })
    );
    expect(p.amount).toBe(50000 - 1000 + (p as any).uniqueCode);
  });

  it("uses price.sub.owner (discount) when the user already owns lifetime Pro", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: true });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.sub.standalone": "50000", "price.sub.owner": "35000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));

    await createOrReuseSubscribeCheckout("u1", NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayPrice: 35000 }) })
    );
  });

  it("reuses an existing PENDING SUBSCRIBE payment within the live window", async () => {
    const existing = { id: "p-existing", productType: "SUBSCRIBE", status: "PENDING" };
    (prisma.payment.findFirst as any).mockResolvedValue(existing);

    const p = await createOrReuseSubscribeCheckout("u1", NOW);

    expect(p).toBe(existing);
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(getEntitlement).not.toHaveBeenCalled();
  });

  it("throws PriceNotSet when the applicable price key is unset", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: false });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (getConfig as any).mockImplementation(async () => "");
    await expect(createOrReuseSubscribeCheckout("u1", NOW)).rejects.toBeInstanceOf(PriceNotSet);
  });

  it("does not throw AlreadyOwned even when the user owns lifetime Pro", async () => {
    (getEntitlement as any).mockResolvedValue({ lifetimeOwned: true });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.sub.owner": "35000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));
    await expect(createOrReuseSubscribeCheckout("u1", NOW)).resolves.toBeDefined();
  });
});
```

Add `createOrReuseSubscribeCheckout` to the existing `import { ... } from "@/lib/payment/service"` line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts -t "createOrReuseSubscribeCheckout"`
Expected: FAIL — function not exported yet.

- [ ] **Step 3: Implement `createOrReuseSubscribeCheckout`**

In `apps/saas/lib/payment/service.ts`, add (after `createOrReuseCydCheckout`):

```typescript
export async function createOrReuseSubscribeCheckout(userId: string, now = new Date()): Promise<Payment> {
  const existing = await prisma.payment.findFirst({
    where: { userId, productType: "SUBSCRIBE", status: "PENDING", createdAt: { gt: liveSince(now) } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const ent = await getEntitlement(userId);
  const priceKey = ent.lifetimeOwned ? "price.sub.owner" : "price.sub.standalone";
  const price = parsePrice(await getConfig(priceKey));
  if (price === null || price <= 0) throw new PriceNotSet();
  const staticQ = (await getConfig("qris.static")).trim();
  if (!staticQ) throw new QrisNotSet();
  const buffer = Math.max(1000, parsePrice(await getConfig("price.discountBuffer")) ?? 1000);
  if (price <= buffer) throw new PriceNotSet();

  const code = await allocUniqueCode(now);
  const amount = price - buffer + code;
  const qrPayload = generateDynamicQris(staticQ, amount);

  return prisma.payment.create({
    data: { userId, productType: "SUBSCRIBE", displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING" },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts`
Expected: PASS, full file.

- [ ] **Step 5: Write the failing route test**

Create `apps/saas/app/api/beli/subscribe/checkout/route.test.ts`, mirroring the plain-`auth()`-gated pattern of `apps/saas/app/api/beli/checkout/route.ts` (read it first — this route does NOT use `requirePaidCore()`, since Subscribe is itself a path to `paidCore`):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({ createOrReuseSubscribeCheckout: vi.fn() }));

import { auth } from "@/lib/auth";
import { createOrReuseSubscribeCheckout } from "@/lib/payment/service";
import { PriceNotSet } from "@/lib/payment/errors";
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

it("401 when unauthenticated", async () => {
  (auth as any).mockResolvedValue(null);
  const res = await POST();
  expect(res.status).toBe(401);
});

it("creates a checkout and returns invoice fields", async () => {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (createOrReuseSubscribeCheckout as any).mockResolvedValue({ id: "p1", amount: 49500, qrPayload: "QR", displayPrice: 50000 });
  const res = await POST();
  const data = await res.json();
  expect(res.status).toBe(200);
  expect(data).toEqual({ id: "p1", amount: 49500, qrPayload: "QR", displayPrice: 50000 });
});

it("503 when createOrReuseSubscribeCheckout throws PriceNotSet", async () => {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (createOrReuseSubscribeCheckout as any).mockRejectedValue(new PriceNotSet());
  const res = await POST();
  expect(res.status).toBe(503);
});
```

- [ ] **Step 6: Run route test to verify it fails**

Run: `pnpm --filter @3pb/saas exec vitest run app/api/beli/subscribe/checkout/route.test.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 7: Implement the route**

Create `apps/saas/app/api/beli/subscribe/checkout/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOrReuseSubscribeCheckout } from "@/lib/payment/service";
import { PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const p = await createOrReuseSubscribeCheckout(userId);
    return NextResponse.json({ id: p.id, amount: p.amount, qrPayload: p.qrPayload, displayPrice: p.displayPrice });
  } catch (e) {
    if (e instanceof PriceNotSet || e instanceof QrisNotSet || e instanceof CodePoolExhausted)
      return NextResponse.json({ error: (e as Error).message }, { status: 503 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 8: Run all tests from this task, then commit**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts app/api/beli/subscribe/checkout/route.test.ts`
Expected: PASS.

```bash
git add apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts apps/saas/app/api/beli/subscribe/checkout/route.ts apps/saas/app/api/beli/subscribe/checkout/route.test.ts
git commit -m "feat(saas): add subscribe checkout creation (owner-discount pricing)"
```

---

### Task 3: `activate()` SUBSCRIBE case — gapless period continuation

**Files:**
- Modify: `apps/saas/lib/payment/service.ts`
- Modify: `apps/saas/lib/payment/service.test.ts`

**Interfaces:**
- Produces: `activate()` now supports `SUBSCRIBE` — creates a period-bounded `SlotGrant` (`quantity: 5`, `validFrom`/`validUntil` spanning exactly one `SUBSCRIBE_PERIOD_MS`) and updates `Entitlement.subStatus`/`subStartedAt`/`subExpiresAt`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/saas/lib/payment/service.test.ts` (inside `describe("activate"`):

```typescript
it("productType SUBSCRIBE, first-ever subscribe -> SlotGrant quantity 5, period starts now", async () => {
  (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1", productType: "SUBSCRIBE" });
  (prisma.payment.update as any).mockResolvedValue({ id: "p1", status: "PAID", userId: "u1", productType: "SUBSCRIBE" });
  (prisma.entitlement.findUnique as any).mockResolvedValue(null);

  await activate("p1", "owner@x.com", NOW);

  expect(prisma.slotGrant.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ userId: "u1", source: "SUBSCRIBE", paymentId: "p1", quantity: 5, validFrom: NOW }),
    })
  );
  const call = (prisma.slotGrant.create as any).mock.calls[0][0].data;
  expect(call.validUntil.getTime() - call.validFrom.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  expect(prisma.entitlement.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({ userId: "u1", subStatus: "ACTIVE", subStartedAt: NOW }),
      update: expect.objectContaining({ subStatus: "ACTIVE" }),
    })
  );
});

it("productType SUBSCRIBE, renewal BEFORE lapse -> new period continues from the old subExpiresAt, no gap", async () => {
  const oldExpiry = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 hari lagi, belum lapse
  (prisma.payment.findUnique as any).mockResolvedValue({ id: "p2", status: "PENDING", userId: "u1", productType: "SUBSCRIBE" });
  (prisma.payment.update as any).mockResolvedValue({ id: "p2", status: "PAID", userId: "u1", productType: "SUBSCRIBE" });
  (prisma.entitlement.findUnique as any).mockResolvedValue({ userId: "u1", subStatus: "ACTIVE", subExpiresAt: oldExpiry, subStartedAt: new Date("2026-01-01") });

  await activate("p2", "owner@x.com", NOW);

  const call = (prisma.slotGrant.create as any).mock.calls[0][0].data;
  expect(call.validFrom).toEqual(oldExpiry);
  expect(call.validUntil.getTime()).toBe(oldExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
  expect(prisma.entitlement.upsert).toHaveBeenCalledWith(
    expect.objectContaining({ update: expect.not.objectContaining({ subStartedAt: expect.anything() }) })
  );
});

it("productType SUBSCRIBE, renewal AFTER lapse -> new period starts from now, not the stale old expiry", async () => {
  const oldExpiry = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 hari lalu, sudah lapse
  (prisma.payment.findUnique as any).mockResolvedValue({ id: "p3", status: "PENDING", userId: "u1", productType: "SUBSCRIBE" });
  (prisma.payment.update as any).mockResolvedValue({ id: "p3", status: "PAID", userId: "u1", productType: "SUBSCRIBE" });
  (prisma.entitlement.findUnique as any).mockResolvedValue({ userId: "u1", subStatus: "ACTIVE", subExpiresAt: oldExpiry, subStartedAt: new Date("2026-01-01") });

  await activate("p3", "owner@x.com", NOW);

  const call = (prisma.slotGrant.create as any).mock.calls[0][0].data;
  expect(call.validFrom).toEqual(NOW);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts -t "SUBSCRIBE"`
Expected: FAIL — `activate()`'s switch has no `SUBSCRIBE` case yet.

- [ ] **Step 3: Implement the dispatch case**

Near the top of `apps/saas/lib/payment/service.ts`, alongside `LIVE_WINDOW_MS`, add:

```typescript
export const SUBSCRIBE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
```

In `activate()`'s `switch (p.productType)`, replace the comment line:

```typescript
      // SUBSCRIBE (sub-project 4) adds its own case here.
```

with:

```typescript
      case "SUBSCRIBE": {
        const currentEnt = await tx.entitlement.findUnique({ where: { userId: p.userId } });
        const periodStart = currentEnt?.subExpiresAt && currentEnt.subExpiresAt > now ? currentEnt.subExpiresAt : now;
        const periodEnd = new Date(periodStart.getTime() + SUBSCRIBE_PERIOD_MS);
        await tx.slotGrant.create({
          data: { userId: p.userId, source: "SUBSCRIBE", paymentId: p.id, quantity: 5, validFrom: periodStart, validUntil: periodEnd },
        });
        await tx.entitlement.upsert({
          where: { userId: p.userId },
          create: { userId: p.userId, subStatus: "ACTIVE", subStartedAt: now, subExpiresAt: periodEnd },
          update: { subStatus: "ACTIVE", subExpiresAt: periodEnd },
        });
        break;
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts`
Expected: PASS, full file.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts
git commit -m "feat(saas): activate() creates a gapless period-bounded SlotGrant for subscribe payments"
```

---

### Task 4: Checkout UI — no paidCore gate, shows current status, owner-aware pricing

**Files:**
- Create: `apps/saas/components/BeliSubscribeCheckout.tsx`
- Test: `apps/saas/components/beli-subscribe-checkout.test.tsx`
- Create: `apps/saas/app/beli/subscribe/page.tsx`

**Interfaces:**
- Consumes: `POST /api/beli/subscribe/checkout` (Task 2), no request body, response `{id, amount, qrPayload, displayPrice}`; existing `POST /api/beli/:id/mark-paid` (unmodified, product-agnostic).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing component tests**

Create `apps/saas/components/beli-subscribe-checkout.test.tsx`, mirroring `apps/saas/components/beli-slot-checkout.test.tsx`'s conventions (`.toBeTruthy()`, not jest-dom):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BeliSubscribeCheckout } from "./BeliSubscribeCheckout";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,x")) } }));

beforeEach(() => {
  vi.restoreAllMocks();
});

it("shows the owner-discount hint when isOwner is true", () => {
  render(<BeliSubscribeCheckout price="35000" refundCopy="Refund copy" isOwner={true} />);
  expect(screen.getByText(/harga khusus/i)).toBeTruthy();
});

it("does not show the owner-discount hint when isOwner is false", () => {
  render(<BeliSubscribeCheckout price="50000" refundCopy="Refund copy" isOwner={false} />);
  expect(screen.queryByText(/harga khusus/i)).toBeNull();
});

it("posts to the subscribe checkout endpoint with no body when checking out", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true, status: 200, json: async () => ({ id: "p1", amount: 49500, qrPayload: "QR", displayPrice: 50000 }),
  } as Response);
  render(<BeliSubscribeCheckout price="50000" refundCopy="Refund copy" isOwner={false} />);
  fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/beli/subscribe/checkout", { method: "POST" }));
});

it("shows a 503 message when payment isn't active yet", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "price_not_set" }) } as Response);
  render(<BeliSubscribeCheckout price="50000" refundCopy="Refund copy" isOwner={false} />);
  fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
  await waitFor(() => expect(screen.getByText(/belum aktif/i)).toBeTruthy());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run components/beli-subscribe-checkout.test.tsx`
Expected: FAIL — `./BeliSubscribeCheckout` doesn't exist yet.

- [ ] **Step 3: Implement the component**

Create `apps/saas/components/BeliSubscribeCheckout.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { GlassButton } from "@3pb/ui";
import { compressImage } from "@/lib/image/compress";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
type Invoice = { id: string; amount: number; qrPayload: string; displayPrice: number };

export function BeliSubscribeCheckout({ price, refundCopy, isOwner }: { price: string; refundCopy: string; isOwner: boolean }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [qrSrc, setQrSrc] = useState("");
  const [msg, setMsg] = useState("");
  const [paid, setPaid] = useState(false);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [proofExpired, setProofExpired] = useState(false);

  useEffect(() => {
    if (inv?.qrPayload) QRCode.toDataURL(inv.qrPayload, { width: 240 }).then(setQrSrc).catch(() => {});
  }, [inv?.qrPayload]);

  async function beli() {
    setPending(true); setMsg("");
    const res = await fetch("/api/beli/subscribe/checkout", { method: "POST" });
    setPending(false);
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) { setMsg("Pembayaran belum aktif. Coba lagi nanti."); return; }
    if (!res.ok) { setMsg("Gagal membuat invoice."); return; }
    setInv(data);
  }

  async function sudahBayar() {
    if (!inv || !file) return;
    setPending(true);
    setMsg("");
    try {
      const blob = await compressImage(file);
      const form = new FormData();
      form.append("bukti", new File([blob], "bukti.jpg", { type: "image/jpeg" }));
      const res = await fetch(`/api/beli/${inv.id}/mark-paid`, { method: "POST", body: form });
      if (res.ok) setPaid(true);
      else if (res.status === 503) setMsg("Upload bukti belum aktif. Hubungi admin.");
      else setMsg("Gagal upload bukti, coba lagi.");
    } catch {
      setMsg("Gagal memproses foto, coba lagi.");
    }
    setPending(false);
  }

  const priceNum = Number(price);
  return (
    <div className="flex flex-col gap-3 mt-2">
      {!inv ? (
        !priceNum || priceNum <= 0 ? (
          <p className="text-[13px] g-t3">Pembayaran belum diaktifkan admin. Coba lagi nanti.</p>
        ) : (
        <>
          <p className="text-[13px] g-t2">
            Langganan bulanan — +5 slot printer{isOwner ? " (harga khusus, kamu sudah punya Pro)" : ""}: <b>{rupiah(priceNum)}</b>/bulan
          </p>
          <GlassButton onClick={beli} disabled={pending}>{pending ? "Memproses…" : "Beli sekarang"}</GlassButton>
        </>
        )
      ) : paid ? (
        <>
          <p className="text-[13px] g-t2">Terima kasih! Pembayaran kamu sedang <b>diverifikasi admin</b>. Slot akan bertambah begitu aktif.</p>
          {inv && (proofExpired ? (
            <p className="mt-2 text-[12px] g-t5">Bukti sudah kedaluwarsa</p>
          ) : (
            <img
              src={`/api/beli/${inv.id}/proof`}
              alt="Bukti transfer"
              className="mt-2 rounded-[10px] max-h-48"
              onError={() => setProofExpired(true)}
            />
          ))}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[12px] g-t4 text-center">Scan QRIS & transfer <b>TEPAT</b> nominal ini:</p>
          <div className="text-xl font-bold" style={{ color: "var(--g-accent)" }}>{rupiah(inv.amount)}</div>
          {qrSrc && <img src={qrSrc} alt="QRIS" width={240} height={240} />}
          <p className="text-[11px] g-t4">Invoice berlaku 3 jam.</p>
          <label className="text-[12px] g-t3 flex flex-col gap-1">
            Foto bukti transfer (wajib)
            <input type="file" accept="image/*" aria-label="Foto bukti transfer"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-[12px] g-t4" />
          </label>
          {file && <p className="text-[11px] g-t4">Terpilih: {file.name}</p>}
          <GlassButton onClick={sudahBayar} disabled={pending || !file} className="w-full">
            {pending ? "Mengunggah…" : "Saya sudah bayar"}
          </GlassButton>
          {!file && <p className="text-[11px] g-t5">Upload foto bukti transfer dulu untuk melanjutkan.</p>}
        </div>
      )}
      {msg && <p className="text-[12px] g-t3">{msg}</p>}
      <p className="text-[11px] g-t5 mt-2">
        {refundCopy}{" "}
        <a href="https://www.slizebiz.com/refund" className="underline" target="_blank" rel="noopener noreferrer">Kebijakan lengkap →</a>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run components/beli-subscribe-checkout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Create the page (deliberately NOT gated on paidCore)**

Create `apps/saas/app/beli/subscribe/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getEntitlement } from "@/lib/entitlement";
import { BeliSubscribeCheckout } from "@/components/BeliSubscribeCheckout";
import { PageShell } from "@/components/PageShell";
import { isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function BeliSubscribePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  const isActive = ent.subStatus === "ACTIVE" && ent.subExpiresAt !== null && ent.subExpiresAt > new Date();
  const priceKey = ent.lifetimeOwned ? "price.sub.owner" : "price.sub.standalone";
  const price = await getConfig(priceKey);
  const refund = await getConfig("copy.refund");
  return (
    <PageShell title="Subscribe Bulanan" current="beli" owner={isOwner(session.user?.email)} userLabel={session.user?.email ?? undefined} narrow>
      {isActive && (
        <p className="text-[13px] g-t2 mb-3">
          Langganan kamu aktif sampai <b>{ent.subExpiresAt!.toLocaleDateString("id-ID")}</b>. Perpanjang sekarang biar gak putus.
        </p>
      )}
      <BeliSubscribeCheckout price={price} refundCopy={refund} isOwner={ent.lifetimeOwned} />
    </PageShell>
  );
}
```

- [ ] **Step 6: Verify the app typechecks**

Run: `pnpm --filter @3pb/saas typecheck`
Expected: no new errors beyond the already-known pre-existing unrelated ones.

- [ ] **Step 7: Commit**

```bash
git add apps/saas/components/BeliSubscribeCheckout.tsx apps/saas/components/beli-subscribe-checkout.test.tsx apps/saas/app/beli/subscribe/page.tsx
git commit -m "feat(saas): add subscribe checkout page (no paidCore gate, owner-aware pricing, active-status banner)"
```

---

### Task 5: BullMQ + Redis renewal reminders

**Files:**
- Modify: `apps/saas/package.json`
- Modify: `apps/saas/prisma/schema.prisma`
- Modify: `apps/saas/lib/payment/notify.ts`
- Create: `apps/saas/lib/queue/redis.ts`
- Create: `apps/saas/lib/queue/subscribe-reminders.ts`
- Test: `apps/saas/lib/queue/subscribe-reminders.test.ts`
- Create: `apps/saas/lib/queue/subscribe-reminders.worker.ts`
- Create: `apps/saas/instrumentation.ts`

**Interfaces:**
- Consumes: `sendWA` (`@/lib/wa/client`), `sendEmail` (this task exports it from `notify.ts`, previously private).
- Produces: `sweepSubscribeReminders(now?: Date): Promise<number>` (the testable pure sweep logic — returns count of reminders sent) and `scheduleSubscribeReminderSweep()`/`startSubscribeReminderWorker()` (thin BullMQ wiring, not unit-tested — see Step 8's note on scope).

- [ ] **Step 1: Add the dependencies**

In `apps/saas/package.json`'s `dependencies` block, add (matching the caret-range convention `apps/dashboard/package.json` already uses for `ioredis`):

```json
    "bullmq": "^5.34.4",
    "ioredis": "^5.11.1",
```

Run: `pnpm install`

- [ ] **Step 2: Add the schema field**

In `apps/saas/prisma/schema.prisma`'s `Entitlement` model, add one nullable field (purely additive, safe for `db:push` — no rename/drop, unlike sub-project 1's migration):

```prisma
  reminderSentForExpiry DateTime?
```

Add it right after `subExpiresAt`. Run: `pnpm --filter @3pb/saas exec prisma generate` (schema-only change, no `db:push` needed for local dev against a fresh/test DB, but production deploy will need `db:push` — this is a plain additive nullable column, no special pre-flight required, unlike sub-project 1's rename+drop).

- [ ] **Step 3: Export `sendEmail` from `notify.ts`**

In `apps/saas/lib/payment/notify.ts`, change:

```typescript
async function sendEmail(to: string, msg: string, subject: string): Promise<void> {
```

to:

```typescript
export async function sendEmail(to: string, msg: string, subject: string): Promise<void> {
```

(No other change to this file in this step — no test changes needed either, since this is purely a visibility change with no behavior change to already-tested code.)

- [ ] **Step 4: Write the failing sweep tests**

Create `apps/saas/lib/queue/subscribe-reminders.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    entitlement: { findMany: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/wa/client", () => ({ sendWA: vi.fn() }));
vi.mock("@/lib/payment/notify", () => ({ sendEmail: vi.fn() }));

import { prisma } from "@/lib/db";
import { sendWA } from "@/lib/wa/client";
import { sendEmail } from "@/lib/payment/notify";
import { sweepSubscribeReminders } from "./subscribe-reminders";

const NOW = new Date("2026-08-21T09:00:00Z");
beforeEach(() => vi.clearAllMocks());

it("sends a WA reminder to a user with email null, phone set, expiring within 3 days", async () => {
  const expiry = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  (prisma.entitlement.findMany as any).mockResolvedValue([
    { userId: "u1", subExpiresAt: expiry, reminderSentForExpiry: null, user: { email: null, phone: "628111" } },
  ]);
  const sent = await sweepSubscribeReminders(NOW);
  expect(sendWA).toHaveBeenCalledWith("628111", expect.stringContaining("berakhir"));
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.entitlement.update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { reminderSentForExpiry: expiry } });
  expect(sent).toBe(1);
});

it("sends an email reminder to a user with only email set", async () => {
  const expiry = new Date(NOW.getTime() + 1 * 24 * 60 * 60 * 1000);
  (prisma.entitlement.findMany as any).mockResolvedValue([
    { userId: "u2", subExpiresAt: expiry, reminderSentForExpiry: null, user: { email: "a@b.com", phone: null } },
  ]);
  await sweepSubscribeReminders(NOW);
  expect(sendEmail).toHaveBeenCalledWith("a@b.com", expect.stringContaining("berakhir"), expect.any(String));
  expect(sendWA).not.toHaveBeenCalled();
});

it("skips a user already reminded for this exact expiry cycle", async () => {
  const expiry = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  (prisma.entitlement.findMany as any).mockResolvedValue([
    { userId: "u3", subExpiresAt: expiry, reminderSentForExpiry: expiry, user: { email: "a@b.com", phone: null } },
  ]);
  const sent = await sweepSubscribeReminders(NOW);
  expect(sendEmail).not.toHaveBeenCalled();
  expect(prisma.entitlement.update).not.toHaveBeenCalled();
  expect(sent).toBe(0);
});

it("re-arms after a renewal changes subExpiresAt to a new value", async () => {
  const oldExpiry = new Date(NOW.getTime() - 1000);
  const newExpiry = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  (prisma.entitlement.findMany as any).mockResolvedValue([
    { userId: "u4", subExpiresAt: newExpiry, reminderSentForExpiry: oldExpiry, user: { email: "a@b.com", phone: null } },
  ]);
  const sent = await sweepSubscribeReminders(NOW);
  expect(sendEmail).toHaveBeenCalled();
  expect(sent).toBe(1);
});

it("continues the sweep when one user's send fails", async () => {
  const expiry = new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000);
  (prisma.entitlement.findMany as any).mockResolvedValue([
    { userId: "u5", subExpiresAt: expiry, reminderSentForExpiry: null, user: { email: "fail@b.com", phone: null } },
    { userId: "u6", subExpiresAt: expiry, reminderSentForExpiry: null, user: { email: "ok@b.com", phone: null } },
  ]);
  (sendEmail as any).mockRejectedValueOnce(new Error("resend down")).mockResolvedValueOnce(undefined);
  const sent = await sweepSubscribeReminders(NOW);
  expect(sent).toBe(1);
  expect(prisma.entitlement.update).toHaveBeenCalledTimes(1);
  expect(prisma.entitlement.update).toHaveBeenCalledWith({ where: { userId: "u6" }, data: { reminderSentForExpiry: expiry } });
});

it("queries entitlements with subStatus ACTIVE and subExpiresAt in the (now, now+3d] window", async () => {
  (prisma.entitlement.findMany as any).mockResolvedValue([]);
  await sweepSubscribeReminders(NOW);
  expect(prisma.entitlement.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        subStatus: "ACTIVE",
        subExpiresAt: { gt: NOW, lte: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000) },
      }),
    })
  );
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/queue/subscribe-reminders.test.ts`
Expected: FAIL — `./subscribe-reminders` doesn't exist yet.

- [ ] **Step 6: Implement the sweep logic and BullMQ wiring**

Create `apps/saas/lib/queue/redis.ts`:

```typescript
import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as { redisConnection: IORedis | undefined };

// maxRetriesPerRequest: null wajib buat BullMQ (dia pakai blocking commands yang gak cocok
// sama retry-limit default ioredis). Reuse Redis homelab yang sudah dipakai apps/dashboard
// (lib/redis.ts), prefix nama queue sendiri (lihat subscribe-reminders.ts) biar gak nabrak.
export const redisConnection =
  globalForRedis.redisConnection ??
  new IORedis(process.env.REDIS_URL ?? "redis://light-generator-redis-1:6379", {
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisConnection = redisConnection;
}
```

Create `apps/saas/lib/queue/subscribe-reminders.ts`:

```typescript
import { Queue } from "bullmq";
import { redisConnection } from "./redis";
import { prisma } from "@/lib/db";
import { sendWA } from "@/lib/wa/client";
import { sendEmail } from "@/lib/payment/notify";

const REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // H-3

export const subscribeReminderQueue = new Queue("slizebiz:subscribe-reminders", { connection: redisConnection });

/** Daftarkan job berulang harian (jam 9 pagi). BullMQ dedupe berdasarkan jobId+pattern -- aman
 * dipanggil ulang tiap boot server, gak bikin duplikat. */
export async function scheduleSubscribeReminderSweep(): Promise<void> {
  await subscribeReminderQueue.add(
    "sweep",
    {},
    { repeat: { pattern: "0 9 * * *" }, jobId: "subscribe-reminder-sweep" }
  );
}

/** Logika sapuan murni -- dites langsung, dipanggil oleh worker BullMQ (lihat
 * subscribe-reminders.worker.ts). H-3, kirim sekali per siklus expiry (reminderSentForExpiry),
 * gagal 1 user gak menghentikan sisanya. */
export async function sweepSubscribeReminders(now = new Date()): Promise<number> {
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const candidates = await prisma.entitlement.findMany({
    where: { subStatus: "ACTIVE", subExpiresAt: { gt: now, lte: windowEnd } },
    include: { user: { select: { email: true, phone: true } } },
  });

  let sent = 0;
  for (const ent of candidates) {
    if (ent.reminderSentForExpiry?.getTime() === ent.subExpiresAt?.getTime()) continue;
    const dateStr = ent.subExpiresAt!.toLocaleDateString("id-ID");
    const msg = `Langganan Slizebiz kamu berakhir ${dateStr} — perpanjang sebelum slot printer berkurang.`;
    try {
      if (ent.user.email) await sendEmail(ent.user.email, msg, "Langganan Slizebiz segera berakhir");
      else if (ent.user.phone) await sendWA(ent.user.phone, msg);
      else {
        console.warn(`[subscribe-reminder] user ${ent.userId} tak punya email maupun phone, dilewati`);
        continue;
      }
      await prisma.entitlement.update({ where: { userId: ent.userId }, data: { reminderSentForExpiry: ent.subExpiresAt } });
      sent++;
    } catch (e) {
      console.error(`[subscribe-reminder] gagal kirim ke user ${ent.userId}:`, (e as Error).message);
    }
  }
  return sent;
}
```

Create `apps/saas/lib/queue/subscribe-reminders.worker.ts`:

```typescript
import { Worker } from "bullmq";
import { redisConnection } from "./redis";
import { sweepSubscribeReminders } from "./subscribe-reminders";

let worker: Worker | null = null;

/** Idempoten -- boleh dipanggil ulang, gak bikin worker kedua. */
export function startSubscribeReminderWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(
    "slizebiz:subscribe-reminders",
    async () => {
      await sweepSubscribeReminders();
    },
    { connection: redisConnection }
  );
  worker.on("failed", (job, err) => {
    console.error(`[subscribe-reminder-worker] job ${job?.id} gagal:`, err.message);
  });
  return worker;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/queue/subscribe-reminders.test.ts`
Expected: PASS.

- [ ] **Step 8: Wire the worker+scheduler into server boot via `instrumentation.ts`**

Create `apps/saas/instrumentation.ts` (mirroring `apps/dashboard/instrumentation.ts`'s boot-guard pattern — read that file first to match its exact guard conditions):

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { scheduleSubscribeReminderSweep } = await import("@/lib/queue/subscribe-reminders");
  const { startSubscribeReminderWorker } = await import("@/lib/queue/subscribe-reminders.worker");

  startSubscribeReminderWorker();
  await scheduleSubscribeReminderSweep();
}
```

**No test for this file** — it is thin infrastructure wiring (starts a real Redis connection, real BullMQ Worker/Queue) with no branching logic of its own; the actual behavior it wires together (`sweepSubscribeReminders`) is already fully unit-tested in Step 4. This matches the existing convention in this codebase of not testing pure infra-glue files (e.g. `apps/saas/lib/db.ts` has no test). Verify manually that `pnpm --filter @3pb/saas typecheck` passes for this file — that's the only automated check it gets.

- [ ] **Step 9: Run the full suite and typecheck**

Run: `pnpm --filter @3pb/saas exec vitest run`
Expected: PASS, no regressions.

Run: `pnpm --filter @3pb/saas typecheck`
Expected: no new errors beyond the already-known pre-existing unrelated ones.

- [ ] **Step 10: Commit**

```bash
git add apps/saas/package.json apps/saas/pnpm-lock.yaml apps/saas/prisma/schema.prisma apps/saas/lib/payment/notify.ts apps/saas/lib/queue apps/saas/instrumentation.ts
git commit -m "feat(saas): add BullMQ+Redis daily sweep for subscribe renewal reminders (H-3, WA/email)"
```

(If `pnpm install` in Step 1 updated the root `pnpm-lock.yaml` instead of a per-app one, adjust the `git add` path accordingly — this is a pnpm workspace, lockfile lives at the repo root.)

---

### Task 6: Activation notification + admin product label for SUBSCRIBE

**Files:**
- Modify: `apps/saas/lib/payment/notify.ts`
- Modify: `apps/saas/lib/payment/notify.test.ts`
- Modify: `apps/saas/components/admin/PaymentQueue.tsx`
- Modify: `apps/saas/components/admin/payment-queue.test.tsx`
- Modify: `apps/saas/components/admin/PaidList.tsx`
- Modify: `apps/saas/components/admin/paid-list.test.tsx`

**Interfaces:**
- Consumes: nothing new — last task in this plan, closes the same gap sub-project 3's Task 5 closed for `CYD_PURCHASE` (both `notify.ts` and `productLabel()` silently mishandling a new productType until explicitly taught about it).

- [ ] **Step 1: Write the failing notify test**

Add to `apps/saas/lib/payment/notify.test.ts`:

```typescript
it("productType SUBSCRIBE -> pesan sebut langganan aktif, bukan pesan BELI generik", async () => {
  await notifyActivated({ phone: "628111", email: null }, { productType: "SUBSCRIBE", quantity: null });
  expect(sendWA).toHaveBeenCalledWith("628111", expect.stringContaining("langganan"));
  expect(sendWA).toHaveBeenCalledWith("628111", expect.not.stringContaining("akun Slizebiz kamu sudah aktif"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/notify.test.ts -t "SUBSCRIBE"`
Expected: FAIL — `messageFor`/`subjectFor` have no `SUBSCRIBE` branch yet.

- [ ] **Step 3: Implement the notification branch**

In `apps/saas/lib/payment/notify.ts`, update `messageFor` and `subjectFor`:

```typescript
function messageFor(payment: ActivatedPayment): string {
  if (payment.productType === "SLOT_PURCHASE") {
    return `Pembayaran terverifikasi — kapasitas monitoring printer kamu bertambah ${payment.quantity} slot 🎉 Terima kasih!`;
  }
  if (payment.productType === "CYD_PURCHASE") {
    return `Pembayaran terverifikasi — kapasitas monitoring printer kamu sudah bertambah sekarang. CYD kamu akan segera dikirim ke alamat yang kamu daftarkan. Terima kasih! 🎉`;
  }
  if (payment.productType === "SUBSCRIBE") {
    return `Pembayaran terverifikasi — langganan Slizebiz kamu aktif, kapasitas monitoring printer bertambah 5 slot 🎉 Terima kasih!`;
  }
  return MSG_BELI;
}

function subjectFor(payment: ActivatedPayment): string {
  if (payment.productType === "SLOT_PURCHASE") return "Slot printer bertambah";
  if (payment.productType === "CYD_PURCHASE") return "Pembayaran CYD terverifikasi";
  if (payment.productType === "SUBSCRIBE") return "Langganan Slizebiz aktif";
  return "Akun Slizebiz aktif";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/notify.test.ts`
Expected: PASS, full file.

- [ ] **Step 5: Write the failing productLabel tests**

Add to `apps/saas/components/admin/payment-queue.test.tsx` and `apps/saas/components/admin/paid-list.test.tsx` (mirror the existing `SLOT_PURCHASE`/`CYD_PURCHASE` tests already in each file):

```typescript
it("shows 'Subscribe bulanan' for a SUBSCRIBE row", () => {
  render(<PaymentQueue rows={[
    { id: "p1", amount: 50000, who: "u1", ageMin: 5, marked: false, hasProof: false, productType: "SUBSCRIBE", quantity: null },
  ]} />);
  expect(screen.getByText("Subscribe bulanan")).toBeTruthy();
});
```

(Adjust the component name/import for `paid-list.test.tsx`'s equivalent, following that file's existing row-shape convention.)

- [ ] **Step 6: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run components/admin/payment-queue.test.tsx components/admin/paid-list.test.tsx -t "SUBSCRIBE"`
Expected: FAIL — `productLabel` doesn't recognize `SUBSCRIBE` yet.

- [ ] **Step 7: Update `productLabel` in both files**

In both `apps/saas/components/admin/PaymentQueue.tsx` and `apps/saas/components/admin/PaidList.tsx`, change:

```typescript
function productLabel(r: { productType: string; quantity: number | null }): string {
  if (r.productType === "BELI") return "Pro (lifetime)";
  if (r.productType === "SLOT_PURCHASE") return `Slot ×${r.quantity}`;
  if (r.productType === "CYD_PURCHASE") return `CYD ×${r.quantity}`;
  return r.productType;
}
```

to:

```typescript
function productLabel(r: { productType: string; quantity: number | null }): string {
  if (r.productType === "BELI") return "Pro (lifetime)";
  if (r.productType === "SLOT_PURCHASE") return `Slot ×${r.quantity}`;
  if (r.productType === "CYD_PURCHASE") return `CYD ×${r.quantity}`;
  if (r.productType === "SUBSCRIBE") return "Subscribe bulanan";
  return r.productType;
}
```

`PaidList.tsx`'s "Nonaktifkan" button is already conditional on `r.productType === "BELI"` — `SUBSCRIBE` rows are already correctly excluded from it with no further change needed there (confirmed by reading the current file: the condition is an explicit equality check, not a negated exclusion list, so a new productType is excluded by default).

- [ ] **Step 8: Run the full suite and typecheck**

Run: `pnpm --filter @3pb/saas exec vitest run`
Expected: PASS, no regressions.

Run: `pnpm --filter @3pb/saas typecheck`
Expected: no new errors beyond the already-known pre-existing unrelated ones.

- [ ] **Step 9: Commit**

```bash
git add apps/saas/lib/payment/notify.ts apps/saas/lib/payment/notify.test.ts apps/saas/components/admin/PaymentQueue.tsx apps/saas/components/admin/payment-queue.test.tsx apps/saas/components/admin/PaidList.tsx apps/saas/components/admin/paid-list.test.tsx
git commit -m "feat(saas): activation notification + admin product label for SUBSCRIBE"
```

---

## Self-Review Notes (completed by the plan author, not a task)

**Spec coverage:** Owner-discount pricing computed fresh per checkout (Task 2), gapless period-continuation on renewal (Task 3), no `paidCore` gate + active-status display (Task 4), H-3 automated reminders via BullMQ (Task 5), activation notification + admin visibility (Task 6). All covered. `subStatus` treated as a historical marker with live `subExpiresAt` checks — the principle the original spec called for, now actually implemented (Task 1 fixes the one place it wasn't).

**Deviations found by reading the real code during planning, not assumed from the spec:** `capabilities()` didn't check expiry at all (Task 1, a real latent bug this plan is the first to trigger); the Config keys already existed under `price.sub.owner`/`price.sub.standalone`, not the names implied by earlier design language (Task 2 uses the real names); `activate()`'s insertion point was already marked by a prior sub-project's comment (Task 3); BullMQ is genuinely new to this monorepo, `ioredis`/the `REDIS_URL` convention/the `instrumentation.ts` boot pattern are not (Task 5, follows `apps/dashboard`'s established conventions rather than inventing new ones).

**Type consistency:** `createOrReuseSubscribeCheckout`'s return shape (`Payment`, no `quantity`/`cydVariantId` fields relevant) matches what Task 4's route/UI expect (`{id, amount, qrPayload, displayPrice}`, no extra fields, unlike sub-project 2/3's quantity-bearing responses). `sweepSubscribeReminders`'s `Entitlement` query shape (`subStatus`, `subExpiresAt`, `reminderSentForExpiry`, `user.email`/`user.phone`) matches the real schema fields with no renaming. `SUBSCRIBE_PERIOD_MS` (Task 3) is a single named constant, not duplicated between the checkout and activation logic (checkout doesn't need to know the period length at all — only `activate()` does).
