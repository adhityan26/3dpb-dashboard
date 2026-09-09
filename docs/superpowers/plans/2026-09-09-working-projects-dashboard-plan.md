# Working Projects Dashboard Merge — Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all Working Projects (order tracker + timeline + Green Lantern Ring view) data ownership and business logic into `apps/dashboard`, exposing bot-facing APIs so `ai-assistant` becomes a thin Discord relay + gateway-listener client.

**Architecture:** New `WorkingProject` Prisma model in `apps/dashboard`; pure formatting/parsing logic in `lib/working-projects/format.ts`; a relay HTTP client (`lib/working-projects/discord-sync.ts`) calling a NEW `orders/discord-relay.js` service in `ai-assistant` (developed here, deployed during Plan B cutover); business logic in `lib/working-projects/service.ts`; bot-facing routes under `app/api/bot/working-projects/*` (reused `BOT_API_TOKEN` via existing `requireBotToken`), web-facing routes under `app/api/working-projects/*` (session auth); UI adds a `working-project` channel (first in sidebar) with `orders`/`green-lantern-ring`/`timeline` tabs via `?channel=`/`?tab=` query params, plus "Buat Working Project" actions on Shopee/Tokopedia views.

**Tech Stack:** Next.js 16 (App Router), Prisma/Postgres, TypeScript, Vitest, React (existing dashboard patterns).

**Spec:** `docs/superpowers/specs/2026-09-09-working-projects-merge-design.md`

## Global Constraints

- Bot-facing routes MUST use the existing `requireBotToken` (`apps/dashboard/lib/bot/auth.ts`, `crypto.timingSafeEqual`) — never a custom check.
- `sourceOrderNo` (real marketplace ID, API-fetched only) and `orderNoLegacy` (free-text, display-only) are NEVER conflated. Display order number as `sourceOrderNo ?? orderNoLegacy ?? '-'`.
- `dueDate` (parsed `DateTime?`) and `dueDateRaw` (preserved unparseable legacy string) are separate fields — never fabricate a parsed date from unparseable text.
- Checklist items are canonical `{id, text, done, done_at, done_by, added_by, added_at, deleted}`; new `id` = `max(id)+1` over ALL items including soft-deleted, allocated server-side only.
- `orders/discord-relay.js` (ai-assistant repo, developed/tested here): mutating endpoints restricted to allowlist `[ORDERS_FORUM_CHANNEL_ID, FORUM_TOPENG_ID, FORUM_CINCIN_ID, FORUM_CLICKER_ID]` (403 otherwise); auth header `X-Webhook-Secret` checked via `crypto.timingSafeEqual`, FAIL-CLOSED (refuse to mount routes if `DISCORD_RELAY_TOKEN` unset); every thread create/edit sets `allowedMentions: {parse: [], users: mentions}` (no markdown escaping — thread continuity, no new threads created for existing projects).
- Discord constraints the relay must respect: 100-char thread title cap, 5-tag cap, 2000-char message cap, thread rename rate-limit awareness (~2 edits/10min/channel — caller's responsibility to avoid rapid repeat edits), auto-unarchive before editing an archived thread.
- `POST /discord-relay/thread` accepts an `Idempotency-Key` header (in-memory dedup map) to prevent duplicate-thread creation on relay-call retry.
- `WorkingProject.syncState` (`ok`|`pending`|`error`) + `syncError`: create writes DB row first (`pending`, no `discordThreadId`) then calls relay; update writes Postgres first, then relay (`error`+`syncError` on relay failure, still return 200 `{discordSynced:false}`). No cron reconciler — manual `POST /api/working-projects/:id/resync` only.
- GL Ring tab (`tab=green-lantern-ring`) requires FULL parity: one row per ring variant (split `product` on commas + `variantShort()`), per-variant size via `notes.split('|')` + `parseSize()` + `SIZE_SCALE` table, checklist matched by case-insensitive label text (read: `includes()`, write: exact match via `setByLabel` op), up to 3-column multi-sort, 5 filter dimensions, summary stat pills, `Canceled` rows excluded.
- `tab=orders` columns, in order, exactly matching the legacy UI: Customer/Contact, Produk, Variant, Platform, No. Order, Due Date, Status, Payment, Nominal, Checklist, Discord.
- New `working-project` channel is inserted FIRST in `OrderSidebar`'s `ITEMS` (default channel on `/order` with no `channel` query param).
- CYD hardware publisher path stays a stub returning "unavailable" — no real MQTT/CYD reader is built in this plan.

---

## File Structure

- `apps/dashboard/prisma/schema.prisma` — add `WorkingProject` model.
- `apps/dashboard/lib/working-projects/format.ts` + `__tests__/format.test.ts` — pure functions: title/post-content building, date parsing, GL Ring parsing (`parseSize`, `SIZE_SCALE`, `isGLRing`, `variantShort`), `parseAmount`, notes-append timestamp, mention text.
- `apps/dashboard/lib/working-projects/discord-sync.ts` + `__tests__/discord-sync.test.ts` — relay HTTP client wrapping `DISCORD_RELAY_URL`/`DISCORD_RELAY_TOKEN`.
- `apps/dashboard/lib/working-projects/service.ts` + `__tests__/service.test.ts` — `createWorkingProject`, `updateWorkingProject`, `setStatus`, `markDone`, `updateMentions`, checklist ops (`add|check|uncheck|edit|remove|copy|setByLabel`), `resyncWorkingProject`.
- `apps/dashboard/app/api/bot/working-projects/route.ts` — `POST` create.
- `apps/dashboard/app/api/bot/working-projects/[threadId]/route.ts` — `PATCH` general update, `GET` by-thread lookup.
- `apps/dashboard/app/api/bot/working-projects/[threadId]/status/route.ts` — `PATCH` status.
- `apps/dashboard/app/api/bot/working-projects/[threadId]/done/route.ts` — `POST` done.
- `apps/dashboard/app/api/bot/working-projects/[threadId]/mentions/route.ts` — `PATCH` mentions.
- `apps/dashboard/app/api/bot/working-projects/[threadId]/tags/route.ts` — `PATCH` tags + rename.
- `apps/dashboard/app/api/bot/working-projects/[threadId]/checklist/route.ts` — `POST` checklist ops.
- `apps/dashboard/app/api/bot/working-projects/checklist-sources/route.ts` — `GET ?q=`.
- `apps/dashboard/app/api/bot/working-projects/settings/route.ts` — `GET`/`PATCH` reminder settings.
- `apps/dashboard/app/api/bot/working-projects/due-reminders/route.ts` — `GET`.
- `apps/dashboard/app/api/bot/working-projects/[threadId]/reminder-sent/route.ts` — `POST`.
- `apps/dashboard/app/api/working-projects/route.ts` — web `GET`/`POST`.
- `apps/dashboard/app/api/working-projects/[id]/route.ts` — web `PATCH`/`DELETE`.
- `apps/dashboard/app/api/working-projects/[id]/detail-source/route.ts` — web `GET` (live Shopee/Tokopedia detail passthrough).
- `apps/dashboard/app/api/working-projects/[id]/resync/route.ts` — web `POST`.
- `apps/dashboard/scripts/migrate-working-projects.ts` + `apps/dashboard/scripts/__tests__/migrate-working-projects.test.ts` — one-shot SQLite-JSON-export → Postgres importer.
- `apps/dashboard/components/order/OrderSidebar.tsx` — add `working-project` channel entry (modify).
- `apps/dashboard/app/(dashboard)/order/page.tsx` — wire `working-project` channel + `tab=` routing, add "Buat Working Project" actions to Shopee/Tokopedia views (modify).
- `apps/dashboard/components/order/WorkingProjectOrdersTab.tsx` — `tab=orders` table.
- `apps/dashboard/components/order/WorkingProjectTimelineTab.tsx` — `tab=timeline` view.
- `apps/dashboard/components/order/WorkingProjectGLRingTab.tsx` — `tab=green-lantern-ring` view.
- `ai-assistant` repo (scratchpad-developed, deployed in Plan B): `orders/discord-relay.js` + `orders/__tests__/discord-relay.test.js`.

---

### Task 1: Prisma schema — `WorkingProject` model

**Files:**
- Modify: `apps/dashboard/prisma/schema.prisma`
- Test: manual `pnpm --filter shopee-dashboard exec prisma validate`

**Interfaces:**
- Produces: `WorkingProject` Prisma model/type used by every later task.

- [ ] **Step 1: Add the model**

```prisma
model WorkingProject {
  id               String   @id @default(cuid())
  discordThreadId  String?  @unique
  forumChannelId   String?
  source           String
  sourceOrderNo    String?
  orderNoLegacy    String?
  syncState        String   @default("ok")
  syncError        String?
  customer         String
  contact          String?
  platform         String?
  product          String
  variant          String?
  title            String
  status           String   @default("Open")
  payment          String   @default("Belum")
  orderDate        DateTime?
  dueDate          DateTime?
  dueDateRaw       String?
  invoiceAmount    Int      @default(0)
  paidAmount       Int      @default(0)
  notes            String?
  shipping         String?
  trackingNo       String?
  checklist        Json     @default("[]")
  mentions         String[] @default([])
  appliedTags      String[] @default([])
  remindersSent    Int[]    @default([])
  quotationId      String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

- [ ] **Step 2: Validate schema**

Run: `cd apps/dashboard && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Push schema to dev database**

Run: `cd apps/dashboard && npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/prisma/schema.prisma
git commit -m "feat(working-projects): add WorkingProject Prisma model"
```

---

### Task 2: `format.ts` part 1 — title, post content, date parsing

**Files:**
- Create: `apps/dashboard/lib/working-projects/format.ts`
- Test: `apps/dashboard/lib/working-projects/__tests__/format.test.ts`

**Interfaces:**
- Consumes: none (pure functions).
- Produces: `buildTitle(wp: {customer:string; product:string; variant?:string|null}): string`, `buildPostContent(wp: Pick<WorkingProject,'customer'|'contact'|'product'|'variant'|'platform'|'sourceOrderNo'|'orderNoLegacy'|'dueDate'|'dueDateRaw'|'notes'>): string`, `parseDueDate(raw: string): {dueDate: Date|null; dueDateRaw: string|null}` — consumed by `service.ts` (Task 7) and migration script (Task 15).

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { buildTitle, buildPostContent, parseDueDate } from '../format'

describe('buildTitle', () => {
  it('joins customer, product, variant', () => {
    expect(buildTitle({ customer: 'Budi', product: 'Cincin', variant: 'Size 8' }))
      .toBe('Budi - Cincin (Size 8)')
  })
  it('omits variant parens when absent', () => {
    expect(buildTitle({ customer: 'Budi', product: 'Cincin' })).toBe('Budi - Cincin')
  })
})

describe('parseDueDate', () => {
  it('parses ISO-like date strings', () => {
    const r = parseDueDate('2026-09-15')
    expect(r.dueDate?.toISOString().slice(0, 10)).toBe('2026-09-15')
    expect(r.dueDateRaw).toBeNull()
  })
  it('preserves unparseable legacy text verbatim', () => {
    const r = parseDueDate('akhir bulan')
    expect(r.dueDate).toBeNull()
    expect(r.dueDateRaw).toBe('akhir bulan')
  })
  it('treats empty string as no due date at all', () => {
    const r = parseDueDate('')
    expect(r.dueDate).toBeNull()
    expect(r.dueDateRaw).toBeNull()
  })
})

describe('buildPostContent', () => {
  it('prefers sourceOrderNo over orderNoLegacy for display', () => {
    const content = buildPostContent({
      customer: 'Budi', contact: '0812', product: 'Cincin', variant: null,
      platform: 'Shopee', sourceOrderNo: 'SN123', orderNoLegacy: 'legacy-1',
      dueDate: null, dueDateRaw: null, notes: null,
    } as any)
    expect(content).toContain('SN123')
    expect(content).not.toContain('legacy-1')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/format.test.ts`
Expected: FAIL — module `../format` not found.

- [ ] **Step 3: Implement**

```typescript
export function buildTitle(wp: { customer: string; product: string; variant?: string | null }): string {
  const base = `${wp.customer} - ${wp.product}`
  return wp.variant ? `${base} (${wp.variant})` : base
}

export function parseDueDate(raw: string): { dueDate: Date | null; dueDateRaw: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { dueDate: null, dueDateRaw: null }
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return { dueDate: parsed, dueDateRaw: null }
  }
  return { dueDate: null, dueDateRaw: trimmed }
}

export function buildPostContent(wp: {
  customer: string
  contact?: string | null
  product: string
  variant?: string | null
  platform?: string | null
  sourceOrderNo?: string | null
  orderNoLegacy?: string | null
  dueDate?: Date | null
  dueDateRaw?: string | null
  notes?: string | null
}): string {
  const lines = [
    `**Customer:** ${wp.customer}${wp.contact ? ` (${wp.contact})` : ''}`,
    `**Produk:** ${wp.product}${wp.variant ? ` — ${wp.variant}` : ''}`,
  ]
  if (wp.platform) lines.push(`**Platform:** ${wp.platform}`)
  const orderNo = wp.sourceOrderNo ?? wp.orderNoLegacy
  if (orderNo) lines.push(`**No. Order:** ${orderNo}`)
  const due = wp.dueDate ? wp.dueDate.toISOString().slice(0, 10) : wp.dueDateRaw
  if (due) lines.push(`**Due Date:** ${due}`)
  if (wp.notes) lines.push(`**Catatan:** ${wp.notes}`)
  return lines.join('\n')
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/format.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/working-projects/format.ts apps/dashboard/lib/working-projects/__tests__/format.test.ts
git commit -m "feat(working-projects): add title/post-content/date-parsing format helpers"
```

---

### Task 3: `format.ts` part 2 — Green Lantern Ring parsing

**Files:**
- Modify: `apps/dashboard/lib/working-projects/format.ts`
- Test: `apps/dashboard/lib/working-projects/__tests__/format.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `SIZE_SCALE: Record<string, number>`, `parseSize(notes: string): {usSize: string|null; scalePct: number|null}`, `isGLRing(appliedTags: string[], forumChannelId: string|null): boolean`, `variantShort(productCsvEntry: string): string`, `splitProductVariants(product: string): string[]` — consumed by `WorkingProjectGLRingTab.tsx` (Task 18) and `service.ts` checklist `setByLabel` (Task 9).

- [ ] **Step 1: Write failing tests**

```typescript
import { SIZE_SCALE, parseSize, isGLRing, variantShort, splitProductVariants } from '../format'

describe('SIZE_SCALE', () => {
  it('maps US ring sizes to scale percentages', () => {
    expect(SIZE_SCALE['8']).toBeTypeOf('number')
    expect(SIZE_SCALE['6']).toBeLessThan(SIZE_SCALE['10'])
  })
})

describe('parseSize', () => {
  it('extracts US size from pipe-delimited notes', () => {
    const r = parseSize('warna emas | size US 8 | catatan lain')
    expect(r.usSize).toBe('8')
    expect(r.scalePct).toBe(SIZE_SCALE['8'])
  })
  it('returns nulls when no size segment present', () => {
    expect(parseSize('warna emas')).toEqual({ usSize: null, scalePct: null })
  })
})

describe('splitProductVariants', () => {
  it('splits comma-joined product string into variants', () => {
    expect(splitProductVariants('Cincin A, Cincin B')).toEqual(['Cincin A', 'Cincin B'])
  })
})

describe('variantShort', () => {
  it('shortens a variant entry for display', () => {
    expect(variantShort('Cincin Green Lantern - Emas')).toBe('Cincin GL - Emas')
  })
})

describe('isGLRing', () => {
  it('true when forumChannelId matches the ring forum', () => {
    expect(isGLRing([], 'FORUM_CINCIN_ID')).toBe(true)
  })
  it('true when appliedTags include a ring tag', () => {
    expect(isGLRing(['Green Lantern Ring'], null)).toBe(true)
  })
  it('false otherwise', () => {
    expect(isGLRing(['Topeng'], 'FORUM_TOPENG_ID')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/format.test.ts`
Expected: FAIL — `SIZE_SCALE`/`parseSize`/etc. not exported.

- [ ] **Step 3: Implement**

```typescript
export const SIZE_SCALE: Record<string, number> = {
  '5': 88, '6': 91, '7': 94, '8': 97, '9': 100, '10': 103, '11': 106, '12': 109,
}

export function parseSize(notes: string): { usSize: string | null; scalePct: number | null } {
  const segments = notes.split('|').map(s => s.trim())
  for (const seg of segments) {
    const m = seg.match(/size\s*(?:us)?\s*(\d{1,2})/i)
    if (m) {
      const usSize = m[1]
      return { usSize, scalePct: SIZE_SCALE[usSize] ?? null }
    }
  }
  return { usSize: null, scalePct: null }
}

export function splitProductVariants(product: string): string[] {
  return product.split(',').map(s => s.trim()).filter(Boolean)
}

export function variantShort(entry: string): string {
  return entry.replace(/Green Lantern/gi, 'GL')
}

export function isGLRing(appliedTags: string[], forumChannelId: string | null): boolean {
  if (forumChannelId === 'FORUM_CINCIN_ID') return true
  return appliedTags.some(t => /ring|cincin/i.test(t))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/working-projects/format.ts apps/dashboard/lib/working-projects/__tests__/format.test.ts
git commit -m "feat(working-projects): add Green Lantern Ring parsing helpers"
```

---

### Task 4: `format.ts` part 3 — amount parsing, notes append, mentions

**Files:**
- Modify: `apps/dashboard/lib/working-projects/format.ts`
- Test: `apps/dashboard/lib/working-projects/__tests__/format.test.ts`

**Interfaces:**
- Produces: `parseAmount(raw: string): number`, `appendNoteWithTimestamp(existing: string|null, note: string): string`, `allowedMentionsPayload(mentions: string[]): {parse: []; users: string[]}` — consumed by `service.ts` (Task 7-9) and `discord-sync.ts` (Task 6).

- [ ] **Step 1: Write failing tests**

```typescript
import { parseAmount, appendNoteWithTimestamp, allowedMentionsPayload } from '../format'

describe('parseAmount', () => {
  it('strips currency formatting to an integer', () => {
    expect(parseAmount('Rp150.000')).toBe(150000)
    expect(parseAmount('150000')).toBe(150000)
  })
  it('returns 0 for empty/invalid input', () => {
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('abc')).toBe(0)
  })
})

describe('appendNoteWithTimestamp', () => {
  it('appends with a bracketed ISO date prefix', () => {
    const result = appendNoteWithTimestamp('existing note', 'new note')
    expect(result.startsWith('existing note\n[')).toBe(true)
    expect(result).toContain('new note')
  })
  it('handles null existing notes', () => {
    expect(appendNoteWithTimestamp(null, 'first note')).toContain('first note')
  })
})

describe('allowedMentionsPayload', () => {
  it('never parses everyone/roles, only explicit user ids', () => {
    expect(allowedMentionsPayload(['123', '456'])).toEqual({ parse: [], users: ['123', '456'] })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/format.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
export function parseAmount(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '')
  return digits ? parseInt(digits, 10) : 0
}

export function appendNoteWithTimestamp(existing: string | null, note: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const line = `[${stamp}] ${note}`
  return existing ? `${existing}\n${line}` : line
}

export function allowedMentionsPayload(mentions: string[]): { parse: []; users: string[] } {
  return { parse: [], users: mentions }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/format.test.ts`
Expected: PASS (full file green)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/working-projects/format.ts apps/dashboard/lib/working-projects/__tests__/format.test.ts
git commit -m "feat(working-projects): add amount parsing, notes timestamping, mention-hardening helpers"
```

---

### Task 5: `ai-assistant` — `orders/discord-relay.js`

**Files:**
- Create (scratchpad, deployed to `ai-assistant` in Plan B): `apps/dashboard/../../scratchpad-out/ai-assistant/orders/discord-relay.js` — implementer writes it to `/private/tmp/claude-501/-Users-adhityatangahu-Documents-shopee-analysis/*/scratchpad/ai-assistant-orders/orders/discord-relay.js` (this repo has no `ai-assistant` checkout; keep the file in the scratchpad path used throughout this project, ready to copy in during Plan B).
- Test: same directory, `orders/__tests__/discord-relay.test.js` (Vitest or Node's built-in test runner — match whichever `ai-assistant`'s existing `package.json` already uses; read `package.json` from the scratchpad copy first).

**Interfaces:**
- Consumes: `express` Router pattern (existing `ai-assistant` style, mirror `router.js`'s mounting convention), `discord.js` v14 client (existing `bot/client.js` export).
- Produces: an Express router mounted at `/discord-relay` exposing the 6 endpoints listed in Global Constraints; consumed by `discord-sync.ts` (Task 6) as its documented contract, and copied into production during Plan B.

- [ ] **Step 1: Read the existing auth/router patterns to mirror**

Read `apps/dashboard/lib/bot/auth.ts` (fail-closed `timingSafeEqual` pattern) and the scratchpad's `router.js`/`webhook/ocr.js` for the OLD (fail-open, weak) pattern to explicitly avoid. Read scratchpad `bot/client.js` for how the discord.js client is exported/imported.

- [ ] **Step 2: Write failing tests**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createDiscordRelayRouter } from '../discord-relay.js'

const ALLOWED_CHANNEL = 'forum-cincin-id'

function buildApp({ token = 'test-secret', client } = {}) {
  const app = express()
  app.use(express.json())
  app.use('/discord-relay', createDiscordRelayRouter({
    token,
    allowedForumChannelIds: [ALLOWED_CHANNEL],
    client,
  }))
  return app
}

describe('discord-relay auth', () => {
  it('rejects requests without the shared secret', async () => {
    const app = buildApp()
    const res = await request(app).get('/discord-relay/thread/123')
    expect(res.status).toBe(401)
  })

  it('rejects requests with a wrong secret using constant-time compare', async () => {
    const app = buildApp()
    const res = await request(app)
      .get('/discord-relay/thread/123')
      .set('X-Webhook-Secret', 'wrong')
    expect(res.status).toBe(401)
  })

  it('throws at construction time if no token is configured (fail-closed)', () => {
    expect(() => createDiscordRelayRouter({ token: undefined, allowedForumChannelIds: [] }))
      .toThrow(/DISCORD_RELAY_TOKEN/)
  })
})

describe('discord-relay allowlist', () => {
  it('403s a thread create outside the allowed forum channels', async () => {
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ id: 'not-allowed' }) } }
    const app = buildApp({ client })
    const res = await request(app)
      .post('/discord-relay/thread')
      .set('X-Webhook-Secret', 'test-secret')
      .send({ parentId: 'not-allowed', name: 'Test', message: 'hi' })
    expect(res.status).toBe(403)
  })
})

describe('discord-relay idempotency', () => {
  it('returns the same threadId for a repeated Idempotency-Key', async () => {
    const created = { id: 'thread-1', url: 'https://discord.com/channels/x/thread-1' }
    const forum = {
      id: ALLOWED_CHANNEL,
      threads: { create: vi.fn().mockResolvedValue(created) },
    }
    const client = { channels: { fetch: vi.fn().mockResolvedValue(forum) } }
    const app = buildApp({ client })

    const body = { parentId: ALLOWED_CHANNEL, name: 'Test', message: 'hi' }
    const first = await request(app).post('/discord-relay/thread')
      .set('X-Webhook-Secret', 'test-secret').set('Idempotency-Key', 'k1').send(body)
    const second = await request(app).post('/discord-relay/thread')
      .set('X-Webhook-Secret', 'test-secret').set('Idempotency-Key', 'k1').send(body)

    expect(first.body.threadId).toBe('thread-1')
    expect(second.body.threadId).toBe('thread-1')
    expect(forum.threads.create).toHaveBeenCalledTimes(1)
  })
})

describe('discord-relay archived-thread edit', () => {
  it('auto-unarchives before applying a PATCH', async () => {
    const thread = { id: 't1', archived: true, setArchived: vi.fn().mockResolvedValue(undefined), edit: vi.fn().mockResolvedValue(undefined), parentId: ALLOWED_CHANNEL }
    const client = { channels: { fetch: vi.fn().mockResolvedValue(thread) } }
    const app = buildApp({ client })
    const res = await request(app)
      .patch('/discord-relay/thread/t1')
      .set('X-Webhook-Secret', 'test-secret')
      .send({ name: 'New Name' })
    expect(res.status).toBe(200)
    expect(thread.setArchived).toHaveBeenCalledWith(false)
    expect(thread.edit).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' }))
  })
})

describe('discord-relay mention hardening', () => {
  it('sets allowedMentions to parse:[] with explicit users on create', async () => {
    const forum = { id: ALLOWED_CHANNEL, threads: { create: vi.fn().mockResolvedValue({ id: 't2', url: 'u' }) } }
    const client = { channels: { fetch: vi.fn().mockResolvedValue(forum) } }
    const app = buildApp({ client })
    await request(app).post('/discord-relay/thread')
      .set('X-Webhook-Secret', 'test-secret')
      .send({ parentId: ALLOWED_CHANNEL, name: 'T', message: 'hi <@999>', mentions: ['999'] })
    expect(forum.threads.create).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.objectContaining({
        allowedMentions: { parse: [], users: ['999'] },
      }),
    }))
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd <scratchpad>/ai-assistant-orders && npx vitest run orders/__tests__/discord-relay.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```javascript
import express from 'express'
import crypto from 'node:crypto'

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export function createDiscordRelayRouter({ token, allowedForumChannelIds, client }) {
  if (!token) {
    throw new Error('DISCORD_RELAY_TOKEN must be set — discord-relay refuses to mount without it')
  }

  const idempotencyCache = new Map()
  const router = express.Router()

  router.use((req, res, next) => {
    const provided = req.get('X-Webhook-Secret') ?? ''
    if (!timingSafeEqualStr(provided, token)) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    next()
  })

  function isAllowedParent(parentId) {
    return allowedForumChannelIds.includes(parentId)
  }

  router.get('/thread/:id', async (req, res) => {
    try {
      const thread = await client.channels.fetch(req.params.id)
      if (!thread) return res.status(404).json({ error: 'not_found' })
      res.json({
        parentId: thread.parentId, name: thread.name,
        appliedTags: thread.appliedTags ?? [], archived: thread.archived, ownerId: thread.ownerId,
      })
    } catch {
      res.status(404).json({ error: 'not_found' })
    }
  })

  router.get('/channel/:id/tags', async (req, res) => {
    const channel = await client.channels.fetch(req.params.id)
    res.json(channel.availableTags ?? [])
  })

  router.post('/thread', async (req, res) => {
    const { parentId, name, message, mentions = [] } = req.body
    if (!isAllowedParent(parentId)) return res.status(403).json({ error: 'forbidden_channel' })

    const idempotencyKey = req.get('Idempotency-Key')
    if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
      return res.json(idempotencyCache.get(idempotencyKey))
    }

    const forum = await client.channels.fetch(parentId)
    const created = await forum.threads.create({
      name: name.slice(0, 100),
      message: { content: message.slice(0, 2000), allowedMentions: { parse: [], users: mentions } },
    })
    const result = { threadId: created.id, threadUrl: created.url }
    if (idempotencyKey) idempotencyCache.set(idempotencyKey, result)
    res.json(result)
  })

  router.patch('/thread/:id', async (req, res) => {
    const thread = await client.channels.fetch(req.params.id)
    if (!isAllowedParent(thread.parentId)) return res.status(403).json({ error: 'forbidden_channel' })
    if (thread.archived) await thread.setArchived(false)
    const { name, appliedTags, starterContent, mentions = [] } = req.body
    const edit = {}
    if (name) edit.name = name.slice(0, 100)
    if (appliedTags) edit.appliedTags = appliedTags.slice(0, 5)
    if (starterContent) edit.allowedMentions = { parse: [], users: mentions }
    await thread.edit(edit)
    res.json({ ok: true })
  })

  router.post('/thread/:id/archive', async (req, res) => {
    const thread = await client.channels.fetch(req.params.id)
    if (!isAllowedParent(thread.parentId)) return res.status(403).json({ error: 'forbidden_channel' })
    await thread.setArchived(true)
    res.json({ ok: true })
  })

  router.delete('/thread/:id', async (req, res) => {
    const thread = await client.channels.fetch(req.params.id)
    if (!isAllowedParent(thread.parentId)) return res.status(403).json({ error: 'forbidden_channel' })
    await thread.delete()
    res.json({ ok: true })
  })

  return router
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd <scratchpad>/ai-assistant-orders && npx vitest run orders/__tests__/discord-relay.test.js`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit (in dashboard repo, as reference copy for Plan B)**

```bash
mkdir -p apps/dashboard/docs/superpowers/ai-assistant-reference/orders
cp <scratchpad>/ai-assistant-orders/orders/discord-relay.js apps/dashboard/docs/superpowers/ai-assistant-reference/orders/discord-relay.js
cp <scratchpad>/ai-assistant-orders/orders/__tests__/discord-relay.test.js apps/dashboard/docs/superpowers/ai-assistant-reference/orders/discord-relay.test.js
git add apps/dashboard/docs/superpowers/ai-assistant-reference/orders/discord-relay.js apps/dashboard/docs/superpowers/ai-assistant-reference/orders/discord-relay.test.js
git commit -m "feat(working-projects): add ai-assistant discord-relay router (deployed in Plan B cutover)"
```

---

### Task 6: `discord-sync.ts` — dashboard-side relay client

**Files:**
- Create: `apps/dashboard/lib/working-projects/discord-sync.ts`
- Test: `apps/dashboard/lib/working-projects/__tests__/discord-sync.test.ts`

**Interfaces:**
- Consumes: `allowedMentionsPayload` (Task 4, used only for documentation parity — the relay applies it server-side).
- Produces: `createRelayThread(input: {parentId; name; message; mentions: string[]; idempotencyKey: string}): Promise<{threadId: string; threadUrl: string}>`, `editRelayThread(threadId: string, patch: {name?; appliedTags?; starterContent?; mentions?: string[]}): Promise<void>`, `archiveRelayThread(threadId: string): Promise<void>`, `deleteRelayThread(threadId: string): Promise<void>`, `getRelayThread(threadId: string): Promise<{parentId; name; appliedTags; archived; ownerId} | null>`, `getRelayChannelTags(channelId: string): Promise<unknown[]>` — consumed by `service.ts` (Task 7-9).

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRelayThread, editRelayThread, getRelayThread } from '../discord-sync'

const OLD_ENV = process.env

beforeEach(() => {
  process.env = { ...OLD_ENV, DISCORD_RELAY_URL: 'http://relay.local:4000', DISCORD_RELAY_TOKEN: 'secret' }
  global.fetch = vi.fn()
})
afterEach(() => { process.env = OLD_ENV })

describe('createRelayThread', () => {
  it('POSTs to /discord-relay/thread with the shared secret and idempotency key', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ threadId: 't1', threadUrl: 'u' }) })
    const result = await createRelayThread({ parentId: 'p1', name: 'n', message: 'm', mentions: [], idempotencyKey: 'k1' })
    expect(result).toEqual({ threadId: 't1', threadUrl: 'u' })
    const [url, opts] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('http://relay.local:4000/discord-relay/thread')
    expect(opts.headers['X-Webhook-Secret']).toBe('secret')
    expect(opts.headers['Idempotency-Key']).toBe('k1')
  })

  it('throws with the relay error body on non-2xx', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden_channel' })
    await expect(createRelayThread({ parentId: 'p1', name: 'n', message: 'm', mentions: [], idempotencyKey: 'k1' }))
      .rejects.toThrow(/403/)
  })
})

describe('getRelayThread', () => {
  it('returns null on 404 instead of throwing', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 404, text: async () => 'not_found' })
    expect(await getRelayThread('t1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/discord-sync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
function relayUrl(path: string): string {
  const base = process.env.DISCORD_RELAY_URL
  if (!base) throw new Error('DISCORD_RELAY_URL is not set')
  return `${base}${path}`
}

function relayHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.DISCORD_RELAY_TOKEN
  if (!token) throw new Error('DISCORD_RELAY_TOKEN is not set')
  return { 'Content-Type': 'application/json', 'X-Webhook-Secret': token, ...extra }
}

async function relayFetch(path: string, init: RequestInit & { headers: Record<string, string> }) {
  const res = await fetch(relayUrl(path), init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`discord-relay ${res.status}${body ? ': ' + body : ''}`)
  }
  return res
}

export async function createRelayThread(input: {
  parentId: string; name: string; message: string; mentions: string[]; idempotencyKey: string
}): Promise<{ threadId: string; threadUrl: string }> {
  const res = await relayFetch('/discord-relay/thread', {
    method: 'POST',
    headers: relayHeaders({ 'Idempotency-Key': input.idempotencyKey }),
    body: JSON.stringify(input),
  })
  return res.json()
}

export async function editRelayThread(threadId: string, patch: {
  name?: string; appliedTags?: string[]; starterContent?: string; mentions?: string[]
}): Promise<void> {
  await relayFetch(`/discord-relay/thread/${encodeURIComponent(threadId)}`, {
    method: 'PATCH', headers: relayHeaders(), body: JSON.stringify(patch),
  })
}

export async function archiveRelayThread(threadId: string): Promise<void> {
  await relayFetch(`/discord-relay/thread/${encodeURIComponent(threadId)}/archive`, {
    method: 'POST', headers: relayHeaders(),
  })
}

export async function deleteRelayThread(threadId: string): Promise<void> {
  await relayFetch(`/discord-relay/thread/${encodeURIComponent(threadId)}`, {
    method: 'DELETE', headers: relayHeaders(),
  })
}

export async function getRelayThread(threadId: string): Promise<{
  parentId: string; name: string; appliedTags: string[]; archived: boolean; ownerId: string
} | null> {
  const res = await fetch(relayUrl(`/discord-relay/thread/${encodeURIComponent(threadId)}`), { headers: relayHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`discord-relay ${res.status}`)
  return res.json()
}

export async function getRelayChannelTags(channelId: string): Promise<unknown[]> {
  const res = await relayFetch(`/discord-relay/channel/${encodeURIComponent(channelId)}/tags`, {
    method: 'GET', headers: relayHeaders(),
  })
  return res.json()
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/discord-sync.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/working-projects/discord-sync.ts apps/dashboard/lib/working-projects/__tests__/discord-sync.test.ts
git commit -m "feat(working-projects): add discord-relay HTTP client"
```

---

### Task 7: `service.ts` — `createWorkingProject`

**Files:**
- Create: `apps/dashboard/lib/working-projects/service.ts`
- Test: `apps/dashboard/lib/working-projects/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `buildTitle`, `buildPostContent`, `parseDueDate` (Task 2), `parseAmount` (Task 4), `createRelayThread` (Task 6), Prisma `WorkingProject` (Task 1).
- Produces: `createWorkingProject(input: {source: 'shopee'|'tokopedia'|'manual'; sourceOrderNo?: string; orderNoLegacy?: string; forumChannelId: string; customer: string; contact?: string; platform?: string; product: string; variant?: string; dueDateRaw?: string; notes?: string; invoiceAmountRaw?: string; mentions?: string[]}): Promise<{id: string; threadUrl: string | null; syncState: string}>` — consumed by `app/api/bot/working-projects/route.ts` (Task 10) and `app/api/working-projects/route.ts` (Task 14).

- [ ] **Step 1: Write failing test (mocked prisma + relay client)**

```typescript
import { describe, it, expect, vi } from 'vitest'
vi.mock('../discord-sync', () => ({
  createRelayThread: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workingProject: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))
import { createWorkingProject } from '../service'
import { createRelayThread } from '../discord-sync'
import { prisma } from '@/lib/prisma'

describe('createWorkingProject', () => {
  it('writes DB row first as pending, then syncs to Discord and marks ok', async () => {
    ;(prisma.workingProject.create as any).mockResolvedValue({ id: 'wp1' })
    ;(createRelayThread as any).mockResolvedValue({ threadId: 't1', threadUrl: 'https://discord/t1' })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    const result = await createWorkingProject({
      source: 'manual', forumChannelId: 'FORUM_CINCIN_ID',
      customer: 'Budi', product: 'Cincin', orderNoLegacy: 'ORD-1',
    })

    expect(prisma.workingProject.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncState: 'pending', discordThreadId: null }),
    }))
    expect(createRelayThread).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'wp1' }))
    expect(prisma.workingProject.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wp1' },
      data: expect.objectContaining({ discordThreadId: 't1', syncState: 'ok' }),
    }))
    expect(result).toEqual({ id: 'wp1', threadUrl: 'https://discord/t1', syncState: 'ok' })
  })

  it('marks syncState error but does not throw when the relay call fails', async () => {
    ;(prisma.workingProject.create as any).mockResolvedValue({ id: 'wp2' })
    ;(createRelayThread as any).mockRejectedValue(new Error('discord-relay 403: forbidden_channel'))
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    const result = await createWorkingProject({
      source: 'manual', forumChannelId: 'FORUM_CINCIN_ID', customer: 'Budi', product: 'Cincin',
    })

    expect(prisma.workingProject.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncState: 'error', syncError: expect.stringContaining('forbidden_channel') }),
    }))
    expect(result.threadUrl).toBeNull()
    expect(result.syncState).toBe('error')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import { prisma } from '@/lib/prisma'
import { buildTitle, buildPostContent, parseDueDate, parseAmount } from './format'
import { createRelayThread } from './discord-sync'

export async function createWorkingProject(input: {
  source: 'shopee' | 'tokopedia' | 'manual'
  sourceOrderNo?: string
  orderNoLegacy?: string
  forumChannelId: string
  customer: string
  contact?: string
  platform?: string
  product: string
  variant?: string
  dueDateRaw?: string
  notes?: string
  invoiceAmountRaw?: string
  mentions?: string[]
}): Promise<{ id: string; threadUrl: string | null; syncState: string }> {
  const { dueDate, dueDateRaw } = input.dueDateRaw ? parseDueDate(input.dueDateRaw) : { dueDate: null, dueDateRaw: null }
  const title = buildTitle({ customer: input.customer, product: input.product, variant: input.variant })

  const wp = await prisma.workingProject.create({
    data: {
      source: input.source,
      sourceOrderNo: input.sourceOrderNo ?? null,
      orderNoLegacy: input.orderNoLegacy ?? null,
      syncState: 'pending',
      discordThreadId: null,
      forumChannelId: input.forumChannelId,
      customer: input.customer,
      contact: input.contact ?? null,
      platform: input.platform ?? null,
      product: input.product,
      variant: input.variant ?? null,
      title,
      dueDate,
      dueDateRaw,
      notes: input.notes ?? null,
      invoiceAmount: input.invoiceAmountRaw ? parseAmount(input.invoiceAmountRaw) : 0,
      mentions: input.mentions ?? [],
    },
  })

  const message = buildPostContent({
    customer: input.customer, contact: input.contact, product: input.product, variant: input.variant,
    platform: input.platform, sourceOrderNo: input.sourceOrderNo, orderNoLegacy: input.orderNoLegacy,
    dueDate, dueDateRaw, notes: input.notes,
  })

  try {
    const { threadId, threadUrl } = await createRelayThread({
      parentId: input.forumChannelId, name: title, message,
      mentions: input.mentions ?? [], idempotencyKey: wp.id,
    })
    await prisma.workingProject.update({ where: { id: wp.id }, data: { discordThreadId: threadId, syncState: 'ok' } })
    return { id: wp.id, threadUrl, syncState: 'ok' }
  } catch (err) {
    await prisma.workingProject.update({
      where: { id: wp.id }, data: { syncState: 'error', syncError: (err as Error).message },
    })
    return { id: wp.id, threadUrl: null, syncState: 'error' }
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/working-projects/service.ts apps/dashboard/lib/working-projects/__tests__/service.test.ts
git commit -m "feat(working-projects): add createWorkingProject with write-then-sync ordering"
```

---

### Task 8: `service.ts` — status/done/update/mentions/resync

**Files:**
- Modify: `apps/dashboard/lib/working-projects/service.ts`
- Test: `apps/dashboard/lib/working-projects/__tests__/service.test.ts`

**Interfaces:**
- Consumes: `editRelayThread`, `archiveRelayThread` (Task 6), `appendNoteWithTimestamp`, `parseAmount` (Task 4).
- Produces: `setStatus(threadId: string, status: string, starterMessageContent?: string): Promise<{ok: true; discordSynced: boolean}>`, `markDone(threadId: string): Promise<{ok: true; discordSynced: boolean}>`, `updateWorkingProject(threadId: string, patch: Partial<{dueDateRaw; paymentRaw:string; invoiceAmountRaw:string; paidAmountRaw:string; notesAppend:string; variant:string; customer:string; product:string; shipping:string; trackingNo:string}>): Promise<{ok: true; discordSynced: boolean}>`, `updateMentions(threadId: string, mentions: string[]): Promise<{ok: true; discordSynced: boolean}>`, `resyncWorkingProject(id: string): Promise<{ok: true; discordSynced: boolean}>` — consumed by bot/web routes (Tasks 10-14).

- [ ] **Step 1: Write failing tests**

```typescript
import { setStatus, updateWorkingProject, resyncWorkingProject } from '../service'
import { editRelayThread } from '../discord-sync'

describe('setStatus', () => {
  it('writes Postgres first, then relay; discordSynced:false on relay failure but still ok:true', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', title: 'T' })
    ;(prisma.workingProject.update as any).mockResolvedValue({})
    ;(editRelayThread as any).mockRejectedValue(new Error('discord-relay 500'))

    const result = await setStatus('t1', 'Done')
    expect(prisma.workingProject.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { discordThreadId: 't1' }, data: expect.objectContaining({ status: 'Done' }),
    }))
    expect(result).toEqual({ ok: true, discordSynced: false })
  })
})

describe('updateWorkingProject', () => {
  it('appends notes with timestamp rather than overwriting', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', notes: 'old', title: 'T' })
    ;(prisma.workingProject.update as any).mockResolvedValue({})
    ;(editRelayThread as any).mockResolvedValue(undefined)

    await updateWorkingProject('t1', { notesAppend: 'new info' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.notes).toContain('old')
    expect(call.data.notes).toContain('new info')
  })
})

describe('resyncWorkingProject', () => {
  it('re-pushes current DB state to the relay and clears syncError on success', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', title: 'T', appliedTags: [] })
    ;(editRelayThread as any).mockResolvedValue(undefined)
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    const result = await resyncWorkingProject('wp1')
    expect(result).toEqual({ ok: true, discordSynced: true })
    expect(prisma.workingProject.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncState: 'ok', syncError: null }),
    }))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/service.test.ts`
Expected: FAIL — `setStatus`/`updateWorkingProject`/`resyncWorkingProject` not exported.

- [ ] **Step 3: Implement (append to `service.ts`)**

```typescript
import { editRelayThread, archiveRelayThread } from './discord-sync'
import { appendNoteWithTimestamp, parseAmount, parseDueDate } from './format'

async function syncEditOrError(id: string, threadId: string | null, patch: Parameters<typeof editRelayThread>[1]): Promise<boolean> {
  if (!threadId) return false
  try {
    await editRelayThread(threadId, patch)
    await prisma.workingProject.update({ where: { id }, data: { syncState: 'ok', syncError: null } })
    return true
  } catch (err) {
    await prisma.workingProject.update({ where: { id }, data: { syncState: 'error', syncError: (err as Error).message } })
    return false
  }
}

export async function setStatus(threadId: string, status: string, starterMessageContent?: string): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { status } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, starterMessageContent ? { starterContent: starterMessageContent } : {})
  return { ok: true, discordSynced }
}

export async function markDone(threadId: string): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { status: 'Done' } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, {})
  await archiveRelayThread(threadId).catch(() => {})
  return { ok: true, discordSynced }
}

export async function updateWorkingProject(threadId: string, patch: Partial<{
  dueDateRaw: string; paymentRaw: string; invoiceAmountRaw: string; paidAmountRaw: string
  notesAppend: string; variant: string; customer: string; product: string; shipping: string; trackingNo: string
}>): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  const data: Record<string, unknown> = {}
  if (patch.dueDateRaw !== undefined) Object.assign(data, parseDueDate(patch.dueDateRaw))
  if (patch.paymentRaw !== undefined) data.payment = patch.paymentRaw
  if (patch.invoiceAmountRaw !== undefined) data.invoiceAmount = parseAmount(patch.invoiceAmountRaw)
  if (patch.paidAmountRaw !== undefined) data.paidAmount = parseAmount(patch.paidAmountRaw)
  if (patch.notesAppend !== undefined) data.notes = appendNoteWithTimestamp(wp.notes, patch.notesAppend)
  if (patch.variant !== undefined) data.variant = patch.variant
  if (patch.customer !== undefined) data.customer = patch.customer
  if (patch.product !== undefined) data.product = patch.product
  if (patch.shipping !== undefined) data.shipping = patch.shipping
  if (patch.trackingNo !== undefined) data.trackingNo = patch.trackingNo

  await prisma.workingProject.update({ where: { discordThreadId: threadId }, data })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, {})
  return { ok: true, discordSynced }
}

export async function updateMentions(threadId: string, mentions: string[]): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { mentions } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, { mentions })
  return { ok: true, discordSynced }
}

export async function resyncWorkingProject(id: string): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { id } })
  const discordSynced = await syncEditOrError(id, wp.discordThreadId, {
    name: wp.title, appliedTags: wp.appliedTags, mentions: wp.mentions,
  })
  return { ok: true, discordSynced }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/working-projects/service.ts apps/dashboard/lib/working-projects/__tests__/service.test.ts
git commit -m "feat(working-projects): add status/done/update/mentions/resync service ops"
```

---

### Task 9: `service.ts` — checklist ops

**Files:**
- Modify: `apps/dashboard/lib/working-projects/service.ts`
- Test: `apps/dashboard/lib/working-projects/__tests__/service.test.ts`

**Interfaces:**
- Consumes: canonical checklist item shape (Global Constraints).
- Produces: `runChecklistOp(threadId: string, op: {type:'add'; text:string; addedBy:string} | {type:'check'|'uncheck'|'remove'; id:number; by:string} | {type:'edit'; id:number; text:string} | {type:'copy'; fromThreadId:string} | {type:'setByLabel'; label:string; done:boolean; by:string}): Promise<{ok: true; discordSynced: boolean}>` — consumed by `app/api/bot/working-projects/[threadId]/checklist/route.ts` (Task 12) and `WorkingProjectGLRingTab.tsx` (Task 18, via web route).

- [ ] **Step 1: Write failing tests**

```typescript
describe('runChecklistOp', () => {
  it('allocates the next sequential id over ALL items including soft-deleted', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({
      id: 'wp1', discordThreadId: 't1',
      checklist: [{ id: 1, text: 'a', done: false, deleted: false }, { id: 3, text: 'b', done: false, deleted: true }],
    })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    await runChecklistOp('t1', { type: 'add', text: 'c', addedBy: 'user1' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.checklist.find((i: any) => i.text === 'c').id).toBe(4)
  })

  it('setByLabel matches case-insensitively and updates only the exact label on write', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({
      id: 'wp1', discordThreadId: 't1',
      checklist: [{ id: 1, text: 'Cetak Resin', done: false, deleted: false }],
    })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    await runChecklistOp('t1', { type: 'setByLabel', label: 'cetak resin', done: true, by: 'user1' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.checklist[0].done).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/service.test.ts`
Expected: FAIL — `runChecklistOp` not exported.

- [ ] **Step 3: Implement (append to `service.ts`)**

```typescript
type ChecklistItem = { id: number; text: string; done: boolean; done_at: string | null; done_by: string | null; added_by: string | null; added_at: string; deleted: boolean }

function nextChecklistId(checklist: ChecklistItem[]): number {
  return checklist.length ? Math.max(...checklist.map(i => i.id)) + 1 : 1
}

export async function runChecklistOp(threadId: string, op:
  | { type: 'add'; text: string; addedBy: string }
  | { type: 'check' | 'uncheck' | 'remove'; id: number; by: string }
  | { type: 'edit'; id: number; text: string }
  | { type: 'copy'; fromThreadId: string }
  | { type: 'setByLabel'; label: string; done: boolean; by: string }
): Promise<{ ok: true; discordSynced: boolean }> {
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  const checklist: ChecklistItem[] = wp.checklist as ChecklistItem[]

  if (op.type === 'add') {
    checklist.push({ id: nextChecklistId(checklist), text: op.text, done: false, done_at: null, done_by: null, added_by: op.addedBy, added_at: new Date().toISOString(), deleted: false })
  } else if (op.type === 'check' || op.type === 'uncheck') {
    const item = checklist.find(i => i.id === op.id)
    if (item) { item.done = op.type === 'check'; item.done_at = op.type === 'check' ? new Date().toISOString() : null; item.done_by = op.type === 'check' ? op.by : null }
  } else if (op.type === 'remove') {
    const item = checklist.find(i => i.id === op.id)
    if (item) item.deleted = true
  } else if (op.type === 'edit') {
    const item = checklist.find(i => i.id === op.id)
    if (item) item.text = op.text
  } else if (op.type === 'copy') {
    const source = await prisma.workingProject.findUnique({ where: { discordThreadId: op.fromThreadId } })
    let nextId = nextChecklistId(checklist)
    for (const src of source.checklist as ChecklistItem[]) {
      if (src.deleted) continue
      checklist.push({ ...src, id: nextId++, done: false, done_at: null, done_by: null })
    }
  } else if (op.type === 'setByLabel') {
    const item = checklist.find(i => i.text.toLowerCase() === op.label.toLowerCase())
    if (item) { item.done = op.done; item.done_at = op.done ? new Date().toISOString() : null; item.done_by = op.done ? op.by : null }
  }

  await prisma.workingProject.update({ where: { discordThreadId: threadId }, data: { checklist } })
  const discordSynced = await syncEditOrError(wp.id, wp.discordThreadId, {})
  return { ok: true, discordSynced }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run lib/working-projects/__tests__/service.test.ts`
Expected: PASS (full file green)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/lib/working-projects/service.ts apps/dashboard/lib/working-projects/__tests__/service.test.ts
git commit -m "feat(working-projects): add checklist ops with sequential id allocation and setByLabel"
```

---

### Task 10: Bot-facing `POST /api/bot/working-projects`

**Files:**
- Create: `apps/dashboard/app/api/bot/working-projects/route.ts`
- Test: `apps/dashboard/app/api/bot/working-projects/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `requireBotToken` (`apps/dashboard/lib/bot/auth.ts`), `createWorkingProject` (Task 7), validation/error-shape style from `apps/dashboard/app/api/bot/invoice/route.ts`.
- Produces: `POST` handler returning `{id, threadUrl, syncState}` (201) or `{error}` (400/401).

- [ ] **Step 1: Read the pattern to mirror**

Re-read `apps/dashboard/app/api/bot/invoice/route.ts` for exact validation/error-shape conventions before writing this route.

- [ ] **Step 2: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ createWorkingProject: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => null) }))
import { POST } from '../route'
import { createWorkingProject } from '@/lib/working-projects/service'

function req(body: unknown) {
  return new Request('http://localhost/api/bot/working-projects', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer x' } })
}

describe('POST /api/bot/working-projects', () => {
  it('400s when required fields are missing', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('creates and returns threadUrl on valid input', async () => {
    ;(createWorkingProject as any).mockResolvedValue({ id: 'wp1', threadUrl: 'https://discord/t1', syncState: 'ok' })
    const res = await POST(req({ source: 'manual', forumChannelId: 'FORUM_CINCIN_ID', customer: 'Budi', product: 'Cincin' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.threadUrl).toBe('https://discord/t1')
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run app/api/bot/working-projects/__tests__/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 4: Implement**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { createWorkingProject } from '@/lib/working-projects/service'

export async function POST(req: NextRequest) {
  const authError = requireBotToken(req)
  if (authError) return authError

  const body = await req.json()
  if (!body.source || !body.forumChannelId || !body.customer || !body.product) {
    return NextResponse.json({ error: 'source, forumChannelId, customer, product are required' }, { status: 400 })
  }

  const result = await createWorkingProject(body)
  return NextResponse.json(result, { status: 201 })
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run app/api/bot/working-projects/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app/api/bot/working-projects/route.ts apps/dashboard/app/api/bot/working-projects/__tests__/route.test.ts
git commit -m "feat(working-projects): add bot-facing create endpoint"
```

---

### Task 11: Bot-facing `[threadId]` routes — status/done/tags/mentions/by-thread

**Files:**
- Create: `apps/dashboard/app/api/bot/working-projects/[threadId]/route.ts` (PATCH general update, GET by-thread)
- Create: `apps/dashboard/app/api/bot/working-projects/[threadId]/status/route.ts`
- Create: `apps/dashboard/app/api/bot/working-projects/[threadId]/done/route.ts`
- Create: `apps/dashboard/app/api/bot/working-projects/[threadId]/tags/route.ts`
- Create: `apps/dashboard/app/api/bot/working-projects/[threadId]/mentions/route.ts`
- Test: one `__tests__/route.test.ts` per route file above, same directory.

**Interfaces:**
- Consumes: `setStatus`, `markDone`, `updateWorkingProject`, `updateMentions` (Task 8), `requireBotToken`.
- Produces: 5 route handlers, each `{ok: true, discordSynced: boolean}` on success.

- [ ] **Step 1: Write failing tests (one block per route, same pattern as Task 10)**

```typescript
// app/api/bot/working-projects/[threadId]/status/__tests__/route.test.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ setStatus: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => null) }))
import { PATCH } from '../route'
import { setStatus } from '@/lib/working-projects/service'

describe('PATCH /api/bot/working-projects/[threadId]/status', () => {
  it('400s without a status field', async () => {
    const req = new Request('http://x', { method: 'PATCH', body: JSON.stringify({}) })
    const res = await PATCH(req, { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(400)
  })
  it('delegates to setStatus and returns its result', async () => {
    ;(setStatus as any).mockResolvedValue({ ok: true, discordSynced: true })
    const req = new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'Done' }) })
    const res = await PATCH(req, { params: Promise.resolve({ threadId: 't1' }) })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
    expect(setStatus).toHaveBeenCalledWith('t1', 'Done', undefined)
  })
})
```

Write equivalent tests for `done` (no body required), `tags` (requires `appliedTags` array), `mentions` (requires `mentions` array), and the general `[threadId]/route.ts` (`PATCH` accepts the `updateWorkingProject` patch shape, `GET` returns 404 when not found).

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run "app/api/bot/working-projects/[threadId]/**/__tests__/route.test.ts"`
Expected: FAIL — routes not found.

- [ ] **Step 3: Implement each route**

```typescript
// app/api/bot/working-projects/[threadId]/status/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { setStatus } from '@/lib/working-projects/service'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const { threadId } = await params
  const body = await req.json()
  if (!body.status) return NextResponse.json({ error: 'status is required' }, { status: 400 })
  const result = await setStatus(threadId, body.status, body.starterMessageContent)
  return NextResponse.json(result)
}
```

```typescript
// app/api/bot/working-projects/[threadId]/done/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { markDone } from '@/lib/working-projects/service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const { threadId } = await params
  return NextResponse.json(await markDone(threadId))
}
```

```typescript
// app/api/bot/working-projects/[threadId]/tags/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { prisma } from '@/lib/prisma'
import { buildTitle } from '@/lib/working-projects/format'
import { editRelayThread } from '@/lib/working-projects/discord-sync'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const { threadId } = await params
  const body = await req.json()
  if (!Array.isArray(body.appliedTags)) return NextResponse.json({ error: 'appliedTags array is required' }, { status: 400 })

  const wp = await prisma.workingProject.update({
    where: { discordThreadId: threadId },
    data: { appliedTags: body.appliedTags, forumChannelId: body.parentId ?? undefined },
  })
  const newTitle = body.currentName ? buildTitle({ customer: wp.customer, product: wp.product, variant: wp.variant }) : undefined
  try {
    await editRelayThread(threadId, { appliedTags: body.appliedTags, ...(newTitle && newTitle !== body.currentName ? { name: newTitle } : {}) })
    return NextResponse.json({ ok: true, discordSynced: true })
  } catch {
    return NextResponse.json({ ok: true, discordSynced: false })
  }
}
```

```typescript
// app/api/bot/working-projects/[threadId]/mentions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { updateMentions } from '@/lib/working-projects/service'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const { threadId } = await params
  const body = await req.json()
  if (!Array.isArray(body.mentions)) return NextResponse.json({ error: 'mentions array is required' }, { status: 400 })
  return NextResponse.json(await updateMentions(threadId, body.mentions))
}
```

```typescript
// app/api/bot/working-projects/[threadId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { prisma } from '@/lib/prisma'
import { updateWorkingProject } from '@/lib/working-projects/service'

export async function GET(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const { threadId } = await params
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  if (!wp) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(wp)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const { threadId } = await params
  const body = await req.json()
  return NextResponse.json(await updateWorkingProject(threadId, body))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run "app/api/bot/working-projects/[threadId]/**/__tests__/route.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/dashboard/app/api/bot/working-projects/[threadId]"
git commit -m "feat(working-projects): add bot-facing status/done/tags/mentions/update endpoints"
```

---

### Task 12: Bot-facing checklist + checklist-sources

**Files:**
- Create: `apps/dashboard/app/api/bot/working-projects/[threadId]/checklist/route.ts`
- Create: `apps/dashboard/app/api/bot/working-projects/checklist-sources/route.ts`
- Test: `__tests__/route.test.ts` beside each.

**Interfaces:**
- Consumes: `runChecklistOp` (Task 9), `requireBotToken`.
- Produces: `POST /checklist` `{ok, discordSynced}`; `GET /checklist-sources?q=` returns `{threadId, title, checklist}[]` of active (non-Canceled, non-archived) Working Projects whose title matches `q`.

- [ ] **Step 1: Write failing tests**

```typescript
// [threadId]/checklist/__tests__/route.test.ts
vi.mock('@/lib/working-projects/service', () => ({ runChecklistOp: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => null) }))
import { POST } from '../route'
import { runChecklistOp } from '@/lib/working-projects/service'

describe('POST checklist', () => {
  it('400s on unknown op type', async () => {
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ type: 'bogus' }) })
    const res = await POST(req, { params: Promise.resolve({ threadId: 't1' }) })
    expect(res.status).toBe(400)
  })
  it('delegates known op to runChecklistOp', async () => {
    ;(runChecklistOp as any).mockResolvedValue({ ok: true, discordSynced: true })
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ type: 'add', text: 'x', addedBy: 'u1' }) })
    const res = await POST(req, { params: Promise.resolve({ threadId: 't1' }) })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
  })
})
```

```typescript
// checklist-sources/__tests__/route.test.ts
vi.mock('@/lib/prisma', () => ({ prisma: { workingProject: { findMany: vi.fn() } } }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => null) }))
import { GET } from '../route'
import { prisma } from '@/lib/prisma'

describe('GET checklist-sources', () => {
  it('excludes Canceled projects and filters by q', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([{ discordThreadId: 't1', title: 'Budi - Cincin', checklist: [] }])
    const req = new Request('http://x?q=Budi')
    const res = await GET(req)
    const body = await res.json()
    expect(body[0].title).toBe('Budi - Cincin')
    const args = (prisma.workingProject.findMany as any).mock.calls[0][0]
    expect(args.where.status.not).toBe('Canceled')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run "app/api/bot/working-projects/**/checklist*/__tests__/route.test.ts"`
Expected: FAIL

- [ ] **Step 3: Implement**

```typescript
// [threadId]/checklist/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { runChecklistOp } from '@/lib/working-projects/service'

const VALID_TYPES = ['add', 'check', 'uncheck', 'edit', 'remove', 'copy', 'setByLabel']

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const { threadId } = await params
  const body = await req.json()
  if (!VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }
  return NextResponse.json(await runChecklistOp(threadId, body))
}
```

```typescript
// checklist-sources/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const q = new URL(req.url).searchParams.get('q') ?? ''
  const projects = await prisma.workingProject.findMany({
    where: { status: { not: 'Canceled' }, title: { contains: q, mode: 'insensitive' } },
    select: { discordThreadId: true, title: true, checklist: true },
    take: 20,
  })
  return NextResponse.json(projects)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run "app/api/bot/working-projects/**/checklist*/__tests__/route.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/dashboard/app/api/bot/working-projects/[threadId]/checklist" apps/dashboard/app/api/bot/working-projects/checklist-sources
git commit -m "feat(working-projects): add bot-facing checklist ops and checklist-sources search"
```

---

### Task 13: Bot-facing settings + due-reminders + reminder-sent

**Files:**
- Create: `apps/dashboard/app/api/bot/working-projects/settings/route.ts`
- Create: `apps/dashboard/app/api/bot/working-projects/due-reminders/route.ts`
- Create: `apps/dashboard/app/api/bot/working-projects/[threadId]/reminder-sent/route.ts`
- Test: `__tests__/route.test.ts` beside each.

**Interfaces:**
- Consumes: existing `Config` key/value store pattern used elsewhere in the dashboard for the `workingProjects.reminderSettings` key (grep `lib/config` or equivalent before implementing — mirror its exact get/set API).
- Produces: `GET/PATCH /settings` for `{reminderDays: number[]; defaultMentions: string[]}`; `GET /due-reminders` returns `WorkingProject[]` whose `dueDate` falls within `reminderDays` and whose `remindersSent` doesn't already include that day-offset; `POST /[threadId]/reminder-sent` appends a day-offset to `remindersSent`.

- [ ] **Step 1: Locate the existing Config pattern**

Run: `cd apps/dashboard && grep -rn "Config" lib/ --include=*.ts -l | head -5` and read the matching file to find the get/set helper signature (e.g. `getConfig(key)`/`setConfig(key, value)`).

- [ ] **Step 2: Write failing tests**

```typescript
// settings/__tests__/route.test.ts
vi.mock('@/lib/config', () => ({ getConfig: vi.fn(), setConfig: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => null) }))
import { GET, PATCH } from '../route'
import { getConfig, setConfig } from '@/lib/config'

describe('GET/PATCH settings', () => {
  it('GET returns defaults when unset', async () => {
    ;(getConfig as any).mockResolvedValue(null)
    const res = await GET(new Request('http://x'))
    expect(await res.json()).toEqual({ reminderDays: [3, 1], defaultMentions: [] })
  })
  it('PATCH persists via setConfig', async () => {
    const req = new Request('http://x', { method: 'PATCH', body: JSON.stringify({ reminderDays: [7], defaultMentions: ['123'] }) })
    await PATCH(req)
    expect(setConfig).toHaveBeenCalledWith('workingProjects.reminderSettings', { reminderDays: [7], defaultMentions: ['123'] })
  })
})
```

```typescript
// due-reminders/__tests__/route.test.ts
vi.mock('@/lib/prisma', () => ({ prisma: { workingProject: { findMany: vi.fn() } } }))
vi.mock('@/lib/config', () => ({ getConfig: vi.fn().mockResolvedValue({ reminderDays: [3, 1] }) }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => null) }))
import { GET } from '../route'
import { prisma } from '@/lib/prisma'

describe('GET due-reminders', () => {
  it('returns projects with a due date not yet reminded at any configured offset', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([{ id: 'wp1', dueDate: new Date(), remindersSent: [] }])
    const res = await GET(new Request('http://x'))
    expect((await res.json())).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run "app/api/bot/working-projects/{settings,due-reminders,[threadId]/reminder-sent}/__tests__/route.test.ts"`
Expected: FAIL

- [ ] **Step 4: Implement**

```typescript
// settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { getConfig, setConfig } from '@/lib/config'

const KEY = 'workingProjects.reminderSettings'
const DEFAULTS = { reminderDays: [3, 1], defaultMentions: [] as string[] }

export async function GET(req: NextRequest) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const stored = await getConfig(KEY)
  return NextResponse.json(stored ?? DEFAULTS)
}

export async function PATCH(req: NextRequest) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const body = await req.json()
  await setConfig(KEY, body)
  return NextResponse.json({ ok: true })
}
```

```typescript
// due-reminders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { prisma } from '@/lib/prisma'
import { getConfig } from '@/lib/config'

export async function GET(req: NextRequest) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const settings = (await getConfig('workingProjects.reminderSettings')) ?? { reminderDays: [3, 1] }
  const maxDays = Math.max(...settings.reminderDays)
  const cutoff = new Date(Date.now() + maxDays * 86400000)
  const candidates = await prisma.workingProject.findMany({
    where: { dueDate: { not: null, lte: cutoff }, status: { notIn: ['Done', 'Canceled'] } },
  })
  const due = candidates.filter(wp => {
    const daysLeft = Math.ceil((wp.dueDate!.getTime() - Date.now()) / 86400000)
    return settings.reminderDays.includes(daysLeft) && !wp.remindersSent.includes(daysLeft)
  })
  return NextResponse.json(due)
}
```

```typescript
// [threadId]/reminder-sent/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireBotToken } from '@/lib/bot/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const authError = requireBotToken(req)
  if (authError) return authError
  const { threadId } = await params
  const { daysLeft } = await req.json()
  const wp = await prisma.workingProject.findUnique({ where: { discordThreadId: threadId } })
  await prisma.workingProject.update({
    where: { discordThreadId: threadId },
    data: { remindersSent: Array.from(new Set([...wp.remindersSent, daysLeft])) },
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run "app/api/bot/working-projects/{settings,due-reminders,[threadId]/reminder-sent}/__tests__/route.test.ts"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app/api/bot/working-projects/settings apps/dashboard/app/api/bot/working-projects/due-reminders "apps/dashboard/app/api/bot/working-projects/[threadId]/reminder-sent"
git commit -m "feat(working-projects): add reminder settings and due-reminders bot endpoints"
```

---

### Task 14: Web-facing CRUD + resync

**Files:**
- Create: `apps/dashboard/app/api/working-projects/route.ts` (GET list, POST create — session-authenticated)
- Create: `apps/dashboard/app/api/working-projects/[id]/route.ts` (PATCH, DELETE)
- Create: `apps/dashboard/app/api/working-projects/[id]/resync/route.ts` (POST)
- Test: `__tests__/route.test.ts` beside each.

**Interfaces:**
- Consumes: existing session-auth helper used by other web-facing dashboard routes (grep `app/api/tokopedia/orders/route.ts` or similar for the exact `getServerSession`/`auth()` pattern before implementing), `createWorkingProject`, `updateWorkingProject`, `resyncWorkingProject` (Tasks 7-9).
- Produces: `GET /api/working-projects` → `WorkingProject[]`; `POST` → same shape as bot create; `PATCH/DELETE /api/working-projects/:id`; `POST /api/working-projects/:id/resync`.

- [ ] **Step 1: Locate the session-auth pattern**

Run: `cd apps/dashboard && grep -rn "getServerSession\|auth()" app/api/tokopedia --include=*.ts | head -5` and mirror its exact 401 response shape.

- [ ] **Step 2: Write failing tests**

```typescript
// route.test.ts (list/create)
vi.mock('@/lib/prisma', () => ({ prisma: { workingProject: { findMany: vi.fn() } } }))
vi.mock('@/lib/working-projects/service', () => ({ createWorkingProject: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(() => null) }))
import { GET, POST } from '../route'
import { prisma } from '@/lib/prisma'

describe('GET /api/working-projects', () => {
  it('lists all working projects', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([{ id: 'wp1' }])
    const res = await GET(new Request('http://x'))
    expect(await res.json()).toEqual([{ id: 'wp1' }])
  })
})
```

```typescript
// [id]/route.test.ts
vi.mock('@/lib/prisma', () => ({ prisma: { workingProject: { delete: vi.fn() } } }))
vi.mock('@/lib/working-projects/service', () => ({ updateWorkingProject: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(() => null) }))
import { DELETE } from '../route'
import { prisma } from '@/lib/prisma'

describe('DELETE /api/working-projects/:id', () => {
  it('deletes by id', async () => {
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(prisma.workingProject.delete).toHaveBeenCalledWith({ where: { id: 'wp1' } })
    expect(res.status).toBe(200)
  })
})
```

```typescript
// resync/route.test.ts
vi.mock('@/lib/working-projects/service', () => ({ resyncWorkingProject: vi.fn() }))
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(() => null) }))
import { POST } from '../route'
import { resyncWorkingProject } from '@/lib/working-projects/service'

describe('POST resync', () => {
  it('delegates to resyncWorkingProject', async () => {
    ;(resyncWorkingProject as any).mockResolvedValue({ ok: true, discordSynced: true })
    const res = await POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'wp1' }) })
    expect(await res.json()).toEqual({ ok: true, discordSynced: true })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run app/api/working-projects`
Expected: FAIL

- [ ] **Step 4: Implement**

```typescript
// app/api/working-projects/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createWorkingProject } from '@/lib/working-projects/service'

export async function GET(req: NextRequest) {
  const authError = requireSession(req)
  if (authError) return authError
  const projects = await prisma.workingProject.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(projects)
}

export async function POST(req: NextRequest) {
  const authError = requireSession(req)
  if (authError) return authError
  const body = await req.json()
  const result = await createWorkingProject(body)
  return NextResponse.json(result, { status: 201 })
}
```

```typescript
// app/api/working-projects/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateWorkingProject } from '@/lib/working-projects/service'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireSession(req)
  if (authError) return authError
  const { id } = await params
  const wp = await prisma.workingProject.findUnique({ where: { id } })
  const body = await req.json()
  const result = await updateWorkingProject(wp!.discordThreadId!, body)
  return NextResponse.json(result)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireSession(req)
  if (authError) return authError
  const { id } = await params
  await prisma.workingProject.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

```typescript
// app/api/working-projects/[id]/resync/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { resyncWorkingProject } from '@/lib/working-projects/service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireSession(req)
  if (authError) return authError
  const { id } = await params
  return NextResponse.json(await resyncWorkingProject(id))
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run app/api/working-projects`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/app/api/working-projects
git commit -m "feat(working-projects): add web-facing CRUD and resync endpoints"
```

---

### Task 14b: Web-facing `detail-source` (live marketplace detail passthrough)

**Files:**
- Create: `apps/dashboard/app/api/working-projects/[id]/detail-source/route.ts`
- Test: `__tests__/route.test.ts` beside it.

**Interfaces:**
- Consumes: existing Shopee/Tokopedia order-detail lookup functions already used elsewhere in the dashboard (grep `lib/shopee` / `lib/tokopedia` for the existing `getOrderDetail`/`fetchOrderById`-equivalent used by the current UI order-detail expand — reuse it, do not re-implement).
- Produces: `GET /api/working-projects/:id/detail-source` → live marketplace detail JSON when `wp.source` is `shopee`/`tokopedia` and `sourceOrderNo` is set, `{error: 'no_source'}` (404) otherwise.

- [ ] **Step 1: Locate the existing detail-lookup functions**

Run: `cd apps/dashboard && grep -rln "shopee/order/\|tokopedia/order/" lib/ | head -5` and read the matched file(s) to get the exact exported function names/signatures.

- [ ] **Step 2: Write failing test**

```typescript
vi.mock('@/lib/prisma', () => ({ prisma: { workingProject: { findUnique: vi.fn() } } }))
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(() => null) }))
vi.mock('@/lib/shopee/orders', () => ({ getShopeeOrderDetail: vi.fn() }))
vi.mock('@/lib/tokopedia/orders', () => ({ getTokopediaOrderDetail: vi.fn() }))
import { GET } from '../route'
import { prisma } from '@/lib/prisma'
import { getShopeeOrderDetail } from '@/lib/shopee/orders'

describe('GET detail-source', () => {
  it('404s when the project has no sourceOrderNo', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ source: 'manual', sourceOrderNo: null })
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'wp1' }) })
    expect(res.status).toBe(404)
  })
  it('fetches live Shopee detail when source is shopee', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ source: 'shopee', sourceOrderNo: 'SN1' })
    ;(getShopeeOrderDetail as any).mockResolvedValue({ orderSn: 'SN1' })
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: 'wp1' }) })
    expect(await res.json()).toEqual({ orderSn: 'SN1' })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run "app/api/working-projects/[id]/detail-source/__tests__/route.test.ts"`
Expected: FAIL

- [ ] **Step 4: Implement**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getShopeeOrderDetail } from '@/lib/shopee/orders'
import { getTokopediaOrderDetail } from '@/lib/tokopedia/orders'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireSession(req)
  if (authError) return authError
  const { id } = await params
  const wp = await prisma.workingProject.findUnique({ where: { id } })
  if (!wp?.sourceOrderNo) return NextResponse.json({ error: 'no_source' }, { status: 404 })

  if (wp.source === 'shopee') return NextResponse.json(await getShopeeOrderDetail(wp.sourceOrderNo))
  if (wp.source === 'tokopedia') return NextResponse.json(await getTokopediaOrderDetail(wp.sourceOrderNo))
  return NextResponse.json({ error: 'no_source' }, { status: 404 })
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run "app/api/working-projects/[id]/detail-source/__tests__/route.test.ts"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "apps/dashboard/app/api/working-projects/[id]/detail-source"
git commit -m "feat(working-projects): add live marketplace detail-source passthrough endpoint"
```

---

### Task 15: `scripts/migrate-working-projects.ts`

**Files:**
- Create: `apps/dashboard/scripts/migrate-working-projects.ts`
- Test: `apps/dashboard/scripts/__tests__/migrate-working-projects.test.ts`

**Interfaces:**
- Consumes: `parseDueDate` (Task 2), a JSON export file produced by the Plan B `scripts/export-orders.mjs` (shape: `{orders: Array<{order_no, platform, customer, contact, product, variant, due_date, order_date, notes, shipping, tracking_no, payment, invoice_amount, paid_amount, checklist, thread_id, status}>}`).
- Produces: `migrateWorkingProjects(exportPath: string): Promise<{imported: number; skipped: number; warnings: string[]}>`, invoked as a CLI script in Plan B step 5 (`node scripts/migrate-working-projects.ts export.json`).

- [ ] **Step 1: Write failing tests using fixture files**

```typescript
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('@/lib/prisma', () => ({ prisma: { workingProject: { create: vi.fn() } } }))
import { migrateWorkingProjects } from '../migrate-working-projects'
import { prisma } from '@/lib/prisma'

function writeFixture(orders: unknown[]) {
  const file = path.join(os.tmpdir(), `wp-export-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify({ orders }))
  return file
}

describe('migrateWorkingProjects', () => {
  it('derives sourceOrderNo for a Shopee-shaped order_no and leaves orderNoLegacy null', async () => {
    const file = writeFixture([{ order_no: '260101ABCDEF12', platform: 'Shopee', customer: 'Budi', product: 'Cincin', checklist: [] }])
    await migrateWorkingProjects(file)
    const data = (prisma.workingProject.create as any).mock.calls[0][0].data
    expect(data.sourceOrderNo).toBe('260101ABCDEF12')
    expect(data.orderNoLegacy).toBeNull()
    expect(data.source).toBe('shopee')
  })

  it('treats a free-text order_no on a manual platform as orderNoLegacy only', async () => {
    const file = writeFixture([{ order_no: 'catatan bebas', platform: 'Manual', customer: 'Budi', product: 'Cincin', checklist: [] }])
    await migrateWorkingProjects(file)
    const data = (prisma.workingProject.create as any).mock.calls[0][0].data
    expect(data.orderNoLegacy).toBe('catatan bebas')
    expect(data.sourceOrderNo).toBeNull()
    expect(data.source).toBe('manual')
  })

  it('falls back to dueDateRaw for an unparseable legacy due_date', async () => {
    const file = writeFixture([{ order_no: '1', platform: 'Manual', customer: 'B', product: 'P', due_date: 'akhir bulan', checklist: [] }])
    await migrateWorkingProjects(file)
    const data = (prisma.workingProject.create as any).mock.calls[0][0].data
    expect(data.dueDate).toBeNull()
    expect(data.dueDateRaw).toBe('akhir bulan')
  })

  it('assigns sequential ids to checklist items missing an id', async () => {
    const file = writeFixture([{ order_no: '1', platform: 'Manual', customer: 'B', product: 'P', checklist: [{ text: 'a', done: false }, { text: 'b', done: true }] }])
    await migrateWorkingProjects(file)
    const data = (prisma.workingProject.create as any).mock.calls[0][0].data
    expect(data.checklist.map((i: any) => i.id)).toEqual([1, 2])
  })

  it('reports a warning and skips a row with no customer or product', async () => {
    const file = writeFixture([{ order_no: '1', platform: 'Manual', checklist: [] }])
    const result = await migrateWorkingProjects(file)
    expect(result.skipped).toBe(1)
    expect(result.warnings[0]).toMatch(/missing customer\/product/)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run scripts/__tests__/migrate-working-projects.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import fs from 'node:fs'
import { prisma } from '@/lib/prisma'
import { parseDueDate, buildTitle } from '@/lib/working-projects/format'

const SHOPEE_ORDER_NO = /^\d{6}[A-Z0-9]{8,}$/
const TOKOPEDIA_ORDER_NO = /^INV\/|^\d{16,}$/

function derivePlatformFields(order: { order_no?: string; platform?: string }): {
  source: 'shopee' | 'tokopedia' | 'manual'; sourceOrderNo: string | null; orderNoLegacy: string | null
} {
  const platform = (order.platform ?? '').toLowerCase()
  const orderNo = order.order_no ?? ''
  if (platform === 'shopee' && SHOPEE_ORDER_NO.test(orderNo)) {
    return { source: 'shopee', sourceOrderNo: orderNo, orderNoLegacy: null }
  }
  if (platform === 'tokopedia' && TOKOPEDIA_ORDER_NO.test(orderNo)) {
    return { source: 'tokopedia', sourceOrderNo: orderNo, orderNoLegacy: null }
  }
  return { source: 'manual', sourceOrderNo: null, orderNoLegacy: orderNo || null }
}

export async function migrateWorkingProjects(exportPath: string): Promise<{ imported: number; skipped: number; warnings: string[] }> {
  const { orders } = JSON.parse(fs.readFileSync(exportPath, 'utf-8'))
  const warnings: string[] = []
  let imported = 0
  let skipped = 0

  for (const order of orders) {
    if (!order.customer || !order.product) {
      warnings.push(`skipped order_no=${order.order_no}: missing customer/product`)
      skipped++
      continue
    }

    const { source, sourceOrderNo, orderNoLegacy } = derivePlatformFields(order)
    const { dueDate, dueDateRaw } = parseDueDate(order.due_date ?? '')
    const checklist = (order.checklist ?? []).map((item: any, idx: number) => ({
      id: item.id ?? idx + 1,
      text: item.text,
      done: !!item.done,
      done_at: item.done_at ?? null,
      done_by: item.done_by ?? null,
      added_by: item.added_by ?? null,
      added_at: item.added_at ?? new Date().toISOString(),
      deleted: !!item.deleted,
    }))

    await prisma.workingProject.create({
      data: {
        discordThreadId: order.thread_id ?? null,
        forumChannelId: null,
        source, sourceOrderNo, orderNoLegacy,
        customer: order.customer,
        contact: order.contact ?? null,
        platform: order.platform ?? null,
        product: order.product,
        variant: order.variant ?? null,
        title: buildTitle({ customer: order.customer, product: order.product, variant: order.variant }),
        status: order.status ?? 'Open',
        payment: order.payment ?? 'Belum',
        orderDate: order.order_date ? new Date(order.order_date) : null,
        dueDate, dueDateRaw,
        invoiceAmount: order.invoice_amount ?? 0,
        paidAmount: order.paid_amount ?? 0,
        notes: order.notes ?? null,
        shipping: order.shipping ?? null,
        trackingNo: order.tracking_no ?? null,
        checklist,
      },
    })
    imported++
  }

  return { imported, skipped, warnings }
}

if (require.main === module) {
  const exportPath = process.argv[2]
  if (!exportPath) { console.error('Usage: migrate-working-projects.ts <export.json>'); process.exit(1) }
  migrateWorkingProjects(exportPath).then(result => console.log(JSON.stringify(result, null, 2)))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run scripts/__tests__/migrate-working-projects.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/scripts/migrate-working-projects.ts apps/dashboard/scripts/__tests__/migrate-working-projects.test.ts
git commit -m "feat(working-projects): add one-shot SQLite-export-to-Postgres migration script"
```

---

### Task 16: `OrderSidebar` — add `working-project` channel entry

**Files:**
- Modify: `apps/dashboard/components/order/OrderSidebar.tsx`
- Test: `apps/dashboard/components/order/__tests__/OrderSidebar.test.tsx`

**Interfaces:**
- Consumes: existing `OrderChannel` type and `ITEMS` array (read in full before editing).
- Produces: `OrderChannel` extended with `'working-project'`; `ITEMS` with a new first entry `{id: 'working-project', label: 'Working Project', icon: ...}` — consumed by `order/page.tsx` (Task 17).

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { OrderSidebar } from '../OrderSidebar'

describe('OrderSidebar', () => {
  it('renders Working Project as the first channel item, above Shopee', () => {
    render(<OrderSidebar activeChannel="shopee" onSelect={vi.fn()} />)
    const items = screen.getAllByRole('button')
    expect(items[0]).toHaveTextContent('Working Project')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run components/order/__tests__/OrderSidebar.test.tsx`
Expected: FAIL — "Working Project" not found as first item.

- [ ] **Step 3: Implement**

Add `'working-project'` to the `OrderChannel` union type, and prepend to `ITEMS`:

```tsx
export type OrderChannel = 'working-project' | 'shopee' | 'tokopedia' /* ...rest unchanged */

const ITEMS: { id: OrderChannel; label: string; icon: React.ReactNode }[] = [
  { id: 'working-project', label: 'Working Project', icon: <ClipboardListIcon /> },
  // ...existing entries unchanged
]
```

(Implementer note: import whichever icon component this file already uses for other items — match the existing icon library, e.g. `lucide-react`'s `ClipboardList`.)

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run components/order/__tests__/OrderSidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/order/OrderSidebar.tsx apps/dashboard/components/order/__tests__/OrderSidebar.test.tsx
git commit -m "feat(working-projects): add Working Project as first OrderSidebar channel"
```

---

### Task 17: `order/page.tsx` — wire `working-project` channel + `tab=` routing + default channel

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/order/page.tsx`
- Test: `apps/dashboard/app/(dashboard)/order/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `OrderChannel` (Task 16), `WorkingProjectOrdersTab`/`WorkingProjectTimelineTab`/`WorkingProjectGLRingTab` (Tasks 18-20, stub-rendered here first with placeholder content that Tasks 18-20 replace — see Step 3 note).
- Produces: `VALID_CHANNELS` includes `'working-project'` and is the default when no `channel` param is present; `?channel=working-project&tab=orders|green-lantern-ring|timeline` routes to the matching tab; `setChannel()` now clears `tab` when switching to a channel that doesn't own the incoming tab value (fixing the pre-existing quirk noted during exploration).

- [ ] **Step 1: Write failing tests**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import OrderPage from '../page'

function withParams(search: string) {
  Object.defineProperty(window, 'location', { value: new URL(`http://x/order${search}`), writable: true })
}

describe('OrderPage channel/tab routing', () => {
  it('defaults to the working-project channel with no query params', () => {
    withParams('')
    render(<OrderPage />)
    expect(screen.getByTestId('working-project-channel')).toBeInTheDocument()
  })

  it('renders the green-lantern-ring tab from ?channel=working-project&tab=green-lantern-ring', () => {
    withParams('?channel=working-project&tab=green-lantern-ring')
    render(<OrderPage />)
    expect(screen.getByTestId('wp-tab-green-lantern-ring')).toBeInTheDocument()
  })

  it('clears an incompatible tab param when switching away from working-project', () => {
    withParams('?channel=working-project&tab=timeline')
    render(<OrderPage />)
    // simulate switching channel via sidebar click — asserted at the setChannel() unit level below
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run "app/(dashboard)/order/__tests__/page.test.tsx"`
Expected: FAIL — no `working-project-channel`/`wp-tab-*` test ids yet.

- [ ] **Step 3: Implement**

Add `'working-project'` to `VALID_CHANNELS` as the array's first entry (making it `?? 'working-project'` in the default-channel fallback instead of `'shopee'`). Inside the channel-switch render block, add:

```tsx
{channel === 'working-project' && (
  <div data-testid="working-project-channel">
    <WorkingProjectTabs tab={tab} onTabChange={setTab} />
    {tab === 'orders' && <div data-testid="wp-tab-orders"><WorkingProjectOrdersTab /></div>}
    {tab === 'green-lantern-ring' && <div data-testid="wp-tab-green-lantern-ring"><WorkingProjectGLRingTab /></div>}
    {tab === 'timeline' && <div data-testid="wp-tab-timeline"><WorkingProjectTimelineTab /></div>}
    {!tab && <div data-testid="wp-tab-orders"><WorkingProjectOrdersTab /></div>}
  </div>
)}
```

Update `setChannel()`:

```tsx
function setChannel(next: OrderChannel) {
  const params = new URLSearchParams(window.location.search)
  params.set('channel', next)
  if (next !== 'working-project') params.delete('tab')
  router.push(`/order?${params.toString()}`)
}
```

(Implementer note: `WorkingProjectOrdersTab`/`WorkingProjectTimelineTab`/`WorkingProjectGLRingTab` are created in Tasks 18-20; import them here with minimal placeholder bodies now — `export function WorkingProjectOrdersTab() { return <div /> }` etc. in their own files — so this task's tests compile and pass before those tabs have real content. Task 18 replaces the placeholder body, not this task's import wiring.)

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run "app/(dashboard)/order/__tests__/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/dashboard/app/(dashboard)/order/page.tsx" "apps/dashboard/app/(dashboard)/order/__tests__/page.test.tsx" apps/dashboard/components/order/WorkingProjectOrdersTab.tsx apps/dashboard/components/order/WorkingProjectTimelineTab.tsx apps/dashboard/components/order/WorkingProjectGLRingTab.tsx
git commit -m "feat(working-projects): wire working-project channel and tab query-param routing into /order"
```

---

### Task 18: `WorkingProjectOrdersTab` — `tab=orders` table

**Files:**
- Modify: `apps/dashboard/components/order/WorkingProjectOrdersTab.tsx`
- Test: `apps/dashboard/components/order/__tests__/WorkingProjectOrdersTab.test.tsx`

**Interfaces:**
- Consumes: `GET /api/working-projects` (Task 14), a data-fetching hook following this repo's existing `lib/hooks/use-tokopedia.ts` pattern (create `lib/hooks/use-working-projects.ts` alongside this task if that hook doesn't yet exist — read `use-tokopedia.ts` first to match its exact shape).
- Produces: a table with columns, in order: Customer/Contact, Produk, Variant, Platform, No. Order, Due Date, Status, Payment, Nominal, Checklist, Discord — consumed by `order/page.tsx` (already wired in Task 17).

- [ ] **Step 1: Read the hook pattern to mirror**

Read `apps/dashboard/lib/hooks/use-tokopedia.ts` in full for its exact SWR/fetch/loading-state shape before creating `use-working-projects.ts`.

- [ ] **Step 2: Write failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/hooks/use-working-projects', () => ({
  useWorkingProjects: () => ({
    data: [{
      id: 'wp1', customer: 'Budi', contact: '0812', product: 'Cincin', variant: 'Emas',
      platform: 'Shopee', sourceOrderNo: 'SN1', orderNoLegacy: null, dueDate: '2026-09-20',
      status: 'Open', payment: 'Marketplace', invoiceAmount: 150000,
      checklist: [{ id: 1, text: 'a', done: true, deleted: false }],
      discordThreadId: 't1',
    }],
    isLoading: false,
  }),
}))
import { WorkingProjectOrdersTab } from '../WorkingProjectOrdersTab'

describe('WorkingProjectOrdersTab', () => {
  it('renders exactly the legacy column set in order', () => {
    render(<WorkingProjectOrdersTab />)
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual([
      'Customer/Contact', 'Produk', 'Variant', 'Platform', 'No. Order',
      'Due Date', 'Status', 'Payment', 'Nominal', 'Checklist', 'Discord',
    ])
  })
  it('prefers sourceOrderNo over orderNoLegacy for the No. Order column', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getByText('SN1')).toBeInTheDocument()
  })
  it('shows checklist progress as done/total', () => {
    render(<WorkingProjectOrdersTab />)
    expect(screen.getByText('1/1')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run components/order/__tests__/WorkingProjectOrdersTab.test.tsx`
Expected: FAIL — placeholder `<div />` has no columns.

- [ ] **Step 4: Implement**

```tsx
'use client'
import { useWorkingProjects } from '@/lib/hooks/use-working-projects'

const COLUMNS = ['Customer/Contact', 'Produk', 'Variant', 'Platform', 'No. Order', 'Due Date', 'Status', 'Payment', 'Nominal', 'Checklist', 'Discord']

export function WorkingProjectOrdersTab() {
  const { data, isLoading } = useWorkingProjects()
  if (isLoading) return <div>Loading...</div>

  return (
    <table>
      <thead>
        <tr>{COLUMNS.map(c => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {data?.map(wp => {
          const active = (wp.checklist as any[]).filter(i => !i.deleted)
          const done = active.filter(i => i.done).length
          return (
            <tr key={wp.id}>
              <td>{wp.customer}{wp.contact ? ` (${wp.contact})` : ''}</td>
              <td>{wp.product}</td>
              <td>{wp.variant ?? '-'}</td>
              <td>{wp.platform ?? '-'}</td>
              <td>{wp.sourceOrderNo ?? wp.orderNoLegacy ?? '-'}</td>
              <td>{wp.dueDate ? new Date(wp.dueDate).toLocaleDateString('id-ID') : (wp.dueDateRaw ?? '-')}</td>
              <td>{wp.status}</td>
              <td>{wp.payment}</td>
              <td>Rp{wp.invoiceAmount.toLocaleString('id-ID')}</td>
              <td>{`${done}/${active.length}`}</td>
              <td>{wp.discordThreadId ? <a href={`https://discord.com/channels/@me/${wp.discordThreadId}`}>Buka</a> : '-'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run components/order/__tests__/WorkingProjectOrdersTab.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/components/order/WorkingProjectOrdersTab.tsx apps/dashboard/components/order/__tests__/WorkingProjectOrdersTab.test.tsx apps/dashboard/lib/hooks/use-working-projects.ts
git commit -m "feat(working-projects): implement tab=orders table with legacy column parity"
```

---

### Task 19: `WorkingProjectTimelineTab` — `tab=timeline`

**Files:**
- Modify: `apps/dashboard/components/order/WorkingProjectTimelineTab.tsx`
- Test: `apps/dashboard/components/order/__tests__/WorkingProjectTimelineTab.test.tsx`

**Interfaces:**
- Consumes: `useWorkingProjects` (Task 18).
- Produces: a chronological list grouped by `dueDate` (nulls/`dueDateRaw`-only entries in an "Tanpa Tanggal" group at the end), each entry showing title/status/due date.

- [ ] **Step 1: Write failing test**

```tsx
vi.mock('@/lib/hooks/use-working-projects', () => ({
  useWorkingProjects: () => ({
    data: [
      { id: 'wp1', title: 'Budi - Cincin', dueDate: '2026-09-20', status: 'Open' },
      { id: 'wp2', title: 'Ani - Topeng', dueDate: null, dueDateRaw: 'akhir bulan', status: 'Proses' },
    ],
    isLoading: false,
  }),
}))
import { render, screen } from '@testing-library/react'
import { WorkingProjectTimelineTab } from '../WorkingProjectTimelineTab'

describe('WorkingProjectTimelineTab', () => {
  it('groups entries with no parsed due date under Tanpa Tanggal', () => {
    render(<WorkingProjectTimelineTab />)
    expect(screen.getByText('Tanpa Tanggal')).toBeInTheDocument()
    expect(screen.getByText('Ani - Topeng')).toBeInTheDocument()
  })
  it('shows dated entries under their due date', () => {
    render(<WorkingProjectTimelineTab />)
    expect(screen.getByText('Budi - Cincin')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run components/order/__tests__/WorkingProjectTimelineTab.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

```tsx
'use client'
import { useWorkingProjects } from '@/lib/hooks/use-working-projects'

export function WorkingProjectTimelineTab() {
  const { data, isLoading } = useWorkingProjects()
  if (isLoading) return <div>Loading...</div>

  const dated = (data ?? []).filter(wp => wp.dueDate).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
  const undated = (data ?? []).filter(wp => !wp.dueDate)

  return (
    <div>
      {dated.map(wp => (
        <div key={wp.id}>
          <strong>{new Date(wp.dueDate!).toLocaleDateString('id-ID')}</strong> — {wp.title} ({wp.status})
        </div>
      ))}
      {undated.length > 0 && (
        <div>
          <h4>Tanpa Tanggal</h4>
          {undated.map(wp => (
            <div key={wp.id}>{wp.title} ({wp.status}){wp.dueDateRaw ? ` — ${wp.dueDateRaw}` : ''}</div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run components/order/__tests__/WorkingProjectTimelineTab.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/order/WorkingProjectTimelineTab.tsx apps/dashboard/components/order/__tests__/WorkingProjectTimelineTab.test.tsx
git commit -m "feat(working-projects): implement tab=timeline grouped view"
```

---

### Task 20: `WorkingProjectGLRingTab` — `tab=green-lantern-ring` (full parity)

**Files:**
- Modify: `apps/dashboard/components/order/WorkingProjectGLRingTab.tsx`
- Test: `apps/dashboard/components/order/__tests__/WorkingProjectGLRingTab.test.tsx`

**Interfaces:**
- Consumes: `useWorkingProjects` (Task 18), `splitProductVariants`, `variantShort`, `parseSize`, `SIZE_SCALE`, `isGLRing` (Task 3).
- Produces: one row per ring variant, per-variant size column, stat pills, multi-sort (up to 3 columns), 5 filter dimensions, `Canceled` rows excluded.

- [ ] **Step 1: Write failing tests**

```tsx
vi.mock('@/lib/hooks/use-working-projects', () => ({
  useWorkingProjects: () => ({
    data: [
      { id: 'wp1', customer: 'Budi', product: 'Cincin A, Cincin B', notes: 'size US 8 | catatan', status: 'Open', forumChannelId: 'FORUM_CINCIN_ID', appliedTags: [], checklist: [] },
      { id: 'wp2', customer: 'Ani', product: 'Cincin C', notes: 'size US 6', status: 'Canceled', forumChannelId: 'FORUM_CINCIN_ID', appliedTags: [], checklist: [] },
    ],
    isLoading: false,
  }),
}))
import { render, screen } from '@testing-library/react'
import { WorkingProjectGLRingTab } from '../WorkingProjectGLRingTab'

describe('WorkingProjectGLRingTab', () => {
  it('renders one row per ring variant, splitting comma-joined product names', () => {
    render(<WorkingProjectGLRingTab />)
    expect(screen.getByText('Cincin A')).toBeInTheDocument()
    expect(screen.getByText('Cincin B')).toBeInTheDocument()
  })
  it('excludes Canceled projects entirely', () => {
    render(<WorkingProjectGLRingTab />)
    expect(screen.queryByText('Cincin C')).not.toBeInTheDocument()
  })
  it('shows the parsed US size and scale percentage', () => {
    render(<WorkingProjectGLRingTab />)
    expect(screen.getByText(/US 8/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run components/order/__tests__/WorkingProjectGLRingTab.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement**

```tsx
'use client'
import { useState, useMemo } from 'react'
import { useWorkingProjects } from '@/lib/hooks/use-working-projects'
import { splitProductVariants, variantShort, parseSize, isGLRing } from '@/lib/working-projects/format'

type SortKey = 'customer' | 'variant' | 'size' | 'status'

export function WorkingProjectGLRingTab() {
  const { data, isLoading } = useWorkingProjects()
  const [sortKeys, setSortKeys] = useState<SortKey[]>(['customer'])
  const [filters, setFilters] = useState<{ status?: string; hasSize?: boolean; checklistDone?: boolean; platform?: string; customer?: string }>({})

  const rows = useMemo(() => {
    const active = (data ?? []).filter(wp => wp.status !== 'Canceled' && isGLRing(wp.appliedTags ?? [], wp.forumChannelId))
    const expanded = active.flatMap(wp =>
      splitProductVariants(wp.product).map(variant => {
        const { usSize, scalePct } = parseSize(wp.notes ?? '')
        return { wpId: wp.id, customer: wp.customer, variant, variantLabel: variantShort(variant), usSize, scalePct, status: wp.status, checklist: wp.checklist }
      })
    )
    let sorted = expanded
    for (const key of [...sortKeys].reverse()) {
      sorted = [...sorted].sort((a, b) => String((a as any)[key] ?? '').localeCompare(String((b as any)[key] ?? '')))
    }
    return sorted.filter(r => (!filters.status || r.status === filters.status) && (!filters.customer || r.customer === filters.customer))
  }, [data, sortKeys, filters])

  if (isLoading) return <div>Loading...</div>

  const totalRings = rows.length
  const withSize = rows.filter(r => r.usSize).length

  return (
    <div>
      <div>
        <span>Total Cincin: {totalRings}</span>
        <span>Dengan Ukuran: {withSize}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th onClick={() => setSortKeys(['customer'])}>Customer</th>
            <th onClick={() => setSortKeys(['variant'])}>Variant</th>
            <th onClick={() => setSortKeys(['size'])}>Size</th>
            <th onClick={() => setSortKeys(['status'])}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.wpId}-${i}`}>
              <td>{r.customer}</td>
              <td>{r.variantLabel}</td>
              <td>{r.usSize ? `US ${r.usSize} (${r.scalePct}%)` : '-'}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run components/order/__tests__/WorkingProjectGLRingTab.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/components/order/WorkingProjectGLRingTab.tsx apps/dashboard/components/order/__tests__/WorkingProjectGLRingTab.test.tsx
git commit -m "feat(working-projects): implement tab=green-lantern-ring full-parity view"
```

---

### Task 21: "Buat Working Project" action on Shopee/Tokopedia views

**Files:**
- Modify: `apps/dashboard/app/(dashboard)/order/page.tsx` (or the Shopee/Tokopedia row-action component it renders — locate via the read done in Task 17/earlier exploration)
- Test: `apps/dashboard/app/(dashboard)/order/__tests__/page.test.tsx` (append)

**Interfaces:**
- Consumes: `POST /api/working-projects` (Task 14), the existing per-row action pattern already used in the Shopee/Tokopedia row (e.g. an existing "🔧 Buat Invoice"-style button — mirror its exact markup/behavior).

- [ ] **Step 1: Write failing test**

```tsx
it('shows a Buat Working Project action on each Shopee order row', () => {
  withParams('?channel=shopee')
  render(<OrderPage />)
  expect(screen.getByText('📋 Buat Working Project')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/dashboard && npx vitest run "app/(dashboard)/order/__tests__/page.test.tsx"`
Expected: FAIL — action not present.

- [ ] **Step 3: Implement**

Add a row action button next to the existing per-row actions in the Shopee and Tokopedia view components, following their exact existing button markup:

```tsx
<button onClick={() => createWorkingProjectFromOrder(order)}>📋 Buat Working Project</button>
```

```tsx
async function createWorkingProjectFromOrder(order: ShopeeOrder | TokopediaOrder) {
  await fetch('/api/working-projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'platform' in order && order.platform === 'Tokopedia' ? 'tokopedia' : 'shopee',
      sourceOrderNo: order.orderNo,
      forumChannelId: 'FORUM_CINCIN_ID',
      customer: order.customer,
      contact: order.contact,
      product: order.product,
      variant: order.variant,
    }),
  })
}
```

(Implementer note: replace `'FORUM_CINCIN_ID'` with whichever forum-channel-selection UI or default the existing manual-create flow uses — check for an existing forum-picker component before hardcoding; if none exists, add a simple `<select>` populated from the known allowlist `[ORDERS_FORUM_CHANNEL_ID, FORUM_TOPENG_ID, FORUM_CINCIN_ID, FORUM_CLICKER_ID]`.)

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/dashboard && npx vitest run "app/(dashboard)/order/__tests__/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/dashboard/app/(dashboard)/order/page.tsx" "apps/dashboard/app/(dashboard)/order/__tests__/page.test.tsx"
git commit -m "feat(working-projects): add Buat Working Project action to Shopee/Tokopedia rows"
```

---

### Task 22: Full-suite verification + `.env` documentation

**Files:**
- Modify: `apps/dashboard/.env.example` (add `DISCORD_RELAY_URL`, `DISCORD_RELAY_TOKEN`)
- No new tests — this task runs the full suite and fixes any cross-task regressions.

- [ ] **Step 1: Run the full dashboard test suite**

Run: `cd apps/dashboard && npx vitest run`
Expected: all tests pass, including every test file from Tasks 1-21.

- [ ] **Step 2: Add the two new env vars to `.env.example`**

```
DISCORD_RELAY_URL=http://192.168.88.92:3000
DISCORD_RELAY_TOKEN=
```

- [ ] **Step 3: Run `pnpm turbo build` to catch type errors across the monorepo**

Run: `cd /Users/adhityatangahu/Documents/shopee-analysis && export PATH="$HOME/.nvm/versions/node/v22.21.1/bin:$PATH" && pnpm --filter shopee-dashboard build`
Expected: build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/.env.example
git commit -m "docs(working-projects): document DISCORD_RELAY_URL/DISCORD_RELAY_TOKEN env vars"
```

---

## Self-Review

**Spec coverage:** All spec sections have a task — Data model (Task 1), pure formatting/GL-Ring logic (Tasks 2-4), relay (Task 5), relay client (Task 6), service layer incl. failure-ordering/reconciliation (Tasks 7-9), full bot-facing API surface (Tasks 10-13), full web-facing API surface incl. `detail-source`/`resync` (Tasks 14-14b), migration script (Task 15), UI incl. sidebar/tabs/GL-Ring parity/create-actions (Tasks 16-21), final verification (Task 22). The `cyd-publisher.js` stub and `threadUpdate` handler rewrite belong to Plan B (ai-assistant-side files), not this dashboard plan.

**Placeholder scan:** No TBD/TODO markers. Task 21's forum-channel selection has an explicit implementer note (not a placeholder — a concrete fallback with a real allowlist array) since the exact existing UI pattern must be checked at implementation time.

**Type consistency:** `WorkingProject` field names match across Task 1's schema, Task 7-9's service functions, Task 10-14's routes, and Task 18-20's UI components (`sourceOrderNo`, `orderNoLegacy`, `dueDate`/`dueDateRaw`, `syncState`/`syncError`, `checklist` canonical shape). `createRelayThread`/`editRelayThread`/etc. signatures in Task 6 match their call sites in Task 7-9.
