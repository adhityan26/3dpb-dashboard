"use client";
import { GlassInput } from "@3pb/ui";
import type { LocalSettings } from "@/lib/kalkulator/local-settings";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

export function KomponenLaborInput({
  locked, settings, komponen, labor, packing, onKomponenChange, onLaborChange, onPackingChange,
}: {
  locked: boolean; settings: LocalSettings;
  komponen: KomponenRow[]; labor: LaborRow[]; packing: { nama: string; harga: number } | undefined;
  onKomponenChange: (r: KomponenRow[]) => void; onLaborChange: (r: LaborRow[]) => void;
  onPackingChange: (p: { nama: string; harga: number } | undefined) => void;
}) {
  if (locked) {
    return (
      <div className="border-t border-[color:var(--g-row-border)] pt-3 mt-1">
        <div className="text-[12px] g-t3 font-medium">🔒 Komponen, labor &amp; packing</div>
        <p className="text-[11px] g-t4 mt-1">Tambah komponen, biaya labor &amp; packing ke perhitungan.
          <a href="/beli" className="underline ml-1">Buka di Beli →</a></p>
      </div>
    );
  }
  const subKomp = komponen.reduce((s, r) => s + (r.harga > 0 ? r.harga * Math.max(1, r.qty) : 0), 0) + (packing?.harga ?? 0);
  const subLab = labor.reduce((s, r) => s + ((r.jam ?? 0) * (r.ratePerJam ?? 0) + (r.flat ?? 0)), 0);

  return (
    <div className="border-t border-[color:var(--g-row-border)] pt-3 mt-1 flex flex-col gap-3">
      <div>
        <div className="text-[11px] g-t3 mb-1">Packing (pilih satu)</div>
        <div className="flex gap-2 flex-wrap">
          {settings.packingPresets.map((p) => {
            const on = packing?.nama === p.nama && packing?.harga === p.harga;
            return (
              <button key={p.id} type="button" aria-label={`Packing ${p.nama}`}
                onClick={() => onPackingChange(on ? undefined : { nama: p.nama, harga: p.harga })}
                className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px]"
                style={on ? { outline: "2px solid var(--g-accent)" } : undefined}>
                {p.nama} · {rupiah(p.harga)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[11px] g-t3 mb-1">Komponen tambahan</div>
        <div className="flex gap-2 flex-wrap mb-2">
          {settings.komponenPresets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onKomponenChange([...komponen, { id: crypto.randomUUID(), nama: p.nama, harga: p.harga, qty: 1 }])}
              className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px]">＋ {p.nama} ({rupiah(p.harga)})</button>
          ))}
          <button type="button" onClick={() => onKomponenChange([...komponen, { id: crypto.randomUUID(), nama: "", harga: 0, qty: 1 }])} className="text-[12px] g-t4 underline">＋ manual</button>
        </div>
        {komponen.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 mb-1">
            <GlassInput value={r.nama} placeholder="Nama" className="flex-1" onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
            <GlassInput type="number" inputMode="decimal" value={String(r.harga)} className="w-24" onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, harga: Number(e.target.value) } : x)))} />
            <GlassInput type="number" inputMode="numeric" value={String(r.qty)} className="w-16" onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
            <button type="button" aria-label="Hapus komponen" className="g-t4 text-sm px-1" onClick={() => onKomponenChange(komponen.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {subKomp > 0 && <div className="text-[11px] g-t4">Subtotal komponen + packing: {rupiah(subKomp)}</div>}
      </div>

      <div>
        <div className="text-[11px] g-t3 mb-1">Labor</div>
        <div className="flex gap-2 flex-wrap mb-2">
          {settings.laborPresets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onLaborChange([...labor, ...p.items.map((it) => ({ id: crypto.randomUUID(), nama: it.nama, jam: it.jam, ratePerJam: it.ratePerJam, flat: it.flat }))])}
              className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px]">＋ {p.nama}</button>
          ))}
          <button type="button" onClick={() => onLaborChange([...labor, { id: crypto.randomUUID(), nama: "" }])} className="text-[12px] g-t4 underline">＋ manual</button>
        </div>
        {labor.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 mb-1 flex-wrap">
            <GlassInput value={r.nama} placeholder="Nama" className="flex-1" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
            <GlassInput type="number" inputMode="decimal" placeholder="jam" value={r.jam ?? ""} className="w-16" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, jam: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
            <GlassInput type="number" inputMode="decimal" placeholder="rate" value={r.ratePerJam ?? ""} className="w-24" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, ratePerJam: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
            <GlassInput type="number" inputMode="decimal" placeholder="flat" value={r.flat ?? ""} className="w-20" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, flat: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
            <button type="button" aria-label="Hapus labor" className="g-t4 text-sm px-1" onClick={() => onLaborChange(labor.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {subLab > 0 && <div className="text-[11px] g-t4">Subtotal labor: {rupiah(subLab)}</div>}
      </div>
    </div>
  );
}
