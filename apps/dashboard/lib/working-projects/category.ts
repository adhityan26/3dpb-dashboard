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
const CATEGORY_NAME_PATTERN: Record<ProductCategory, RegExp> = {
  cincin: /ring|cincin/i,
  topeng: /topeng|\bmask\b/i,
  clicker: /clicker/i,
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

const CATEGORY_FORUM_ENV: Record<ProductCategory, { public: string; fallback: string }> = {
  cincin: { public: 'NEXT_PUBLIC_FORUM_CINCIN_ID', fallback: 'FORUM_CINCIN_ID' },
  topeng: { public: 'NEXT_PUBLIC_FORUM_TOPENG_ID', fallback: 'FORUM_TOPENG_ID' },
  clicker: { public: 'NEXT_PUBLIC_FORUM_CLICKER_ID', fallback: 'FORUM_CLICKER_ID' },
}

/** Discord forum-channel ID for a detected category, or the general/orders
 * forum when `category` is null. Same env vars as
 * WORKING_PROJECT_FORUM_CHANNELS (NEXT_PUBLIC_-prefixed so the manual-create
 * row UI can also inline them at build time); read here for the server-only
 * auto-create job. */
export function forumChannelIdForCategory(category: ProductCategory | null): string {
  if (category === null) {
    return process.env.NEXT_PUBLIC_ORDERS_FORUM_CHANNEL_ID ?? 'ORDERS_FORUM_CHANNEL_ID'
  }
  const env = CATEGORY_FORUM_ENV[category]
  return process.env[env.public] ?? env.fallback
}
