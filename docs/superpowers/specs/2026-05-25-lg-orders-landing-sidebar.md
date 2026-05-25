# Light Generator Orders — Landing Sidebar Integration

## Goal

Move Light Generator order intake management into the `/landing` CMS sidebar (consistent with Strava Orders pattern). Admin confirms Sanity orders from there; confirmed orders stay visible with a "Confirmed" flag. The `/light-generator` operator page removes its Sanity pending panel and focuses solely on processing.

## Architecture

The `/landing` sidebar gains a new `lg-orders` section backed by a new `LgOrdersManager` component. The existing `/api/light-generator/sanity-pending` endpoint is replaced by `/api/light-generator/sanity-orders` which returns **all** Sanity LG orders with an `isConfirmed` boolean (cross-referenced against local DB). The confirm action remains at `/api/light-generator/orders/[id]/confirm` (unchanged). Badge count for the sidebar item is added to the existing `/api/cms/counts` endpoint.

## File Map

**New files:**
- `components/cms/LgOrdersManager.tsx` — new CMS component, shows all Sanity LG orders with confirm button / confirmed flag

**Modified files:**
- `app/api/light-generator/sanity-orders/route.ts` — **new file** (replaces `sanity-pending/route.ts`); returns all Sanity orders with `isConfirmed` flag
- `app/api/light-generator/sanity-pending/route.ts` — **deleted** (superseded by `sanity-orders`)
- `app/api/cms/counts/route.ts` — add `lgOrdersPending` (count of unconfirmed Sanity orders)
- `lib/hooks/use-light-generator.ts` — replace `useSanityPending` with `useSanityOrders`
- `lib/hooks/use-cms.ts` — expose `lgOrdersPending` from `useCmsCounts` return type
- `components/cms/CMSSidebar.tsx` — add `lg-orders` nav item with badge
- `app/(dashboard)/landing/page.tsx` — add `lg-orders` case → `<LgOrdersManager />`
- `app/(dashboard)/light-generator/page.tsx` — remove `PendingSanityPanel` and `useSanityPending` usage

## Data Flow

```
Sanity LG orders
       ↓
GET /api/light-generator/sanity-orders
  → fetch all from Sanity (fetchAllSanityLgOrders)
  → cross-reference local DB (findMany where id in sanityIds)
  → return SanityLgOrder[] with isConfirmed: boolean
       ↓
LgOrdersManager (client)
  → unconfirmed: show [Confirm] button
  → confirmed: show ✅ Confirmed badge
  → "Lihat semua →" link to /light-generator
       ↓
POST /api/light-generator/orders/[id]/confirm (unchanged)
  → copies Sanity order to local DB + MinIO
  → client invalidates useSanityOrders query → row re-fetches with isConfirmed: true
```

## API: `GET /api/light-generator/sanity-orders`

Returns all LG orders in Sanity (not just unconfirmed).

**Response:**
```typescript
Array<SanityLgOrder & { isConfirmed: boolean }>
```

**Implementation:**
1. Fetch all from Sanity via `fetchAllSanityLgOrders()` (new helper, no status filter)
2. If empty → return `[]` early
3. Query local DB: `prisma.lightGeneratorOrder.findMany({ where: { id: { in: sanityIds } }, select: { id: true } })`
4. Build a `Set<string>` of confirmed IDs, map over Sanity results adding `isConfirmed`

## API: `GET /api/cms/counts` — addition

Add `lgOrdersPending: number` to the response. Implementation: call `fetchAllSanityLgOrders()` and subtract confirmed count (same cross-reference logic), or call `countLgPendingFromSanity()` — a new helper in `lib/light-generator/sanity-helpers.ts` that fetches and cross-references.

To avoid double Sanity calls, add a dedicated `countUnconfirmedSanityLgOrders(): Promise<number>` helper that replicates the cross-reference logic cheaply (GROQ count projection + DB count).

## Component: `LgOrdersManager`

```
Header:
  "🔦 Light Generator Orders"
  subtitle: "{n} menunggu konfirmasi"   [Lihat semua →]  (link to /light-generator)

List (CollectionList pattern):
  Columns: ID (monospace), Customer name, Config summary (size · shape), Date, Status/Action

  Per row:
    - isConfirmed = false → [Confirm] button (calls useConfirmLgOrder(id).mutate())
      - while pending: button shows "..." disabled
    - isConfirmed = true  → ✅ Confirmed badge (muted green chip, no action)

Empty state: "Tidak ada order dari landing page."
Loading state: "Memuat..."
```

**After Confirm mutates successfully:** invalidate `useSanityOrders` query → row re-renders with `isConfirmed: true`.

## CMSSidebar badge

```typescript
{
  section: "lg-orders",
  icon: "🔦",
  label: "LG Orders",
  badge: (c) => c?.lgOrdersPending ?? null,
  badgeVariant: "alert",   // amber — same as Strava Orders (action needed)
}
```

Badge = count of unconfirmed Sanity orders. Shows 0 / hidden when all confirmed.

## Sanity helper additions

In `lib/light-generator/sanity-helpers.ts`:

```typescript
// New: fetch ALL LG orders from Sanity (no status filter)
export async function fetchAllSanityLgOrders(): Promise<SanityLgOrder[]>

// New: count unconfirmed Sanity LG orders (for badge in /api/cms/counts)
export async function countUnconfirmedSanityLgOrders(): Promise<number>
```

`fetchAllSanityLgOrders` uses GROQ `*[_type == "lightGeneratorOrder"] | order(submittedAt desc)` (same fields as existing `fetchSanityPendingOrders` but no status filter).

`countUnconfirmedSanityLgOrders`: fetches all Sanity IDs only (`_id`), cross-references local DB, returns `sanityCount - confirmedCount`.

## Removals

- `app/api/light-generator/sanity-pending/route.ts` — delete
- `useSanityPending` hook — delete from `use-light-generator.ts`
- `PendingSanityPanel` component inline in `app/(dashboard)/light-generator/page.tsx` — remove (the import + JSX usage)
- `useSanityPending` import from `light-generator/page.tsx` — remove

## Out of scope

- Strava Orders operator split — noted as future work, not in this spec
- `/light-generator` detail page — unchanged
- Confirm API endpoint — unchanged
