"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRefreshConfig } from "@/lib/use-refresh-config"

export function RefreshIntervalCard() {
  const { intervalMs, updateInterval, options } = useRefreshConfig()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🔄 Auto Refresh</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Interval polling data Shopee API. Disimpan per-browser (localStorage).
        </p>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const isActive = intervalMs === opt.value
            return (
              <Button
                key={opt.value}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => updateInterval(opt.value)}
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
      </CardContent>
    </Card>
  )
}
