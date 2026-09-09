import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('@/lib/db', () => ({ prisma: { workingProject: { create: vi.fn() } } }))
import { migrateWorkingProjects } from '../migrate-working-projects'
import { prisma } from '@/lib/db'

beforeEach(() => {
  vi.clearAllMocks()
})

function writeFixture(orders: unknown[]) {
  const file = path.join(os.tmpdir(), `wp-export-${Date.now()}-${Math.random()}.json`)
  fs.writeFileSync(file, JSON.stringify({ orders }))
  return file
}

describe('migrateWorkingProjects', () => {
  it('derives sourceOrderNo for a Shopee-shaped order_no and leaves orderNoLegacy null', async () => {
    const file = writeFixture([{ order_no: '260101ABCDEF12', platform: 'Shopee', customer: 'Budi', product: 'Cincin', checklist: [] }])
    await migrateWorkingProjects(file)
    const data = (prisma.workingProject.create as any).mock.calls[0][0].data
    expect(data.sourceOrderNo).toBe('260101ABCDEF12')
    expect(data.orderNoLegacy).toBeNull()
    expect(data.source).toBe('shopee')
  })

  it('treats a free-text order_no on a manual platform as orderNoLegacy only', async () => {
    const file = writeFixture([{ order_no: 'catatan bebas', platform: 'Manual', customer: 'Budi', product: 'Cincin', checklist: [] }])
    await migrateWorkingProjects(file)
    const data = (prisma.workingProject.create as any).mock.calls[0][0].data
    expect(data.orderNoLegacy).toBe('catatan bebas')
    expect(data.sourceOrderNo).toBeNull()
    expect(data.source).toBe('manual')
  })

  it('falls back to dueDateRaw for an unparseable legacy due_date', async () => {
    const file = writeFixture([{ order_no: '1', platform: 'Manual', customer: 'B', product: 'P', due_date: 'akhir bulan', checklist: [] }])
    await migrateWorkingProjects(file)
    const data = (prisma.workingProject.create as any).mock.calls[0][0].data
    expect(data.dueDate).toBeNull()
    expect(data.dueDateRaw).toBe('akhir bulan')
  })

  it('assigns sequential ids to checklist items missing an id', async () => {
    const file = writeFixture([{ order_no: '1', platform: 'Manual', customer: 'B', product: 'P', checklist: [{ text: 'a', done: false }, { text: 'b', done: true }] }])
    await migrateWorkingProjects(file)
    const data = (prisma.workingProject.create as any).mock.calls[0][0].data
    expect(data.checklist.map((i: any) => i.id)).toEqual([1, 2])
  })

  it('reports a warning and skips a row with no customer or product', async () => {
    const file = writeFixture([{ order_no: '1', platform: 'Manual', checklist: [] }])
    const result = await migrateWorkingProjects(file)
    expect(result.skipped).toBe(1)
    expect(result.warnings[0]).toMatch(/missing customer\/product/)
  })
})
