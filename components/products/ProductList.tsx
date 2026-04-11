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
  onUploadImage: (productId: string, file: File) => void
  uploadingImageFor: string | null
  canEditHpp: boolean
}

export function ProductList({
  products,
  onEditHpp,
  onQuickSetHpp,
  onUploadImage,
  uploadingImageFor,
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
          onUploadImage={onUploadImage}
          uploadingImageFor={uploadingImageFor}
          canEditHpp={canEditHpp}
        />
      ))}
    </div>
  )
}
