"use client"

import { useState } from "react"
import Image from "next/image"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import type { TokopediaOrderSummary } from "@/lib/tokopedia/types"
import { buildMultiItemProduct } from "@/lib/working-projects/format"
import {
  WORKING_PROJECT_FORUM_CHANNELS,
  createWorkingProjectFromOrder,
} from "@/lib/working-projects/create-from-order"

interface TokopediaOrderRowProps {
  order: TokopediaOrderSummary
  defaultExpanded?: boolean
}

function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID")
}

function formatDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

function shipBy(unixSec: number): { text: string; urgent: boolean; overdue: boolean } {
  const ms = unixSec * 1000 - Date.now()
  return {
    text: new Date(unixSec * 1000).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    urgent: ms >= 0 && ms < 24 * 60 * 60 * 1000,
    overdue: ms < 0,
  }
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
  const [imgError, setImgError] = useState(false)
  const [wpForumChannelId, setWpForumChannelId] = useState<string>(WORKING_PROJECT_FORUM_CHANNELS[0])
  const s = statusStyle(order.statusCode)
  const totalQty = order.products.reduce((sum, p) => sum + p.qty, 0)
  const first = order.products[0]
  const showImage = !imgError && !!first?.imageUrl
  const queryClient = useQueryClient()

  const createWorkingProjectMutation = useMutation({
    mutationFn: createWorkingProjectFromOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["working-projects"] })
    },
  })

  function handleCreateWorkingProject() {
    createWorkingProjectMutation.mutate({
      source: "tokopedia",
      sourceOrderNo: order.orderId,
      forumChannelId: wpForumChannelId,
      customer: order.buyerNickname ?? order.orderId,
      // Every line item goes into `product` — used to only take products[0],
      // silently dropping the rest of a multi-item order (found 2026-09-28).
      product: buildMultiItemProduct(order.products.map((p) => ({ name: p.name, variant: p.variant }))),
      variant: order.products.length <= 1 ? (first?.variant || undefined) : undefined,
      shipping: order.courier ?? undefined,
      orderDateRaw: order.orderDate != null ? new Date(order.orderDate * 1000).toISOString().slice(0, 10) : undefined,
      dueDateRaw: order.latestRtsTime != null ? new Date(order.latestRtsTime * 1000).toISOString().slice(0, 10) : undefined,
    })
  }

  return (
    <Card style={{ borderColor: s.border, background: s.bg }}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {showImage && (
            <div className="flex-shrink-0 w-10 h-10 rounded-md overflow-hidden self-start mt-0.5">
              <Image
                src={first.imageUrl!}
                alt={first.name}
                width={40}
                height={40}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
                unoptimized
              />
            </div>
          )}
          <button type="button" onClick={() => setExpanded(e => !e)} className="flex-1 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={s.dotClass}>{s.dot}</span>
            <span className="font-mono text-sm font-semibold">#{order.orderId}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: s.badgeBg, color: s.badgeColor }}>
              {order.statusLabel}
            </span>
            {order.isPreOrder && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(139,92,246,0.2)", color: "#a78bfa" }}>
                PRE-ORDER
              </span>
            )}
            {order.orderDate && (
              <span className="text-[11px] text-muted-foreground">🗓️ {formatDate(order.orderDate)}</span>
            )}
            {order.trackingNo && (
              <span className="text-[11px] font-mono text-muted-foreground">📦 {order.trackingNo}</span>
            )}
          </div>

          {order.latestRtsTime && (order.statusCode === 110 || order.statusCode === 111) && (() => {
            const sb = shipBy(order.latestRtsTime)
            return (
              <div className="mt-0.5 text-[11px] font-medium" style={{ color: sb.overdue ? "#f87171" : sb.urgent ? "#fb923c" : "#94a3b8" }}>
                {sb.overdue ? "⚠️" : sb.urgent ? "⏰" : "📅"} Kirim sebelum {sb.text}
                {sb.overdue && " · TERLAMBAT"}{sb.urgent && !sb.overdue && " · Segera!"}
              </div>
            )
          })()}

          <div className="mt-1 text-sm text-gray-700 dark:text-slate-300">
            {first ? first.name : "(no items)"}
            {first?.variant && <span className="text-gray-500 dark:text-slate-400"> · {first.variant}</span>}
            {order.products.length > 1 && (
              <span className="text-gray-500 dark:text-slate-400"> · +{order.products.length - 1} item lain</span>
            )}
          </div>

          <div className="text-xs text-gray-500 dark:text-slate-400">
            {totalQty} pcs · {rupiah(order.grandTotal)}
            {order.courier && <> · {order.courier}{order.shippingType ? ` · ${order.shippingType}` : ""}</>}
            {order.payMethod && <> · {order.payMethod}</>}
            {order.buyerNickname && <> · {order.buyerNickname}</>}
          </div>

          {order.latestLogistic && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">🚚 {order.latestLogistic.msg}</div>
          )}

          {order.note && (
            <div className="mt-0.5 text-[11px]" style={{ color: "#facc15" }}>📝 {order.note}</div>
          )}
          </button>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <select
              value={wpForumChannelId}
              onChange={(e) => setWpForumChannelId(e.target.value)}
              className="h-7 rounded-md border bg-transparent px-1 text-[11px]"
              aria-label="Forum channel Working Project"
            >
              {WORKING_PROJECT_FORUM_CHANNELS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleCreateWorkingProject}
              disabled={createWorkingProjectMutation.isPending}
              className="flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-50"
              style={{ color: "#a5b4fc" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#c7d2fe")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#a5b4fc")}
            >
              📋 {createWorkingProjectMutation.isPending ? "Membuat..." : "Buat Working Project"}
            </button>
          </div>
        </div>

        {createWorkingProjectMutation.isError && (
          <div className="mt-1 text-[11px] text-red-500">
            Gagal membuat Working Project: {(createWorkingProjectMutation.error as Error).message}
          </div>
        )}

        {expanded && (
          <div className="mt-3 border-t dark:border-slate-700 pt-3 space-y-2 text-xs">
            {order.products.map((p, idx) => (
              <div key={idx} className="flex justify-between gap-2">
                <div className="flex items-start gap-2">
                  {p.imageUrl && (
                    <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden">
                      <Image src={p.imageUrl} alt={p.name} width={32} height={32} className="w-full h-full object-cover" unoptimized />
                    </div>
                  )}
                  <div>
                    <div className="font-medium">{p.name}</div>
                    {p.variant && <div className="text-gray-500 dark:text-slate-400">{p.variant}</div>}
                  </div>
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
