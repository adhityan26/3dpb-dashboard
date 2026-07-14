import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    kalkulasiHarga: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), delete: vi.fn() },
    kalkulasiPlate: { deleteMany: vi.fn() },
    komponenKustom: { deleteMany: vi.fn() },
    kalkulasiLabor: { deleteMany: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
}))
vi.mock('@/lib/kalkulator/rates', () => ({ loadRates: vi.fn() }))
vi.mock('@/lib/kalkulator/settings-v2', () => ({ loadSettingsV2: vi.fn() }))
vi.mock('@/lib/kalkulator/profiles-service', () => ({ listPrinterProfiles: vi.fn(), listMaterialProfiles: vi.fn() }))

import { prisma } from '@/lib/db'
import { loadRates } from '@/lib/kalkulator/rates'
import { loadSettingsV2 } from '@/lib/kalkulator/settings-v2'
import { listPrinterProfiles, listMaterialProfiles } from '@/lib/kalkulator/profiles-service'
import type { PrinterProfileData } from '@/lib/kalkulator/profiles-service'
import { createKalkulasi, duplicateKalkulasi, listKalkulasi, getKalkulasi, parsePagination } from '../service'
import type { KalkulatorRates, SettingsV2 } from '@3pb/kalkulator-core'

type MockedPrisma = {
  kalkulasiHarga: { create: Mock; update: Mock; findUnique: Mock; findMany: Mock; count: Mock; delete: Mock }
  kalkulasiPlate: { deleteMany: Mock }
  komponenKustom: { deleteMany: Mock }
  kalkulasiLabor: { deleteMany: Mock }
  $transaction: Mock
}
const db = prisma as unknown as MockedPrisma

const RATES: KalkulatorRates = {
  fdmHppPerGram: 300, fdmJualPerGram: 900, slaHppPerGram: 1750, slaJualPerGram: 3500,
  mesinPerJam: 4000, adminEcommerce: 1.2,
  packing: { S: 1500, M: 2500 }, gantungan: {}, switchPerPcs: 2500, labelPerLembar: 750,
  failureRatePct: 0, failureSpreadPct: 50, testLayerPct: 0,
  preparerRatePerJam: 35000, finisherRatePerJam: 75000, helmConsumablesDefault: 55000,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
}
const SETTINGS: SettingsV2 = {
  failureSpreadPct: 50, testLayerPct: 0,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
  channels: [{ id: 'offline', nama: 'Offline', feeMultiplier: 1 }, { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadRates).mockResolvedValue(RATES)
  vi.mocked(loadSettingsV2).mockResolvedValue(SETTINGS)
  vi.mocked(listPrinterProfiles).mockResolvedValue([
    { id: 'p1', nama: 'P1P', mesinPerJam: 3000, isDefault: true, isPricingReference: false, watt: null, tarifPerKwh: null, hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null },
  ] satisfies PrinterProfileData[])
  vi.mocked(listMaterialProfiles).mockResolvedValue([])
  db.kalkulasiHarga.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    ...args.data, id: 'k1', createdAt: new Date(), updatedAt: new Date(),
    plates: [], komponenKustom: [], labor: [], produkLinks: [],
  }))
})

describe('createKalkulasi (jalur v2)', () => {
  it('komponen & labor dipersist sebagai rows; kolom v2 plate & hargaChannelJson terisi; packingType selalu null', async () => {
    await createKalkulasi({
      nama: 'V2', batch: 1, marginTier: 'A',
      plates: [{ tipe: 'FDM', gramasi: 10, durasiJam: 1, printerProfileId: 'p1' }],
      komponen: [{ nama: 'Packing S', harga: 1500, qty: 1 }],
      labor: [{ nama: 'Sanding', jam: 1, ratePerJam: 35000 }],
    })
    const data = db.kalkulasiHarga.create.mock.calls[0][0].data
    expect(data.labor.create).toEqual([{ urutan: 1, nama: 'Sanding', jam: 1, ratePerJam: 35000, flat: null }])
    expect(data.komponenKustom.create).toEqual([{ nama: 'Packing S', harga: 1500, qty: 1 }])
    expect(data.plates.create[0]).toMatchObject({ printerProfileId: 'p1', mesinPerJam: 3000 })
    expect(typeof data.hargaChannelJson).toBe('string')
    expect(data.packingType).toBeNull()
    // hppProduksi: mat 10×300 + mesin profil 1×3000 = 6000
    expect(data.hppProduksi).toBe(6000)
  })

  it('komponen: [] & labor: [] (boleh kosong) → rows kosong, tidak error', async () => {
    await createKalkulasi({
      nama: 'Kosong', batch: 1, marginTier: 'A',
      plates: [{ tipe: 'FDM', gramasi: 10, durasiJam: 1 }],
      komponen: [], labor: [],
    })
    const data = db.kalkulasiHarga.create.mock.calls[0][0].data
    expect(data.komponenKustom.create).toEqual([])
    expect(data.labor.create).toEqual([])
  })
})

describe('duplicateKalkulasi', () => {
  const plateRaw = {
    id: 'pl1', kalkulasiId: 'src1', urutan: 1, namaPart: null, tipe: 'FDM', printer: null,
    gramasi: 10, materialsJson: null, durasiJam: 1, filamentHargaId: null, filamentHargaPerGram: null,
    printerProfileId: null, materialProfileId: null, mesinPerJam: null,
  }

  it('sumber record LAMA (packingType kolom terisi, tanpa baris Packing) → unshift baris Packing dari rates', async () => {
    db.kalkulasiHarga.findUnique.mockResolvedValue({
      id: 'src1', nama: 'Old', createdAt: new Date(), updatedAt: new Date(),
      batch: 2, marginTier: 'A', hargaShopeeAktual: null, hargaOfflineAktual: null,
      packingType: 'M',
      plates: [plateRaw],
      komponenKustom: [{ id: 'kk1', kalkulasiId: 'src1', nama: 'Gantungan ring', harga: 800, qty: 1 }],
      labor: [], produkLinks: [], hargaChannelJson: null,
    })

    await duplicateKalkulasi('src1', 'Old (copy)')

    const data = db.kalkulasiHarga.create.mock.calls[0][0].data
    expect(data.komponenKustom.create).toEqual([
      { nama: 'Packing M', harga: 2500, qty: 1 },
      { nama: 'Gantungan ring', harga: 800, qty: 1 },
    ])
  })

  it('sumber record BARU (packingType null, sudah ada baris Packing) → TIDAK dobel', async () => {
    db.kalkulasiHarga.findUnique.mockResolvedValue({
      id: 'src2', nama: 'New', createdAt: new Date(), updatedAt: new Date(),
      batch: 1, marginTier: 'A', hargaShopeeAktual: null, hargaOfflineAktual: null,
      packingType: null,
      plates: [plateRaw],
      komponenKustom: [
        { id: 'kk1', kalkulasiId: 'src2', nama: 'Packing M', harga: 2500, qty: 1 },
        { id: 'kk2', kalkulasiId: 'src2', nama: 'Gantungan ring', harga: 800, qty: 1 },
      ],
      labor: [], produkLinks: [], hargaChannelJson: null,
    })

    await duplicateKalkulasi('src2', 'New (copy)')

    const data = db.kalkulasiHarga.create.mock.calls[0][0].data
    expect(data.komponenKustom.create).toEqual([
      { nama: 'Packing M', harga: 2500, qty: 1 },
      { nama: 'Gantungan ring', harga: 800, qty: 1 },
    ])
  })

  it('sumber TIDAK ditemukan → throw', async () => {
    db.kalkulasiHarga.findUnique.mockResolvedValue(null)
    await expect(duplicateKalkulasi('missing', 'X')).rejects.toThrow('Kalkulasi not found')
  })
})

describe('listKalkulasi pagination', () => {
  it('dengan page/limit → skip/take + total', async () => {
    db.kalkulasiHarga.findMany.mockResolvedValue([])
    db.kalkulasiHarga.count.mockResolvedValue(37)
    const res = await listKalkulasi({ page: 3, limit: 10 })
    expect(db.kalkulasiHarga.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 10 }))
    expect(res).toMatchObject({ total: 37, page: 3, limit: 10 })
  })

  it('tanpa opts → semua item (tanpa skip/take), count() TIDAK dipanggil', async () => {
    db.kalkulasiHarga.findMany.mockResolvedValue([
      { id: 'a', createdAt: new Date(), updatedAt: new Date(), plates: [], komponenKustom: [], labor: [], produkLinks: [] },
      { id: 'b', createdAt: new Date(), updatedAt: new Date(), plates: [], komponenKustom: [], labor: [], produkLinks: [] },
    ])
    await listKalkulasi()
    const args = db.kalkulasiHarga.findMany.mock.calls.at(-1)[0]
    expect(args.skip).toBeUndefined()
    expect(args.take).toBeUndefined()
    expect(db.kalkulasiHarga.count).not.toHaveBeenCalled()
  })
})

describe('parsePagination', () => {
  it('dua param kosong → tanpa pagination', () => {
    expect(parsePagination(null, null)).toEqual({})
  })
  it('hanya page → limit default 10', () => {
    expect(parsePagination('2', null)).toEqual({ page: 2, limit: 10 })
  })
  it('hanya limit → page default 1', () => {
    expect(parsePagination(null, '25')).toEqual({ page: 1, limit: 25 })
  })
  it('nilai rusak/negatif → clamp default', () => {
    expect(parsePagination('abc', '-5')).toEqual({ page: 1, limit: 10 })
    expect(parsePagination('0', '0')).toEqual({ page: 1, limit: 10 })
  })
})

describe('toKalkulasiData: hargaChannelJson korup', () => {
  const rawBase = {
    id: 'k1', createdAt: new Date(), updatedAt: new Date(),
    plates: [], komponenKustom: [], labor: [], produkLinks: [],
  }

  it('JSON rusak → tidak throw, hargaChannel undefined', async () => {
    db.kalkulasiHarga.findUnique.mockResolvedValue({ ...rawBase, hargaChannelJson: '{rusak' })
    const data = await getKalkulasi('k1')
    expect(data?.hargaChannel).toBeUndefined()
  })

  it('JSON valid tapi bukan array → hargaChannel undefined', async () => {
    db.kalkulasiHarga.findUnique.mockResolvedValue({ ...rawBase, hargaChannelJson: '{}' })
    const data = await getKalkulasi('k1')
    expect(data?.hargaChannel).toBeUndefined()
  })
})
