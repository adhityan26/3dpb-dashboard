import { describe, it, expect } from 'vitest'
import { HmsLookup, hmsKeyFor, describeError } from '../hms'

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

describe('describeError', () => {
  it('pakai entri HMS pertama kalau ada', () => {
    const l = new HmsLookup({ '1201_8007': 'Extruder clogged.' })
    expect(describeError([{ attr: 0x12018007, code: 66 }], 0, l))
      .toBe('[1201_8007] Extruder clogged.')
  })

  it('ambil entri PERTAMA saja kalau HMS lebih dari 1 (tidak digabung)', () => {
    const l = new HmsLookup({
      '1201_8007': 'Extruder clogged.',
      '0c00_0100': 'Bed temperature abnormal.',
    })
    expect(describeError(
      [{ attr: 0x12018007, code: 66 }, { attr: 0x0c000100, code: 1 }], 0, l,
    )).toBe('[1201_8007] Extruder clogged.')
  })

  it('fallback kode print_error kalau HMS kosong tapi printError != 0', () => {
    const l = new HmsLookup({})
    expect(describeError([], 117473285, l)).toBe('Print error (kode 117473285)')
  })

  it('fallback generik kalau HMS kosong dan printError 0 (kasus Moonraker)', () => {
    const l = new HmsLookup({})
    expect(describeError([], 0, l)).toBe('Print error')
  })

  it('dipotong ke 240 karakter + ellipsis kalau lebih panjang', () => {
    const longDesc = 'A'.repeat(300)
    const l = new HmsLookup({ '1201_8007': longDesc })
    const result = describeError([{ attr: 0x12018007, code: 66 }], 0, l)
    expect(result.length).toBe(240)
    expect(result.endsWith('…')).toBe(true)
    expect(result.startsWith('[1201_8007] AAAA')).toBe(true)
  })

  it('HMS ada tapi kode-nya tidak ada di tabel -- fallback ke kode printError, BUKAN raw fallback string', () => {
    const l = new HmsLookup({}) // tabel kosong -> translate() balikin raw fallback form utk entri ini
    expect(describeError([{ attr: 0x0c000100, code: 65540 }], 117473285, l))
      .toBe('Print error (kode 117473285)')
  })

  // Kasus nyata (sniff MQTT langsung ke printer, 2026-08-09, "AMS filament ran out" -- lihat
  // screenshot Bambu Connect user): print_error SENDIRI meng-encode kode HMS dgn skema attr
  // yang SAMA (upper16_lower16), TERPISAH dari array hms[] (yang saat itu berisi 1 entri LAIN
  // yang tak terkait dgn alasan pause sebenarnya). describeError() sebelumnya CUMA coba
  // translate hms[], print_error cuma dipakai sbg angka mentah di fallback -- makanya user
  // lihat "Print error (kode 117473297)" padahal tabel kita PUNYA terjemahan yang persis sama
  // dengan Bambu Connect utk kode itu (0x07008011 = "0700_8011").
  it('print_error sendiri encode kode HMS valid (skema attr sama) -- tetap di-translate walau hms[] kosong', () => {
    const l = new HmsLookup({ '0700_8011': 'AMS filament ran out. Please insert a new filament into the same AMS slot.' })
    expect(describeError([], 117473297, l))
      .toBe('[0700_8011] AMS filament ran out. Please insert a new filament into the same AMS slot.')
  })

  it('hms[] bawa entri LAIN yang tak ada di tabel (notice tak terkait) TAPI print_error cocok -- print_error yang dipakai, bukan berhenti di raw fallback hms', () => {
    const l = new HmsLookup({ '0700_8011': 'AMS filament ran out.' })
    // attr 0x07002100 (dari hms[] printer sungguhan) SENGAJA tak ada di tabel injeksi ini --
    // mensimulasikan notice HMS lain yang aktif bersamaan, tak terkait alasan pause sebenarnya.
    expect(describeError([{ attr: 0x07002100, code: 131073 }], 117473297, l))
      .toBe('[0700_8011] AMS filament ran out.')
  })
})
