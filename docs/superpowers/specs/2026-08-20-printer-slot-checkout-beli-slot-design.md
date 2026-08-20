# Printer Slot Ledger — Sub-project 2: Checkout Beli Slot Tambahan

**Status:** Design approved by user 2026-08-20, not yet planned/implemented.
**Depends on:** Sub-project 1 (Core Ledger & Enforcement) — needs the
`SlotGrant` model and `Payment.productType`/`quantity` columns.

## Context

Second of 4 sub-projects for the printer-monitoring-slot system (see
sub-project 1's doc for full background). This is the smallest checkout
addition — validates the ledger end-to-end (a real purchase produces a
real `SlotGrant`) before tackling the larger CYD (shipping) and Subscribe
(recurring) sub-projects.

## Shared Integration Point: `activate()` Product Dispatch

The existing checkout engine (`apps/saas/lib/payment/service.ts`) has one
`activate()` function that currently does exactly one thing on approval:
upsert `Entitlement.lifetimeOwned = true`. Every future product type
(SLOT_PURCHASE here, CYD_PURCHASE and SUBSCRIBE in sub-projects 3-4) goes
through this same `Payment` table and the same admin approval action, so
`activate()` must branch by `productType`. This dispatch is designed once,
here, and reused unchanged by sub-projects 3 and 4 (they only add their
own `case` branch).

```typescript
async function applyProductEffect(p: Payment, now: Date): Promise<void> {
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
    case "CYD_PURCHASE": {
      // sub-project 3 — slotBonus comes from the purchased CydVariant, not a hardcoded multiplier
      const variant = await prisma.cydVariant.findUniqueOrThrow({ where: { id: p.cydVariantId! } });
      await prisma.slotGrant.create({
        data: { userId: p.userId, source: "CYD_PURCHASE", paymentId: p.id, quantity: (p.quantity ?? 1) * variant.slotBonus },
      });
      break;
    }
    case "SUBSCRIBE":
      // sub-project 4 — period-bounded grant + Entitlement.subStatus/subExpiresAt update
      break;
  }
}

// activate() calls applyProductEffect(updated, now) after setting status: "PAID"
```

`SLOT_PURCHASE` and `CYD_PURCHASE` both create a `SlotGrant`, but differ in
where the per-unit slot count comes from: `SLOT_PURCHASE` uses the raw
`quantity` bought directly, while `CYD_PURCHASE` looks up `slotBonus` from
the specific `CydVariant` that was purchased (today always 10, but a
future larger/hi-res model can carry a different value with no code
change — see sub-project 1's `CydVariant` design). Sub-project 3 does not
need to touch this dispatch again, only its own checkout-creation,
variant selection, and shipping fields.

## Checkout Creation

New Config key: `price.slotPerUnit` (rupiah per 1 slot).

New function in `apps/saas/lib/payment/service.ts`:
`createOrReuseSlotCheckout(userId, quantity, now)`, mirroring the existing
`createOrReuseCheckout` with these differences:

- **No `AlreadyOwned` check** — slots can be purchased repeatedly, unlike
  the one-time Pro upgrade.
- **`amount = quantity * unitPrice - buffer + uniqueCode`** (same
  buffer/unique-code QRIS-matching pattern as the existing checkout).
- **Reuse-pending scoped to matching quantity**: an existing PENDING
  payment is reused only if it has `productType: "SLOT_PURCHASE"` AND the
  same `quantity`, within the live window. If the user changes the
  quantity, a fresh `Payment` is created (so `amount` always matches the
  currently-displayed total) rather than reusing a stale one.
- **`quantity` input has no upper bound** (user's explicit call — no max
  cap on the form).
- Created with `productType: "SLOT_PURCHASE"`, `quantity: <chosen qty>`.

## UI

New checkout form (same structure/theme as `BeliCheckout.tsx`): a quantity
input (positive integer, no upper bound) with a live-computed total
(`quantity × price.slotPerUnit`), then the existing QRIS-payload +
proof-upload flow, unchanged.

**Admin `PaymentQueue.tsx`** (verification queue) needs to display
`productType` and `quantity` per row so the admin can tell a slot purchase
apart from a Pro upgrade at a glance. The approve action stays a single
button — `activate()`'s dispatch already determines the correct effect.

## Error Handling

- `quantity` must be a positive integer (reject 0, negative, non-integer)
  — validated before checkout creation, same layer as the existing
  price/QRIS presence checks.
- Reuses existing errors from `lib/payment/errors.ts`: `PriceNotSet`
  (when `price.slotPerUnit` unset), `QrisNotSet`, `CodePoolExhausted`.

## Testing

- `createOrReuseSlotCheckout`: correct `amount` for a given quantity;
  reuses an existing PENDING payment when quantity matches within the
  live window; creates a new payment when quantity differs from the
  existing PENDING one; throws `PriceNotSet` when `price.slotPerUnit` is
  unset; throws `QrisNotSet` when `qris.static` is unset.
- `activate()` for `productType: "SLOT_PURCHASE"`: creates a `SlotGrant`
  row with the correct `quantity`, `source: "SLOT_PURCHASE"`, and
  `paymentId`; does **not** touch `Entitlement.lifetimeOwned`.
- Admin `PaymentQueue` renders `productType`/`quantity` for a
  SLOT_PURCHASE row.

## Out of Scope (this sub-project)

- CYD checkout and shipping tracking (sub-project 3).
- Subscribe checkout and recurring billing (sub-project 4).
- Any UI/logic for spending or viewing current slot capacity beyond what
  sub-project 1 already computes server-side (a "kapasitas kamu: X/Y"
  display on a settings page is a reasonable small follow-up, not
  required for this sub-project to be complete).
