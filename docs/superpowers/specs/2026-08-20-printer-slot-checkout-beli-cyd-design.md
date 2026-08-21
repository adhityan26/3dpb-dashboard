# Printer Slot Ledger — Sub-project 3: Checkout Beli CYD

**Status:** Design approved by user 2026-08-20, not yet planned/implemented.
**Depends on:** Sub-project 1 (Core Ledger & Enforcement) for the
`SlotGrant` model, `Payment` shipping columns, and the `CydVariant`
catalog; Sub-project 2 for the `activate()` product dispatch (already
handles `CYD_PURCHASE` via `CydVariant.slotBonus` — no changes needed
there).

## Context

Third of 4 sub-projects for the printer-monitoring-slot system (see
sub-project 1's doc for background). CYD is a physical product, so this
sub-project is scoped larger than sub-project 2: it needs shipping-address
capture at checkout and a post-payment fulfillment workflow, neither of
which any existing checkout in this app has needed before (the Pro
upgrade is purely digital).

## Shipping Cost: Manual, Not Part of Checkout Amount

User's explicit call: shipping is fully manual for this phase (small
volume, personal coordination already required for physical delivery).
Concretely:

- The checkout `amount` covers **only the CYD unit price** — no shipping
  estimate, no courier API integration.
- `shippingAddress` is captured at checkout time (required) so the seller
  has it on hand.
- `shippingCost` is filled in by the admin **after** the order, for their
  own bookkeeping — it is never added to `amount` or charged through the
  QRIS flow. Actual shipping payment/negotiation happens outside the
  system (WA), consistent with how physical delivery already works for
  other manually-coordinated parts of the business.

This intentionally rules out flat-rate estimation and real courier-API
integration (RajaOngkir etc.) for this phase — both were considered and
rejected as more complexity than the current volume justifies.

## Checkout Creation

No flat `price.cydPerUnit` Config key — price now comes from the chosen
`CydVariant` row (sub-project 1), since different bundles (with/without
casing, and future larger/hi-res models) carry different prices. The
checkout form lets the user pick one `active` `CydVariant` (today: exactly
2 — with casing, without casing).

New function in `apps/saas/lib/payment/service.ts`:
`createOrReuseCydCheckout(userId, cydVariantId, quantity, shippingAddress, now)`:

- `productType: "CYD_PURCHASE"`, `cydVariantId` = the chosen variant,
  `quantity` = number of units of that variant.
- `amount = quantity * variant.price - buffer + uniqueCode` (same
  buffer/unique-code pattern as existing checkouts; shipping cost is
  never part of this). Rejects if the referenced `CydVariant` is not
  `active`.
- `shippingAddress` is **required** (non-empty) — checkout creation fails
  without it, since an unshippable PAID order is a real ops problem.
- **Reuse-pending logic**: an existing PENDING `CYD_PURCHASE` payment is
  reused only if both `cydVariantId` AND `quantity` match (either one
  changes `amount`, so either forces a fresh payment). If only
  `shippingAddress` differs from the existing PENDING payment, **update
  the address in place** rather than creating a new payment — address has
  no effect on `amount`, so there's no reason to invalidate the existing
  QRIS code over an address correction.

`activate()`'s existing dispatch (designed in sub-project 2) already
handles `CYD_PURCHASE` — looks up the purchased `CydVariant.slotBonus` and
creates a `SlotGrant` with `quantity = quantity * variant.slotBonus`. No
changes needed to `activate()` itself in this sub-project.

## Admin Fulfillment: New "Pesanan CYD" Page

Separate from `PaymentQueue.tsx` (which handles PENDING → PAID
verification for all product types). This new admin page shows **already
PAID** `CYD_PURCHASE` payments — a different workflow (post-payment
logistics, not payment verification) with different actors' attention
(whoever handles shipping, not necessarily whoever verifies payments,
though currently the same person).

Columns: user, quantity, `shippingAddress`, `shippingCost` (admin-editable
number field), `shippingStatus` (dropdown: `PACKED` / `SHIPPED` /
`DELIVERED`).

New endpoint: `PATCH /api/admin/cyd-orders/:paymentId` — updates
`shippingCost` and/or `shippingStatus` on a `CYD_PURCHASE` payment.
Restricted to `OWNER_EMAILS` like the rest of the admin surface.

## Error Handling

- `quantity` must be a positive integer (same validation as sub-project
  2's slot checkout).
- `shippingAddress` must be non-empty — checkout creation rejects an empty
  or whitespace-only address.
- `cydVariantId` must reference an `active` `CydVariant` — reject with a
  clear error (not a generic `PriceNotSet`) if the variant doesn't exist
  or has been retired.
- Reuses existing errors: `QrisNotSet`, `CodePoolExhausted`.
- Admin PATCH endpoint rejects an unknown `shippingStatus` value (must be
  one of the three enumerated strings) and a non-CYD payment id.

## Testing

- `createOrReuseCydCheckout`: correct `amount` (shipping excluded,
  `variant.price * quantity`) for a given variant+quantity; reuses the
  existing PENDING payment when both variant and quantity match, updating
  `shippingAddress` in place if it changed; creates a new payment when
  either variant or quantity differs; rejects an empty `shippingAddress`;
  rejects a retired (`active: false`) or unknown `cydVariantId`.
- `activate()` for `CYD_PURCHASE` with `quantity: 2` and a variant whose
  `slotBonus: 10` produces a `SlotGrant` with `quantity: 20` — this
  specifically tests the variant-driven multiplier defined in sub-project
  2's dispatch, which sub-project 2's own test suite didn't cover (it
  only exercised the `SLOT_PURCHASE` branch). Add a second case with a
  different `slotBonus` (e.g. 20, simulating a future larger model) to
  confirm the multiplier truly comes from the variant, not a constant.
- Admin "Pesanan CYD" page: lists PAID CYD payments (showing which
  variant was bought); PATCH persists `shippingCost`/`shippingStatus`
  updates; rejects invalid status values.

## Out of Scope (this sub-project)

- Subscribe checkout and recurring billing (sub-project 4).
- Any real shipping-cost calculation or courier API integration —
  explicitly deferred per the "manual" decision above; revisit only if
  order volume grows enough to justify it.
- Customer-facing shipment tracking/status display — the `shippingStatus`
  field exists for admin bookkeeping in this sub-project; a "your CYD is
  on the way" UI for the buyer is a reasonable small follow-up, not
  required here.
