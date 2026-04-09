"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

interface RefreshIndicatorProps {
  lastUpdated: Date | null
  intervalMs: number
  onRefresh: () => void
}

export function RefreshIndicator({
  lastUpdated,
  intervalMs,
  onRefresh,
}: RefreshIndicatorProps) {
  const [countdown, setCountdown] = useState(Math.floor(intervalMs / 1000))

  useEffect(() => {
    if (intervalMs <= 0) return

    setCountdown(Math.floor(intervalMs / 1000))
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onRefresh()
          return Math.floor(intervalMs / 1000)
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [lastUpdated, intervalMs, onRefresh])

  const timeAgoSec = lastUpdated
    ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
    : null

  const timeAgoText =
    timeAgoSec == null
      ? null
      : timeAgoSec < 60
        ? `${timeAgoSec}d`
        : `${Math.floor(timeAgoSec / 60)}m`

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {timeAgoText && <span>Update {timeAgoText} lalu</span>}
      {intervalMs > 0 && <span>· refresh dalam {countdown}d</span>}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={onRefresh}
      >
        ↻
      </Button>
    </div>
  )
}
