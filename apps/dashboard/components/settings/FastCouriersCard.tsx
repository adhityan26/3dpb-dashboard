"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useFastCouriers, useUpdateFastCouriers } from "@/lib/hooks/use-working-projects"

// Same Config-backed list pattern as GLRingProductIdsCard/CategoryProductIdsCard.
// Used by the Jadwal Kirim tab to split "pickup cepat" (Anteraja/Paxel/Grab/
// Gojek — pick up same-day) from "pickup reguler" (SPX/J&T/JNE) so what to
// pack first each day is obvious without checking each order's courier.
export function FastCouriersCard() {
  const { data: couriers, isLoading } = useFastCouriers()
  const updateMutation = useUpdateFastCouriers()
  const [text, setText] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (couriers) setText(couriers.join("\n"))
  }, [couriers])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  function handleSave() {
    setSaved(false)
    const list = text
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    updateMutation.mutate(list, { onSuccess: () => setSaved(true) })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🚀 Kurir Pickup Cepat</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Kata kunci nama kurir (dicocokkan sebagian, tidak case-sensitive) yang dianggap
          &quot;pickup cepat&quot; — dipakai di tab Jadwal Kirim untuk memprioritaskan yang harus
          dikemas duluan. Kurir yang tidak masuk daftar ini (mis. SPX, J&amp;T, JNE) dianggap
          pickup reguler. Satu kata kunci per baris.
        </p>
        {isLoading ? (
          <div className="text-xs text-gray-500">Memuat...</div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"anteraja\npaxel\ngrab\ngojek"}
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
