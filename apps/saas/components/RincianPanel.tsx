"use client";
import type { FullView } from "@/lib/kalkulator/compute";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");
const Row = ({ label, val, strong }: { label: string; val: number; strong?: boolean }) => (
  <div className={`flex justify-between text-[12px] py-[3px] ${strong ? "g-t1 font-medium" : "g-t3"}`} style={{ borderBottom: "1px dashed var(--g-row-border)" }}>
    <span>{label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(val)}</span>
  </div>
);

export function RincianPanel({ rincian }: { rincian: FullView["rincian"] }) {
  return (
    <div className="mt-3 rounded-[10px] p-3" style={{ background: "color-mix(in srgb, var(--g-t5) 8%, transparent)" }}>
      <div className="text-[11px] g-t4 mb-1">Rincian perhitungan</div>
      <Row label="Produksi (material + mesin + failure)" val={rincian.produksi} />
      {rincian.komponen > 0 && <Row label="Komponen" val={rincian.komponen} />}
      {rincian.packing > 0 && <Row label="Packing" val={rincian.packing} />}
      {rincian.labor > 0 && <Row label="Labor" val={rincian.labor} />}
      <Row label="= Biaya modal" val={rincian.biayaModal} strong />
      <Row label="Harga jual minimum" val={rincian.hargaJualMinimum} />
      <Row label="Rekomendasi (Standard)" val={rincian.rekomendasi} />
    </div>
  );
}
