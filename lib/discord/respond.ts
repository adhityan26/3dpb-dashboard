import { RESPONSE_TYPE } from "./types"

export const EPHEMERAL = 64

export function pong() {
  return { type: RESPONSE_TYPE.PONG }
}

export function ephemeralMessage(content: string) {
  return { type: RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE, data: { content, flags: EPHEMERAL } }
}

export function deferredEphemeral() {
  return { type: RESPONSE_TYPE.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, data: { flags: EPHEMERAL } }
}

/** Edit the original deferred response with the final content. */
export async function followUp(applicationId: string, token: string, content: string): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    console.warn("[discord] follow-up PATCH failed:", res.status, await res.text().catch(() => ""))
  }
}
