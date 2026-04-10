"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  AllSettings,
  NotificationConfig,
  AlertThresholds,
} from "@/lib/settings/types"

const SETTINGS_KEY = ["settings"] as const

async function fetchSettings(): Promise<AllSettings> {
  const res = await fetch("/api/settings")
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: fetchSettings,
  })
}

interface UpdateSettingsVars {
  notification?: Partial<NotificationConfig>
  thresholds?: Partial<AlertThresholds>
}

async function updateSettings(vars: UpdateSettingsVars): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })
}

interface TestNotificationVars {
  channel: "telegram" | "pushover"
  telegramBotToken?: string
  telegramChatId?: string
  pushoverUserKey?: string
  pushoverAppToken?: string
}

async function testNotification(
  vars: TestNotificationVars,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/settings/test-notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vars),
  })
  return res.json()
}

export function useTestNotification() {
  return useMutation({
    mutationFn: testNotification,
  })
}
