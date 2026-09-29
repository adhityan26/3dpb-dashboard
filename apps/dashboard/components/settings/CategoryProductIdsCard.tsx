"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCategoryProductIds, useUpdateCategoryProductIds, type AutoRoutedCategory } from "@/lib/hooks/use-working-projects"
import { ShopeeProductIdPicker } from "./ShopeeProductIdPicker"

// Same idea as GLRingProductIdsCard, generalized for the auto-routed
// categories other than cincin (which keeps its own dedicated card/route —
// it predates this one and already has other consumers).
export function CategoryProductIdsCard({
  category,
  title,
  productLabel,
}: {
  category: AutoRoutedCategory
  title: string
  productLabel: string
}) {
  const { data: productIds, isLoading } = useCategoryProductIds(category)
  const updateMutation = useUpdateCategoryProductIds(category)
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
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Produk Shopee yang dianggap sebagai {productLabel} — dipakai untuk auto-create
          Working Project ke forum Discord yang benar. Cari nama produknya di bawah. Kalau
          kosong, deteksi jatuh ke nama produk saja (kata &quot;{productLabel.split(" ")[0].toLowerCase()}&quot; di nama produk).
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
