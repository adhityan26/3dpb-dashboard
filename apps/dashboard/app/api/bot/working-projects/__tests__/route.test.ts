import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('@/lib/working-projects/service', () => ({ createWorkingProject: vi.fn() }))
vi.mock('@/lib/bot/auth', () => ({ requireBotToken: vi.fn(() => true) }))
vi.mock('@/lib/db', () => ({ prisma: { workingProject: { findMany: vi.fn() } } }))
import { GET, POST } from '../route'
import { createWorkingProject } from '@/lib/working-projects/service'
import { requireBotToken } from '@/lib/bot/auth'
import { prisma } from '@/lib/db'

function getReq(query = '') {
  return new Request(`http://localhost/api/bot/working-projects${query}`, { headers: { Authorization: 'Bearer x' } })
}

function req(body: unknown) {
  return new Request('http://localhost/api/bot/working-projects', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: 'Bearer x' } })
}

describe('POST /api/bot/working-projects', () => {
  beforeEach(() => {
    ;(requireBotToken as any).mockReturnValue(true)
  })

  it('400s when required fields are missing', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('creates and returns threadUrl on valid input', async () => {
    ;(createWorkingProject as any).mockResolvedValue({ id: 'wp1', threadUrl: 'https://discord/t1', syncState: 'ok' })
    const res = await POST(req({ source: 'manual', forumChannelId: 'FORUM_CINCIN_ID', customer: 'Budi', product: 'Cincin' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.threadUrl).toBe('https://discord/t1')
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await POST(req({ source: 'manual', forumChannelId: 'x', customer: 'y', product: 'z' }))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/bot/working-projects', () => {
  beforeEach(() => {
    ;(requireBotToken as any).mockReturnValue(true)
    ;(prisma.workingProject.findMany as any).mockReset()
  })

  it('401s when requireBotToken returns false', async () => {
    ;(requireBotToken as any).mockReturnValue(false)
    const res = await GET(getReq())
    expect(res.status).toBe(401)
    expect(prisma.workingProject.findMany).not.toHaveBeenCalled()
  })

  it('lists projects with no filters by default', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([{ id: 'wp1' }])
    const res = await GET(getReq())
    expect(await res.json()).toEqual([{ id: 'wp1' }])
    const call = (prisma.workingProject.findMany as any).mock.calls[0][0]
    expect(call.where).toEqual({})
    expect(call.take).toBe(100)
  })

  it('filters by status, platform and a text search across customer/product/order numbers', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([])
    await GET(getReq('?status=Open&platform=Shopee&q=cincin'))
    const call = (prisma.workingProject.findMany as any).mock.calls[0][0]
    expect(call.where.status).toBe('Open')
    expect(call.where.platform).toBe('Shopee')
    expect(call.where.OR).toEqual(
      expect.arrayContaining([{ customer: { contains: 'cincin', mode: 'insensitive' } }]),
    )
  })

  it('caps the result limit at 500 even if a larger value is requested', async () => {
    ;(prisma.workingProject.findMany as any).mockResolvedValue([])
    await GET(getReq('?limit=9999'))
    const call = (prisma.workingProject.findMany as any).mock.calls[0][0]
    expect(call.take).toBe(500)
  })
})
