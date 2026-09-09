import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRelayThread, editRelayThread, getRelayThread } from '../discord-sync'

const OLD_ENV = process.env

beforeEach(() => {
  process.env = { ...OLD_ENV, DISCORD_RELAY_URL: 'http://relay.local:4000', DISCORD_RELAY_TOKEN: 'secret' }
  global.fetch = vi.fn()
})
afterEach(() => { process.env = OLD_ENV })

describe('createRelayThread', () => {
  it('POSTs to /discord-relay/thread with the shared secret and idempotency key', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ threadId: 't1', threadUrl: 'u' }) })
    const result = await createRelayThread({ parentId: 'p1', name: 'n', message: 'm', mentions: [], idempotencyKey: 'k1' })
    expect(result).toEqual({ threadId: 't1', threadUrl: 'u' })
    const [url, opts] = (global.fetch as any).mock.calls[0]
    expect(url).toBe('http://relay.local:4000/discord-relay/thread')
    expect(opts.headers['X-Webhook-Secret']).toBe('secret')
    expect(opts.headers['Idempotency-Key']).toBe('k1')
  })

  it('throws with the relay error body on non-2xx', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden_channel' })
    await expect(createRelayThread({ parentId: 'p1', name: 'n', message: 'm', mentions: [], idempotencyKey: 'k1' }))
      .rejects.toThrow(/403/)
  })
})

describe('getRelayThread', () => {
  it('returns null on 404 instead of throwing', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 404, text: async () => 'not_found' })
    expect(await getRelayThread('t1')).toBeNull()
  })
})
