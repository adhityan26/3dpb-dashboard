"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
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
import { useLgOrders, useCreateInternalLgOrder } from "@/lib/hooks/use-light-generator"
import { LgOrderTable } from "@/components/light-generator/LgOrderTable"
import { Button } from "@/components/ui/button"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import { OrderSidebar, type OrderChannel } from "@/components/order/OrderSidebar"
import { StravaOrderList } from "@/components/order/StravaOrderList"
import { InvoiceForm } from "@/components/invoice/InvoiceForm"
import type { OrderSummary } from "@/lib/orders/types"
import type { OrderPrefill } from "@/lib/invoice/types"
import { useTokopediaSession, useTokopediaOrders, useTokopediaOrder } from "@/lib/hooks/use-tokopedia"

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
      <div className="py-12 text-center g-t3">Memuat order Strava...</div>
    )
  }

  if (isError) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    return (
      <div className="py-12 text-center space-y-3">
        <div style={{ color: "rgba(252, 165, 165, 0.8)" }}>{msg}</div>
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
      <div className="py-12 text-center g-t4">
        Tidak ada order Strava
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <StravaOrderList orders={data.orders as any} onStatusChange={() => {}} onViewDetails={() => {}} />
    </div>
  )
}

// ── LightGeneratorOrderView ────────────────────────────────────────────────

type LgOwnership = "all" | "customer" | "internal"
const LG_OWNERSHIP: { value: LgOwnership; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "customer", label: "Customer" },
  { value: "internal", label: "Internal" },
]

function LightGeneratorOrderView() {
  const router = useRouter()
  const { data, isLoading } = useLgOrders() // all orders (customer + internal)
  const createMut = useCreateInternalLgOrder()
  const [ownership, setOwnership] = useState<LgOwnership>("all")

  async function handleCreate() {
    const order = await createMut.mutateAsync(undefined)
    router.push(`/light-generator/${order.id}`)
  }

  const orders = useMemo(() => {
    const all = data?.orders ?? []
    if (ownership === "internal") return all.filter((o) => o.isInternal)
    if (ownership === "customer") return all.filter((o) => !o.isInternal)
    return all
  }, [data, ownership])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {LG_OWNERSHIP.map((f) => (
            <button
              key={f.value}
              onClick={() => setOwnership(f.value)}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors
                ${ownership === f.value
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-border text-muted-foreground hover:bg-muted"
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={handleCreate} disabled={createMut.isPending}>
          {createMut.isPending ? "Membuat..." : "+ Buat Order Internal"}
        </Button>
      </div>

      {createMut.isError && (
        <p className="text-sm text-destructive">
          Gagal membuat order: {createMut.error instanceof Error ? createMut.error.message : "Unknown error"}
        </p>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-muted-foreground">Memuat...</p>
      ) : (
        <LgOrderTable orders={orders} />
      )}
    </div>
  )
}

// ── TokopediaOrderView ─────────────────────────────────────────────────────

function TokopediaOrderView() {
  const [tab, setTab] = useState<"perlu-dikirim" | "semua">("perlu-dikirim")
  const [searchId, setSearchId] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const { data: sessionStatus } = useTokopediaSession()
  const { data, isLoading, isError, error } = useTokopediaOrders(tab)
  const { data: detail } = useTokopediaOrder(openId ?? (searchId.trim() || null))

  const sessionBad = sessionStatus && (!sessionStatus.exists || sessionStatus.expired)

  return (
    <div className="space-y-4">
      {sessionBad && (
        <div className="rounded-md border px-4 py-3 text-sm" style={{ borderColor: "rgba(245,158,11,0.4)", color: "#f59e0b" }}>
          Session Tokopedia belum ada / expired. Buka Settings → Tokopedia Session untuk paste cookies.
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {(["perlu-dikirim", "semua"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-full text-sm font-medium border ${tab === t ? "bg-indigo-600 text-white border-indigo-600" : "border-border text-muted-foreground hover:bg-muted"}`}>
            {t === "perlu-dikirim" ? "Perlu Dikirim" : "Semua"}
          </button>
        ))}
        <input value={searchId} onChange={e => setSearchId(e.target.value)} placeholder="Cari order ID..."
          className="ml-auto h-8 rounded-md border px-3 text-sm bg-transparent" />
      </div>

      {isError ? (
        <p className="py-8 text-center text-destructive">{error instanceof Error ? error.message : "Error"}</p>
      ) : isLoading ? (
        <p className="py-8 text-center text-muted-foreground">Memuat...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b">
              <th className="py-2 pr-4">Order ID</th><th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Produk</th><th className="py-2 pr-4">Kurir</th>
              <th className="py-2 pr-4">Resi</th><th className="py-2 pr-4">Total</th>
            </tr></thead>
            <tbody>
              {(data?.orders ?? []).map(o => (
                <tr key={o.orderId} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(o.orderId)}>
                  <td className="py-2 pr-4 font-mono text-xs">{o.orderId}</td>
                  <td className="py-2 pr-4">{o.statusLabel}</td>
                  <td className="py-2 pr-4">{o.products.map(p => `${p.name}${p.variant ? ` (${p.variant})` : ""} ×${p.qty}`).join(", ")}</td>
                  <td className="py-2 pr-4">{o.courier ?? "-"}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{o.trackingNo ?? "-"}</td>
                  <td className="py-2 pr-4">Rp {o.grandTotal.toLocaleString("id-ID")}</td>
                </tr>
              ))}
              {(data?.orders ?? []).length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada order</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && (openId || searchId.trim()) && (
        <div className="rounded-md border p-4 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono">{detail.orderId} · {detail.statusLabel}</span>
            <button className="text-xs text-muted-foreground" onClick={() => { setOpenId(null); setSearchId("") }}>tutup</button>
          </div>
          <div>Produk: {detail.products.map(p => `${p.name}${p.variant ? ` (${p.variant})` : ""} ×${p.qty}`).join(", ")}</div>
          <div>Kurir: {detail.courier ?? "-"} {detail.serviceType ? `(${detail.serviceType})` : ""} · Resi: {detail.trackingNo ?? "-"}</div>
          {detail.latestLogistic && <div>Update: {detail.latestLogistic.msg}</div>}
          <div>Buyer: {detail.buyerNickname ?? "-"} · Total: Rp {detail.grandTotal.toLocaleString("id-ID")}</div>
          {detail.note && <div>Catatan: {detail.note}</div>}
        </div>
      )}
    </div>
  )
}

// ── OrderPage ──────────────────────────────────────────────────────────────

export default function OrderPage() {
  const [channel, setChannel] = useState<OrderChannel>("shopee")

  return (
    <div className="space-y-4">
      <GlassPageHeader title="Order" subtitle="Kelola pesanan dari berbagai channel">
      </GlassPageHeader>

      <div className="flex gap-4">
        <OrderSidebar active={channel} onChange={(ch) => setChannel(ch)} />

                {/* Content Area */}
        <div className="flex-1 overflow-auto">
          {channel === "shopee" && <ShopeeOrderView />}
          {channel === "tokopedia" && <TokopediaOrderView />}
          {channel === "light-generator" && <LightGeneratorOrderView />}
          {channel === "strava" && <StravaOrderView />}
        </div>
      </div>
    </div>
  )
}
