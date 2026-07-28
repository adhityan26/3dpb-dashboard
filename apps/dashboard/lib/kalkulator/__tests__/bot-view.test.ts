import { describe, it, expect } from 'vitest'
import { splitColor, toBotMaterials, toBotPlate, toBotDetail, collectPlateBrands, type PlateRow, type CatalogRow, type KalkulasiRow } from '../bot-view'

function plate(over: Partial<PlateRow> = {}): PlateRow {
  return {
    namaPart: 'Badan', tipe: 'FDM', printer: 'P1S', gramasi: 40, durasiJam: 2,
    materialsJson: null, color: null, filamentHargaId: null, filamentHargaPerGram: null,
    ...over,
  }
}
const catalogRow = (over: Partial<CatalogRow> = {}): CatalogRow =>
  ({ brand: 'Bambu', material: 'PLA Basic', colorName: 'Red', colorHex: '#c12026', ...over })

describe('splitColor', () => {
  it('string diawali # → colorHex', () => {
    expect(splitColor('#c12026')).toEqual({ color: null, colorHex: '#c12026' })
  })

  it('string biasa → color (nama warna)', () => {
    expect(splitColor('Red')).toEqual({ color: 'Red', colorHex: null })
  })

  it('di-trim dulu, spasi depan tidak bikin hex terbaca sebagai nama warna', () => {
    expect(splitColor(' #c12026 ')).toEqual({ color: null, colorHex: '#c12026' })
    expect(splitColor('  Red  ')).toEqual({ color: 'Red', colorHex: null })
  })

  it('null / undefined / string kosong → dua-duanya null', () => {
    expect(splitColor(null)).toEqual({ color: null, colorHex: null })
    expect(splitColor(undefined)).toEqual({ color: null, colorHex: null })
    expect(splitColor('   ')).toEqual({ color: null, colorHex: null })
  })
})

describe('toBotMaterials — multi-material', () => {
  it('satu entry per elemen, isSupport terbawa', () => {
    const p = plate({ materialsJson: JSON.stringify([
      { brand: 'Bambu', material: 'PLA Basic', color: 'Red', gramasi: 40, hargaPerGram: 320 },
      { brand: 'eSUN', material: 'PLA+', color: '#1f1f1f', gramasi: 22, isSupport: true },
    ]) })
    const out = toBotMaterials(p, new Map(), [])
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ brand: 'Bambu', material: 'PLA Basic', color: 'Red', colorHex: null, gramasi: 40, isSupport: false, hargaPerGram: 320 })
    expect(out[1]).toEqual({ brand: 'eSUN', material: 'PLA+', color: null, colorHex: '#1f1f1f', gramasi: 22, isSupport: true, hargaPerGram: null })
  })

  it('elemen bukan objek dibuang, elemen objek ber-gramasi invalid dipertahankan dengan gramasi 0', () => {
    const p = plate({ materialsJson: JSON.stringify([
      42, 'x', null,
      { brand: 'Bambu', material: 'PLA Basic', color: 'Red', gramasi: 'bukan angka' },
    ]) })
    const out = toBotMaterials(p, new Map(), [])
    expect(out).toHaveLength(1)
    expect(out[0].gramasi).toBe(0)
    expect(out[0].brand).toBe('Bambu')
  })

  it('brand/material kosong dinormalisasi jadi null', () => {
    const p = plate({ materialsJson: JSON.stringify([{ brand: '', material: '', color: 'Red', gramasi: 5 }]) })
    const out = toBotMaterials(p, new Map(), [])
    expect(out[0].brand).toBeNull()
    expect(out[0].material).toBeNull()
  })
})

describe('toBotMaterials — jatuh ke legacy', () => {
  const fhMap = new Map([['fh1', { brand: 'eSUN', material: 'PLA+' }]])

  it('materialsJson null → satu entry dari kolom legacy', () => {
    const p = plate({ gramasi: 63, color: '#1f1f1f', filamentHargaId: 'fh1', filamentHargaPerGram: 280 })
    expect(toBotMaterials(p, fhMap, [])).toEqual([
      { brand: 'eSUN', material: 'PLA+', color: null, colorHex: '#1f1f1f', gramasi: 63, isSupport: false, hargaPerGram: 280 },
    ])
  })

  it('tanpa filamentHargaId → brand null, material fallback ke tipe', () => {
    const out = toBotMaterials(plate({ tipe: 'SLA', gramasi: 10 }), fhMap, [])
    expect(out[0].brand).toBeNull()
    expect(out[0].material).toBe('SLA')
  })

  it('filamentHargaId ada tapi barisnya sudah dihapus (map miss) → sama seperti tanpa id', () => {
    const out = toBotMaterials(plate({ filamentHargaId: 'sudah-dihapus' }), fhMap, [])
    expect(out[0].brand).toBeNull()
    expect(out[0].material).toBe('FDM')
  })

  it('hargaPerGram null diteruskan apa adanya, tidak jadi 0', () => {
    expect(toBotMaterials(plate(), fhMap, [])[0].hargaPerGram).toBeNull()
  })

  it('gramasi 0 tetap menghasilkan satu entry, bukan array kosong', () => {
    expect(toBotMaterials(plate({ gramasi: 0 }), fhMap, [])).toHaveLength(1)
  })

  it('materialsJson rusak, bukan array, atau kosong → legacy, tidak melempar', () => {
    for (const bad of ['{bukan json', '{"a":1}', '[]', '"string"']) {
      const out = toBotMaterials(plate({ materialsJson: bad, gramasi: 7 }), fhMap, [])
      expect(out).toHaveLength(1)
      expect(out[0].gramasi).toBe(7)
    }
  })

  it('array yang seluruh elemennya terbuang → legacy, bukan materials kosong', () => {
    const out = toBotMaterials(plate({ materialsJson: JSON.stringify([1, 'x']), gramasi: 9 }), fhMap, [])
    expect(out).toHaveLength(1)
    expect(out[0].gramasi).toBe(9)
  })
})

describe('toBotMaterials — pelengkapan warna dari katalog', () => {
  const cat = [catalogRow()]
  const mm = (over: Record<string, unknown>) =>
    plate({ materialsJson: JSON.stringify([{ brand: 'Bambu', material: 'PLA Basic', gramasi: 1, ...over }]) })

  it('punya hex → nama warna terisi dari katalog', () => {
    const out = toBotMaterials(mm({ color: '#c12026' }), new Map(), cat)
    expect(out[0]).toMatchObject({ color: 'Red', colorHex: '#c12026' })
  })

  it('punya nama → hex terisi dari katalog', () => {
    const out = toBotMaterials(mm({ color: 'Red' }), new Map(), cat)
    expect(out[0]).toMatchObject({ color: 'Red', colorHex: '#c12026' })
  })

  it('perbandingan hex case-insensitive', () => {
    expect(toBotMaterials(mm({ color: '#C12026' }), new Map(), cat)[0].color).toBe('Red')
  })

  it('brand/material beda → katalog TIDAK dipakai (PLA vs PLA HS)', () => {
    const p = plate({ materialsJson: JSON.stringify([{ brand: 'Bambu', material: 'PLA HS', color: '#c12026', gramasi: 1 }]) })
    expect(toBotMaterials(p, new Map(), cat)[0].color).toBeNull()
  })

  it('brand kosong → pelengkapan dilewati', () => {
    const p = plate({ materialsJson: JSON.stringify([{ brand: '', material: 'PLA Basic', color: '#c12026', gramasi: 1 }]) })
    expect(toBotMaterials(p, new Map(), cat)[0].color).toBeNull()
  })

  it('hex duplikat di katalog → tie-break colorName alfabetis, deterministik', () => {
    const dup = [catalogRow({ colorName: 'Scarlet' }), catalogRow({ colorName: 'Crimson' })]
    expect(toBotMaterials(mm({ color: '#c12026' }), new Map(), dup)[0].color).toBe('Crimson')
    expect(toBotMaterials(mm({ color: '#c12026' }), new Map(), [...dup].reverse())[0].color).toBe('Crimson')
  })

  it('brand/material cocok walau beda casing & spasi', () => {
    const p = plate({ materialsJson: JSON.stringify([{ brand: ' bambu ', material: 'pla basic', color: 'Red', gramasi: 1 }]) })
    expect(toBotMaterials(p, new Map(), cat)[0].colorHex).toBe('#c12026')
  })
})

describe('toBotPlate', () => {
  it('gramasiTotal = jumlah gramasi seluruh entry', () => {
    const p = plate({ materialsJson: JSON.stringify([{ brand: 'B', material: 'M', gramasi: 40 }, { brand: 'B', material: 'M', gramasi: 22 }]) })
    expect(toBotPlate(p, new Map(), []).gramasiTotal).toBe(62)
  })

  it('namaPart & printer null diteruskan apa adanya', () => {
    const out = toBotPlate(plate({ namaPart: null, printer: null }), new Map(), [])
    expect(out.namaPart).toBeNull()
    expect(out.printer).toBeNull()
  })

  it('tidak membocorkan kunci internal plate', () => {
    const p = { ...plate(), printerProfileId: 'pp1', materialProfileId: 'mp1', thumbnailKey: 'k', mesinPerJam: 9, id: 'x', kalkulasiId: 'k1' } as unknown as PlateRow
    expect(Object.keys(toBotPlate(p, new Map(), [])).sort())
      .toEqual(['durasiJam', 'gramasiTotal', 'materials', 'namaPart', 'printer', 'tipe'])
  })
})

function row(over: Partial<KalkulasiRow> = {}): KalkulasiRow {
  return {
    id: 'k1', nama: 'Naga', createdAt: new Date('2026-07-20T04:11:02Z'), updatedAt: new Date('2026-07-21T09:02:11Z'),
    batch: 1, marginTier: 'A', status: 'AMAN', testLayerEnabled: true,
    hppProduksi: 18000, hppKomponen: 4000, hppFinishing: 2500, hppTotal: 24500, floorPrice: 30000,
    shopeeA: 52000, shopeeB: 48000, shopeeC: 44000, offlineA: 45000, offlineB: 41000, offlineC: 37000,
    resellerStd: 45000, resellerBulk: 36000, marginShopeeA: 45.6, marginOfflineA: 45.6,
    hargaShopeeAktual: null, hargaOfflineAktual: null, hargaChannelJson: null,
    plates: [], komponenKustom: [], labor: [],
    ...over,
  }
}

describe('toBotDetail', () => {
  it('createdAt/updatedAt jadi string ISO', () => {
    const d = toBotDetail(row(), new Map(), [])
    expect(d.createdAt).toBe('2026-07-20T04:11:02.000Z')
    expect(d.updatedAt).toBe('2026-07-21T09:02:11.000Z')
  })

  it('harga dikelompokkan lengkap semua tier', () => {
    expect(toBotDetail(row(), new Map(), []).harga).toEqual({
      hppProduksi: 18000, hppKomponen: 4000, hppFinishing: 2500, hppTotal: 24500, floorPrice: 30000,
      shopeeA: 52000, shopeeB: 48000, shopeeC: 44000, offlineA: 45000, offlineB: 41000, offlineC: 37000,
      resellerStd: 45000, resellerBulk: 36000, marginShopeeA: 45.6, marginOfflineA: 45.6,
    })
  })

  it('aktual: null tetap null, terisi diteruskan', () => {
    expect(toBotDetail(row(), new Map(), []).aktual).toEqual({ shopee: null, offline: null })
    expect(toBotDetail(row({ hargaShopeeAktual: 55000 }), new Map(), []).aktual).toEqual({ shopee: 55000, offline: null })
  })

  it('komponen & labor dipetakan tanpa id/kalkulasiId', () => {
    const d = toBotDetail(row({
      komponenKustom: [{ nama: 'Gantungan', harga: 1500, qty: 2, id: 'x', kalkulasiId: 'k1' }],
      labor: [{ nama: 'Amplas', jam: 0.5, ratePerJam: 20000, flat: null }],
    } as unknown as Partial<KalkulasiRow>), new Map(), [])
    expect(d.komponen).toEqual([{ nama: 'Gantungan', harga: 1500, qty: 2 }])
    expect(d.labor).toEqual([{ nama: 'Amplas', jam: 0.5, ratePerJam: 20000, flat: null }])
  })

  it('hargaChannelJson null atau rusak → [] (bukan null, bukan key hilang)', () => {
    expect(toBotDetail(row(), new Map(), []).hargaChannel).toEqual([])
    expect(toBotDetail(row({ hargaChannelJson: '{rusak' }), new Map(), []).hargaChannel).toEqual([])
    expect(toBotDetail(row({ hargaChannelJson: '{"a":1}' }), new Map(), []).hargaChannel).toEqual([])
  })

  it('entry hargaChannel di-remap eksplisit — margin tidak ikut bocor', () => {
    const d = toBotDetail(row({
      hargaChannelJson: JSON.stringify([{ channelId: 'shopee', A: 52000, B: 48000, C: 44000, margin: 45.6 }]),
    }), new Map(), [])
    expect(d.hargaChannel).toEqual([{ channelId: 'shopee', A: 52000, B: 48000, C: 44000 }])
  })

  it('tidak membocorkan kunci internal apa pun di seluruh payload', () => {
    const r = {
      ...row({ plates: [plate()] }),
      packingType: 'BUBBLE', hargaChannelJson: null, produkLinks: [{ id: 'pl1' }],
    } as unknown as KalkulasiRow
    const json = JSON.stringify(toBotDetail(r, new Map(), []))
    for (const bocor of ['printerProfileId', 'filamentHargaId', 'materialProfileId', 'thumbnailKey', 'kalkulasiId', 'packingType', 'hargaChannelJson', 'materialsJson', 'produkLinks']) {
      expect(json).not.toContain(bocor)
    }
  })
})

describe('collectPlateBrands', () => {
  const fhMap = new Map([['fh1', { brand: 'eSUN', material: 'PLA+' }]])

  it('kumpulkan brand dari materialsJson dan dari FilamentHarga plate legacy', () => {
    const plates = [
      plate({ materialsJson: JSON.stringify([{ brand: 'Bambu', material: 'PLA Basic', gramasi: 1 }]) }),
      plate({ filamentHargaId: 'fh1' }),
    ]
    expect(collectPlateBrands(plates, fhMap).sort()).toEqual(['Bambu', 'eSUN'])
  })

  it('dedup case-insensitive dan buang yang kosong', () => {
    const plates = [
      plate({ materialsJson: JSON.stringify([{ brand: ' Bambu ', gramasi: 1 }, { brand: 'bambu', gramasi: 1 }, { brand: '', gramasi: 1 }]) }),
    ]
    expect(collectPlateBrands(plates, fhMap)).toHaveLength(1)
  })

  it('tidak ada brand yang diketahui → array kosong (query katalog bisa dilewati)', () => {
    expect(collectPlateBrands([plate()], new Map())).toEqual([])
  })
})
