"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { NotificationConfig } from "@/lib/settings/types"
import {
  useUpdateSettings,
  useTestNotification,
} from "@/lib/hooks/use-settings"

interface Props {
  config: NotificationConfig
}

function configToForm(config: NotificationConfig) {
  return {
    telegramBotToken: config.telegramBotToken ?? "",
    telegramChatId: config.telegramChatId ?? "",
    pushoverUserKey: config.pushoverUserKey ?? "",
    pushoverAppToken: config.pushoverAppToken ?? "",
  }
}

export function NotificationConfigCard({ config }: Props) {
  const [trackedConfig, setTrackedConfig] = useState(config)
  const [form, setForm] = useState(configToForm(config))
  const [feedback, setFeedback] = useState<string | null>(null)

  // Reset form when upstream config changes (post-save invalidation)
  if (config !== trackedConfig) {
    setTrackedConfig(config)
    setForm(configToForm(config))
  }

  const update = useUpdateSettings()
  const test = useTestNotification()

  function handleSave() {
    setFeedback(null)
    update.mutate(
      {
        notification: {
          telegramBotToken: form.telegramBotToken || null,
          telegramChatId: form.telegramChatId || null,
          pushoverUserKey: form.pushoverUserKey || null,
          pushoverAppToken: form.pushoverAppToken || null,
        },
      },
      {
        onSuccess: () => setFeedback("✅ Config tersimpan"),
        onError: (err) => setFeedback(`❌ ${err.message}`),
      },
    )
  }

  function handleTestTelegram() {
    setFeedback(null)
    test.mutate(
      {
        channel: "telegram",
        telegramBotToken: form.telegramBotToken,
        telegramChatId: form.telegramChatId,
      },
      {
        onSuccess: (result) => {
          setFeedback(
            result.ok ? "✅ Telegram test berhasil" : `❌ ${result.error}`,
          )
        },
      },
    )
  }

  function handleTestPushover() {
    setFeedback(null)
    test.mutate(
      {
        channel: "pushover",
        pushoverUserKey: form.pushoverUserKey,
        pushoverAppToken: form.pushoverAppToken,
      },
      {
        onSuccess: (result) => {
          setFeedback(
            result.ok ? "✅ Pushover test berhasil" : `❌ ${result.error}`,
          )
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🔔 Notifikasi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="text-sm font-semibold">Telegram Bot</div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-token">Bot Token</Label>
            <Input
              id="tg-token"
              type="password"
              value={form.telegramBotToken}
              onChange={(e) =>
                setForm({ ...form, telegramBotToken: e.target.value })
              }
              placeholder="123456:ABC-DEF..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-chat">Chat / Group ID</Label>
            <Input
              id="tg-chat"
              value={form.telegramChatId}
              onChange={(e) =>
                setForm({ ...form, telegramChatId: e.target.value })
              }
              placeholder="-100123456"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestTelegram}
            disabled={
              test.isPending ||
              !form.telegramBotToken ||
              !form.telegramChatId
            }
          >
            Test Telegram
          </Button>
        </div>

        <div className="space-y-3 pt-3 border-t">
          <div className="text-sm font-semibold">Pushover</div>
          <div className="space-y-1.5">
            <Label htmlFor="po-user">User Key</Label>
            <Input
              id="po-user"
              type="password"
              value={form.pushoverUserKey}
              onChange={(e) =>
                setForm({ ...form, pushoverUserKey: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="po-token">App Token</Label>
            <Input
              id="po-token"
              type="password"
              value={form.pushoverAppToken}
              onChange={(e) =>
                setForm({ ...form, pushoverAppToken: e.target.value })
              }
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestPushover}
            disabled={
              test.isPending ||
              !form.pushoverUserKey ||
              !form.pushoverAppToken
            }
          >
            Test Pushover
          </Button>
        </div>

        {feedback && <div className="text-xs">{feedback}</div>}

        <div className="pt-3 border-t">
          <Button
            onClick={handleSave}
            disabled={update.isPending}
            className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
          >
            {update.isPending ? "Menyimpan..." : "Simpan Config"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
