import { describe, it, expect, vi } from 'vitest'
vi.mock('../discord-sync', () => ({
  createRelayThread: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    workingProject: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))
import { createWorkingProject } from '../service'
import { createRelayThread } from '../discord-sync'
import { prisma } from '@/lib/prisma'

describe('createWorkingProject', () => {
  it('writes DB row first as pending, then syncs to Discord and marks ok', async () => {
    ;(prisma.workingProject.create as any).mockResolvedValue({ id: 'wp1' })
    ;(createRelayThread as any).mockResolvedValue({ threadId: 't1', threadUrl: 'https://discord/t1' })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    const result = await createWorkingProject({
      source: 'manual', forumChannelId: 'FORUM_CINCIN_ID',
      customer: 'Budi', product: 'Cincin', orderNoLegacy: 'ORD-1',
    })

    expect(prisma.workingProject.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncState: 'pending', discordThreadId: null }),
    }))
    expect(createRelayThread).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'wp1' }))
    expect(prisma.workingProject.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wp1' },
      data: expect.objectContaining({ discordThreadId: 't1', syncState: 'ok' }),
    }))
    expect(result).toEqual({ id: 'wp1', threadUrl: 'https://discord/t1', syncState: 'ok' })
  })

  it('marks syncState error but does not throw when the relay call fails', async () => {
    ;(prisma.workingProject.create as any).mockResolvedValue({ id: 'wp2' })
    ;(createRelayThread as any).mockRejectedValue(new Error('discord-relay 403: forbidden_channel'))
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    const result = await createWorkingProject({
      source: 'manual', forumChannelId: 'FORUM_CINCIN_ID', customer: 'Budi', product: 'Cincin',
    })

    expect(prisma.workingProject.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncState: 'error', syncError: expect.stringContaining('forbidden_channel') }),
    }))
    expect(result.threadUrl).toBeNull()
    expect(result.syncState).toBe('error')
  })
})
