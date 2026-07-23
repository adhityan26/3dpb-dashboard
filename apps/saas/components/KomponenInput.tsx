"use client";
import Link from "next/link";
import { GlassInput } from "@3pb/ui";
import type { KomponenRow } from "@/lib/kalkulator/compose";
import { rupiah } from "@/lib/kalkulator/format";
import { newId } from "@/lib/id";

export function KomponenInput({
  locked, presets, komponen, onChange,
}: {
  locked: boolean;
  presets: { id: string; nama: string; harga: number }[];
  komponen: KomponenRow[];
  onChange: (r: KomponenRow[]) => void;
}) {
  if (locked) {
    return (
      <div>
        <div className="text-[12px] g-t3 font-medium">🔒 Komponen tambahan</div>
        <p className="text-[11px] g-t4 mt-1">Hitung komponen di luar cetakan (gantungan, switch, label). <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
      </div>
    );
  }
  const idxOfPreset = (p: { nama: string; harga: number }) =>
    komponen.findIndex((r) => r.nama === p.nama && r.harga === p.harga);
  const toggle = (p: { nama: string; harga: number }) => {
    const i = idxOfPreset(p);
    if (i >= 0) onChange(komponen.filter((_, j) => j !== i));
    else onChange([...komponen, { id: newId(), nama: p.nama, harga: p.harga, qty: 1 }]);
  };
  const setRow = (i: number, patch: Partial<KomponenRow>) =>
    onChange(komponen.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] g-t3 mb-1.5">Preset komponen</div>
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => {
            const on = idxOfPreset(p) >= 0;
            return (
              <button key={p.id} type="button" onClick={() => toggle(p)}
                className="g-btn-ghost rounded-[5px] px-3 h-9 text-[12px] flex items-center gap-1.5"
                style={on ? { outline: "2px solid var(--g-accent)", color: "var(--g-accent)" } : undefined}>
                {on && <span aria-hidden>✓</span>}{p.nama} · {rupiah(p.harga)}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => onChange([...komponen, { id: newId(), nama: "", harga: 0, qty: 1 }])}
          className="mt-2 text-[12px] underline" style={{ color: "var(--g-accent)" }}>＋ Tambah komponen custom</button>
      </div>

      {komponen.length > 0 && (
        <div className="flex flex-col gap-2">
          {komponen.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2 rounded-[5px] border border-[color:var(--g-row-border)] p-2.5">
              <GlassInput value={r.nama} placeholder="Nama komponen" className="flex-1 min-w-0"
                onChange={(e) => setRow(i, { nama: e.target.value })} />
              <div className="relative w-24 shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">Rp</span>
                <GlassInput type="number" inputMode="decimal" value={String(r.harga)} className="w-full pl-8"
                  onChange={(e) => setRow(i, { harga: Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" aria-label="Kurangi qty" className="g-btn-ghost rounded-[5px] w-8 h-9 text-sm"
                  onClick={() => setRow(i, { qty: Math.max(1, r.qty - 1) })}>−</button>
                <span className="w-6 text-center text-sm g-t1" style={{ fontVariantNumeric: "tabular-nums" }}>{r.qty}</span>
                <button type="button" aria-label="Tambah qty" className="g-btn-ghost rounded-[5px] w-8 h-9 text-sm"
                  onClick={() => setRow(i, { qty: r.qty + 1 })}>+</button>
              </div>
              <span className="w-20 text-right text-[12px] g-t2 shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah((r.harga > 0 ? r.harga : 0) * Math.max(1, r.qty))}</span>
              <button type="button" aria-label="Hapus komponen" className="g-t4 text-base px-1 shrink-0 leading-none"
                onClick={() => onChange(komponen.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
