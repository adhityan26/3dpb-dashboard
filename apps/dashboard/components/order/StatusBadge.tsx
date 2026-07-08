"use client"

import type { StravaStatus } from "@/lib/strava/types"

interface StatusBadgeProps {
  status: StravaStatus
}

const statusConfig: Record<
  StravaStatus,
  {
    label: string
    bgColor: string
    textColor: string
  }
> = {
  pending: {
    label: "Pending",
    bgColor: "rgba(251, 191, 36, 0.15)",
    textColor: "#fbbf24",
  },
  confirmed: {
    label: "Confirmed",
    bgColor: "rgba(59, 130, 246, 0.15)",
    textColor: "#60a5fa",
  },
  processing: {
    label: "Processing",
    bgColor: "rgba(168, 85, 247, 0.15)",
    textColor: "#d8b4fe",
  },
  completed: {
    label: "Completed",
    bgColor: "rgba(34, 197, 94, 0.15)",
    textColor: "#34d399",
  },
  cancelled: {
    label: "Cancelled",
    bgColor: "rgba(239, 68, 68, 0.15)",
    textColor: "#f87171",
  },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status]

  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded"
      style={{
        backgroundColor: config.bgColor,
        color: config.textColor,
      }}
    >
      {config.label}
    </span>
  )
}
