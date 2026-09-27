import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectProductCategory, forumChannelIdForCategory, type CategoryProductIds } from '../category'

const EMPTY: CategoryProductIds = { cincin: [], topeng: [], clicker: [] }

describe('detectProductCategory', () => {
  it('matches cincin/ring, topeng/mask, clicker by product name', () => {
    expect(detectProductCategory({ product: 'Green Lantern Ring 2026', configuredProductIds: EMPTY })).toBe('cincin')
    expect(detectProductCategory({ product: '3D Print Cincin Custom', configuredProductIds: EMPTY })).toBe('cincin')
    expect(detectProductCategory({ product: 'Topeng Dr Doom', configuredProductIds: EMPTY })).toBe('topeng')
    expect(detectProductCategory({ product: 'Iron Man Mask Cosplay', configuredProductIds: EMPTY })).toBe('topeng')
    expect(detectProductCategory({ product: 'Camera Shutter Clicker', configuredProductIds: EMPTY })).toBe('clicker')
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

  it('resolves each category to its own forum channel', () => {
    expect(forumChannelIdForCategory('cincin')).toBe('cincin-channel')
    expect(forumChannelIdForCategory('topeng')).toBe('topeng-channel')
    expect(forumChannelIdForCategory('clicker')).toBe('clicker-channel')
  })

  it('resolves null to the general/orders forum', () => {
    expect(forumChannelIdForCategory(null)).toBe('general-channel')
  })
})
