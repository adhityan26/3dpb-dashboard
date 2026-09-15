import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../discord-sync', () => ({
  createRelayThread: vi.fn(),
  editRelayThread: vi.fn(),
  archiveRelayThread: vi.fn(),
  deleteRelayThread: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  prisma: {
    workingProject: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))
import { createWorkingProject, setStatus, updateWorkingProject, resyncWorkingProject, runChecklistOp, markReminderSent, deleteWorkingProject } from '../service'
import { createRelayThread, editRelayThread, deleteRelayThread } from '../discord-sync'
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

  it('persists orderDateRaw as a parsed orderDate and includes it in the Discord post', async () => {
    ;(prisma.workingProject.create as any).mockResolvedValue({ id: 'wp3' })
    ;(createRelayThread as any).mockResolvedValue({ threadId: 't3', threadUrl: 'https://discord/t3' })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    await createWorkingProject({
      source: 'shopee', forumChannelId: 'FORUM_CINCIN_ID',
      customer: 'Budi', product: 'Cincin', orderDateRaw: '2026-09-01',
    })

    const createCall = (prisma.workingProject.create as any).mock.calls[0][0]
    expect((createCall.data.orderDate as Date).toISOString().slice(0, 10)).toBe('2026-09-01')
    const relayCall = (createRelayThread as any).mock.calls[0][0]
    expect(relayCall.message).toContain('2026-09-01')
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
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', notes: 'old', title: 'T', customer: 'Budi', product: 'Cincin', variant: null })
    ;(prisma.workingProject.update as any).mockResolvedValue({})
    ;(editRelayThread as any).mockResolvedValue(undefined)

    await updateWorkingProject('t1', { notesAppend: 'new info' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.notes).toContain('old')
    expect(call.data.notes).toContain('new info')
  })

  it('does not touch the Discord thread title when no title-affecting field changed, but still resyncs the starter content', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', notes: 'old', title: 'Budi - Cincin', customer: 'Budi', product: 'Cincin', variant: null })
    ;(prisma.workingProject.update as any).mockResolvedValue({ customer: 'Budi', product: 'Cincin', variant: null, status: 'Open', payment: 'Belum', shipping: 'JNE', mentions: [], checklist: [] })
    ;(editRelayThread as any).mockResolvedValue(undefined)

    await updateWorkingProject('t1', { shipping: 'JNE' })
    const call = (editRelayThread as any).mock.calls[0]
    expect(call[0]).toBe('t1')
    expect(call[1]).not.toHaveProperty('name')
    expect(call[1].starterContent).toContain('JNE')
  })

  it('rebuilds and sends the new title to Discord when customer changes', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', notes: null, title: 'Budi - Cincin', customer: 'Budi', product: 'Cincin', variant: null })
    ;(prisma.workingProject.update as any).mockResolvedValue({ customer: 'Budi Santoso', product: 'Cincin', variant: null, status: 'Open', payment: 'Belum', mentions: [], checklist: [] })
    ;(editRelayThread as any).mockResolvedValue(undefined)

    await updateWorkingProject('t1', { customer: 'Budi Santoso' })
    const call = (editRelayThread as any).mock.calls[0]
    expect(call[0]).toBe('t1')
    expect(call[1].name).toBe('Budi Santoso - Cincin')
    expect(call[1].starterContent).toContain('Budi Santoso')
    const updateCall = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(updateCall.data.title).toBe('Budi Santoso - Cincin')
  })

  it('persists orderDateRaw as a parsed Date', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', notes: null, title: 'T', customer: 'Budi', product: 'Cincin', variant: null })
    ;(prisma.workingProject.update as any).mockResolvedValue({ customer: 'Budi', product: 'Cincin', variant: null, status: 'Open', payment: 'Belum', mentions: [], checklist: [] })
    ;(editRelayThread as any).mockResolvedValue(undefined)

    await updateWorkingProject('t1', { orderDateRaw: '2026-09-01' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect((call.data.orderDate as Date).toISOString().slice(0, 10)).toBe('2026-09-01')
  })

  it('replaces notes directly (not appended) when patch.notes is given', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', notes: 'old', title: 'T', customer: 'Budi', product: 'Cincin', variant: null })
    ;(prisma.workingProject.update as any).mockResolvedValue({})
    ;(editRelayThread as any).mockResolvedValue(undefined)

    await updateWorkingProject('t1', { notes: 'replaced entirely' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.notes).toBe('replaced entirely')
  })

  it('sends mentions and appliedTags to the relay when patched, and persists them', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', notes: null, title: 'T', customer: 'Budi', product: 'Cincin', variant: null })
    ;(prisma.workingProject.update as any).mockResolvedValue({ customer: 'Budi', product: 'Cincin', variant: null, status: 'Open', payment: 'Belum', mentions: ['123'], checklist: [] })
    ;(editRelayThread as any).mockResolvedValue(undefined)

    await updateWorkingProject('t1', { mentions: ['123'], appliedTags: ['Cincin'] })
    const updateCall = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(updateCall.data.mentions).toEqual(['123'])
    expect(updateCall.data.appliedTags).toEqual(['Cincin'])
    const relayCall = (editRelayThread as any).mock.calls[0]
    expect(relayCall[1].mentions).toEqual(['123'])
    expect(relayCall[1].appliedTags).toEqual(['Cincin'])
  })

  it('throws instead of silently no-opping when the patch has no recognized field (e.g. a typo\'d or made-up field name)', async () => {
    await expect(updateWorkingProject('t1', { orderDate: '2026-09-01' } as any)).rejects.toThrow(/unknown patch field/)
    expect(prisma.workingProject.findUnique).not.toHaveBeenCalled()
    expect(prisma.workingProject.update).not.toHaveBeenCalled()
  })

  it('throws even when the patch mixes a recognized field with an unrecognized one, rather than silently applying only the recognized one', async () => {
    await expect(updateWorkingProject('t1', { customer: 'Budi', foo: 'bar' } as any)).rejects.toThrow(/unknown patch field/)
    expect(prisma.workingProject.update).not.toHaveBeenCalled()
  })
})

describe('resyncWorkingProject', () => {
  it('re-pushes current DB state to the relay and clears syncError on success', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1', title: 'T', appliedTags: [], customer: 'Budi', product: 'Cincin', status: 'Open', payment: 'Belum', mentions: [], checklist: [] })
    ;(editRelayThread as any).mockResolvedValue(undefined)
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    const result = await resyncWorkingProject('wp1')
    expect(result).toEqual({ ok: true, discordSynced: true })
    expect(prisma.workingProject.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ syncState: 'ok', syncError: null }),
    }))
    const call = (editRelayThread as any).mock.calls[0]
    expect(call[1].starterContent).toContain('Budi')
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

  it('setByLabel updates an existing legacy-labeled item that contains the canonical label as a substring, instead of creating a duplicate', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({
      id: 'wp1', discordThreadId: 't1',
      checklist: [{ id: 1, text: 'A — Print Frame (extra info)', done: false, deleted: false }],
    })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    await runChecklistOp('t1', { type: 'setByLabel', label: 'A — Print Frame', done: true, by: 'user1' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.checklist).toHaveLength(1)
    expect(call.data.checklist[0].id).toBe(1)
    expect(call.data.checklist[0].text).toBe('A — Print Frame (extra info)')
    expect(call.data.checklist[0].done).toBe(true)
  })

  it('setByLabel creates a new item with the next sequential id when no existing item matches the label', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({
      id: 'wp1', discordThreadId: 't1',
      checklist: [{ id: 1, text: 'Unrelated Item', done: false, deleted: false }, { id: 3, text: 'Also Unrelated', done: false, deleted: true }],
    })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    await runChecklistOp('t1', { type: 'setByLabel', label: 'Cincin A — Print Frame', done: true, by: 'user1' })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    const created = call.data.checklist.find((i: any) => i.text === 'Cincin A — Print Frame')
    expect(created).toBeDefined()
    expect(created.id).toBe(4)
    expect(created.done).toBe(true)
    expect(created.deleted).toBe(false)
    expect(created.done_by).toBe('user1')
  })

  it('reorder reorders items by the given id sequence', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({
      id: 'wp1', discordThreadId: 't1',
      checklist: [{ id: 1, text: 'a', done: false, deleted: false }, { id: 2, text: 'b', done: false, deleted: false }, { id: 3, text: 'c', done: false, deleted: false }],
    })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    await runChecklistOp('t1', { type: 'reorder', orderedIds: [3, 1, 2] })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.checklist.map((i: any) => i.id)).toEqual([3, 1, 2])
  })

  it('reorder appends items missing from orderedIds at the end instead of dropping them', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({
      id: 'wp1', discordThreadId: 't1',
      checklist: [{ id: 1, text: 'a', done: false, deleted: false }, { id: 2, text: 'b', done: false, deleted: false }],
    })
    ;(prisma.workingProject.update as any).mockResolvedValue({})

    await runChecklistOp('t1', { type: 'reorder', orderedIds: [2] })
    const call = (prisma.workingProject.update as any).mock.calls[0][0]
    expect(call.data.checklist.map((i: any) => i.id)).toEqual([2, 1])
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

describe('deleteWorkingProject', () => {
  it('deletes the DB row by id and the Discord thread by threadId', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1' })
    ;(prisma.workingProject.delete as any).mockResolvedValue({})
    ;(deleteRelayThread as any).mockResolvedValue(undefined)

    const result = await deleteWorkingProject('t1')
    expect(prisma.workingProject.delete).toHaveBeenCalledWith({ where: { id: 'wp1' } })
    expect(deleteRelayThread).toHaveBeenCalledWith('t1')
    expect(result).toEqual({ ok: true, discordDeleted: true })
  })

  it('still deletes the DB row and reports discordDeleted:false when the relay call fails', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue({ id: 'wp1', discordThreadId: 't1' })
    ;(prisma.workingProject.delete as any).mockResolvedValue({})
    ;(deleteRelayThread as any).mockRejectedValue(new Error('discord-relay 404'))

    const result = await deleteWorkingProject('t1')
    expect(prisma.workingProject.delete).toHaveBeenCalledWith({ where: { id: 'wp1' } })
    expect(result).toEqual({ ok: true, discordDeleted: false })
  })

  it('throws a clean not-found error for an unknown threadId instead of deleting anything', async () => {
    ;(prisma.workingProject.findUnique as any).mockResolvedValue(null)

    await expect(deleteWorkingProject('unknown')).rejects.toThrow(/not found/i)
    expect(prisma.workingProject.delete).not.toHaveBeenCalled()
    expect(deleteRelayThread).not.toHaveBeenCalled()
  })
})
