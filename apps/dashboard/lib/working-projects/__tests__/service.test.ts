import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../discord-sync', () => ({
  createRelayThread: vi.fn(),
  editRelayThread: vi.fn(),
  archiveRelayThread: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    workingProject: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))
import { createWorkingProject, setStatus, updateWorkingProject, resyncWorkingProject, runChecklistOp, markReminderSent } from '../service'
import { createRelayThread, editRelayThread } from '../discord-sync'
import { prisma } from '@/lib/db'

beforeEach(() => {
  vi.clearAllMocks()
})

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
      data: expect.objectContaining({ discordThreadId: 't1', discordThreadUrl: 'https://discord/t1', syncState: 'ok' }),
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

describe('setStatus', () => {
  it('writes Postgres first, then relay; discordSynced:false on relay failure but still ok:true', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', title: 'T' })
    ;(prisma.workingProject.update as any).mockResolvedValue({})
    ;(editRelayThread as any).mockRejectedValue(new Error('discord-relay 500'))

    const result = await setStatus('t1', 'Done')
    expect(prisma.workingProject.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { discordThreadId: 't1' }, data: expect.objectContaining({ status: 'Done' }),
    }))
    expect(result).toEqual({ ok: true, discordSynced: false })
  })
})

describe('updateWorkingProject', () => {
  it('appends notes with timestamp rather than overwriting', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', notes: 'old', title: 'T' })
    ;(prisma.workingProject.update as any).mockResolvedValue({})
    ;(editRelayThread as any).mockResolvedValue(undefined)

    await updateWorkingProject('t1', { notesAppend: 'new info' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.notes).toContain('old')
    expect(call.data.notes).toContain('new info')
  })
})

describe('resyncWorkingProject', () => {
  it('re-pushes current DB state to the relay and clears syncError on success', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', title: 'T', appliedTags: [] })
    ;(editRelayThread as any).mockResolvedValue(undefined)
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    const result = await resyncWorkingProject('wp1')
    expect(result).toEqual({ ok: true, discordSynced: true })
    expect(prisma.workingProject.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncState: 'ok', syncError: null }),
    }))
  })
})

describe('runChecklistOp', () => {
  it('allocates the next sequential id over ALL items including soft-deleted', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({
      id: 'wp1', discordThreadId: 't1',
      checklist: [{ id: 1, text: 'a', done: false, deleted: false }, { id: 3, text: 'b', done: false, deleted: true }],
    })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    await runChecklistOp('t1', { type: 'add', text: 'c', addedBy: 'user1' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.checklist.find((i: any) => i.text === 'c').id).toBe(4)
  })

  it('setByLabel matches case-insensitively and updates only the exact label on write', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({
      id: 'wp1', discordThreadId: 't1',
      checklist: [{ id: 1, text: 'Cetak Resin', done: false, deleted: false }],
    })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    await runChecklistOp('t1', { type: 'setByLabel', label: 'cetak resin', done: true, by: 'user1' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.checklist[0].done).toBe(true)
  })
})

describe('markReminderSent', () => {
  it('adds daysLeft to remindersSent for a known threadId', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', remindersSent: [1] })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    const result = await markReminderSent('t1', 3)
    expect(prisma.workingProject.update).toHaveBeenCalledWith({
      where: { discordThreadId: 't1' },
      data: { remindersSent: [1, 3] },
    })
    expect(result).toEqual({ ok: true })
  })

  it('throws a clean not-found error for an unknown threadId instead of calling update', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue(null)

    await expect(markReminderSent('unknown', 3)).rejects.toThrow(/not found/i)
    expect(prisma.workingProject.update).not.toHaveBeenCalled()
  })
})
