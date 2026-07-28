import { describe, it, expect } from 'vitest'
import { parseHex, rgbToLab, deltaE2000 } from '../color-distance'

describe('parseHex', () => {
  it('6 digit, dengan atau tanpa #, case bebas', () => {
    expect(parseHex('#c12026')).toEqual([193, 32, 38])
    expect(parseHex('c12026')).toEqual([193, 32, 38])
    expect(parseHex('#C12026')).toEqual([193, 32, 38])
  })

  it('3 digit diekspansi', () => {
    expect(parseHex('#f0a')).toEqual([255, 0, 170])
  })

  it('8 digit: alpha diabaikan, bukan ditolak', () => {
    expect(parseHex('#c12026ff')).toEqual([193, 32, 38])
    expect(parseHex('#c1202600')).toEqual([193, 32, 38])
  })

  it('di-trim dulu', () => {
    expect(parseHex('  #c12026  ')).toEqual([193, 32, 38])
  })

  it('input tidak valid → null', () => {
    for (const bad of ['merah', '', '   ', '#12345', '#1234567', 'zzzzzz', '#gg0000']) {
      expect(parseHex(bad)).toBeNull()
    }
    expect(parseHex(null)).toBeNull()
    expect(parseHex(undefined)).toBeNull()
  })
})

describe('rgbToLab', () => {
  it('putih dan hitam', () => {
    const putih = rgbToLab([255, 255, 255])
    expect(putih[0]).toBeCloseTo(100, 1)
    expect(putih[1]).toBeCloseTo(0, 1)
    expect(putih[2]).toBeCloseTo(0, 1)
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 1)
  })

  // Anchor mid-tone: inilah yang menangkap lupa-linearisasi-gamma. Tanpa
  // linearisasi, putih tetap 100 dan hitam tetap 0, tapi abu-abu meleset jauh
  // (128/255 = 50.2% → L 53.59 kalau benar, ~50 kalau gamma dilewat).
  it('abu-abu #808080 → L≈53.59, netral', () => {
    const [L, a, b] = rgbToLab([128, 128, 128])
    expect(L).toBeCloseTo(53.59, 1)
    expect(a).toBeCloseTo(0, 1)
    expect(b).toBeCloseTo(0, 1)
  })

  it('merah #FF0000 → L≈53.23, a≈80.11, b≈67.22', () => {
    const [L, a, b] = rgbToLab([255, 0, 0])
    expect(L).toBeCloseTo(53.23, 1)
    expect(a).toBeCloseTo(80.11, 1)
    expect(b).toBeCloseTo(67.22, 1)
  })
})

/** Data referensi Sharma, Wu & Dalal — "The CIEDE2000 Color-Difference Formula:
 *  Implementation Notes, Supplementary Test Data, and Mathematical Observations".
 *  Seluruh 34 pasang dipakai: pasangan 10–17 justru yang menguji pembungkusan
 *  sudut hue, bagian yang paling mudah salah. */
const SHARMA: [number, number, number, number, number, number, number][] = [
  [50.0000, 2.6772, -79.7751, 50.0000, 0.0000, -82.7485, 2.0425],
  [50.0000, 3.1571, -77.2803, 50.0000, 0.0000, -82.7485, 2.8615],
  [50.0000, 2.8361, -74.0200, 50.0000, 0.0000, -82.7485, 3.4412],
  [50.0000, -1.3802, -84.2814, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -1.1848, -84.8006, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, -0.9009, -85.5211, 50.0000, 0.0000, -82.7485, 1.0000],
  [50.0000, 0.0000, 0.0000, 50.0000, -1.0000, 2.0000, 2.3669],
  [50.0000, -1.0000, 2.0000, 50.0000, 0.0000, 0.0000, 2.3669],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0009, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0010, 7.1792],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0011, 7.2195],
  [50.0000, 2.4900, -0.0010, 50.0000, -2.4900, 0.0012, 7.2195],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0009, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0010, -2.4900, 4.8045],
  [50.0000, -0.0010, 2.4900, 50.0000, 0.0011, -2.4900, 4.7461],
  [50.0000, 2.5000, 0.0000, 50.0000, 0.0000, -2.5000, 4.3065],
  [50.0000, 2.5000, 0.0000, 73.0000, 25.0000, -18.0000, 27.1492],
  [50.0000, 2.5000, 0.0000, 61.0000, -5.0000, 29.0000, 22.8977],
  [50.0000, 2.5000, 0.0000, 56.0000, -27.0000, -3.0000, 31.9030],
  [50.0000, 2.5000, 0.0000, 58.0000, 24.0000, 15.0000, 19.4535],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.1736, 0.5854, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2972, 0.0000, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 1.8634, 0.5757, 1.0000],
  [50.0000, 2.5000, 0.0000, 50.0000, 3.2592, 0.3350, 1.0000],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.2630],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.2480, -4.9620, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619, 2.0373],
  [36.4612, 47.8580, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.4410, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.1350, 0.9033, -0.0636, -0.5514, 0.9082],
]

describe('deltaE2000', () => {
  it('cocok dengan seluruh 34 pasang data referensi Sharma', () => {
    expect(SHARMA).toHaveLength(34)
    for (const [L1, a1, b1, L2, a2, b2, expected] of SHARMA) {
      expect(deltaE2000([L1, a1, b1], [L2, a2, b2])).toBeCloseTo(expected, 4)
    }
  })

  it('simetris — urutan argumen tidak mengubah hasil', () => {
    const x: [number, number, number] = [50, 2.5, 0]
    const y: [number, number, number] = [73, 25, -18]
    expect(deltaE2000(x, y)).toBeCloseTo(deltaE2000(y, x), 10)
  })

  it('warna identik → tepat 0', () => {
    expect(deltaE2000([61.29, 3.71, -5.39], [61.29, 3.71, -5.39])).toBe(0)
  })
})

describe('regresi: kenapa Lab, bukan jarak RGB', () => {
  const rgbDist = (a: [number, number, number], b: [number, number, number]) =>
    Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)

  it('#aa67eb lebih dekat ke ungu tua daripada ke abu-abu — kebalikan dari jarak RGB', () => {
    const acuan = parseHex('#aa67eb')!
    const abu = parseHex('#999999')!
    const ungu = parseHex('#6a0dad')!

    // Jarak RGB memilih abu-abu — inilah jawaban salah yang kita hindari.
    expect(rgbDist(acuan, abu)).toBeLessThan(rgbDist(acuan, ungu))

    // ΔE2000 memilih ungu.
    const keAbu = deltaE2000(rgbToLab(acuan), rgbToLab(abu))
    const keUngu = deltaE2000(rgbToLab(acuan), rgbToLab(ungu))
    expect(keUngu).toBeLessThan(keAbu)
  })
})
