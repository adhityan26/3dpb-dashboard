"use client"

import { useState } from "react"
import { useSetKatalogKalkulasi } from "@/lib/hooks/use-katalog"
import { useKalkulasiList } from "@/lib/hooks/use-kalkulator"

function fmt(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`
}

interface Props {
  produkId: string
  currentKalkulasiId: string | null
  currentKalkulasiNama: string | null
  currentHpp: number | null
}

export function KalkulasiLinkSection({
  produkId,
  currentKalkulasiId,
  currentKalkulasiNama,
  currentHpp,
}: Props) {
  const [showList, setShowList] = useState(false)
  const [search, setSearch] = useState("")

  const setKalkulasi = useSetKatalogKalkulasi()
  const { data: kalkData } = useKalkulasiList()
  const kalkulasiList = kalkData?.items ?? []

  const filtered = search.trim()
    ? kalkulasiList.filter(k => k.nama.toLowerCase().includes(search.toLowerCase()))
    : kalkulasiList

  async function handleSelect(kalkulasiId: string) {
    await setKalkulasi.mutateAsync({ katalogId: produkId, kalkulasiId })
    setShowList(false)
    setSearch("")
  }

  async function handleClear() {
    if (!confirm("Lepas link kalkulasi dari produk ini?")) return
    await setKalkulasi.mutateAsync({ katalogId: produkId, kalkulasiId: null })
  }

  return (
    <div className="space-y-3">
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "rgba(165,180,252,0.6)" }}
      >
        Sumber HPP (Kalkulasi)
      </div>

      {currentKalkulasiId ? (
        <div
          className="flex items-center gap-3 px-3 py-2.5 rounded-[10px]"
          style={{
            background: "rgba(52,211,153,0.07)",
            border: "1px solid rgba(52,211,153,0.18)",
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold truncate" style={{ color: "#34d399" }}>
              {currentKalkulasiNama ?? "—"}
            </div>
            {currentHpp != null && (
              <div className="text-[10px]" style={{ color: "rgba(52,211,153,0.55)" }}>
                HPP: {fmt(currentHpp)}
              </div>
            )}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowList(v => !v)}
              className="h-7 px-2.5 rounded-[7px] text-[9px] font-medium transition-all"
              style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }}
            >
              Ganti
            </button>
            <button
              onClick={handleClear}
              disabled={setKalkulasi.isPending}
              className="h-7 px-2.5 rounded-[7px] text-[9px] font-medium transition-all"
              style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
            >
              Lepas
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            Belum ada kalkulasi terhubung
          </span>
          <button
            onClick={() => setShowList(v => !v)}
            className="h-7 px-2.5 rounded-[7px] text-[9px] font-medium transition-all"
            style={{
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.2)",
              color: "#a5b4fc",
            }}
          >
            + Pilih Kalkulasi
          </button>
        </div>
      )}

      {showList && (
        <div
          className="rounded-[12px] p-3 space-y-2"
          style={{
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <input
            type="text"
            placeholder="Cari kalkulasi..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="glass-input w-full h-8 rounded-[8px] px-3 text-[11px]"
            autoFocus
          />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filtered.map(k => {
              const isCurrent = k.id === currentKalkulasiId
              return (
                <div
                  key={k.id}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-[8px] transition-all"
                  style={{
                    background: isCurrent ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isCurrent ? "rgba(99,102,241,0.35)" : "rgba(255,255,255,0.05)"}`,
                    cursor: isCurrent ? "default" : "pointer",
                  }}
                  onClick={() => !isCurrent && handleSelect(k.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate" style={{ color: "rgba(255,255,255,0.82)" }}>
                      {k.nama}
                    </div>
                    <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      HPP: {fmt(k.hppTotal)} · Floor: {fmt(k.floorPrice)}
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="text-[10px] flex-shrink-0" style={{ color: "#a5b4fc" }}>✓ Aktif</span>
                  ) : (
                    <button
                      className="h-6 px-2 rounded-[6px] text-[9px] font-semibold text-white flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, #5055e8, #7c84f8)" }}
                      onClick={e => { e.stopPropagation(); handleSelect(k.id) }}
                    >
                      Pilih
                    </button>
                  )}
                </div>
              )
            })}
            {filtered.length === 0 && (
              <div className="text-[10px] text-center py-3" style={{ color: "rgba(255,255,255,0.25)" }}>
                Tidak ada kalkulasi ditemukan
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
