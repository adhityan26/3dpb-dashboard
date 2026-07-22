"use client";
import { rupiah } from "@/lib/kalkulator/format";

export function MobileSummaryBar({ modal, harga, onOpen }: { modal: number; harga: number; onOpen: () => void }) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 py-3 flex items-center gap-3"
      style={{ background: "color-mix(in srgb, var(--g-card) 92%, black)", borderTop: "1px solid var(--g-card-border)", backdropFilter: "blur(12px)" }}>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] g-t4">Modal</div>
        <div className="text-[13px] font-semibold g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(modal)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] g-t4">Harga jual</div>
        <div className="text-[15px] font-bold" style={{ color: "var(--g-accent)", fontVariantNumeric: "tabular-nums" }}>{rupiah(harga)}</div>
      </div>
      <button type="button" onClick={onOpen} className="shrink-0 h-11 px-4 rounded-[10px] text-[13px] font-medium" style={{ background: "var(--g-accent)", color: "#fff" }}>Lihat rincian</button>
    </div>
  );
}
