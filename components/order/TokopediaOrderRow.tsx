"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import type { TokopediaOrderSummary } from "@/lib/tokopedia/types"

interface TokopediaOrderRowProps {
  order: TokopediaOrderSummary
  defaultExpanded?: boolean
}

function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID")
}

// status → visual vocabulary (mirrors Shopee OrderRow's dot/border scheme)
function statusStyle(code: number | null): { dot: string; dotClass: string; border: string; bg: string; badgeBg: string; badgeColor: string } {
  if (code === 140) {
    return { dot: "🟢", dotClass: "text-green-500", border: "rgba(34,197,94,0.3)", bg: "rgba(34,197,94,0.08)", badgeBg: "rgba(34,197,94,0.15)", badgeColor: "#22c55e" }
  }
  if (code === 120 || code === 121 || code === 130) {
    return { dot: "🔵", dotClass: "text-sky-400", border: "rgba(56,189,248,0.35)", bg: "rgba(56,189,248,0.08)", badgeBg: "rgba(56,189,248,0.15)", badgeColor: "#38bdf8" }
  }
  // 110 Perlu Dikirim (and unknown)
  return { dot: "🟡", dotClass: "text-yellow-400", border: "rgba(251,191,36,0.4)", bg: "rgba(251,191,36,0.1)", badgeBg: "rgba(251,191,36,0.2)", badgeColor: "#f59e0b" }
}

export function TokopediaOrderRow({ order, defaultExpanded = false }: TokopediaOrderRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const s = statusStyle(order.statusCode)
  const totalQty = order.products.reduce((sum, p) => sum + p.qty, 0)
  const first = order.products[0]

  return (
    <Card style={{ borderColor: s.border, background: s.bg }}>
      <CardContent className="p-3">
        <button type="button" onClick={() => setExpanded(e => !e)} className="w-full text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={s.dotClass}>{s.dot}</span>
            <span className="font-mono text-sm font-semibold">#{order.orderId}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: s.badgeBg, color: s.badgeColor }}>
              {order.statusLabel}
            </span>
            {order.trackingNo && (
              <span className="text-[11px] font-mono text-muted-foreground">📦 {order.trackingNo}</span>
            )}
          </div>

          <div className="mt-1 text-sm text-gray-700 dark:text-slate-300">
            {first ? first.name : "(no items)"}
            {first?.variant && <span className="text-gray-500 dark:text-slate-400"> · {first.variant}</span>}
            {order.products.length > 1 && (
              <span className="text-gray-500 dark:text-slate-400"> · +{order.products.length - 1} item lain</span>
            )}
          </div>

          <div className="text-xs text-gray-500 dark:text-slate-400">
            {totalQty} pcs · {rupiah(order.grandTotal)}
            {order.courier && <> · {order.courier}{order.serviceType ? ` (${order.serviceType})` : ""}</>}
            {order.buyerNickname && <> · {order.buyerNickname}</>}
          </div>

          {order.latestLogistic && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">🚚 {order.latestLogistic.msg}</div>
          )}
        </button>

        {expanded && (
          <div className="mt-3 border-t dark:border-slate-700 pt-3 space-y-2 text-xs">
            {order.products.map((p, idx) => (
              <div key={idx} className="flex justify-between gap-2">
                <div>
                  <div className="font-medium">{p.name}</div>
                  {p.variant && <div className="text-gray-500 dark:text-slate-400">{p.variant}</div>}
                </div>
                <div className="text-right">
                  <div>{p.qty} pcs</div>
                  <div className="text-gray-500 dark:text-slate-400">{rupiah(p.totalPrice)}</div>
                </div>
              </div>
            ))}
            <div className="pt-2 border-t dark:border-slate-700 space-y-1 text-gray-500 dark:text-slate-400">
              <div>Kurir: {order.courier ?? "-"}{order.serviceType ? ` (${order.serviceType})` : ""} · Resi: {order.trackingNo ?? "-"}</div>
              <div>Buyer: {order.buyerNickname ?? "-"} · Subtotal: {rupiah(order.subTotal)} · Total: {rupiah(order.grandTotal)}</div>
              {order.note && <div>Catatan: {order.note}</div>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
