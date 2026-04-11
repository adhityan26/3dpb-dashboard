"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ProductSummary } from "@/lib/products/types"
import { STOCK_LOW_THRESHOLD } from "@/lib/products/types"
import { InlineHppEdit } from "./InlineHppEdit"

interface Props {
  product: ProductSummary
  onEditHpp: (product: ProductSummary) => void
  onQuickSetHpp: (
    productId: string,
    hpp: number | null,
    variantId?: string,
  ) => void
  canEditHpp: boolean
}

function fmt(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n)
}

const STATUS_COLOR: Record<ProductSummary["status"], string> = {
  NORMAL: "bg-green-100 text-green-800",
  UNLIST: "bg-gray-100 text-gray-700",
  BANNED: "bg-red-100 text-red-800",
  DELETED: "bg-red-100 text-red-800",
  REVIEWING: "bg-amber-100 text-amber-800",
}

function ProductThumb({
  src,
  alt,
  onClick,
}: {
  src: string | null
  alt: string
  onClick?: () => void
}) {
  const [errored, setErrored] = useState(false)
  if (!src || errored) {
    return (
      <div className="w-14 h-14 shrink-0 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 text-2xl">
        📦
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setErrored(true)}
      onClick={(e) => {
        if (!onClick) return
        e.stopPropagation()
        onClick()
      }}
      className={`w-14 h-14 shrink-0 rounded object-cover border border-gray-200 bg-gray-50 ${
        onClick ? "cursor-zoom-in hover:ring-2 hover:ring-[#EE4D2D]" : ""
      }`}
      loading="lazy"
    />
  )
}

function ImageZoomModal({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-zoom-out"
      onClick={onClose}
      role="dialog"
      aria-label="Zoom gambar"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-2xl hover:text-[#EE4D2D]"
        aria-label="Tutup"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl cursor-default"
      />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded max-w-[90vw] truncate">
        {alt}
      </div>
    </div>
  )
}

export function ProductRow({
  product,
  onEditHpp,
  onQuickSetHpp,
  canEditHpp,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)

  const bgClass = product.isStockLow
    ? "bg-red-50/40"
    : product.perluPerhatian
      ? "bg-amber-50/40"
      : ""

  const priceLabel =
    product.priceMin === product.priceMax
      ? fmt(product.priceMin)
      : `${fmt(product.priceMin)} – ${fmt(product.priceMax)}`

  return (
    <Card className={bgClass}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => product.hasVariants && setExpanded((e) => !e)}
            className="flex-1 text-left flex items-start gap-3 min-w-0"
          >
            <ProductThumb
              src={product.imageUrl}
              alt={product.name}
              onClick={
                product.imageUrl ? () => setZoomOpen(true) : undefined
              }
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{product.name}</span>
                <Badge className={STATUS_COLOR[product.status]}>
                  {product.status}
                </Badge>
                {product.isStockLow && (
                  <Badge className="bg-red-100 text-red-800">Stok Kritis</Badge>
                )}
                {product.qtySold30d === 0 && product.status === "NORMAL" && (
                  <Badge className="bg-amber-100 text-amber-800">
                    Tidak ada sales 30d
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-gray-500 flex gap-3 flex-wrap items-center">
                <span>Stok: {fmtNum(product.stockTotal)}</span>
                <span>Harga: {priceLabel}</span>
                <span>
                  30d: {fmtNum(product.qtySold30d)} pcs ·{" "}
                  {fmt(product.omzet30d)}
                </span>
                {product.grossMargin30d !== null && (
                  <span
                    className={
                      product.grossMargin30d > 0
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    Margin: {fmt(product.grossMargin30d)}
                  </span>
                )}
                <InlineHppEdit
                  value={product.hpp}
                  onSave={(v) => onQuickSetHpp(product.productId, v)}
                  disabled={!canEditHpp}
                  label="HPP:"
                />
              </div>
            </div>
          </button>

          {canEditHpp && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditHpp(product)}
              title="Edit semua HPP (termasuk override per varian)"
            >
              Edit Batch
            </Button>
          )}
        </div>

        {expanded && product.hasVariants && (
          <div className="mt-3 border-t pt-3">
            <div className="text-xs font-semibold text-gray-500 mb-2">
              Varian ({product.variants.length})
            </div>
            <div className="space-y-1.5">
              {product.variants.map((v) => {
                const isLow = v.stock < STOCK_LOW_THRESHOLD
                return (
                  <div
                    key={v.variantId}
                    className={`flex justify-between items-center text-xs px-2 py-1.5 rounded ${isLow ? "bg-red-50" : "bg-gray-50"}`}
                  >
                    <div>
                      <div className="font-medium">{v.variantName}</div>
                      {v.sku && (
                        <div className="text-gray-400">SKU: {v.sku}</div>
                      )}
                    </div>
                    <div className="text-right space-y-0.5">
                      <div
                        className={`font-semibold ${isLow ? "text-red-600" : ""}`}
                      >
                        {v.stock} pcs
                      </div>
                      <div className="text-gray-500">{fmt(v.price)}</div>
                      <div className="flex justify-end items-center gap-1">
                        <InlineHppEdit
                          value={v.hpp}
                          onSave={(nv) =>
                            onQuickSetHpp(
                              product.productId,
                              nv,
                              v.variantId,
                            )
                          }
                          disabled={!canEditHpp}
                          placeholder={
                            product.hpp !== null
                              ? `${fmt(product.hpp)} (default)`
                              : "Set HPP"
                          }
                          label=""
                          compact
                        />
                        {v.hpp !== null && (
                          <span className="text-[9px] text-blue-500">
                            override
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
      {zoomOpen && product.imageUrl && (
        <ImageZoomModal
          src={product.imageUrl}
          alt={product.name}
          onClose={() => setZoomOpen(false)}
        />
      )}
    </Card>
  )
}
