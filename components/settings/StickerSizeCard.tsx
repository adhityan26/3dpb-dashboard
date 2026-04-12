"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const STICKER_OPTIONS = [
  { label: "40x30mm", value: "40x30" },
  { label: "30x20mm", value: "30x20" },
  { label: "50x30mm", value: "50x30" },
]

interface StickerSizeCardProps {
  initialSize: string
}

export function StickerSizeCard({ initialSize }: StickerSizeCardProps) {
  const [selected, setSelected] = useState(initialSize)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(size: string) {
    setSelected(size)
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch("/api/settings/filamen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stickerSize: size }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🏷️ Stiker Spool</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Ukuran stiker yang dicetak untuk setiap spool.
        </p>
        <div className="flex flex-wrap gap-2">
          {STICKER_OPTIONS.map((opt) => {
            const isActive = selected === opt.value
            return (
              <Button
                key={opt.value}
                variant={isActive ? "default" : "outline"}
                size="sm"
                disabled={saving}
                onClick={() => handleSave(opt.value)}
                className={
                  isActive
                    ? "bg-[#EE4D2D] hover:bg-[#d44226] text-white"
                    : ""
                }
              >
                {opt.label}
              </Button>
            )
          })}
        </div>
        {saving && <div className="text-xs text-gray-500">Menyimpan...</div>}
        {saved && <div className="text-xs text-green-600">✅ Tersimpan</div>}
        {error && <div className="text-xs text-red-500">❌ {error}</div>}
      </CardContent>
    </Card>
  )
}
