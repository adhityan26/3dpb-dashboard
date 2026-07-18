import { describe, it, expect } from 'vitest'
import { buildLayoutConfig, findDuplicatePrinterIds } from '../build-config'

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
