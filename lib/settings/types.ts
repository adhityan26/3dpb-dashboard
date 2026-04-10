export interface NotificationConfig {
  telegramBotToken: string | null
  telegramChatId: string | null
  pushoverUserKey: string | null
  pushoverAppToken: string | null
}

export interface AlertThresholds {
  stockMin: number
  roasMin: number
  orderPileupCount: number
  orderPileupHours: number
}

export interface ShopeeStatus {
  connected: boolean
  shopId: string | null
  tokenUpdatedAt: string | null
}

export interface AllSettings {
  notification: NotificationConfig
  thresholds: AlertThresholds
  shopee: ShopeeStatus
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  stockMin: 5,
  roasMin: 2,
  orderPileupCount: 5,
  orderPileupHours: 1,
}

export const CONFIG_KEYS = {
  TELEGRAM_BOT_TOKEN: "telegram_bot_token",
  TELEGRAM_CHAT_ID: "telegram_chat_id",
  PUSHOVER_USER_KEY: "pushover_user_key",
  PUSHOVER_APP_TOKEN: "pushover_app_token",
  ALERT_STOCK_MIN: "alert_stock_min",
  ALERT_ROAS_MIN: "alert_roas_min",
  ALERT_ORDER_PILEUP_COUNT: "alert_order_pileup_count",
  ALERT_ORDER_PILEUP_HOURS: "alert_order_pileup_hours",
  SHOPEE_ACCESS_TOKEN: "shopee_access_token",
  SHOPEE_REFRESH_TOKEN: "shopee_refresh_token",
  SHOPEE_SHOP_ID: "shopee_shop_id",
} as const
