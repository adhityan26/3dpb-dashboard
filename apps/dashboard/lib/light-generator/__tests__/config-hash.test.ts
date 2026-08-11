import { describe, it, expect } from 'vitest'
import { stableStringify, hashLgConfig } from '../config-hash'

describe('hashLgConfig', () => {
  it('same content different key order -> same hash', () => {
    expect(hashLgConfig({ a: 1, b: { c: 2, d: 3 } }))
      .toBe(hashLgConfig({ b: { d: 3, c: 2 }, a: 1 }))
  })
  it('different content -> different hash', () => {
    expect(hashLgConfig({ a: 1 })).not.toBe(hashLgConfig({ a: 2 }))
  })
  it('stableStringify sorts keys recursively', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })
  it('hash stable for realistic config', () => {
    const cfg = { outer_radius: 100, cover_type: 'top', user: null, nested: { a: [1, 2] } }
    expect(hashLgConfig(cfg)).toBe(hashLgConfig(JSON.parse(JSON.stringify(cfg))))
  })
})
