"use client"

import type { ProductSummary } from "@/lib/products/types"
import { ProductRow } from "./ProductRow"

interface Props {
  products: ProductSummary[]
  onEditHpp: (product: ProductSummary) => void
  onQuickSetHpp: (
    productId: string,
    hpp: number | null,
    variantId?: string,
  ) => void
  canEditHpp: boolean
}

export function ProductList({
  products,
  onEditHpp,
  onQuickSetHpp,
  canEditHpp,
}: Props) {
  if (products.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400 text-sm">
        Tidak ada produk untuk filter ini.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {products.map((p) => (
        <ProductRow
          key={p.productId}
          product={p}
          onEditHpp={onEditHpp}
          onQuickSetHpp={onQuickSetHpp}
          canEditHpp={canEditHpp}
        />
      ))}
    </div>
  )
}
