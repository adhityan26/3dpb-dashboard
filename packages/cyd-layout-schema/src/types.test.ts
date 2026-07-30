import { describe, it, expect } from 'vitest'
import { LAYOUT_LIMITS } from './types'

describe('LAYOUT_LIMITS.maxPrinterModelLength', () => {
  it('cocok kapasitas buffer firmware char type[12] (11 byte efektif)', () => {
    expect(LAYOUT_LIMITS.maxPrinterModelLength).toBe(11)
  })
})
