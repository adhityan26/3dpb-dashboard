// One-shot: register guild slash commands. Run: node scripts/register-discord-commands.mjs
import { COMMAND_DEFS } from "../lib/discord/command-defs.ts"

const APP_ID = process.env.DISCORD_APP_ID
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN
const GUILD_ID = process.env.DISCORD_GUILD_ID

if (!APP_ID || !BOT_TOKEN || !GUILD_ID) {
  console.error("Missing DISCORD_APP_ID / DISCORD_BOT_TOKEN / DISCORD_GUILD_ID env")
  process.exit(1)
}

const url = `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
const res = await fetch(url, {
  method: "PUT",
  headers: { "Authorization": `Bot ${BOT_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(COMMAND_DEFS),
})
if (!res.ok) {
  console.error("Registration failed:", res.status, await res.text())
  process.exit(1)
}
console.log("Registered", (await res.json()).length, "commands to guild", GUILD_ID)
