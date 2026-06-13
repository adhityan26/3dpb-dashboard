# Internal Light Generator Orders — Design

**Date:** 2026-06-13
**Status:** Approved (pending spec review)

## Goal

Allow an operator to create a Light Generator order **without a customer order**, for internal experimentation/testing. The operator then runs it through the existing flow: upload silhouette → adjust config → generate STL → download.

## Context

The order detail page `/light-generator/[id]` already contains everything an operator needs:

- `LgImageSlot` — upload silhouette (PUT `/api/light-generator/orders/[id]/silhouette`)
- `LgConfigEditor` — edit generator config
- `LgGeneratePanel` — generate + preview + download STL

The **only** missing capability is creating a blank order to land on that page. Today orders originate from customer submissions (imported via Sanity). There is no create-order endpoint.

The `LightGeneratorOrderView` in `app/(dashboard)/order/page.tsx` is currently a "coming soon" placeholder — this becomes the entry point.

## Decisions

- **Purely internal** — no Sanity sync. `sanityDocId` stays null.
- **Use case: internal experimentation** — customer fields are auto-filled, not operator-entered.
- **Distinguish via `isInternal` boolean** on `LightGeneratorOrder` — clean filtering, keeps the pending-order badge accurate.
- **Entry point: LG tab on the Order page** — build out the placeholder view with a DB-backed list + create button.
- **Everything inline** — no navigation to `/light-generator/[id]`. The list and the full editor (upload → config → generate → download) live in the same LG tab via a master-detail layout. The existing detail-page components are reused in place.

## Architecture

### Data model

Add to `LightGeneratorOrder` (prisma/schema.prisma):

```prisma
isInternal Boolean @default(false)
```

Existing customer orders default to `false` — no backfill needed. Add `@@index([isInternal])` is unnecessary at this scale (table is small); skip.

### Service layer (`lib/light-generator/service.ts`)

**`createInternalLgOrder(label?: string): Promise<LgOrder>`**
- `id`: `LG-INT-YYYYMMDD-NNNN` where NNNN is a zero-padded daily sequence (count of existing `LG-INT-YYYYMMDD-*` rows + 1).
- `customerName`: `label?.trim() || "Internal"`
- `customerContact`: `"-"`
- `configJson`: `JSON.stringify(DEFAULT_LG_CONFIG)` — a shared default constant (size M, circle, no offset, supportStems true).
- `imagePath`: `""` (placeholder; set when silhouette uploaded)
- `status`: `"submitted"`
- `isInternal`: `true`
- `sanityDocId`: `null`

**`listLgOrders`** — add optional `internal?: boolean` filter. When `internal === true`, return only internal orders; when `false`/undefined, return only customer orders (preserve existing behavior by excluding internal). Existing callers pass no flag → they get customer orders only.

**`countLgPendingOrders`** — add `isInternal: false` to the where clause so internal orders never inflate the sidebar badge.

`DEFAULT_LG_CONFIG` lives in `lib/light-generator/types.ts` (or a small `defaults.ts`) so both create and any UI fallback share one source.

### API (`app/api/light-generator/orders/route.ts`)

- **`POST`** (new) — auth-gated. Body: `{ label?: string }` (optional JSON). Calls `createInternalLgOrder(label)`, returns the serialized order (201).
- **`GET`** — extend to read `?internal=true|false` query param and pass to `listLgOrders`.

### Frontend

**`lib/hooks/use-light-generator.ts`**
- `useLgOrders(status?, internal?)` — extend to pass `internal` as a query param; include it in the query key.
- `useCreateInternalLgOrder()` — mutation POSTing to `/api/light-generator/orders`; on success invalidate the internal-orders query and return the new order (caller navigates to `/light-generator/[id]`).

**`components/light-generator/LgInternalOrdersView.tsx`** (new) — master-detail, fully inline (no navigation):
- **Left (list/master):** "Buat Order Internal" button + list of internal orders (`useLgOrders(undefined, true)`): id, status badge, createdAt. Selecting a row sets `selectedId` state. Empty state prompts to create the first one.
- **Right (editor/detail):** when `selectedId` is set, render the existing editor components against that order, reusing exactly what the detail page uses:
  - `useLgOrder(selectedId)` to load the order
  - `LgImageSlot` (silhouette upload)
  - `LgConfigEditor` (config)
  - `LgGeneratePanel` (generate + preview + download STL)
- On create success → set `selectedId` to the new order's id (no `router.push`).
- The shared editor markup (image slot + config + generate panel + generate guard) is currently inline in `app/(dashboard)/light-generator/[id]/page.tsx`. Extract it into a reusable `components/light-generator/LgOrderEditor.tsx` that takes an `orderId` prop, so both the standalone detail page and this inline view render the identical editor. The detail page becomes a thin wrapper: `<LgOrderEditor orderId={id} />`.

**`app/(dashboard)/order/page.tsx`**
- Replace the `LightGeneratorOrderView` placeholder body with `<LgInternalOrdersView />`.

### Generate guard

The generate flow downloads `order.imagePath`. For a fresh internal order `imagePath === ""`, which would fail. Guard in the detail page / `LgGeneratePanel`: disable the Generate button while `imagePath` is empty, with a hint "Upload silhouette dulu". (`LgImageSlot` upload sets `imagePath` and refetches the order.)

## Data flow

1. Operator opens Order page → LG tab → sees internal order list (left).
2. Clicks "Buat Order Internal" → POST → new DB row (`isInternal=true`, `imagePath=""`) → editor opens inline (right), order selected.
3. Uploads silhouette → PUT sets `imagePath` → Generate button enables.
4. Adjusts config → Generate → STL built, uploaded to MinIO, `status=ready`.
5. Downloads STL via the streamed `/stl` route — all without leaving the Order page.

## Error handling

- Create with empty/whitespace label → falls back to "Internal" (no error).
- Generate before upload → blocked by UI guard; if called anyway, existing generate route returns 500 with a clear message (downloadFromMinio on "" key fails). The UI guard is the primary defense.
- Daily sequence race (two creates same ms) → unlikely at single-operator scale; if it occurs, the `id` PK insert fails → surface as 500 and operator retries. Acceptable for internal tooling.

## Testing

- `createInternalLgOrder` unit test: returns row with `isInternal=true`, default config parseable, id matches `LG-INT-\d{8}-\d{4}`.
- `listLgOrders({ internal: true })` returns only internal; `listLgOrders({})` excludes internal.
- `countLgPendingOrders` ignores internal orders.

## Out of scope (YAGNI)

- Editing customer name/contact for internal orders (use default; rename later if a real need appears).
- Sanity sync for internal orders.
- Bulk operations, internal-order analytics.
