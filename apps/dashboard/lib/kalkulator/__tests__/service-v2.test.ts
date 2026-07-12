import { describe, it, expect, vi, beforeEach } from 'vitest'

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
import { createKalkulasi, listKalkulasi } from '../service'

const db = prisma as any

const RATES = {
  fdmHppPerGram: 300, fdmJualPerGram: 900, slaHppPerGram: 1750, slaJualPerGram: 3500,
  mesinPerJam: 4000, adminEcommerce: 1.2,
  packing: { S: 1500 }, gantungan: {}, switchPerPcs: 2500, labelPerLembar: 750,
  failureRatePct: 0, failureSpreadPct: 50, testLayerPct: 0,
  preparerRatePerJam: 35000, finisherRatePerJam: 75000, helmConsumablesDefault: 55000,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
}
const SETTINGS = {
  failureSpreadPct: 50, testLayerPct: 0,
  marginMultipliers: { A: 1.1, B: 1.5, C: 2.0 }, resellerBulkMultiplier: 1.05,
  channels: [{ id: 'offline', nama: 'Offline', feeMultiplier: 1 }, { id: 'shopee', nama: 'Shopee', feeMultiplier: 1.2 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadRates).mockResolvedValue(RATES as any)
  vi.mocked(loadSettingsV2).mockResolvedValue(SETTINGS as any)
  vi.mocked(listPrinterProfiles).mockResolvedValue([
    { id: 'p1', nama: 'P1P', mesinPerJam: 3000, isDefault: true, isPricingReference: false, watt: null, tarifPerKwh: null, hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null },
  ] as any)
  vi.mocked(listMaterialProfiles).mockResolvedValue([])
  db.kalkulasiHarga.create.mockImplementation(async (args: any) => ({
    ...args.data, id: 'k1', createdAt: new Date(), updatedAt: new Date(),
    plates: [], komponenKustom: [], labor: [], produkLinks: [],
  }))
})

describe('createKalkulasi (jalur v2)', () => {
  it('input bentuk baru: labor & komponen dipersist sebagai rows; kolom v2 plate & hargaChannelJson terisi', async () => {
    await createKalkulasi({
      nama: 'V2', batch: 1, marginTier: 'A', switchQty: 0, hasLabel: false,
      plates: [{ tipe: 'FDM', gramasi: 10, durasiJam: 1, printerProfileId: 'p1' } as any],
      komponenKustom: [],
      komponen: [{ nama: 'Packing S', harga: 1500, qty: 1 }],
      labor: [{ nama: 'Sanding', jam: 1, ratePerJam: 35000 }],
    })
    const data = db.kalkulasiHarga.create.mock.calls[0][0].data
    expect(data.labor.create).toEqual([{ urutan: 1, nama: 'Sanding', jam: 1, ratePerJam: 35000, flat: null }])
    expect(data.komponenKustom.create).toEqual([{ nama: 'Packing S', harga: 1500, qty: 1 }])
    expect(data.plates.create[0]).toMatchObject({ printerProfileId: 'p1', mesinPerJam: 3000 })
    expect(typeof data.hargaChannelJson).toBe('string')
    // hppProduksi: mat 10×300 + mesin profil 1×3000 = 6000
    expect(data.hppProduksi).toBe(6000)
  })

  it('input legacy: labor rows dari mapping helm, komponen rows TIDAK menduplikasi aksesori legacy', async () => {
    await createKalkulasi({
      nama: 'L', batch: 1, marginTier: 'A', packingType: 'S', switchQty: 0, hasLabel: false,
      plates: [{ tipe: 'FDM', gramasi: 10, durasiJam: 1 }],
      komponenKustom: [{ nama: 'Magnet', harga: 500, qty: 2 }],
      produktType: 'HELM', finishType: 'FINISHING', jamSanding: 1, jamPainting: 1, jamAssembly: 0, flatFinishingCost: 5000,
    } as any)
    const data = db.kalkulasiHarga.create.mock.calls[0][0].data
    // Legacy path: kolom legacy tetap ditulis, komponenKustom = HANYA kustom user (packing tetap kolom)
    expect(data.packingType).toBe('S')
    expect(data.komponenKustom.create).toEqual([{ nama: 'Magnet', harga: 500, qty: 2 }])
    // Labor rows ditulis dari mapping helm (3 baris)
    expect(data.labor.create).toHaveLength(3)
    expect(data.jamSanding).toBe(1) // kolom helm legacy tetap terisi (drop di 0b-2b-2)
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

  it('tanpa opts → semua item (tanpa skip/take)', async () => {
    db.kalkulasiHarga.findMany.mockResolvedValue([])
    db.kalkulasiHarga.count.mockResolvedValue(5)
    await listKalkulasi()
    const args = db.kalkulasiHarga.findMany.mock.calls.at(-1)[0]
    expect(args.skip).toBeUndefined()
    expect(args.take).toBeUndefined()
  })
})
