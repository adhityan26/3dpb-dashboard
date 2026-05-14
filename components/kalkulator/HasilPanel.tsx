"use client"

import type { HasilKalkulasi, KalkulasiStatus } from "@/lib/kalkulator/types"

interface Props {
  hasil: HasilKalkulasi | null
  hargaShopeeAktual?: number
  isLoading?: boolean
}

const STATUS_CONFIG: Record<KalkulasiStatus, { label: string; color: string; bg: string; border: string }> = {
  AMAN:       { label: "🟢 Aman",          color: "#34d399", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.2)"  },
  BAWAH_REKM: { label: "🟡 Bawah Rekm.",   color: "#fbbf24", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.2)"  },
  RUGI:       { label: "🔴 Rugi!",          color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.2)"   },
  TIDAK_DISET:{ label: "⬜ —",             color: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" },
}

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2"
         style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
      <span className="text-sm" style={{ color: color ?? "rgba(255,255,255,0.85)", fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  )
}

export function HasilPanel({ hasil, hargaShopeeAktual, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 rounded-[8px]" style={{ background: "rgba(255,255,255,0.04)" }} />
        ))}
      </div>
    )
  }

  if (!hasil) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center"
           style={{ color: "rgba(255,255,255,0.2)" }}>
        <div className="text-3xl mb-3">🧮</div>
        <div className="text-sm">Isi form di kiri untuk melihat hasil kalkulasi</div>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[hasil.status]

  return (
    <div className="space-y-4">

      {/* Hero: Floor Price + Rekm Shopee A */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[10px] p-4 text-center"
             style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
               style={{ color: "rgba(251,191,36,0.7)" }}>Floor Price</div>
          <div className="text-xl font-bold" style={{ color: "#fbbf24" }}>
            {fmt(hasil.floorPrice)}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>batas diskon</div>
        </div>
        <div className="rounded-[10px] p-4 text-center"
             style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
               style={{ color: "rgba(165,180,252,0.7)" }}>Rekm. Shopee A</div>
          <div className="text-xl font-bold" style={{ color: "#a5b4fc" }}>
            {fmt(hasil.shopeeA)}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>target ideal</div>
        </div>
      </div>

      {/* HPP Breakdown */}
      <div className="rounded-[10px] p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3"
             style={{ color: "rgba(165,180,252,0.6)" }}>HPP Breakdown</div>
        <Row label="HPP Produksi (cetak)" value={fmt(hasil.hppProduksi)} />
        <Row label="HPP Komponen (aksesori)" value={fmt(hasil.hppKomponen)} />
        <Row label="HPP Total" value={fmt(hasil.hppTotal)} bold color="#e5e7eb" />
      </div>

      {/* Harga Lengkap */}
      <div className="rounded-[10px] p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3"
             style={{ color: "rgba(165,180,252,0.6)" }}>Harga Lengkap</div>
        <Row label="Floor Price" value={fmt(hasil.floorPrice)} color="#fbbf24" />
        <Row label="Offline A · B · C"
             value={`${fmt(hasil.offlineA)} · ${fmt(hasil.offlineB)} · ${fmt(hasil.offlineC)}`}
             color="#34d399" />
        <Row label="Shopee A · B · C"
             value={`${fmt(hasil.shopeeA)} · ${fmt(hasil.shopeeB)} · ${fmt(hasil.shopeeC)}`}
             color="#a5b4fc" />
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4, paddingTop: 4 }}>
          <Row label="Margin Offline A" value={fmtPct(hasil.marginOfflineA)} color="#34d399" />
          <Row label="Margin Shopee A (net)" value={fmtPct(hasil.marginShopeeA)} color="#a5b4fc" />
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 4, paddingTop: 4 }}>
          <Row label="Reseller standard" value={fmt(hasil.resellerStd)} />
          <Row label="Reseller bulk" value={fmt(hasil.resellerBulk)} />
        </div>
      </div>

      {/* Status vs Shopee Aktual */}
      {hargaShopeeAktual !== undefined && hargaShopeeAktual > 0 && (
        <div className="rounded-[10px] p-4" style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.border}` }}>
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider"
                 style={{ color: "rgba(255,255,255,0.5)" }}>vs Harga Shopee Saat Ini</div>
            <span className="text-sm font-bold" style={{ color: statusCfg.color }}>{statusCfg.label}</span>
          </div>
          <Row label="Harga Shopee saat ini" value={fmt(hargaShopeeAktual)} bold />
          <Row label="vs Floor Price"
               value={`${hargaShopeeAktual >= hasil.floorPrice ? "+" : ""}${fmt(hargaShopeeAktual - hasil.floorPrice)}`}
               color={hargaShopeeAktual >= hasil.floorPrice ? "#34d399" : "#f87171"} />
          <Row label="vs Rekm. Shopee A"
               value={`${hargaShopeeAktual >= hasil.shopeeA ? "+" : ""}${fmt(hargaShopeeAktual - hasil.shopeeA)}`}
               color={hargaShopeeAktual >= hasil.shopeeA ? "#34d399" : "#f87171"} />
        </div>
      )}

    </div>
  )
}
