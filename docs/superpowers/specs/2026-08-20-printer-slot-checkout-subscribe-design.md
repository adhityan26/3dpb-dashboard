# Printer Slot Ledger — Sub-project 4: Subscribe Bulanan

**Status:** Design approved by user 2026-08-20, not yet planned/implemented.
**Depends on:** Sub-project 1 (Core Ledger & Enforcement) for `SlotGrant`;
Sub-project 2 for the `activate()` product dispatch (this sub-project
fills in the `SUBSCRIBE` branch left as a placeholder there).

## Context

Fourth and last of 4 sub-projects for the printer-monitoring-slot system
(see sub-project 1's doc for background). This is the only sub-project
with genuinely new operational infrastructure (a background job queue) —
the other three only extend the existing checkout/QRIS pattern.

## Same Product as the Planned Cloud/OCR Subscribe Tier

`Entitlement.subStatus` / `subStartedAt` / `subExpiresAt` /
`firstCloudMonthUsed` already exist in the schema from the original
2026-07-16 plan for a cloud/OCR subscription — never implemented. User
confirmed (2026-08-20): **this is the same subscription product**, not a
separate one. Printer-slot capacity (+5) is simply the first real benefit
this sub-project ships; cloud/OCR features can be added as additional
benefits of the same subscription later without a new billing concept or
a second monthly charge.

This sub-project is therefore the first real implementation of
"Subscribe" for this app.

## Checkout Creation

Two Config keys: `price.subMonthly` (normal) and `price.subMonthlyForOwner`
(discounted price for users who already own Pro — `Entitlement.
lifetimeOwned === true`). Both are flat rupiah amounts set independently
by the admin, matching every other price in this app's Config (no
percentage/delta math anywhere in this system).

New function in `apps/saas/lib/payment/service.ts`:
`createOrReuseSubscribeCheckout(userId, now)`:

- `productType: "SUBSCRIBE"` — no `quantity` dimension (always exactly one
  month).
- Reads `Entitlement.lifetimeOwned` for this `userId` **at checkout-
  creation time** and picks `price.subMonthlyForOwner` if `true`, else
  `price.subMonthly`. `amount = chosenPrice - buffer + uniqueCode` (same
  QRIS pattern as every other checkout in this app).
- Reuse-pending: any existing `PENDING` `SUBSCRIBE` payment within the
  live window is reused as-is — there's no variable input that could make
  a reused payment's `amount` wrong (unlike quantity-based sub-projects
  2-3).

**Discount timing, confirmed with user:** the discount applies to
whichever checkout is created **after** the user buys Pro — it is never
retroactive. If a user buys Pro mid-period (before their current
`subExpiresAt`), the period they already paid for at the normal price is
not adjusted or refunded; only their *next* renewal checkout (created
fresh, per the manual-renewal model — there's no locked-in subscription
price) picks up the discount. This falls out of the design for free:
because `lifetimeOwned` is read live at each checkout's creation rather
than cached at first-subscribe time, no extra logic is needed to make
renewals discount-aware once the user becomes a Pro owner.

## `activate()` Dispatch: `SUBSCRIBE` Case

Fills in the placeholder left in sub-project 2's dispatch:

```typescript
case "SUBSCRIBE": {
  const ent = await prisma.entitlement.findUnique({ where: { userId: p.userId } });
  // Renew before lapsing -> continue from the old subExpiresAt (no days lost).
  // First subscribe, or renewing after already lapsing -> start from now.
  const periodStart = ent?.subExpiresAt && ent.subExpiresAt > now ? ent.subExpiresAt : now;
  const periodEnd = addDays(periodStart, 30);
  await prisma.slotGrant.create({
    data: {
      userId: p.userId,
      source: "SUBSCRIBE",
      paymentId: p.id,
      quantity: 5,
      validFrom: periodStart,
      validUntil: periodEnd,
    },
  });
  await prisma.entitlement.upsert({
    where: { userId: p.userId },
    create: { userId: p.userId, subStatus: "ACTIVE", subStartedAt: now, subExpiresAt: periodEnd },
    update: { subStatus: "ACTIVE", subExpiresAt: periodEnd }, // subStartedAt untouched once set
  });
  break;
}
```

This preserves sub-project 1's append-only ledger rule: every payment —
first subscribe or any later renewal — creates its **own** new
`SlotGrant` row with its own `validFrom`/`validUntil`; nothing is ever
updated in place. Computing `periodStart` from the existing
`subExpiresAt` (when not yet lapsed) means renewals compose without gaps
or overlaps: a renewal on day 25 of a 30-day period starts its new
`SlotGrant` on day 30, not day 25.

**`subStatus` is a historical marker, not the source of truth for "is the
subscription currently valid."** It's set to `"ACTIVE"` the first time a
user subscribes and never flipped back — the authoritative check is
always `subExpiresAt > now`, computed live via a small shared helper
(`isSubscriptionCurrentlyActive(entitlement, now)`). This mirrors sub-
project 1's decision to compute slot capacity live rather than store a
flag that could drift stale — the same principle avoids needing a
separate cron job just to flip `subStatus` back to some "lapsed" value
when a subscription expires. When cloud/OCR features are eventually
built, they should gate on this same helper, not on `subStatus` alone.

Printer-slot capacity itself needs no new logic here — a lapsed
subscription just means its `SlotGrant.validUntil` has passed, which
sub-project 1's `getCapacity`/`getEligibleDeviceIds` already handles
(the same FIFO over-capacity mechanism that covers promo expiry and
launch grandfathering also covers a lapsed subscription, automatically).

## Renewal Reminders: BullMQ

New schema field: `Entitlement.reminderSentForExpiry DateTime?` —
records which `subExpiresAt` value a reminder has already been sent for,
so the daily sweep doesn't re-send on every run during the H-3 window. A
renewal changes `subExpiresAt`, which naturally makes this field stale
again and re-arms the reminder for the next cycle — no explicit reset
needed.

**Infrastructure:** reuse the homelab's existing shared Redis instance
(`redis://light-generator-redis-1:6379`, already used by other homelab
apps) with a `slizebiz:` key prefix to avoid collisions. `apps/saas`'s
container needs to join the `homelab` Docker network at deploy time (a
deploy-config change, not application code) to reach it by hostname.

- New dependency: `bullmq` (+ `ioredis`), added explicitly to
  `apps/saas/package.json`.
- `apps/saas/lib/queue/subscribe-reminders.ts` — defines the queue and a
  single repeatable job (`repeat: { pattern: "0 9 * * *" }`, once daily
  at 09:00) with no meaningful payload; the worker queries the database
  itself rather than the job carrying data.
- `apps/saas/lib/queue/subscribe-reminders.worker.ts` — the `Worker` that
  processes the daily sweep: query `Entitlement` where `subExpiresAt` is
  between `now` and `now + 3 days` AND `reminderSentForExpiry !==
  subExpiresAt`; for each match, look up the `User`, send via **email**
  (Resend) if `user.email` is set, else via **WA** if `user.phone` is set
  (users have exactly one of the two right now — WA and email login
  can't be merged yet, so there's no real fallback branching, just a
  direct check); then set `reminderSentForExpiry = subExpiresAt`.
- Both the repeatable-job registration and the `Worker` start once via
  Next.js's `instrumentation.ts` `register()` hook, which runs once per
  server process on boot — the standard mechanism for this kind of
  background-task startup. Adding the repeatable job on every boot is
  safe: BullMQ dedupes repeatable jobs by pattern, it won't create
  duplicates.

**Known limitation, acceptable at current scale:** running the worker
in-process with the web server means a multi-replica deployment would
fire the daily sweep once per replica. The current deploy is a single
container, so this doesn't apply yet — flagged here so it isn't
forgotten if the deploy topology ever changes.

## Error Handling

- Reuses existing checkout errors: `PriceNotSet` (whichever of
  `price.subMonthly` / `price.subMonthlyForOwner` applies to this user is
  unset), `QrisNotSet`, `CodePoolExhausted`.
- Reminder worker: a user with neither `email` nor `phone` set (shouldn't
  happen given auth requires one) is skipped with a logged warning rather
  than throwing and blocking the rest of the sweep.
- A send failure (email/WA provider error) for one user must not abort
  the sweep for the remaining matched users — catch per-user, log, and
  continue; that user's `reminderSentForExpiry` is only updated on a
  successful send, so a failed send is retried on the next day's sweep
  (as long as still within the H-3 window).

## Testing

- `createOrReuseSubscribeCheckout`: correct `amount` using `price.
  subMonthly` when `lifetimeOwned: false`; correct `amount` using
  `price.subMonthlyForOwner` when `lifetimeOwned: true`; reuses an
  existing PENDING SUBSCRIBE payment within the live window.
- Discount timing: a user subscribes while `lifetimeOwned: false` (normal
  price), then buys Pro mid-period; their *current* `SlotGrant`/
  `subExpiresAt` is untouched (no retroactive adjustment); the *next*
  `createOrReuseSubscribeCheckout` call for them uses the owner-discounted
  price.
- `activate()` for `SUBSCRIBE`, first subscribe: creates a `SlotGrant`
  with `quantity: 5`, `validFrom: now`, `validUntil: now + 30d`; sets
  `Entitlement.subStatus: "ACTIVE"`, `subStartedAt: now`,
  `subExpiresAt: now + 30d`.
- `activate()` renewal **before** lapse (`subExpiresAt` in the future):
  new `SlotGrant.validFrom` equals the old `subExpiresAt` (not `now`) —
  no gap or overlap; `subStartedAt` unchanged from the original.
- `activate()` renewal **after** lapse (`subExpiresAt` in the past): new
  `SlotGrant.validFrom` equals `now`, not the stale old expiry.
- Reminder sweep: an entitlement with `subExpiresAt` inside the H-3
  window and `reminderSentForExpiry` unset (or different) triggers a
  send and updates the field; an entitlement already reminded for the
  same `subExpiresAt` is skipped (no duplicate send); an entitlement
  outside the window is skipped.
- Channel selection: a user with `email` set receives an email send call;
  a user with only `phone` set receives a WA send call.
- A simulated send failure for one user doesn't prevent the sweep from
  processing the next matched user, and doesn't mark that user as
  reminded.

## Out of Scope (this sub-project)

- Cloud/OCR features themselves — only the shared subscription
  status/expiry mechanism they'll eventually gate on is built here.
- A grace-period/read-only fallback UI for lapsed subscriptions beyond
  what the printer-slot FIFO suspension already provides — the original
  2026-07-16 funnel spec's "90-day read-only fallback" was scoped to
  cloud data access, not printer slots, and isn't re-litigated here.
- Multi-replica-safe job scheduling (see the known limitation above) —
  revisit only if the deploy topology changes from a single container.
