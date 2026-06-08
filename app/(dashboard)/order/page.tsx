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
import { useInvoiceList } from "@/lib/hooks/use-invoice"
import { useStravaOrders } from "@/lib/hooks/use-strava-orders"
import { Button } from "@/components/ui/button"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import { InvoiceForm } from "@/components/invoice/InvoiceForm"
import type { OrderSummary } from "@/lib/orders/types"
import type { OrderPrefill } from "@/lib/invoice/types"

type ChannelType = "shopee" | "light-generator" | "strava"

// ── ShopeeOrderView ────────────────────────────────────────────────────────

function ShopeeOrderView() {
  const { intervalMs } = useRefreshConfig()
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } =
    useOrders()
  const markLabel = useMarkLabel()
  const { data: invoiceItems } = useInvoiceList()
  const [filter, setFilter] = useState<OrderFilterValue>("baru")
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoicePrefill, setInvoicePrefill] = useState<OrderPrefill | null>(null)

  const filteredOrders = useMemo(() => {
    if (!data) return []
    switch (filter) {
      case "baru":
        return data.orders.filter((o) => o.shopeeStatus === "READY_TO_SHIP")
      case "perlu_cetak":
        return data.orders.filter((o) => o.shopeeStatus === "PROCESSED" && !o.labelPrinted)
      case "diproses":
        return data.orders.filter((o) => o.shopeeStatus === "PROCESSED" && o.labelPrinted)
      default:
        return data.orders
    }
  }, [data, filter])

  const counts = useMemo(() => {
    if (!data) return { all: 0, baru: 0, perlu_cetak: 0, diproses: 0 }
    return {
      all: data.kpi.total,
      baru: data.kpi.orderBaru,
      perlu_cetak: data.kpi.perluCetak,
      diproses: data.kpi.sudahDiproses,
    }
  }, [data])

  const invoiceMap = useMemo(() => {
    const m = new Map<string, { id: string; nomor: string; status: string }>()
    ;(invoiceItems ?? []).forEach(inv => {
      if (inv.shopeeOrderSn) {
        m.set(inv.shopeeOrderSn, { id: inv.id, nomor: inv.nomor, status: inv.status })
      }
    })
    return m
  }, [invoiceItems])

  function handleCreateInvoice(order: OrderSummary) {
    setInvoicePrefill({
      shopeeOrderSn: order.orderSn,
      buyerUsername: order.buyerUsername ?? order.orderSn,
      items: order.items.map(i => ({
        namaProduk: i.variantName ? `${i.productName} - ${i.variantName}` : i.productName,
        qty: i.qty,
        hargaPerUnit: i.unitPrice,
      })),
      totalAmount: order.totalAmount,
    })
    setShowInvoiceForm(true)
  }

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
        <div className="flex-1">
          <OrderKpiBar
            total={data.kpi.total}
            orderBaru={data.kpi.orderBaru}
            perluCetak={data.kpi.perluCetak}
            sudahDiproses={data.kpi.sudahDiproses}
          />
        </div>
        <RefreshIndicator
          lastUpdated={dataUpdatedAt ? new Date(dataUpdatedAt) : null}
          intervalMs={intervalMs}
          onRefresh={() => refetch()}
        />
      </div>

      <div className="flex items-center justify-between">
        <OrderFilter value={filter} onChange={setFilter} counts={counts} />
      </div>

      <OrderList
        orders={filteredOrders}
        onToggleLabel={(orderSn, printed) =>
          markLabel.mutate({ orderSn, printed })
        }
        pendingOrderSn={pendingSn}
        invoiceMap={invoiceMap}
        onCreateInvoice={handleCreateInvoice}
      />

      {showInvoiceForm && invoicePrefill && (
        <InvoiceForm
          orderPrefill={invoicePrefill}
          onClose={() => { setShowInvoiceForm(false); setInvoicePrefill(null) }}
          onCreated={() => { setShowInvoiceForm(false); setInvoicePrefill(null) }}
        />
      )}
    </div>
  )
}

// ── StravaOrderView ────────────────────────────────────────────────────────

function StravaOrderView() {
  const { data, isLoading, isError, error, refetch } = useStravaOrders()

  if (isLoading) {
    return (
      <div className="py-12 text-center text-gray-400">Memuat order Strava...</div>
    )
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    return (
      <div className="py-12 text-center space-y-3">
        <div className="text-red-500">{msg}</div>
        <div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </div>
      </div>
    )
  }

  if (!data || !data.orders || data.orders.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400">
        Tidak ada order Strava
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500">
        {data.orders.length} order Strava ditemukan
      </div>
      <div className="grid gap-4">
        {data.orders.map((order) => (
          <div
            key={order.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="font-medium">{order.id}</div>
            <pre className="mt-2 text-xs overflow-auto">
              {JSON.stringify(order, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── LightGeneratorOrderView ────────────────────────────────────────────────

function LightGeneratorOrderView() {
  return (
    <div className="py-12 text-center text-gray-400">
      Light Generator order management coming soon
    </div>
  )
}

// ── OrderPage ──────────────────────────────────────────────────────────────

export default function OrderPage() {
  const [channel, setChannel] = useState<ChannelType>("shopee")

  return (
    <div className="space-y-4">
      <GlassPageHeader title="Order" subtitle="Kelola pesanan dari berbagai channel">
      </GlassPageHeader>

      <div className="flex gap-4">
        {/* Sidebar Navigation */}
        <div className="w-40 space-y-2">
          <button
            onClick={() => setChannel("shopee")}
            className={`w-full rounded-md px-3 py-2 text-sm font-medium text-left transition-colors ${
              channel === "shopee"
                ? "bg-[#EE4D2D] text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Shopee
          </button>
          <button
            onClick={() => setChannel("light-generator")}
            className={`w-full rounded-md px-3 py-2 text-sm font-medium text-left transition-colors ${
              channel === "light-generator"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Light Generator
          </button>
          <button
            onClick={() => setChannel("strava")}
            className={`w-full rounded-md px-3 py-2 text-sm font-medium text-left transition-colors ${
              channel === "strava"
                ? "bg-orange-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Strava
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1">
          {channel === "shopee" && <ShopeeOrderView />}
          {channel === "light-generator" && <LightGeneratorOrderView />}
          {channel === "strava" && <StravaOrderView />}
        </div>
      </div>
    </div>
  )
}
