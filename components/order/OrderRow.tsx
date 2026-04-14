"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { OrderSummary } from "@/lib/orders/types"

interface OrderRowProps {
  order: OrderSummary
  onToggleLabel: (orderSn: string, printed: boolean) => void
  isPending: boolean
}

function formatTime(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function OrderRow({ order, onToggleLabel, isPending }: OrderRowProps) {
  const [expanded, setExpanded] = useState(false)
  const totalQty = order.items.reduce((s, it) => s + it.qty, 0)
  const firstItem = order.items[0]

  return (
    <Card className={order.labelPrinted ? "bg-green-50/40 dark:bg-green-950/30" : "bg-amber-50/40 dark:bg-amber-950/30"}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex-1 text-left"
          >
            <div className="flex items-center gap-2">
              <span
                className={
                  order.labelPrinted ? "text-green-600" : "text-amber-600"
                }
              >
                {order.labelPrinted ? "🟢" : "🟡"}
              </span>
              <span className="font-mono text-sm font-semibold">
                #{order.orderSn}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTime(order.createTime)}
              </span>
            </div>
            <div className="mt-1 text-sm text-gray-700">
              {firstItem?.productName ?? "(no items)"}
              {firstItem?.variantName && (
                <span className="text-gray-500">
                  {" "}
                  · {firstItem.variantName}
                </span>
              )}
              {order.items.length > 1 && (
                <span className="text-gray-500">
                  {" "}
                  · +{order.items.length - 1} item lain
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {totalQty} pcs · {formatCurrency(order.totalAmount, order.currency)}
              {order.buyerUsername && <> · {order.buyerUsername}</>}
            </div>
          </button>

          <Button
            variant={order.labelPrinted ? "outline" : "default"}
            size="sm"
            disabled={isPending}
            onClick={() => onToggleLabel(order.orderSn, !order.labelPrinted)}
            className={
              order.labelPrinted
                ? ""
                : "bg-[#EE4D2D] hover:bg-[#d44226] text-white"
            }
          >
            {order.labelPrinted ? "Tandai Belum" : "Tandai Cetak"}
          </Button>
        </div>

        {expanded && (
          <div className="mt-3 border-t pt-3 space-y-2 text-xs">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between gap-2">
                <div>
                  <div className="font-medium">{item.productName}</div>
                  {item.variantName && (
                    <div className="text-gray-500">{item.variantName}</div>
                  )}
                  {item.sku && (
                    <div className="text-gray-400">SKU: {item.sku}</div>
                  )}
                </div>
                <div className="text-right">
                  <div>{item.qty} pcs</div>
                  <div className="text-gray-500">
                    {formatCurrency(item.unitPrice, order.currency)}
                  </div>
                </div>
              </div>
            ))}
            {order.labelPrintedAt && (
              <div className="text-gray-400 pt-1 border-t">
                Dicetak:{" "}
                {new Date(order.labelPrintedAt).toLocaleString("id-ID")}
                {order.labelPrintedBy && <> oleh {order.labelPrintedBy}</>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
