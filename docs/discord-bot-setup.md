# Discord Bot Setup

## Prerequisites

- Discord Developer Portal access
- A Discord server (guild) where you have admin permissions
- The operator shell where `deploy.sh` will be run

## Steps

1. **Create Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application"
   - Copy **Application ID** and **Public Key** from the General Information tab

2. **Create Bot Token**
   - Go to the Bot tab
   - Click "Reset Token"
   - Copy the **Bot Token** (save securely; it won't display again)

3. **Set Environment Variables**
   
   On the deploy host, in your `.env.deploy`, add:
   ```bash
   DISCORD_PUBLIC_KEY="<paste Public Key from step 1>"
   DISCORD_APP_ID="<paste Application ID from step 1>"
   DISCORD_BOT_TOKEN="<paste Bot Token from step 2>"
   DISCORD_GUILD_ID="<paste Server ID from step 4>"
   DISCORD_ALLOWED_USER_IDS="<comma-separated user IDs from step 5>"
   ```

4. **Get Guild (Server) ID**
   - In Discord, enable Developer Mode (User Settings → Advanced → Developer Mode)
   - Right-click your server name → Copy Server ID
   - Paste into `DISCORD_GUILD_ID`

5. **Get Allowed User IDs**
   - In Discord, right-click a user → Copy User ID
   - Repeat for all users who should use the bot (comma-separated, no spaces)
   - Example: `DISCORD_ALLOWED_USER_IDS="123456789,987654321"`

6. **Register Commands**
   
   After deploy, run:
   ```bash
   npm run discord:register
   ```
   This requires `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`, and `DISCORD_GUILD_ID` in env.

7. **Invite Bot to Server**
   
   In Developer Portal:
   - OAuth2 → URL Generator
   - Scopes: `applications.commands` (and `bot` if needed for other features)
   - Permissions: (select as needed; commands-only apps need minimal perms)
   - Open the generated URL in a browser
   - Authorize and add bot to your server

8. **Set Interactions Endpoint URL**
   
   In Developer Portal → General Information:
   - Find "Interactions Endpoint URL"
   - Set to: `https://dashboard.3dprintingbandung.my.id/api/discord/interactions`
   - Discord will send a PING; it must verify successfully
   - This requires `DISCORD_PUBLIC_KEY` deployed and active
   - If verification fails, check logs and retry

9. **Verify Setup**
   
   In the Dashboard settings page, Discord Bot card should show "Terkonfigurasi ✓" and list registered commands.
   
   In Discord, try a command:
   ```
   /kalkulator gramasi:50 jam:2
   ```
   Expect an ephemeral reply with price calculations.
