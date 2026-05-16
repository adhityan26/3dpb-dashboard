"use client"

import { useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { ProductSummary } from "@/lib/products/types"
import { STOCK_LOW_THRESHOLD } from "@/lib/products/types"

interface Props {
  product: ProductSummary
  onUploadImage: (productId: string, file: File) => void
  uploadingImageFor: string | null
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
  onUploadImage,
  uploadingImageFor,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isUploading = uploadingImageFor === product.productId

  const bgClass = product.isStockLow
    ? ""   // handled via inline style below
    : product.perluPerhatian
      ? "row-status-pending"
      : ""

  const priceLabel =
    product.priceMin === product.priceMax
      ? fmt(product.priceMin)
      : `${fmt(product.priceMin)} – ${fmt(product.priceMax)}`

  return (
    <Card className={bgClass} style={product.isStockLow ? { background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.15)" } : undefined}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => product.hasVariants && setExpanded((e) => !e)}
            className="flex-1 text-left flex items-start gap-3 min-w-0"
          >
            <div className="relative shrink-0">
              <ProductThumb
                src={product.imageUrl}
                alt={product.name}
                onClick={
                  product.imageUrl ? () => setZoomOpen(true) : undefined
                }
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
                disabled={isUploading}
                title="Upload foto baru"
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#EE4D2D] hover:bg-[#d44226] text-white text-[10px] flex items-center justify-center shadow border-2 border-white disabled:opacity-50 disabled:cursor-wait"
              >
                {isUploading ? "⋯" : "📷"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onUploadImage(product.productId, file)
                  e.target.value = ""
                }}
              />
            </div>
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
              <div className="mt-1 text-xs flex gap-3 flex-wrap items-center" style={{ color: "rgba(255,255,255,0.45)" }}>
                <span>Stok: {fmtNum(product.stockTotal)}</span>
                <span>
                  Harga: {priceLabel}
                  {product.originalPriceMin != null && (
                    <span className="ml-1 line-through text-[10px]" style={{ color: "#f87171" }}>
                      {fmt(product.originalPriceMin)}
                    </span>
                  )}
                </span>
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
                {product.katalog ? (
                  <span
                    className="text-xs"
                    title={`dari kalkulasi "${product.katalog.nama}"`}
                  >
                    HPP: Rp {product.katalog.hppTotal.toLocaleString("id-ID")}
                    <span className="ml-1 text-[10px] opacity-50">
                      (via {product.katalog.nama})
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">HPP: —</span>
                )}
              </div>
              {(product.weight != null || product.dimensionCm != null) && (
                <div className="mt-0.5 text-[10px] flex gap-2 flex-wrap" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {product.weight != null && (
                    <span>⚖️ {product.weight >= 1 ? product.weight.toFixed(2) + " kg" : (product.weight * 1000).toFixed(0) + " g"}</span>
                  )}
                  {product.dimensionCm != null && (
                    <span>📦 {product.dimensionCm.l}×{product.dimensionCm.w}×{product.dimensionCm.h} cm</span>
                  )}
                </div>
              )}
            </div>
          </button>
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
                    className="flex justify-between items-center text-xs px-2 py-1.5 rounded"
                    style={{
                      background: isLow ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${isLow ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.07)"}`,
                    }}
                  >
                    <div>
                      <div className="font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>{v.variantName}</div>
                      {v.sku && (
                        <div style={{ color: "rgba(255,255,255,0.35)" }}>SKU: {v.sku}</div>
                      )}
                    </div>
                    <div className="text-right space-y-0.5">
                      <div className="font-semibold" style={{ color: isLow ? "#f87171" : "rgba(255,255,255,0.7)" }}>
                        {v.stock} pcs
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.5)" }}>
                        {fmt(v.price)}
                        {v.originalPrice != null && (
                          <span className="ml-1 line-through text-[10px]" style={{ color: "#f87171" }}>
                            {fmt(v.originalPrice)}
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
