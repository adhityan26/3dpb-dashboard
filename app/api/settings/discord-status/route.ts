import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const appId = process.env.DISCORD_APP_ID
  const botToken = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID ?? null
  const publicKey = process.env.DISCORD_PUBLIC_KEY
  const configured = Boolean(appId && botToken && guildId && publicKey)

  const endpointUrl = "https://dashboard.3dprintingbandung.my.id/api/discord/interactions"

  let commands: { name: string }[] | null = null
  if (configured) {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`,
        { headers: { Authorization: `Bot ${botToken}` } },
      )
      if (res.ok) {
        const list = await res.json() as { name: string }[]
        commands = list.map(c => ({ name: c.name }))
      }
    } catch { /* leave commands null on fetch failure */ }
  }

  return NextResponse.json({ configured, endpointUrl, guildId, commands })
}
