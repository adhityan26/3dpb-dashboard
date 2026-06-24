import { NextRequest, NextResponse } from "next/server"
import { verifyDiscordSignature } from "@/lib/discord/verify"
import { INTERACTION_TYPE } from "@/lib/discord/types"
import type { DiscordInteraction } from "@/lib/discord/types"
import { pong, ephemeralMessage, deferredEphemeral, followUp } from "@/lib/discord/respond"
import { dispatchCommand } from "@/lib/discord/dispatch"

function allowed(interaction: DiscordInteraction): boolean {
  const guildOk = !process.env.DISCORD_GUILD_ID || interaction.guild_id === process.env.DISCORD_GUILD_ID
  const userId = interaction.member?.user?.id ?? interaction.user?.id
  const allowList = (process.env.DISCORD_ALLOWED_USER_IDS ?? "").split(",").map(s => s.trim()).filter(Boolean)
  const userOk = allowList.length === 0 || (userId != null && allowList.includes(userId))
  return guildOk && userOk
}

export async function POST(req: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  const signature = req.headers.get("x-signature-ed25519")
  const timestamp = req.headers.get("x-signature-timestamp")
  const rawBody = await req.text()

  if (!publicKey || !signature || !timestamp || !verifyDiscordSignature(rawBody, signature, timestamp, publicKey)) {
    return new NextResponse("invalid request signature", { status: 401 })
  }

  const interaction = JSON.parse(rawBody) as DiscordInteraction

  if (interaction.type === INTERACTION_TYPE.PING) {
    return NextResponse.json(pong())
  }

  if (interaction.type !== INTERACTION_TYPE.APPLICATION_COMMAND) {
    return NextResponse.json(ephemeralMessage("Tidak didukung."))
  }

  if (!allowed(interaction)) {
    return NextResponse.json(ephemeralMessage("⛔ Kamu tidak diizinkan memakai bot ini."))
  }

  const appId = interaction.application_id ?? process.env.DISCORD_APP_ID ?? ""
  const token = interaction.token

  // Defer, then do the work and PATCH the follow-up. Do NOT await the work
  // before returning — the node server stays alive to finish it.
  void (async () => {
    try {
      const reply = await dispatchCommand(interaction)
      await followUp(appId, token, reply)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan."
      await followUp(appId, token, `❌ ${msg}`)
    }
  })()

  return NextResponse.json(deferredEphemeral())
}
