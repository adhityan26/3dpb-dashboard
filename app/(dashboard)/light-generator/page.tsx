"use client"

import { Suspense, useState } from "react"
import { useRouter } from "next/navigation"
import { useLgOrders, useSanityOrders, useConfirmLgOrder } from "@/lib/hooks/use-light-generator"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { LgOrder, SanityLgOrder, LgStatus } from "@/lib/light-generator/types"

const STATUSES: Array<LgStatus | "all"> = ["all", "submitted", "paid", "generating", "ready", "shipped", "cancelled"]

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-gray-500",
  paid:       "bg-blue-500",
  generating: "bg-yellow-500",
  ready:      "bg-green-500",
  shipped:    "bg-purple-500",
  cancelled:  "bg-red-500",
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "bg-gray-500"
  return <span className={`inline-block px-2 py-0.5 rounded text-white text-xs font-medium ${color}`}>{status}</span>
}

function PendingSanityPanel() {
  const { data: pending, isLoading } = useSanityOrders()
  const confirm = useConfirmLgOrder()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  if (isLoading) {
    return (
      <div className="mb-6 text-sm text-muted-foreground">⏳ Mengecek order pending dari Sanity...</div>
    )
  }
  if (!pending?.length) return null

  function handleConfirm(order: SanityLgOrder) {
    setConfirming(order.orderId)
    confirm.mutate(order.orderId, {
      onSuccess: () => {
        setFeedback((f) => ({ ...f, [order.orderId]: "✅ Confirmed" }))
        setConfirming(null)
      },
      onError: (err) => {
        setFeedback((f) => ({ ...f, [order.orderId]: `❌ ${err.message}` }))
        setConfirming(null)
      },
    })
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">⏳ Pending dari Sanity ({pending.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-4">Order ID</th>
                <th className="py-2 pr-4">Nama</th>
                <th className="py-2 pr-4">Ukuran</th>
                <th className="py-2 pr-4">Shape</th>
                <th className="py-2 pr-4">Submitted</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((o) => (
                <tr key={o.orderId} className="border-b hover:bg-muted/30">
                  <td className="py-2 pr-4 font-mono">{o.orderId}</td>
                  <td className="py-2 pr-4">{o.customerName}</td>
                  <td className="py-2 pr-4">{o.size}</td>
                  <td className="py-2 pr-4">{o.shape}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {new Date(o.submittedAt).toLocaleDateString("id-ID")}
                  </td>
                  <td className="py-2">
                    {feedback[o.orderId] ? (
                      <span className="text-xs">{feedback[o.orderId]}</span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(o)}
                        disabled={confirming === o.orderId}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {confirming === o.orderId ? "..." : "Confirm"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function OrderTable({ orders }: { orders: LgOrder[] }) {
  const router = useRouter()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Order ID</th>
            <th className="py-2 pr-4">Nama</th>
            <th className="py-2 pr-4">Ukuran</th>
            <th className="py-2 pr-4">Shape</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Tanggal</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const cfg = JSON.parse(o.configJsonOperator ?? o.configJson) as { size?: string; shape?: string }
            return (
              <tr
                key={o.id}
                className="border-b hover:bg-muted/30 cursor-pointer"
                onClick={() => router.push(`/light-generator/${o.id}`)}
              >
                <td className="py-2 pr-4 font-mono">{o.id}</td>
                <td className="py-2 pr-4">{o.customerName}</td>
                <td className="py-2 pr-4">{cfg.size ?? "-"}</td>
                <td className="py-2 pr-4">{cfg.shape ?? "-"}</td>
                <td className="py-2 pr-4"><StatusBadge status={o.status} /></td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {new Date(o.createdAt).toLocaleDateString("id-ID")}
                </td>
              </tr>
            )
          })}
          {orders.length === 0 && (
            <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Tidak ada order</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function LightGeneratorPageInner() {
  const [activeStatus, setActiveStatus] = useState<LgStatus | "all">("all")
  const { data: allData, isLoading } = useLgOrders() // always fetch all

  // Count per status
  const counts: Record<string, number> = {}
  if (allData?.orders) {
    for (const o of allData.orders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1
    }
  }

  // Filter client-side
  const filteredOrders = activeStatus === "all"
    ? (allData?.orders ?? [])
    : (allData?.orders ?? []).filter((o) => o.status === activeStatus)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">💡 Light Generator Orders</h1>

      <PendingSanityPanel />

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const count = s === "all" ? allData?.total : counts[s]
          return (
            <button
              key={s}
              onClick={() => setActiveStatus(s)}
              className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors
                ${activeStatus === s
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-border text-muted-foreground hover:bg-muted"
                }`}
            >
              {s} {count != null && count > 0 ? `(${count})` : ""}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Memuat...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <OrderTable orders={filteredOrders} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function LightGeneratorPage() {
  return (
    <Suspense>
      <LightGeneratorPageInner />
    </Suspense>
  )
}
