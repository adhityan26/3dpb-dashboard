import { describe, it, expect } from 'vitest'
import { slugify } from '../slugify'

describe('slugify', () => {
  it('lowercase dan ganti spasi jadi tanpa spasi', () => {
    expect(slugify('Jupiter')).toBe('jupiter')
    expect(slugify('X1C Printer')).toBe('x1c-printer')
  })

  it('buang karakter non alfanumerik selain dash', () => {
    expect(slugify('Mars (P1P) #1')).toBe('mars-p1p-1')
  })

  it('collapse multiple dash jadi satu, trim dash di ujung', () => {
    expect(slugify('  --Neptune--  ')).toBe('neptune')
  })
})
