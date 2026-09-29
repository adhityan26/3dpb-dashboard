"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useGLRingProductIds, useUpdateGLRingProductIds } from "@/lib/hooks/use-working-projects"
import { ShopeeProductIdPicker } from "./ShopeeProductIdPicker"

export function GLRingProductIdsCard() {
  const { data: productIds, isLoading } = useGLRingProductIds()
  const updateMutation = useUpdateGLRingProductIds()
  const [ids, setIds] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (productIds) setIds(productIds)
  }, [productIds])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  function handleSave() {
    setSaved(false)
    updateMutation.mutate(ids, { onSuccess: () => setSaved(true) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">💍 Produk Green Lantern Ring</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Produk Shopee yang dianggap sebagai Green Lantern Ring — dipakai untuk menampilkan
          order yang benar di tab &quot;Green Lantern Ring&quot; pada halaman Order, tanpa
          bergantung pada nama produk. Cari nama produknya di bawah. Order Tokopedia belum
          bisa dicocokkan dengan cara ini (menyusul).
        </p>
        {isLoading ? (
          <div className="text-xs text-gray-500">Memuat...</div>
        ) : (
          <ShopeeProductIdPicker ids={ids} onChange={setIds} />
        )}
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            disabled={updateMutation.isPending || isLoading}
            onClick={handleSave}
          >
            {updateMutation.isPending ? "Menyimpan..." : "Simpan"}
          </Button>
          {saved && <span className="text-xs text-green-600">✅ Tersimpan</span>}
          {updateMutation.error && (
            <span className="text-xs text-red-500">
              ❌ {updateMutation.error instanceof Error ? updateMutation.error.message : "Gagal menyimpan"}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
