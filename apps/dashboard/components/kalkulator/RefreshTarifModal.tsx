"use client"

import type { RefreshTarifPreview, RefreshTarifSnapshot } from "@/lib/kalkulator/types"

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

const ROWS: { key: keyof RefreshTarifSnapshot; label: string }[] = [
  { key: "hppTotal", label: "HPP Total" },
  { key: "floorPrice", label: "Floor Price" },
  { key: "offlineA", label: "Offline Kompetitif" },
  { key: "offlineB", label: "Offline Standard" },
  { key: "offlineC", label: "Offline Premium" },
  { key: "shopeeA", label: "Shopee Kompetitif" },
  { key: "shopeeB", label: "Shopee Standard" },
  { key: "shopeeC", label: "Shopee Premium" },
]

interface Props {
  nama: string
  preview: RefreshTarifPreview
  isApplying: boolean
  onApply: () => void
  onClose: () => void
}

export function RefreshTarifModal({ nama, preview, isApplying, onApply, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(0,0,0,0.6)" }}
         onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-[5px] p-5"
           style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold g-t1">🔄 Refresh Tarif</span>
          <button onClick={onClose} className="g-t4 text-lg leading-none" aria-label="Tutup">✕</button>
        </div>
        <p className="text-[11px] g-t4 mb-3">
          Tarif berubah sejak &ldquo;<strong className="g-t2">{nama}</strong>&rdquo; disimpan. Ini hasil hitung ulang pakai tarif saat ini:
        </p>

        <div className="rounded-[5px] overflow-hidden" style={{ border: "1px solid var(--g-row-border)" }}>
          <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider g-t4"
               style={{ background: "var(--g-inner)" }}>
            <span></span>
            <span className="text-right">Lama</span>
            <span className="text-right">Baru</span>
          </div>
          {ROWS.map(r => {
            const before = preview.before[r.key]
            const after = preview.after[r.key]
            const changed = before !== after
            return (
              <div key={r.key} className="grid grid-cols-3 gap-2 px-3 py-1.5 text-[11px]"
                   style={{ borderTop: "1px solid var(--g-row-border)" }}>
                <span className="g-t3">{r.label}</span>
                <span className="text-right font-mono g-t4">{fmt(before)}</span>
                <span className="text-right font-mono" style={{ color: changed ? "#34d399" : "var(--g-t4)", fontWeight: changed ? 700 : 400 }}>
                  {fmt(after)}
                </span>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onApply} disabled={isApplying}
            className="flex-1 h-10 rounded-[5px] text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #5055e8, #818cf8)", color: "#fff" }}>
            {isApplying ? "Menyimpan..." : "Terapkan tarif baru"}
          </button>
          <button onClick={onClose} disabled={isApplying}
            className="h-10 px-4 rounded-[5px] text-[13px] g-btn-ghost">
            Batal
          </button>
        </div>
      </div>
    </div>
  )
}
