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
  const [now, setNow] = useState<number | null>(null)

  // Tick every second: update countdown and `now` (used for "X ago" display).
  // setState is only called from the interval callback — not synchronously in
  // the effect body — to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    const tick = () => {
      setNow(Date.now())
      if (intervalMs > 0) {
        setCountdown((prev) => {
          if (prev <= 1) {
            onRefresh()
            return Math.floor(intervalMs / 1000)
          }
          return prev - 1
        })
      }
    }

    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [lastUpdated, intervalMs, onRefresh])

  // When the interval config changes, reset the countdown via a separate
  // effect that runs only on that change — not on every render.
  useEffect(() => {
    setCountdown(Math.floor(intervalMs / 1000))
  }, [intervalMs])

  const timeAgoSec =
    lastUpdated && now != null
      ? Math.floor((now - lastUpdated.getTime()) / 1000)
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
