"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { AlertThresholds } from "@/lib/settings/types"
import { useUpdateSettings } from "@/lib/hooks/use-settings"

interface Props {
  thresholds: AlertThresholds
}

function thresholdsToForm(thresholds: AlertThresholds) {
  return {
    stockMin: String(thresholds.stockMin),
    roasMin: String(thresholds.roasMin),
    orderPileupCount: String(thresholds.orderPileupCount),
    orderPileupHours: String(thresholds.orderPileupHours),
  }
}

export function AlertThresholdCard({ thresholds }: Props) {
  const [tracked, setTracked] = useState(thresholds)
  const [form, setForm] = useState(thresholdsToForm(thresholds))
  const [feedback, setFeedback] = useState<string | null>(null)

  if (thresholds !== tracked) {
    setTracked(thresholds)
    setForm(thresholdsToForm(thresholds))
  }

  const update = useUpdateSettings()

  function handleSave() {
    setFeedback(null)
    const parsed = {
      stockMin: Number(form.stockMin),
      roasMin: Number(form.roasMin),
      orderPileupCount: Number(form.orderPileupCount),
      orderPileupHours: Number(form.orderPileupHours),
    }
    if (Object.values(parsed).some((v) => Number.isNaN(v) || v < 0)) {
      setFeedback("❌ Semua nilai harus angka positif")
      return
    }
    update.mutate(
      { thresholds: parsed },
      {
        onSuccess: () => setFeedback("✅ Threshold tersimpan"),
        onError: (err) => setFeedback(`❌ ${err.message}`),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">⚠️ Alert Threshold</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="stock-min">Stok Minimum (pcs)</Label>
            <Input
              id="stock-min"
              type="number"
              value={form.stockMin}
              onChange={(e) => setForm({ ...form, stockMin: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="roas-min">ROAS Minimum (x)</Label>
            <Input
              id="roas-min"
              type="number"
              step="0.1"
              value={form.roasMin}
              onChange={(e) => setForm({ ...form, roasMin: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-count">Order Numpuk (count)</Label>
            <Input
              id="order-count"
              type="number"
              value={form.orderPileupCount}
              onChange={(e) =>
                setForm({ ...form, orderPileupCount: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-hours">Setelah (jam)</Label>
            <Input
              id="order-hours"
              type="number"
              value={form.orderPileupHours}
              onChange={(e) =>
                setForm({ ...form, orderPileupHours: e.target.value })
              }
            />
          </div>
        </div>
        {feedback && <div className="text-xs">{feedback}</div>}
        <Button
          onClick={handleSave}
          disabled={update.isPending}
          className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
        >
          {update.isPending ? "Menyimpan..." : "Simpan Threshold"}
        </Button>
      </CardContent>
    </Card>
  )
}
