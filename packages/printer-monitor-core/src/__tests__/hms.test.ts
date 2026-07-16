import { describe, it, expect } from 'vitest'
import { HmsLookup, hmsKeyFor } from '../hms'

describe('HmsLookup', () => {
  it('hmsKeyFor split attr jadi XXXX_YYYY lowercase', () => {
    expect(hmsKeyFor({ attr: 0x12018007, code: 1 })).toBe('1201_8007')
  })
  it('translate pakai deskripsi kalau key ada (tabel injeksi)', () => {
    const l = new HmsLookup({ '1201_8007': 'Extruder clogged.' })
    expect(l.translate([{ attr: 0x12018007, code: 66 }]))
      .toEqual(['[1201_8007] Extruder clogged.'])
  })
  it('fallback string mentah kalau tidak ada', () => {
    const l = new HmsLookup({})
    expect(l.translate([{ attr: 0x0c000100, code: 65540 }]))
      .toEqual(['hms=code=65540, attr=201326848'])
  })
  it('tabel default (vendored) punya entri & bisa translate 1201_8007', () => {
    const l = new HmsLookup()
    expect(l.translate([{ attr: 0x12018007, code: 0 }])[0]).toMatch(/^\[1201_8007\] /)
  })
})
