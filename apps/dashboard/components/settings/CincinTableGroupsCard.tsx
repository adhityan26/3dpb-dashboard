"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCincinTableGroups, useUpdateCincinTableGroups, type CincinTableGroup } from "@/lib/hooks/use-working-projects"

interface EditableGroup {
  title: string
  keywordsText: string // one keyword per line, edited as free text
}

function toEditable(groups: CincinTableGroup[]): EditableGroup[] {
  return groups.map((g) => ({ title: g.title, keywordsText: g.keywords.join("\n") }))
}

function toGroups(editable: EditableGroup[]): CincinTableGroup[] {
  return editable.map((g) => ({
    title: g.title.trim(),
    keywords: g.keywordsText.split(/[\n,]/).map((k) => k.trim()).filter(Boolean),
  }))
}

// Finds a keyword reused across two different groups (mirrors
// findDuplicateCincinKeyword in lib/working-projects/shipping-schedule.ts
// — duplicated here as a client-side pre-check so the error shows before
// the round-trip to the server's own validation).
function findDuplicateKeyword(groups: CincinTableGroup[]): string | null {
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

// User-maintained grouping for the "Jadwal Kirim" tab's cincin pivot
// tables — which product listings (Shopee names drift over time, e.g.
// "...3D Print V.2 New Color") collapse into the same table. Each keyword
// may belong to only one group ("1 produk hanya bisa 1 table") — enforced
// both here (before saving) and server-side.
export function CincinTableGroupsCard() {
  const { data: groups, isLoading } = useCincinTableGroups()
  const updateMutation = useUpdateCincinTableGroups()
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
    setEditable((prev) => [...prev, { title: "", keywordsText: "" }])
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
        <CardTitle className="text-base">🗂️ Pengelompokan Tabel Cincin (Jadwal Kirim)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-gray-500">
          Listing produk cincin di Shopee suka beda-beda nama untuk barang yang sama (mis. &quot;...3D
          Print&quot; vs &quot;...3D Print V.2 New Color&quot;). Atur di sini kata kunci apa saja yang
          digabung jadi satu tabel di tab Jadwal Kirim. Dicek dari atas ke bawah — grup di atas menang
          duluan kalau nama produk cocok beberapa kata kunci. Produk yang tidak cocok kata kunci mana
          pun tetap dapat tabel sendiri. Satu kata kunci hanya boleh dipakai di satu grup.
        </p>
        {isLoading ? (
          <div className="text-xs text-gray-500">Memuat...</div>
        ) : (
          <div className="space-y-3">
            {editable.map((g, i) => (
              <div key={i} className="flex gap-2 items-start rounded-[5px] p-3" style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}>
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={g.title}
                    onChange={(e) => updateGroup(i, { title: e.target.value })}
                    placeholder="Nama tabel, mis. GL Ring 2026"
                    className="glass-input w-full h-9 rounded-[5px] px-3 text-sm"
                  />
                  <textarea
                    value={g.keywordsText}
                    onChange={(e) => updateGroup(i, { keywordsText: e.target.value })}
                    placeholder={"Kata kunci, satu per baris\ngl\ngreen lantern"}
                    rows={3}
                    className="w-full rounded-[5px] px-3 py-2 text-sm font-mono glass-input"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => removeGroup(i)}>Hapus</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addGroup}>+ Tambah Grup</Button>
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
