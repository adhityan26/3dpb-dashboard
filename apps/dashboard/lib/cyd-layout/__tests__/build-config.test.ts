import { describe, it, expect } from 'vitest'
import { buildLayoutConfig, findDuplicatePrinterIds, validateLayoutConfig } from '../build-config'
import type { LayoutConfigOut } from '../types'

describe('buildLayoutConfig', () => {
  it('rakit page rack dari assignment + generate halaman detail otomatis', () => {
    const assignment = {
      topLeft1: 'mars', topLeft2: 'saturn',
      topRight1: 'uranus', topRight2: 'neptune', topRight3: 'moon',
      botLeft1: 'mercury', botLeft2: 'earth',
      botRight2: 'venus', botRight3: 'jupiter',
      ganymede: 'ganymede',
    }
    const cfg = buildLayoutConfig(assignment)

    expect(cfg.schemaVersion).toBe(1)
    const rack = cfg.pages.find((p) => p.id === 'rack')!
    expect(rack.grid).toEqual({ cols: 6, rows: 4, rowWeights: [0.06, 0.32, 0.36, 0.26] })
    expect(rack.cells).toContainEqual({ printer: 'mars', col: 0, row: 1 })
    expect(rack.cells).toContainEqual({ type: 'label', text: 'RAK KIRI', col: 0, row: 0, colSpan: 2 })
    expect(rack.cells.find((c) => c.printer === 'ganymede')).toMatchObject({ col: 0, row: 3, colSpan: 6 })

    const detailPages = cfg.pages.filter((p) => p.id.startsWith('detail-'))
    expect(detailPages.length).toBe(4)  // 10 printer / 3 per halaman = 4 halaman (terakhir sisa 1)
    expect(detailPages[0].cells.map((c) => c.printer)).toEqual(['mars', 'saturn', 'uranus'])
    expect(detailPages[3].cells.map((c) => c.printer)).toEqual(['ganymede'])
  })

  it('slot kosong (tak diisi) tak menghasilkan cell', () => {
    const cfg = buildLayoutConfig({ topLeft1: 'mars' })
    const rack = cfg.pages.find((p) => p.id === 'rack')!
    expect(rack.cells.filter((c) => 'printer' in c)).toHaveLength(1)
  })
})

describe('findDuplicatePrinterIds', () => {
  it('mendeteksi printer id yang dipasang di lebih dari satu slot', () => {
    const duplicates = findDuplicatePrinterIds({
      topLeft1: 'mars', topLeft2: 'mars', topRight1: 'saturn',
    })
    expect(duplicates).toEqual(['mars'])
  })

  it('tidak ada duplikat kalau semua assignment unik atau kosong', () => {
    const duplicates = findDuplicatePrinterIds({
      topLeft1: 'mars', topLeft2: '', topRight1: 'saturn',
    })
    expect(duplicates).toEqual([])
  })

  it('bisa mendeteksi lebih dari satu printer id yang duplikat', () => {
    const duplicates = findDuplicatePrinterIds({
      topLeft1: 'mars', topLeft2: 'mars',
      topRight1: 'saturn', topRight2: 'saturn',
      botLeft1: 'earth',
    })
    expect(duplicates.sort()).toEqual(['mars', 'saturn'])
  })
})

function validConfig(): LayoutConfigOut {
  return {
    schemaVersion: 1,
    pages: [
      {
        id: 'rack',
        grid: { cols: 6, rows: 4, rowWeights: [0.06, 0.32, 0.36, 0.26] },
        fields: [['name'], ['state', 'progress'], ['progressBar']],
        durationSec: 0,
        cells: [
          { type: 'label', text: 'RAK KIRI', col: 0, row: 0, colSpan: 2 },
          { printer: 'mars', col: 0, row: 1 },
          { printer: 'saturn', col: 1, row: 1 },
        ],
      },
    ],
  }
}

describe('validateLayoutConfig', () => {
  it('config valid -> valid: true, config diteruskan apa adanya', () => {
    const cfg = validConfig()
    const result = validateLayoutConfig(cfg)
    expect(result).toEqual({ valid: true, config: cfg })
  })

  it('schemaVersion selain 1 -> invalid', () => {
    const cfg = { ...validConfig(), schemaVersion: 2 }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('pages kosong -> invalid', () => {
    const cfg = { ...validConfig(), pages: [] }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('pages lebih dari MAX_PAGES (8) -> invalid', () => {
    const page = validConfig().pages[0]
    const cfg = { schemaVersion: 1 as const, pages: Array.from({ length: 9 }, (_, i) => ({ ...page, id: `p${i}` })) }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('cells lebih dari MAX_CELLS_PER_PAGE (24) -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].cells = Array.from({ length: 25 }, (_, i) => ({ printer: `p${i}`, col: 0, row: 0 }))
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('rowWeights.length tak sama dengan grid.rows -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].grid.rowWeights = [0.5, 0.5]  // rows=4, cuma 2 weight
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('sum rowWeights <= 0 -> invalid (cegah div-by-zero di firmware)', () => {
    const cfg = validConfig()
    cfg.pages[0].grid.rowWeights = [0, 0, 0, 0]
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('printer id dobel dalam satu halaman -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].cells.push({ printer: 'mars', col: 5, row: 3 })
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('printer id sama muncul di HALAMAN BERBEDA -> valid (bukan duplikat, disengaja)', () => {
    const cfg = validConfig()
    cfg.pages.push({
      id: 'detail-1', grid: { cols: 1, rows: 1 }, fields: [['name']], durationSec: 8,
      cells: [{ printer: 'mars', col: 0, row: 0 }],
    })
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(true)
  })

  it('cell printer tanpa field "printer" terisi -> invalid', () => {
    const cfg = validConfig()
    // @ts-expect-error sengaja kirim cell tak valid
    cfg.pages[0].cells.push({ printer: '', col: 5, row: 3 })
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('cell col+colSpan melebihi grid.cols -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].cells.push({ printer: 'x', col: 5, row: 2, colSpan: 3 })  // 5+3=8 > cols=6
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('bukan object / null -> invalid, tak throw', () => {
    expect(validateLayoutConfig(null).valid).toBe(false)
    expect(validateLayoutConfig('string').valid).toBe(false)
    expect(validateLayoutConfig(42).valid).toBe(false)
  })
})
