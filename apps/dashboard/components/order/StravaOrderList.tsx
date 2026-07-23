"use client"

import { Button } from "@/components/ui/button"
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
      <div className="py-12 text-center g-t4 text-sm">
        Tidak ada order untuk filter ini.
      </div>
    )
  }

  return (
    <div
      className="rounded-[5px] border overflow-hidden"
      style={{
        borderColor: "rgba(99,102,241,0.15)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      {/* Header Row */}
      <div
        className="flex items-center gap-4 px-4 py-3 border-b"
        style={{
          background: "rgba(255,255,255,0.03)",
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ color: "rgba(165,180,252,0.6)" }} className="text-xs font-semibold uppercase tracking-wider w-24">
          Order ID
        </div>
        <div style={{ color: "rgba(165,180,252,0.6)" }} className="text-xs font-semibold uppercase tracking-wider w-32">
          Date
        </div>
        <div style={{ color: "rgba(165,180,252,0.6)" }} className="text-xs font-semibold uppercase tracking-wider flex-1">
          Customer
        </div>
        <div style={{ color: "rgba(165,180,252,0.6)" }} className="text-xs font-semibold uppercase tracking-wider w-24">
          Status
        </div>
        <div style={{ color: "rgba(165,180,252,0.6)" }} className="text-xs font-semibold uppercase tracking-wider w-20">
          Actions
        </div>
      </div>

      {/* Rows */}
      {orders.map((order, idx) => (
        <div
          key={order.id}
          className="flex items-center gap-4 px-4 py-3 border-b transition-colors hover:bg-white/[0.02]"
          style={{
            borderColor: idx === orders.length - 1 ? "transparent" : "rgba(255,255,255,0.04)",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {/* Order ID */}
          <div className="flex-shrink-0 w-24">
            <div className="font-mono text-sm font-semibold g-t1">
              #{order.orderId}
            </div>
          </div>

          {/* Date */}
          <div className="flex-shrink-0 w-32 text-xs g-t3">
            {formatDate(order.createdAt)}
          </div>

          {/* Customer */}
          <div className="flex-1 min-w-0">
            <div className="text-sm g-t2 truncate">
              {order.customerName}
            </div>
            <div className="text-xs g-t3 truncate">
              {order.customerEmail}
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex-shrink-0 w-24">
            <StatusBadge status={order.status} />
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 w-20 flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewDetails(order.id)}
              className="text-xs"
            >
              View
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
