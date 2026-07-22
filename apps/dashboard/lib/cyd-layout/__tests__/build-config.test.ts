import { describe, it, expect } from 'vitest'
import { validateLayoutConfig } from '../build-config'
import type { LayoutConfigOut } from '../types'

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

  // Regresi nyata (2026-07-23): preset "Detail" (5 baris field) dipakai sebagai override per-sel
  // -> lolos validasi lama -> device nolak SELURUH config diam-diam (parseFieldRows firmware:
  // "reject seluruh config, jangan diam-diam potong"). Publish jadi "tersimpan, device belum
  // konfirmasi" tanpa error yang jelas. Firmware: MAX_CELL_FIELD_ROWS=3.
  it('cell.fields melebihi batas override per-sel (3 baris) -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].cells[1] = {
      printer: 'mars', col: 0, row: 1,
      fields: [['name', 'type'], ['state', 'progress'], ['progressBar'], ['filename']], // 4 > 3
    }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('cell.fields pas di batas (3 baris) -> valid', () => {
    const cfg = validConfig()
    cfg.pages[0].cells[1] = {
      printer: 'mars', col: 0, row: 1,
      fields: [['name'], ['state', 'progress'], ['progressBar']],
    }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(true)
  })

  it('page.fields melebihi batas default per-halaman (8 baris) -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].fields = Array.from({ length: 9 }, () => ['name'])
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('field row melebihi batas 3 field per baris -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].fields = [['name', 'type', 'state', 'progress']] // 4 > 3
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('grid.rows melebihi MAX_GRID_ROWS firmware (8) -> invalid', () => {
    const cfg = validConfig()
    cfg.pages[0].grid = { cols: 6, rows: 9, rowWeights: Array.from({ length: 9 }, () => 1 / 9) }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(false)
  })

  it('grid.rows pas 8 (batas atas) -> valid', () => {
    const cfg = validConfig()
    cfg.pages[0].grid = { cols: 6, rows: 8 }
    const result = validateLayoutConfig(cfg)
    expect(result.valid).toBe(true)
  })
})
