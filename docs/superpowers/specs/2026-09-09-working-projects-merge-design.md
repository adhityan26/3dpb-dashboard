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
2. **Gateway-dependent listeners** — every order-related slash command and
   context menu genuinely needs a live gateway connection to receive the
   interaction: `/order-baru`, `/order-dari-shopee`, `/order-dari-tokopedia`,
   `/order-status`, `/order-selesai`, `/order-update`, `/order-checklist`
   (6 subcommands: add/check/uncheck/edit/remove/copy, plus its
   autocomplete), `/mention-set`, `/reminder-config`, and the "🗂️ Buat
   Order" message context menu (routes through the same modal as
   `/order-baru` — see §Dashboard API surface). The `threadUpdate` event
   (tag changed manually in Discord) needs the same live connection.
   **Every one of these becomes a thin handler**: validate/parse the
   interaction in Discord, make exactly one `fetch` to the dashboard's
   bot-facing API, and render the reply from that response. The dashboard
   performs the DB write and triggers any Discord-visible side effect by
   calling back into the `ai-assistant` relay — the handler itself never
   touches SQLite or Discord content directly (only user-facing reply
   text and, where noted below, reading a value already in hand from the
   interaction/thread object it was already given).
   The `📱 Kirim WA Status` context menu (in the same `catalog-wa.js`
   file) touches no order data — it's unrelated (WA Omni broadcast) and
   stays untouched.
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
  orderDate        DateTime? // nullable: legacy web-entered order_date was
                             // stored unparsed with no validation; a
                             // missing legacy value must not be
                             // fabricated as "now"
  dueDate          DateTime?
  dueDateRaw       String?  // preserves a legacy due date that couldn't be
                             // parsed as ISO (e.g. "akhir bulan", "TBD") —
                             // the old code stored these verbatim and
                             // displayed them as-is. Display rule:
                             // dueDate ?? dueDateRaw ?? '-'. New writes
                             // (server-side validated) never populate this.
  invoiceAmount    Int      @default(0)
  paidAmount       Int      @default(0)
  notes            String?
  shipping         String?
  trackingNo       String?
  checklist        Json     @default("[]") // canonical item shape:
                             // {id:int, text:string, done:bool,
                             //  done_at:string|null, done_by:string|null,
                             //  added_by:string, added_at:string,
                             //  deleted:bool}. `id` is allocated
                             // server-side as max(id)+1 over ALL items
                             // (including deleted) — never client-supplied.
                             // Every write is normalized to this shape
                             // (assign missing id, coerce booleans) so a
                             // caller can never write a partial item —
                             // this closes a real bug in the old code
                             // where the Green Lantern Ring view wrote
                             // {text,done} with no id, corrupting later
                             // id allocation (NaN ids).
  mentions         String[] @default([])   // Discord user IDs
  appliedTags      String[] @default([])   // Discord forum tag IDs
  remindersSent    Int[]    @default([])   // which reminder-day thresholds already fired
  quotationId      String?  // optional link to an existing Quotation (invoice)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

Settings go into the existing `Config` key-value table under key
`workingProjects.reminderSettings`, value shape
`{reminderDays: number[] (default [7,3,1]), defaultMentions: string[]}`
— no new settings table. The three original writers of these values
disagreed on input parsing (`/mention-set` extracts `<@id>` mentions,
`/reminder-config` takes bare comma-separated IDs, the old web PATCH took
a raw JSON array) — the new setting endpoints accept only the
already-parsed `string[]`/`number[]` shape; each caller does its own
parsing before calling it.

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
| `PATCH /discord-relay/thread/:id` | Body independently selects `{name?, appliedTags?, starterContent?}` — wraps `setName` / `setAppliedTags` / edit-starter-message, any subset in one call (status changes rename+edit; mentions changes call nothing; checklist changes edit-only) |
| `POST /discord-relay/thread/:id/archive` | `thread.setArchived(true)` — needed by `/order-selesai` |
| `DELETE /discord-relay/thread/:id` | `thread.delete()` |

No "post/edit message by id" endpoint is needed: `checklist_msg_id`
(a column that exists in the old SQLite schema) has zero readers or
writers anywhere in the codebase — `/order-checklist` only edits the
starter message, same as every other update path. Treat it as dead
schema (see §Data migration).

Auth: `X-Webhook-Secret: <DISCORD_RELAY_TOKEN>` header — confirmed against
the actual `webhook/ocr.js` handler (`req.headers['x-webhook-secret']`,
env var `WEBHOOK_SECRET`); the new relay checks its own separate
`DISCORD_RELAY_TOKEN` env var the same way (`x-webhook-secret` header !==
`process.env.DISCORD_RELAY_TOKEN` → 401).

### Dashboard API surface

**Bot-facing** (new, `apps/dashboard/app/api/bot/working-projects/*`,
auth via existing `requireBotToken` / `BOT_API_TOKEN` pattern — same as
`app/api/bot/invoice/route.ts`):

| Endpoint | Called by (in `ai-assistant`) | Behavior |
|---|---|---|
| `POST /api/bot/working-projects` | slash `/order-baru`, `/order-dari-shopee`, `/order-dari-tokopedia`, and the "🗂️ Buat Order" context menu (via `handleOrderModal`, customId `catalog_order_modal` → forum type resolves to `general`, same as today) | Body `{source, sourceOrderNo?, forumType, ...manualFields}`. For shopee/tokopedia, dashboard fetches full detail itself (`getOrderDetail`/`getOrderById`, no more HTTP round-trip). Builds title + post content, calls the `ai-assistant` Discord relay to create the thread, persists `WorkingProject` with `discordThreadId` + `forumChannelId`. Returns `{threadUrl}`. |
| `GET /api/bot/working-projects/by-thread/:threadId` | every thread-scoped handler below, as a pre-check | 404 if the thread isn't a known Working Project (handler replies "order tidak ditemukan"). Returns the full project incl. `status`, `checklist`, `mentions`. |
| `PATCH /api/bot/working-projects/:threadId/status` | `/order-status` | Body `{status, starterMessageContent?}` — `starterMessageContent` is the starter message text the handler already has from the interaction's thread object (no extra relay round-trip needed). Sets `status`; if `notes` is empty and `starterMessageContent` doesn't start with `📋 **Detail Order**`, stores it as `notes` (port of the old `maybeExtractNotes` — imports notes from threads a human started). Relay: rename thread (status/due suffix in title) + edit starter message. Does **not** touch `appliedTags` (status lives in the title, not tags — matches original behavior). Returns `{oldStatus, status}`. |
| `POST /api/bot/working-projects/:threadId/done` | `/order-selesai` | Sets status to `Done`. Relay: rename thread, then **archive** it (`setArchived(true)` — see relay table below). Returns `{ok: true}`. |
| `PATCH /api/bot/working-projects/:threadId` | `/order-update` | Body: subset of `{dueDate, payment, invoiceAmount, paidAmount, notesAppend, variant, customer, product, shipping, trackingNo}`. Amount parsing (`Rp`/`.`/`,`/`k`/`jt` suffixes) happens **server-side** so the web UI's edit form can share the same logic — the handler passes the raw string through. `notesAppend` appends (not replaces) with an Asia/Jakarta `[d Mon, HH.MM]` timestamp prefix. Recomputes `title` if `customer`/`product` changed. An empty string for `variant`/`shipping`/`trackingNo` is a valid "clear" write; only `undefined` fields are left alone. Relay: rename thread only if `variant`/`customer`/`product` changed, always edit starter message. Returns 400 on an unparseable `dueDate` (the handler `editReply`s the error — the original's bug of replying after `deferReply`, which throws, is intentionally not ported). |
| `PATCH /api/bot/working-projects/:threadId/mentions` | `/mention-set` | Body `{mentions: string[]}` (Discord user IDs, already extracted by the handler from `<@id>` mentions). Empty array resets to `defaultMentions` from settings. Returns `{mentions}`. No relay call — matches original (mentions only show up in the starter message on its next edit). |
| `POST /api/bot/working-projects/:threadId/checklist` | `/order-checklist add\|check\|uncheck\|edit\|remove\|copy` | Body `{op, text?, ids?, id?, fromThreadId?, actor}` (`actor` = Discord display name, for `added_by`/`done_by`). The server owns id allocation (`max(id)+1` over all items including soft-deleted ones — never the handler), soft-delete (`deleted:true`, never a real removal), and `copy`'s renumbering (1..n, `done` reset, `added_by` set to the copier). Every write is normalized to the canonical item shape (see §Data model). Relay: edit starter message only. Returns `{items, affectedIds}` (and for `copy`, `{sourceLabel, count}`); 404 on unknown ids → handler replies "item tidak ditemukan". |
| `GET /api/bot/working-projects/checklist-sources?q=` | `/order-checklist copy` autocomplete | Projects with ≥1 non-deleted checklist item (done or not), `customer product` containing `q`, max 25, label `"customer — product"`. Returns `[{threadId, label}]`. |
| `GET /api/bot/working-projects/settings` | `/reminder-config` (no args) | `{reminderDays: number[], defaultMentions: string[]}`. |
| `PATCH /api/bot/working-projects/settings` | `/reminder-config days:/mentions:` | Body: subset of `{reminderDays: number[], defaultMentions: string[]}` (each handler does its own input parsing — `/mention-set` extracts `<@id>`, `/reminder-config` takes bare comma-separated IDs; the endpoint itself only accepts already-parsed `string[]`/`number[]`). 400 if `reminderDays` is empty after filtering to positive integers. |
| `PATCH /api/bot/working-projects/:threadId/tags` | `threadUpdate` gateway listener | Syncs `appliedTags` changed manually in Discord back into the DB. Must be idempotent — a web-triggered `setAppliedTags` fires `threadUpdate` right back, which must no-op when the tags already match. |
| `GET /api/bot/working-projects/due-reminders` | hourly cron | Returns `[{threadId, customer, product, dueDate, daysLeft, mentions: string[], pendingDays: number[]}]` where `pendingDays` = configured `reminderDays` that match `daysLeft` and aren't already in `remindersSent`. The cron no longer needs to read settings itself — the dashboard resolves `reminderDays` server-side. |
| `POST /api/bot/working-projects/:threadId/reminder-sent` | hourly cron, after `thread.send()` succeeds | Appends the fired day(s) to `remindersSent`. |

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
   `discordThreadId`. Specific column rules:
   - `checklist_msg_id` is **dropped** — dead schema, zero readers/writers
     anywhere in the fetched codebase (confirmed by grep across every
     order-related file); do not migrate it.
   - `due_date`/`order_date`: `''` → `null`; a value matching
     `^\d{4}-\d{2}-\d{2}$` → parsed as `DateTime` at Asia/Jakarta midnight;
     anything else (free text like "akhir bulan", entered through the old
     web UI which never validated this field) → `dueDate: null` +
     preserved verbatim in `dueDateRaw` (order_date has no raw-preserving
     field since nothing in the UI displays a fallback for it — just null
     it out).
   - `checklist` items: normalize every item to the canonical shape —
     assign a fresh sequential `id` to any item missing one (this is
     exactly the Green Lantern Ring bug's fallout: those items were
     written as `{text,done}` with no `id`), coerce `done`/`deleted` to
     booleans, default missing `added_by`/`added_at` to `"migration"` /
     the migration timestamp.
3. Before running the script, count rows where `due_date` or `order_date`
   is non-empty and doesn't match `^\d{4}-\d{2}-\d{2}$`, and report the
   count — this tells the user how many `dueDateRaw` records to expect
   and surfaces any migration surprise before it's live.
4. Before cutover: spot-check whether any live thread's starter message
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
2. Rewrite every order-related handler into a thin dashboard-API client:
   `order-baru.js` (including `handleOrderModal`, which also serves the
   "🗂️ Buat Order" context menu's `catalog_order_modal`),
   `order-dari-shopee.js`, `tokopedia-order.js`, `order-status.js`,
   `order-selesai.js`, `order-update.js`, `order-checklist.js` (all 6
   subcommands + its autocomplete), `mention-set.js`, `reminder-config.js`.
   All reuse the already-present `BOT_API_URL`/`BOT_API_TOKEN`.
   `catalog-wa.js` itself is **not edited** — its Buat-Order half only
   builds and shows the modal (no DB/Discord write of its own), and its
   WA-broadcast half is unrelated to orders.
3. `thread-update-handler.js`: replace the local SQLite update with a
   `PATCH` to `/api/bot/working-projects/:threadId/tags`.
4. `index.js`'s hourly reminder cron: replace `getAllOrders()` (local
   SQLite) with `GET /api/bot/working-projects/due-reminders`; after
   `thread.send()`, call `POST .../reminder-sent`. The cron no longer
   needs `getReminderDays()` — that setting now lives server-side.
5. Port two pieces of pure logic into
   `apps/dashboard/lib/working-projects/format.ts` rather than
   reimplementing them: `parseAmount` (the `Rp`/`.`/`,`/`k`/`jt` parser
   from `order-update.js`) and the notes-append timestamp format
   (`[d Mon, HH.MM]`, Asia/Jakarta). The original's bug of calling
   `interaction.reply` after `deferReply` on an invalid due date (which
   throws) is intentionally not ported — the dashboard returns 400 and
   the handler `editReply`s a clean error instead.
6. After cutover is verified working end-to-end: remove/disable the old
   `orders/router.js` mount, the old `public/*.html` files, `db/orders.js`,
   and `orders/status-tags.js`'s `maybeExtractNotes`/`syncStatusTag`
   (unused once every handler is thin) — the web UI is now served
   entirely from the dashboard.
7. `pm2 restart` after each step; verify one slash command manually
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
  export shaped like the real SQLite dump, including rows with `''`,
  valid-ISO, and free-text (non-parseable) `due_date`/`order_date`
  values, and a checklist item missing `id` (the Green Lantern Ring bug
  case) to confirm normalization assigns one correctly.
- Checklist normalization, `parseAmount`, and the notes-append timestamp
  format get their own unit tests in `lib/working-projects/format.ts`'s
  test file — these are the pieces most likely to silently diverge from
  the original's behavior since they're small parsing/formatting
  functions easy to get subtly wrong.
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
  lineart, wa-setting, etc.) — untouched. Within `catalog-wa.js`
  specifically: the `📱 Kirim WA Status` context menu (WA Omni broadcast,
  touches no order data) is untouched; the `🗂️ Buat Order` menu IS
  covered by this merge, via the shared `handleOrderModal` path (see
  §Dashboard API surface / §`ai-assistant`-side changes step 2) — it's
  not separately implemented, it rides along once `order-baru.js`'s
  modal handler is rewritten.
- A ring-sizing calculator tool — does not exist in the analyzed code;
  nothing was excluded here on that basis (see Problem section).
