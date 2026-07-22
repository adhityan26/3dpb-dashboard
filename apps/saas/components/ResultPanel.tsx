"use client";
import { GlassCard } from "@3pb/ui";
import { MARGIN_TIER_LABEL, type MarginTier } from "@3pb/kalkulator-core";
import type { FullView } from "@/lib/kalkulator/compute";
import { rupiah, ceil500 } from "@/lib/kalkulator/format";
import { InfoTip } from "./InfoTip";

const TIERS: MarginTier[] = ["A", "B", "C"];
const CHANNELS = [{ id: "offline", label: "Offline / Langsung" }, { id: "shopee", label: "Shopee" }];

export function ResultPanel({
  view, channel, tier, onChannel, onTier, onCopy, onReset, showRincian = true,
}: {
  view: FullView; channel: string; tier: MarginTier;
  onChannel: (c: string) => void; onTier: (t: MarginTier) => void;
  onCopy: () => void; onReset: () => void; showRincian?: boolean;
}) {
  const cell = view.strategi[channel]?.[tier] ?? { harga: 0, laba: 0, marginPct: 0 };
  const chanLabel = CHANNELS.find((c) => c.id === channel)?.label ?? channel;
  const r = view.rincian;
  const Seg = ({ items, value, onSelect }: { items: { id: string; label: string }[]; value: string; onSelect: (v: string) => void }) => (
    <div className="flex gap-1 p-1 rounded-[12px]" style={{ background: "color-mix(in srgb, var(--g-t5) 8%, transparent)" }}>
      {items.map((it) => (
        <button key={it.id} type="button" onClick={() => onSelect(it.id)}
          className="flex-1 h-9 rounded-[9px] text-[12px] font-medium"
          style={value === it.id ? { background: "var(--g-accent)", color: "#fff" } : { color: "var(--g-t3)" }}>{it.label}</button>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <GlassCard className="p-4 min-w-0 flex flex-col gap-4">
        <div className="text-[13px] font-semibold g-t1 tracking-wide">REKOMENDASI HARGA JUAL</div>
        <Seg items={CHANNELS} value={channel} onSelect={onChannel} />

        <div>
          <div className="text-[11px] g-t3 mb-1.5 flex items-center gap-1">Strategi harga <InfoTip text="Kompetitif = margin tipis untuk menang harga. Standard = seimbang. Premium = margin tebal." /></div>
          <div className="grid grid-cols-3 gap-2">
            {TIERS.map((t) => {
              const c = view.strategi[channel]?.[t] ?? { harga: 0, laba: 0, marginPct: 0 };
              const on = t === tier;
              return (
                <button key={t} type="button" onClick={() => onTier(t)} aria-pressed={on}
                  className="rounded-[12px] border p-2.5 text-center min-w-0"
                  style={{ borderColor: on ? "var(--g-accent)" : "var(--g-row-border)", background: on ? "color-mix(in srgb, var(--g-accent) 12%, transparent)" : "transparent" }}>
                  <div className="text-[11px] g-t3">{MARGIN_TIER_LABEL[t]}</div>
                  <div className="text-sm font-semibold g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(c.harga)}</div>
                  <div className="text-[10px] g-t4 mt-1">Laba</div>
                  <div className="text-[12px] g-success" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(c.laba)}</div>
                  <div className="text-[10px] g-t4">({c.marginPct.toString().replace(".", ",")}%)</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[14px] p-4 text-center" style={{ background: "color-mix(in srgb, var(--g-accent) 10%, transparent)" }}>
          <div className="text-[11px] g-t3">{MARGIN_TIER_LABEL[tier]} · {chanLabel}</div>
          <div className="text-3xl font-bold mt-1" style={{ color: "var(--g-accent)", fontVariantNumeric: "tabular-nums" }}>{rupiah(cell.harga)}</div>
          <div className="flex justify-center gap-6 mt-3">
            <div><div className="text-[10px] g-t4">Estimasi laba</div><div className="text-sm g-success" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(cell.laba)}</div></div>
            <div><div className="text-[10px] g-t4 flex items-center gap-1 justify-center">Margin laba <InfoTip text="Margin = laba ÷ harga jual." /></div><div className="text-sm g-t1">{cell.marginPct.toString().replace(".", ",")}%</div></div>
          </div>
        </div>

        {channel === "shopee" && (
          <p className="text-[11px] g-t3">⚠️ Harga sudah termasuk perkiraan biaya admin marketplace, tapi belum termasuk voucher, subsidi ongkir, atau iklan.</p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onCopy} className="flex-1 h-10 rounded-[10px] text-[13px] font-medium" style={{ background: "var(--g-accent)", color: "#fff" }}>Salin harga jual</button>
          <button type="button" onClick={onReset} className="g-btn-ghost h-10 px-4 rounded-[10px] text-[13px]">Reset</button>
          <button type="button" disabled className="g-btn-ghost h-10 px-4 rounded-[10px] text-[13px] opacity-40 cursor-not-allowed flex items-center gap-1" title="Segera hadir">Simpan <span className="text-[9px] uppercase">segera</span></button>
        </div>
      </GlassCard>

      {showRincian && (
      <GlassCard className="p-4 min-w-0">
        <div className="text-[11px] g-t4 mb-2 uppercase tracking-wide">Rincian biaya</div>
        {[
          ["Produksi (per produk)", r.produksi],
          ["Komponen tambahan", r.komponen],
          ["Finishing & tenaga kerja", r.labor],
          ["Packing", r.packing],
        ].filter(([, v]) => (v as number) > 0).map(([label, v]) => (
          <div key={label as string} className="flex justify-between text-[12px] g-t3 py-[3px]" style={{ borderBottom: "1px dashed var(--g-row-border)" }}>
            <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(v as number)}</span>
          </div>
        ))}
        <div className="flex justify-between text-[13px] g-t1 font-semibold py-1.5">
          <span>Total modal</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(r.biayaModal)}</span>
        </div>
        <div className="flex justify-between text-[12px] g-t3 py-[3px]">
          <span className="flex items-center gap-1">Harga aman minimum <InfoTip text="Sudah menutup modal, overhead, dan margin minimum. Jual di bawah ini = rugi." /></span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(ceil500(view.hargaJualMinimum))}</span>
        </div>
      </GlassCard>
      )}
    </div>
  );
}
