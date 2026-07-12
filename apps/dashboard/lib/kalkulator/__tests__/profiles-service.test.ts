import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    kalkPrinterProfile: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn() },
    kalkMaterialProfile: { findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    komponenPreset: { findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    laborPreset: { findMany: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(async (fns: unknown[]) => Promise.all(fns as Promise<unknown>[])),
  },
}))

import { prisma } from '@/lib/db'
import {
  createPrinterProfile, deletePrinterProfile, setDefaultPrinterProfile, setPricingReferencePrinterProfile,
  upsertLaborPreset, listLaborPresets, deleteKomponenPreset,
} from '../profiles-service'

type MockedPrisma = {
  kalkPrinterProfile: { findMany: Mock; findUnique: Mock; create: Mock; update: Mock; updateMany: Mock; delete: Mock }
  kalkMaterialProfile: { findMany: Mock; upsert: Mock; delete: Mock }
  komponenPreset: { findMany: Mock; upsert: Mock; delete: Mock }
  laborPreset: { findMany: Mock; upsert: Mock; delete: Mock }
}
const db = prisma as unknown as MockedPrisma
const row = (over = {}) => ({
  id: 'p1', nama: 'P1P', mesinPerJam: 4000, watt: null, tarifPerKwh: null,
  hargaPrinter: null, umurPakaiJam: null, maintenancePerJam: null, isDefault: false,
  isPricingReference: false,
  createdAt: new Date(), updatedAt: new Date(), ...over,
})

beforeEach(() => vi.clearAllMocks())

describe('createPrinterProfile', () => {
  it('pakai mesinPerJam langsung kalau diberikan', async () => {
    db.kalkPrinterProfile.create.mockResolvedValue(row())
    await createPrinterProfile({ nama: 'P1P', mesinPerJam: 4000 })
    expect(db.kalkPrinterProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mesinPerJam: 4000 }) })
    )
  })

  it('derive mesinPerJam dari breakdown kalau tidak diberikan', async () => {
    db.kalkPrinterProfile.create.mockResolvedValue(row())
    // 300W × Rp1500/kWh = 450; 6jt/6000jam = 1000; maintenance 50 → 1500
    await createPrinterProfile({ nama: 'X1C', watt: 300, tarifPerKwh: 1500, hargaPrinter: 6_000_000, umurPakaiJam: 6000, maintenancePerJam: 50 })
    expect(db.kalkPrinterProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mesinPerJam: 1500 }) })
    )
  })

  it('throw INVALID_INPUT kalau tidak ada mesinPerJam maupun breakdown lengkap', async () => {
    await expect(createPrinterProfile({ nama: 'Kosong' })).rejects.toThrow('INVALID_INPUT')
  })
})

describe('deletePrinterProfile', () => {
  it('menolak hapus profile default', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(row({ isDefault: true }))
    await expect(deletePrinterProfile('p1')).rejects.toThrow('DEFAULT_PROFILE')
    expect(db.kalkPrinterProfile.delete).not.toHaveBeenCalled()
  })

  it('hapus profile non-default', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(row({ isDefault: false }))
    db.kalkPrinterProfile.delete.mockResolvedValue(row())
    await deletePrinterProfile('p1')
    expect(db.kalkPrinterProfile.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
  })
})

describe('setDefaultPrinterProfile', () => {
  it('unset default lain lalu set target', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(row({ id: 'p2' }))
    db.kalkPrinterProfile.updateMany.mockResolvedValue({ count: 1 })
    db.kalkPrinterProfile.update.mockResolvedValue(row({ isDefault: true }))
    await setDefaultPrinterProfile('p2')
    expect(db.kalkPrinterProfile.updateMany).toHaveBeenCalledWith({ where: { isDefault: true }, data: { isDefault: false } })
    expect(db.kalkPrinterProfile.update).toHaveBeenCalledWith({ where: { id: 'p2' }, data: { isDefault: true } })
  })

  it('id tidak ditemukan → NOT_FOUND, default lain TIDAK di-unset', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(null)
    await expect(setDefaultPrinterProfile('ghost')).rejects.toThrow('NOT_FOUND')
    expect(db.kalkPrinterProfile.updateMany).not.toHaveBeenCalled()
    expect(db.kalkPrinterProfile.update).not.toHaveBeenCalled()
  })
})

describe('setPricingReferencePrinterProfile', () => {
  it('id tidak ditemukan → NOT_FOUND, tidak meng-unset acuan lain', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(null)
    await expect(setPricingReferencePrinterProfile('ghost')).rejects.toThrow('NOT_FOUND')
    expect(db.kalkPrinterProfile.updateMany).not.toHaveBeenCalled()
  })

  it('unset acuan lain lalu set target', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(row({ id: 'p2' }))
    db.kalkPrinterProfile.updateMany.mockResolvedValue({ count: 1 })
    db.kalkPrinterProfile.update.mockResolvedValue(row({ id: 'p2', isPricingReference: true }))
    await setPricingReferencePrinterProfile('p2')
    expect(db.kalkPrinterProfile.updateMany).toHaveBeenCalledWith({ where: { isPricingReference: true }, data: { isPricingReference: false } })
    expect(db.kalkPrinterProfile.update).toHaveBeenCalledWith({ where: { id: 'p2' }, data: { isPricingReference: true } })
  })
})

describe('labor preset', () => {
  it('upsert menolak item tanpa biaya (tanpa jam×rate dan tanpa flat)', async () => {
    await expect(upsertLaborPreset({ nama: 'X', items: [{ nama: 'kosong' }] })).rejects.toThrow('INVALID_ITEMS')
  })

  it('upsert valid: serialize itemsJson', async () => {
    const items = [{ nama: 'Sanding', jam: 1, ratePerJam: 35000 }]
    db.laborPreset.upsert.mockResolvedValue({ id: 'l1', nama: 'X', itemsJson: JSON.stringify(items), createdAt: new Date(), updatedAt: new Date() })
    const out = await upsertLaborPreset({ nama: 'X', items })
    expect(out.items).toEqual(items)
    expect(db.laborPreset.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { nama: 'X' },
      create: expect.objectContaining({ itemsJson: JSON.stringify(items) }),
    }))
  })

  it('list mem-parse itemsJson; row korup dilewati dengan items kosong', async () => {
    db.laborPreset.findMany.mockResolvedValue([
      { id: 'l1', nama: 'OK', itemsJson: '[{"nama":"A","flat":100}]', createdAt: new Date(), updatedAt: new Date() },
      { id: 'l2', nama: 'Korup', itemsJson: '{bukan json', createdAt: new Date(), updatedAt: new Date() },
    ])
    const out = await listLaborPresets()
    expect(out[0].items).toEqual([{ nama: 'A', flat: 100 }])
    expect(out[1].items).toEqual([])
  })
})

describe('delete dengan id tak dikenal', () => {
  it('deleteKomponenPreset: P2025 → NOT_FOUND', async () => {
    const p2025 = Object.assign(new Error('No record found'), { code: 'P2025' })
    db.komponenPreset.delete.mockRejectedValue(p2025)
    await expect(deleteKomponenPreset('ghost')).rejects.toThrow('NOT_FOUND')
  })

  it('deletePrinterProfile non-default: P2025 → NOT_FOUND', async () => {
    db.kalkPrinterProfile.findUnique.mockResolvedValue(null)
    const p2025 = Object.assign(new Error('No record found'), { code: 'P2025' })
    db.kalkPrinterProfile.delete.mockRejectedValue(p2025)
    await expect(deletePrinterProfile('ghost')).rejects.toThrow('NOT_FOUND')
  })
})
