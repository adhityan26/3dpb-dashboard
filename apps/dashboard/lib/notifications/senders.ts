import { getNotificationConfig } from "@/lib/settings/service"
import { prisma } from "@/lib/db"
import type { AlertEvent } from "./types"

interface SendResult {
  ok: boolean
  channel: "telegram" | "pushover" | "discord"
  error?: string
}

function severityIcon(severity: AlertEvent["severity"]): string {
  switch (severity) {
    case "critical": return "🚨"
    case "high":     return "⚠️"
    case "warning":  return "🟡"
    default:         return "ℹ️"
  }
}

function formatMessage(event: AlertEvent): string {
  const icon = severityIcon(event.severity)
  return `${icon} *${event.title}*\n\n${event.body}`
}

export async function sendToTelegram(event: AlertEvent): Promise<SendResult> {
  const cfg = await getNotificationConfig()
  if (!cfg.telegramEnabled || !cfg.telegramBotToken || !cfg.telegramChatId) {
    return { ok: false, channel: "telegram", error: "Telegram not configured or disabled" }
  }
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cfg.telegramChatId,
          text: formatMessage(event),
          parse_mode: "Markdown",
        }),
      },
    )
    const json = (await res.json()) as { ok?: boolean; description?: string }
    if (!json.ok) {
      return { ok: false, channel: "telegram", error: json.description ?? `HTTP ${res.status}` }
    }
    await prisma.notificationLog.create({
      data: { alertKey: event.alertKey, channel: "telegram", message: `${event.title}: ${event.body}` },
    })
    return { ok: true, channel: "telegram" }
  } catch (err) {
    return { ok: false, channel: "telegram", error: err instanceof Error ? err.message : "Network error" }
  }
}

export async function sendToPushover(event: AlertEvent): Promise<SendResult> {
  const cfg = await getNotificationConfig()
  if (!cfg.pushoverEnabled || !cfg.pushoverUserKey || !cfg.pushoverAppToken) {
    return { ok: false, channel: "pushover", error: "Pushover not configured or disabled" }
  }
  const priorityMap: Record<AlertEvent["severity"], number> = {
    info: -1, warning: 0, high: 1, critical: 2,
  }
  try {
    const bodyParams: Record<string, string> = {
      token: cfg.pushoverAppToken,
      user: cfg.pushoverUserKey,
      title: `${severityIcon(event.severity)} ${event.title}`,
      message: event.body,
      priority: String(priorityMap[event.severity]),
    }
    if (event.severity === "critical") {
      bodyParams.retry = "60"
      bodyParams.expire = "3600"
    }
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(bodyParams).toString(),
    })
    const json = (await res.json()) as { status?: number; errors?: string[] }
    if (json.status !== 1) {
      return { ok: false, channel: "pushover", error: json.errors?.join(", ") ?? `HTTP ${res.status}` }
    }
    await prisma.notificationLog.create({
      data: { alertKey: event.alertKey, channel: "pushover", message: `${event.title}: ${event.body}` },
    })
    return { ok: true, channel: "pushover" }
  } catch (err) {
    return { ok: false, channel: "pushover", error: err instanceof Error ? err.message : "Network error" }
  }
}

export async function sendToDiscord(event: AlertEvent): Promise<SendResult> {
  const cfg = await getNotificationConfig()
  if (!cfg.discordEnabled || !cfg.discordWebhookUrl) {
    return { ok: false, channel: "discord", error: "Discord not configured or disabled" }
  }
  try {
    const icon = severityIcon(event.severity)
    const res = await fetch(cfg.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `${icon} **${event.title}**\n\n${event.body}` }),
    })
    if (!res.ok) {
      return { ok: false, channel: "discord", error: `HTTP ${res.status}` }
    }
    await prisma.notificationLog.create({
      data: { alertKey: event.alertKey, channel: "discord", message: `${event.title}: ${event.body}` },
    })
    return { ok: true, channel: "discord" }
  } catch (err) {
    return { ok: false, channel: "discord", error: err instanceof Error ? err.message : "Network error" }
  }
}

/**
 * Send a plain-text notification to all enabled channels.
 * Use for LG order events (not structured AlertEvent alerts).
 */
export async function sendNotification(message: string): Promise<void> {
  const event: AlertEvent = {
    kind: "lg_order",
    alertKey: `lg-notify-${Date.now()}`,
    title: "Light Generator",
    body: message,
    severity: "info",
  }
  await Promise.allSettled([
    sendToTelegram(event),
    sendToPushover(event),
    sendToDiscord(event),
  ])
}

/**
 * Send an alert to all configured channels in parallel.
 * Returns true if at least one channel succeeded.
 */
export async function sendAlert(event: AlertEvent): Promise<{
  anySent: boolean
  results: SendResult[]
}> {
  const settled = await Promise.allSettled([
    sendToTelegram(event),
    sendToPushover(event),
    sendToDiscord(event),
  ])
  const results: SendResult[] = settled.map((r, i) => {
    if (r.status === "fulfilled") return r.value
    const channels = ["telegram", "pushover", "discord"] as const
    return { ok: false, channel: channels[i], error: String(r.reason) }
  })
  return { anySent: results.some((r) => r.ok), results }
}
