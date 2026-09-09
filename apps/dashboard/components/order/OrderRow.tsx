"use client"

import { useState } from "react"
import Image from "next/image"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { OrderSummary } from "@/lib/orders/types"
import {
  WORKING_PROJECT_FORUM_CHANNELS,
  createWorkingProjectFromOrder,
} from "@/lib/working-projects/create-from-order"

interface OrderRowProps {
  order: OrderSummary
  onToggleLabel: (orderSn: string, printed: boolean) => void
  isPending: boolean
  linkedInvoice?: { id: string; nomor: string; status: string } | null
  onCreateInvoice?: (order: OrderSummary) => void
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

function formatShipByDate(unixSec: number): { text: string; urgent: boolean; overdue: boolean } {
  const now = Date.now()
  const shipBy = unixSec * 1000
  const diffMs = shipBy - now
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  const d = new Date(shipBy)
  const text = d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })

  return {
    text,
    urgent: diffHours >= 0 && diffDays < 1,   // kurang dari 24 jam
    overdue: diffMs < 0,                        // sudah lewat
  }
}

export function OrderRow({ order, onToggleLabel, isPending, linkedInvoice, onCreateInvoice }: OrderRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [wpForumChannelId, setWpForumChannelId] = useState<string>(WORKING_PROJECT_FORUM_CHANNELS[0])
  const queryClient = useQueryClient()

  const createWorkingProjectMutation = useMutation({
    mutationFn: createWorkingProjectFromOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["working-projects"] })
    },
  })

  function handleCreateWorkingProject() {
    const firstItem = order.items[0]
    createWorkingProjectMutation.mutate({
      source: "shopee",
      sourceOrderNo: order.orderSn,
      forumChannelId: wpForumChannelId,
      customer: order.buyerUsername ?? order.orderSn,
      product: firstItem?.productName ?? "",
      variant: firstItem?.variantName ?? undefined,
    })
  }
  const totalQty = order.items.reduce((s, it) => s + it.qty, 0)
  const firstItem = order.items[0]

  const isProcessed = order.shopeeStatus === "PROCESSED"
  const isDone = isProcessed && order.labelPrinted
  const isPerluCetak = isProcessed && !order.labelPrinted

  const shipBy = order.shipByDate ? formatShipByDate(order.shipByDate) : null

  const cardStyle = isDone
    ? { borderColor: "rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)" }
    : isPerluCetak
    ? { borderColor: "rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.1)" }
    : { borderColor: "rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)" }

  const dotIndicator = isDone ? "🟢" : isPerluCetak ? "🟡" : "🟠"
  const dotClass = isDone ? "text-green-500" : isPerluCetak ? "text-yellow-400" : "text-amber-500"

  const showImage = !imgError && !!firstItem?.imageUrl

  return (
    <Card
      className={isDone ? "row-status-printed" : isPerluCetak ? "row-status-perlu-cetak" : "row-status-pending"}
      style={cardStyle}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          {/* Thumbnail */}
          {showImage && (
            <div className="flex-shrink-0 w-10 h-10 rounded-md overflow-hidden self-start mt-0.5">
              <Image
                src={firstItem.imageUrl!}
                alt={firstItem.productName}
                width={40}
                height={40}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
                unoptimized
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex-1 text-left"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className={dotClass}>{dotIndicator}</span>
              <span className="font-mono text-sm font-semibold">
                #{order.orderSn}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTime(order.createTime)}
              </span>
              {order.isPreOrder && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(139,92,246,0.2)", color: "#a78bfa" }}
                >
                  PRE ORDER
                </span>
              )}
              {isDone && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
                >
                  Processed
                </span>
              )}
              {isPerluCetak && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(251,191,36,0.2)", color: "#f59e0b" }}
                >
                  Perlu Cetak Label
                </span>
              )}
            </div>
            {shipBy && (() => {
              const shipByClass = shipBy.overdue
                ? "text-red-600 dark:text-red-400"
                : shipBy.urgent
                ? "text-orange-700 dark:text-orange-400"
                : "text-slate-600 dark:text-slate-400"
              return (
                <div className={`mt-0.5 flex items-center gap-1 text-[11px] ${shipByClass}`}>
                  <span>
                    {shipBy.overdue ? "⚠️" : shipBy.urgent ? "⏰" : "📅"}
                  </span>
                  <span className="font-medium">
                    Kirim sebelum {shipBy.text}
                    {shipBy.overdue && " · TERLAMBAT"}
                    {shipBy.urgent && !shipBy.overdue && " · Segera!"}
                  </span>
                </div>
              )
            })()}
            <div className="mt-1 text-sm text-gray-700 dark:text-slate-300">
              {firstItem?.productName ?? "(no items)"}
              {firstItem?.variantName && (
                <span className="text-gray-500 dark:text-slate-400">
                  {" "}
                  · {firstItem.variantName}
                </span>
              )}
              {order.items.length > 1 && (
                <span className="text-gray-500 dark:text-slate-400">
                  {" "}
                  · +{order.items.length - 1} item lain
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              {totalQty} pcs · {formatCurrency(order.totalAmount, order.currency)}
              {order.buyerUsername && <> · {order.buyerUsername}</>}
            </div>
          </button>

          {linkedInvoice && (
            <span className="text-[11px] font-medium flex-shrink-0" style={{ color: "#34d399" }}>
              📄
            </span>
          )}
          <select
            value={wpForumChannelId}
            onChange={(e) => setWpForumChannelId(e.target.value)}
            className="h-7 rounded-md border bg-transparent px-1 text-[11px] flex-shrink-0"
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
            className="flex items-center gap-1 text-xs font-medium transition-colors flex-shrink-0 disabled:opacity-50"
            style={{ color: "#a5b4fc" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#c7d2fe")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#a5b4fc")}
          >
            📋 {createWorkingProjectMutation.isPending ? "Membuat..." : "Buat Working Project"}
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

        {createWorkingProjectMutation.isError && (
          <div className="mt-1 text-[11px] text-red-500">
            Gagal membuat Working Project: {(createWorkingProjectMutation.error as Error).message}
          </div>
        )}

        {expanded && (
          <div className="mt-3 border-t dark:border-slate-700 pt-3 space-y-2 text-xs">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between gap-2">
                <div className="flex items-start gap-2">
                  {!imgError && item.imageUrl && (
                    <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden">
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                  <div>
                    <div className="font-medium">{item.productName}</div>
                    {item.variantName && (
                      <div className="text-gray-500 dark:text-slate-400">{item.variantName}</div>
                    )}
                    {item.sku && (
                      <div className="text-gray-400 dark:text-slate-500">SKU: {item.sku}</div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div>{item.qty} pcs</div>
                  <div className="text-gray-500 dark:text-slate-400">
                    {formatCurrency(item.unitPrice, order.currency)}
                  </div>
                </div>
              </div>
            ))}
            {/* Invoice link or create button */}
            <div className="pt-2 border-t dark:border-slate-700">
              {linkedInvoice ? (
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "#34d399" }}>
                  <span>📄</span>
                  <span className="font-medium">Invoice: {linkedInvoice.nomor}</span>
                  <span className="text-gray-400 dark:text-slate-500">· {linkedInvoice.status}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onCreateInvoice?.(order)}
                  className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                  style={{ color: "#a5b4fc" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#c7d2fe")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#a5b4fc")}
                >
                  <span>📄</span>
                  <span>Buat Invoice</span>
                </button>
              )}
            </div>
            {order.labelPrintedAt && (
              <div className="text-gray-400 dark:text-slate-500 pt-1 border-t dark:border-slate-700">
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
