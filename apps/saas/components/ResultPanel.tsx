"use client";
import { useState } from "react";
import { GlassCard } from "@3pb/ui";
import { MARGIN_TIER_LABEL, type MarginTier } from "@3pb/kalkulator-core";
import type { FullView } from "@/lib/kalkulator/compute";
import { rupiah, ceil500 } from "@/lib/kalkulator/format";
import { InfoTip } from "./InfoTip";

const TIERS: MarginTier[] = ["A", "B", "C"];
const CHANNELS = [{ id: "offline", label: "Offline / Langsung" }, { id: "shopee", label: "Shopee" }];
const pct = (n: number) => n.toString().replace(".", ",") + "%";

export function ResultPanel({
  view, channel, tier, onChannel, onTier, onCopy, onReset, showRincian = true,
}: {
  view: FullView; channel: string; tier: MarginTier;
  onChannel: (c: string) => void; onTier: (t: MarginTier) => void;
  onCopy: () => void; onReset: () => void; showRincian?: boolean;
}) {
  const [showFormula, setShowFormula] = useState(false);
  const cell = view.strategi[channel]?.[tier] ?? { harga: 0, laba: 0, marginPct: 0 };
  const chanLabel = CHANNELS.find((c) => c.id === channel)?.label ?? channel;
  const r = view.rincian;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Rekomendasi ── */}
      <GlassCard className="p-5 min-w-0 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-[9px] grid place-items-center text-[13px] shrink-0"
            style={{ background: "color-mix(in srgb, var(--g-accent) 16%, transparent)" }}>🎯</span>
          <span className="text-[13px] font-semibold g-t1 tracking-wide">REKOMENDASI HARGA JUAL</span>
        </div>

        {/* Channel */}
        <div className="flex gap-1 p-1 rounded-[12px]" style={{ background: "color-mix(in srgb, var(--g-t5) 8%, transparent)" }}>
          {CHANNELS.map((c) => (
            <button key={c.id} type="button" onClick={() => onChannel(c.id)}
              className="flex-1 h-9 rounded-[9px] text-[12px] font-medium transition-colors"
              style={channel === c.id ? { background: "var(--g-accent)", color: "#fff" } : { color: "var(--g-t3)" }}>{c.label}</button>
          ))}
        </div>

        {/* Strategi */}
        <div>
          <div className="text-[11px] g-t3 mb-2 flex items-center justify-between">
            <span>Strategi harga</span>
            <span className="g-t4 flex items-center gap-1">Apa itu strategi harga? <InfoTip text="Kompetitif = margin tipis untuk menang harga. Standard = seimbang (rekomendasi). Premium = margin tebal untuk produk eksklusif." /></span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TIERS.map((t) => {
              const c = view.strategi[channel]?.[t] ?? { harga: 0, laba: 0, marginPct: 0 };
              const on = t === tier;
              return (
                <button key={t} type="button" onClick={() => onTier(t)} aria-pressed={on}
                  className="relative rounded-[12px] border p-3 pb-4 text-center min-w-0 transition-colors"
                  style={{ borderColor: on ? "var(--g-accent)" : "var(--g-row-border)", background: on ? "color-mix(in srgb, var(--g-accent) 10%, transparent)" : "transparent" }}>
                  <div className="text-[11px] g-t3">{MARGIN_TIER_LABEL[t]}</div>
                  <div className="text-[15px] font-bold g-t1 mt-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(c.harga)}</div>
                  <div className="text-[10px] g-t4 mt-1.5">Laba</div>
                  <div className="text-[12px] font-medium g-success" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(c.laba)}</div>
                  <div className="text-[10px] g-t4">({pct(c.marginPct)})</div>
                  {on && (
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "var(--g-accent)", color: "#fff" }}>Direkomendasikan</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hero */}
        <div className="rounded-[16px] border p-4 text-center mt-1"
          style={{ borderColor: "color-mix(in srgb, var(--g-accent) 30%, transparent)", background: "color-mix(in srgb, var(--g-accent) 8%, transparent)" }}>
          <div className="text-[10px] g-t4 uppercase tracking-wider">{MARGIN_TIER_LABEL[tier]} · {chanLabel}</div>
          <div className="text-[34px] font-bold leading-none mt-1.5" style={{ color: "var(--g-accent)", fontVariantNumeric: "tabular-nums" }}>{rupiah(cell.harga)}</div>
          <div className="grid grid-cols-2 gap-2 mt-4 pt-3" style={{ borderTop: "1px solid var(--g-row-border)" }}>
            <div>
              <div className="text-[10px] g-t4">Estimasi laba</div>
              <div className="text-[15px] font-semibold g-success" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(cell.laba)}</div>
            </div>
            <div>
              <div className="text-[10px] g-t4 flex items-center gap-1 justify-center">Margin laba <InfoTip text="Margin = laba ÷ harga jual." /></div>
              <div className="text-[15px] font-semibold g-t1">{pct(cell.marginPct)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[12px] p-3 flex gap-2 text-[11px] g-t3 leading-relaxed"
          style={{ background: "color-mix(in srgb, var(--g-accent) 7%, transparent)" }}>
          <span className="shrink-0">💡</span>
          <span>Harga ini sudah memperhitungkan biaya modal dan margin yang wajar untuk channel {chanLabel}.</span>
        </div>

        {channel === "shopee" && (
          <p className="text-[11px] g-t4 leading-relaxed">⚠️ Sudah termasuk perkiraan biaya admin marketplace, tapi belum termasuk voucher, subsidi ongkir, atau iklan.</p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onCopy} className="flex-1 h-10 rounded-[10px] text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--g-accent)" }}>Salin harga jual</button>
          <button type="button" onClick={onReset} className="g-btn-ghost h-10 px-4 rounded-[10px] text-[13px]">Reset</button>
          <button type="button" disabled className="g-btn-ghost h-10 px-3 rounded-[10px] text-[13px] opacity-40 cursor-not-allowed flex items-center gap-1" title="Segera hadir">
            Simpan <span className="text-[8px] uppercase tracking-wide px-1 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--g-t5) 15%, transparent)" }}>segera</span>
          </button>
        </div>
      </GlassCard>

      {/* ── Rincian ── */}
      {showRincian && (
        <GlassCard className="p-5 min-w-0">
          <div className="text-[12px] font-semibold g-t2 mb-3 tracking-wide">RINCIAN PERHITUNGAN</div>
          {[
            ["Biaya produksi (per produk)", r.produksi],
            ["Komponen tambahan", r.komponen],
            ["Finishing & tenaga kerja", r.labor],
            ["Packing", r.packing],
          ].filter(([, v]) => (v as number) > 0).map(([label, v]) => (
            <div key={label as string} className="flex justify-between text-[12px] g-t3 py-1.5" style={{ borderBottom: "1px dashed var(--g-row-border)" }}>
              <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(v as number)}</span>
            </div>
          ))}
          <div className="flex justify-between text-[13px] font-bold py-2" style={{ color: "var(--g-accent)", borderBottom: "1px solid var(--g-row-border)" }}>
            <span>= BIAYA MODAL</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(r.biayaModal)}</span>
          </div>
          <div className="flex justify-between items-start text-[12px] g-t3 pt-2.5">
            <span className="flex flex-col">
              <span className="flex items-center gap-1">Harga jual minimum (aman) <InfoTip text="Batas bawah. Sudah menutup modal, overhead, dan margin minimum. Jual di bawah ini = rugi." /></span>
              <span className="text-[10px] g-t4">Sudah menutup modal, overhead, dan margin minimum.</span>
            </span>
            <span className="font-medium g-t2" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(ceil500(view.hargaJualMinimum))}</span>
          </div>
          <div className="flex justify-between items-start text-[12px] g-t3 pt-2.5">
            <span className="flex flex-col">
              <span>Rekomendasi harga ({MARGIN_TIER_LABEL[tier]})</span>
              <span className="text-[10px] g-t4">Margin {pct(cell.marginPct)}</span>
            </span>
            <span className="font-medium g-t2" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(cell.harga)}</span>
          </div>

          <button type="button" onClick={() => setShowFormula((s) => !s)}
            className="mt-3 w-full flex items-center justify-between text-[11px] g-t3 py-2" aria-expanded={showFormula}>
            <span className="flex items-center gap-1.5">💡 Tentang perhitungan harga</span>
            <span className="g-t4" aria-hidden>{showFormula ? "▲" : "▼"}</span>
          </button>
          {showFormula && (
            <div className="text-[11px] g-t3 leading-relaxed pb-2" style={{ borderBottom: "1px dashed var(--g-row-border)" }}>
              Harga jual = biaya modal (material + mesin + komponen + finishing + packing) ditambah margin sesuai strategi. <strong className="g-t2">Margin = laba ÷ harga jual</strong>. Harga aman minimum sudah menutup modal + overhead + margin minimum.
            </div>
          )}

          <div className="mt-3 rounded-[12px] p-3" style={{ background: "color-mix(in srgb, var(--g-warning) 8%, transparent)" }}>
            <div className="text-[11px] g-t3 mb-1.5">Belum termasuk biaya berikut (jika ada):</div>
            <ul className="text-[11px] g-t4 space-y-0.5 list-disc pl-4">
              <li>Biaya admin marketplace</li>
              <li>Subsidi ongkir gratis</li>
              <li>Iklan / promosi</li>
              <li>Biaya operasional lainnya</li>
            </ul>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
