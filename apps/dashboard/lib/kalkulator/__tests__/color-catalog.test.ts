import { describe, it, expect } from 'vitest'
import { catalogMatchesFilament, findCatalogColorsForFilament, findCatalogColorName, sortCatalogColors } from '../color-catalog'
import type { FilamentCatalogEntry } from '@/lib/filamen/types'

describe('catalogMatchesFilament', () => {
  it('matches substring dua arah, case-insensitive', () => {
    expect(catalogMatchesFilament('Bambu Lab', 'BambuLab')).toBe(false) // beda literal, tanpa spasi tidak substring
    expect(catalogMatchesFilament('PLA', 'PLA Basic')).toBe(true)
    expect(catalogMatchesFilament('pla basic', 'PLA')).toBe(true)
    expect(catalogMatchesFilament('esun', 'eSUN')).toBe(true)
  })

  it('return true kalau salah satu field kosong (ga nge-filter apa-apa)', () => {
    expect(catalogMatchesFilament('', 'PLA')).toBe(true)
    expect(catalogMatchesFilament('PLA', '')).toBe(true)
  })
})

function entry(over: Partial<FilamentCatalogEntry> = {}): FilamentCatalogEntry {
  return { id: 'x', brand: 'eSUN', material: 'PLA+', colorName: 'Merah', colorHex: '#FF0000', ...over }
}

describe('findCatalogColorsForFilament', () => {
  const catalog = {
    'eSUN': {
      'PLA+': [entry({ id: 'a', colorName: 'Merah', colorHex: '#FF0000' }), entry({ id: 'b', colorName: 'Biru', colorHex: '#0000FF' })],
      'ABS': [entry({ id: 'c', material: 'ABS', colorName: 'Hitam', colorHex: '#000000' })],
    },
    'Bambu Lab': {
      'PLA': [entry({ id: 'd', brand: 'Bambu Lab', material: 'PLA', colorName: 'Putih', colorHex: '#FFFFFF' })],
    },
  }

  it('cuma ambil entries yang brand DAN material-nya fuzzy-match', () => {
    const result = findCatalogColorsForFilament(catalog, 'eSUN', 'PLA+')
    expect(result.map(e => e.id).sort()).toEqual(['a', 'b'])
  })

  it('material beda (ABS) ga ikut kebawa walau brand sama', () => {
    const result = findCatalogColorsForFilament(catalog, 'eSUN', 'PLA+')
    expect(result.some(e => e.id === 'c')).toBe(false)
  })

  it('brand kosong → match by material aja', () => {
    const result = findCatalogColorsForFilament(catalog, '', 'PLA+')
    expect(result.map(e => e.id).sort()).toEqual(['a', 'b', 'd']) // 'PLA+' substring-matches 'PLA' (Bambu Lab entry)
  })

  it('ga ada yang match → array kosong', () => {
    expect(findCatalogColorsForFilament(catalog, 'Sunlu', 'TPU')).toEqual([])
  })
})

describe('findCatalogColorName', () => {
  const catalog = {
    'eSUN': {
      'PLA+': [entry({ id: 'a', brand: 'eSUN', material: 'PLA+', colorName: 'Merah PLA+', colorHex: '#FF0000' })],
      'PLA': [entry({ id: 'b', brand: 'eSUN', material: 'PLA', colorName: 'Merah PLA', colorHex: '#FF0000' })],
      'PLA HS': [entry({ id: 'c', brand: 'eSUN', material: 'PLA HS', colorName: 'Merah PLA HS', colorHex: '#FF0000' })],
    },
  }

  it('hex sama tapi material beda (PLA vs PLA+ vs PLA HS) → cuma nama yang material-nya EXACT match yang dipakai', () => {
    expect(findCatalogColorName(catalog, 'eSUN', 'PLA+', '#FF0000')).toBe('Merah PLA+')
    expect(findCatalogColorName(catalog, 'eSUN', 'PLA HS', '#FF0000')).toBe('Merah PLA HS')
    expect(findCatalogColorName(catalog, 'eSUN', 'PLA', '#FF0000')).toBe('Merah PLA')
  })

  it('match EXACT, bukan fuzzy — "PLA" tidak boleh nyangkut ke "PLA HS" walau substring cocok', () => {
    // Kalau ini pakai fuzzy substring match (kayak findCatalogColorsForFilament), query
    // material="PLA HS" bisa salah ke-match entry material="PLA" (karena "PLA HS".includes("PLA")).
    expect(findCatalogColorName(catalog, 'eSUN', 'PLA HS', '#FF0000')).not.toBe('Merah PLA')
    expect(findCatalogColorName(catalog, 'eSUN', 'PLA', '#FF0000')).not.toBe('Merah PLA HS')
  })

  it('case-insensitive tapi tetap exact match (bukan substring)', () => {
    expect(findCatalogColorName(catalog, 'esun', 'pla+', '#ff0000')).toBe('Merah PLA+')
  })

  it('hex ga ada yang exact match → null (walau warna terdekat ada)', () => {
    expect(findCatalogColorName(catalog, 'eSUN', 'PLA+', '#FF0001')).toBeNull()
  })

  it('hex kosong → null', () => {
    expect(findCatalogColorName(catalog, 'eSUN', 'PLA+', '')).toBeNull()
  })

  it('brand/material ga match sama sekali → null', () => {
    expect(findCatalogColorName(catalog, 'Sunlu', 'ABS', '#FF0000')).toBeNull()
  })
})

describe('sortCatalogColors', () => {
  const entries = [
    entry({ id: 'a', colorName: 'Zebra Putih', colorHex: '#FFFFFF' }),
    entry({ id: 'b', colorName: 'Abu Gelap', colorHex: '#333333' }),
    entry({ id: 'c', colorName: 'Merah', colorHex: '#FF0000' }),
  ]

  it('referenceColor valid → sort by jarak RGB terdekat dulu', () => {
    const sorted = sortCatalogColors(entries, '#111111') // paling deket ke Abu Gelap (#333333)
    expect(sorted.map(e => e.id)).toEqual(['b', 'c', 'a']) // b(59px), c(239px), a(412px)
  })

  it('referenceColor undefined/invalid → sort alfabetis by colorName', () => {
    expect(sortCatalogColors(entries, undefined).map(e => e.id)).toEqual(['b', 'c', 'a']) // Abu, Merah, Zebra
    expect(sortCatalogColors(entries, 'bukan-hex').map(e => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('tidak memodifikasi array input (return array baru)', () => {
    const original = [...entries]
    sortCatalogColors(entries, undefined)
    expect(entries).toEqual(original)
  })

  it('referenceColor 8-digit hex (valid format, unparseable by hexToRgb) → fallback ke alfabetis, bukan no-op', () => {
    const sorted = sortCatalogColors(entries, '#11111100') // isValidHexColor(...) === true, tapi hexToRgb tidak bisa parse 8-digit
    expect(sorted.map(e => e.id)).toEqual(['b', 'c', 'a']) // sama seperti hasil alfabetis (Abu, Merah, Zebra)
  })
})
