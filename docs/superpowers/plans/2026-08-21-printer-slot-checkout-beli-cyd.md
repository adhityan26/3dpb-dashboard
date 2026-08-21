# Printer Slot Ledger — Sub-project 3: Checkout Beli CYD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `paidCore` user buy a physical CYD unit (choosing a variant — with/without casing — and quantity), providing a shipping address, via the existing QRIS-manual-verify checkout pattern, granting a `SlotGrant` (quantity × the variant's `slotBonus`) on admin approval, with an admin surface to track shipping fulfillment.

**Architecture:** A new `createOrReuseCydCheckout` service function (mirroring sub-project 2's `createSlotCheckout`) creates a `Payment` row with `productType: "CYD_PURCHASE"`, `cydVariantId`, `quantity`, and `shippingAddress`. `activate()`'s existing `productType` switch (already transactional, already handling `BELI`/`SLOT_PURCHASE`) gets a new `case "CYD_PURCHASE"` that looks up the variant's `slotBonus` and creates the `SlotGrant`. A new checkout page/component adds variant selection and a shipping-address field on top of the sub-project-2 pattern. Fulfillment tracking (shipping cost/status) is a new tab in the existing single-page admin surface (`/admin`, tab-based — this app has no precedent for a second owner-gated route), not a separate page.

**Tech Stack:** Next.js 16 (`apps/saas`), Prisma (`prisma db push`, no migration files), Vitest, the existing QRIS-static + unique-code checkout pattern (`lib/payment/service.ts`).

**Spec:** `docs/superpowers/specs/2026-08-20-printer-slot-checkout-beli-cyd-design.md`

## Global Constraints

- Shipping cost is **fully manual** — never part of checkout `amount`, never charged through QRIS. `shippingAddress` is required at checkout; `shippingCost` is admin-entered bookkeeping only, after the fact.
- `activate()` is a **shared extension point** (already used by `BELI`/`SLOT_PURCHASE`, wrapped in `prisma.$transaction`) — add a `case "CYD_PURCHASE"` in place, do not restructure the switch.
- Reuse-pending logic for CYD checkout must key on `productType: "CYD_PURCHASE"` **and** matching `cydVariantId` **and** matching `quantity` (either changing invalidates the cached `amount`). If only `shippingAddress` differs from an existing PENDING payment, update the address in place rather than creating a new payment.
- `CydVariant.slotBonus` (not a hardcoded `10`) determines the `SlotGrant` quantity per unit — this is what lets a future larger/hi-res CYD model grant a different amount without code changes.
- No `AlreadyOwned`-style exclusivity guard — CYD purchases are repeatable (a user can buy more than one).

## Deviations From the Spec, Found by Reading the Current Code (not the spec's assumptions)

1. **The spec claims `activate()` "already handles `CYD_PURCHASE`" — this is false as of the current code.** `activate()`'s switch currently has exactly `case "BELI"`, `case "SLOT_PURCHASE"`, and `default: throw`, with a comment marking where `CYD_PURCHASE` goes. Task 3 below adds the real case.
2. **`productLabel()` (admin `PaymentQueue.tsx`/`PaidList.tsx`) and `messageFor()`/`subjectFor()` (`notify.ts`) both fall through to generic/wrong output for `CYD_PURCHASE`** — the admin tables would show the raw string `"CYD_PURCHASE"`, and buyers would receive the BELI-worded "akun kamu aktif" message instead of anything about their shipment. Neither gap is mentioned in the spec; both are fixed in this plan (Tasks 3 and 5).
3. **No `CydVariant` seed mechanism exists anywhere in this repo** (no seed script, no migrations directory — this app uses `prisma db push`). Task 1 creates the first one, following the existing `apps/saas/scripts/grant-promo-slot.ts` one-off-script pattern from sub-project 1 (not a `db:seed-*` pnpm script, since no such convention exists in `apps/saas`).
4. **No precedent for a second owner-gated admin page or route** — `/admin` is a single page with client-side hash-routed tabs (`AdminTabs.tsx`). Fulfillment tracking becomes a new tab in that existing array, not a new `/admin/cyd-orders` route, for consistency with how this app is actually built. This differs from the spec's literal "New admin page" wording but preserves its actual requirement (a distinct view for post-payment CYD orders, separate from the payment-verification queue).

## Task Sequencing Note

Tasks 1-3 (schema-adjacent additions, checkout creation, activation) can each be reviewed independently. Task 4 (checkout UI) depends on Task 2's route. Task 5 (admin fulfillment) depends on Task 3's `CYD_PURCHASE` payments existing and is independent of Task 4.

---

### Task 1: Error classes + `CydVariant` seed script

**Files:**
- Modify: `apps/saas/lib/payment/errors.ts`
- Create: `apps/saas/scripts/seed-cyd-variants.ts`
- Modify: `apps/saas/prisma/schema.prisma` (comment accuracy only, see Step 4)

**Interfaces:**
- Produces: `InvalidShippingAddress`, `InvalidCydVariant` error classes — consumed by Task 2's `createOrReuseCydCheckout` and Task 4's API route.

- [ ] **Step 1: Add the error classes**

In `apps/saas/lib/payment/errors.ts`, add:

```typescript
export class InvalidShippingAddress extends Error {
  constructor() {
    super("invalid_shipping_address");
    this.name = "InvalidShippingAddress";
  }
}

export class InvalidCydVariant extends Error {
  constructor() {
    super("invalid_cyd_variant");
    this.name = "InvalidCydVariant";
  }
}
```

- [ ] **Step 2: Write the seed script**

Create `apps/saas/scripts/seed-cyd-variants.ts`, following the exact pattern of the existing `apps/saas/scripts/grant-promo-slot.ts` (import style, `main().catch().finally()` shape):

```typescript
import "dotenv/config";
import { prisma } from "../lib/db";

/**
 * Seed idempoten untuk 2 varian CYD yang ada saat ini (dengan/tanpa casing). Model masa depan
 * (ukuran lebih besar/hi-res) tinggal insert row baru -- lihat spec sub-project 1 §"CYD Product
 * Variants". Cek-by-label dulu (bukan upsert Prisma biasa, karena CydVariant tidak punya unique
 * key selain id) supaya aman dijalankan berkali-kali.
 *
 * Usage: pnpm --filter @3pb/saas exec tsx scripts/seed-cyd-variants.ts
 */
const VARIANTS = [
  { label: "CYD Standar (dengan casing)", price: 250000, slotBonus: 10 },
  { label: "CYD Standar (tanpa casing)", price: 180000, slotBonus: 10 },
];

async function main() {
  for (const v of VARIANTS) {
    const existing = await prisma.cydVariant.findFirst({ where: { label: v.label } });
    if (existing) {
      console.log(`Sudah ada, dilewati: ${v.label} (${existing.id})`);
      continue;
    }
    const created = await prisma.cydVariant.create({ data: v });
    console.log(`Dibuat: ${v.label} (${created.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm --filter @3pb/saas typecheck`
Expected: no new errors beyond the already-known pre-existing unrelated ones (vitest/Awaitable type mismatches, SliceInfoPlate mismatch — documented in sub-project 1's plan). No test for this script — consistent with `grant-promo-slot.ts`, the established convention for one-off scripts in this repo.

- [ ] **Step 4: Fix the stale `productType` comment**

In `apps/saas/prisma/schema.prisma`, the `Payment` model has a comment `// "BELI" | "CYD" | "SLOT_PURCHASE" | "SUBSCRIBE"` on the `productType` field — this predates sub-project 2 and no longer matches reality (the actual value is `"CYD_PURCHASE"`, not `"CYD"`). Change it to:

```prisma
  productType     String // "BELI" | "CYD_PURCHASE" | "SLOT_PURCHASE" | "SUBSCRIBE"
```

This is a comment-only change — no schema structure changes, no `db:push` needed.

- [ ] **Step 5: Commit**

```bash
git add apps/saas/lib/payment/errors.ts apps/saas/scripts/seed-cyd-variants.ts apps/saas/prisma/schema.prisma
git commit -m "feat(saas): add CYD checkout error classes + variant seed script"
```

---

### Task 2: `createOrReuseCydCheckout` service function + API route

**Files:**
- Modify: `apps/saas/lib/payment/service.ts`
- Modify: `apps/saas/lib/payment/service.test.ts`
- Create: `apps/saas/app/api/beli/cyd/checkout/route.ts`
- Test: `apps/saas/app/api/beli/cyd/checkout/route.test.ts`

**Interfaces:**
- Consumes: `InvalidShippingAddress`, `InvalidCydVariant` (Task 1).
- Produces: `createOrReuseCydCheckout(userId: string, cydVariantId: string, quantity: number, shippingAddress: string, now?: Date): Promise<Payment>` (throws `InvalidQuantity | InvalidShippingAddress | InvalidCydVariant | QrisNotSet | CodePoolExhausted`) — consumed by Task 4's checkout UI via the new route. `POST /api/beli/cyd/checkout` (body `{cydVariantId, quantity, shippingAddress}`, response `{id, amount, qrPayload, displayPrice, quantity, cydVariantId, shippingAddress}`).

- [ ] **Step 1: Write the failing tests**

Add to `apps/saas/lib/payment/service.test.ts`:

```typescript
describe("createOrReuseCydCheckout", () => {
  it("throws InvalidQuantity for zero, negative, or non-integer quantity", async () => {
    await expect(createOrReuseCydCheckout("u1", "variant-1", 0, "Jl. Contoh 1")).rejects.toThrow(InvalidQuantity);
    await expect(createOrReuseCydCheckout("u1", "variant-1", -1, "Jl. Contoh 1")).rejects.toThrow(InvalidQuantity);
    await expect(createOrReuseCydCheckout("u1", "variant-1", 1.5, "Jl. Contoh 1")).rejects.toThrow(InvalidQuantity);
  });

  it("throws InvalidShippingAddress for empty or whitespace-only address", async () => {
    await expect(createOrReuseCydCheckout("u1", "variant-1", 1, "")).rejects.toThrow(InvalidShippingAddress);
    await expect(createOrReuseCydCheckout("u1", "variant-1", 1, "   ")).rejects.toThrow(InvalidShippingAddress);
  });

  it("throws InvalidCydVariant when the variant doesn't exist or is inactive", async () => {
    (prisma.cydVariant.findUnique as any).mockResolvedValue(null);
    await expect(createOrReuseCydCheckout("u1", "missing-variant", 1, "Jl. Contoh 1")).rejects.toThrow(InvalidCydVariant);

    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "X", price: 100000, slotBonus: 10, active: false });
    await expect(createOrReuseCydCheckout("u1", "v1", 1, "Jl. Contoh 1")).rejects.toThrow(InvalidCydVariant);
  });

  it("creates a Payment with productType CYD_PURCHASE, cydVariantId, quantity, shippingAddress, amount = quantity * variant.price - buffer + code", async () => {
    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "CYD dengan casing", price: 100000, slotBonus: 10, active: true });
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) => ({ "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? "");
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));

    const p = await createOrReuseCydCheckout("u1", "v1", 2, "Jl. Contoh 1", NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1", productType: "CYD_PURCHASE", cydVariantId: "v1", quantity: 2,
          shippingAddress: "Jl. Contoh 1", displayPrice: 200000,
        }),
      })
    );
    expect(p.amount).toBe(200000 - 1000 + (p as any).uniqueCode);
  });

  it("reuses an existing PENDING payment with the same variant and quantity, updating shippingAddress in place if it changed", async () => {
    const existing = { id: "p-existing", productType: "CYD_PURCHASE", cydVariantId: "v1", quantity: 2, shippingAddress: "Old Address", status: "PENDING" };
    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "X", price: 100000, slotBonus: 10, active: true });
    (prisma.payment.findFirst as any).mockResolvedValue(existing);
    (prisma.payment.update as any).mockImplementation(async ({ data }: any) => ({ ...existing, ...data }));

    const p = await createOrReuseCydCheckout("u1", "v1", 2, "New Address", NOW);

    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p-existing" }, data: { shippingAddress: "New Address" } })
    );
    expect(p.shippingAddress).toBe("New Address");
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("reuses without updating when shippingAddress is unchanged", async () => {
    const existing = { id: "p-existing", productType: "CYD_PURCHASE", cydVariantId: "v1", quantity: 2, shippingAddress: "Same Address", status: "PENDING" };
    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "X", price: 100000, slotBonus: 10, active: true });
    (prisma.payment.findFirst as any).mockResolvedValue(existing);

    const p = await createOrReuseCydCheckout("u1", "v1", 2, "Same Address", NOW);

    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(p).toBe(existing);
  });

  it("creates a new payment when quantity or variant differs from the existing PENDING one", async () => {
    (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "X", price: 100000, slotBonus: 10, active: true });
    (prisma.payment.findFirst as any).mockResolvedValue(null); // no PENDING row matches variant+quantity
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (getConfig as any).mockImplementation(async (k: string) => ({ "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? "");
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new-2", ...data }));

    await createOrReuseCydCheckout("u1", "v1", 5, "Jl. Contoh 1", NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 5 }) })
    );
  });
});
```

Add `cydVariant: { findUnique: vi.fn() }` to the `prisma` mock object at the top of the test file, and add `createOrReuseCydCheckout` to the existing `import { ... } from "@/lib/payment/service"` line and `InvalidShippingAddress, InvalidCydVariant` to the existing `import { ... } from "@/lib/payment/errors"` line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts -t "createOrReuseCydCheckout"`
Expected: FAIL — `createOrReuseCydCheckout` is not exported yet.

- [ ] **Step 3: Implement `createOrReuseCydCheckout`**

In `apps/saas/lib/payment/service.ts`, add `InvalidShippingAddress, InvalidCydVariant` to the existing errors import, then add (after `createSlotCheckout`):

```typescript
export async function createOrReuseCydCheckout(
  userId: string,
  cydVariantId: string,
  quantity: number,
  shippingAddress: string,
  now = new Date()
): Promise<Payment> {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new InvalidQuantity();
  if (!shippingAddress.trim()) throw new InvalidShippingAddress();

  const variant = await prisma.cydVariant.findUnique({ where: { id: cydVariantId } });
  if (!variant || !variant.active) throw new InvalidCydVariant();

  const existing = await prisma.payment.findFirst({
    where: { userId, productType: "CYD_PURCHASE", cydVariantId, quantity, status: "PENDING", createdAt: { gt: liveSince(now) } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    if (existing.shippingAddress !== shippingAddress) {
      return prisma.payment.update({ where: { id: existing.id }, data: { shippingAddress } });
    }
    return existing;
  }

  const staticQ = (await getConfig("qris.static")).trim();
  if (!staticQ) throw new QrisNotSet();
  const buffer = Math.max(1000, parsePrice(await getConfig("price.discountBuffer")) ?? 1000);
  const price = variant.price * quantity;
  if (price <= buffer) throw new PriceNotSet();

  const code = await allocUniqueCode(now);
  const amount = price - buffer + code;
  const qrPayload = generateDynamicQris(staticQ, amount);

  return prisma.payment.create({
    data: {
      userId, productType: "CYD_PURCHASE", cydVariantId, quantity, shippingAddress,
      displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING",
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts`
Expected: PASS, full file.

- [ ] **Step 5: Write the failing route test**

Create `apps/saas/app/api/beli/cyd/checkout/route.test.ts`, mirroring `apps/saas/app/api/beli/slot/checkout/route.ts`'s existing test file exactly (check it first for the precise mocking style), adapted for the extra body fields:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session-auth", () => ({ requirePaidCore: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({ createOrReuseCydCheckout: vi.fn() }));

import { requirePaidCore } from "@/lib/session-auth";
import { createOrReuseCydCheckout } from "@/lib/payment/service";
import { InvalidQuantity, InvalidShippingAddress, InvalidCydVariant, PriceNotSet } from "@/lib/payment/errors";
import { POST } from "./route";
import { NextResponse } from "next/server";

beforeEach(() => vi.clearAllMocks());

function req(body: unknown) {
  return new Request("http://x/api/beli/cyd/checkout", { method: "POST", body: JSON.stringify(body) });
}

it("returns the gate's response when not paidCore", async () => {
  (requirePaidCore as any).mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  const res = await POST(req({ cydVariantId: "v1", quantity: 1, shippingAddress: "X" }));
  expect(res.status).toBe(403);
});

it("creates a checkout and returns invoice fields", async () => {
  (requirePaidCore as any).mockResolvedValue({ userId: "u1" });
  (createOrReuseCydCheckout as any).mockResolvedValue({
    id: "p1", amount: 199000, qrPayload: "QR", displayPrice: 200000, quantity: 2, cydVariantId: "v1", shippingAddress: "Jl. X",
  });
  const res = await POST(req({ cydVariantId: "v1", quantity: 2, shippingAddress: "Jl. X" }));
  const data = await res.json();
  expect(res.status).toBe(200);
  expect(data).toEqual({ id: "p1", amount: 199000, qrPayload: "QR", displayPrice: 200000, quantity: 2, cydVariantId: "v1", shippingAddress: "Jl. X" });
  expect(createOrReuseCydCheckout).toHaveBeenCalledWith("u1", "v1", 2, "Jl. X");
});

it("400 when InvalidQuantity", async () => {
  (requirePaidCore as any).mockResolvedValue({ userId: "u1" });
  (createOrReuseCydCheckout as any).mockRejectedValue(new InvalidQuantity());
  const res = await POST(req({ cydVariantId: "v1", quantity: 0, shippingAddress: "X" }));
  expect(res.status).toBe(400);
});

it("400 when InvalidShippingAddress", async () => {
  (requirePaidCore as any).mockResolvedValue({ userId: "u1" });
  (createOrReuseCydCheckout as any).mockRejectedValue(new InvalidShippingAddress());
  const res = await POST(req({ cydVariantId: "v1", quantity: 1, shippingAddress: "" }));
  expect(res.status).toBe(400);
});

it("400 when InvalidCydVariant", async () => {
  (requirePaidCore as any).mockResolvedValue({ userId: "u1" });
  (createOrReuseCydCheckout as any).mockRejectedValue(new InvalidCydVariant());
  const res = await POST(req({ cydVariantId: "bad", quantity: 1, shippingAddress: "X" }));
  expect(res.status).toBe(400);
});

it("503 when PriceNotSet", async () => {
  (requirePaidCore as any).mockResolvedValue({ userId: "u1" });
  (createOrReuseCydCheckout as any).mockRejectedValue(new PriceNotSet());
  const res = await POST(req({ cydVariantId: "v1", quantity: 1, shippingAddress: "X" }));
  expect(res.status).toBe(503);
});
```

- [ ] **Step 6: Run route test to verify it fails**

Run: `pnpm --filter @3pb/saas exec vitest run app/api/beli/cyd/checkout/route.test.ts`
Expected: FAIL — the route file doesn't exist yet.

- [ ] **Step 7: Implement the route**

Create `apps/saas/app/api/beli/cyd/checkout/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { requirePaidCore } from "@/lib/session-auth";
import { createOrReuseCydCheckout } from "@/lib/payment/service";
import { InvalidQuantity, InvalidShippingAddress, InvalidCydVariant, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

export async function POST(req: Request) {
  const gate = await requirePaidCore();
  if (gate instanceof NextResponse) return gate;
  const body = await req.json().catch(() => ({}));
  const { cydVariantId, quantity, shippingAddress } = body as { cydVariantId?: unknown; quantity?: unknown; shippingAddress?: unknown };
  try {
    const p = await createOrReuseCydCheckout(
      gate.userId,
      String(cydVariantId ?? ""),
      Number(quantity),
      String(shippingAddress ?? "")
    );
    return NextResponse.json({
      id: p.id, amount: p.amount, qrPayload: p.qrPayload, displayPrice: p.displayPrice,
      quantity: p.quantity, cydVariantId: p.cydVariantId, shippingAddress: p.shippingAddress,
    });
  } catch (e) {
    if (e instanceof InvalidQuantity || e instanceof InvalidShippingAddress || e instanceof InvalidCydVariant)
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    if (e instanceof PriceNotSet || e instanceof QrisNotSet || e instanceof CodePoolExhausted)
      return NextResponse.json({ error: (e as Error).message }, { status: 503 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 8: Run all tests from this task to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts app/api/beli/cyd/checkout/route.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts apps/saas/app/api/beli/cyd/checkout/route.ts apps/saas/app/api/beli/cyd/checkout/route.test.ts
git commit -m "feat(saas): add CYD-purchase checkout creation (variant + quantity + shipping address)"
```

---

### Task 3: `activate()` CYD_PURCHASE case + shipping-aware notification

**Files:**
- Modify: `apps/saas/lib/payment/service.ts`
- Modify: `apps/saas/lib/payment/service.test.ts`
- Modify: `apps/saas/lib/payment/notify.ts`
- Modify: `apps/saas/lib/payment/notify.test.ts`

**Interfaces:**
- Consumes: `prisma.cydVariant` (Task 1's model, already in schema).
- Produces: `activate()` now supports `CYD_PURCHASE` — reads `variant.slotBonus`, creates a `SlotGrant` with `quantity = payment.quantity * variant.slotBonus`. `notifyActivated` sends a shipping-aware message for CYD buyers.

- [ ] **Step 1: Write the failing tests**

Add to `apps/saas/lib/payment/service.test.ts` (inside the `describe("activate"` block):

```typescript
it("productType CYD_PURCHASE → creates a SlotGrant with quantity = payment.quantity * variant.slotBonus", async () => {
  (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1", productType: "CYD_PURCHASE", quantity: 2, cydVariantId: "v1" });
  (prisma.payment.update as any).mockResolvedValue({ id: "p1", status: "PAID", userId: "u1", productType: "CYD_PURCHASE", quantity: 2, cydVariantId: "v1" });
  (prisma.cydVariant.findUnique as any).mockResolvedValue({ id: "v1", label: "CYD besar", price: 300000, slotBonus: 20, active: true });

  const result = await activate("p1", "owner@x.com", NOW);

  expect(prisma.slotGrant.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ userId: "u1", source: "CYD_PURCHASE", paymentId: "p1", quantity: 40 }) })
  );
  expect(prisma.entitlement.upsert).not.toHaveBeenCalled();
  expect(result?.status).toBe("PAID");
});
```

Also add `cydVariant: { findUnique: vi.fn() }` to the `prisma.$transaction`-callback's `tx` shape if the test mocks a `tx` object separately — check how the existing `SLOT_PURCHASE` `activate()` test mocks `prisma.$transaction` (it likely resolves by calling the callback with `prisma` itself as `tx`, since the mock's `$transaction` is `vi.fn()`) and follow that exact pattern; add `cydVariant.findUnique` to the same mock object `slotGrant.create` already lives on.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts -t "CYD_PURCHASE"`
Expected: FAIL — `activate()`'s switch has no `CYD_PURCHASE` case yet.

- [ ] **Step 3: Implement the dispatch case**

In `apps/saas/lib/payment/service.ts`, inside `activate()`'s `switch (p.productType)`, replace the comment line:

```typescript
      // CYD_PURCHASE (sub-project 3) and SUBSCRIBE (sub-project 4) add their own case here.
```

with:

```typescript
      case "CYD_PURCHASE": {
        const variant = await tx.cydVariant.findUniqueOrThrow({ where: { id: p.cydVariantId! } });
        if (!Number.isInteger(p.quantity) || p.quantity! <= 0) {
          throw new Error(`activate() CYD_PURCHASE payment ${p.id} has invalid quantity: ${p.quantity}`);
        }
        await tx.slotGrant.create({
          data: { userId: p.userId, source: "CYD_PURCHASE", paymentId: p.id, quantity: p.quantity! * variant.slotBonus },
        });
        break;
      }
      // SUBSCRIBE (sub-project 4) adds its own case here.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts`
Expected: PASS, full file.

- [ ] **Step 5: Write the failing notify test**

Add to `apps/saas/lib/payment/notify.test.ts`:

```typescript
it("productType CYD_PURCHASE → pesan sebut pengiriman, bukan 'akun aktif'", async () => {
  await notifyActivated({ phone: "628111", email: null }, { productType: "CYD_PURCHASE", quantity: 2 });
  expect(sendWA).toHaveBeenCalledWith("628111", expect.stringContaining("dikirim"));
  expect(sendWA).toHaveBeenCalledWith("628111", expect.not.stringContaining("akun Slizebiz kamu sudah aktif"));
});
```

- [ ] **Step 6: Run notify test to verify it fails**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/notify.test.ts`
Expected: FAIL — `messageFor`/`subjectFor` have no `CYD_PURCHASE` branch yet.

- [ ] **Step 7: Implement the CYD-aware message**

In `apps/saas/lib/payment/notify.ts`, update `messageFor` and `subjectFor`:

```typescript
function messageFor(payment: ActivatedPayment): string {
  if (payment.productType === "SLOT_PURCHASE") {
    return `Pembayaran terverifikasi — kapasitas monitoring printer kamu bertambah ${payment.quantity} slot 🎉 Terima kasih!`;
  }
  if (payment.productType === "CYD_PURCHASE") {
    return `Pembayaran terverifikasi — CYD kamu akan segera dikirim ke alamat yang kamu daftarkan. Kapasitas monitoring printer kamu bertambah begitu barang sampai. Terima kasih! 🎉`;
  }
  return MSG_BELI;
}

function subjectFor(payment: ActivatedPayment): string {
  if (payment.productType === "SLOT_PURCHASE") return "Slot printer bertambah";
  if (payment.productType === "CYD_PURCHASE") return "Pembayaran CYD terverifikasi";
  return "Akun Slizebiz aktif";
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/notify.test.ts lib/payment/service.test.ts`
Expected: PASS, both files.

- [ ] **Step 9: Commit**

```bash
git add apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts apps/saas/lib/payment/notify.ts apps/saas/lib/payment/notify.test.ts
git commit -m "feat(saas): activate() creates SlotGrant for CYD purchases via variant.slotBonus, shipping-aware notification"
```

---

### Task 4: Checkout UI — variant selection + quantity + shipping address

**Files:**
- Create: `apps/saas/components/BeliCydCheckout.tsx`
- Test: `apps/saas/components/beli-cyd-checkout.test.tsx`
- Create: `apps/saas/app/beli/cyd/page.tsx`

**Interfaces:**
- Consumes: `POST /api/beli/cyd/checkout` (Task 2) with body `{cydVariantId, quantity, shippingAddress}`, response `{id, amount, qrPayload, displayPrice, quantity, cydVariantId, shippingAddress}`; existing `POST /api/beli/:id/mark-paid` (confirmed product-agnostic, unmodified).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing component tests**

Create `apps/saas/components/beli-cyd-checkout.test.tsx`, mirroring `apps/saas/components/beli-slot-checkout.test.tsx`'s exact conventions (read that file first — it establishes the `.toBeTruthy()`/`.toBeNull()` matcher convention this repo uses instead of jest-dom, confirmed in sub-project 2). At minimum cover:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BeliCydCheckout } from "./BeliCydCheckout";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,x")) } }));

const VARIANTS = [
  { id: "v1", label: "CYD Standar (dengan casing)", price: 250000 },
  { id: "v2", label: "CYD Standar (tanpa casing)", price: 180000 },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

it("computes the live total from the selected variant and quantity", () => {
  render(<BeliCydCheckout variants={VARIANTS} refundCopy="Refund copy" />);
  fireEvent.click(screen.getByLabelText(/tanpa casing/i));
  fireEvent.change(screen.getByLabelText(/jumlah/i), { target: { value: "2" } });
  expect(screen.getByText(/Rp360.000/)).toBeTruthy();
});

it("posts variant, quantity, and shipping address when checking out", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true, status: 200, json: async () => ({ id: "p1", amount: 359500, qrPayload: "QR", displayPrice: 360000, quantity: 2, cydVariantId: "v2", shippingAddress: "Jl. Contoh 1" }),
  } as Response);
  render(<BeliCydCheckout variants={VARIANTS} refundCopy="Refund copy" />);
  fireEvent.click(screen.getByLabelText(/tanpa casing/i));
  fireEvent.change(screen.getByLabelText(/jumlah/i), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText(/alamat/i), { target: { value: "Jl. Contoh 1" } });
  fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/beli/cyd/checkout", expect.objectContaining({
    method: "POST", body: JSON.stringify({ cydVariantId: "v2", quantity: 2, shippingAddress: "Jl. Contoh 1" }),
  })));
});

it("shows an error when shipping address is missing on submit (400)", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "invalid_shipping_address" }) } as Response);
  render(<BeliCydCheckout variants={VARIANTS} refundCopy="Refund copy" />);
  fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
  await waitFor(() => expect(screen.getByText(/alamat kirim wajib diisi/i)).toBeTruthy());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run components/beli-cyd-checkout.test.tsx`
Expected: FAIL — `./BeliCydCheckout` doesn't exist yet.

- [ ] **Step 3: Implement the component**

Create `apps/saas/components/BeliCydCheckout.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { GlassButton } from "@3pb/ui";
import { compressImage } from "@/lib/image/compress";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
type Variant = { id: string; label: string; price: number };
type Invoice = { id: string; amount: number; qrPayload: string; displayPrice: number; quantity: number };

export function BeliCydCheckout({ variants, refundCopy }: { variants: Variant[]; refundCopy: string }) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [address, setAddress] = useState("");
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

  const selectedVariant = variants.find((v) => v.id === variantId);

  async function beli() {
    setPending(true); setMsg("");
    const res = await fetch("/api/beli/cyd/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cydVariantId: variantId, quantity: qty, shippingAddress: address }),
    });
    setPending(false);
    const data = await res.json().catch(() => ({}));
    if (res.status === 400 && data.error === "invalid_shipping_address") { setMsg("Alamat kirim wajib diisi."); return; }
    if (res.status === 400) { setMsg("Data pembelian tidak valid."); return; }
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

  return (
    <div className="flex flex-col gap-3 mt-2">
      {!inv ? (
        <>
          <div className="flex flex-col gap-1">
            {variants.map((v) => (
              <label key={v.id} className="text-[13px] g-t2 flex items-center gap-2">
                <input type="radio" name="cydVariant" checked={variantId === v.id} onChange={() => setVariantId(v.id)} aria-label={v.label} />
                {v.label} — {rupiah(v.price)}/unit
              </label>
            ))}
          </div>
          <label className="text-[13px] g-t2 flex flex-col gap-1">
            Jumlah unit
            <input type="number" min={1} value={qty} aria-label="Jumlah unit"
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              className="g-t2 border rounded-[8px] px-2 py-1 w-24" />
          </label>
          <label className="text-[13px] g-t2 flex flex-col gap-1">
            Alamat kirim
            <textarea value={address} aria-label="Alamat kirim" onChange={(e) => setAddress(e.target.value)}
              className="g-t2 border rounded-[8px] px-2 py-1" rows={3} placeholder="Nama penerima, alamat lengkap, kode pos, no. HP" />
          </label>
          <p className="text-[13px] g-t2">Total: <b>{rupiah((selectedVariant?.price ?? 0) * qty)}</b> (ongkir diurus terpisah setelah verifikasi)</p>
          <GlassButton onClick={beli} disabled={pending || !selectedVariant}>{pending ? "Memproses…" : "Beli sekarang"}</GlassButton>
        </>
      ) : paid ? (
        <>
          <p className="text-[13px] g-t2">Terima kasih! Pembayaran kamu sedang <b>diverifikasi admin</b>. CYD akan dikirim setelah aktif.</p>
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
          <p className="text-[11px] g-t4">Invoice berlaku 3 jam. {inv.quantity} unit CYD akan dikirim ke alamat yang kamu daftarkan setelah verifikasi.</p>
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

Run: `pnpm --filter @3pb/saas exec vitest run components/beli-cyd-checkout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Create the page**

Create `apps/saas/app/beli/cyd/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getEntitlement, capabilities } from "@/lib/entitlement";
import { prisma } from "@/lib/db";
import { BeliCydCheckout } from "@/components/BeliCydCheckout";
import { PageShell } from "@/components/PageShell";
import { isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function BeliCydPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const ent = await getEntitlement(session.user.id);
  const paidCore = capabilities(ent).paidCore;
  const variants = await prisma.cydVariant.findMany({ where: { active: true }, select: { id: true, label: true, price: true } });
  const refund = await getConfig("copy.refund");
  return (
    <PageShell title="Beli CYD" current="beli" owner={isOwner(session.user?.email)} userLabel={session.user?.email ?? undefined} narrow>
      {paidCore ? (
        <BeliCydCheckout variants={variants} refundCopy={refund} />
      ) : (
        <p className="text-[13px] g-t4">
          🔒 Beli CYD perlu Pro dulu — upgrade ke Pro di <a href="/beli" className="underline">/beli</a>.
        </p>
      )}
    </PageShell>
  );
}
```

- [ ] **Step 6: Verify the app typechecks**

Run: `pnpm --filter @3pb/saas typecheck`
Expected: no new errors beyond the already-known pre-existing unrelated ones.

- [ ] **Step 7: Commit**

```bash
git add apps/saas/components/BeliCydCheckout.tsx apps/saas/components/beli-cyd-checkout.test.tsx apps/saas/app/beli/cyd/page.tsx
git commit -m "feat(saas): add CYD checkout page (variant + quantity + shipping address)"
```

---

### Task 5: Admin fulfillment — new "Pesanan CYD" tab + product-label fixes

**Files:**
- Modify: `apps/saas/lib/payment/service.ts`
- Modify: `apps/saas/lib/payment/service.test.ts`
- Create: `apps/saas/app/api/admin/cyd-orders/[id]/route.ts`
- Test: `apps/saas/app/api/admin/cyd-orders/[id]/route.test.ts`
- Create: `apps/saas/components/admin/CydOrderList.tsx`
- Test: `apps/saas/components/admin/cyd-order-list.test.tsx`
- Modify: `apps/saas/components/admin/PaymentQueue.tsx`
- Modify: `apps/saas/components/admin/payment-queue.test.tsx`
- Modify: `apps/saas/components/admin/PaidList.tsx`
- Modify: `apps/saas/components/admin/paid-list.test.tsx`
- Modify: `apps/saas/app/admin/page.tsx`

**Interfaces:**
- Consumes: `Payment.productType === "CYD_PURCHASE"` rows (Task 2/3).
- Produces: nothing consumed by later tasks — last task in this plan.

- [ ] **Step 1: Write the failing service tests**

Add to `apps/saas/lib/payment/service.test.ts`:

```typescript
describe("listCydOrders", () => {
  it("returns only PAID CYD_PURCHASE payments", async () => {
    (prisma.payment.findMany as any).mockResolvedValue([{ id: "p1", productType: "CYD_PURCHASE", status: "PAID" }]);
    const rows = await listCydOrders();
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productType: "CYD_PURCHASE", status: "PAID" } })
    );
    expect(rows).toHaveLength(1);
  });
});

describe("updateCydShipping", () => {
  it("rejects an unknown shippingStatus value", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", productType: "CYD_PURCHASE" });
    await expect(updateCydShipping("p1", { shippingStatus: "LOST_IN_MAIL" })).rejects.toThrow(/invalid_shipping_status/);
  });

  it("rejects a non-CYD payment id", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", productType: "BELI" });
    await expect(updateCydShipping("p1", { shippingStatus: "PACKED" })).rejects.toThrow(/not_cyd_payment/);
  });

  it("updates shippingCost and/or shippingStatus for a valid CYD payment", async () => {
    (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", productType: "CYD_PURCHASE" });
    (prisma.payment.update as any).mockResolvedValue({ id: "p1", shippingCost: 25000, shippingStatus: "SHIPPED" });
    const updated = await updateCydShipping("p1", { shippingCost: 25000, shippingStatus: "SHIPPED" });
    expect(prisma.payment.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { shippingCost: 25000, shippingStatus: "SHIPPED" } });
    expect(updated.shippingStatus).toBe("SHIPPED");
  });
});
```

Add `listCydOrders, updateCydShipping` to the existing service import line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts -t "listCydOrders"`
Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts -t "updateCydShipping"`
Expected: FAIL — neither function exists yet.

- [ ] **Step 3: Implement the service functions**

In `apps/saas/lib/payment/service.ts`, add (after `listPaid`):

```typescript
const SHIPPING_STATUSES = ["PACKED", "SHIPPED", "DELIVERED"] as const;

export async function listCydOrders(): Promise<Payment[]> {
  return prisma.payment.findMany({
    where: { productType: "CYD_PURCHASE", status: "PAID" },
    orderBy: { verifiedAt: "desc" },
  });
}

export async function updateCydShipping(
  id: string,
  data: { shippingCost?: number; shippingStatus?: string }
): Promise<Payment> {
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p || p.productType !== "CYD_PURCHASE") throw new Error("not_cyd_payment");
  if (data.shippingStatus !== undefined && !SHIPPING_STATUSES.includes(data.shippingStatus as (typeof SHIPPING_STATUSES)[number])) {
    throw new Error("invalid_shipping_status");
  }
  return prisma.payment.update({ where: { id }, data });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts`
Expected: PASS, full file.

- [ ] **Step 5: Write the failing PATCH route test**

Create `apps/saas/app/api/admin/cyd-orders/[id]/route.test.ts`, mirroring `apps/saas/app/api/admin/payment/[id]/activate/route.ts`'s auth/gating style (read it first):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/owner", () => ({ isOwner: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({ updateCydShipping: vi.fn() }));

import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { updateCydShipping } from "@/lib/payment/service";
import { PATCH } from "./route";

beforeEach(() => vi.clearAllMocks());

function req(body: unknown) {
  return new Request("http://x", { method: "PATCH", body: JSON.stringify(body) });
}
function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

it("403 when not owner", async () => {
  (auth as any).mockResolvedValue({ user: { email: "notowner@x.com" } });
  (isOwner as any).mockReturnValue(false);
  const res = await PATCH(req({ shippingStatus: "PACKED" }), ctx("p1"));
  expect(res.status).toBe(403);
});

it("updates shipping fields for an owner", async () => {
  (auth as any).mockResolvedValue({ user: { email: "owner@x.com" } });
  (isOwner as any).mockReturnValue(true);
  (updateCydShipping as any).mockResolvedValue({ id: "p1", shippingCost: 25000, shippingStatus: "SHIPPED" });
  const res = await PATCH(req({ shippingCost: 25000, shippingStatus: "SHIPPED" }), ctx("p1"));
  expect(res.status).toBe(200);
  expect(updateCydShipping).toHaveBeenCalledWith("p1", { shippingCost: 25000, shippingStatus: "SHIPPED" });
});

it("400 when updateCydShipping rejects", async () => {
  (auth as any).mockResolvedValue({ user: { email: "owner@x.com" } });
  (isOwner as any).mockReturnValue(true);
  (updateCydShipping as any).mockRejectedValue(new Error("invalid_shipping_status"));
  const res = await PATCH(req({ shippingStatus: "LOST" }), ctx("p1"));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 6: Run route test to verify it fails**

Run: `pnpm --filter @3pb/saas exec vitest run app/api/admin/cyd-orders/\[id\]/route.test.ts`
Expected: FAIL — the route doesn't exist yet.

- [ ] **Step 7: Implement the route**

Create `apps/saas/app/api/admin/cyd-orders/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isOwner } from "@/lib/owner";
import { updateCydShipping } from "@/lib/payment/service";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isOwner(session?.user?.email)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const updated = await updateCydShipping(id, body as { shippingCost?: number; shippingStatus?: string });
    return NextResponse.json({ ok: true, shippingCost: updated.shippingCost, shippingStatus: updated.shippingStatus });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 8: Write the failing `CydOrderList` component test**

Create `apps/saas/components/admin/cyd-order-list.test.tsx`, mirroring `apps/saas/components/admin/payment-queue.test.tsx`'s conventions:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CydOrderList, type CydOrderRow } from "./CydOrderList";

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
});

const ROWS: CydOrderRow[] = [
  { id: "p1", who: "u1@x.com", quantity: 2, shippingAddress: "Jl. Contoh 1", shippingCost: null, shippingStatus: null },
];

it("shows the shipping address and a status dropdown", () => {
  render(<CydOrderList rows={ROWS} />);
  expect(screen.getByText("Jl. Contoh 1")).toBeTruthy();
  expect(screen.getByLabelText(/status kirim/i)).toBeTruthy();
});

it("PATCHes the order when shippingStatus changes", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  render(<CydOrderList rows={ROWS} />);
  fireEvent.change(screen.getByLabelText(/status kirim/i), { target: { value: "SHIPPED" } });
  expect(fetchSpy).toHaveBeenCalledWith("/api/admin/cyd-orders/p1", expect.objectContaining({
    method: "PATCH", body: JSON.stringify({ shippingStatus: "SHIPPED" }),
  }));
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `pnpm --filter @3pb/saas exec vitest run components/admin/cyd-order-list.test.tsx`
Expected: FAIL — `./CydOrderList` doesn't exist yet.

- [ ] **Step 10: Implement `CydOrderList`**

Create `apps/saas/components/admin/CydOrderList.tsx`:

```typescript
"use client";
import { useState } from "react";

export type CydOrderRow = {
  id: string; who: string; quantity: number;
  shippingAddress: string | null; shippingCost: number | null; shippingStatus: string | null;
};

const STATUSES = ["PACKED", "SHIPPED", "DELIVERED"] as const;

export function CydOrderList({ rows }: { rows: CydOrderRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    await fetch(`/api/admin/cyd-orders/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setBusy(null);
    window.location.reload();
  }

  if (rows.length === 0) return <p className="text-[12px] g-t4">Belum ada pesanan CYD.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-[12px] g-t2 w-full">
        <thead><tr className="g-t4 text-left"><th className="pr-3">User</th><th className="pr-3">Qty</th><th className="pr-3">Alamat</th><th className="pr-3">Ongkir</th><th>Status kirim</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="pr-3">{r.who}</td>
              <td className="pr-3">{r.quantity}</td>
              <td className="pr-3">{r.shippingAddress}</td>
              <td className="pr-3">
                <input type="number" defaultValue={r.shippingCost ?? undefined} disabled={busy === r.id}
                  aria-label="Ongkir"
                  onBlur={(e) => { const v = Number(e.target.value); if (v && v !== r.shippingCost) patch(r.id, { shippingCost: v }); }}
                  className="w-20 border rounded-[6px] px-1" />
              </td>
              <td>
                <select aria-label="Status kirim" defaultValue={r.shippingStatus ?? ""} disabled={busy === r.id}
                  onChange={(e) => patch(r.id, { shippingStatus: e.target.value })}
                  className="border rounded-[6px] px-1 py-0.5">
                  <option value="" disabled>—</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `pnpm --filter @3pb/saas exec vitest run components/admin/cyd-order-list.test.tsx`
Expected: PASS.

- [ ] **Step 12: Fix `productLabel` in the two existing admin tables**

In both `apps/saas/components/admin/PaymentQueue.tsx` and `apps/saas/components/admin/PaidList.tsx`, change:

```typescript
function productLabel(r: { productType: string; quantity: number | null }): string {
  if (r.productType === "BELI") return "Pro (lifetime)";
  if (r.productType === "SLOT_PURCHASE") return `Slot ×${r.quantity}`;
  return r.productType;
}
```

to:

```typescript
function productLabel(r: { productType: string; quantity: number | null }): string {
  if (r.productType === "BELI") return "Pro (lifetime)";
  if (r.productType === "SLOT_PURCHASE") return `Slot ×${r.quantity}`;
  if (r.productType === "CYD_PURCHASE") return `CYD ×${r.quantity}`;
  return r.productType;
}
```

Add one test to each of `apps/saas/components/admin/payment-queue.test.tsx` and `apps/saas/components/admin/paid-list.test.tsx` asserting a `CYD_PURCHASE` row renders `"CYD ×2"` (mirror the existing `SLOT_PURCHASE` test in each file).

- [ ] **Step 13: Wire the new tab into `/admin`**

Read `apps/saas/app/admin/page.tsx` in full first to see the exact `tabs: AdminTab[]` array construction and existing data-fetching pattern (`listPending`, `listPaid`, `whoOf`). Add:

- Import `listCydOrders` alongside the existing `listPending, listPaid` import from `@/lib/payment/service`.
- Import `CydOrderList, type CydOrderRow` from `@/components/admin/CydOrderList`.
- After the existing `paid`/`paidRows` construction, add:

```typescript
  const cydOrders = await listCydOrders();
  const cydOrderRows: CydOrderRow[] = cydOrders.map((p) => ({
    id: p.id, who: whoOf(p.userId), quantity: p.quantity ?? 0,
    shippingAddress: p.shippingAddress, shippingCost: p.shippingCost, shippingStatus: p.shippingStatus,
  }));
```

- Add a new entry to the `tabs` array passed to `AdminTabs` (match the exact object shape `{ key, label, node }` already used by the other tabs):

```typescript
  { key: "cyd", label: `Pesanan CYD (${cydOrderRows.length})`, node: <CydOrderList rows={cydOrderRows} /> },
```

- [ ] **Step 14: Run the full suite and typecheck**

Run: `pnpm --filter @3pb/saas exec vitest run`
Expected: PASS, no regressions.

Run: `pnpm --filter @3pb/saas typecheck`
Expected: no new errors beyond the already-known pre-existing unrelated ones.

- [ ] **Step 15: Commit**

```bash
git add apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts apps/saas/app/api/admin/cyd-orders apps/saas/components/admin/CydOrderList.tsx apps/saas/components/admin/cyd-order-list.test.tsx apps/saas/components/admin/PaymentQueue.tsx apps/saas/components/admin/payment-queue.test.tsx apps/saas/components/admin/PaidList.tsx apps/saas/components/admin/paid-list.test.tsx apps/saas/app/admin/page.tsx
git commit -m "feat(saas): add CYD order fulfillment tab (shipping cost/status) + fix product labels"
```

---

## Self-Review Notes (completed by the plan author, not a task)

**Spec coverage:** Manual shipping (Task 2, `amount` never includes shipping cost), variant-driven pricing/slotBonus (Tasks 2-3), shipping-address capture + in-place address update on re-checkout (Task 2), admin fulfillment surface (Task 5), reuse-pending keyed on variant+quantity (Task 2). All covered.

**Deviations from the spec, all discovered by reading the real code during planning (see the dedicated section above):** `activate()` did not already handle `CYD_PURCHASE` (Task 3 adds it for real); `productLabel()`/`notify.ts` needed new branches not mentioned in the spec (Tasks 3 and 5); no seed mechanism existed (Task 1 creates the first one); no separate-admin-page precedent exists, so fulfillment became a tab in the existing `/admin` page instead of a new route.

**Type consistency:** `createOrReuseCydCheckout`'s parameter order (`userId, cydVariantId, quantity, shippingAddress, now?`) is used identically by Task 2's route and matches what Task 4's UI posts (`{cydVariantId, quantity, shippingAddress}`, same field names). `listCydOrders`/`updateCydShipping` (Task 5) and `CydOrderRow`'s field names match `Payment`'s real column names (`shippingAddress`, `shippingCost`, `shippingStatus`) with no renaming drift. `SHIPPING_STATUSES` (service.ts) and `STATUSES` (`CydOrderList.tsx`) both list the same three values (`PACKED`/`SHIPPED`/`DELIVERED`) — kept as two separate small arrays (server validation vs. UI dropdown options) rather than a shared import, consistent with this codebase's existing tolerance for small, single-purpose duplication (see sub-project 2's `productLabel` precedent).
