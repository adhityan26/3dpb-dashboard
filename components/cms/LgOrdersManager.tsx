"use client"

import Link from "next/link"
import { useState } from "react"
import { useSanityOrders, useConfirmLgOrder } from "@/lib/hooks/use-light-generator"
import { CollectionList } from "./shared/CollectionList"
import type { SanityLgOrderWithConfirmed } from "@/lib/light-generator/types"

export function LgOrdersManager() {
  const { data: items = [], isLoading } = useSanityOrders()
  const confirm = useConfirmLgOrder()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  if (isLoading) return <div className="p-6 text-white/40 text-sm">Memuat...</div>

  const pendingCount = items.filter((i) => !i.isConfirmed).length

  function handleConfirm(orderId: string) {
    setConfirming(orderId)
    setFeedback((f) => ({ ...f, [orderId]: "" }))
    confirm.mutate(orderId, {
      onSuccess: () => {
        setConfirming(null)
      },
      onError: (err) => {
        setFeedback((f) => ({ ...f, [orderId]: `❌ ${err.message}` }))
        setConfirming(null)
      },
    })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-white">🔦 Light Generator Orders</h2>
          <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
            {items.length} total{pendingCount > 0 ? ` · ${pendingCount} menunggu konfirmasi` : " · semua terkonfirmasi"}
          </p>
        </div>
        <Link
          href="/light-generator"
          className="text-[11px] font-medium transition-opacity hover:opacity-80"
          style={{ color: "rgba(165,180,252,0.8)" }}
        >
          Lihat semua →
        </Link>
      </div>

      <CollectionList
        items={items}
        emptyMessage="Tidak ada order dari landing page."
        columns={[
          {
            key: "id",
            label: "Order ID",
            width: "160px",
            render: (item: SanityLgOrderWithConfirmed) => (
              <span className="text-[11px] font-mono text-white/70">{item.orderId}</span>
            ),
          },
          {
            key: "customer",
            label: "Pelanggan",
            width: "160px",
            render: (item: SanityLgOrderWithConfirmed) => (
              <div>
                <div className="text-[12px] text-white/80">{item.customerName}</div>
                <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {item.customerContact}
                </div>
              </div>
            ),
          },
          {
            key: "config",
            label: "Config",
            render: (item: SanityLgOrderWithConfirmed) => (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {item.size} · {item.shape}
              </div>
            ),
          },
          {
            key: "date",
            label: "Tanggal",
            width: "90px",
            render: (item: SanityLgOrderWithConfirmed) => (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {new Date(item.submittedAt).toLocaleDateString("id-ID")}
              </div>
            ),
          },
          {
            key: "action",
            label: "",
            width: "120px",
            render: (item: SanityLgOrderWithConfirmed) => {
              if (item.isConfirmed) {
                return (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full"
                    style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                  >
                    ✅ Confirmed
                  </span>
                )
              }
              const fb = feedback[item.orderId]
              if (fb) {
                return <span className="text-[10px]">{fb}</span>
              }
              return (
                <button
                  onClick={() => handleConfirm(item.orderId)}
                  disabled={confirming === item.orderId}
                  className="text-[11px] font-semibold px-3 py-1 rounded-[6px] transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: "rgba(99,102,241,0.25)", color: "#a5b4fc" }}
                >
                  {confirming === item.orderId ? "..." : "Confirm"}
                </button>
              )
            },
          },
        ]}
      />
    </div>
  )
}
