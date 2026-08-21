# Printer Slot Ledger — Sub-project 1: Core Ledger & Enforcement

**Status:** Design approved by user 2026-08-20, not yet planned/implemented.

## Context

Agent app (Electron desktop) can monitor printers without needing physical
CYD hardware at all — CYD becomes an optional capacity add-on, not a
requirement. This is a pivot from the earlier framing (CYD = main product,
Agent = supporting tool): now the Agent app's printer-monitoring capability
is itself the primary paid feature, gated by a slot count.

This is the first of 4 sub-projects for the printer-monitoring-slot system
(decomposed 2026-08-20 because the full scope — ledger, checkout multi-SKU,
CYD shipping, subscribe billing — is too large for one plan):

1. **Core Ledger & Enforcement** (this doc) — prerequisite for all others.
2. Checkout: Beli Slot Tambahan (flexible quantity SKU).
3. Checkout: Beli CYD (physical, needs shipping tracking).
4. Subscribe Bulanan (recurring, no billing infra exists yet).

## Problem

A user's printer-monitoring capacity must be the sum of multiple
independent, time-bounded grants (free baseline, CYD purchases, slot
purchases, subscribe, promos) — not a single mutable number — because each
source can expire or be revoked independently and the system must stay
auditable (trace any capacity change back to what caused it).

## Data Model

Extend the existing `Payment` model (currently used only for the Pro
one-time upgrade checkout) into a general purchase-record table for all
product types, and add a new `SlotGrant` ledger table.

```prisma
model Payment {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  productType     String    // "BELI" | "CYD" | "SLOT_PURCHASE" | "SUBSCRIBE" — renamed from `tier`
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
  shippingAddress String?   // only populated when productType = CYD
  shippingCost    Int?      // ongkir, CYD only
  shippingStatus  String?   // "PACKED" | "SHIPPED" | "DELIVERED", CYD only
  cydVariantId    String?   // only populated when productType = CYD, see CydVariant below
  createdAt       DateTime  @default(now())

  slotGrant  SlotGrant?
  cydVariant CydVariant? @relation(fields: [cydVariantId], references: [id])
  @@index([status, createdAt])
}

model CydVariant {
  id        String   @id @default(cuid())
  label     String   // e.g. "CYD Standar (dengan casing)", "CYD Standar (tanpa casing)"
  price     Int      // rupiah per unit
  slotBonus Int      @default(10) // slot granted per unit — default matches today's single model; future larger/hi-res models can differ
  active    Boolean  @default(true) // retire an old variant without deleting it (existing Payment rows still reference it)
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
  id         String           @id @default(cuid())
  userId     String
  source     SlotGrantSource
  paymentId  String?          @unique  // null only for PROMO (admin-issued, no purchase)
  payment    Payment?         @relation(fields: [paymentId], references: [id])
  quantity   Int
  active     Boolean          @default(true)
  validFrom  DateTime?
  validUntil DateTime?
  createdAt  DateTime         @default(now())

  @@index([userId])
}
```

**Migration note:** `Payment.tier` renamed to `productType` — existing code
reading/writing `tier` (checkout, admin `PaymentQueue`, tests) must be
updated in the same change. Existing rows get `productType = "BELI"` via
the rename (no value transformation needed, only column rename + existing
`"BELI"` tier value already matches).

**Also drop `Entitlement.printerSlots` (`Int?`, currently unused/unset)**
in this same migration. It predates this design and would otherwise sit
alongside the new `SlotGrant` ledger as a second, misleading "slot count"
that nothing writes to — `SlotGrant` is the sole source of truth for
capacity going forward.

**Free baseline (+1) is NOT a ledger row.** It's a constant added in the
capacity formula. Rationale: making it a real row would require a backfill
migration for every existing user; a constant applies to everyone
automatically with zero migration risk.

**Append-only for recurring sources (SUBSCRIBE).** Each subscribe payment
— whether the first one or a renewal after a lapse — creates its own new
`SlotGrant` row with its own `validFrom`/`validUntil` covering exactly that
payment's period. Renewals never update an existing row in place. If a
user lapses and later resubscribes, the old row simply ages out via
`validUntil` and the new payment produces a fresh row. This keeps the
ledger genuinely append-only and auditable — no mutation of historical
grant records.

**PROMO exception.** Promo/quiz bonuses are admin-issued directly, with no
underlying `Payment` — `paymentId` is `null` for these rows. Admin creates
a `SlotGrant` row directly (source `PROMO`, quantity, `validFrom`/
`validUntil` for the promo window) via an admin action (exact UI is out of
scope for this sub-project; a minimal one-off admin script is acceptable
until there's a real need for a UI).

## Capacity & Eligibility Logic

New file: `apps/saas/lib/printer-slots/capacity.ts`

```typescript
async function getCapacity(userId: string): Promise<number> {
  const now = new Date();
  const grants = await prisma.slotGrant.findMany({
    where: {
      userId,
      active: true,
      OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }],
    },
  });
  return 1 + grants.reduce((sum, g) => sum + g.quantity, 0);
}

async function getEligibleDeviceIds(userId: string): Promise<Set<string>> {
  const capacity = await getCapacity(userId);
  const devices = await prisma.device.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return new Set(devices.slice(0, capacity).map((d) => d.id));
}
```

`Device.createdAt` (existing column) is reused directly as the FIFO
ordering key — no new column on `Device`. Eligibility is computed live on
every call, never cached or stored as a flag on `Device` — grants can
expire purely by time passing with no triggering event, so a stored flag
would drift stale without a cron job. Computing live avoids that class of
bug entirely and is cheap at this user scale.

**No device-level on/off toggle exists.** A device is either paired
(consuming a slot, subject to FIFO eligibility) or unpaired (freed). To
free a slot for a different printer, the user must fully unpair the old
device (not a soft disable) — this is intentional friction: it pushes
users toward buying more slots rather than freely juggling printers. This
is separate from grant-level active/inactive, which is a ledger concept
(e.g., an admin revoking a promo).

## FIFO Over-Capacity Handling

Applies uniformly to every situation where `pairedDeviceCount` exceeds
current capacity — whether from a promo/subscribe grant expiring, or (at
feature launch) pre-existing users who paired more devices than their
new capacity allows. There is no separate migration/grandfathering logic:
the same live computation in `getEligibleDeviceIds` handles both cases
automatically, since it's computed fresh every time, not seeded once.

Rule: **oldest-paired device wins.** Devices are ranked by `createdAt`
ascending; only the top `capacity` devices are eligible. Newer devices
beyond capacity are **suspended, not deleted or unpaired** — they keep
their `shortCode` and pairing, but stop receiving live monitoring data
until capacity is restored (buy more slots, or the user unpairs an active
device to make room) or grant availability changes.

This was deliberately chosen over auto-unpairing the excess: unpairing is
reserved for a user's own choice to swap printers (see above); losing
pairing to a capacity drop the user didn't cause (e.g., a promo expiring)
would read as data loss, not a natural nudge to upgrade.

## Enforcement Points

1. **Device pairing endpoint** — before inserting a new `Device` row,
   reject if `count(Device where userId) >= getCapacity(userId)`, wrapped
   in a `prisma.$transaction` (count + insert atomically) to avoid a
   time-of-check-to-time-of-use race between two concurrent pairing
   requests at the capacity boundary. Error response uses a distinct code
   (`capacity_exceeded`) so callers can show the right message instead of
   a generic pairing failure.
2. **Device status/telemetry endpoint** (the existing endpoint the CYD/
   Agent flow uses to read layout/status — exact file confirmed at
   planning time) — before returning live data for a device, check
   `device.id ∈ getEligibleDeviceIds(userId)`. If not eligible, return the
   same `capacity_exceeded` signal instead of the normal payload, so the
   SaaS UI can show an explicit "kapasitas terlampaui" banner instead of
   blank/stale data.

Enforcement is **backend-only** — the Agent app has no slot logic of its
own. This is intentional: printers can only be paired from the SaaS side
(the Agent app cannot register a new device on its own), so gating at the
SaaS API is the single source of truth and keeps the Agent app simple.

## Error Handling

- Pairing rejection at capacity uses a distinct error code
  (`capacity_exceeded`), separate from other pairing failures (invalid
  `shortCode`, already-paired device).
- Status/telemetry endpoint returns the same distinct signal for
  ineligible devices rather than empty/stale data.
- Pairing count-check + insert is wrapped in a transaction to close the
  concurrent-request race window.

## Testing

- `getCapacity`: baseline-only (=1); with one active grant; with an
  expired promo (`validUntil` in the past — excluded); with a promo whose
  `validFrom` is in the future (excluded); with an `active: false` grant
  (excluded); sum across multiple simultaneous grants.
- `getEligibleDeviceIds`: exactly at capacity (all eligible); under
  capacity (all eligible); over capacity (newest devices excluded,
  oldest retained) — this same test doubles as the "launch grandfathering"
  and "grant expiry" scenarios since both go through the identical live
  computation.
- Integration: pairing endpoint rejects at capacity with
  `capacity_exceeded` and accepts under capacity, inside the transaction;
  status endpoint returns `capacity_exceeded` for a suspended device and
  normal data for an eligible one.

## CYD Product Variants

CYD purchases (sub-project 3) need to support different bundles at
different prices — today: with-casing vs without-casing — and the user
plans larger/higher-resolution CYD models later. Rather than a boolean
flag (`hasCasing`) that would need a schema change for every new
dimension, `CydVariant` is a small catalog table: each row is one
purchasable configuration with its own price and `slotBonus` (slot grant
per unit — defaults to 10, matching today's single model, but a future
larger model could grant a different amount without any code change,
just a new seeded row). `activate()`'s `CYD_PURCHASE` branch (sub-project
2) reads `slotBonus` from the variant instead of a hardcoded multiplier.

Only 2 rows exist today (with casing / without casing), seeded once via a
one-off script (same pattern as `db:seed-kalk-v2`). A full admin CRUD UI
for managing variants is out of scope here — the user only asked to
prepare the code structure, not build variant management tooling; adding
a genuinely new model later is a manual DB insert (or a small follow-up
UI if variants start changing often enough to justify one).

## Out of Scope (this sub-project)

- Checkout flows for CYD, slot purchase, or subscribe (sub-projects 2-4).
- Admin UI for issuing PROMO grants (a one-off script suffices for now).
- Admin UI for managing `CydVariant` rows (seed script only, see above).
- CYD shipping fulfillment UI (sub-project 3).
- Any Agent-app-side changes — this sub-project only touches `apps/saas`.
- Note: because Agent-app changes are out of scope, FIFO suspension is
  currently only visible via the CYD layout display (`/api/agent/layout`,
  filtered) — the Agent app's own monitoring engine (driven by the
  unfiltered `/api/agent/devices`) continues running for over-capacity
  devices until a follow-up apps/agent-side sub-project closes this gap.
  Sub-projects 2-4 (checkout flows) should NOT assume full end-to-end
  enforcement already exists.

## Related Open Item (not solved here)

The existing unique-QRIS-code pool (checklist item #3, `apps/saas`
security review 2026-07-19) becomes more relevant as transaction volume
grows once CYD/slot/subscribe checkouts exist alongside the Pro upgrade —
more concurrent PENDING payments increase the chance of exhausting the
pool. Not addressed here; flagged for whoever picks up item #3.
