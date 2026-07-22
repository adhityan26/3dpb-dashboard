"use client";
import Link from "next/link";
import { GlassInput } from "@3pb/ui";
import type { LaborRow } from "@/lib/kalkulator/compose";
import { rupiah } from "@/lib/kalkulator/format";
import { newId } from "@/lib/id";

type Metode = "waktu" | "flat";
const metodeOf = (r: LaborRow): Metode =>
  r.flat != null && r.jam == null && r.ratePerJam == null ? "flat" : "waktu";
const biayaOf = (r: LaborRow) => (r.jam ?? 0) * (r.ratePerJam ?? 0) + (r.flat ?? 0);

export function LaborInput({
  locked, presets, labor, onChange,
}: {
  locked: boolean;
  presets: { id: string; nama: string; items: { nama: string; jam?: number; ratePerJam?: number; flat?: number }[] }[];
  labor: LaborRow[];
  onChange: (r: LaborRow[]) => void;
}) {
  if (locked) {
    return (
      <div>
        <div className="text-[12px] g-t3 font-medium">🔒 Finishing &amp; tenaga kerja</div>
        <p className="text-[11px] g-t4 mt-1">Hitung biaya perakitan, amplas, cat, dsb. <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
      </div>
    );
  }
  const setRow = (i: number, patch: Partial<LaborRow>) =>
    onChange(labor.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setMetode = (i: number, m: Metode) =>
    setRow(i, m === "flat" ? { jam: undefined, ratePerJam: undefined, flat: labor[i].flat ?? 0 } : { flat: undefined, jam: labor[i].jam ?? undefined, ratePerJam: labor[i].ratePerJam ?? undefined });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[11px] g-t3 mb-1.5">Preset pengerjaan mask</div>
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => (
            <button key={p.id} type="button"
              onClick={() => onChange([...labor, ...p.items.map((it) => ({ id: newId(), nama: it.nama, jam: it.jam, ratePerJam: it.ratePerJam, flat: it.flat }))])}
              className="g-btn-ghost rounded-[10px] px-3 h-9 text-[12px]">＋ {p.nama}</button>
          ))}
        </div>
        <button type="button" onClick={() => onChange([...labor, { id: newId(), nama: "", jam: undefined, ratePerJam: undefined }])}
          className="mt-2 text-[12px] underline" style={{ color: "var(--g-accent)" }}>＋ Tambah pekerjaan custom</button>
      </div>

      {labor.length > 0 && (
        <div className="flex flex-col gap-2">
          {labor.map((r, i) => {
            const m = metodeOf(r);
            return (
              <div key={r.id} className="flex flex-col gap-2 rounded-[12px] border border-[color:var(--g-row-border)] p-2.5">
                <div className="flex items-center gap-2">
                  <GlassInput value={r.nama} placeholder="Nama pekerjaan" className="flex-1 min-w-0"
                    onChange={(e) => setRow(i, { nama: e.target.value })} />
                  <span className="text-[12px] g-t2 shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>{rupiah(biayaOf(r))}</span>
                  <button type="button" aria-label="Hapus pekerjaan" className="g-t4 text-base px-1 shrink-0 leading-none"
                    onClick={() => onChange(labor.filter((_, j) => j !== i))}>✕</button>
                </div>
                <div className="flex gap-1">
                  {(["waktu", "flat"] as const).map((opt) => (
                    <button key={opt} type="button" onClick={() => setMetode(i, opt)}
                      className="g-btn-ghost rounded-[8px] px-2.5 h-8 text-[11px]"
                      style={m === opt ? { outline: "2px solid var(--g-accent)", color: "var(--g-accent)" } : undefined}>
                      {opt === "waktu" ? "Berdasarkan waktu" : "Biaya flat"}
                    </button>
                  ))}
                </div>
                {m === "waktu" ? (
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <GlassInput type="number" inputMode="decimal" placeholder="jam" value={r.jam ?? ""} className="w-full min-w-0 pr-9"
                        onChange={(e) => setRow(i, { jam: e.target.value === "" ? undefined : Number(e.target.value) })} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">jam</span>
                    </div>
                    <span className="g-t4 text-sm shrink-0">×</span>
                    <div className="relative flex-1 min-w-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">Rp</span>
                      <GlassInput type="number" inputMode="decimal" placeholder="tarif" value={r.ratePerJam ?? ""} className="w-full min-w-0 pl-8 pr-10"
                        onChange={(e) => setRow(i, { ratePerJam: e.target.value === "" ? undefined : Number(e.target.value) })} />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">/jam</span>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">Rp</span>
                    <GlassInput type="number" inputMode="decimal" placeholder="biaya" value={r.flat ?? ""} className="w-full min-w-0 pl-8"
                      onChange={(e) => setRow(i, { flat: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
