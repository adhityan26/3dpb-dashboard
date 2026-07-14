import { describe, it, expect } from 'vitest'
import { composeKomponen, splitPackingRow } from '../form-v2'

const packing = { S: 1500, M: 2500, L: 5000, XL: 8000 }

describe('composeKomponen', () => {
  it('packing terpilih jadi item pertama', () => {
    expect(composeKomponen('M', packing, [{ id: '1', nama: 'LED', harga: 5000, qty: 2 }])).toEqual([
      { nama: 'Packing M', harga: 2500, qty: 1 },
      { nama: 'LED', harga: 5000, qty: 2 },
    ])
  })
  it('tanpa packing & baris invalid dibuang (nama kosong / harga 0), qty min 1', () => {
    expect(composeKomponen(undefined, packing, [
      { id: '1', nama: '', harga: 100, qty: 1 },
      { id: '2', nama: 'X', harga: 0, qty: 1 },
      { id: '3', nama: 'Y', harga: 10, qty: 0 },
    ])).toEqual([{ nama: 'Y', harga: 10, qty: 1 }])
  })
})

describe('splitPackingRow', () => {
  it('record lama (kolom packingType terisi) → chip dari kolom, rows utuh', () => {
    const r = splitPackingRow('L', [{ nama: 'Gantungan ring', harga: 800, qty: 1 }])
    expect(r).toEqual({ packingType: 'L', rows: [{ nama: 'Gantungan ring', harga: 800, qty: 1 }] })
  })
  it('record bentuk baru (kolom null) → angkat baris "Packing X"', () => {
    const r = splitPackingRow(null, [{ nama: 'Packing M', harga: 2500, qty: 1 }, { nama: 'LED', harga: 5000, qty: 1 }])
    expect(r).toEqual({ packingType: 'M', rows: [{ nama: 'LED', harga: 5000, qty: 1 }] })
  })
  it('tanpa baris packing → undefined', () => {
    expect(splitPackingRow(null, [{ nama: 'LED', harga: 5000, qty: 1 }])).toEqual({ rows: [{ nama: 'LED', harga: 5000, qty: 1 }] })
  })
})
