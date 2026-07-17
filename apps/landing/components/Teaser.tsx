"use client";
import { useState, useMemo } from "react";
import { GlassCard, GlassInput } from "@3pb/ui";
import { teaserView } from "@/lib/teaser";

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export function Teaser({ onWaitlist }: { onWaitlist: (i: "beli" | "subscribe") => void }) {
  const [gramasi, setGramasi] = useState("100");
  const [durasi, setDurasi] = useState("2");
  const [tipe, setTipe] = useState<"FDM" | "SLA">("FDM");
  const view = useMemo(() => {
    const g = Number(gramasi), d = Number(durasi);
    if (!Number.isFinite(g) || !Number.isFinite(d) || g <= 0 || d <= 0) return null;
    try { return teaserView({ gramasi: g, durasiJam: d, tipe }); } catch { return null; }
  }, [gramasi, durasi, tipe]);

  return (
    <GlassCard className="p-5 grid gap-5 md:grid-cols-2">
      {/* INPUT */}
      <div className="space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide g-accent">Berat (gram)</label>
          <GlassInput type="number" min={0} value={gramasi} onChange={e => setGramasi(e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide g-accent">Durasi print (jam)</label>
          <GlassInput type="number" min={0} step={0.1} value={durasi} onChange={e => setDurasi(e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide g-accent">Jenis material</label>
          <div className="flex gap-2 mt-1">
            {(["FDM", "SLA"] as const).map(t => (
              <button key={t} onClick={() => setTipe(t)}
                className="flex-1 h-10 rounded-[10px] text-sm font-semibold"
                style={tipe === t ? { background: "rgba(99,102,241,0.25)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.5)" } : { background: "var(--g-inner)", border: "1px solid var(--g-inner-border)", color: "var(--g-t3)" }}>
                {t}
              </button>
            ))}
          </div>
          <p className="text-[10px] g-t5 mt-1">Printer & material custom ada di app (segera).</p>
        </div>
      </div>

      {/* HASIL */}
      <div className="space-y-2">
        {!view ? <p className="g-t4 text-sm">Isi berat & durasi.</p> : (
          <>
            <Row label="Biaya modal" value={rp(view.biayaModal)} sub="material + listrik + depresiasi + buffer gagal" />
            <Row label="Harga jual minimum" value={rp(view.hargaJualMinimum)} sub="di bawah ini rugi" />
            <div className="rounded-[10px] p-3" style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)" }}>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(165,180,252,0.7)" }}>Rekomendasi harga jual</div>
              <div className="text-2xl font-bold" style={{ color: "#a5b4fc" }}>{rp(view.rekomendasi)}</div>
              <div className="text-[11px] g-t4">margin standar (B)</div>
            </div>
            {/* Preview terkunci */}
            <div className="relative rounded-[10px] p-3 overflow-hidden" style={{ border: "1px solid var(--g-inner-border)" }}>
              <div style={{ filter: "blur(5px)", opacity: 0.5 }} className="space-y-1 select-none pointer-events-none">
                <div className="text-xs g-t2">Margin A · B · C — Offline {view.offlineABC.map(rp).join(" · ")}</div>
                <div className="text-xs g-t2">Shopee {view.shopeeABC.map(rp).join(" · ")}</div>
                <div className="text-xs g-t2">Status vs harga pasar · untung/rugi</div>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
                <p className="text-[11px] g-t2 mb-2">Banding margin A/B/C, untung/rugi vs harga pasar & per channel — <b>segera hadir di app</b></p>
                <button onClick={() => onWaitlist("beli")} className="h-8 px-4 rounded-[8px] text-xs font-semibold text-white" style={{ background: "linear-gradient(135deg,#5055e8,#7c84f8)" }}>Beri tahu saya saat rilis</button>
              </div>
            </div>
            <button onClick={() => onWaitlist("beli")} className="text-[11px] g-t4 underline">Simpan, multi-plate, labor & settings custom → di app, segera</button>
          </>
        )}
      </div>
    </GlassCard>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <div><div className="text-sm g-t2">{label}</div>{sub && <div className="text-[10px] g-t5">{sub}</div>}</div>
      <div className="text-lg font-semibold g-t1">{value}</div>
    </div>
  );
}
