import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectProductCategory, forumChannelIdForCategory, resolveForumChannelId, type CategoryProductIds } from '../category'

const EMPTY: CategoryProductIds = { cincin: [], topeng: [], clicker: [] }

describe('detectProductCategory', () => {
  it('matches cincin/ring, topeng/mask, clicker by product name', () => {
    expect(detectProductCategory({ product: 'Green Lantern Ring 2026', configuredProductIds: EMPTY })).toBe('cincin')
    expect(detectProductCategory({ product: '3D Print Cincin Custom', configuredProductIds: EMPTY })).toBe('cincin')
    expect(detectProductCategory({ product: 'Topeng Dr Doom', configuredProductIds: EMPTY })).toBe('topeng')
    expect(detectProductCategory({ product: 'Iron Man Mask Cosplay', configuredProductIds: EMPTY })).toBe('topeng')
    expect(detectProductCategory({ product: 'Camera Shutter Clicker', configuredProductIds: EMPTY })).toBe('clicker')
  })

  it('does not treat "Earrings" as a ring (substring false positive found 2026-09-27)', () => {
    expect(detectProductCategory({ product: '3D Print Agnes Tachyon Earrings - Umamusume', configuredProductIds: EMPTY })).toBeNull()
  })

  it('returns null (general) when nothing matches', () => {
    expect(detectProductCategory({ product: 'Gantungan Kunci Custom', configuredProductIds: EMPTY })).toBeNull()
    expect(detectProductCategory({ product: null, configuredProductIds: EMPTY })).toBeNull()
  })

  it('prefers a configured product-ID match over the name regex', () => {
    const ids: CategoryProductIds = { cincin: [], topeng: ['999'], clicker: [] }
    // Name alone would say "cincin", but the curated topeng ID list wins.
    expect(detectProductCategory({ product: 'Cincin Ring', sourceProductId: '999', configuredProductIds: ids })).toBe('topeng')
  })

  it('falls back to the name regex when sourceProductId matches nothing configured', () => {
    const ids: CategoryProductIds = { cincin: [], topeng: ['999'], clicker: [] }
    expect(detectProductCategory({ product: 'Topeng Custom', sourceProductId: '111', configuredProductIds: ids })).toBe('topeng')
  })
})

describe('forumChannelIdForCategory', () => {
  const ORIGINAL = { ...process.env }
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FORUM_CINCIN_ID = 'cincin-channel'
    process.env.NEXT_PUBLIC_FORUM_TOPENG_ID = 'topeng-channel'
    process.env.NEXT_PUBLIC_FORUM_CLICKER_ID = 'clicker-channel'
    process.env.NEXT_PUBLIC_ORDERS_FORUM_CHANNEL_ID = 'general-channel'
  })
  afterEach(() => {
    process.env = { ...ORIGINAL }
  })

  it('resolves each category to its own forum channel from the NEXT_PUBLIC_ fallback var', () => {
    expect(forumChannelIdForCategory('cincin')).toBe('cincin-channel')
    expect(forumChannelIdForCategory('topeng')).toBe('topeng-channel')
    expect(forumChannelIdForCategory('clicker')).toBe('clicker-channel')
  })

  it('resolves null to the general/orders forum', () => {
    expect(forumChannelIdForCategory(null)).toBe('general-channel')
  })

  it('prefers the plain server-only env var over the NEXT_PUBLIC_ one', () => {
    process.env.FORUM_CINCIN_ID = 'server-cincin-channel'
    expect(forumChannelIdForCategory('cincin')).toBe('server-cincin-channel')
  })

  it('falls back to the literal placeholder when neither env var is set (found 2026-09-27: this is what actually shipped to production, causing every auto-created WP that night to fail Discord thread creation with forbidden_channel)', () => {
    delete process.env.NEXT_PUBLIC_FORUM_CINCIN_ID
    delete process.env.FORUM_CINCIN_ID
    expect(forumChannelIdForCategory('cincin')).toBe('FORUM_CINCIN_ID')
  })
})

describe('resolveForumChannelId', () => {
  const ORIGINAL = { ...process.env }
  beforeEach(() => {
    process.env.FORUM_TOPENG_ID = 'topeng-channel'
    process.env.ORDERS_FORUM_CHANNEL_ID = 'general-channel'
  })
  afterEach(() => {
    process.env = { ...ORIGINAL }
  })

  it('maps a literal placeholder name sent by the client bundle to the server env value (found 2026-10-02: the order-row forum dropdown sent "FORUM_TOPENG_ID" verbatim -> relay 403 forbidden_channel)', () => {
    expect(resolveForumChannelId('FORUM_TOPENG_ID')).toBe('topeng-channel')
    expect(resolveForumChannelId('ORDERS_FORUM_CHANNEL_ID')).toBe('general-channel')
  })

  it('passes a real channel id through unchanged', () => {
    expect(resolveForumChannelId('123456789012345678')).toBe('123456789012345678')
  })

  it('leaves an unconfigured placeholder as-is', () => {
    delete process.env.FORUM_CLICKER_ID
    delete process.env.NEXT_PUBLIC_FORUM_CLICKER_ID
    expect(resolveForumChannelId('FORUM_CLICKER_ID')).toBe('FORUM_CLICKER_ID')
  })
})
