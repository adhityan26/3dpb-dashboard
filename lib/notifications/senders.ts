import { getNotificationConfig } from "@/lib/settings/service"
import { prisma } from "@/lib/db"
import type { AlertEvent } from "./types"

interface SendResult {
  ok: boolean
  channel: "telegram" | "pushover"
  error?: string
}

function severityIcon(severity: AlertEvent["severity"]): string {
  switch (severity) {
    case "critical":
      return "🚨"
    case "high":
      return "⚠️"
    case "warning":
      return "🟡"
    default:
      return "ℹ️"
  }
}

function formatMessage(event: AlertEvent): string {
  const icon = severityIcon(event.severity)
  return `${icon} *${event.title}*\n\n${event.body}`
}

export async function sendToTelegram(event: AlertEvent): Promise<SendResult> {
  const { telegramBotToken, telegramChatId } = await getNotificationConfig()
  if (!telegramBotToken || !telegramChatId) {
    return {
      ok: false,
      channel: "telegram",
      error: "Telegram not configured",
    }
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: formatMessage(event),
          parse_mode: "Markdown",
        }),
      },
    )
    const json = (await res.json()) as { ok?: boolean; description?: string }
    if (!json.ok) {
      return {
        ok: false,
        channel: "telegram",
        error: json.description ?? `HTTP ${res.status}`,
      }
    }

    await prisma.notificationLog.create({
      data: {
        alertKey: event.alertKey,
        channel: "telegram",
        message: `${event.title}: ${event.body}`,
      },
    })
    return { ok: true, channel: "telegram" }
  } catch (err) {
    return {
      ok: false,
      channel: "telegram",
      error: err instanceof Error ? err.message : "Network error",
    }
  }
}

export async function sendToPushover(event: AlertEvent): Promise<SendResult> {
  const { pushoverUserKey, pushoverAppToken } = await getNotificationConfig()
  if (!pushoverUserKey || !pushoverAppToken) {
    return {
      ok: false,
      channel: "pushover",
      error: "Pushover not configured",
    }
  }

  const priorityMap: Record<AlertEvent["severity"], number> = {
    info: -1,
    warning: 0,
    high: 1,
    critical: 2,
  }

  try {
    const bodyParams: Record<string, string> = {
      token: pushoverAppToken,
      user: pushoverUserKey,
      title: `${severityIcon(event.severity)} ${event.title}`,
      message: event.body,
      priority: String(priorityMap[event.severity]),
    }
    // Critical priority requires retry/expire params
    if (event.severity === "critical") {
      bodyParams.retry = "60"
      bodyParams.expire = "3600"
    }
    const body = new URLSearchParams(bodyParams)

    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    const json = (await res.json()) as {
      status?: number
      errors?: string[]
    }
    if (json.status !== 1) {
      return {
        ok: false,
        channel: "pushover",
        error: json.errors?.join(", ") ?? `HTTP ${res.status}`,
      }
    }

    await prisma.notificationLog.create({
      data: {
        alertKey: event.alertKey,
        channel: "pushover",
        message: `${event.title}: ${event.body}`,
      },
    })
    return { ok: true, channel: "pushover" }
  } catch (err) {
    return {
      ok: false,
      channel: "pushover",
      error: err instanceof Error ? err.message : "Network error",
    }
  }
}

/**
 * Send to all configured channels in parallel.
 * Returns true if at least one channel succeeded.
 */
export async function sendAlert(event: AlertEvent): Promise<{
  anySent: boolean
  results: SendResult[]
}> {
  const results = await Promise.all([
    sendToTelegram(event),
    sendToPushover(event),
  ])
  return {
    anySent: results.some((r) => r.ok),
    results,
  }
}
