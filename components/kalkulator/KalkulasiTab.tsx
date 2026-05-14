"use client"

import { useState } from "react"
import { KalkulasiForm } from "./KalkulasiForm"
import { KalkulasiHistory } from "./KalkulasiHistory"
import { LinkProdukModal } from "./LinkProdukModal"
import { GlassPageHeader } from "@/components/ui/GlassPageHeader"
import type { KalkulasiData } from "@/lib/kalkulator/types"

export function KalkulasiTab() {
  const [editingKalk, setEditingKalk] = useState<KalkulasiData | null>(null)
  const [linkingKalk, setLinkingKalk] = useState<KalkulasiData | null>(null)
  const [savedKalk, setSavedKalk] = useState<KalkulasiData | null>(null)

  function handleEdit(k: KalkulasiData) {
    setEditingKalk(k)
    setSavedKalk(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function handleSaved(k: KalkulasiData) {
    setSavedKalk(k)
    setEditingKalk(null)
  }

  function handleNew() {
    setEditingKalk(null)
    setSavedKalk(null)
  }

  return (
    <div className="space-y-6">
      <GlassPageHeader
        title="Kalkulator Harga"
        subtitle="Hitung HPP, Floor Price, dan rekomendasi harga jual per produk"
      >
        {editingKalk && (
          <button
            onClick={handleNew}
            className="h-8 px-3 rounded-[8px] text-[11px]"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)" }}
          >
            + Kalkulasi Baru
          </button>
        )}
      </GlassPageHeader>

      {/* Success banner */}
      {savedKalk && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-[10px]"
             style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <span className="text-[13px]">✅</span>
          <span className="text-[11px] flex-1" style={{ color: "#34d399" }}>
            Kalkulasi &ldquo;<strong>{savedKalk.nama}</strong>&rdquo; berhasil disimpan!
          </span>
          <button
            onClick={() => setLinkingKalk(savedKalk)}
            className="text-[10px] px-2 py-1 rounded-[6px]"
            style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
          >
            🔗 Link Produk
          </button>
          <button onClick={() => setSavedKalk(null)} style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* Calculator Form */}
      <KalkulasiForm
        key={editingKalk?.id ?? "new"}
        initial={editingKalk ?? undefined}
        onSaved={handleSaved}
      />

      {/* History */}
      <div className="pt-4" style={{ borderTop: "1px solid rgba(99,102,241,0.1)" }}>
        <KalkulasiHistory
          onEdit={handleEdit}
          onLinkProduk={k => setLinkingKalk(k)}
        />
      </div>

      {/* Link Produk Modal */}
      {linkingKalk && (
        <LinkProdukModal
          kalkulasi={linkingKalk}
          onClose={() => setLinkingKalk(null)}
        />
      )}
    </div>
  )
}
