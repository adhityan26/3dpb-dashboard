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
    try {
      const channel = await client.channels.fetch(req.params.id)
      if (!channel) return res.status(404).json({ error: 'not_found' })
      res.json(channel.availableTags ?? [])
    } catch (err) {
      console.error('discord-relay: GET /channel/:id/tags failed', err)
      res.status(502).json({ error: 'discord_api_error' })
    }
  })

  router.post('/thread', async (req, res) => {
    try {
      const { parentId, name, message, mentions = [] } = req.body
      if (!isAllowedParent(parentId)) return res.status(403).json({ error: 'forbidden_channel' })

      const idempotencyKey = req.get('Idempotency-Key')
      if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
        return res.json(idempotencyCache.get(idempotencyKey))
      }

      const forum = await client.channels.fetch(parentId)
      if (!forum) return res.status(404).json({ error: 'not_found' })
      const created = await forum.threads.create({
        name: name.slice(0, 100),
        message: { content: message.slice(0, 2000), allowedMentions: { parse: [], users: mentions } },
      })
      const result = { threadId: created.id, threadUrl: created.url }
      if (idempotencyKey) idempotencyCache.set(idempotencyKey, result)
      res.json(result)
    } catch (err) {
      console.error('discord-relay: POST /thread failed', err)
      res.status(502).json({ error: 'discord_api_error' })
    }
  })

  router.patch('/thread/:id', async (req, res) => {
    try {
      const thread = await client.channels.fetch(req.params.id)
      if (!thread) return res.status(404).json({ error: 'not_found' })
      if (!isAllowedParent(thread.parentId)) return res.status(403).json({ error: 'forbidden_channel' })
      if (thread.archived) await thread.setArchived(false)
      const { name, appliedTags, starterContent, mentions = [] } = req.body
      const edit = {}
      if (name) edit.name = name.slice(0, 100)
      if (appliedTags) edit.appliedTags = appliedTags.slice(0, 5)
      if (starterContent) {
        edit.content = starterContent.slice(0, 2000)
        edit.allowedMentions = { parse: [], users: mentions }
      }
      await thread.edit(edit)
      res.json({ ok: true })
    } catch (err) {
      console.error('discord-relay: PATCH /thread/:id failed', err)
      res.status(502).json({ error: 'discord_api_error' })
    }
  })

  router.post('/thread/:id/archive', async (req, res) => {
    try {
      const thread = await client.channels.fetch(req.params.id)
      if (!thread) return res.status(404).json({ error: 'not_found' })
      if (!isAllowedParent(thread.parentId)) return res.status(403).json({ error: 'forbidden_channel' })
      await thread.setArchived(true)
      res.json({ ok: true })
    } catch (err) {
      console.error('discord-relay: POST /thread/:id/archive failed', err)
      res.status(502).json({ error: 'discord_api_error' })
    }
  })

  router.delete('/thread/:id', async (req, res) => {
    try {
      const thread = await client.channels.fetch(req.params.id)
      if (!thread) return res.status(404).json({ error: 'not_found' })
      if (!isAllowedParent(thread.parentId)) return res.status(403).json({ error: 'forbidden_channel' })
      await thread.delete()
      res.json({ ok: true })
    } catch (err) {
      console.error('discord-relay: DELETE /thread/:id failed', err)
      res.status(502).json({ error: 'discord_api_error' })
    }
  })

  return router
}
