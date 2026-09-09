import express from 'express'
import crypto from 'node:crypto'

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export function createDiscordRelayRouter({ token, allowedForumChannelIds, client }) {
  if (!token) {
    throw new Error('DISCORD_RELAY_TOKEN must be set — discord-relay refuses to mount without it')
  }

  const idempotencyCache = new Map()
  const router = express.Router()

  router.use((req, res, next) => {
    const provided = req.get('X-Webhook-Secret') ?? ''
    if (!timingSafeEqualStr(provided, token)) {
      return res.status(401).json({ error: 'unauthorized' })
    }
    next()
  })

  function isAllowedParent(parentId) {
    return allowedForumChannelIds.includes(parentId)
  }

  router.get('/thread/:id', async (req, res) => {
    try {
      const thread = await client.channels.fetch(req.params.id)
      if (!thread) return res.status(404).json({ error: 'not_found' })
      res.json({
        parentId: thread.parentId, name: thread.name,
        appliedTags: thread.appliedTags ?? [], archived: thread.archived, ownerId: thread.ownerId,
      })
    } catch {
      res.status(404).json({ error: 'not_found' })
    }
  })

  router.get('/channel/:id/tags', async (req, res) => {
    const channel = await client.channels.fetch(req.params.id)
    res.json(channel.availableTags ?? [])
  })

  router.post('/thread', async (req, res) => {
    const { parentId, name, message, mentions = [] } = req.body
    if (!isAllowedParent(parentId)) return res.status(403).json({ error: 'forbidden_channel' })

    const idempotencyKey = req.get('Idempotency-Key')
    if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
      return res.json(idempotencyCache.get(idempotencyKey))
    }

    const forum = await client.channels.fetch(parentId)
    const created = await forum.threads.create({
      name: name.slice(0, 100),
      message: { content: message.slice(0, 2000), allowedMentions: { parse: [], users: mentions } },
    })
    const result = { threadId: created.id, threadUrl: created.url }
    if (idempotencyKey) idempotencyCache.set(idempotencyKey, result)
    res.json(result)
  })

  router.patch('/thread/:id', async (req, res) => {
    const thread = await client.channels.fetch(req.params.id)
    if (!isAllowedParent(thread.parentId)) return res.status(403).json({ error: 'forbidden_channel' })
    if (thread.archived) await thread.setArchived(false)
    const { name, appliedTags, starterContent, mentions = [] } = req.body
    const edit = {}
    if (name) edit.name = name.slice(0, 100)
    if (appliedTags) edit.appliedTags = appliedTags.slice(0, 5)
    if (starterContent) edit.allowedMentions = { parse: [], users: mentions }
    await thread.edit(edit)
    res.json({ ok: true })
  })

  router.post('/thread/:id/archive', async (req, res) => {
    const thread = await client.channels.fetch(req.params.id)
    if (!isAllowedParent(thread.parentId)) return res.status(403).json({ error: 'forbidden_channel' })
    await thread.setArchived(true)
    res.json({ ok: true })
  })

  router.delete('/thread/:id', async (req, res) => {
    const thread = await client.channels.fetch(req.params.id)
    if (!isAllowedParent(thread.parentId)) return res.status(403).json({ error: 'forbidden_channel' })
    await thread.delete()
    res.json({ ok: true })
  })

  return router
}
