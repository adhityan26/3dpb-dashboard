import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createDiscordRelayRouter } from '../discord-relay.js'

const ALLOWED_CHANNEL = 'forum-cincin-id'

function buildApp({ token = 'test-secret', client } = {}) {
  const app = express()
  app.use(express.json())
  app.use('/discord-relay', createDiscordRelayRouter({
    token,
    allowedForumChannelIds: [ALLOWED_CHANNEL],
    client,
  }))
  return app
}

describe('discord-relay auth', () => {
  it('rejects requests without the shared secret', async () => {
    const app = buildApp()
    const res = await request(app).get('/discord-relay/thread/123')
    expect(res.status).toBe(401)
  })

  it('rejects requests with a wrong secret using constant-time compare', async () => {
    const app = buildApp()
    const res = await request(app)
      .get('/discord-relay/thread/123')
      .set('X-Webhook-Secret', 'wrong')
    expect(res.status).toBe(401)
  })

  it('throws at construction time if no token is configured (fail-closed)', () => {
    expect(() => createDiscordRelayRouter({ token: undefined, allowedForumChannelIds: [] }))
      .toThrow(/DISCORD_RELAY_TOKEN/)
  })
})

describe('discord-relay allowlist', () => {
  it('403s a thread create outside the allowed forum channels', async () => {
    const client = { channels: { fetch: vi.fn().mockResolvedValue({ id: 'not-allowed' }) } }
    const app = buildApp({ client })
    const res = await request(app)
      .post('/discord-relay/thread')
      .set('X-Webhook-Secret', 'test-secret')
      .send({ parentId: 'not-allowed', name: 'Test', message: 'hi' })
    expect(res.status).toBe(403)
  })
})

describe('discord-relay idempotency', () => {
  it('returns the same threadId for a repeated Idempotency-Key', async () => {
    const created = { id: 'thread-1', url: 'https://discord.com/channels/x/thread-1' }
    const forum = {
      id: ALLOWED_CHANNEL,
      threads: { create: vi.fn().mockResolvedValue(created) },
    }
    const client = { channels: { fetch: vi.fn().mockResolvedValue(forum) } }
    const app = buildApp({ client })

    const body = { parentId: ALLOWED_CHANNEL, name: 'Test', message: 'hi' }
    const first = await request(app).post('/discord-relay/thread')
      .set('X-Webhook-Secret', 'test-secret').set('Idempotency-Key', 'k1').send(body)
    const second = await request(app).post('/discord-relay/thread')
      .set('X-Webhook-Secret', 'test-secret').set('Idempotency-Key', 'k1').send(body)

    expect(first.body.threadId).toBe('thread-1')
    expect(second.body.threadId).toBe('thread-1')
    expect(forum.threads.create).toHaveBeenCalledTimes(1)
  })
})

describe('discord-relay archived-thread edit', () => {
  it('auto-unarchives before applying a PATCH', async () => {
    const thread = { id: 't1', archived: true, setArchived: vi.fn().mockResolvedValue(undefined), edit: vi.fn().mockResolvedValue(undefined), parentId: ALLOWED_CHANNEL }
    const client = { channels: { fetch: vi.fn().mockResolvedValue(thread) } }
    const app = buildApp({ client })
    const res = await request(app)
      .patch('/discord-relay/thread/t1')
      .set('X-Webhook-Secret', 'test-secret')
      .send({ name: 'New Name' })
    expect(res.status).toBe(200)
    expect(thread.setArchived).toHaveBeenCalledWith(false)
    expect(thread.edit).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' }))
  })
})

describe('discord-relay mention hardening', () => {
  it('sets allowedMentions to parse:[] with explicit users on create', async () => {
    const forum = { id: ALLOWED_CHANNEL, threads: { create: vi.fn().mockResolvedValue({ id: 't2', url: 'u' }) } }
    const client = { channels: { fetch: vi.fn().mockResolvedValue(forum) } }
    const app = buildApp({ client })
    await request(app).post('/discord-relay/thread')
      .set('X-Webhook-Secret', 'test-secret')
      .send({ parentId: ALLOWED_CHANNEL, name: 'T', message: 'hi <@999>', mentions: ['999'] })
    expect(forum.threads.create).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.objectContaining({
        allowedMentions: { parse: [], users: ['999'] },
      }),
    }))
  })
})

describe('discord-relay PATCH starterContent', () => {
  it('applies starterContent to thread.edit content, truncated to 2000 chars', async () => {
    const longContent = 'x'.repeat(2500)
    const thread = { id: 't1', archived: false, setArchived: vi.fn(), edit: vi.fn().mockResolvedValue(undefined), parentId: ALLOWED_CHANNEL }
    const client = { channels: { fetch: vi.fn().mockResolvedValue(thread) } }
    const app = buildApp({ client })
    const res = await request(app)
      .patch('/discord-relay/thread/t1')
      .set('X-Webhook-Secret', 'test-secret')
      .send({ starterContent: longContent, mentions: ['999'] })
    expect(res.status).toBe(200)
    expect(thread.edit).toHaveBeenCalledWith(expect.objectContaining({
      content: longContent.slice(0, 2000),
      allowedMentions: { parse: [], users: ['999'] },
    }))
  })
})

describe('discord-relay PATCH not found', () => {
  it('returns 404 instead of throwing when the thread is not found', async () => {
    const client = { channels: { fetch: vi.fn().mockResolvedValue(null) } }
    const app = buildApp({ client })
    const res = await request(app)
      .patch('/discord-relay/thread/missing')
      .set('X-Webhook-Secret', 'test-secret')
      .send({ name: 'New Name' })
    expect(res.status).toBe(404)
  })

  it('returns 404 when client.channels.fetch rejects for the thread', async () => {
    const client = { channels: { fetch: vi.fn().mockRejectedValue(new Error('Unknown Channel')) } }
    const app = buildApp({ client })
    const res = await request(app)
      .patch('/discord-relay/thread/missing')
      .set('X-Webhook-Secret', 'test-secret')
      .send({ name: 'New Name' })
    expect(res.status).toBe(502)
  })
})
