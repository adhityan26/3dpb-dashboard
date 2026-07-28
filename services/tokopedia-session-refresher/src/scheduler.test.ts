import { describe, it, expect } from 'vitest'
import { shouldRefresh } from './scheduler'

describe('shouldRefresh', () => {
  const HOUR = 60 * 60 * 1000

  it('token null (belum pernah ada sesi) -> true (perlu refresh)', () => {
    expect(shouldRefresh(null, Date.now(), 24)).toBe(true)
  })

  it('token sudah lewat expiry -> true', () => {
    const now = Date.now()
    expect(shouldRefresh(now - HOUR, now, 24)).toBe(true)
  })

  it('token masih jauh dari threshold -> false', () => {
    const now = Date.now()
    expect(shouldRefresh(now + 48 * HOUR, now, 24)).toBe(false)
  })

  it('token pas di bawah threshold -> true', () => {
    const now = Date.now()
    expect(shouldRefresh(now + 12 * HOUR, now, 24)).toBe(true)
  })

  it('token pas di atas threshold -> false', () => {
    const now = Date.now()
    expect(shouldRefresh(now + 25 * HOUR, now, 24)).toBe(false)
  })
})
