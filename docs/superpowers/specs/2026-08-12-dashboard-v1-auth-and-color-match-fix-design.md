# Dashboard `/api/v1/*` Auth + "Cored"/"red" Color-Match Bug

## Goal

Close two go-public-readiness blockers in `apps/dashboard` (audit items #1 and #6, `project_go_public_readiness_audit.md`): the Spoolman-compatible `/api/v1/*` API is fully unauthenticated on a publicly-tunneled host, and `catalog-mapper.ts` false-matches color names via unbounded substring search.

## Scope

In scope: adding token auth to all `/api/v1/*` route handlers, and fixing the substring color-match bug with a regression test.

Out of scope: building a real in-house Spoolman-compatible consumer app for `apps/saas` (mentioned by the user as a future "nanti" item, not this spec) — this spec only re-secures the existing dormant API, it does not extend or productize it.

## Context

`/api/v1/*` was originally built for the third-party Android app **MrBambuSpoolPal**. The user has confirmed that app is no longer in use, and no replacement consumer exists yet — so there is no backward-compatibility constraint on how auth is added. This simplifies the fix considerably: standard token auth, no LAN-detection trickery needed.

## A1 — Token auth on all `/api/v1/*` routes

**New file:** `apps/dashboard/lib/api-v1/auth.ts`

```typescript
/** Constant-time string comparison to avoid timing leaks on the token. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verify the bearer token on a /api/v1/* request.
 * Returns true only when Authorization: "Bearer <token>" matches API_V1_TOKEN
 * and the env var is set. Unset env → always false (never open access).
 */
export function requireApiV1Token(req: { headers: { get(name: string): string | null } }): boolean {
  const expected = process.env.API_V1_TOKEN
  if (!expected) return false
  const header = req.headers.get("authorization")
  if (!header || !header.startsWith("Bearer ")) return false
  const token = header.slice("Bearer ".length)
  return timingSafeEqual(token, expected)
}
```

This is a direct copy of `apps/dashboard/lib/bot/auth.ts`'s `requireBotToken` shape, checking a distinct env var (`API_V1_TOKEN`, not `BOT_API_TOKEN`) — the user chose a separate token over reusing the bot token, to keep it independently rotatable if an in-house consumer is built later.

**Applied to every handler** in all 6 route files, all methods — no partial protection (no route is left publicly readable), since there is currently no legitimate consumer requiring open access:

- `apps/dashboard/app/api/v1/info/route.ts` — GET
- `apps/dashboard/app/api/v1/spool/route.ts` — GET, POST
- `apps/dashboard/app/api/v1/spool/[id]/route.ts` — GET, PATCH
- `apps/dashboard/app/api/v1/spool/[id]/use/route.ts` — PUT
- `apps/dashboard/app/api/v1/filament/route.ts` — GET, POST
- `apps/dashboard/app/api/v1/vendor/route.ts` — GET, POST

Each handler gets the same guard as the existing bot routes:

```typescript
if (!requireApiV1Token(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
```

placed as the first line of the handler body, before any other logic (including `await req.json()` for POST/PATCH/PUT, so a malformed body from an unauthenticated caller never even gets parsed).

**Deploy config:** `API_V1_TOKEN` is added to `apps/dashboard/deploy.sh`'s `REQUIRED_VARS` array (deploy fails loud if unset, matching how `NEXTAUTH_SECRET` and other secrets are already handled — this is a deliberately hard requirement, not an optional/soft one, since silently deploying with the var unset would otherwise just mean every route permanently 401s with no obvious signal why). Also documented with a placeholder value in `apps/dashboard/.env.deploy.example` and `apps/dashboard/.env.production.example`.

## A2 — "Cored" matching "red" bug

**File:** `apps/dashboard/lib/filamen/catalog-mapper.ts:52`

Current code:

```typescript
const partials = byBrand.filter(
  (e) => e.colorName.toLowerCase().includes(q) || q.includes(e.colorName.toLowerCase())
)
```

The second condition (`q.includes(e.colorName.toLowerCase())`) does unbounded substring matching — if the catalog has a short `colorName` like `"Red"`, any query containing those letters in sequence anywhere (e.g. `"Cored"`, a real eSUN color/finish name) false-matches, because `"cored".includes("red")` is `true`.

**Fix:** replace the raw `.includes()` check in that direction with a word/phrase-boundary-aware regex, so `colorName` must appear as a whole word or phrase within `q`, not as an arbitrary substring:

```typescript
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ...inside resolveFilamentToCatalog, replacing the `q.includes(...)` half of the OR:
const boundaryPattern = new RegExp(`(^|\\s)${escapeRegExp(e.colorName.toLowerCase())}($|\\s)`)
const partials = byBrand.filter(
  (e) => e.colorName.toLowerCase().includes(q) || boundaryPattern.test(q)
)
```

(The first condition, `colorName.includes(q)`, is left unchanged — it's the safe direction, since `q` is normally the longer/more specific side of the match and a false substring hit there is far less likely in practice; the bug report and regression risk are specifically about the second direction.)

The `escapeRegExp` helper is needed because `colorName` values may contain regex-special characters (e.g. `"Black+"` from a `PLA+`-style suffix) that would otherwise break the constructed pattern.

## Testing

- `apps/dashboard/lib/api-v1/auth.test.ts` (new): `requireApiV1Token` — no token → false; wrong token → false; correct token → true; env var unset → false even with a correct-looking header sent.
- One rejection test per route file (6 files) confirming a request without a valid `Authorization` header gets `401` and the underlying DB/logic never runs (assert the Prisma call is not made, e.g. via existing test mocking conventions already used in these files' test suites, if any exist — check each file's current test coverage before writing new tests, to avoid duplicating existing auth-adjacent assertions).
- `apps/dashboard/lib/filamen/catalog-mapper.test.ts` (new — this module currently has zero test coverage): the "Cored" false-positive as the primary regression case (query containing "Cored" must NOT match a catalog entry with `colorName: "Red"`), plus positive cases proving the fix doesn't regress legitimate matches (exact `colorName` match, and a legitimate substring match in the safe direction, e.g. query `"Dark Blue"` matching a catalog entry with `colorName: "Blue"`).
