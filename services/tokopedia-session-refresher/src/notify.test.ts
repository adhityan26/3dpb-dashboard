import { describe, it, expect } from 'vitest'
import { shouldNotify } from './notify'

describe('shouldNotify', () => {
  const HOUR = 60 * 60 * 1000

  it('belum pernah notify -> true', () => {
    expect(shouldNotify(null, Date.now(), 6)).toBe(true)
  })

  it('notify terakhir masih dalam cooldown -> false', () => {
    const now = Date.now()
    expect(shouldNotify(now - 2 * HOUR, now, 6)).toBe(false)
  })

  it('notify terakhir sudah lewat cooldown -> true', () => {
    const now = Date.now()
    expect(shouldNotify(now - 7 * HOUR, now, 6)).toBe(true)
  })

  it('notify terakhir pas di batas cooldown -> false (belum lewat)', () => {
    const now = Date.now()
    expect(shouldNotify(now - 6 * HOUR, now, 6)).toBe(false)
  })
})
