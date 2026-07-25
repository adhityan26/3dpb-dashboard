"use client"

import { useState } from "react"
import { MARGIN_TIER_LABEL, type MarginTier, type ChannelDef } from "@3pb/kalkulator-core"
import type { HasilKalkulasi } from "@/lib/kalkulator/types"
import { cellFor } from "@/lib/kalkulator/rekomendasi-cell"

const TIERS: MarginTier[] = ["A", "B", "C"]
const CHANNELS = [{ id: "offline", label: "Offline / Langsung" }, { id: "shopee", label: "Shopee" }]

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }
function pct(n: number) { return n.toFixed(1).replace(".", ",") + "%" }

interface Props {
  hasil: HasilKalkulasi
  channels?: ChannelDef[]
  tier: MarginTier
  onTierChange: (t: MarginTier) => void
  channel: string
  onChannelChange: (c: string) => void
}

export function RekomendasiHargaCard({ hasil, channels, tier, onTierChange, channel, onChannelChange }: Props) {
  const [copied, setCopied] = useState(false)
  const cell = cellFor(hasil, channel, tier, channels)
  const chanLabel = CHANNELS.find(c => c.id === channel)?.label ?? channel

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(String(Math.round(cell.harga)))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard API tidak tersedia (mis. http non-secure context) — abaikan, bukan fatal
    }
  }

  return (
    <div className="rounded-[5px] p-4 flex flex-col gap-3.5"
         style={{ background: "var(--g-card)", border: "1px solid rgba(129,140,248,0.25)" }}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-[5px] grid place-items-center text-[13px] shrink-0"
              style={{ background: "rgba(99,102,241,0.16)" }}>🎯</span>
        <span className="text-[13px] font-semibold g-t1 tracking-wide">REKOMENDASI HARGA JUAL</span>
      </div>

      {/* Channel */}
      <div className="flex gap-1 p-1 rounded-[5px]" style={{ background: "rgba(87,87,110,0.12)" }}>
        {CHANNELS.map(c => (
          <button key={c.id} type="button" onClick={() => onChannelChange(c.id)}
            className="flex-1 h-9 rounded-[5px] text-xs font-medium transition-colors"
            style={channel === c.id ? { background: "linear-gradient(135deg, #5055e8, #818cf8)", color: "#fff" } : { color: "var(--g-t3)" }}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Strategi */}
      <div>
        <div className="text-[11px] g-t3 mb-2">Strategi harga</div>
        <div className="grid grid-cols-3 gap-2">
          {TIERS.map(t => {
            const c = cellFor(hasil, channel, t, channels)
            const on = t === tier
            return (
              <button key={t} type="button" onClick={() => onTierChange(t)} aria-pressed={on}
                className="relative rounded-[5px] border p-2.5 pb-4 text-center min-w-0 transition-colors"
                style={{
                  borderColor: on ? "var(--g-accent)" : "var(--g-row-border)",
                  background: on ? "rgba(99,102,241,0.1)" : "transparent",
                }}>
                <div className="text-[10px] g-t3">{MARGIN_TIER_LABEL[t]}</div>
                <div className="text-[13px] font-bold g-t1 mt-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.harga)}</div>
                <div className="text-[9px] g-t4 mt-1">Laba</div>
                <div className="text-[11px] font-medium g-success" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.laba)}</div>
                <div className="text-[9px] g-t4">({pct(c.marginPct)})</div>
                {on && (
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: "linear-gradient(135deg, #5055e8, #818cf8)", color: "#fff" }}>
                    Direkomendasikan
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Hero */}
      <div className="rounded-[8px] border p-4 text-center"
           style={{ borderColor: "rgba(129,140,248,0.3)", background: "rgba(99,102,241,0.08)" }}>
        <div className="text-[10px] g-t4 uppercase tracking-wider">{MARGIN_TIER_LABEL[tier]} · {chanLabel}</div>
        <div className="text-[28px] font-bold leading-none mt-1.5" style={{ color: "var(--g-accent)", fontVariantNumeric: "tabular-nums" }}>{fmt(cell.harga)}</div>
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3" style={{ borderTop: "1px solid var(--g-row-border)" }}>
          <div>
            <div className="text-[10px] g-t4">Estimasi laba</div>
            <div className="text-[14px] font-semibold g-success" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(cell.laba)}</div>
          </div>
          <div>
            <div className="text-[10px] g-t4">Margin laba</div>
            <div className="text-[14px] font-semibold g-t1">{pct(cell.marginPct)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-[5px] p-3 flex gap-2 text-[11px] g-t3 leading-relaxed" style={{ background: "rgba(99,102,241,0.07)" }}>
        <span className="shrink-0">💡</span>
        <span>Harga ini sudah memperhitungkan biaya modal dan margin yang wajar untuk channel {chanLabel}.</span>
      </div>
      {channel === "shopee" && (
        <p className="text-[11px] g-t4 leading-relaxed">⚠️ Sudah termasuk perkiraan biaya admin marketplace, tapi belum termasuk voucher, subsidi ongkir, atau iklan.</p>
      )}

      <button type="button" onClick={handleCopy}
        className="h-10 rounded-[5px] text-[13px] font-semibold transition-opacity hover:opacity-90"
        style={{ background: "linear-gradient(135deg, #5055e8, #818cf8)", color: "#fff" }}>
        {copied ? "✓ Tersalin" : "Salin harga jual"}
      </button>
    </div>
  )
}
