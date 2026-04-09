"use client"

import type { OrderSummary } from "@/lib/orders/types"
import { OrderRow } from "./OrderRow"

interface OrderListProps {
  orders: OrderSummary[]
  onToggleLabel: (orderSn: string, printed: boolean) => void
  pendingOrderSn: string | null
}

export function OrderList({
  orders,
  onToggleLabel,
  pendingOrderSn,
}: OrderListProps) {
  if (orders.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        Tidak ada order untuk filter ini.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {orders.map((o) => (
        <OrderRow
          key={o.orderSn}
          order={o}
          onToggleLabel={onToggleLabel}
          isPending={pendingOrderSn === o.orderSn}
        />
      ))}
    </div>
  )
}
