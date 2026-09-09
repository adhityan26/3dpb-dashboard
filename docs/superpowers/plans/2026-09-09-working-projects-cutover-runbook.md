# Working Projects Production Cutover Runbook (Plan B)

> **For agentic workers:** This is a manual, SSH-executed production runbook against a live host with no staging environment — NOT a TDD codebase plan. Do not dispatch `superpowers:subagent-driven-development` or `superpowers:executing-plans` against this file. Execute each step directly (or hand it to the user to execute), in order, confirming the "Verify" line of each step before proceeding to the next. Stop and escalate to the user immediately if any Verify check fails.

**Goal:** Cut `ai-assistant` (production host `192.168.88.92:3000`, PM2-managed, no containers) over from its own SQLite-backed Working Projects system to being a thin Discord relay + gateway-listener client of `apps/dashboard`, with zero data loss beyond the explicitly accepted rollback consequence (D1).

**Precondition:** Plan A (`docs/superpowers/plans/2026-09-09-working-projects-dashboard-plan.md`) is fully implemented, tested, and deployed to the dashboard's production environment (`dashboard.3dprintingbandung.my.id`) before Step 1 of this runbook begins — every step below assumes `POST/PATCH/GET /api/bot/working-projects/*` already works in production.

**Spec:** `docs/superpowers/specs/2026-09-09-working-projects-merge-design.md` (§`ai-assistant`-side changes, lines 544–668)

## Global Constraints

- Repo convention applies here too: `git add <specific path>`, never `git add -A`/`git add .`.
- The real env file on the host is `/app/.env`, NOT `/app/src/.env` — do not confuse the two.
- `sqlite3` CLI is not installed on the host — SQLite export must go through the Node/`sql.js` script in **read-only** mode; calling `db.export()`/writing corrupts `orders.db` because `db/orders.js`'s `initDb()` calls `_save()` on every process start.
- Every file in the `buildPostContent` static-import graph (`router.js`, `order-status.js`, `order-update.js`, `order-checklist.js`, `order-baru.js`) MUST be deployed in ONE commit with ONE `pm2 restart` — a partial deploy crashes the entire Express process (unrelated bot commands + the OCR webhook go down with it).
- Rollback policy (D1, accepted by user): `git checkout pre-wp-merge` + restore the Step 3 SQLite backup + `pm2 restart` + unset `ORDERS_FREEZE`. Any Postgres writes made after cutover are NOT reflected back into SQLite/Discord bookkeeping on rollback — accepted consequence, no reverse-export tooling is built.
- CYD publisher (D4, per user: already broken, unfixed) changes to publish `{orders: [], unavailable: true, reason: "migrated"}` — do NOT attempt to port a real CYD/MQTT reader as part of this cutover.
- Discord thread continuity (top-line non-negotiable requirement): no new forum threads are created for existing Working Projects during this cutover — `forumChannelId`/`discordThreadId` backfill only, existing threads are reused as-is.
- Mention hardening: every relay create/edit call sets `allowedMentions: {parse: [], users: mentions}` — escaping only, no new thread creation, no markdown escaping of message bodies (D3).
- Expected downtime: order-related commands/web UI unavailable during Steps 2–8 (~15–30 min). Unrelated bot commands + the OCR webhook are unaffected except for two ~10-second `pm2 restart`s (Steps 1 and 6).

---

## Step 0: Pre-flight checklist (run once, before touching the host)

- [ ] **0.1 — Confirm Plan A is live in dashboard production.**

Verify: `curl -s -o /dev/null -w '%{http_code}' https://dashboard.3dprintingbandung.my.id/api/bot/working-projects/checklist-sources -H "Authorization: Bearer $BOT_API_TOKEN"` returns `200` (not `404`).

- [ ] **0.2 — Confirm `DISCORD_RELAY_TOKEN` value is generated and recorded.**

Generate: `openssl rand -hex 32`. Record the value in the user's password manager (or wherever `BOT_API_TOKEN` is currently kept) — it will be set on the `ai-assistant` host in Step 1 and read by the dashboard's `DISCORD_RELAY_TOKEN` env var (added in Plan A Task 22).

Verify: the same token value is set in BOTH `apps/dashboard`'s production `.env` (`DISCORD_RELAY_TOKEN`) and will be set on the `ai-assistant` host's `/app/.env` (`DISCORD_RELAY_TOKEN`) in Step 1 — mismatched values fail closed (401), which is correct but must be caught here, not mid-cutover.

- [ ] **0.3 — Confirm `ALLOWED_RELAY_IPS` for the dashboard's outbound relay calls.**

The `orders/discord-relay.js` router (Task 5 of Plan A) does not itself IP-allowlist by source — that check belongs on the dashboard's outbound call path per the spec's "Blast radius" note (D2: dashboard is internet-reachable). Confirm the dashboard's `discord-sync.ts` calls originate from a known, stable egress IP if the `ai-assistant` host's firewall needs an allowlist rule; if the homelab LAN path is used directly (both hosts on the same network), skip this and rely on the shared-secret auth alone.

---

## Step 1: Pre-cutover additive relay deploy (no downtime)

- [ ] **1.1 — SSH to the host and locate the live repo state**

```bash
ssh root@192.168.88.92
cd /app/src
git status
```

Verify: `git status` shows the expected uncommitted `M` files (everything this merge touches) and the repo is on its single 2026-07-21 commit — no surprise state.

- [ ] **1.2 — Commit the live working state as a snapshot baseline (D6)**

```bash
cd /app/src
git add $(git status --porcelain | awk '{print $2}')
git commit -m "chore: snapshot before working-projects merge"
git tag pre-wp-merge
```

Verify: `git tag` lists `pre-wp-merge`; `git log --oneline -2` shows exactly two commits (2026-07-21 original + this new snapshot).

- [ ] **1.3 — Copy `orders/discord-relay.js` from the Plan A reference copy onto the host**

From your local machine (not the host):

```bash
scp apps/dashboard/docs/superpowers/ai-assistant-reference/orders/discord-relay.js \
  root@192.168.88.92:/app/src/orders/discord-relay.js
```

- [ ] **1.4 — Mount the relay router in `index.js`, additively (no existing handler touched)**

On the host, edit `/app/src/index.js` — add near the other route mounts:

```javascript
import { createDiscordRelayRouter } from './orders/discord-relay.js'
app.use('/discord-relay', createDiscordRelayRouter({
  token: process.env.DISCORD_RELAY_TOKEN,
  allowedForumChannelIds: [
    process.env.ORDERS_FORUM_CHANNEL_ID,
    process.env.FORUM_TOPENG_ID,
    process.env.FORUM_CINCIN_ID,
    process.env.FORUM_CLICKER_ID,
  ].filter(Boolean),
  client,
}))
```

(Match the existing import style and the variable name the file already uses for the discord.js client — confirm by reading the file's current top-level imports before adding this block.)

- [ ] **1.5 — Add `DISCORD_RELAY_TOKEN` to `/app/.env` (NOT `/app/src/.env`)**

```bash
echo "DISCORD_RELAY_TOKEN=<value recorded in Step 0.2>" >> /app/.env
```

Verify: `grep DISCORD_RELAY_TOKEN /app/.env` shows the value; `cat /app/src/.env 2>&1` — confirm this file either doesn't exist or is NOT where env vars are actually loaded from (cross-check against how `index.js` loads env, e.g. `dotenv.config({path: '/app/.env'})`).

- [ ] **1.6 — Commit this additive change and restart**

```bash
cd /app/src
git add orders/discord-relay.js index.js
git commit -m "feat: add discord-relay router (additive, pre-cutover)"
pm2 restart <process-name>
```

(Get `<process-name>` from `pm2 list` if not already known/confirmed — per the spec's N4 finding, this is unconfirmable via non-login shell without checking, so run `pm2 list` first rather than assuming a name.)

- [ ] **1.7 — Verify the relay works end-to-end from the dashboard side**

From the dashboard host/environment:

```bash
curl -s https://dashboard.3dprintingbandung.my.id/api/bot/working-projects/... # (or a direct relay smoke-test if Plan A exposes one)
```

Or directly against the relay (from a machine that can reach the homelab LAN):

```bash
curl -s http://192.168.88.92:3000/discord-relay/channel/<a known forum channel id>/tags \
  -H "X-Webhook-Secret: <DISCORD_RELAY_TOKEN value>"
```

Verify: returns a JSON array of tags (200), not a 401/403. Also verify unrelated bot commands (e.g. `/research` or `/tanya`) still respond normally after the restart — confirms the additive change didn't break the shared process.

---

## Step 2: Freeze writes to the old SQLite-backed system

- [ ] **2.1 — Confirm the freeze-check code is already in place**

The ~10-line `ORDERS_FREEZE` check in `router.js` and every order handler must already be written and committed as part of Step 1's additive deploy (per spec: "written and committed as part of the pre-cutover step, so it's already in place before the freeze is flipped on"). If Step 1 did not include this, add it now as its own small additive commit before proceeding — each handler should check `if (process.env.ORDERS_FREEZE === '1') return reply("⏸️ Order tracker sedang migrasi, coba lagi dalam beberapa menit")` as its first line.

- [ ] **2.2 — Flip the freeze flag**

```bash
sed -i '' 's/^ORDERS_FREEZE=.*/ORDERS_FREEZE=1/' /app/.env || echo "ORDERS_FREEZE=1" >> /app/.env
pm2 restart <process-name>
```

Verify: trigger `/order-status` (or any order slash command) in Discord — bot replies with the freeze message, not normal behavior. Trigger an unrelated command (`/tanya`) — still works normally.

**Downtime window begins here.**

---

## Step 3: Backup the SQLite database

- [ ] **3.1 — Copy and lock the database file**

```bash
STAMP=$(date +%Y%m%dT%H%M%S)
cp -p /app/data/orders.db /app/data/backup/orders-$STAMP.db
chmod 444 /app/data/backup/orders-$STAMP.db
sha256sum /app/data/backup/orders-$STAMP.db | tee -a /app/data/backup/checksums.txt
```

Verify: the backup file exists, is read-only (`ls -l` shows `r--r--r--`), and its sha256 is recorded in `checksums.txt`. Record `$STAMP` for reference in later steps.

---

## Step 4: Export SQLite to JSON (read-only)

- [ ] **4.1 — Write `scripts/export-orders.mjs` (read-only `sql.js` export)**

```javascript
import initSqlJs from 'sql.js'
import fs from 'node:fs'

const SQL = await initSqlJs()
const fileBuffer = fs.readFileSync('/app/data/orders.db')
const db = new SQL.Database(fileBuffer)

const result = db.exec('SELECT * FROM orders')
const columns = result[0]?.columns ?? []
const rows = (result[0]?.values ?? []).map(row =>
  Object.fromEntries(columns.map((col, i) => [col, row[i]]))
)

fs.writeFileSync('/app/data/export-' + Date.now() + '.json', JSON.stringify({ orders: rows }, null, 2))
console.log(`Exported ${rows.length} rows.`)
// IMPORTANT: never call db.export() or write back to orders.db from this script — read-only only.
db.close()
```

Verify (self-check on the script, not the data): the script never calls `db.export()` or `fs.writeFileSync` targeting `/app/data/orders.db` — grep it: `grep -n "orders.db" scripts/export-orders.mjs` should show only the read at the top.

- [ ] **4.2 — Run it against production data**

```bash
cd /app/src
node scripts/export-orders.mjs
```

Verify: prints `Exported N rows.` with a plausible N (compare against a rough expected count if known); a new `/app/data/export-<timestamp>.json` file exists; `sha256sum /app/data/orders.db` still matches the Step 3 backup's checksum (confirms the export truly didn't mutate the source file).

- [ ] **4.3 — Copy the export off the host for the import step**

```bash
scp root@192.168.88.92:/app/data/export-*.json /path/to/local/scratchpad/
```

---

## Step 5: Import + backfill into Postgres

- [ ] **5.1 — Run the migration script (Plan A Task 15) against the export**

```bash
cd apps/dashboard
node scripts/migrate-working-projects.ts /path/to/local/scratchpad/export-<timestamp>.json
```

Verify: output JSON shows `imported` count matching the export's row count minus `skipped`; review `warnings` for any unexpected skips (each warning names the `order_no` and reason — investigate any that aren't expected edge cases).

- [ ] **5.2 — Run the `forumChannelId` backfill pass**

For every imported `WorkingProject` with a non-null `discordThreadId` and null `forumChannelId`, call the relay's read-only lookup (idempotent, serial ~250ms apart to respect rate limits):

```bash
# pseudocode — implement as a small one-off script in apps/dashboard/scripts/backfill-forum-channel-id.ts
# for each WorkingProject where discordThreadId IS NOT NULL AND forumChannelId IS NULL:
#   GET /discord-relay/thread/:discordThreadId  -> { parentId }
#   UPDATE WorkingProject SET forumChannelId = parentId WHERE id = ...
#   on failure: log to backfill-failed.json, continue (self-heals via next threadUpdate)
#   sleep ~250ms between calls
```

Verify: `SELECT count(*) FROM "WorkingProject" WHERE "discordThreadId" IS NOT NULL AND "forumChannelId" IS NULL;` is 0 or matches the count of entries logged in `backfill-failed.json` (those self-heal later via `threadUpdate`, per spec — not a blocker).

---

## Step 6: Deploy all rewritten handlers in ONE commit, ONE restart

- [ ] **6.1 — Confirm every file in the import-graph + full handler set is ready, locally, before touching the host**

Files that must ALL change together in this single commit (per the Global Constraints import-graph hazard):
- `bot/handlers/commands/order-baru.js` (incl. `handleOrderModal`, "🗂️ Buat Order")
- `bot/handlers/commands/order-dari-shopee.js`
- `bot/handlers/commands/tokopedia-order.js`
- `bot/handlers/commands/order-status.js`
- `bot/handlers/commands/order-selesai.js`
- `bot/handlers/commands/order-update.js`
- `bot/handlers/commands/order-checklist.js` (+ autocomplete)
- `bot/handlers/commands/mention-set.js`
- `bot/handlers/commands/reminder-config.js`
- `orders/thread-update-handler.js` (keep its existing loop guard verbatim — only the body changes from a local SQLite update to the dashboard `PATCH .../tags` call)
- `index.js` (reminder cron rewritten to call `GET /api/bot/working-projects/due-reminders` + `POST .../reminder-sent`; remove `/orders` router mount; remove `db/orders.js` import)
- `orders/cyd-publisher.js` (stub: publish `{orders: [], unavailable: true, reason: "migrated"}`)

Each rewritten handler becomes a thin client calling the matching `apps/dashboard` bot-facing endpoint (see Plan A Tasks 10-13 for the exact endpoint contracts) using the SAME `BOT_API_URL`/`BOT_API_TOKEN` env vars already used by `order-dari-shopee.js`/`tokopedia-order.js` today.

`catalog-wa.js` is explicitly NOT edited (no DB/Discord write of its own).

Port `parseAmount` and the notes-append timestamp format INTO `apps/dashboard/lib/working-projects/format.ts` (already done in Plan A Task 4) — do not reimplement them ad hoc in `ai-assistant`.

- [ ] **6.2 — Prepare and review the full diff locally before copying to the host**

Write each rewritten handler in the local scratchpad (`/private/tmp/claude-501/.../scratchpad/ai-assistant-orders/`), diff against the original fetched copies, and confirm every one calls the dashboard API rather than `db/orders.js`.

- [ ] **6.3 — Copy all rewritten files to the host and commit as ONE commit**

```bash
scp <scratchpad>/bot/handlers/commands/order-baru.js root@192.168.88.92:/app/src/bot/handlers/commands/order-baru.js
scp <scratchpad>/bot/handlers/commands/order-dari-shopee.js root@192.168.88.92:/app/src/bot/handlers/commands/order-dari-shopee.js
scp <scratchpad>/bot/handlers/commands/tokopedia-order.js root@192.168.88.92:/app/src/bot/handlers/commands/tokopedia-order.js
scp <scratchpad>/bot/handlers/commands/order-status.js root@192.168.88.92:/app/src/bot/handlers/commands/order-status.js
scp <scratchpad>/bot/handlers/commands/order-selesai.js root@192.168.88.92:/app/src/bot/handlers/commands/order-selesai.js
scp <scratchpad>/bot/handlers/commands/order-update.js root@192.168.88.92:/app/src/bot/handlers/commands/order-update.js
scp <scratchpad>/bot/handlers/commands/order-checklist.js root@192.168.88.92:/app/src/bot/handlers/commands/order-checklist.js
scp <scratchpad>/bot/handlers/commands/mention-set.js root@192.168.88.92:/app/src/bot/handlers/commands/mention-set.js
scp <scratchpad>/bot/handlers/commands/reminder-config.js root@192.168.88.92:/app/src/bot/handlers/commands/reminder-config.js
scp <scratchpad>/orders/thread-update-handler.js root@192.168.88.92:/app/src/orders/thread-update-handler.js
scp <scratchpad>/orders/cyd-publisher.js root@192.168.88.92:/app/src/orders/cyd-publisher.js
scp <scratchpad>/index.js root@192.168.88.92:/app/src/index.js
```

```bash
ssh root@192.168.88.92
cd /app/src
git add bot/handlers/commands/order-baru.js bot/handlers/commands/order-dari-shopee.js \
  bot/handlers/commands/tokopedia-order.js bot/handlers/commands/order-status.js \
  bot/handlers/commands/order-selesai.js bot/handlers/commands/order-update.js \
  bot/handlers/commands/order-checklist.js bot/handlers/commands/mention-set.js \
  bot/handlers/commands/reminder-config.js orders/thread-update-handler.js \
  orders/cyd-publisher.js index.js
git commit -m "feat: cut over Working Projects handlers to dashboard API (thin clients)"
```

- [ ] **6.4 — One restart for this entire commit**

```bash
pm2 restart <process-name>
```

Verify: `pm2 logs <process-name> --lines 50` shows a clean boot — no ESM import errors, no crash loop. `pm2 list` shows the process `online`, not `errored`.

---

## Step 7: Delta re-import (catch any writes leaked between Steps 4 and 6)

- [ ] **7.1 — Re-export and re-run the (idempotent) migration**

```bash
ssh root@192.168.88.92 "cd /app/src && node scripts/export-orders.mjs"
scp root@192.168.88.92:/app/data/export-*.json /path/to/local/scratchpad/delta-export.json
cd apps/dashboard && node scripts/migrate-working-projects.ts /path/to/local/scratchpad/delta-export.json
```

Verify: `imported` count in the output is **0**. A non-zero delta means the freeze (Step 2) leaked writes — STOP, do not proceed to Step 8, investigate which write path bypassed the freeze check before continuing.

---

## Step 8: Verify and unfreeze

- [ ] **8.1 — Exercise one of each production path**

- [ ] Run `/order-baru` in Discord — confirm it calls the dashboard, creates a `WorkingProject` row, and the existing/reused forum thread behaves correctly (no duplicate thread created).
- [ ] Run `/order-status` — confirm the status update reaches Postgres and the Discord thread tag/rename updates.
- [ ] Manually change a thread's tags directly in Discord — confirm `thread-update-handler.js`'s loop guard still prevents an infinite `threadUpdate` loop, and the change reaches Postgres via the dashboard's `PATCH .../tags`.
- [ ] Make one edit from the new dashboard web UI (`/order?channel=working-project`) — confirm it reaches the Discord thread via the relay.

- [ ] **8.2 — Unset the freeze flag**

```bash
sed -i '' 's/^ORDERS_FREEZE=.*/ORDERS_FREEZE=0/' /app/.env
pm2 restart <process-name>
```

Verify: `/order-status` (or any order command) now behaves normally, not the freeze message.

**Downtime window ends here.**

---

## Step 9: Post-cutover cleanup (+7 days, NOT part of the cutover window)

- [ ] **9.1 — Wait at least 7 days of stable production operation before this step.**

- [ ] **9.2 — Remove now-dead files**

```bash
cd /app/src
git rm public/index.html public/timeline.html public/green-lantern-ring/index.html db/orders.js
```

Also remove `orders/status-tags.js`'s now-unused `maybeExtractNotes`/`syncStatusTag` helpers (edit the file, do not delete it wholesale unless it becomes fully empty).

```bash
git add orders/status-tags.js
git commit -m "chore: remove decommissioned Working Projects legacy files (+7 days post-cutover)"
pm2 restart <process-name>
```

Verify: `pm2 logs <process-name> --lines 30` shows clean boot; unrelated bot commands still respond.

---

## Rollback Procedure (any step 2–8, if something goes wrong)

```bash
ssh root@192.168.88.92
cd /app/src
git checkout pre-wp-merge
cp -p /app/data/backup/orders-<STAMP>.db /app/data/orders.db
sed -i '' 's/^ORDERS_FREEZE=.*/ORDERS_FREEZE=0/' /app/.env
pm2 restart <process-name>
```

Verify: `/order-status` responds normally against the restored SQLite data. **Accepted consequence (D1):** any Postgres writes made between Step 5 and the rollback point are NOT reflected back into SQLite or Discord bookkeeping — the underlying Discord threads themselves are untouched, only the bot's own record of them reverts. The Postgres data remains available in the dashboard for a manual re-migration attempt later if the user wants to retry the cutover.

---

## Self-Review

**Spec coverage:** All 9 numbered cutover steps from the spec (lines 574–652) map 1:1 to Steps 1–9 above, plus Step 0 (pre-flight, not in the spec's numbered list but required before Step 1 can safely begin) and the Rollback procedure (spec lines 659–668).

**Placeholder scan:** `<process-name>` is the one recurring bracketed value — explicitly resolved via `pm2 list` in Step 1.6 rather than left as an unresolved TBD; every other bracketed value (`$STAMP`, token values) is generated/recorded within the runbook itself, not left blank.

**Consistency with Plan A:** endpoint names referenced in Step 6 (`due-reminders`, `reminder-sent`, `.../tags`) match Plan A Tasks 11–13's route paths; `scripts/migrate-working-projects.ts`'s CLI invocation in Steps 5 and 7 matches its Task 15 signature (`migrateWorkingProjects(exportPath)` via `require.main === module`); the relay file path (`apps/dashboard/docs/superpowers/ai-assistant-reference/orders/discord-relay.js`) matches where Plan A Task 5 commits it.
