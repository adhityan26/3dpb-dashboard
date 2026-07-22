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
            className="glass-input rounded-[10px] px-3 h-10 text-sm w-full mt-1">
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

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] g-t3 flex items-center gap-1">Bagian cetak (plate)
        <InfoTip text="Satu produk bisa terdiri dari beberapa bagian cetak. Tiap plate punya berat & durasi sendiri; totalnya dijumlahkan jadi biaya produksi." /></div>

      {plates.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <GlassInput value={p.nama} placeholder="Nama part (opsional)" className="flex-1"
              onChange={(e) => setRow(i, { nama: e.target.value })} />
            {multi && (
              <button type="button" aria-label="Hapus plate" className="g-t4 text-sm px-1"
                onClick={() => onPlatesChange(plates.filter((_, j) => j !== i))}>✕</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select value={p.tipe} onChange={(e) => setRow(i, { tipe: e.target.value as "FDM" | "SLA" })}
              className="glass-input rounded-[10px] px-2 h-10 text-sm w-24">
              <option value="FDM">FDM</option>
              <option value="SLA">SLA</option>
            </select>
            <GlassInput type="number" inputMode="decimal" placeholder="gram" value={p.gramasi} className="flex-1"
              onChange={(e) => setRow(i, { gramasi: e.target.value })} />
            <GlassInput type="number" inputMode="decimal" placeholder="durasi (jam)" value={p.durasiJam} className="flex-1"
              onChange={(e) => setRow(i, { durasiJam: e.target.value })} />
          </div>
        </div>
      ))}

      <button type="button" onClick={() => onPlatesChange([...plates, newPlateRow()])}
        className="text-[12px] g-t4 underline text-left">＋ tambah plate</button>

      {multi && (
        <div className="text-[11px] g-t4 flex items-center gap-1">
          TOTAL: {totalGram} g · {totalDurasi} jam
          <InfoTip text="Jumlah berat & durasi seluruh plate. Biaya produksi dihitung dari total ini." />
        </div>
      )}

      <label className="text-[12px] g-t3 flex flex-col">
        <span className="flex items-center gap-1">Batch (pcs sekali cetak)
          <InfoTip text="Jumlah unit identik dari sekali gabungan cetak. Biaya produksi dibagi angka ini." /></span>
        <GlassInput type="number" inputMode="numeric" value={batch} className="w-24 mt-1"
          onChange={(e) => onBatchChange(e.target.value)} />
      </label>

      {multi && batchN > 1 && (
        <div className="text-[11px] g-t4">per pcs = total produksi ÷ {batchN}</div>
      )}
    </div>
  );
}
