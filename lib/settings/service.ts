import { prisma } from "@/lib/db"
import {
  CONFIG_KEYS,
  DEFAULT_THRESHOLDS,
  type AllSettings,
  type NotificationConfig,
  type AlertThresholds,
  type ShopeeStatus,
} from "./types"

async function getConfigValue(key: string): Promise<string | null> {
  const row = await prisma.config.findUnique({ where: { key } })
  return row?.value ?? null
}

async function setConfigValue(
  key: string,
  value: string | null,
): Promise<void> {
  if (value === null || value === "") {
    await prisma.config.deleteMany({ where: { key } })
  } else {
    await prisma.config.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })
  }
}

function parseNumber(s: string | null, fallback: number): number {
  if (s === null) return fallback
  const n = Number(s)
  return Number.isNaN(n) ? fallback : n
}

export async function getNotificationConfig(): Promise<NotificationConfig> {
  const [botToken, chatId, userKey, appToken] = await Promise.all([
    getConfigValue(CONFIG_KEYS.TELEGRAM_BOT_TOKEN),
    getConfigValue(CONFIG_KEYS.TELEGRAM_CHAT_ID),
    getConfigValue(CONFIG_KEYS.PUSHOVER_USER_KEY),
    getConfigValue(CONFIG_KEYS.PUSHOVER_APP_TOKEN),
  ])
  return {
    telegramBotToken: botToken,
    telegramChatId: chatId,
    pushoverUserKey: userKey,
    pushoverAppToken: appToken,
  }
}

export async function getAlertThresholds(): Promise<AlertThresholds> {
  const [stockMin, roasMin, pileupCount, pileupHours] = await Promise.all([
    getConfigValue(CONFIG_KEYS.ALERT_STOCK_MIN),
    getConfigValue(CONFIG_KEYS.ALERT_ROAS_MIN),
    getConfigValue(CONFIG_KEYS.ALERT_ORDER_PILEUP_COUNT),
    getConfigValue(CONFIG_KEYS.ALERT_ORDER_PILEUP_HOURS),
  ])
  return {
    stockMin: parseNumber(stockMin, DEFAULT_THRESHOLDS.stockMin),
    roasMin: parseNumber(roasMin, DEFAULT_THRESHOLDS.roasMin),
    orderPileupCount: parseNumber(
      pileupCount,
      DEFAULT_THRESHOLDS.orderPileupCount,
    ),
    orderPileupHours: parseNumber(
      pileupHours,
      DEFAULT_THRESHOLDS.orderPileupHours,
    ),
  }
}

export async function getShopeeStatus(): Promise<ShopeeStatus> {
  const [accessToken, shopIdRow] = await Promise.all([
    prisma.config.findUnique({
      where: { key: CONFIG_KEYS.SHOPEE_ACCESS_TOKEN },
    }),
    prisma.config.findUnique({
      where: { key: CONFIG_KEYS.SHOPEE_SHOP_ID },
    }),
  ])
  return {
    connected: !!accessToken?.value,
    shopId: shopIdRow?.value ?? null,
    tokenUpdatedAt: accessToken?.updatedAt?.toISOString() ?? null,
  }
}

export async function getAllSettings(): Promise<AllSettings> {
  const [notification, thresholds, shopee] = await Promise.all([
    getNotificationConfig(),
    getAlertThresholds(),
    getShopeeStatus(),
  ])
  return { notification, thresholds, shopee }
}

export async function updateNotificationConfig(
  config: Partial<NotificationConfig>,
): Promise<void> {
  const updates: Array<Promise<void>> = []
  if (config.telegramBotToken !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.TELEGRAM_BOT_TOKEN, config.telegramBotToken),
    )
  }
  if (config.telegramChatId !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.TELEGRAM_CHAT_ID, config.telegramChatId),
    )
  }
  if (config.pushoverUserKey !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.PUSHOVER_USER_KEY, config.pushoverUserKey),
    )
  }
  if (config.pushoverAppToken !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.PUSHOVER_APP_TOKEN, config.pushoverAppToken),
    )
  }
  await Promise.all(updates)
}

export async function updateAlertThresholds(
  thresholds: Partial<AlertThresholds>,
): Promise<void> {
  const updates: Array<Promise<void>> = []
  if (thresholds.stockMin !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.ALERT_STOCK_MIN, String(thresholds.stockMin)),
    )
  }
  if (thresholds.roasMin !== undefined) {
    updates.push(
      setConfigValue(CONFIG_KEYS.ALERT_ROAS_MIN, String(thresholds.roasMin)),
    )
  }
  if (thresholds.orderPileupCount !== undefined) {
    updates.push(
      setConfigValue(
        CONFIG_KEYS.ALERT_ORDER_PILEUP_COUNT,
        String(thresholds.orderPileupCount),
      ),
    )
  }
  if (thresholds.orderPileupHours !== undefined) {
    updates.push(
      setConfigValue(
        CONFIG_KEYS.ALERT_ORDER_PILEUP_HOURS,
        String(thresholds.orderPileupHours),
      ),
    )
  }
  await Promise.all(updates)
}

export async function sendTestTelegram(
  botToken: string,
  chatId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ Test notifikasi dari Shopee Dashboard berhasil!",
        }),
      },
    )
    const json = (await res.json()) as { ok?: boolean; description?: string }
    if (!json.ok) {
      return { ok: false, error: json.description ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error"
    return { ok: false, error: msg }
  }
}

export async function sendTestPushover(
  userKey: string,
  appToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = new URLSearchParams({
      token: appToken,
      user: userKey,
      message: "✅ Test notifikasi dari Shopee Dashboard berhasil!",
      title: "Shopee Dashboard",
    })
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    const json = (await res.json()) as { status?: number; errors?: string[] }
    if (json.status !== 1) {
      return {
        ok: false,
        error: json.errors?.join(", ") ?? `HTTP ${res.status}`,
      }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error"
    return { ok: false, error: msg }
  }
}
