import { describe, it, expect } from 'vitest'
import { isFastCourier, DEFAULT_FAST_COURIERS } from '../courier'

describe('isFastCourier', () => {
  it('matches a configured keyword case-insensitively as a substring', () => {
    expect(isFastCourier('Anteraja Same Day', [...DEFAULT_FAST_COURIERS])).toBe(true)
    expect(isFastCourier('GRAB EXPRESS', [...DEFAULT_FAST_COURIERS])).toBe(true)
    expect(isFastCourier('GoSend Instant', [...DEFAULT_FAST_COURIERS])).toBe(true)
  })

  it('returns false for a courier not in the configured list', () => {
    expect(isFastCourier('SPX Reguler', [...DEFAULT_FAST_COURIERS])).toBe(false)
    expect(isFastCourier('J&T Express', [...DEFAULT_FAST_COURIERS])).toBe(false)
  })

  it('returns false for null/empty shipping or an empty configured list', () => {
    expect(isFastCourier(null, [...DEFAULT_FAST_COURIERS])).toBe(false)
    expect(isFastCourier('', [...DEFAULT_FAST_COURIERS])).toBe(false)
    expect(isFastCourier('Anteraja', [])).toBe(false)
  })

  it('ignores blank entries in the configured list', () => {
    expect(isFastCourier('Anteraja', ['', '  '])).toBe(false)
  })
})
