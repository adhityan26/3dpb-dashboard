import { describe, it, expect } from 'vitest'
import { cariWarna, type KatalogRow } from '../color-lookup'

const row = (brand: string, material: string, colorName: string, colorHex: string): KatalogRow =>
  ({ brand, material, colorName, colorHex })

const KATALOG: KatalogRow[] = [
  row('eSUN', 'PLA', 'Red', '#c12026'),
  row('eSUN', 'PLA+', 'Red', '#c12026'),
  row('eSUN', 'PETG', 'Red', '#c12026'),
  row('eSUN', 'PLA', 'Fire Engine Red', '#cc0000'),
  row('Bambu Lab', 'PLA Basic', 'Purple', '#a06eea'),
  row('Bambu Lab', 'PLA Basic', 'Black', '#000000'),
  row('3DJAKE', 'PLA', 'Black', '#000000'),
  row('3DJAKE', 'ASA', 'Black', '#414040'),
]

/** Non-null: tidak ada pemanggilan di helper ini yang memakai hex tidak valid —
 *  kasus itu memanggil cariWarna langsung supaya null-nya bisa diuji. */
const opts = (o: Partial<Parameters<typeof cariWarna>[1]> = {}) =>
  cariWarna(KATALOG, { limit: 5, ...o })!

describe('mode nama', () => {
  it('substring colorName case-insensitive', () => {
    const r = opts({ q: 'red' })
    expect(r.mode).toBe('nama')
    expect(r.items.map(i => i.colorName)).toEqual(['Fire Engine Red', 'Red'])
  })

  it('deltaE null dan exact null di mode nama', () => {
    const item = opts({ q: 'purple' }).items[0]
    expect(item.deltaE).toBeNull()
    expect(item.exact).toBeNull()
  })

  it('brand mempersempit', () => {
    expect(opts({ q: 'black', brand: 'bambu' }).items).toHaveLength(1)
  })

  it('brand sendirian = browse semua warna brand itu', () => {
    const r = opts({ brand: 'bambu' })
    expect(r.total).toBe(2)
    expect(r.items.map(i => i.colorName)).toEqual(['Black', 'Purple'])
  })

  it('material mempersempit', () => {
    expect(opts({ q: 'red', material: 'petg' }).items.map(i => i.materials)).toEqual([['PETG']])
  })
})

describe('dedup lintas material', () => {
  it('nama + hex sama di beberapa material → satu hasil, materials terurut', () => {
    const item = opts({ q: 'red', brand: 'esun' }).items.find(i => i.colorName === 'Red')!
    expect(item.materials).toEqual(['PETG', 'PLA', 'PLA+'])
  })

  it('nama sama tapi hex beda → dua hasil terpisah', () => {
    const r = opts({ q: 'black', brand: '3djake' })
    expect(r.items).toHaveLength(2)
    expect(r.items.map(i => i.colorHex)).toEqual(['#000000', '#414040'])
  })
})

describe('mode hex', () => {
  it('urut ΔE menaik, yang identik dapat exact true', () => {
    const r = opts({ hex: '#000000', limit: 5 })
    expect(r.mode).toBe('hex')
    for (let i = 1; i < r.items.length; i++) {
      expect(r.items[i].deltaE!).toBeGreaterThanOrEqual(r.items[i - 1].deltaE!)
    }
    // exact benar persis untuk yang hex-nya identik — dan boleh lebih dari satu,
    // karena merek berbeda bisa memakai hex yang sama (Bambu Lab & 3DJAKE Black).
    for (const item of r.items) {
      expect(item.exact).toBe(item.colorHex.toLowerCase() === '#000000')
      if (item.exact) expect(item.deltaE).toBe(0)
    }
    expect(r.items.filter(i => i.exact)).toHaveLength(2)
  })

  it('hex tanpa # dan 8 digit tetap dikenali sebagai identik', () => {
    expect(opts({ hex: 'c12026' }).items[0].exact).toBe(true)
    expect(opts({ hex: '#c12026ff' }).items[0].exact).toBe(true)
  })

  it('mendekati #aa67eb di Bambu Lab → Purple, bukan Black', () => {
    expect(opts({ hex: '#aa67eb', brand: 'bambu' }).items[0].colorName).toBe('Purple')
  })

  it('q dan hex boleh digabung', () => {
    const r = opts({ q: 'red', hex: '#cc0000' })
    expect(r.mode).toBe('hex')
    expect(r.items.every(i => i.colorName.toLowerCase().includes('red'))).toBe(true)
    expect(r.items[0].colorName).toBe('Fire Engine Red')
  })

  it('hex acuan tidak valid → null (pemanggil yang memutuskan 400)', () => {
    expect(cariWarna(KATALOG, { hex: 'merah', limit: 5 })).toBeNull()
  })
})

describe('colorHex katalog rusak', () => {
  const rusak = [...KATALOG, row('Weird', 'PLA', 'Broken', 'bukan-hex')]

  it('dikeluarkan dari mode hex', () => {
    const r = cariWarna(rusak, { hex: '#000000', limit: 20 })!
    expect(r.items.some(i => i.colorName === 'Broken')).toBe(false)
  })

  it('tetap ketemu di mode nama', () => {
    const r = cariWarna(rusak, { q: 'broken', limit: 20 })!
    expect(r.items).toHaveLength(1)
  })

  it('tidak dihitung di total mode hex, tapi dihitung di mode nama', () => {
    expect(cariWarna(rusak, { brand: 'weird', hex: '#000000', limit: 20 })!.total).toBe(0)
    expect(cariWarna(rusak, { brand: 'weird', limit: 20 })!.total).toBe(1)
  })
})

describe('total, katalogTotal, limit', () => {
  it('total = grup setelah dedup sebelum limit; items dipotong limit', () => {
    const r = opts({ q: 'red', brand: 'esun', limit: 1 })
    expect(r.total).toBe(2)
    expect(r.items).toHaveLength(1)
  })

  it('katalogTotal = seluruh baris katalog, tidak terpengaruh filter', () => {
    expect(opts({ brand: 'bambu' }).katalogTotal).toBe(KATALOG.length)
  })

  it('katalog kosong → total 0 dan katalogTotal 0', () => {
    const r = cariWarna([], { q: 'red', limit: 5 })!
    expect(r.total).toBe(0)
    expect(r.katalogTotal).toBe(0)
  })
})

describe('param kosong dan determinisme', () => {
  it('q/brand/material kosong atau spasi dianggap tidak dikirim', () => {
    expect(opts({ q: '   ', brand: 'bambu' }).total).toBe(2)
    expect(opts({ q: 'red', material: '  ' }).total).toBe(2)
  })

  it('urutan deterministik walau brand+colorName identik (hex jadi kunci ketiga)', () => {
    const maju = cariWarna(KATALOG, { q: 'black', brand: '3djake', limit: 5 })!
    const mundur = cariWarna([...KATALOG].reverse(), { q: 'black', brand: '3djake', limit: 5 })!
    expect(maju.items.map(i => i.colorHex)).toEqual(mundur.items.map(i => i.colorHex))
  })
})
