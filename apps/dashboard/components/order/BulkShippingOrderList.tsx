"use client"

import type { OrderSummary } from "@/lib/orders/types"

export interface BulkShippingOrderListProps {
  orders: OrderSummary[]
  selectedSns: Set<string>
  onToggleSelect: (orderSn: string) => void
  onToggleSelectAll: () => void
}

function formatDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function BulkShippingOrderList({ orders, selectedSns, onToggleSelect, onToggleSelectAll }: BulkShippingOrderListProps) {
  if (orders.length === 0) {
    return <div className="py-12 text-center text-gray-400 text-sm">Tidak ada order Ready to Ship saat ini.</div>
  }

  const allSelected = orders.length > 0 && orders.every((o) => selectedSns.has(o.orderSn))

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 pb-2 border-b border-white/10 font-semibold text-sm">
        <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} aria-label="Pilih semua order" />
        Pilih Semua ({orders.length})
      </label>
      {orders.map((order) => (
        <label key={order.orderSn} className="flex items-start gap-2 py-2 border-b border-white/5 text-sm">
          <input
            type="checkbox"
            checked={selectedSns.has(order.orderSn)}
            onChange={() => onToggleSelect(order.orderSn)}
            aria-label={`Pilih order ${order.orderSn}`}
            className="mt-1"
          />
          <span className="flex-1 min-w-0">
            <span className="block">
              #{order.orderSn}
              {order.buyerUsername ? ` — ${order.buyerUsername}` : ""}
            </span>
            <span className="block text-xs text-gray-400">
              {order.items.map((i, idx) => (
                <span key={idx} className="block">
                  {i.productName}
                  {i.variantName ? <span className="text-gray-500"> · {i.variantName}</span> : null}
                </span>
              ))}
            </span>
            <span className="block text-xs text-gray-400 mt-0.5">
              Dipesan {formatDate(order.createTime)}
              {order.shipByDate ? ` · Kirim sebelum ${formatDate(order.shipByDate)}` : ""}
              {order.shippingCarrier ? ` · ${order.shippingCarrier}` : ""}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}
