import { describe, it, expect } from 'vitest'
import { resolveFilamentToCatalog } from '../catalog-mapper'
import type { FilamentCatalogEntry } from '../types'

let nextId = 1
const entry = (brand: string, colorName: string): FilamentCatalogEntry => ({
  id: String(nextId++),
  brand,
  material: 'PLA',
  colorName,
  colorHex: '#000000',
})

const CATALOG: FilamentCatalogEntry[] = [
  entry('eSUN', 'Red'),
  entry('eSUN', 'Blue'),
  entry('eSUN', 'Cored'),
]

describe('resolveFilamentToCatalog — word-boundary color matching', () => {
  it('"Esun Cored" TIDAK match entri colorName "Red" (substring "red" di dalam "Cored")', () => {
    const result = resolveFilamentToCatalog('Esun Cored', CATALOG)
    expect(result?.colorName).toBe('Cored')
  })

  it('exact match colorName tetap jalan', () => {
    const result = resolveFilamentToCatalog('Esun Red', CATALOG)
    expect(result?.colorName).toBe('Red')
  })

  it('substring legit di arah colorName.includes(q) tetap jalan (query lebih pendek dari colorName)', () => {
    const catalog: FilamentCatalogEntry[] = [entry('eSUN', 'Fire Engine Red')]
    const result = resolveFilamentToCatalog('Esun Engine', catalog)
    expect(result?.colorName).toBe('Fire Engine Red')
  })

  it('query mengandung nama warna sebagai frasa utuh (bukan substring huruf) tetap match', () => {
    const catalog: FilamentCatalogEntry[] = [entry('eSUN', 'Blue')]
    const result = resolveFilamentToCatalog('Esun Dark Blue', catalog)
    expect(result?.colorName).toBe('Blue')
  })
})
