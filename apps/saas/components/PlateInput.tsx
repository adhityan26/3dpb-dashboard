"use client";
import Link from "next/link";
import { GlassInput } from "@3pb/ui";
import { InfoTip } from "./InfoTip";
import { newId } from "@/lib/id";

export interface PlateRow {
  id: string;
  nama: string;
  tipe: "FDM" | "SLA";
  gramasi: string;
  durasiJam: string;
}

export function newPlateRow(): PlateRow {
  return { id: newId(), nama: "", tipe: "FDM", gramasi: "", durasiJam: "" };
}

const tnum = { fontVariantNumeric: "tabular-nums" as const };

export function PlateInput({
  locked, plates, batch, onPlatesChange, onBatchChange,
}: {
  locked: boolean;
  plates: PlateRow[];
  batch: string;
  onPlatesChange: (p: PlateRow[]) => void;
  onBatchChange: (b: string) => void;
}) {
  const setRow = (i: number, patch: Partial<PlateRow>) =>
    onPlatesChange(plates.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  if (locked) {
    const p = plates[0];
    return (
      <div className="flex flex-col gap-3">
        <label className="text-[12px] g-t3 flex flex-col">
          <span className="flex items-center gap-1">Berat (gram)
            <InfoTip text="Berat total produk yang dicetak. Dikali harga material per gram untuk jadi Biaya modal." /></span>
          <GlassInput type="number" inputMode="decimal" value={p.gramasi}
            onChange={(e) => setRow(0, { gramasi: e.target.value })} className="w-full mt-1" />
        </label>
        <label className="text-[12px] g-t3 flex flex-col">
          <span className="flex items-center gap-1">Durasi print (jam)
            <InfoTip text="Lama cetak menurut slicer. Dikali Biaya mesin/jam (listrik + depresiasi + maintenance)." /></span>
          <GlassInput type="number" inputMode="decimal" value={p.durasiJam}
            onChange={(e) => setRow(0, { durasiJam: e.target.value })} className="w-full mt-1" />
        </label>
        <label className="text-[12px] g-t3 flex flex-col">
          <span className="flex items-center gap-1">Jenis filament
            <InfoTip text="Menentukan tarif material yang dipakai: FDM pakai harga filament, SLA pakai harga resin." /></span>
          <select value={p.tipe} onChange={(e) => setRow(0, { tipe: e.target.value as "FDM" | "SLA" })}
            className="glass-input rounded-[5px] px-3 h-10 text-sm w-full mt-1">
            <option value="FDM">FDM (PLA/PETG)</option>
            <option value="SLA">SLA (Resin)</option>
          </select>
        </label>
        <div className="border-t border-[color:var(--g-row-border)] pt-3 mt-1">
          <div className="text-[12px] g-t3 font-medium">🔒 Multi-plate &amp; batch</div>
          <p className="text-[11px] g-t4 mt-1">Produk multi-bagian (tiap part berat &amp; durasi sendiri) dan banyak pcs sekali cetak. <Link href="/beli" className="underline">Buka dengan Pro →</Link></p>
        </div>
      </div>
    );
  }

  const totalGram = plates.reduce((s, p) => s + (Number(p.gramasi) || 0), 0);
  const totalDurasi = plates.reduce((s, p) => s + (Number(p.durasiJam) || 0), 0);
  const batchN = Number(batch) || 1;
  const multi = plates.length > 1;
  const p0 = plates[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] g-t3 flex items-center gap-1">Bagian cetak (plate)
        <InfoTip text="Satu produk bisa terdiri dari beberapa bagian cetak. Tiap plate punya berat & durasi sendiri; totalnya dijumlahkan jadi biaya produksi." /></div>

      {!multi ? (
        /* ── Single plate (tak diubah) ── */
        <>
          <div className="flex items-center gap-2 text-[10px] g-t4 uppercase tracking-wide">
            <span className="w-[4.75rem] shrink-0">Metode cetak</span>
            <span className="flex-1 min-w-0">Berat filament</span>
            <span className="flex-1 min-w-0">Durasi cetak</span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-[5px] border border-[color:var(--g-row-border)] p-2.5">
            {p0.nama && (
              <GlassInput value={p0.nama} placeholder="Nama part (opsional)" className="flex-1 min-w-0"
                onChange={(e) => setRow(0, { nama: e.target.value })} />
            )}
            <div className="flex items-center gap-2">
              <select value={p0.tipe} onChange={(e) => setRow(0, { tipe: e.target.value as "FDM" | "SLA" })}
                className="glass-input rounded-[5px] px-2 h-10 text-sm w-[4.75rem] shrink-0">
                <option value="FDM">FDM</option>
                <option value="SLA">SLA</option>
              </select>
              <div className="relative flex-1 min-w-0">
                <GlassInput type="number" inputMode="decimal" placeholder="berat" value={p0.gramasi} className="w-full min-w-0 pr-8"
                  onChange={(e) => setRow(0, { gramasi: e.target.value })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">g</span>
              </div>
              <div className="relative flex-1 min-w-0">
                <GlassInput type="number" inputMode="decimal" placeholder="durasi" value={p0.durasiJam} className="w-full min-w-0 pr-9"
                  onChange={(e) => setRow(0, { durasiJam: e.target.value })} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] g-t4 pointer-events-none">jam</span>
              </div>
            </div>
            {!p0.nama && <div className="text-[10px] g-t5">Tipe · berat (g) · durasi (jam)</div>}
          </div>
        </>
      ) : (
        /* ── Multi-plate: tabel bernomor (desktop 1 baris; mobile nama di atas, spek di bawah) ── */
        <div className="rounded-[5px] border border-[color:var(--g-row-border)]">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 pt-2.5 pb-1 text-[9px] g-t4 uppercase tracking-wide">
            <span className="w-4 shrink-0 text-center">#</span>
            <span className="flex-1 min-w-0">Nama part (utk slicer)</span>
            <span className="w-16 shrink-0">Metode</span>
            <span className="w-[4.5rem] shrink-0 text-right">Berat</span>
            <span className="w-[4.75rem] shrink-0 text-right">Durasi</span>
            <span className="w-4 shrink-0" />
          </div>
          {plates.map((p, i) => (
            <div key={p.id} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 px-2.5 py-2 border-t border-[color:var(--g-row-border)]">
              <span className="order-1 w-4 shrink-0 text-center text-[11px] g-t4" style={tnum}>{i + 1}</span>
              <GlassInput value={p.nama} placeholder="beri nama part (utk slicer)"
                className="order-2 min-w-0 basis-[calc(100%-3.25rem)] sm:basis-auto sm:flex-1"
                onChange={(e) => setRow(i, { nama: e.target.value })} />
              <button type="button" aria-label="Hapus plate" className="order-3 sm:order-6 w-4 shrink-0 g-t4 text-base leading-none"
                onClick={() => onPlatesChange(plates.filter((_, j) => j !== i))}>✕</button>
              <select value={p.tipe} onChange={(e) => setRow(i, { tipe: e.target.value as "FDM" | "SLA" })}
                className="order-4 sm:order-3 glass-input rounded-[5px] px-1.5 h-10 text-[13px] w-16 shrink-0">
                <option value="FDM">FDM</option>
                <option value="SLA">SLA</option>
              </select>
              <div className="order-5 sm:order-4 relative w-[4.5rem] shrink-0">
                <GlassInput type="number" inputMode="decimal" placeholder="berat" value={p.gramasi} className="w-full px-2 pr-5"
                  onChange={(e) => setRow(i, { gramasi: e.target.value })} />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">g</span>
              </div>
              <div className="order-6 sm:order-5 relative w-[4.75rem] shrink-0">
                <GlassInput type="number" inputMode="decimal" placeholder="durasi" value={p.durasiJam} className="w-full px-2 pr-7"
                  onChange={(e) => setRow(i, { durasiJam: e.target.value })} />
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] g-t4 pointer-events-none">jam</span>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-2.5 py-2 border-t border-[color:var(--g-row-border)]">
            <span className="hidden sm:block w-4 shrink-0" />
            <span className="flex-1 min-w-0 text-[11px] g-t3 font-medium flex items-center gap-1">TOTAL 1× cetak
              <InfoTip text="Jumlah berat & durasi seluruh plate untuk sekali proses cetak. Biaya produksi dihitung dari total ini, lalu dibagi Hasil sekali cetak." /></span>
            <span className="hidden sm:block w-16 shrink-0" />
            <span className="w-[4.5rem] shrink-0 text-right text-[12px] g-t1 font-semibold" style={tnum}>{totalGram} g</span>
            <span className="w-[4.75rem] shrink-0 text-right text-[12px] g-t1 font-semibold" style={tnum}>{totalDurasi} jam</span>
            <span className="w-4 shrink-0" />
          </div>
        </div>
      )}

      <button type="button" onClick={() => onPlatesChange([...plates, newPlateRow()])}
        className="text-[12px] underline text-left self-start" style={{ color: "var(--g-accent)" }}>＋ tambah plate</button>

      <label className="text-[12px] g-t3 flex flex-col">
        <span className="flex items-center gap-1">Hasil sekali cetak</span>
        <span className="text-[11px] g-t4 mb-1">Berapa produk yang dihasilkan dari sekali proses cetak di atas?</span>
        <GlassInput type="number" inputMode="numeric" min={1} value={batch} className="w-28"
          onChange={(e) => onBatchChange(e.target.value)} />
      </label>

      {multi && batchN > 1 && (
        <div className="text-[11px] g-t4">per pcs = total produksi ÷ {batchN}</div>
      )}
    </div>
  );
}
