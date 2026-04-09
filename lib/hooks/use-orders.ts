"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { OrderListResult } from "@/lib/orders/types"
import { useRefreshConfig } from "@/lib/use-refresh-config"

const ORDERS_KEY = ["orders", "ready-to-ship"] as const

async function fetchOrders(): Promise<OrderListResult> {
  const res = await fetch("/api/orders")
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export function useOrders() {
  const { intervalMs } = useRefreshConfig()
  return useQuery({
    queryKey: ORDERS_KEY,
    queryFn: fetchOrders,
    refetchInterval: intervalMs > 0 ? intervalMs : false,
    refetchIntervalInBackground: false,
  })
}

interface SetLabelVariables {
  orderSn: string
  printed: boolean
}

async function setLabel(params: SetLabelVariables): Promise<void> {
  const res = await fetch(`/api/orders/${params.orderSn}/label`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printed: params.printed }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}

export function useMarkLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: setLabel,
    onMutate: async ({ orderSn, printed }) => {
      await queryClient.cancelQueries({ queryKey: ORDERS_KEY })
      const previous = queryClient.getQueryData<OrderListResult>(ORDERS_KEY)
      if (previous) {
        const nextOrders = previous.orders.map((o) =>
          o.orderSn === orderSn
            ? {
                ...o,
                labelPrinted: printed,
                labelPrintedAt: printed ? new Date().toISOString() : null,
              }
            : o,
        )
        const total = nextOrders.length
        const sudahCetak = nextOrders.filter((o) => o.labelPrinted).length
        const updated: OrderListResult = {
          ...previous,
          orders: nextOrders,
          kpi: { total, belumCetak: total - sudahCetak, sudahCetak },
        }
        queryClient.setQueryData(ORDERS_KEY, updated)
      }
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(ORDERS_KEY, ctx.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ORDERS_KEY })
    },
  })
}
