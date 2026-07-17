"use client"

import type { HasilKalkulasi, KalkulasiStatus } from "@/lib/kalkulator/types"
import { MARGIN_TIER_LABEL, type ChannelDef } from "@3pb/kalkulator-core"
import type { PrinterMarginRow } from "@/lib/kalkulator/form-v2"

interface Props {
  hasil: HasilKalkulasi | null
  hargaShopeeAktual?: number
  hargaOfflineAktual?: number
  isLoading?: boolean
  marginTier?: "A" | "B" | "C"
  hargaChannel?: { channelId: string; A: number; B: number; C: number }[]
  channels?: ChannelDef[]
  printerComparison?: PrinterMarginRow[]
}

const STATUS_CONFIG: Record<KalkulasiStatus, { label: string; color: string; bg: string; border: string }> = {
  AMAN:       { label: "🟢 Aman",          color: "#34d399", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.2)"  },
  BAWAH_REKM: { label: "🟡 Bawah Rekm.",   color: "#fbbf24", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.2)"  },
  RUGI:       { label: "🔴 Rugi!",          color: "#f87171", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.2)"   },
  TIDAK_DISET:{ label: "⬜ —",             color: "var(--g-t4)", bg: "var(--g-inner)", border: "var(--g-inner-border)" },
}

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function fmtPct(n: number) { return `${n.toFixed(1)}%` }

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2"
         style={{ borderBottom: "1px solid var(--g-row-border)" }}>
      <span className="text-xs" style={{ color: "var(--g-t2)" }}>{label}</span>
      <span className="text-sm" style={{ color: color ?? "var(--g-t1)", fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  )
}

export function HasilPanel({
  hasil, hargaShopeeAktual, hargaOfflineAktual, isLoading, marginTier = "A",
  hargaChannel, channels, printerComparison,
}: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 rounded-[8px]" style={{ background: "var(--g-inner)" }} />
        ))}
      </div>
    )
  }

  if (!hasil) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center g-t5">
        <div className="text-3xl mb-3">🧮</div>
        <div className="text-sm">Isi form di kiri untuk melihat hasil kalkulasi</div>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[hasil.status]

  // Margin-aware prices
  const shopeeRekm  = marginTier === "B" ? hasil.shopeeB  : marginTier === "C" ? hasil.shopeeC  : hasil.shopeeA
  const offlineRekm = marginTier === "B" ? hasil.offlineB : marginTier === "C" ? hasil.offlineC : hasil.offlineA

  // Compute margin for the selected tier (formula mirrors formula.ts logic)
  const hppTotal = hasil.hppTotal
  const marginOfflineTier = marginTier === "A" ? hasil.marginOfflineA : (() => {
    const price = marginTier === "B" ? hasil.offlineB : hasil.offlineC
    return price > 0 ? Math.round(((price - hppTotal) / price) * 1000) / 10 : 0
  })()
  const marginShopeeTier = marginTier === "A" ? hasil.marginShopeeA : (() => {
    const price = marginTier === "B" ? hasil.shopeeB : hasil.shopeeC
    const net = price * 0.8
    return net > 0 ? Math.round(((net - hppTotal) / net) * 1000) / 10 : 0
  })()

  return (
    <div className="space-y-4">

      {/* Hero: Floor Price + Rekm Shopee (margin-aware) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[10px] p-4 text-center"
             style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
               style={{ color: "rgba(251,191,36,0.7)" }}>Floor Price</div>
          <div className="text-xl font-bold" style={{ color: "#fbbf24" }}>
            {fmt(hasil.floorPrice)}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "var(--g-t4)" }}>batas diskon</div>
        </div>
        <div className="rounded-[10px] p-4 text-center"
             style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
               style={{ color: "rgba(165,180,252,0.7)" }}>Rekm. Shopee {MARGIN_TIER_LABEL[marginTier]}</div>
          <div className="text-xl font-bold" style={{ color: "#a5b4fc" }}>
            {fmt(shopeeRekm)}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "var(--g-t4)" }}>target ideal</div>
        </div>
      </div>

      {/* HPP Breakdown */}
      <div className="rounded-[10px] p-4" style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">HPP Breakdown</div>
        <Row label="HPP Produksi (cetak)" value={fmt(hasil.hppProduksi)} />
        <Row label="HPP Komponen (aksesori)" value={fmt(hasil.hppKomponen)} />
        {hasil.hppFinishing > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">HPP Finishing (labor + consumables)</span>
            <span className="text-sm font-bold" style={{ color: "#a5b4fc" }}>
              {fmt(hasil.hppFinishing)}
            </span>
          </div>
        )}
        <Row label="HPP Total" value={fmt(hasil.hppTotal)} bold color="#e5e7eb" />
      </div>

      {/* Harga Lengkap */}
      <div className="rounded-[10px] p-4" style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}>
        <div className="text-xs font-semibold uppercase tracking-wider mb-3 g-accent">Harga Lengkap</div>
        <Row label="Floor Price" value={fmt(hasil.floorPrice)} color="#fbbf24" />
        {hargaChannel && channels ? (
          <>
            {hargaChannel.map(hc => {
              const ch = channels.find(c => c.id === hc.channelId)
              return (
                <Row key={hc.channelId}
                     label={`${ch?.nama ?? hc.channelId} Kompetitif · Standard · Premium`}
                     value={`${fmt(hc.A)} · ${fmt(hc.B)} · ${fmt(hc.C)}`}
                     color={hc.channelId === "shopee" ? "#a5b4fc" : "#34d399"} />
              )
            })}
            <div style={{ borderTop: "1px solid var(--g-card-border)", marginTop: 4, paddingTop: 4 }}>
              {hargaChannel.map(hc => {
                const ch = channels.find(c => c.id === hc.channelId)
                const price = marginTier === "B" ? hc.B : marginTier === "C" ? hc.C : hc.A
                const net = price / (ch?.feeMultiplier ?? 1)
                const margin = net > 0 ? ((net - hasil.hppTotal) / net) * 100 : 0
                return (
                  <Row key={hc.channelId}
                       label={`Margin ${ch?.nama ?? hc.channelId} ${MARGIN_TIER_LABEL[marginTier]}`}
                       value={fmtPct(margin)}
                       color={hc.channelId === "shopee" ? "#a5b4fc" : "#34d399"} />
                )
              })}
            </div>
          </>
        ) : (
          <>
            <Row label="Offline Kompetitif · Standard · Premium"
                 value={`${fmt(hasil.offlineA)} · ${fmt(hasil.offlineB)} · ${fmt(hasil.offlineC)}`}
                 color="#34d399" />
            <Row label="Shopee Kompetitif · Standard · Premium"
                 value={`${fmt(hasil.shopeeA)} · ${fmt(hasil.shopeeB)} · ${fmt(hasil.shopeeC)}`}
                 color="#a5b4fc" />
            <div style={{ borderTop: "1px solid var(--g-card-border)", marginTop: 4, paddingTop: 4 }}>
              <Row label={`Margin Offline ${MARGIN_TIER_LABEL[marginTier]}`} value={fmtPct(marginOfflineTier)} color="#34d399" />
              <Row label={`Margin Shopee ${MARGIN_TIER_LABEL[marginTier]} (net)`} value={fmtPct(marginShopeeTier)} color="#a5b4fc" />
            </div>
          </>
        )}
        <div style={{ borderTop: "1px solid var(--g-card-border)", marginTop: 4, paddingTop: 4 }}>
          <Row label="Reseller standard" value={fmt(hasil.resellerStd)} />
          <Row label="Reseller bulk" value={fmt(hasil.resellerBulk)} />
        </div>
      </div>

      {/* Perbandingan Printer */}
      {printerComparison && printerComparison.length >= 2 && (
        <div className="rounded-[10px] p-4" style={{ background: "var(--g-card)", border: "1px solid var(--g-card-border)" }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1 g-accent">Perbandingan Printer</div>
          <div className="text-[10px] g-t5 mb-2">Harga jual tetap (mesin acuan) — HPP & margin kalau semua plate dicetak di printer tsb.</div>
          {printerComparison.map(r => (
            <div key={r.id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: "1px solid var(--g-row-border)" }}>
              <span className="text-xs flex-1 g-t2">{r.nama}{r.isPricingReference ? " 🎯" : ""}</span>
              <span className="text-[11px] font-mono g-t3">HPP {fmt(r.hppTotal)}</span>
              <span className="text-[11px] font-mono w-16 text-right" style={{ color: r.marginOffline >= 0 ? "#34d399" : "#f87171" }}>{fmtPct(r.marginOffline)}</span>
              <span className="text-[11px] font-mono w-16 text-right" style={{ color: r.marginShopee >= 0 ? "#a5b4fc" : "#f87171" }}>{fmtPct(r.marginShopee)}</span>
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1 text-[9px] g-t5"><span className="w-16 text-right">offline {MARGIN_TIER_LABEL[marginTier]}</span><span className="w-16 text-right">shopee net</span></div>
        </div>
      )}

      {/* Status vs Shopee Aktual */}
      {hargaShopeeAktual !== undefined && hargaShopeeAktual > 0 && (
        <div className="rounded-[10px] p-4" style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.border}` }}>
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider"
                 style={{ color: "var(--g-t2)" }}>vs Harga Shopee Saat Ini</div>
            <span className="text-sm font-bold" style={{ color: statusCfg.color }}>{statusCfg.label}</span>
          </div>
          <Row label="Harga Shopee saat ini" value={fmt(hargaShopeeAktual)} bold />
          <Row label="vs Floor Price"
               value={`${hargaShopeeAktual >= hasil.floorPrice ? "+" : ""}${fmt(hargaShopeeAktual - hasil.floorPrice)}`}
               color={hargaShopeeAktual >= hasil.floorPrice ? "#34d399" : "#f87171"} />
          {marginTier === "A" && (
            <Row label="vs Rekm. Shopee Kompetitif"
                 value={`${hargaShopeeAktual >= hasil.shopeeA ? "+" : ""}${fmt(hargaShopeeAktual - hasil.shopeeA)}`}
                 color={hargaShopeeAktual >= hasil.shopeeA ? "#34d399" : "#f87171"} />
          )}
          {marginTier !== "A" && (
            <>
              <Row label="vs Rekm. Shopee Kompetitif"
                   value={`${hargaShopeeAktual >= hasil.shopeeA ? "+" : ""}${fmt(hargaShopeeAktual - hasil.shopeeA)}`}
                   color={hargaShopeeAktual >= hasil.shopeeA ? "#34d399" : "#f87171"} />
              <Row label={`vs Rekm. Shopee ${MARGIN_TIER_LABEL[marginTier]}`}
                   value={`${hargaShopeeAktual >= shopeeRekm ? "+" : ""}${fmt(hargaShopeeAktual - shopeeRekm)}`}
                   color={hargaShopeeAktual >= shopeeRekm ? "#34d399" : "#f87171"} />
            </>
          )}
        </div>
      )}

      {/* vs Harga Offline Aktual — status badge NOT shown, acuan aman tetap dari Shopee A */}
      {hargaOfflineAktual !== undefined && hargaOfflineAktual > 0 && (
        <div className="rounded-[10px] p-4"
             style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}>
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs font-semibold uppercase tracking-wider"
                 style={{ color: "var(--g-t2)" }}>vs Harga Offline Saat Ini</div>
          </div>
          <Row label="Harga Offline saat ini" value={fmt(hargaOfflineAktual)} bold />
          <Row label="vs Floor Price"
               value={`${hargaOfflineAktual >= hasil.floorPrice ? "+" : ""}${fmt(hargaOfflineAktual - hasil.floorPrice)}`}
               color={hargaOfflineAktual >= hasil.floorPrice ? "#34d399" : "#f87171"} />
          <Row label="vs Rekm. Offline Kompetitif"
               value={`${hargaOfflineAktual >= hasil.offlineA ? "+" : ""}${fmt(hargaOfflineAktual - hasil.offlineA)}`}
               color={hargaOfflineAktual >= hasil.offlineA ? "#34d399" : "#f87171"} />
          {marginTier !== "A" && (
            <Row label={`vs Rekm. Offline ${MARGIN_TIER_LABEL[marginTier]}`}
                 value={`${hargaOfflineAktual >= offlineRekm ? "+" : ""}${fmt(hargaOfflineAktual - offlineRekm)}`}
                 color={hargaOfflineAktual >= offlineRekm ? "#34d399" : "#f87171"} />
          )}
        </div>
      )}

    </div>
  )
}
