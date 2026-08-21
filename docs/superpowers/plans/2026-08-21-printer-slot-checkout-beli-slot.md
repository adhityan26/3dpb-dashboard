# Printer Slot Ledger — Sub-project 2: Checkout Beli Slot Tambahan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user buy additional printer-monitoring slots in any quantity via the existing QRIS-manual-verify checkout pattern, granting a `SlotGrant` row on admin approval.

**Architecture:** A new `createSlotCheckout` service function (mirroring the existing `createOrReuseCheckout`) creates a `Payment` row with `productType: "SLOT_PURCHASE"` and a `quantity`. `activate()` — previously a single hardcoded BELI path — becomes a `productType` dispatch; its `SLOT_PURCHASE` branch creates a `SlotGrant`. A new checkout page/component mirrors the existing `/beli` flow with an added quantity input. The admin payment queue is extended to show which product a pending/paid row is for.

**Tech Stack:** Next.js 16 (`apps/saas`), Prisma, Vitest, existing QRIS-static + unique-code checkout pattern (`lib/payment/service.ts`).

**Spec:** `docs/superpowers/specs/2026-08-20-printer-slot-checkout-beli-slot-design.md`

## Global Constraints

- Quantity has **no upper bound** — user's explicit call in the spec (only a positive-integer floor).
- Reuse-pending logic must key on **both** `productType: "SLOT_PURCHASE"` and matching `quantity` — a different quantity must create a fresh `Payment` (its `amount` would otherwise be wrong for what's now displayed).
- `activate()`'s dispatch is the shared integration point sub-projects 3 and 4 will extend later (each adding their own `case`, per the original design) — do not special-case `SLOT_PURCHASE` in a way that would make adding `CYD_PURCHASE`/`SUBSCRIBE` awkward.
- `AlreadyOwned` (the BELI-specific "you already have Pro" guard) must **not** apply to slot purchases — they are repeatable/additive, unlike the one-time Pro upgrade.
- `Entitlement.lifetimeOwned`/`deactivate()` (the "refund, turn off Pro" flow) is BELI-specific and must not be triggered by, or exposed for, `SLOT_PURCHASE` rows.

---

### Task 1: Checkout creation — Config key, error class, service function, API route

**Files:**
- Modify: `apps/saas/lib/config.ts` (`DEFAULT_CONFIG`)
- Modify: `apps/saas/lib/payment/errors.ts`
- Modify: `apps/saas/lib/payment/service.ts`
- Modify: `apps/saas/lib/payment/service.test.ts`
- Create: `apps/saas/app/api/beli/slot/checkout/route.ts`
- Test: `apps/saas/app/api/beli/slot/checkout/route.test.ts`

**Interfaces:**
- Produces: `createSlotCheckout(userId: string, quantity: number, now?: Date): Promise<Payment>` (throws `InvalidQuantity | PriceNotSet | QrisNotSet | CodePoolExhausted`) — consumed by Task 3's checkout UI via the new API route, and referenced (unmodified) by Task 2's dispatch design note.

- [ ] **Step 1: Write the failing tests**

Add to `apps/saas/lib/payment/service.test.ts` (same file, same `vi.mock` setup already present — no new mocks needed since `prisma.payment.*` is already stubbed):

```typescript
describe("createSlotCheckout", () => {
  it("throws InvalidQuantity for zero, negative, or non-integer quantity", async () => {
    await expect(createSlotCheckout("u1", 0)).rejects.toThrow(InvalidQuantity);
    await expect(createSlotCheckout("u1", -1)).rejects.toThrow(InvalidQuantity);
    await expect(createSlotCheckout("u1", 1.5)).rejects.toThrow(InvalidQuantity);
  });

  it("creates a Payment with productType SLOT_PURCHASE, quantity, and amount = quantity * unitPrice - buffer + code", async () => {
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.slotPerUnit": "10000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (prisma.payment.findMany as any).mockResolvedValue([]); // allocUniqueCode's live-pending scan
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new", ...data }));

    const p = await createSlotCheckout("u1", 3, NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", productType: "SLOT_PURCHASE", quantity: 3, displayPrice: 30000 }),
      })
    );
    expect(p.amount).toBe(30000 - 1000 + (p as any).uniqueCode);
  });

  it("reuses an existing PENDING payment with the same quantity within the live window", async () => {
    const existing = { id: "p-existing", productType: "SLOT_PURCHASE", quantity: 5, status: "PENDING" };
    (prisma.payment.findFirst as any).mockResolvedValue(existing);

    const p = await createSlotCheckout("u1", 5, NOW);

    expect(p).toBe(existing);
    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u1", productType: "SLOT_PURCHASE", quantity: 5, status: "PENDING" }) })
    );
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("creates a new payment when quantity differs from the existing PENDING one (findFirst filters by quantity, so a mismatch returns null and a new payment is created)", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null); // no PENDING row matches quantity: 7
    (getConfig as any).mockImplementation(async (k: string) =>
      ({ "price.slotPerUnit": "10000", "qris.static": "STATICQR", "price.discountBuffer": "1000" })[k] ?? ""
    );
    (prisma.payment.findMany as any).mockResolvedValue([]);
    (prisma.payment.create as any).mockImplementation(async ({ data }: any) => ({ id: "p-new-2", ...data }));

    await createSlotCheckout("u1", 7, NOW);

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quantity: 7 }) })
    );
  });

  it("throws PriceNotSet when price.slotPerUnit is unset", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (getConfig as any).mockImplementation(async () => "");
    await expect(createSlotCheckout("u1", 1, NOW)).rejects.toThrow(PriceNotSet);
  });

  it("throws QrisNotSet when qris.static is unset", async () => {
    (prisma.payment.findFirst as any).mockResolvedValue(null);
    (getConfig as any).mockImplementation(async (k: string) => (k === "price.slotPerUnit" ? "10000" : ""));
    await expect(createSlotCheckout("u1", 1, NOW)).rejects.toThrow(QrisNotSet);
  });
});
```

Add the new imports at the top of the same test file: `createSlotCheckout` to the existing `import { ... } from "@/lib/payment/service"` line, and `InvalidQuantity` to the existing `import { ... } from "@/lib/payment/errors"` line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts -t "createSlotCheckout"`
Expected: FAIL — `createSlotCheckout` is not exported yet, `InvalidQuantity` doesn't exist yet.

- [ ] **Step 3: Add the Config key**

In `apps/saas/lib/config.ts`, add to `DEFAULT_CONFIG` (after the existing `"price.beli"` line, matching its comment style):

```typescript
  "price.slotPerUnit": "", // TBA — harga per slot tambahan (checkout kuantitas bebas)
```

- [ ] **Step 4: Add the error class**

In `apps/saas/lib/payment/errors.ts`, add:

```typescript
export class InvalidQuantity extends Error {
  constructor() {
    super("invalid_quantity");
    this.name = "InvalidQuantity";
  }
}
```

- [ ] **Step 5: Implement `createSlotCheckout`**

In `apps/saas/lib/payment/service.ts`, add the import `InvalidQuantity` to the existing `import { ... } from "@/lib/payment/errors"` line, then add:

```typescript
export async function createSlotCheckout(userId: string, quantity: number, now = new Date()): Promise<Payment> {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new InvalidQuantity();

  const existing = await prisma.payment.findFirst({
    where: { userId, productType: "SLOT_PURCHASE", quantity, status: "PENDING", createdAt: { gt: liveSince(now) } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const unitPrice = parsePrice(await getConfig("price.slotPerUnit"));
  if (unitPrice === null || unitPrice <= 0) throw new PriceNotSet();
  const staticQ = (await getConfig("qris.static")).trim();
  if (!staticQ) throw new QrisNotSet();
  const buffer = Math.max(1000, parsePrice(await getConfig("price.discountBuffer")) ?? 1000);
  const price = unitPrice * quantity;
  if (price <= buffer) throw new PriceNotSet();

  const code = await allocUniqueCode(now);
  const amount = price - buffer + code;
  const qrPayload = generateDynamicQris(staticQ, amount);

  return prisma.payment.create({
    data: { userId, productType: "SLOT_PURCHASE", quantity, displayPrice: price, amount, uniqueCode: code, qrPayload, status: "PENDING" },
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts`
Expected: PASS, full file (confirms no regression in existing BELI tests).

- [ ] **Step 7: Write the failing route test**

Create `apps/saas/app/api/beli/slot/checkout/route.test.ts`, mirroring the existing `apps/saas/app/api/beli/checkout/route.test.ts` if one exists (check first — if not, use this pattern):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/payment/service", () => ({ createSlotCheckout: vi.fn() }));

import { auth } from "@/lib/auth";
import { createSlotCheckout } from "@/lib/payment/service";
import { InvalidQuantity, PriceNotSet } from "@/lib/payment/errors";
import { POST } from "./route";

beforeEach(() => vi.clearAllMocks());

function req(body: unknown) {
  return new Request("http://x/api/beli/slot/checkout", { method: "POST", body: JSON.stringify(body) });
}

it("401 when unauthenticated", async () => {
  (auth as any).mockResolvedValue(null);
  const res = await POST(req({ quantity: 2 }));
  expect(res.status).toBe(401);
});

it("creates a checkout and returns invoice fields including quantity", async () => {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (createSlotCheckout as any).mockResolvedValue({ id: "p1", amount: 5000, qrPayload: "QR", displayPrice: 6000, quantity: 3 });
  const res = await POST(req({ quantity: 3 }));
  const data = await res.json();
  expect(res.status).toBe(200);
  expect(data).toEqual({ id: "p1", amount: 5000, qrPayload: "QR", displayPrice: 6000, quantity: 3 });
  expect(createSlotCheckout).toHaveBeenCalledWith("u1", 3);
});

it("400 when createSlotCheckout throws InvalidQuantity", async () => {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (createSlotCheckout as any).mockRejectedValue(new InvalidQuantity());
  const res = await POST(req({ quantity: 0 }));
  expect(res.status).toBe(400);
});

it("503 when createSlotCheckout throws PriceNotSet", async () => {
  (auth as any).mockResolvedValue({ user: { id: "u1" } });
  (createSlotCheckout as any).mockRejectedValue(new PriceNotSet());
  const res = await POST(req({ quantity: 1 }));
  expect(res.status).toBe(503);
});
```

- [ ] **Step 8: Run route test to verify it fails**

Run: `pnpm --filter @3pb/saas exec vitest run app/api/beli/slot/checkout/route.test.ts`
Expected: FAIL — `apps/saas/app/api/beli/slot/checkout/route.ts` doesn't exist yet.

- [ ] **Step 9: Implement the route**

Create `apps/saas/app/api/beli/slot/checkout/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSlotCheckout } from "@/lib/payment/service";
import { InvalidQuantity, PriceNotSet, QrisNotSet, CodePoolExhausted } from "@/lib/payment/errors";

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const quantity = Number((body as { quantity?: unknown }).quantity);
  try {
    const p = await createSlotCheckout(userId, quantity);
    return NextResponse.json({ id: p.id, amount: p.amount, qrPayload: p.qrPayload, displayPrice: p.displayPrice, quantity: p.quantity });
  } catch (e) {
    if (e instanceof InvalidQuantity) return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    if (e instanceof PriceNotSet || e instanceof QrisNotSet || e instanceof CodePoolExhausted)
      return NextResponse.json({ error: (e as Error).message }, { status: 503 });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
```

- [ ] **Step 10: Run all tests from this task to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts app/api/beli/slot/checkout/route.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/saas/lib/config.ts apps/saas/lib/payment/errors.ts apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts apps/saas/app/api/beli/slot/checkout/route.ts apps/saas/app/api/beli/slot/checkout/route.test.ts
git commit -m "feat(saas): add slot-purchase checkout creation (quantity-based)"
```

---

### Task 2: `activate()` dispatch for SLOT_PURCHASE + product-aware notification

**Files:**
- Modify: `apps/saas/lib/payment/service.ts`
- Modify: `apps/saas/lib/payment/service.test.ts`
- Modify: `apps/saas/lib/payment/notify.ts`
- Modify: `apps/saas/lib/payment/notify.test.ts`
- Modify: `apps/saas/app/api/admin/payment/[id]/activate/route.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 directly (works on `Payment` rows regardless of how they were created).
- Produces: `activate()`'s dispatch shape (`switch (p.productType)`) — this is the exact extension point sub-projects 3 (`CYD_PURCHASE`) and 4 (`SUBSCRIBE`) add their own `case` to later; do not restructure it into something else. `notifyActivated(user, payment)` — the new second parameter is now required for every caller.

**Context this task must know:** `activate()` currently (as of sub-project 1's final-review fix) throws for any `productType !== "BELI"`, guarding against a real gap — this task replaces that guard with real dispatch. The admin route `apps/saas/app/api/admin/payment/[id]/activate/route.ts` calls `notifyActivated(user)` unconditionally after every successful `activate()` — since that function's message text ("akun Slizebiz kamu sudah aktif") is BELI-specific wording, a slot-purchase buyer would receive a misleading "your account is now active" message unless this is fixed in the same change.

- [ ] **Step 1: Write the failing tests**

In `apps/saas/lib/payment/service.test.ts`, find and **replace** the existing test that asserts a throw for non-BELI productType (search for `"productType selain BELI"` — it currently expects a throw, which is no longer correct behavior for `SLOT_PURCHASE`):

```typescript
it("productType SLOT_PURCHASE → creates a SlotGrant, does not touch Entitlement", async () => {
  (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1", productType: "SLOT_PURCHASE", quantity: 4 });
  (prisma.payment.update as any).mockResolvedValue({ id: "p1", status: "PAID", userId: "u1", productType: "SLOT_PURCHASE", quantity: 4 });

  const result = await activate("p1", "owner@x.com", NOW);

  expect(prisma.slotGrant.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ userId: "u1", source: "SLOT_PURCHASE", paymentId: "p1", quantity: 4 }) })
  );
  expect(prisma.entitlement.upsert).not.toHaveBeenCalled();
  expect(result).toEqual({ id: "p1", status: "PAID", userId: "u1", productType: "SLOT_PURCHASE", quantity: 4 });
});

it("productType outside the known set still throws (dispatch has a default case)", async () => {
  (prisma.payment.findUnique as any).mockResolvedValue({ id: "p1", status: "PENDING", userId: "u1", productType: "SOMETHING_UNKNOWN" });
  await expect(activate("p1", "owner@x.com", NOW)).rejects.toThrow(/unsupported productType/);
});
```

Add `slotGrant: { create: vi.fn() }` to the `prisma` mock object at the top of the file (it currently only stubs `payment` and `entitlement`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts -t "SLOT_PURCHASE"`
Expected: FAIL — `activate()` still throws unconditionally for non-BELI, `prisma.slotGrant` isn't mocked yet.

- [ ] **Step 3: Implement the dispatch**

In `apps/saas/lib/payment/service.ts`, replace the current guard block inside `activate()`:

```typescript
  // TODO(sub-project 2): activate() should dispatch by productType (see
  // docs/superpowers/specs/2026-08-20-printer-slot-checkout-beli-slot-design.md
  // for the full dispatch design). Until that lands, only BELI payments should
  // ever reach here — guard against silently granting lifetimeOwned to a
  // payment of any other product type.
  if (p.productType !== "BELI") {
    throw new Error(`activate() called for unsupported productType: ${p.productType}`);
  }
  const updated = await prisma.payment.update({
    where: { id },
    data: { status: "PAID", verifiedAt: now, verifiedBy: ownerEmail },
  });
  await prisma.entitlement.upsert({
    where: { userId: p.userId },
    create: { userId: p.userId, lifetimeOwned: true, lifetimePurchasedAt: now },
    update: { lifetimeOwned: true, lifetimePurchasedAt: now },
  });
  return updated;
```

with:

```typescript
  const updated = await prisma.payment.update({
    where: { id },
    data: { status: "PAID", verifiedAt: now, verifiedBy: ownerEmail },
  });
  switch (p.productType) {
    case "BELI":
      await prisma.entitlement.upsert({
        where: { userId: p.userId },
        create: { userId: p.userId, lifetimeOwned: true, lifetimePurchasedAt: now },
        update: { lifetimeOwned: true, lifetimePurchasedAt: now },
      });
      break;
    case "SLOT_PURCHASE":
      await prisma.slotGrant.create({
        data: { userId: p.userId, source: "SLOT_PURCHASE", paymentId: p.id, quantity: p.quantity ?? 0 },
      });
      break;
    // CYD_PURCHASE (sub-project 3) and SUBSCRIBE (sub-project 4) add their own case here.
    default:
      throw new Error(`activate() called for unsupported productType: ${p.productType}`);
  }
  return updated;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/service.test.ts`
Expected: PASS, full file.

- [ ] **Step 5: Write the failing notify tests**

In `apps/saas/lib/payment/notify.test.ts`, the existing three tests call `notifyActivated({ phone, email })` with one argument — update each call to pass a second `payment` argument, and add a new test for the SLOT_PURCHASE message:

```typescript
it("punya phone → sendWA (bukan email)", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  await notifyActivated({ phone: "628111", email: null }, { productType: "BELI", quantity: null });
  expect(sendWA).toHaveBeenCalledWith("628111", expect.stringContaining("aktif"));
  expect(fetchSpy).not.toHaveBeenCalled();
});
it("tanpa phone tapi ada email → Resend REST", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  await notifyActivated({ phone: null, email: "a@b.com" }, { productType: "BELI", quantity: null });
  expect(sendWA).not.toHaveBeenCalled();
  expect(fetchSpy.mock.calls[0][0]).toBe("https://api.resend.com/emails");
});
it("kegagalan notif tak dilempar (best-effort)", async () => {
  (sendWA as any).mockRejectedValue(new Error("down"));
  await expect(notifyActivated({ phone: "628111", email: null }, { productType: "BELI", quantity: null })).resolves.toBeUndefined();
});
it("productType SLOT_PURCHASE → pesan sebut jumlah slot, bukan 'akun aktif'", async () => {
  await notifyActivated({ phone: "628111", email: null }, { productType: "SLOT_PURCHASE", quantity: 4 });
  expect(sendWA).toHaveBeenCalledWith("628111", expect.stringContaining("4 slot"));
  expect(sendWA).toHaveBeenCalledWith("628111", expect.not.stringContaining("akun Slizebiz kamu sudah aktif"));
});
```

- [ ] **Step 6: Run notify tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/notify.test.ts`
Expected: FAIL — `notifyActivated` still takes one argument, message is not product-aware.

- [ ] **Step 7: Implement product-aware notification**

Replace the full content of `apps/saas/lib/payment/notify.ts`:

```typescript
import { sendWA } from "@/lib/wa/client";

const MSG_BELI = "Pembayaran terverifikasi — akun Slizebiz kamu sudah aktif 🎉 Terima kasih!";

type ActivatedPayment = { productType: string; quantity: number | null };

function messageFor(payment: ActivatedPayment): string {
  if (payment.productType === "SLOT_PURCHASE") {
    return `Pembayaran terverifikasi — kapasitas monitoring printer kamu bertambah ${payment.quantity} slot 🎉 Terima kasih!`;
  }
  return MSG_BELI;
}

async function sendEmail(to: string, msg: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error("resend env absent");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: "Akun Slizebiz aktif", text: msg }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`resend HTTP ${res.status}`);
}

/** Best-effort: kabari user aktivasi via channel-nya, pesan disesuaikan productType. Tak pernah throw. */
export async function notifyActivated(user: { phone: string | null; email: string | null }, payment: ActivatedPayment): Promise<void> {
  const msg = messageFor(payment);
  try {
    if (user.phone) await sendWA(user.phone, msg);
    else if (user.email) await sendEmail(user.email, msg);
  } catch (e) {
    console.error("[notify] gagal kirim notif aktivasi:", (e as Error).message);
  }
}
```

- [ ] **Step 8: Update the admin activate route's call site**

In `apps/saas/app/api/admin/payment/[id]/activate/route.ts`, change:

```typescript
    if (user) await notifyActivated(user);
```

to:

```typescript
    if (user) await notifyActivated(user, p);
```

(`p` here is `activate()`'s return value, already in scope, and already carries `productType`/`quantity`.)

- [ ] **Step 9: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run lib/payment/notify.test.ts lib/payment/service.test.ts`
Expected: PASS, both files.

- [ ] **Step 10: Commit**

```bash
git add apps/saas/lib/payment/service.ts apps/saas/lib/payment/service.test.ts apps/saas/lib/payment/notify.ts apps/saas/lib/payment/notify.test.ts apps/saas/app/api/admin/payment/\[id\]/activate/route.ts
git commit -m "feat(saas): dispatch activate() by productType, create SlotGrant on approval, product-aware notification"
```

---

### Task 3: Checkout UI — quantity input + QRIS flow

**Files:**
- Create: `apps/saas/components/BeliSlotCheckout.tsx`
- Test: `apps/saas/components/beli-slot-checkout.test.tsx`
- Create: `apps/saas/app/beli/slot/page.tsx`

**Interfaces:**
- Consumes: `POST /api/beli/slot/checkout` (Task 1) with body `{ quantity: number }`, response `{ id, amount, qrPayload, displayPrice, quantity }`; existing `POST /api/beli/:id/mark-paid` (unmodified, already product-agnostic).
- Produces: nothing consumed by later tasks in this plan.

- [ ] **Step 1: Write the failing component tests**

Create `apps/saas/components/beli-slot-checkout.test.tsx`, mirroring the structure/mocking style of `apps/saas/components/beli-checkout.test.tsx` (read that file first to match its exact `fetch` mocking and `@/lib/image/compress` mocking approach). At minimum, cover:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BeliSlotCheckout } from "./BeliSlotCheckout";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(() => Promise.resolve("data:image/png;base64,x")) } }));

beforeEach(() => {
  vi.restoreAllMocks();
});

it("computes and displays the live total as quantity changes", () => {
  render(<BeliSlotCheckout pricePerUnit="10000" refundCopy="Refund copy" />);
  const qtyInput = screen.getByLabelText(/jumlah slot/i);
  fireEvent.change(qtyInput, { target: { value: "3" } });
  expect(screen.getByText(/Rp30.000/)).toBeInTheDocument();
});

it("posts the chosen quantity when checking out", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true, status: 200, json: async () => ({ id: "p1", amount: 29500, qrPayload: "QR", displayPrice: 30000, quantity: 3 }),
  } as Response);
  render(<BeliSlotCheckout pricePerUnit="10000" refundCopy="Refund copy" />);
  fireEvent.change(screen.getByLabelText(/jumlah slot/i), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/beli/slot/checkout", expect.objectContaining({
    method: "POST", body: JSON.stringify({ quantity: 3 }),
  })));
});

it("shows an error message when the API returns 400 (invalid quantity)", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "invalid_quantity" }) } as Response);
  render(<BeliSlotCheckout pricePerUnit="10000" refundCopy="Refund copy" />);
  fireEvent.click(screen.getByRole("button", { name: /beli sekarang/i }));
  await waitFor(() => expect(screen.getByText(/jumlah slot tidak valid/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run components/beli-slot-checkout.test.tsx`
Expected: FAIL — `./BeliSlotCheckout` doesn't exist yet.

- [ ] **Step 3: Implement the component**

Create `apps/saas/components/BeliSlotCheckout.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { GlassButton } from "@3pb/ui";
import { compressImage } from "@/lib/image/compress";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
type Invoice = { id: string; amount: number; qrPayload: string; displayPrice: number; quantity: number };

export function BeliSlotCheckout({ pricePerUnit, refundCopy }: { pricePerUnit: string; refundCopy: string }) {
  const [qty, setQty] = useState(1);
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
    const res = await fetch("/api/beli/slot/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: qty }),
    });
    setPending(false);
    const data = await res.json().catch(() => ({}));
    if (res.status === 400) { setMsg("Jumlah slot tidak valid."); return; }
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

  const unitPrice = Number(pricePerUnit);
  return (
    <div className="flex flex-col gap-3 mt-2">
      {!inv ? (
        !unitPrice || unitPrice <= 0 ? (
          <p className="text-[13px] g-t3">Pembayaran belum diaktifkan admin. Coba lagi nanti.</p>
        ) : (
        <>
          <label className="text-[13px] g-t2 flex flex-col gap-1">
            Jumlah slot tambahan
            <input type="number" min={1} value={qty}
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              className="g-t2 border rounded-[8px] px-2 py-1 w-24" />
          </label>
          <p className="text-[13px] g-t2">Total: <b>{rupiah(unitPrice * qty)}</b> ({rupiah(unitPrice)}/slot)</p>
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
          <p className="text-[11px] g-t4">Invoice berlaku 3 jam. {inv.quantity} slot akan ditambahkan setelah verifikasi.</p>
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

Run: `pnpm --filter @3pb/saas exec vitest run components/beli-slot-checkout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Create the page (no test needed — thin server component wired identically to the existing `/beli` page)**

Create `apps/saas/app/beli/slot/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { BeliSlotCheckout } from "@/components/BeliSlotCheckout";
import { PageShell } from "@/components/PageShell";
import { isOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function BeliSlotPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const pricePerUnit = await getConfig("price.slotPerUnit");
  const refund = await getConfig("copy.refund");
  return (
    <PageShell title="Beli Slot Printer" current="beli" owner={isOwner(session.user?.email)} userLabel={session.user?.email ?? undefined} narrow>
      <BeliSlotCheckout pricePerUnit={pricePerUnit} refundCopy={refund} />
    </PageShell>
  );
}
```

- [ ] **Step 6: Verify the app builds and typechecks**

Run: `pnpm --filter @3pb/saas typecheck`
Expected: no new errors beyond the already-known pre-existing unrelated ones (vitest/Awaitable mismatches etc. — see sub-project 1's plan for the full documented list).

- [ ] **Step 7: Commit**

```bash
git add apps/saas/components/BeliSlotCheckout.tsx apps/saas/components/beli-slot-checkout.test.tsx apps/saas/app/beli/slot/page.tsx
git commit -m "feat(saas): add slot-purchase checkout page (quantity input + QRIS flow)"
```

---

### Task 4: Admin display — show product type/quantity, hide BELI-only actions for non-BELI rows

**Files:**
- Modify: `apps/saas/components/admin/PaymentQueue.tsx`
- Modify: `apps/saas/components/admin/payment-queue.test.tsx`
- Modify: `apps/saas/components/admin/PaidList.tsx`
- Test: `apps/saas/components/admin/paid-list.test.tsx` (check if it already exists — extend it if so, create it if not)
- Modify: `apps/saas/app/admin/page.tsx`

**Interfaces:**
- Consumes: `Payment.productType`/`Payment.quantity` (sub-project 1's schema, already live).
- Produces: nothing consumed by later tasks — this is the last task in this plan.

- [ ] **Step 1: Write the failing tests**

In `apps/saas/components/admin/payment-queue.test.tsx` (read the existing file first to match its render/query style), add:

```typescript
it("shows a Produk column with quantity for a SLOT_PURCHASE row", () => {
  render(<PaymentQueue rows={[
    { id: "p1", amount: 30000, who: "u1", ageMin: 5, marked: false, hasProof: false, productType: "SLOT_PURCHASE", quantity: 3 },
  ]} />);
  expect(screen.getByText("Slot ×3")).toBeInTheDocument();
});

it("shows 'Pro (lifetime)' for a BELI row", () => {
  render(<PaymentQueue rows={[
    { id: "p2", amount: 150000, who: "u2", ageMin: 2, marked: false, hasProof: false, productType: "BELI", quantity: null },
  ]} />);
  expect(screen.getByText("Pro (lifetime)")).toBeInTheDocument();
});
```

Create or extend `apps/saas/components/admin/paid-list.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaidList } from "./PaidList";

it("shows the Nonaktifkan button for a BELI row", () => {
  render(<PaidList rows={[
    { id: "p1", userId: "u1", amount: 150000, who: "u1", when: "2026-08-21", productType: "BELI", quantity: null },
  ]} />);
  expect(screen.getByRole("button", { name: /nonaktifkan/i })).toBeInTheDocument();
});

it("hides the Nonaktifkan button for a SLOT_PURCHASE row (deactivate is BELI-only)", () => {
  render(<PaidList rows={[
    { id: "p2", userId: "u2", amount: 30000, who: "u2", when: "2026-08-21", productType: "SLOT_PURCHASE", quantity: 3 },
  ]} />);
  expect(screen.queryByRole("button", { name: /nonaktifkan/i })).not.toBeInTheDocument();
  expect(screen.getByText("Slot ×3")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @3pb/saas exec vitest run components/admin/payment-queue.test.tsx components/admin/paid-list.test.tsx`
Expected: FAIL — `productType`/`quantity` aren't part of `PendingRow`/`PaidRow` yet, no "Produk" column exists, `Nonaktifkan` isn't conditional yet.

- [ ] **Step 3: Update `PaymentQueue.tsx`**

In `apps/saas/components/admin/PaymentQueue.tsx`:

Change the `PendingRow` type:
```typescript
export type PendingRow = { id: string; amount: number; who: string; ageMin: number; marked: boolean; hasProof: boolean; productType: string; quantity: number | null };
```

Add this helper above the `PaymentQueue` function:
```typescript
function productLabel(r: { productType: string; quantity: number | null }): string {
  if (r.productType === "SLOT_PURCHASE") return `Slot ×${r.quantity}`;
  return "Pro (lifetime)";
}
```

Add a "Produk" column to the header (`<th className="pr-3">Produk</th>` right after the existing `<th className="pr-3">Nominal</th>`) and a matching cell in the row (`<td className="pr-3">{productLabel(r)}</td>` right after the existing Nominal `<td>`).

- [ ] **Step 4: Update `PaidList.tsx`**

In `apps/saas/components/admin/PaidList.tsx`:

Change the `PaidRow` type:
```typescript
export type PaidRow = { id: string; userId: string; amount: number; who: string; when: string; productType: string; quantity: number | null };
```

Add the same `productLabel` helper (identical to `PaymentQueue.tsx`'s — this small duplication across two admin display components is acceptable per YAGNI; extracting a shared helper module is not worth it for one 4-line function used in two files).

Add a "Produk" column (header + cell, same placement pattern as Task 3 above) and make the "Nonaktifkan" action conditional on `productType === "BELI"`:

```typescript
<td>{r.productType === "BELI" && (
  <button onClick={() => deactivate(r.userId)} disabled={busy === r.userId} className="text-[11px] underline" style={{ color: "#dc2626" }}>Nonaktifkan</button>
)}</td>
```

- [ ] **Step 5: Wire the new fields in `admin/page.tsx`**

In `apps/saas/app/admin/page.tsx`, update both row-mapping blocks:

```typescript
  const pendingRows: PendingRow[] = pending.map((p) => ({
    id: p.id, amount: p.amount, who: whoOf(p.userId),
    ageMin: Math.floor((now.getTime() - p.createdAt.getTime()) / 60000), marked: !!p.paidMarkedAt,
    hasProof: !!p.proofKey, productType: p.productType, quantity: p.quantity,
  }));
  const paidRows: PaidRow[] = paid.map((p) => ({
    id: p.id, userId: p.userId, amount: p.amount, who: whoOf(p.userId),
    when: p.verifiedAt ? p.verifiedAt.toISOString().slice(0, 10) : "",
    productType: p.productType, quantity: p.quantity,
  }));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @3pb/saas exec vitest run components/admin/payment-queue.test.tsx components/admin/paid-list.test.tsx`
Expected: PASS.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `pnpm --filter @3pb/saas exec vitest run`
Expected: PASS, no regressions.

Run: `pnpm --filter @3pb/saas typecheck`
Expected: no new errors beyond the already-known pre-existing unrelated ones.

- [ ] **Step 8: Commit**

```bash
git add apps/saas/components/admin/PaymentQueue.tsx apps/saas/components/admin/payment-queue.test.tsx apps/saas/components/admin/PaidList.tsx apps/saas/components/admin/paid-list.test.tsx apps/saas/app/admin/page.tsx
git commit -m "feat(saas): show product type/quantity in admin payment queue, hide BELI-only deactivate action for other product types"
```

---

## Self-Review Notes (completed by the plan author, not a task)

**Spec coverage:** Config key + flexible quantity (Task 1), `activate()` dispatch shared with future sub-projects (Task 2), checkout UI (Task 3), admin visibility (Task 4). All match the approved spec.

**Findings from reading the real post-sub-project-1 code, not assumed from the spec alone:**
1. `activate()`'s current state (post sub-project 1's final-review fix) is a `productType !== "BELI"` throw-guard, not a bare BELI-only implementation — Task 2 replaces that guard with the real dispatch it was explicitly left as a placeholder for.
2. The admin activate route calls `notifyActivated(user)` unconditionally with a BELI-worded message; without Task 2's `notify.ts` change, a slot-purchase buyer would receive a misleading "your account is active" WA/email instead of a message about their new slot count. This was not mentioned in the spec (which only covered the checkout+dispatch, not the notification side-effect) — found by reading the real admin route.
3. `PaidList.tsx`'s "Nonaktifkan" button flips `Entitlement.lifetimeOwned` — a BELI-only concept. Left unconditional, it would render (and, if clicked, silently no-op or worse) on `SLOT_PURCHASE` paid rows. Task 4 makes it conditional. Also not in the spec's original text — found by reading the real component.
4. No nav/route-table changes needed: `NavKey` already includes `"beli"` as a literal with no corresponding `TABS` entry (the existing `/beli` page reuses it purely for the (currently inert) active-tab highlight), so the new `/beli/slot` page reuses the same value rather than requiring a `nav-tabs.ts` change.

**Type consistency:** `createSlotCheckout`'s return type (`Payment`, including `quantity`) matches what Task 3's API route and UI expect (`{ id, amount, qrPayload, displayPrice, quantity }`). `PendingRow`/`PaidRow`'s new `productType`/`quantity` fields match the real `Payment` model's field names and types (`String`, `Int | null`) from sub-project 1's schema exactly — no renaming drift.
