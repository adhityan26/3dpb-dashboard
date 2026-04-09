"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { ProductSummary } from "@/lib/products/types"
import { STOCK_LOW_THRESHOLD } from "@/lib/products/types"

interface Props {
  product: ProductSummary
  onEditHpp: (product: ProductSummary) => void
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

export function ProductRow({ product, onEditHpp, canEditHpp }: Props) {
  const [expanded, setExpanded] = useState(false)

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
            className="flex-1 text-left"
          >
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
            <div className="mt-1 text-xs text-gray-500 flex gap-3 flex-wrap">
              <span>Stok: {fmtNum(product.stockTotal)}</span>
              <span>Harga: {priceLabel}</span>
              <span>
                30d: {fmtNum(product.qtySold30d)} pcs · {fmt(product.omzet30d)}
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
              {product.hpp !== null && <span>HPP: {fmt(product.hpp)}</span>}
            </div>
          </button>

          {canEditHpp && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditHpp(product)}
            >
              Edit HPP
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
                const vHpp = v.hpp ?? product.hpp
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
                    <div className="text-right">
                      <div
                        className={`font-semibold ${isLow ? "text-red-600" : ""}`}
                      >
                        {v.stock} pcs
                      </div>
                      <div className="text-gray-500">{fmt(v.price)}</div>
                      {vHpp !== null && (
                        <div className="text-gray-400 text-[10px]">
                          HPP {fmt(vHpp)}
                          {v.hpp !== null && (
                            <span className="ml-1 text-blue-500">
                              (override)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
