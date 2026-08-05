import { describe, it, expect } from 'vitest'
import { crc16ccitt, buildDynamicQris } from './qris'

describe('crc16ccitt', () => {
  it('matches the standard CRC-16/CCITT-FALSE conformance test vector', () => {
    // Well-known reference test vector for this CRC variant:
    // CRC-16/CCITT-FALSE("123456789") = 0x29B1
    expect(crc16ccitt('123456789')).toBe('29B1')
  })
})

describe('buildDynamicQris', () => {
  // Hand-built minimal static QRIS payload (not a real merchant, structurally valid EMVCo TLV):
  // 00 02 "01"              Payload Format Indicator
  // 01 02 "11"              Point of Initiation Method (static)
  // 52 04 "0411"            Merchant Category Code
  // 53 03 "360"             Transaction Currency (IDR)
  // 58 02 "ID"               Country Code
  // 59 12 "TESTMERCHANT"    Merchant Name (12 chars)
  // 60 07 "JAKARTA"          Merchant City
  // 63 04 "ABCD"             CRC placeholder (garbage — buildDynamicQris must discard and recompute, not trust it)
  const staticPayload =
    '000201' +
    '010211' +
    '52040411' +
    '5303360' +
    '5802ID' +
    '5912TESTMERCHANT' +
    '6007JAKARTA' +
    '6304ABCD'

  it('throws on a non-positive amount', () => {
    expect(() => buildDynamicQris(staticPayload, 0)).toThrow()
    expect(() => buildDynamicQris(staticPayload, -100)).toThrow()
    expect(() => buildDynamicQris(staticPayload, NaN)).toThrow()
  })

  it('switches the Point of Initiation Method from static (11) to dynamic (12)', () => {
    const result = buildDynamicQris(staticPayload, 50000)
    expect(result).toContain('010212')
    expect(result).not.toContain('010211')
  })

  it('inserts the transaction amount as tag 54 with the correct TLV length prefix', () => {
    const result = buildDynamicQris(staticPayload, 50000)
    // "50000" is 5 chars -> length prefix "05"
    expect(result).toContain('540550000')
  })

  it('formats a non-integer amount to 2 decimal places', () => {
    const result = buildDynamicQris(staticPayload, 15000.5)
    // "15000.50" is 8 chars -> length prefix "08"
    expect(result).toContain('540815000.50')
  })

  it('keeps fields in ascending tag order (00, 01, 52, 53, 54, 58, 59, 60, 63)', () => {
    const result = buildDynamicQris(staticPayload, 50000)
    const tagOrder = ['00', '01', '52', '53', '54', '58', '59', '60', '63']
    let searchFrom = 0
    for (const tag of tagOrder) {
      const idx = result.indexOf(tag, searchFrom)
      expect(idx).toBeGreaterThanOrEqual(searchFrom)
      searchFrom = idx + 2
    }
  })

  it('recomputes the CRC over the new payload rather than reusing the stale one', () => {
    const result = buildDynamicQris(staticPayload, 50000)
    expect(result.slice(-8, -4)).toBe('6304')
    const withoutCrc = result.slice(0, -4)
    expect(result.slice(-4)).toBe(crc16ccitt(withoutCrc))
    expect(result.slice(-4)).not.toBe('ABCD') // the garbage CRC from the input must not survive
  })

  it('drops a pre-existing tag 54 before inserting the new one (idempotent re-conversion)', () => {
    const alreadyDynamic = buildDynamicQris(staticPayload, 50000)
    const reconverted = buildDynamicQris(alreadyDynamic, 75000)
    expect(reconverted).toContain('540575000')
    expect(reconverted).not.toContain('540550000')
    // exactly one tag 54 field: match tag (54) + 2-digit length prefix (tag boundary awareness)
    const tag54Matches = reconverted.match(/54\d{2}/g) || []
    expect(tag54Matches.length).toBe(1)
  })
})
