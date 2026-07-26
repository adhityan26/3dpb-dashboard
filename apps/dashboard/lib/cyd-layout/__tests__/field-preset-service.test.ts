import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    cydFieldPreset: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}))

import { listFieldPresets, createFieldPreset, updateFieldPreset, deleteFieldPreset } from '../field-preset-service'

beforeEach(() => {
  mockFindMany.mockReset(); mockCreate.mockReset(); mockUpdate.mockReset(); mockDelete.mockReset()
})

describe('listFieldPresets', () => {
  it('mem-parse fieldsJson tiap row', async () => {
    mockFindMany.mockResolvedValue([
      { id: '1', name: 'Ringkas', fieldsJson: JSON.stringify([['name']]), createdAt: new Date(), updatedAt: new Date() },
    ])
    const result = await listFieldPresets()
    expect(result).toEqual([{ id: '1', name: 'Ringkas', fields: [['name']] }])
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } })
  })

  it('row dengan fieldsJson korup -> fields kosong, tidak throw', async () => {
    mockFindMany.mockResolvedValue([
      { id: '1', name: 'Rusak', fieldsJson: 'not json', createdAt: new Date(), updatedAt: new Date() },
    ])
    const result = await listFieldPresets()
    expect(result).toEqual([{ id: '1', name: 'Rusak', fields: [] }])
  })
})

describe('createFieldPreset', () => {
  it('menolak fields yang melebihi batas 8 baris', async () => {
    const fields = Array.from({ length: 9 }, () => ['name'] as const)
    await expect(createFieldPreset({ name: 'X', fields: fields as never })).rejects.toThrow(/melebihi batas 8 baris/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('menolak fields yang melebihi batas 3 field per baris', async () => {
    await expect(createFieldPreset({ name: 'X', fields: [['name', 'type', 'state', 'progress']] })).rejects.toThrow(/melebihi batas 3 field per baris/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('menolak name kosong', async () => {
    await expect(createFieldPreset({ name: '  ', fields: [['name']] })).rejects.toThrow('NAME_REQUIRED')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('valid -> create dengan fieldsJson ter-serialize, name di-trim', async () => {
    mockCreate.mockResolvedValue({ id: '1', name: 'Custom', fieldsJson: JSON.stringify([['name']]), createdAt: new Date(), updatedAt: new Date() })
    const result = await createFieldPreset({ name: '  Custom  ', fields: [['name']] })
    expect(mockCreate).toHaveBeenCalledWith({ data: { name: 'Custom', fieldsJson: JSON.stringify([['name']]) } })
    expect(result).toEqual({ id: '1', name: 'Custom', fields: [['name']] })
  })
})

describe('updateFieldPreset', () => {
  it('preset tidak ditemukan -> throw NOT_FOUND', async () => {
    mockUpdate.mockRejectedValue({ code: 'P2025' })
    await expect(updateFieldPreset('missing', { name: 'X' })).rejects.toThrow('NOT_FOUND')
  })

  it('valid -> update field yang dikirim saja', async () => {
    mockUpdate.mockResolvedValue({ id: '1', name: 'Baru', fieldsJson: JSON.stringify([['name']]), createdAt: new Date(), updatedAt: new Date() })
    const result = await updateFieldPreset('1', { name: 'Baru' })
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: '1' }, data: { name: 'Baru' } })
    expect(result.name).toBe('Baru')
  })
})

describe('deleteFieldPreset', () => {
  it('preset tidak ditemukan -> throw NOT_FOUND', async () => {
    mockDelete.mockRejectedValue({ code: 'P2025' })
    await expect(deleteFieldPreset('missing')).rejects.toThrow('NOT_FOUND')
  })

  it('valid -> delete dipanggil dengan id', async () => {
    mockDelete.mockResolvedValue({})
    await deleteFieldPreset('1')
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: '1' } })
  })
})
