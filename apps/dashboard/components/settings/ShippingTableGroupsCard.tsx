"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useShippingTableGroups, useUpdateShippingTableGroups, type ShippingTableGroup, type ShippingTableRowBy } from "@/lib/hooks/use-working-projects"
import { ProductKeywordPicker } from "./ProductKeywordPicker"

interface EditableGroup {
  title: string
  keywords: string[]
  rowBy: ShippingTableRowBy
}

function toEditable(groups: ShippingTableGroup[]): EditableGroup[] {
  return groups.map((g) => ({ title: g.title, keywords: g.keywords, rowBy: g.rowBy }))
}

function toGroups(editable: EditableGroup[]): ShippingTableGroup[] {
  return editable.map((g) => ({ title: g.title.trim(), keywords: g.keywords, rowBy: g.rowBy }))
}

// Finds a keyword reused across two different groups (mirrors
// findDuplicateShippingKeyword in lib/working-projects/shipping-schedule.ts
// — duplicated here as a client-side pre-check so the error shows before
// the round-trip to the server's own validation).
function findDuplicateKeyword(groups: ShippingTableGroup[]): string | null {
  const seen = new Map<string, string>()
  for (const g of groups) {
    for (const raw of g.keywords) {
      const k = raw.trim().toLowerCase()
      if (!k) continue
      const claimedBy = seen.get(k)
      if (claimedBy && claimedBy !== g.title) return raw
      seen.set(k, g.title)
    }
  }
  return null
}

// User-maintained table list for the "Jadwal Kirim" tab — which tables
// exist, which products (by keyword) fall into each, and whether each
// table's rows are grouped by variant/size or by product. A product not
// matched by any group's keywords falls into the "General" table, which
// always exists and isn't configured here. Each keyword may belong to only
// one group ("1 produk hanya bisa 1 table") — enforced both here (before
// saving) and server-side.
export function ShippingTableGroupsCard() {
  const { data: groups, isLoading } = useShippingTableGroups()
  const updateMutation = useUpdateShippingTableGroups()
  const [editable, setEditable] = useState<EditableGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (groups) setEditable(toEditable(groups))
  }, [groups])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(t)
  }, [saved])

  function updateGroup(index: number, patch: Partial<EditableGroup>) {
    setEditable((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)))
  }

  function addGroup() {
    setEditable((prev) => [...prev, { title: "", keywords: [], rowBy: "produk" }])
  }

  function removeGroup(index: number) {
    setEditable((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    const parsed = toGroups(editable).filter((g) => g.title)
    const duplicate = findDuplicateKeyword(parsed)
    if (duplicate) {
      setError(`Kata kunci "${duplicate}" dipakai di lebih dari satu tabel — hapus salah satu (1 produk hanya boleh masuk 1 tabel)`)
      return
    }
    updateMutation.mutate(parsed, {
      onSuccess: () => setSaved(true),
      onError: (err) => setError(err instanceof Error ? err.message : "Gagal menyimpan"),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">🗂️ Pengelompokan Tabel (Jadwal Kirim)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-gray-500">
          Atur tabel apa saja yang muncul di tab Jadwal Kirim, produk apa saja yang masuk ke tiap tabel
          (cari dari katalog Shopee/Tokopedia di bawah), dan cara baris tabel itu dikelompokkan —
          &quot;Ukuran/Varian&quot; kalau tabel itu cuma untuk satu produk (baris = ukuran/varian saja),
          atau &quot;Produk&quot; kalau tabel itu menampung beberapa produk berbeda (baris = nama produk +
          varian, biar tidak ketuker). Dicek dari atas ke bawah — tabel di atas menang duluan kalau nama
          produk cocok beberapa kata kunci. Produk yang tidak cocok kata kunci mana pun otomatis masuk
          tabel &quot;General&quot;. Satu kata kunci hanya boleh dipakai di satu tabel.
        </p>
        {isLoading ? (
          <div className="text-xs text-gray-500">Memuat...</div>
        ) : (
          <div className="space-y-3">
            {editable.map((g, i) => (
              <div key={i} className="flex gap-2 items-start rounded-[5px] p-3" style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}>
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={g.title}
                      onChange={(e) => updateGroup(i, { title: e.target.value })}
                      placeholder="Nama tabel, mis. GL Ring 2026"
                      className="glass-input flex-1 h-9 rounded-[5px] px-3 text-sm"
                    />
                    <select
                      value={g.rowBy}
                      onChange={(e) => updateGroup(i, { rowBy: e.target.value as ShippingTableRowBy })}
                      className="glass-input h-9 rounded-[5px] px-2 text-sm"
                      title="Baris tabel dikelompokkan berdasarkan"
                    >
                      <option value="variant">Baris: Ukuran/Varian</option>
                      <option value="produk">Baris: Produk</option>
                    </select>
                  </div>
                  <ProductKeywordPicker keywords={g.keywords} onChange={(keywords) => updateGroup(i, { keywords })} />
                </div>
                <Button size="sm" variant="outline" onClick={() => removeGroup(i)}>Hapus</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addGroup}>+ Tambah Tabel</Button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={updateMutation.isPending || isLoading} onClick={handleSave}>
            {updateMutation.isPending ? "Menyimpan..." : "Simpan"}
          </Button>
          {saved && <span className="text-xs text-green-600">✅ Tersimpan</span>}
          {error && <span className="text-xs text-red-500">❌ {error}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
