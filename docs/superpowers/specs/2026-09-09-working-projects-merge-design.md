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

Source snapshot verified identical (md5) against the live `/app/src` host
on 2026-09-09. One discrepancy noted for completeness: `public/index.html`
calls `/orders/api/tokopedia-session` in three places, but that route
doesn't exist anywhere in the live code either — it's dead UI code from
before the route was removed or renamed (the HTML file predates the
router file by about six weeks), silently 404ing today. Not migrated;
doesn't affect any other claim in this spec.

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

**Transport and reachability**: the dashboard is reachable from the
public internet (`dashboard.3dprintingbandung.my.id`); the relay call
crosses the homelab LAN to `192.168.88.92:3000` in plaintext HTTP, the
same path the existing OCR integration already uses. Because the
dashboard side is internet-facing, the relay additionally checks the
caller's source IP against an allowlist (`ALLOWED_RELAY_IPS`, just the
homelab Docker host's IP — cheap, `req.socket.remoteAddress`, no TLS
needed) on top of the shared-secret header, so a leaked
`DISCORD_RELAY_TOKEN` alone isn't sufficient from outside the LAN.

**Blast radius of reusing `BOT_API_TOKEN`**: this token previously only
authorized read-only order lookups; it now also authorizes creating and
updating Working Projects (which in turn can create/rename/archive/delete
Discord threads via the relay it triggers). Since the calling side
(`ai-assistant`) already validates and shapes the interaction before this
token is ever used, and the relay itself is separately gated by both the
forum-channel allowlist (§Discord relay) and its own token, this is an
accepted increase in scope rather than something requiring a third token
— but it's worth stating plainly rather than treating the reuse as a free
simplification.

### Data model

New Prisma model in `apps/dashboard/prisma/schema.prisma`:

```prisma
model WorkingProject {
  id               String   @id @default(cuid())
  discordThreadId  String?  @unique
  forumChannelId   String?  // which forum this thread lives in — fixes a
                             // latent bug in the old code (see "Fixed
                             // issues" below). SQLite has no equivalent
                             // column, so every migrated row starts null
                             // and is backfilled from Discord directly
                             // (see §Data migration); a row that fails
                             // backfill stays null and keeps the old
                             // buggy tag-resolution until its next
                             // threadUpdate self-heals it.
  source           String   // "shopee" | "tokopedia" | "manual"
  sourceOrderNo    String?  // Real marketplace order ID (Shopee orderSn /
                             // Tokopedia order_id) — ONLY set when it came
                             // from a marketplace API call, never from a
                             // human-typed field. Used to live-fetch full
                             // marketplace detail on demand (see UI
                             // section) — never stored as a snapshot.
  orderNoLegacy    String?  // Free-text "No. Order" as typed into the old
                             // `/order-baru` modal or web form — NOT a
                             // marketplace ID, never used for a live
                             // lookup. Kept only for display. New manual
                             // creates from the dashboard populate this
                             // the same way; sourceOrderNo stays null for
                             // manual orders.
  syncState        String   @default("ok") // "ok" | "pending" | "error" —
                             // see §Architecture › Failure ordering
  syncError        String?
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

### Failure ordering & reconciliation

Unlike an escrow-payment sync where a stale cache is invisible until
someone looks, a Working Project whose Discord thread has drifted from
its database record is immediately visible to the team. This needs an
explicit story, not just "don't corrupt the DB record":

- **Create**: write the `WorkingProject` row first, without
  `discordThreadId`, `syncState: "pending"`. Call the relay's
  `POST /discord-relay/thread` with an `Idempotency-Key: <project.id>`
  header — the relay keeps a small map (`/app/data/relay-idempotency.json`)
  from that key to the thread it already created, so a retried request
  (e.g. after a timeout where the first attempt actually succeeded)
  returns the existing thread instead of creating a duplicate. On success,
  update the row with `discordThreadId`, `syncState: "ok"`. On failure,
  leave `syncState: "pending"` with the error in `syncError` — the
  handler's reply reflects this ("✅ tersimpan, ⚠️ Discord belum sinkron")
  rather than silently claiming success.
- **Update**: write to Postgres first, then call the relay. If the relay
  call fails, set `syncState: "error"` + `syncError`, but still return
  200 to the caller with `{discordSynced: false}` — the data change is
  real and shouldn't be rolled back or hidden just because Discord is
  temporarily unreachable.
- **Reconciliation**: no cron-based reconciler (unnecessary at this
  scale) — instead, a manual `POST /api/working-projects/:id/resync`
  endpoint and a "🔄 Resync Discord" button in the UI for any row with
  `syncState != "ok"`. Resync re-derives `name`, `appliedTags`, and
  `starterContent` entirely from the current DB row and sends one
  `PATCH /discord-relay/thread/:id` — the DB is always the source of
  truth being replayed outward, never the other way around.

### Discord relay (`ai-assistant` side, new file `orders/discord-relay.js`)

Wraps existing `discord.js` calls (all confirmed REST-only by reading
`router.js`/`order-baru.js`/`status-tags.js` — none need gateway state):

| Endpoint | Wraps |
|---|---|
| `GET /discord-relay/channel/:id/tags` | `channel.availableTags` |
| `GET /discord-relay/thread/:id` | `client.channels.fetch(id)` → `{parentId, name, appliedTags, archived, ownerId}`. 404 if the thread no longer exists. Used for the `forumChannelId` migration backfill (below) and for spot-checking human-started threads (§Data migration). |
| `POST /discord-relay/thread` | `forum.threads.create({name, message})` → `{threadId, threadUrl}`. Accepts `Idempotency-Key` header (see §Failure ordering). |
| `PATCH /discord-relay/thread/:id` | Body independently selects `{name?, appliedTags?, starterContent?}` — wraps `setName` / `setAppliedTags` / edit-starter-message, any subset in one call (status changes rename+edit; mentions changes call nothing; checklist changes edit-only). Auto-unarchives first if the thread is archived and any field besides `archived` is being changed (Discord rejects edits on an archived thread otherwise) — does not re-archive afterward. |
| `POST /discord-relay/thread/:id/archive` | `thread.setArchived(true)` — needed by `/order-selesai` |
| `DELETE /discord-relay/thread/:id` | `thread.delete()` |

**Mention hardening**: `buildPostContent` interpolates `customer`,
`contact`, `product`, `variant`, `shipping`, `trackingNo`, `notes`, and
checklist text raw into message content. In the original, that content
was always typed by trusted staff into a Discord modal. After this merge
it can also come from marketplace data (Shopee/Tokopedia customer names
and product titles) or the new dashboard web form — a product title
containing `@everyone`, `@here`, or a role mention would ping the whole
guild, and would re-fire on every starter-message re-edit. Every
`threads.create({message})` and starter-message edit call in the relay
sets `allowedMentions: {parse: [], users: mentions}`, where `mentions` is
the explicit array of Discord user IDs from the request body — never
parsed out of the message content itself. Per user decision, only
mentions are neutralized this way; markdown formatting characters
(`**bold**`, `_italic_`, etc.) in free-text fields are left as-is, since
`notes` in particular sometimes carries formatting staff typed on
purpose, and this doesn't create a new forum thread or otherwise change
what already exists — it's the same starter-message-edit mechanism the
original used, just with mention parsing turned off.

All of `POST /thread`, `PATCH /thread/:id`, `DELETE /thread/:id` restrict
their target to an allowlisted set of forum channel IDs
(`[ORDERS_FORUM_CHANNEL_ID, FORUM_TOPENG_ID, FORUM_CINCIN_ID,
FORUM_CLICKER_ID]`, the same set `thread-update-handler.js` already uses
as `ORDER_FORUM_IDS`) — reject with 403 otherwise. See §Ownership split ›
blast radius for why.

No "post/edit message by id" endpoint is needed: `checklist_msg_id`
(a column that exists in the old SQLite schema) has zero readers or
writers anywhere in the codebase — `/order-checklist` only edits the
starter message, same as every other update path. Treat it as dead
schema (see §Data migration).

**Discord API constraints** the relay must respect (none of these were
addressed by the original code, since it made these calls one at a time
inline rather than through a shared layer):
- **Rename rate limit**: Discord allows roughly 2 name edits per 10
  minutes per channel — and this design *increases* rename frequency
  relative to the original (web UI edits, `/order-status`,
  `/order-update`, and `threadUpdate` can all trigger one). Mitigation:
  `PATCH /thread/:id` always fetches the current name first (already
  needed for the archived-thread check) and only sends `name` in the
  Discord API call if it actually differs; `discord-sync.ts` on the
  dashboard side batches all changed fields into one `PATCH` call rather
  than issuing separate rename/tag/edit requests. On a 429 that
  discord.js's own built-in queueing doesn't absorb, the relay returns
  503 + `retryAfter`; the dashboard marks `syncState: "error"` (see
  §Failure ordering) rather than retrying synchronously.
- **Archived threads**: `/order-selesai` archives a thread. Any later
  edit (e.g. reopening for a correction) needs the relay's
  `PATCH /thread/:id` to auto-unarchive first, as already specified in
  the endpoint table above.
- **Title length**: the 100-character cap is already enforced by
  `buildThreadTitle`'s `.slice(0, 100)` — port this as-is, with a unit
  test.
- **Tag count**: Discord allows at most 5 applied tags per thread; the
  tags endpoint rejects a request with more than 5 with a 400.
- **Message length**: the starter message has a 2000-character cap.
  `buildPostContent`'s port must truncate the checklist render (the most
  elastic part of the message) with a `… (+N item)` suffix when needed —
  a latent bug in the original that likely never triggered at current
  data volume, but should be handled now that it's being rewritten
  anyway.

Auth: `X-Webhook-Secret: <DISCORD_RELAY_TOKEN>` header — confirmed against
the actual `webhook/ocr.js` handler (`req.headers['x-webhook-secret']`,
env var `WEBHOOK_SECRET`); the new relay checks its own separate
`DISCORD_RELAY_TOKEN` env var the same way, but **fails closed**: if
`DISCORD_RELAY_TOKEN` is unset, `index.js` refuses to mount the relay
router at all and logs an error at startup, rather than the old
`router.js` pattern of `if (!token) return next()` (fail open) — which is
in fact the live bug behind the "web UI had no auth in production" note
in §Fixed issues. The comparison itself uses `crypto.timingSafeEqual` on
equal-length buffers, matching this repo's own `lib/bot/auth.ts` pattern
(stronger than `webhook/ocr.js`'s plain `!==`, which is not copied here).

### Dashboard API surface

**Bot-facing** (new, `apps/dashboard/app/api/bot/working-projects/*`,
auth via existing `requireBotToken` / `BOT_API_TOKEN` pattern — same as
`app/api/bot/invoice/route.ts`):

| Endpoint | Called by (in `ai-assistant`) | Behavior |
|---|---|---|
| `POST /api/bot/working-projects` | slash `/order-baru`, `/order-dari-shopee`, `/order-dari-tokopedia`, and the "🗂️ Buat Order" context menu (via `handleOrderModal`, customId `catalog_order_modal` → forum type resolves to `general`, same as today) | Body `{source, sourceOrderNo?, orderNoLegacy?, forumType, ...manualFields}`. `/order-baru`'s modal parsing (`parsePlatformOrder`, pure Discord-interaction parsing, stays in the thin handler) sends `{source:"manual", platform, orderNoLegacy}` — it never has a real marketplace ID. For shopee/tokopedia, dashboard fetches full detail itself (`getOrderDetail`/`getOrderById`, no more HTTP round-trip) and sets `sourceOrderNo` to the real ID. Builds title + post content (escaped — see §Discord relay › Mention & markdown hardening), calls the `ai-assistant` Discord relay to create the thread (with an `Idempotency-Key`, see §Failure ordering), persists `WorkingProject` with `discordThreadId` + `forumChannelId`. Returns `{threadUrl, threadId}`. |
| `GET /api/bot/working-projects/by-thread/:threadId` | debugging / `/order-checklist copy`'s autocomplete labels (optional, not a required pre-check) | 404 if the thread isn't a known Working Project. Returns the full project incl. `status`, `checklist`, `mentions`. Thread-scoped action endpoints below do **not** call this first — each one does its own lookup and returns 404 `{error:"not_working_project"}` directly, which the handler maps to "⚠️ Thread ini tidak terdaftar sebagai order". This keeps every handler to exactly one `fetch` per interaction (the `/order-checklist copy` autocomplete is a separate interaction from its execution, so that command is the one stated exception at two fetches total, not one). |
| `PATCH /api/bot/working-projects/:threadId/status` | `/order-status` | Body `{status, starterMessageContent?}` — `starterMessageContent` is the starter message text the handler already has from the interaction's thread object (no extra relay round-trip needed). Sets `status`; if `notes` is empty and `starterMessageContent` doesn't start with `📋 **Detail Order**`, stores it as `notes` (port of the old `maybeExtractNotes` — imports notes from threads a human started). Relay: rename thread (status/due suffix in title) + edit starter message. Does **not** touch `appliedTags` (status lives in the title, not tags — matches original behavior). Returns `{oldStatus, status}`. |
| `POST /api/bot/working-projects/:threadId/done` | `/order-selesai` | Sets status to `Done`. Relay: rename thread, then **archive** it (`setArchived(true)` — see relay table below). Returns `{ok: true}`. |
| `PATCH /api/bot/working-projects/:threadId` | `/order-update` | Body: subset of `{dueDate, payment, invoiceAmount, paidAmount, notesAppend, variant, customer, product, shipping, trackingNo}`. Amount parsing (`Rp`/`.`/`,`/`k`/`jt` suffixes) happens **server-side** so the web UI's edit form can share the same logic — the handler passes the raw string through. `notesAppend` appends (not replaces) with an Asia/Jakarta `[d Mon, HH.MM]` timestamp prefix. Recomputes `title` if `customer`/`product` changed. An empty string for `variant`/`shipping`/`trackingNo` is a valid "clear" write; only `undefined` fields are left alone. Relay: rename thread only if `variant`/`customer`/`product` changed, always edit starter message. Returns 400 on an unparseable `dueDate` (the handler `editReply`s the error — the original's bug of replying after `deferReply`, which throws, is intentionally not ported). |
| `PATCH /api/bot/working-projects/:threadId/mentions` | `/mention-set` | Body `{mentions: string[]}` (Discord user IDs, already extracted by the handler from `<@id>` mentions). Empty array resets to `defaultMentions` from settings. Returns `{mentions}`. No relay call — matches original (mentions only show up in the starter message on its next edit). |
| `POST /api/bot/working-projects/:threadId/checklist` | `/order-checklist add\|check\|uncheck\|edit\|remove\|copy` | Body `{op, text?, ids?, id?, fromThreadId?, actor}` (`actor` = Discord display name, for `added_by`/`done_by`). The server owns id allocation (`max(id)+1` over all items including soft-deleted ones — never the handler), soft-delete (`deleted:true`, never a real removal), and `copy`'s renumbering (1..n, `done` reset, `added_by` set to the copier). Every write is normalized to the canonical item shape (see §Data model). Relay: edit starter message only. Returns `{items, affectedIds}` (and for `copy`, `{sourceLabel, count}`); 404 on unknown ids → handler replies "item tidak ditemukan". |
| `GET /api/bot/working-projects/checklist-sources?q=` | `/order-checklist copy` autocomplete | Projects with ≥1 non-deleted checklist item (done or not), `customer product` containing `q`, max 25, label `"customer — product"`. Returns `[{threadId, label}]`. |
| `GET /api/bot/working-projects/settings` | `/reminder-config` (no args) | `{reminderDays: number[], defaultMentions: string[]}`. |
| `PATCH /api/bot/working-projects/settings` | `/reminder-config days:/mentions:` | Body: subset of `{reminderDays: number[], defaultMentions: string[]}` (each handler does its own input parsing — `/mention-set` extracts `<@id>`, `/reminder-config` takes bare comma-separated IDs; the endpoint itself only accepts already-parsed `string[]`/`number[]`). 400 if `reminderDays` is empty after filtering to positive integers. |
| `PATCH /api/bot/working-projects/:threadId/tags` | `threadUpdate` gateway listener | Body `{appliedTags: string[], parentId: string, currentName: string}`. Saves `appliedTags` (and backfills `forumChannelId` from `parentId` if it was null). Fetches the correct forum's `availableTags` (via relay, using `forumChannelId`) and recomputes `newName = buildThreadTitle(status, title, appliedTags, availableTags, dueDate, variant)` — this ports the original's behavior of rebuilding the thread title when a person-tag changes (the original's `thread-update-handler.js` does this; an earlier draft of this spec dropped it). If `newName !== currentName`, calls the relay to rename. Returns `{renamed: boolean, name}`. Also no-ops server-side if the incoming `appliedTags` already equals what's stored (defense in depth) — but the primary loop guard stays on the `ai-assistant` side, see below. |
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
  action. "No. Order" displays `sourceOrderNo ?? orderNoLegacy ?? '-'`.
  Clicking a row with a non-null `sourceOrderNo` shows a "Lihat Data
  Marketplace" action that live-fetches via
  `GET /api/working-projects/:id/detail-source`; rows with only
  `orderNoLegacy` (or neither) don't get that action, since there's no
  real marketplace ID to look up.
- **`tab=green-lantern-ring`** — full parity with the original page, which
  is considerably more than a simple product filter:
  - **One row per ring variant, not per project**: `product` is split on
    commas; each part matching `isGLRing()` becomes its own row. When a
    project has multiple ring variants, `variantShort()` (Cosplay / 2026 /
    raw) becomes a `key` distinguishing them.
  - **Size**: `notes` is split on `|`; the segment matching the row's
    `key` (or the whole `notes` string for a single-variant project) is
    parsed by `parseSize()` for a US ring size, then looked up in the
    ported `SIZE_SCALE` table (US size → scale percentage) — both
    ported verbatim into `lib/working-projects/format.ts` with unit
    tests.
  - **Checklist**: 7 items per `key`, canonical labels
    `"<key> — Print Frame"` / `"… Print Stone"` / `"… Print Ring"` /
    `"… Cat Frame"` / `"… Cat Stone"` / `"… Cat Ring"` / `"… Assembly"`
    (no `key` prefix for a single-variant project). **Reads** match by
    case-insensitive substring (`includes()`), same as the original, to
    stay compatible with inconsistently-labeled legacy data. **Writes**
    go through a dedicated checklist op,
    `POST .../checklist {op:"setByLabel", label, done, actor}`, which
    matches an existing non-deleted item by case-insensitive exact label
    match or creates a new one with a server-allocated `id` — this closes
    the original's bug where the GL view wrote `{text,done}` with no
    `id`, corrupting later id allocation.
  - **Filters and sort**: search (order no / customer), platform,
    variant, size, production step, and step-status filters; up to
    3-column shift-click multi-sort (due date / order date / order no /
    platform / variant / US size / status); summary stat pills (active
    count, missing-size count, fully-done count). `Canceled` rows are
    excluded, same as the original.
  - Columns: Due Date, Order Date, No Order, Platform, Variant, Ukuran,
    Scale, then the 7 checklist checkboxes, Progress, Status, Discord
    link — matching the original's 17-ish columns.
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
  correct forum — **for rows that have it backfilled** (see §Data
  migration). A row with `forumChannelId: null` falls back to
  `ORDERS_FORUM_CHANNEL_ID` (the old buggy behavior) until its next
  `threadUpdate` event supplies the real `parentId` and self-heals it.
- **Web UI had no auth in production**: `router.js`'s `requireAuth` fails
  *open* (`if (!token) return next()`), and the live host's `.env` never
  set `ORDERS_WEB_TOKEN` — the old web UI has been running with zero
  authentication. This is fixed automatically by the merge (the new UI is
  behind this dashboard's NextAuth session), not a separate task, but
  worth naming since it's a real pre-existing gap being closed.
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

Export is via `scripts/export-orders.mjs` (standalone, read-only `sql.js`
— see cutover step 4 above; `sqlite3` CLI isn't installed on the host).

New script `apps/dashboard/scripts/migrate-working-projects.ts` (same
pattern as `scripts/seed-cyd-field-presets.ts`): parses the JSON-string
columns (`checklist`, `mentions`, `applied_tags`, `reminders_sent`), maps
to `WorkingProject`, `upsert`s by `discordThreadId`. Column rules:

- **`source`/`sourceOrderNo`/`orderNoLegacy` derivation**: `platform`
  matching `/shopee/i` **and** `order_no` matching an orderSn shape
  (`/^\d{12,}[A-Z0-9]*$/`) → `source:"shopee"`, `sourceOrderNo:order_no`;
  `platform` matching `/tokopedia/i` and `order_no` numeric →
  `source:"tokopedia"`, `sourceOrderNo:order_no`; anything else →
  `source:"manual"`, `sourceOrderNo:null`, `orderNoLegacy:order_no`. This
  works because the old `order-dari-shopee`/`tokopedia-order` handlers
  already wrote the real marketplace ID into `order_no` — only
  `/order-baru`'s free-text entry ends up as `manual`. Report the
  resulting `source` distribution and list any `platform`-shopee/tokopedia
  row that fails its regex (candidates for manual correction) before
  proceeding.
- `checklist_msg_id` is **dropped** — dead schema, zero readers/writers
  anywhere in the fetched codebase (confirmed by grep across every
  order-related file); do not migrate it.
- `due_date`/`order_date`: `''` → `null`; a value matching
  `^\d{4}-\d{2}-\d{2}$` → parsed as `DateTime` at Asia/Jakarta midnight;
  anything else (free text like "akhir bulan", entered through the old
  web UI which never validated this field) → `dueDate: null` + preserved
  verbatim in `dueDateRaw` (`order_date` has no raw-preserving field since
  nothing in the UI displays a fallback for it — just null it out).
  Before running the script, count rows where `due_date`/`order_date` is
  non-empty and doesn't match the ISO pattern, and report the count.
- `checklist` items: normalize every item to the canonical shape — assign
  a fresh sequential `id` to any item missing one (this is exactly the
  Green Lantern Ring bug's fallout: those items were written as
  `{text,done}` with no `id`), coerce `done`/`deleted` to booleans,
  default missing `added_by`/`added_at` to `"migration"` / the migration
  timestamp.
- **`forumChannelId` backfill**: after the upsert pass, for each row with
  a `discordThreadId`, call the relay's `GET /discord-relay/thread/:id`
  (serially, ~250ms apart — this is hundreds of threads, not thousands)
  and set `forumChannelId = parentId`, refresh `appliedTags` to the live
  value (the SQLite copy may be stale), and record whether
  `ownerId !== <bot's own user id>` (closes the "spot-check human-started
  threads" concern below — it's now automatic). A relay failure or 404
  leaves `forumChannelId: null` for that row and appends it to a
  `backfill-failed.json` report; that row keeps the old buggy tag
  resolution until a subsequent `threadUpdate` supplies `parentId` and
  self-heals it. Idempotent: a row with `forumChannelId` already set is
  skipped unless `--force`.
- Any live thread whose starter message was posted by a human
  (`ownerId !== bot`, from the backfill pass above) can never have its
  post-content auto-edited by any bot, before or after this migration —
  a pre-existing limitation, not a regression, but worth surfacing in the
  backfill report rather than being discovered later by surprise.

### `ai-assistant`-side changes (separate repo, production host,
via SSH — no staging environment exists there)

Executed as part of this same effort (per explicit user decision). This
is a single Express process (`index.js`) also serving unrelated commands
(research, tanya, lineart, wa-setting) and the OCR webhook the dashboard
already depends on — a naive file-by-file rewrite-and-restart sequence
crashes the *entire* process (see rationale below), so cutover is
redesigned as one atomic switchover instead.

**Import-graph hazard driving this redesign**: `router.js`,
`order-status.js`, `order-update.js`, and `order-checklist.js` all
statically `import { buildPostContent } from '../bot/handlers/commands/order-baru.js'`.
Rewriting `order-baru.js` (removing that export) while `router.js` is
still mounted, then `pm2 restart`-ing, is an ESM module-load failure —
the process won't even boot. Every file in this import graph must be
deployed together, in one commit, with one restart.

**Baseline**: the live `/app/src` git repo currently has only its
original 2026-07-21 commit; every file this merge touches shows as
uncommitted (`M`). Before anything else, commit that live working state
as a snapshot and tag it, so "revert" has something concrete to revert
to:
```
cd /app/src && git add <the specific M files listed by git status> && \
  git commit -m "chore: snapshot before working-projects merge" && \
  git tag pre-wp-merge
```
(Repo convention applies here too: `git add` specific paths, not `-A`.)

**Cutover sequence:**

1. **Pre-cutover (no downtime, can happen days ahead)**: deploy the
   dashboard side fully (model, bot-facing endpoints, web UI) and verify
   it with mocked/unit tests only — nothing in `ai-assistant` changes
   yet. Then, as a separate small additive change: add
   `orders/discord-relay.js`, mount it in `index.js`, add
   `DISCORD_RELAY_TOKEN` to `/app/.env` (the real env file is at
   `/app/.env`, not `/app/src/.env`), `pm2 restart`. This is purely
   additive — no existing handler is touched — so it can't break
   anything else. Verify the relay works with a manual
   `GET /discord-relay/channel/:id/tags` call from the dashboard side.
2. **Freeze**: stop new writes to the old SQLite-backed system before
   touching anything else. Mechanism: set `ORDERS_FREEZE=1` in
   `/app/.env`; `router.js` and every order handler check this flag first
   and reply "⏸️ Order tracker sedang migrasi, coba lagi dalam beberapa
   menit" instead of proceeding. This ~10-line check is written and
   committed as part of the pre-cutover step (1), so it's already in
   place before the freeze is flipped on — flipping the flag needs only
   an env change + restart, not a code deploy. (Rejected alternative:
   `pm2 stop` the whole bot — that also kills the OCR webhook and
   unrelated commands, which don't need to go down for this.)
3. **Backup**: `cp -p /app/data/orders.db /app/data/backup/orders-$(date +%Y%m%dT%H%M%S).db`,
   `chmod 444` it, record its `sha256sum` in the runbook. This must happen
   *before* any migration step, because `db/orders.js`'s `initDb()` calls
   `_save()` on startup — simply starting the old code again (e.g. during
   a later rollback) overwrites `orders.db`, destroying the very file the
   migration read from if no backup exists.
4. **Export**: `sqlite3` isn't installed on the host, so export via a
   small standalone Node script (`scripts/export-orders.mjs`, uses
   `sql.js` directly against the file in **read-only** mode — it must
   never call `db.export()`/write, since that's what corrupts state on
   every old-code write) → JSON.
5. **Import + backfill**: run `migrate-working-projects.ts` (§Data
   migration) against that export, including the `forumChannelId`
   backfill pass.
6. **Deploy all rewritten handlers in one commit, one restart**: every
   file in the `buildPostContent` import graph plus every other
   order-related handler — `order-baru.js` (incl. `handleOrderModal`,
   also serving "🗂️ Buat Order"), `order-dari-shopee.js`,
   `tokopedia-order.js`, `order-status.js`, `order-selesai.js`,
   `order-update.js`, `order-checklist.js` (+ autocomplete),
   `mention-set.js`, `reminder-config.js`, `thread-update-handler.js`
   (keeps its existing loop guard — comparing `oldThread.appliedTags` vs
   `newThread.appliedTags` from the live Discord event and early-returning
   when they match, which is what stops a bot-triggered rename from
   re-firing `threadUpdate` forever; only its *body* changes, from a
   local SQLite update to the `PATCH .../tags` call above),
   and the reminder cron in `index.js` — become thin dashboard-API
   clients in this single commit. Also in this commit: remove the
   `/orders` router mount, remove `db/orders.js`'s import from `index.js`,
   and change `publishCydOrders()` to publish an explicit
   `{orders: [], unavailable: true, reason: "migrated"}` payload instead
   of reading SQLite (per user: the CYD order publisher already isn't
   working today and hasn't been fixed — this just stops it from
   publishing stale-but-plausible-looking data once cutover starts;
   porting a real CYD reader is separate future work). `catalog-wa.js`
   itself is **not edited** — its Buat-Order half has no DB/Discord write
   of its own (it only shows the modal), and its WA-broadcast half is
   unrelated. Port `parseAmount` and the notes-append timestamp format
   (`[d Mon, HH.MM]`, Asia/Jakarta) into
   `apps/dashboard/lib/working-projects/format.ts` as part of this same
   commit, rather than reimplementing them ad hoc. The original's bug of
   calling `interaction.reply` after `deferReply` on an invalid due date
   (which throws) is intentionally not ported — the dashboard returns 400
   and the handler `editReply`s a clean error instead. One `pm2 restart`
   for this entire commit.
7. **Delta re-import**: re-run the (idempotent) migration script once
   more against a fresh SQLite export, to catch anything written between
   steps 4 and 6. Expected delta: zero, since writes were frozen in step
   2 — a non-zero delta here means the freeze leaked and needs
   investigating before proceeding.
8. **Verify**: exercise one of each — `/order-baru`, `/order-status`, a
   manual tag change in Discord, and one edit from the new dashboard web
   UI. Only then unset `ORDERS_FREEZE`.
9. **Post-cutover (+7 days, not part of the cutover window)**: once
   stable, remove the old `public/*.html` files, `db/orders.js`, and
   `orders/status-tags.js`'s now-unused `maybeExtractNotes`/
   `syncStatusTag` helpers.

**Expected downtime**: order-related commands/web UI are unavailable
during steps 2–8, roughly 15–30 minutes. Unrelated commands and the OCR
webhook are unaffected except for two short PM2 restarts (steps 1 and 6,
~10 seconds each).

**Rollback**: `git checkout pre-wp-merge` in `/app/src`, restore
`orders.db` from the step-3 backup, `pm2 restart`, unset
`ORDERS_FREEZE`. Accepted consequence: any Postgres writes made after
cutover are not reflected back in SQLite/Discord-bot state (the
underlying Discord threads still exist and are untouched — only the
bot's own bookkeeping reverts). No reverse Postgres→SQLite export is
built; the Postgres data remains available for a manual re-migration
later if needed. This is deliberately the simpler of two options,
appropriate for the verification window in step 8 being short and the
data volume being workshop-scale.

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
- `orders/discord-relay.js` — this IS new, unit-testable code (unlike the
  gateway-dependent handlers, which stay manually verified against
  production since `vitest` there can't easily simulate a live Discord
  gateway session): forum-channel allowlist enforcement, fail-closed
  behavior when `DISCORD_RELAY_TOKEN` is unset, idempotency-key handling,
  auto-unarchive-before-edit, and `allowedMentions` being set on every
  message create/edit — all mockable against discord.js.
- `PATCH /api/bot/working-projects/:threadId/tags` — a test asserting
  that identical incoming `appliedTags` produces no relay call (the
  dashboard-side no-op, defense in depth alongside the `ai-assistant`
  loop guard).
- The thin `ai-assistant` handlers themselves (slash commands, modals,
  the reminder cron) are manually verified against production per the
  cutover runbook's step 8 — no staging environment exists to run an
  automated suite against.

## Out of scope / explicitly deferred

- Removing `ai-assistant` entirely — it keeps running for gateway-only
  duties (slash commands, `threadUpdate`, reminder cron) indefinitely;
  full decommissioning was not requested.
- A real CYD/MQTT reader against the new dashboard data — per user, the
  CYD order publisher isn't working today regardless of this merge, so
  cutover only makes sure it stops publishing stale-but-plausible SQLite
  data (see cutover step 6: `publishCydOrders()` is changed to publish an
  explicit `{orders: [], unavailable: true}` payload). Building a proper
  reader against `apps/dashboard`'s API is separate future work.
- Any change to `ai-assistant`'s other bot commands (research, tanya,
  lineart, wa-setting, etc.) — untouched. Within `catalog-wa.js`
  specifically: the `📱 Kirim WA Status` context menu (WA Omni broadcast,
  touches no order data) is untouched; the `🗂️ Buat Order` menu IS
  covered by this merge, via the shared `handleOrderModal` path (see
  §Dashboard API surface / §`ai-assistant`-side changes cutover step 6) —
  it's not separately implemented, it rides along once `order-baru.js`'s
  modal handler is rewritten.
- A ring-sizing calculator tool — does not exist in the analyzed code;
  nothing was excluded here on that basis (see Problem section).
