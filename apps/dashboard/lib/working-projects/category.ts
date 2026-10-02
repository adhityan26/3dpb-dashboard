// Product-category routing for auto-created Working Projects (and reused
// for the manual "Buat WP" forum-channel default). One Discord forum per
// category — same env vars WORKING_PROJECT_FORUM_CHANNELS already uses
// (lib/working-projects/create-from-order.ts) — everything else falls back
// to the general "wp-general"/orders forum.
export const PRODUCT_CATEGORIES = ['cincin', 'topeng', 'clicker'] as const
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export type CategoryProductIds = Record<ProductCategory, string[]>

// Checked in this fixed order when a product name could match more than one
// pattern (shouldn't happen in practice, but "cincin" wins ties — matches
// isGLRing()'s existing precedence in format.ts).
// \b on "ring" — found 2026-09-27: a bare /ring/i matched "Earrings" (it
// contains the substring "ring"), routing an earring order into the cincin
// forum. Word boundaries required for every short/common-substring token.
const CATEGORY_NAME_PATTERN: Record<ProductCategory, RegExp> = {
  cincin: /\bring\b|cincin/i,
  topeng: /topeng|\bmask\b/i,
  clicker: /\bclicker\b/i,
}

/**
 * Which category an order's product belongs to, for routing an
 * auto-created Working Project to the right Discord forum.
 *
 * Priority: an explicit product-ID match (curated per-category list, same
 * idea as GL Ring's existing product-ID list) wins over the product-NAME
 * regex — the ID list is the reliable signal, the regex is a fallback for
 * products not yet catalogued there. Returns `null` for "wp-general".
 */
export function detectProductCategory(input: {
  product: string | null | undefined
  sourceProductId?: string | null
  configuredProductIds: CategoryProductIds
}): ProductCategory | null {
  if (input.sourceProductId) {
    for (const category of PRODUCT_CATEGORIES) {
      if (input.configuredProductIds[category].includes(input.sourceProductId)) return category
    }
  }
  if (input.product) {
    for (const category of PRODUCT_CATEGORIES) {
      if (CATEGORY_NAME_PATTERN[category].test(input.product)) return category
    }
  }
  return null
}

const CATEGORY_FORUM_ENV: Record<ProductCategory, string> = {
  cincin: 'FORUM_CINCIN_ID',
  topeng: 'FORUM_TOPENG_ID',
  clicker: 'FORUM_CLICKER_ID',
}

// Found 2026-09-27: the dashboard container's runtime env has NONE of the
// NEXT_PUBLIC_FORUM_* vars set (confirmed via `docker exec shopee-dashboard
// printenv`) — .dockerignore excludes every real .env file from the build
// context, so `next build` never sees a value to inline into the client
// bundle either. Every WP the daily auto-create job created that night (72
// rows) got the literal placeholder string as forumChannelId and failed
// Discord thread creation with 403 forbidden_channel. The historical rows
// with REAL channel IDs all came from the ai-assistant bot, which resolves
// forum routing itself and passes the real id directly in its own
// `POST /api/bot/working-projects` calls — this dashboard's own env-based
// resolution had never actually worked.
// Fix: read plain (non-NEXT_PUBLIC_) server-only env vars, set directly in
// .env.deploy — see deploy.sh's `-e FORUM_CINCIN_ID=...` etc. NEXT_PUBLIC_
// versions are checked second only so a value set there (e.g. by a future
// client-side consumer) still works without duplicating config.
function resolveForumEnv(name: string, literalFallback: string): string {
  return process.env[name] ?? process.env[`NEXT_PUBLIC_${name}`] ?? literalFallback
}

/** Discord forum-channel ID for a detected category, or the general/orders
 * forum when `category` is null. */
export function forumChannelIdForCategory(category: ProductCategory | null): string {
  if (category === null) {
    return resolveForumEnv('ORDERS_FORUM_CHANNEL_ID', 'ORDERS_FORUM_CHANNEL_ID')
  }
  return resolveForumEnv(CATEGORY_FORUM_ENV[category], CATEGORY_FORUM_ENV[category])
}

const FORUM_PLACEHOLDERS: readonly string[] = ['ORDERS_FORUM_CHANNEL_ID', ...Object.values(CATEGORY_FORUM_ENV)]

/** Maps a literal env-var placeholder (e.g. "FORUM_TOPENG_ID") to the real
 * Discord channel id from server env; real ids pass through unchanged.
 * Found 2026-10-02: the order-row forum dropdown builds its options from
 * NEXT_PUBLIC_FORUM_* at build time, which are never set (see above), so the
 * client sends the placeholder verbatim and the relay answers 403
 * forbidden_channel. Resolving on the server makes the client value only a
 * choice of forum, never the id itself. */
export function resolveForumChannelId(id: string): string {
  return FORUM_PLACEHOLDERS.includes(id) ? resolveForumEnv(id, id) : id
}
