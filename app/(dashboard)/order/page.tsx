"use client"

import { useMemo, useState } from "react"
import { OrderKpiBar } from "@/components/order/OrderKpiBar"
import {
  OrderFilter,
  type OrderFilterValue,
} from "@/components/order/OrderFilter"
import { OrderList } from "@/components/order/OrderList"
import { RefreshIndicator } from "@/components/layout/RefreshIndicator"
import { useOrders, useMarkLabel } from "@/lib/hooks/use-orders"
import { useRefreshConfig } from "@/lib/use-refresh-config"
import { Button } from "@/components/ui/button"

export default function OrderPage() {
  const { intervalMs } = useRefreshConfig()
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    useOrders()
  const markLabel = useMarkLabel()
  const [filter, setFilter] = useState<OrderFilterValue>("belum")

  const filteredOrders = useMemo(() => {
    if (!data) return []
    switch (filter) {
      case "belum":
        return data.orders.filter((o) => !o.labelPrinted)
      case "sudah":
        return data.orders.filter((o) => o.labelPrinted)
      default:
        return data.orders
    }
  }, [data, filter])

  const counts = useMemo(() => {
    if (!data) return { all: 0, belum: 0, sudah: 0 }
    return {
      all: data.kpi.total,
      belum: data.kpi.belumCetak,
      sudah: data.kpi.sudahCetak,
    }
  }, [data])

  if (isLoading && !data) {
    return (
      <div className="py-12 text-center text-gray-400">Memuat order...</div>
    )
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    const needsConnect = msg.toLowerCase().includes("not authorized")
    return (
      <div className="py-12 text-center space-y-3">
        <div className="text-red-500">{msg}</div>
        {needsConnect && (
          <a
            href="/api/shopee/auth"
            className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-[#EE4D2D] hover:bg-[#d44226] text-white text-sm font-medium"
          >
            Hubungkan Shopee
          </a>
        )}
        <div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const pendingSn = markLabel.isPending
    ? (markLabel.variables?.orderSn ?? null)
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Order</h1>
        <RefreshIndicator
          lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
          intervalMs={intervalMs}
          onRefresh={() => refetch()}
        />
      </div>

      <OrderKpiBar
        total={data.kpi.total}
        belumCetak={data.kpi.belumCetak}
        sudahCetak={data.kpi.sudahCetak}
      />

      <div className="flex items-center justify-between">
        <OrderFilter value={filter} onChange={setFilter} counts={counts} />
      </div>

      <OrderList
        orders={filteredOrders}
        onToggleLabel={(orderSn, printed) =>
          markLabel.mutate({ orderSn, printed })
        }
        pendingOrderSn={pendingSn}
      />
    </div>
  )
}
