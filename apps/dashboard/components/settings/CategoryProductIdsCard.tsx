"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCategoryProductIds, useUpdateCategoryProductIds, type AutoRoutedCategory } from "@/lib/hooks/use-working-projects"

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
  const [text, setText] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (productIds) setText(productIds.join("\n"))
  }, [productIds])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  function handleSave() {
    setSaved(false)
    const ids = text
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    updateMutation.mutate(ids, { onSuccess: () => setSaved(true) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Shopee Item ID (angka di URL produk) yang dianggap sebagai {productLabel} — dipakai untuk
          auto-create Working Project ke forum Discord yang benar. Satu ID per baris. Kalau kosong,
          deteksi jatuh ke nama produk saja (kata &quot;{productLabel.split(" ")[0].toLowerCase()}&quot; di nama produk).
        </p>
        {isLoading ? (
          <div className="text-xs text-gray-500">Memuat...</div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"46464886596\n12345678901"}
            rows={5}
            className="w-full rounded-[5px] px-3 py-2 text-sm font-mono glass-input"
          />
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
