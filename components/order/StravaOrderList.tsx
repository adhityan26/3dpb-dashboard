"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { StravaOrder, StravaStatus } from "@/lib/strava/types"
import { StatusBadge } from "./StatusBadge"

interface StravaOrderListProps {
  orders: StravaOrder[]
  onStatusChange: (orderId: string, newStatus: StravaStatus) => void
  onViewDetails: (orderId: string) => void
}

function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function StravaOrderList({
  orders,
  onStatusChange,
  onViewDetails,
}: StravaOrderListProps) {
  if (orders.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        Tidak ada order untuk filter ini.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <Card key={order.id} className="border border-slate-200 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              {/* Order ID */}
              <div className="flex-shrink-0 min-w-0">
                <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                  #{order.orderId}
                </div>
              </div>

              {/* Date */}
              <div className="flex-shrink-0 min-w-0 text-xs text-slate-500 dark:text-slate-400">
                {formatDate(order.createdAt)}
              </div>

              {/* Customer */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-900 dark:text-slate-100 truncate">
                  {order.customerName}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {order.customerEmail}
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex-shrink-0">
                <StatusBadge status={order.status} />
              </div>

              {/* Actions */}
              <div className="flex-shrink-0 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewDetails(order.id)}
                >
                  Details
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
