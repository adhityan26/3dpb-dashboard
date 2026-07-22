"use client";
import Link from "next/link";
import { GlassInput } from "@3pb/ui";
import type { LocalSettings } from "@/lib/kalkulator/local-settings";
import type { KomponenRow, LaborRow } from "@/lib/kalkulator/compose";
import { InfoTip } from "./InfoTip";
import { newId } from "@/lib/id";

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
        <p className="text-[11px] g-t4 mt-1">Hitung juga komponen tambahan, biaya labor, dan packing di harga jualmu. <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
      </div>
    );
  }
  const subKomp = komponen.reduce((s, r) => s + (r.harga > 0 ? r.harga * Math.max(1, r.qty) : 0), 0) + (packing?.harga ?? 0);
  const subLab = labor.reduce((s, r) => s + ((r.jam ?? 0) * (r.ratePerJam ?? 0) + (r.flat ?? 0)), 0);

  return (
    <div className="border-t border-[color:var(--g-row-border)] pt-3 mt-1 flex flex-col gap-3">
      <div>
        <div className="text-[11px] g-t3 mb-1 flex items-center gap-1">Packing (pilih satu) <InfoTip text="Biaya kemasan. Hanya satu yang bisa dipilih. Kelola daftarnya di Setting → Tambahan." /></div>
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
        <div className="text-[11px] g-t3 mb-1 flex items-center gap-1">Komponen tambahan <InfoTip text="Barang di luar cetakan (gantungan, switch, label). Klik preset untuk menambah baris; bisa lebih dari satu." /></div>
        <div className="flex gap-2 flex-wrap mb-2">
          {settings.komponenPresets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onKomponenChange([...komponen, { id: newId(), nama: p.nama, harga: p.harga, qty: 1 }])}
              className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px]">＋ {p.nama} ({rupiah(p.harga)})</button>
          ))}
          <button type="button" onClick={() => onKomponenChange([...komponen, { id: newId(), nama: "", harga: 0, qty: 1 }])} className="text-[12px] g-t4 underline">＋ manual</button>
        </div>
        {komponen.map((r, i) => (
          <div key={r.id} className="flex flex-col gap-1.5 mb-2 rounded-[12px] border border-[color:var(--g-row-border)] p-2.5">
            <div className="flex items-center gap-2">
              <GlassInput value={r.nama} placeholder="Nama komponen" className="flex-1 min-w-0" onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
              <button type="button" aria-label="Hapus komponen" className="g-t4 text-base px-1 shrink-0 leading-none" onClick={() => onKomponenChange(komponen.filter((_, j) => j !== i))}>✕</button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">Rp</span>
                <GlassInput type="number" inputMode="decimal" placeholder="harga" value={String(r.harga)} className="w-full min-w-0 pl-8" onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, harga: Number(e.target.value) } : x)))} />
              </div>
              <div className="relative w-24 shrink-0">
                <GlassInput type="number" inputMode="numeric" placeholder="qty" value={String(r.qty)} className="w-full pr-9" onChange={(e) => onKomponenChange(komponen.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">pcs</span>
              </div>
            </div>
          </div>
        ))}
        {subKomp > 0 && <div className="text-[11px] g-t4">Subtotal komponen + packing: {rupiah(subKomp)}</div>}
      </div>

      <div>
        <div className="text-[11px] g-t3 mb-1 flex items-center gap-1">Labor <InfoTip text="Biaya tenaga kerja: jam × rate + flat. Klik preset bundle untuk mengisi beberapa baris sekaligus." /></div>
        <div className="flex gap-2 flex-wrap mb-2">
          {settings.laborPresets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onLaborChange([...labor, ...p.items.map((it) => ({ id: newId(), nama: it.nama, jam: it.jam, ratePerJam: it.ratePerJam, flat: it.flat }))])}
              className="g-btn-ghost rounded-[10px] px-3 h-8 text-[12px]">＋ {p.nama}</button>
          ))}
          <button type="button" onClick={() => onLaborChange([...labor, { id: newId(), nama: "" }])} className="text-[12px] g-t4 underline">＋ manual</button>
        </div>
        {labor.map((r, i) => (
          <div key={r.id} className="flex flex-col gap-1.5 mb-2 rounded-[12px] border border-[color:var(--g-row-border)] p-2.5">
            <div className="flex items-center gap-2">
              <GlassInput value={r.nama} placeholder="Nama pekerjaan" className="flex-1 min-w-0" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} />
              <button type="button" aria-label="Hapus labor" className="g-t4 text-base px-1 shrink-0 leading-none" onClick={() => onLaborChange(labor.filter((_, j) => j !== i))}>✕</button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <GlassInput type="number" inputMode="decimal" placeholder="jam" value={r.jam ?? ""} className="w-full min-w-0 pr-9" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, jam: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">jam</span>
              </div>
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">Rp</span>
                <GlassInput type="number" inputMode="decimal" placeholder="rate/jam" value={r.ratePerJam ?? ""} className="w-full min-w-0 pl-8" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, ratePerJam: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
              </div>
              <div className="relative flex-1 min-w-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">Rp</span>
                <GlassInput type="number" inputMode="decimal" placeholder="flat" value={r.flat ?? ""} className="w-full min-w-0 pl-8" onChange={(e) => onLaborChange(labor.map((x, j) => (j === i ? { ...x, flat: e.target.value === "" ? undefined : Number(e.target.value) } : x)))} />
              </div>
            </div>
          </div>
        ))}
        {subLab > 0 && <div className="text-[11px] g-t4">Subtotal labor: {rupiah(subLab)}</div>}
      </div>
    </div>
  );
}
