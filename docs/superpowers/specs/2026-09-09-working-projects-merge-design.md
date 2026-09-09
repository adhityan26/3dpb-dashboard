# Working Projects Merge — Design Spec

**Date:** 2026-09-09
**Scope:** `apps/dashboard` (this repo) + a small, explicitly-scoped change to the
separate `ai-assistant` Node/Express/discord.js project running on
`192.168.88.92:3000` (PM2, not containerized, own git repo at `/app/src`).

## Problem

`ai-assistant` currently owns a "Working Projects" order-production-tracker
module (`orders/` — web UI + SQLite + Discord forum-thread sync). The user
wants this module's **backend logic and data ownership** to move into
`apps/dashboard`, while keeping Discord forum threads seamlessly in sync —
existing and future threads must keep working exactly as they do today,
with no visible disruption to the team using Discord.

**Explicitly in scope:**
- The "Working Projects" order tracker (`public/index.html`), its timeline
  view (`public/timeline.html`), and its Green Lantern Ring filtered view
  (`public/green-lantern-ring/index.html` — confirmed NOT a sizing
  calculator; it's a filtered/specialized view of the same order data for
  ring-category production tracking).
- Creating a Working Project from three sources: an existing Shopee order,
  an existing Tokopedia order, or manual entry.
- Keeping each Working Project synced to a Discord forum thread
  (create/rename/tag/edit/delete/reminder).

**Explicitly out of scope:**
- Any ring-*sizing calculator* tool (there is no such tool in the fetched
  files — this was an earlier misreading, corrected during design; nothing
  is excluded here that turned out to be in-scope).
- `orders/cyd-publisher.js` and the CYD/MQTT hardware-sync path.
- N8N integration.
- Deleting/decommissioning the rest of `ai-assistant` (bot commands
  unrelated to orders — research, tanya, lineart, wa-setting, etc. — are
  untouched).

## Architecture

### Ownership split

**`apps/dashboard` becomes the sole source of truth for Working Project
data** (Postgres via Prisma) and owns all business logic: fetching
Shopee/Tokopedia order data (already has this — `lib/shopee/orders.ts`,
`lib/tokopedia/orders.ts`), building Discord post/thread content, deciding
when a thread needs to change.

**`ai-assistant` keeps running** (PM2, same host) but is reduced to two
roles that genuinely require a persistent process:
1. **Discord executor** — a small relay layer that wraps its existing
   `discord.js` client to perform outbound Discord operations on request
   from the dashboard. This is REST-only Discord.js work (create/rename/
   tag/edit/delete a thread, send a message) — none of it requires a
   gateway connection per se, but keeping it in `ai-assistant` means
   **zero new Discord dependency or bot token in `apps/dashboard`**, and
   the same bot identity keeps editing threads it already owns.
2. **Gateway-dependent listeners** — slash commands
   (`/order-baru`, `/order-dari-shopee`, `/order-dari-tokopedia`) and the
   `threadUpdate` event (tag changed manually in Discord) genuinely need a
   live gateway connection. These handlers are simplified to thin clients
   that call the dashboard's new bot-facing API instead of touching
   SQLite or building post content themselves.
3. **Reminder cron** (already exists, hourly, in `ai-assistant`'s
   `index.js`) stays there too — it already holds live `thread` objects,
   so it's the natural place to keep sending reminder messages. It's
   updated to ask the dashboard which Working Projects are due today
   (instead of reading its own SQLite) and to report back which
   reminders were sent.

This reverses (for orders) the dependency direction that already exists
today for Shopee/Tokopedia data (`ai-assistant` → `dashboard` via
`BOT_API_URL`/`BOT_API_TOKEN`, confirmed live by reading
`bot/handlers/commands/order-dari-shopee.js` and `tokopedia-order.js`) and
extends it: the same `BOT_API_TOKEN` is reused for the new
create-Working-Project call (`POST /api/bot/working-projects`) — no new
token needed for that direction. A **new** token is needed for the
opposite direction (dashboard → `ai-assistant`, to execute Discord ops),
because that direction doesn't exist today for this purpose. `ai-assistant`
already has one dashboard→ai-assistant integration
(`app/api/po/ocr/route.ts` → `ai-assistant`'s `/webhook/ocr`, authenticated
via an `X-Webhook-Secret` header and `HOMELAB_OCR_SECRET`) — the new
Discord-relay call follows the **same header convention** for consistency,
but uses a **separate** secret (`DISCORD_RELAY_TOKEN`), not the OCR one —
least privilege: a leaked OCR secret shouldn't also grant Discord thread
control.

### Data model

New Prisma model in `apps/dashboard/prisma/schema.prisma`:

```prisma
model WorkingProject {
  id               String   @id @default(cuid())
  discordThreadId  String?  @unique
  forumChannelId   String?  // which forum this thread lives in — fixes a
                             // latent bug in the old code (see "Fixed
                             // issues" below)
  source           String   // "shopee" | "tokopedia" | "manual"
  sourceOrderNo    String?  // Shopee orderSn / Tokopedia order_id; null for manual.
                             // Used to live-fetch full marketplace detail
                             // on demand (see UI section) — never stored
                             // as a snapshot, to avoid staleness.
  customer         String
  contact          String?
  platform         String?
  product          String
  variant          String?
  title            String   // base title, no emoji/status prefix
  status           String   @default("Open") // Open|Proses|Waiting Customer|Siap Kirim|Done|Canceled
  payment          String   @default("Belum") // Belum|DP|Lunas|Marketplace
  orderDate        DateTime @default(now())
  dueDate          DateTime?
  invoiceAmount    Int      @default(0)
  paidAmount       Int      @default(0)
  notes            String?
  shipping         String?
  trackingNo       String?
  checklist        Json     @default("[]") // [{id,text,done,done_at,done_by,added_by,added_at,deleted}]
  mentions         String[] @default([])   // Discord user IDs
  appliedTags      String[] @default([])   // Discord forum tag IDs
  remindersSent    Int[]    @default([])   // which reminder-day thresholds already fired
  quotationId      String?  // optional link to an existing Quotation (invoice)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

Settings (`reminder_days`, `default_mentions`) go into the existing
`Config` key-value table under key `workingProjects.reminderSettings`
(JSON blob) — no new settings table.

Applied via `prisma db push` on next deploy (this repo's actual deploy
path per `docker-entrypoint.sh`, not `migrate deploy` — confirmed in
earlier work this session). Since this is an additive new model, `db
push --accept-data-loss` is safe; **column names must be finalized before
first deploy**, since any later rename would need to go through the same
accept-data-loss path against a live table.

### Discord relay (`ai-assistant` side, new file `orders/discord-relay.js`)

Wraps existing `discord.js` calls (all confirmed REST-only by reading
`router.js`/`order-baru.js`/`status-tags.js` — none need gateway state):

| Endpoint | Wraps |
|---|---|
| `GET /discord-relay/channel/:id/tags` | `channel.availableTags` |
| `POST /discord-relay/thread` | `forum.threads.create({name, message})` → `{threadId, threadUrl}` |
| `PATCH /discord-relay/thread/:id` | `setName` / `setAppliedTags` / edit starter message (request body selects which) |
| `DELETE /discord-relay/thread/:id` | `thread.delete()` |

Auth: `X-Webhook-Secret: <DISCORD_RELAY_TOKEN>` header, checked the same
way `webhook/ocr.js` checks `WEBHOOK_SECRET` today.

### Dashboard API surface

**Bot-facing** (new, `apps/dashboard/app/api/bot/working-projects/*`,
auth via existing `requireBotToken` / `BOT_API_TOKEN` pattern — same as
`app/api/bot/invoice/route.ts`):

| Endpoint | Called by (in `ai-assistant`) | Behavior |
|---|---|---|
| `POST /api/bot/working-projects` | slash `/order-baru`, `/order-dari-shopee`, `/order-dari-tokopedia` | Body `{source, sourceOrderNo?, forumType, ...manualFields}`. For shopee/tokopedia, dashboard fetches full detail itself (`getOrderDetail`/`getOrderById`, no more HTTP round-trip). Builds title + post content, calls the `ai-assistant` Discord relay to create the thread, persists `WorkingProject` with `discordThreadId` + `forumChannelId`. Returns `{threadUrl}`. |
| `PATCH /api/bot/working-projects/:threadId/tags` | `threadUpdate` gateway listener | Syncs `appliedTags` changed manually in Discord back into the DB. |
| `GET /api/bot/working-projects/due-reminders` | hourly cron | Returns Working Projects needing a reminder today. |
| `POST /api/bot/working-projects/:threadId/reminder-sent` | hourly cron, after `thread.send()` succeeds | Appends to `remindersSent`. |

**Web-facing** (new, session-authenticated, used by the dashboard UI):
`GET/POST/PATCH/DELETE /api/working-projects`,
`GET /api/working-projects/:id/detail-source` (live-fetches full
marketplace detail by `sourceOrderNo` + `source`, for the UI's expand/detail
view — no stored snapshot).

Any web-side create/update/delete that changes Discord-visible state
(title, tags, post content, thread deletion) calls the `ai-assistant`
Discord relay the same way the bot-facing create endpoint does — there is
exactly one code path in the dashboard that talks to the relay
(`lib/working-projects/discord-sync.ts`), used by both the web API routes
and the bot-facing routes.

### UI

Not a standalone page — folded into the **existing** `/order` page's
channel sidebar (`OrderSidebar.tsx`), as a **new channel positioned first**
(above Shopee), so it's the default channel when `/order` is opened.

The `working-project` channel renders three tabs, deep-linkable via query
params matching this repo's existing `?channel=` convention:
`/order?channel=working-project&tab=orders` (default),
`/order?channel=working-project&tab=green-lantern-ring`,
`/order?channel=working-project&tab=timeline`.

- **`tab=orders`** — list matching the original `index.html`'s columns
  exactly: Customer/Contact, Produk, Variant, Platform, No. Order, Due
  Date, Status, Payment, Nominal, Checklist, Discord (link), plus an edit
  action. Clicking a row with `source` shopee/tokopedia shows a "Lihat
  Data Marketplace" action that live-fetches via
  `GET /api/working-projects/:id/detail-source`.
- **`tab=green-lantern-ring`** — same underlying data, filtered by
  `/green.?lantern/i.test(product)` (ported from `isGLRing()`), with the
  original's specialized columns: Due/Order Date, No Order, Platform,
  Variant, parsed US ring size (from `notes`, via the ported `parseSize()`
  regex — no new field, computed client-side same as the original),
  then 7 checklist checkboxes (Frame/Stone/Ring × Print/Cat, plus
  Assembly), Progress, Status, Discord link. Checkboxes toggle the
  matching `checklist` item via `PATCH /api/working-projects/:id`.
- **`tab=timeline`** — Gantt view, `orderDate` → `dueDate`, colored by
  status, same data source as the `orders` tab (confirmed: the original
  `timeline.html` uses the identical `GET /orders/api/orders` endpoint,
  just a different rendering — no separate data source needed).

A "+ Working Project" button on `tab=orders` opens a manual-entry modal.

**New action on existing pages:** `app/(dashboard)/order/page.tsx`'s
Shopee and Tokopedia channels each get a "📋 Buat Working Project" row
action, prefilling `source`/`sourceOrderNo`/customer/product from that
order, submitting to `POST /api/working-projects` (which re-fetches full
detail server-side by `sourceOrderNo` rather than trusting client-supplied
fields, then calls the Discord relay same as the bot-facing path).

Visual style follows this repo's existing Glass theme (`g-card`,
`g-accent`, etc., as used in `InvoiceDetail`/`InvoiceForm`) — not a port of
the old vanilla-HTML look. Must be wrapped in `PageShell` per
`docs/ui-page-layout.md` (already satisfied since it's a channel inside
the existing `/order` page, which already uses `PageShell`).

### Fixed issues (carried over from Fable's analysis, confirmed worth
fixing during the rewrite rather than replicating)

- **Multi-forum tag-resolution bug**: the old code always reads
  `availableTags` from `ORDERS_FORUM_CHANNEL_ID` regardless of which forum
  a thread actually lives in, so person-tags on non-default forums
  (topeng/cincin/clicker) resolve incorrectly. Fixed by storing
  `forumChannelId` per `WorkingProject` and resolving tags from the
  correct forum.
- **Duplicated create logic**: the old `router.js` and `order-baru.js` had
  near-identical inline create logic (including two separate `FORUM_MAP`
  definitions). Consolidated into one path
  (`lib/working-projects/service.ts` `createWorkingProject()`).
- **Timezone**: old code used the process's local time
  (`datetime('now','localtime')` in SQLite, host-dependent). New code sets
  `Asia/Jakarta` explicitly wherever due-date/reminder math happens.

### Data migration

One-shot (not dual-write) — the data volume is small (workshop scale) and
every record has a natural unique key (`thread_id`), so import is
idempotent.

1. On `192.168.88.92`: `sqlite3 /app/data/orders.db ".mode json" "select * from orders"` → JSON file.
2. New script `apps/dashboard/scripts/migrate-working-projects.ts`
   (same pattern as `scripts/seed-cyd-field-presets.ts`): parses the
   JSON-string columns (`checklist`, `mentions`, `applied_tags`,
   `reminders_sent`), maps to `WorkingProject`, `upsert`s by
   `discordThreadId`.
3. Before cutover: spot-check whether any live thread's starter message
   was posted by a human, not the bot (`thread.ownerId !== botUserId`) —
   if so, that thread's post-content can never be auto-edited by any bot,
   before or after this migration; this is a pre-existing limitation, not
   a regression, but worth knowing about ahead of time rather than being
   surprised by it later.

### `ai-assistant`-side changes (separate repo, production host,
via SSH — no staging environment exists there)

Executed as part of this same effort (per explicit user decision), git-committed
on that host before each file edit so any step can be reverted:

1. Add `orders/discord-relay.js` (new endpoints, see above), mount in
   `index.js`, add `DISCORD_RELAY_TOKEN` to `.env`.
2. `order-baru.js` / `order-dari-shopee.js` / `tokopedia-order.js`: replace
   local order-creation logic with a `fetch()` to the dashboard's new
   `POST /api/bot/working-projects` (reusing `BOT_API_URL`/`BOT_API_TOKEN`,
   already present).
3. `thread-update-handler.js`: replace the local SQLite update with a
   `PATCH` to `/api/bot/working-projects/:threadId/tags`.
4. `index.js`'s hourly reminder cron: replace `getAllOrders()` (local
   SQLite) with `GET /api/bot/working-projects/due-reminders`; after
   `thread.send()`, call `POST .../reminder-sent`.
5. After cutover is verified working end-to-end: remove/disable the old
   `orders/router.js` mount, the old `public/*.html` files, and
   `db/orders.js` (the web UI is now served entirely from the dashboard).
6. `pm2 restart` after each step; verify one slash command manually
   before moving to the next file.

## Testing

- `lib/working-projects/format.ts` (ported pure functions —
  `buildPostContent`, `buildThreadTitle`, `stripTitlePrefixes`,
  `getPersonTag`, `parseDueDate`/`formatDueDate`, `parseSize`,
  `isGLRing`) — unit tests asserting parity with the original's behavior
  on representative inputs (same spirit as the kalkulator-core golden
  tests, though not literally shared infrastructure).
- `lib/working-projects/service.ts` (`createWorkingProject`,
  `updateWorkingProject`) — unit tests with the Discord relay call mocked,
  covering: shopee/tokopedia/manual creation, the multi-forum tag fix,
  status/tag/post-content sync on update, escrow-style resilience (a
  failed relay call shouldn't corrupt the DB record — matches the
  precedent already set in `lib/analytics/income.ts`'s escrow-sync
  error handling this session).
- `app/api/bot/working-projects/*` route tests (mocked service layer,
  auth-checked) — same pattern as existing `app/api/bot/*` route tests.
- `scripts/migrate-working-projects.ts` — test against a fixture JSON
  export shaped like the real SQLite dump.
- UI: component tests for the three tabs' rendering (columns, checklist
  toggle, GL Ring filter/parse), following this repo's existing
  `renderToStaticMarkup`-based test conventions.
- `ai-assistant`-side changes are manually verified against production
  (no test suite ports there — `vitest` exists in that repo but wasn't
  read as part of this analysis; out of scope to extend it here).

## Out of scope / explicitly deferred

- Removing `ai-assistant` entirely — it keeps running for gateway-only
  duties (slash commands, `threadUpdate`, reminder cron) indefinitely;
  full decommissioning was not requested.
- CYD/MQTT sync for Working Projects — `cyd-publisher.js` currently reads
  from the SQLite this migration retires; what CYD does after cutover is
  a separate, explicitly out-of-scope decision the user will make later.
- Any change to `ai-assistant`'s other bot commands (research, tanya,
  lineart, wa-setting, catalog-wa, etc.) — untouched.
- A ring-sizing calculator tool — does not exist in the analyzed code;
  nothing was excluded here on that basis (see Problem section).
