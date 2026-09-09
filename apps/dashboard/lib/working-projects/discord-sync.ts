function relayUrl(path: string): string {
  const base = process.env.DISCORD_RELAY_URL
  if (!base) throw new Error('DISCORD_RELAY_URL is not set')
  return `${base}${path}`
}

function relayHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = process.env.DISCORD_RELAY_TOKEN
  if (!token) throw new Error('DISCORD_RELAY_TOKEN is not set')
  return { 'Content-Type': 'application/json', 'X-Webhook-Secret': token, ...extra }
}

async function relayFetch(path: string, init: RequestInit & { headers: Record<string, string> }) {
  const res = await fetch(relayUrl(path), init)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`discord-relay ${res.status}${body ? ': ' + body : ''}`)
  }
  return res
}

export async function createRelayThread(input: {
  parentId: string; name: string; message: string; mentions: string[]; idempotencyKey: string
}): Promise<{ threadId: string; threadUrl: string }> {
  const res = await relayFetch('/discord-relay/thread', {
    method: 'POST',
    headers: relayHeaders({ 'Idempotency-Key': input.idempotencyKey }),
    body: JSON.stringify(input),
  })
  return res.json()
}

export async function editRelayThread(threadId: string, patch: {
  name?: string; appliedTags?: string[]; starterContent?: string; mentions?: string[]
}): Promise<void> {
  await relayFetch(`/discord-relay/thread/${encodeURIComponent(threadId)}`, {
    method: 'PATCH', headers: relayHeaders(), body: JSON.stringify(patch),
  })
}

export async function archiveRelayThread(threadId: string): Promise<void> {
  await relayFetch(`/discord-relay/thread/${encodeURIComponent(threadId)}/archive`, {
    method: 'POST', headers: relayHeaders(),
  })
}

export async function deleteRelayThread(threadId: string): Promise<void> {
  await relayFetch(`/discord-relay/thread/${encodeURIComponent(threadId)}`, {
    method: 'DELETE', headers: relayHeaders(),
  })
}

export async function getRelayThread(threadId: string): Promise<{
  parentId: string; name: string; appliedTags: string[]; archived: boolean; ownerId: string
} | null> {
  const res = await fetch(relayUrl(`/discord-relay/thread/${encodeURIComponent(threadId)}`), { headers: relayHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`discord-relay ${res.status}`)
  return res.json()
}

export async function getRelayChannelTags(channelId: string): Promise<unknown[]> {
  const res = await relayFetch(`/discord-relay/channel/${encodeURIComponent(channelId)}/tags`, {
    method: 'GET', headers: relayHeaders(),
  })
  return res.json()
}
