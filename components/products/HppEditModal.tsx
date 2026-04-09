"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ProductSummary } from "@/lib/products/types"

interface Props {
  product: ProductSummary | null
  onClose: () => void
  onSave: (vars: {
    productId: string
    productHpp: number | null
    variants: Array<{ variantId: string; hpp: number | null }>
  }) => void
  isPending: boolean
}

interface VariantState {
  variantId: string
  name: string
  hppText: string
}

export function HppEditModal({ product, onClose, onSave, isPending }: Props) {
  const [productHppText, setProductHppText] = useState("")
  const [variants, setVariants] = useState<VariantState[]>([])
  const [showVariants, setShowVariants] = useState(false)

  useEffect(() => {
    if (product) {
      setProductHppText(product.hpp !== null ? String(product.hpp) : "")
      setVariants(
        product.variants.map((v) => ({
          variantId: v.variantId,
          name: v.variantName,
          hppText: v.hpp !== null ? String(v.hpp) : "",
        })),
      )
      setShowVariants(product.variants.some((v) => v.hpp !== null))
    }
  }, [product])

  if (!product) return null

  function handleSave() {
    if (!product) return
    const parsedProductHpp =
      productHppText === "" ? null : Number(productHppText)
    if (parsedProductHpp !== null && Number.isNaN(parsedProductHpp)) {
      alert("HPP produk harus angka")
      return
    }

    const variantPayload = variants
      .map((v) => {
        if (v.hppText === "") return { variantId: v.variantId, hpp: null }
        const n = Number(v.hppText)
        if (Number.isNaN(n)) return null
        return { variantId: v.variantId, hpp: n }
      })
      .filter((v): v is { variantId: string; hpp: number | null } => v !== null)

    onSave({
      productId: product.productId,
      productHpp: parsedProductHpp,
      variants: variantPayload,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b">
          <h2 className="font-semibold">Edit HPP</h2>
          <p className="text-xs text-gray-500 mt-1">{product.name}</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="product-hpp">HPP Produk (default)</Label>
            <Input
              id="product-hpp"
              type="number"
              placeholder="Kosongkan untuk hapus"
              value={productHppText}
              onChange={(e) => setProductHppText(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Berlaku untuk semua varian kecuali yang di-override di bawah.
            </p>
          </div>

          {product.variants.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowVariants((s) => !s)}
                className="text-sm text-[#EE4D2D] hover:underline"
              >
                {showVariants ? "▼" : "▶"} Override per Varian (
                {product.variants.length})
              </button>

              {showVariants && (
                <div className="mt-2 space-y-2">
                  {variants.map((v, idx) => (
                    <div
                      key={v.variantId}
                      className="flex items-center gap-2 text-sm"
                    >
                      <div className="flex-1 truncate">{v.name}</div>
                      <Input
                        type="number"
                        placeholder="—"
                        value={v.hppText}
                        onChange={(e) => {
                          const next = [...variants]
                          next[idx] = { ...v, hppText: e.target.value }
                          setVariants(next)
                        }}
                        className="w-28 h-8"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-gray-500">
                    Kosongkan input untuk pakai HPP produk default.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Batal
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending}
            className="bg-[#EE4D2D] hover:bg-[#d44226] text-white"
          >
            {isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
    </div>
  )
}
