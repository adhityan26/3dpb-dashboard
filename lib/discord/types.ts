export interface DiscordOption {
  name: string
  value?: string | number
  options?: DiscordOption[]
}

export interface DiscordInteraction {
  type: number
  guild_id?: string
  member?: { user?: { id: string } }
  user?: { id: string }
  token: string
  application_id?: string
  data?: { name: string; options?: DiscordOption[] }
}

export const INTERACTION_TYPE = { PING: 1, APPLICATION_COMMAND: 2 } as const
export const RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const
