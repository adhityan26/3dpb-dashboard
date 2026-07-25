"use client"

function fmt(n: number) { return `Rp ${Math.round(n).toLocaleString("id-ID")}` }

interface Props {
  hppTotal: number
  harga: number
  onOpen: () => void
}

/** Bar ringkasan mobile (<lg) — di ATAS MobileBottomNav (h-[68px], md:hidden), bukan
 *  numpuk di posisi bottom-0 yang sama. Di ≥md, nav global sudah hilang → bar ini
 *  nempel bottom-0 sendiri sampai breakpoint lg tempat kolom kanan desktop muncul. */
export function MobileSummaryBar({ hppTotal, harga, onOpen }: Props) {
  return (
    <div className="lg:hidden fixed bottom-[68px] md:bottom-0 left-0 right-0 z-40 px-4 py-3 flex items-center gap-3"
      style={{ background: "color-mix(in srgb, var(--g-card) 92%, black)", borderTop: "1px solid var(--g-card-border)", backdropFilter: "blur(12px)" }}>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] g-t4">Modal</div>
        <div className="text-[13px] font-semibold g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(hppTotal)}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] g-t4">Harga jual</div>
        <div className="text-[15px] font-bold" style={{ color: "var(--g-accent)", fontVariantNumeric: "tabular-nums" }}>{fmt(harga)}</div>
      </div>
      <button type="button" onClick={onOpen}
        className="shrink-0 h-11 px-4 rounded-[5px] text-[13px] font-medium"
        style={{ background: "var(--g-accent)", color: "#1a1a2e" }}>
        Lihat rincian
      </button>
    </div>
  )
}
